import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
async function sha256(value: string) {
 const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async (request: Request) => {
 if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 if (request.method !== "POST") return json(405, { error: "Method not allowed" });
 const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i,"").trim();
 if (!token || token.length < 40) return json(401,{error:"Missing or invalid device token"});
 let body: Record<string,unknown>;
 try { body = await request.json(); } catch { return json(400,{error:"Request body must be valid JSON"}); }
 const imei = String(body.imei ?? "").replace(/\\D/g,"");
 const latitude = Number(body.latitude), longitude = Number(body.longitude);
 const speed = body.speed_kph == null ? null : Number(body.speed_kph);
 const heading = body.heading == null ? null : Number(body.heading);
 const recordedAt = body.recorded_at == null ? new Date().toISOString() : String(body.recorded_at);
 const recordedMs = Date.parse(recordedAt);
 if (imei.length < 10 || imei.length > 20) return json(400,{error:"IMEI must contain 10 to 20 digits"});
 if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return json(400,{error:"Latitude is out of range"});
 if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return json(400,{error:"Longitude is out of range"});
 if (speed !== null && (!Number.isFinite(speed) || speed < 0 || speed > 300)) return json(400,{error:"Speed must be between 0 and 300 km/h"});
 if (heading !== null && (!Number.isInteger(heading) || heading < 0 || heading > 359)) return json(400,{error:"Heading must be between 0 and 359 degrees"});
 if (!Number.isFinite(recordedMs) || recordedMs > Date.now()+10*60*1000 || recordedMs < Date.now()-72*60*60*1000) return json(400,{error:"GPS timestamp must be within the last 72 hours"});
 const url=Deno.env.get("SUPABASE_URL"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if (!url || !serviceKey) return json(500,{error:"GPS ingestion service is not configured"});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const tokenHash=await sha256(token);
 const {data:device,error:lookupError}=await admin.from("school_bus_gps_devices").select("id,school_id,bus_id,status").eq("device_imei",imei).eq("ingest_token_hash",tokenHash).maybeSingle();
 if (lookupError) return json(500,{error:"Could not validate GPS device"});
 if (!device) return json(401,{error:"Device credentials were not recognized"});
 if (device.status==="inactive") return json(403,{error:"This GPS device is inactive"});
 const {error:insertError}=await admin.from("school_bus_gps_positions").insert({school_id:device.school_id,bus_id:device.bus_id,device_id:device.id,latitude,longitude,speed_kph:speed,heading,recorded_at:new Date(recordedMs).toISOString(),source:"device"});
 if (insertError) return json(500,{error:"Could not store GPS position"});
 const receivedAt=new Date().toISOString();
 const {error:updateError}=await admin.from("school_bus_gps_devices").update({status:"active",last_seen_at:receivedAt,updated_at:receivedAt}).eq("id",device.id).eq("school_id",device.school_id);
 if (updateError) return json(500,{error:"Position stored, but device heartbeat could not be updated"});
 return json(200,{ok:true,bus_id:device.bus_id,recorded_at:new Date(recordedMs).toISOString(),received_at:receivedAt});
});