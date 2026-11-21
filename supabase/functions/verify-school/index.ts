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
    const { school_id } = await req.json();
    if (typeof school_id !== "string" || !/^\d{4}RADXID\d{6,}$/.test(school_id.trim().toUpperCase())) {
      return json({ error: "Enter a valid School ID." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const serviceKey = legacyServiceKey || (secretKeysRaw ? JSON.parse(secretKeysRaw).default : undefined);
    if (!supabaseUrl || !serviceKey) {
      console.error("Supabase server credentials are unavailable.");
      return json({ error: "School verification service is not configured." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: school, error } = await admin
      .from("school_tenants")
      .select("school_id, school_name, school_logo_url")
      .eq("school_id", school_id.trim().toUpperCase())
      .maybeSingle();

    if (error) throw error;
    if (!school) return json({ error: "No registered school was found for this School ID." }, 404);
    return json({ school });
  } catch (error) {
    console.error("School ID verification failed:", error);
    return json({ error: "School ID verification could not be completed. Please retry." }, 500);
  }
});