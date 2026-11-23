import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set([
  "Cashier-Staff", "Accountant-Staff", "Principal", "Assistant Principal",
  "Correspondent", "Academic Director", "Teacher", "Staff",
]);
const allowedPages = new Set([
  "Dashboard", "Create Student", "Create Teacher", "Create Staff",
  "Create Driver & Cleaner", "Students Data", "Standard", "Attendance",
  "Exam Schedules", "Student Results", "Performance", "Routes", "Buses",
  "Allotment", "Teachers", "Staff", "Driver & Cleaner", "Parent Book",
  "Finance", "Fees", "Fees Structure", "Pending Fees", "OpenCV", "GPS - Bus",
  "Common Settings", "Notifications",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in as the school Admin first." }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server authentication is not configured." }, 500);

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Your Admin session is invalid or expired." }, 401);

  const body = await req.json().catch(() => null);
  const schoolId = typeof body?.school_id === "string" ? body.school_id.trim().toUpperCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role : "";
  const pages = Array.isArray(body?.allowed_pages) ? body.allowed_pages : [];
  if (!schoolId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !allowedRoles.has(role)) return json({ error: "Enter a valid email and supported school role." }, 400);
  if (pages.length > 40 || pages.some((page: unknown) => typeof page !== "string" || !allowedPages.has(page))) return json({ error: "One or more selected pages are not permitted." }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: school, error: schoolError } = await admin.from("school_tenants")
    .select("school_id,school_name,admin_user_id").eq("school_id", schoolId).maybeSingle();
  if (schoolError) return json({ error: "Could not verify the school." }, 500);
  if (!school || school.admin_user_id !== caller.id) return json({ error: "Only this school's Admin can invite role users." }, 403);

  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_school_id: schoolId, invited_role: role },
  });
  if (inviteError || !invitation.user) return json({ error: inviteError?.message || "Invitation could not be sent." }, 400);

  const { error: roleError } = await admin.from("school_user_roles").insert({
    school_id: schoolId, user_id: invitation.user.id, email, role,
    allowed_pages: pages, status: "active", created_by: caller.id, created_by_email: caller.email ?? null,
  });
  if (roleError) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    return json({ error: roleError.message }, 400);
  }
  return json({ success: true, invited: true, email, role, allowed_pages: pages });
});
