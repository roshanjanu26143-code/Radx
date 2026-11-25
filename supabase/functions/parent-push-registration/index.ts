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

    if (input.action === "request_otp") {
      const { count } = await db.from("school_parent_push_otps").select("id", { count: "exact", head: true })
        .eq("school_id", schoolId).eq("recipient_phone", phone)
        .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      if ((count || 0) >= 3) return json({ error: "Too many codes requested. Try again after 15 minutes." }, 429);

      const { data: students, error: studentError } = await db.from("school_people")
        .select("details").eq("school_id", schoolId).eq("record_type", "Student").limit(5000);
      if (studentError) throw studentError;
      const digits = phone.replace(/\D/g, "");
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
      const subscription = input.subscription;
      if (!/^\d{6}$/.test(otp) || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: "Enter the six-digit code and allow browser notifications." }, 400);
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
      const { error: saveError } = await db.from("school_parent_push_subscriptions").upsert({
        school_id: schoolId, recipient_phone: phone, subscription, user_agent: req.headers.get("user-agent") || "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "school_id,recipient_phone" });
      if (saveError) throw saveError;
      await db.from("school_parent_push_otps").delete().eq("id", row.id);
      return json({ success: true, message: "Parent notifications are enabled on this device." });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: String((error as any)?.message || error).slice(0, 500) }, 500);
  }
});
