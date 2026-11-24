import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function flatten(value: unknown, output: Record<string, unknown> = {}, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== "object" || depth > 5) return output;
  if (Array.isArray(value)) { if (value.length) flatten(value[0], output, depth + 1); return output; }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (child !== null && child !== undefined && typeof child !== "object" && output[normalized] === undefined) output[normalized] = child;
    if (child && typeof child === "object") flatten(child, output, depth + 1);
  }
  return output;
}
function pick(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}
function normalizePoint(input: unknown) {
  const data = flatten(input);
  const imei = String(pick(data, ["imei", "device_imei", "imei_no", "device_id", "deviceId", "terminal_id", "terminalId"]) ?? "").replace(/\D/g, "");
  const latitude = Number(pick(data, ["latitude", "lat", "gps_lat", "gpsLatitude", "lat_y"]));
  const longitude = Number(pick(data, ["longitude", "lng", "lon", "long", "gps_lng", "gpsLongitude", "lon_x"]));
  const rawSpeed = pick(data, ["speed_kph", "speedKph", "speed", "velocity"]);
  let speed = rawSpeed === undefined ? null : Number(rawSpeed);
  const unit = String(pick(data, ["speed_unit", "speedUnit", "unit"]) ?? "kph").toLowerCase();
  if (speed !== null && Number.isFinite(speed)) {
    if (unit === "mph" || unit === "mi/h") speed *= 1.609344;
    else if (unit === "knots" || unit === "knot" || unit === "kn") speed *= 1.852;
    else if (unit === "m/s" || unit === "mps") speed *= 3.6;
  }
  const rawHeading = pick(data, ["heading", "course", "direction", "angle"]);
  const heading = rawHeading === undefined ? null : Math.round(Number(rawHeading));
  const rawTime = pick(data, ["recorded_at", "recordedAt", "timestamp", "gps_time", "gpsTime", "device_time", "datetime", "time"]);
  let recordedAt = new Date().toISOString();
  if (typeof rawTime === "number" || (typeof rawTime === "string" && /^\d{10,13}$/.test(rawTime))) {
    const epoch = Number(rawTime);
    recordedAt = new Date(epoch < 100000000000 ? epoch * 1000 : epoch).toISOString();
  } else if (rawTime !== undefined) {
    const parsed = Date.parse(String(rawTime));
    if (Number.isFinite(parsed)) recordedAt = new Date(parsed).toISOString();
  }
  return { imei, latitude, longitude, speed, heading, recordedAt };
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-device-token") || "").trim();
  if (!token || token.length < 40) return json(401, { error: "Missing or invalid device token" });
  let body: unknown;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    } else body = await request.json();
  } catch { return json(400, { error: "Request body must be valid JSON or form data" }); }
  const items = Array.isArray(body) ? body : [body];
  if (!items.length || items.length > 100) return json(400, { error: "Send between 1 and 100 GPS points per request" });
  const points = items.map(normalizePoint);
  const imei = points[0]?.imei;
  if (!imei || imei.length < 10 || imei.length > 20) return json(400, { error: "IMEI must contain 10 to 20 digits" });
  if (points.some((point) => point.imei !== imei)) return json(400, { error: "A batch must contain points for one GPS device only" });
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) return json(400, { error: "Latitude is out of range" });
    if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) return json(400, { error: "Longitude is out of range" });
    if (point.speed !== null && (!Number.isFinite(point.speed) || point.speed < 0 || point.speed > 300)) return json(400, { error: "Speed must be between 0 and 300 km/h" });
    if (point.heading !== null && (!Number.isInteger(point.heading) || point.heading < 0 || point.heading > 359)) return json(400, { error: "Heading must be between 0 and 359 degrees" });
    const recordedMs = Date.parse(point.recordedAt);
    if (!Number.isFinite(recordedMs) || recordedMs > Date.now() + 10 * 60 * 1000 || recordedMs < Date.now() - 72 * 60 * 60 * 1000) return json(400, { error: "GPS timestamp must be within the last 72 hours and not far in the future" });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "GPS ingestion service is not configured" });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tokenHash = await sha256(token);
  const { data: device, error: lookupError } = await admin.from("school_bus_gps_devices")
    .select("id,school_id,bus_id,status,protocol_type").eq("device_imei", imei).eq("ingest_token_hash", tokenHash).maybeSingle();
  if (lookupError) return json(500, { error: "Could not validate GPS device" });
  if (!device) return json(401, { error: "Device credentials were not recognized" });
  if (device.status === "inactive") return json(403, { error: "This GPS device is inactive" });
  const rows = points.map((point) => ({
    school_id: device.school_id, bus_id: device.bus_id, device_id: device.id,
    latitude: point.latitude, longitude: point.longitude, speed_kph: point.speed,
    heading: point.heading, recorded_at: point.recordedAt, source: "device",
  }));
  const { error: insertError } = await admin.from("school_bus_gps_positions").insert(rows);
  if (insertError) return json(500, { error: "Could not store GPS position" });
  const receivedAt = new Date().toISOString();
  const { error: updateError } = await admin.from("school_bus_gps_devices")
    .update({ status: "active", last_seen_at: receivedAt, updated_at: receivedAt }).eq("id", device.id).eq("school_id", device.school_id);
  if (updateError) return json(500, { error: "Position stored, but device heartbeat could not be updated" });
  return json(200, { ok: true, accepted: rows.length, bus_id: device.bus_id, received_at: receivedAt });
});
