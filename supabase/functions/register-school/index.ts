import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user_id, email, school_name, registration_token } = await req.json();
    if (
      typeof user_id !== "string" ||
      typeof email !== "string" ||
      typeof school_name !== "string" ||
      typeof registration_token !== "string" ||
      !school_name.trim() ||
      registration_token.length < 20
    ) {
      return json({ error: "Registration details are incomplete." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const serviceKey = legacyServiceKey || (secretKeysRaw ? JSON.parse(secretKeysRaw).default : undefined);

    if (!supabaseUrl || !serviceKey) {
      console.error("Supabase server credentials are unavailable.");
      return json({ error: "School registration service is not configured." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(user_id);
    const user = authData?.user;
    if (
      authError ||
      !user ||
      user.email?.toLowerCase() !== email.trim().toLowerCase() ||
      user.user_metadata?.school_name !== school_name.trim() ||
      user.user_metadata?.registration_token !== registration_token
    ) {
      return json({ error: "Could not verify this registration. Please try again." }, 403);
    }

    const { data: existing, error: lookupError } = await admin
      .from("school_tenants")
      .select("school_id, school_name, admin_email")
      .eq("admin_user_id", user_id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) return json({ school: existing, already_registered: true });

    const { data: created, error: insertError } = await admin
      .from("school_tenants")
      .insert({
        admin_user_id: user_id,
        school_name: school_name.trim(),
        admin_email: email.trim().toLowerCase(),
      })
      .select("school_id, school_name, admin_email")
      .single();

    if (insertError) {
      const { data: retryResult, error: retryError } = await admin
        .from("school_tenants")
        .select("school_id, school_name, admin_email")
        .eq("admin_user_id", user_id)
        .maybeSingle();
      if (retryError || !retryResult) throw insertError;
      return json({ school: retryResult, already_registered: true });
    }

    return json({ school: created, already_registered: false }, 201);
  } catch (error) {
    console.error("School registration failed:", error);
    return json({ error: "School registration could not be completed. Please retry." }, 500);
  }
});
