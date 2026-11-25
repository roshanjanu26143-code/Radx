import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Delivery = {
  id: string; school_id: string; announcement_id: string; recipient_phone: string;
  recipient_name: string | null; channel: "whatsapp" | "sms" | "push";
};
type Attachment = { path: string; name: string; type?: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ error: "Server configuration missing" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: claimed, error: claimError } = await db.rpc("claim_school_announcement_deliveries", { batch_size: 50 });
  if (claimError) return new Response(JSON.stringify({ error: claimError.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  const deliveries = (claimed || []) as Delivery[];
  if (!deliveries.length) return new Response(JSON.stringify({ processed: 0, message: "Queue empty" }), { headers: { ...cors, "Content-Type": "application/json" } });

  const announcementIds = [...new Set(deliveries.map(item => item.announcement_id))];
  const { data: announcements } = await db.from("school_announcements")
    .select("id,title,body,attachments").in("id", announcementIds);
  const byId = new Map((announcements || []).map((item: any) => [item.id, item]));
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const smsFrom = Deno.env.get("TWILIO_SMS_FROM");
  const whatsappFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@radx.school";
  const pushReady = !!(vapidPublic && vapidPrivate);
  if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!);

  let sent = 0, failed = 0, skipped = 0;
  for (const item of deliveries) {
    const announcement: any = byId.get(item.announcement_id);
    if (!announcement) {
      await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "failed", p_error: "Announcement record not found" });
      failed++; continue;
    }
    const attachments = (announcement.attachments || []) as Attachment[];
    const links: string[] = [];
    for (const file of attachments.slice(0, 5)) {
      const { data } = await db.storage.from("school-announcements").createSignedUrl(file.path, 60 * 60 * 24);
      if (data?.signedUrl) links.push(file.name + ": " + data.signedUrl);
    }
    const message = [announcement.title, announcement.body, ...links].filter(Boolean).join("\n\n").slice(0, 1500);
    try {
      if (item.channel === "sms" || item.channel === "whatsapp") {
        const from = item.channel === "sms" ? smsFrom : whatsappFrom;
        if (!twilioSid || !twilioToken || !from) {
          await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "skipped", p_error: "Twilio credentials or sender are not configured" });
          skipped++; continue;
        }
        const params = new URLSearchParams();
        params.set("To", item.channel === "whatsapp" ? "whatsapp:" + item.recipient_phone : item.recipient_phone);
        params.set("From", item.channel === "whatsapp" && !from.startsWith("whatsapp:") ? "whatsapp:" + from : from);
        params.set("Body", message);
        const response = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + twilioSid + "/Messages.json", {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(twilioSid + ":" + twilioToken),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Twilio request failed");
        await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "sent", p_provider_message_id: result.sid || null });
        sent++;
      } else if (item.channel === "push") {
        if (!pushReady) {
          await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "skipped", p_error: "VAPID push keys are not configured" });
          skipped++; continue;
        }
        const { data: subscriptions } = await db.from("school_parent_push_subscriptions")
          .select("id,subscription").eq("school_id", item.school_id).eq("recipient_phone", item.recipient_phone);
        if (!subscriptions?.length) {
          await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "skipped", p_error: "Parent has not enabled browser notifications on a registered device" });
          skipped++; continue;
        }
        let delivered = 0;
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(sub.subscription, JSON.stringify({
              title: announcement.title, body: announcement.body.slice(0, 180),
              url: "/parent/notifications", tag: "school-announcement-" + announcement.id,
            }));
            delivered++;
          } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (statusCode === 404 || statusCode === 410) await db.from("school_parent_push_subscriptions").delete().eq("id", sub.id);
          }
        }
        if (!delivered) throw new Error("No active parent push subscription accepted the notification");
        await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "sent", p_provider_message_id: "web-push:" + delivered });
        sent++;
      }
    } catch (error) {
      await db.rpc("finish_school_announcement_delivery", { p_delivery_id: item.id, p_status: "failed", p_error: String(error).slice(0, 900) });
      failed++;
    }
  }
  return new Response(JSON.stringify({ processed: deliveries.length, sent, failed, skipped }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
