import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  return "";
};
const hashOtp = async (schoolId: string, phone: string, otp: string) => {
  const bytes = new TextEncoder().encode(schoolId + "|" + phone + "|" + otp);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
};
const sendOtp = async (phone: string, otp: string) => {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_SMS_FROM");
  if (!sid || !token || !from) throw new Error("SMS provider is not configured. Ask the school administrator to finish messaging setup.");
  const body = new URLSearchParams({ To: phone, From: from, Body: "Your RADX parent notification verification code is " + otp + ". It expires in 5 minutes." });
  const response = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(sid + ":" + token), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Could not send verification SMS");
};

const decodeB64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};
const encodeB64Url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const getVapidConfig = async (db: ReturnType<typeof createClient>) => {
  const { data: existing } = await db.from("school_push_vapid_keys").select("public_key,private_key").eq("key_id","radx-global").maybeSingle();
  if (existing) return { publicKey: existing.public_key, privateKey: existing.private_key };
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.x || !jwk.y || !jwk.d) throw new Error("Could not generate web push keys");
  const point = new Uint8Array(65); point[0] = 4;
  point.set(decodeB64Url(jwk.x), 1); point.set(decodeB64Url(jwk.y), 33);
  const created = { public_key: encodeB64Url(point), private_key: jwk.d };
  const { error } = await db.from("school_push_vapid_keys").insert({ key_id: "radx-global", ...created });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
  const { data: stored } = await db.from("school_push_vapid_keys").select("public_key,private_key").eq("key_id","radx-global").single();
  if (!stored) throw new Error("Could not persist web push keys");
  return { publicKey: stored.public_key, privateKey: stored.private_key };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Server configuration missing" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const input = await req.json();
    const schoolId = String(input.school_id || "").trim().toUpperCase();
    const phone = normalizePhone(String(input.phone || ""));
    if (!schoolId || !phone) return json({ error: "Enter a valid school ID and mobile number." }, 400);

    if (input.action === "get_vapid") {
      const vapid = await getVapidConfig(db);
      return json({ success: true, public_key: vapid.publicKey });
    }

    if (input.action === "request_otp") {
      const { count } = await db.from("school_parent_push_otps").select("id", { count: "exact", head: true })
        .eq("school_id", schoolId).eq("recipient_phone", phone)
        .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      if ((count || 0) >= 3) return json({ error: "Too many codes requested. Try again after 15 minutes." }, 429);

      const { data: students, error: studentError } = await db.from("school_people")
        .select("details").eq("school_id", schoolId).eq("record_type", "Student").limit(5000);
      if (studentError) throw studentError;
      const matched = (students || []).some((student: any) => {
        const d = student.details || {};
        return ["father_phone", "mother_phone", "guardian_phone", "primary_contact"]
          .some(field => normalizePhone(String(d[field] || "")) === phone);
      });
      if (!matched) return json({ error: "This mobile number is not registered in the selected school’s student records." }, 404);

      const random = new Uint32Array(1); crypto.getRandomValues(random);
      const otp = String(random[0] % 1000000).padStart(6, "0");
      await sendOtp(phone, otp);
      await db.from("school_parent_push_otps").delete().eq("school_id", schoolId).eq("recipient_phone", phone);
      const { error } = await db.from("school_parent_push_otps").insert({
        school_id: schoolId, recipient_phone: phone, otp_hash: await hashOtp(schoolId, phone, otp),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return json({ success: true, message: "Verification code sent." });
    }

    if (input.action === "verify_and_subscribe") {
      const otp = String(input.otp || "").trim();
      const subscription = input.subscription || null;
      if (!/^\\d{6}$/.test(otp) || (subscription && (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth))) {
        return json({ error: "Enter the six-digit code and provide a valid notification subscription if enabling push." }, 400);
      }
      const { data: row, error } = await db.from("school_parent_push_otps").select("*")
        .eq("school_id", schoolId).eq("recipient_phone", phone).gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !row) return json({ error: "Code expired. Request a new code." }, 400);
      if (row.attempts >= 5) return json({ error: "Too many incorrect attempts. Request a new code." }, 429);
      const expected = await hashOtp(schoolId, phone, otp);
      if (expected !== row.otp_hash) {
        await db.from("school_parent_push_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
        return json({ error: "Incorrect verification code." }, 400);
      }
      if (subscription) {
        const { error: saveError } = await db.from("school_parent_push_subscriptions").upsert({
          school_id: schoolId, recipient_phone: phone, subscription, user_agent: req.headers.get("user-agent") || "",
          updated_at: new Date().toISOString(),
        }, { onConflict: "school_id,recipient_phone" });
        if (saveError) throw saveError;
      }
      await db.from("school_parent_push_otps").delete().eq("id", row.id);
      const { data: inbox } = await db.from("school_parent_inbox").select("id,title,body,attachments,created_at,read_at")
        .eq("school_id", schoolId).eq("recipient_phone", phone).order("created_at", { ascending: false }).limit(50);
      const inboxWithLinks = await Promise.all((inbox || []).map(async (item: any) => ({
        ...item,
        attachments: await Promise.all((item.attachments || []).map(async (file: any) => {
          const { data } = await db.storage.from("school-announcements").createSignedUrl(file.path, 60 * 60);
          return { ...file, url: data?.signedUrl || null };
        })),
      })));
      return json({
        success: true,
        message: subscription ? "Parent notifications are enabled on this device." : "Mobile number verified. Your school inbox is ready.",
        push_enabled: !!subscription,
        inbox: inboxWithLinks,
      });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: String((error as any)?.message || error).slice(0, 500) }, 500);
  }
});
