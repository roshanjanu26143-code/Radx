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
  "Create Driver & Cleaner", "Standard", "Teacher Allotment", "Seat Allotment", "Attendance", "Subjects", "Timetable",
  "Exam Schedules", "Marks Entry", "Student Results", "Performance", "Attendance Reports",
  "Live tracking", "Routes", "Students", "Buses", "Teachers", "Staff", "Driver & Cleaner",
  "Parent Book", "Announcements", "Finance", "Fees", "Fees Structure", "Pending Fees",
  "OpenCV", "GPS - Bus", "Common Settings", "Notifications", "QR Attendance Passwords",
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

  const initialPassword = typeof body?.initial_password === "string" ? body.initial_password : "";
  const personId = typeof body?.person_id === "string" ? body.person_id.trim() : "";
  if (role === "Teacher" && (initialPassword.length < 8 || initialPassword.length > 72)) {
    return json({ error: "For a Teacher account, the Admin must enter an initial password of 8 to 72 characters." }, 400);
  }
  if ((role === "Teacher" || role === "Staff") && !personId) return json({ error: `Select the ${role.toLowerCase()} profile to link this login account.` }, 400);
  if (role === "Teacher" || role === "Staff") {
    const { data: person, error: personError } = await admin.from("school_people")
      .select("person_id").eq("school_id", schoolId).eq("person_id", personId).eq("record_type", role).maybeSingle();
    if (personError) return json({ error: `Could not verify the ${role.toLowerCase()} profile.` }, 500);
    if (!person) return json({ error: `The selected ${role.toLowerCase()} profile does not belong to this school.` }, 400);
    const { data: linked, error: linkedError } = await admin.from("school_user_roles")
      .select("id").eq("school_id", schoolId).eq("person_id", personId).eq("role", role).maybeSingle();
    if (linkedError) return json({ error: `Could not check the ${role.toLowerCase()} account link.` }, 500);
    if (linked) return json({ error: `This ${role.toLowerCase()} profile already has a login account.` }, 409);
  }

  let accountUser: { id: string } | null = null;
  let invited = false;
  if (role === "Teacher") {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { invited_school_id: schoolId, invited_role: role },
    });
    if (createError || !created.user) return json({ error: createError?.message || "Teacher account could not be created." }, 400);
    accountUser = created.user;
  } else {
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_school_id: schoolId, invited_role: role },
    });
    if (inviteError || !invitation.user) return json({ error: inviteError?.message || "Invitation could not be sent." }, 400);
    accountUser = invitation.user;
    invited = true;
  }

  const { error: roleError } = await admin.from("school_user_roles").insert({
    school_id: schoolId, user_id: accountUser.id, email, role,
    allowed_pages: pages, status: "active", person_id: (role === "Teacher" || role === "Staff") ? personId : null,
    created_by: caller.id, created_by_email: caller.email ?? null,
  });
  if (roleError) {
    await admin.auth.admin.deleteUser(accountUser.id);
    return json({ error: roleError.message }, 400);
  }
  return json({ success: true, invited, email, role, allowed_pages: pages, password_set_by_admin: role === "Teacher" });
});
