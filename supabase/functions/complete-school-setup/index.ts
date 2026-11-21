import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const { user_id, email, registration_token, school_id, details, plan_code } = await req.json();
    const validPlans = ["BASIC", "PRO", "PREMIUM", "CUSTOM"];
    if (typeof user_id !== "string" || typeof email !== "string" || typeof registration_token !== "string" || registration_token.length < 20 || typeof school_id !== "string" || !validPlans.includes(plan_code) || !details ||
      typeof details.address_line_1 !== "string" || !details.address_line_1.trim() || typeof details.pincode !== "string" || !/^\d{6}$/.test(details.pincode) ||
      typeof details.city_town !== "string" || !details.city_town.trim() || typeof details.state !== "string" || !details.state.trim() ||
      !Number.isInteger(details.school_started_year) || details.school_started_year < 1800 || details.school_started_year > new Date().getFullYear() ||
      !["student_strength", "bus_count", "staff_count", "teacher_count"].every((key) => Number.isInteger(details[key]) && details[key] >= 0)) return json({ error: "Please complete all required school details correctly." }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (secretKeysRaw ? JSON.parse(secretKeysRaw).default : undefined);
    if (!url || !serviceKey) return json({ error: "School setup service is not configured." }, 500);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(user_id);
    const user = authData?.user;
    if (authError || !user || user.email?.toLowerCase() !== email.trim().toLowerCase() || user.user_metadata?.registration_token !== registration_token) return json({ error: "Could not verify this school registration." }, 403);
    const { data: school, error: lookupError } = await admin.from("school_tenants").select("id, school_id, admin_user_id").eq("school_id", school_id).eq("admin_user_id", user_id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!school) return json({ error: "Registered School ID was not found for this Admin." }, 404);
    const now = new Date();
    const trialEndsAt = plan_code === "BASIC" ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null;
    const planStatus = plan_code === "BASIC" ? "trial" : "pending_payment";
    const { error: updateError } = await admin.from("school_tenants").update({
      address_line_1: details.address_line_1.trim(), address_line_2: typeof details.address_line_2 === "string" && details.address_line_2.trim() ? details.address_line_2.trim() : null,
      pincode: details.pincode, city_town: details.city_town.trim(), state: details.state.trim(), school_started_year: details.school_started_year,
      student_strength: details.student_strength, bus_count: details.bus_count, staff_count: details.staff_count, teacher_count: details.teacher_count,
      plan_code, plan_status: planStatus, plan_selected_at: now.toISOString(), trial_started_at: trialEndsAt ? now.toISOString() : null, trial_ends_at: trialEndsAt?.toISOString() ?? null,
    }).eq("id", school.id);
    if (updateError) throw updateError;
    return json({ success: true, school_id, plan_code, plan_status: planStatus, trial_ends_at: trialEndsAt?.toISOString() ?? null });
  } catch (error) { console.error("School setup failed:", error); return json({ error: "School setup could not be saved. Please retry." }, 500); }
});
