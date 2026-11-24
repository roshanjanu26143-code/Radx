import net from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { decodeGt06Imei, decodeGt06Location, gt06Ack, parseGt06Frames } from "./gt06.js";

const PORT = Number(process.env.GPS_GATEWAY_PORT || 5023);
const HOST = process.env.GPS_GATEWAY_HOST || "0.0.0.0";
const INGEST_URL = process.env.GPS_INGEST_URL;
const DEVICE_TOKEN = process.env.GPS_GATEWAY_TOKEN;
const PROTOCOL = (process.env.GPS_GATEWAY_PROTOCOL || "gt06").toLowerCase();

if (!INGEST_URL || !DEVICE_TOKEN) {
  throw new Error("GPS_INGEST_URL and GPS_GATEWAY_TOKEN are required");
}
if (PROTOCOL !== "gt06") {
  throw new Error(`Protocol "${PROTOCOL}" is not enabled. TK103 and vendor variants require a verified packet specification/adapter.`);
}

const tokenHash = createHash("sha256").update(DEVICE_TOKEN).digest();
const safeTokenConfigured = tokenHash.length === 32;
if (!safeTokenConfigured) throw new Error("Invalid gateway token configuration");

async function forwardTelemetry(imei, point) {
  const response = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${DEVICE_TOKEN}`,
    },
    body: JSON.stringify({ imei, ...point }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase ingest returned ${response.status}: ${detail}`);
  }
}

const server = net.createServer((socket) => {
  socket.setTimeout(120000);
  let pending = Buffer.alloc(0);
  let imei = null;
  let lastAckAt = 0;
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  console.info("GPS device connected", peer);

  socket.on("timeout", () => socket.destroy());
  socket.on("error", (error) => console.warn("GPS socket error", peer, error.message));
  socket.on("close", () => console.info("GPS device disconnected", peer));

  socket.on("data", async (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > 64 * 1024) {
      console.warn("Dropping oversized tracker input", peer);
      socket.destroy();
      return;
    }
    const parsed = parseGt06Frames(pending);
    pending = parsed.remainder;
    for (const frame of parsed.frames) {
      if (!frame.validCrc) {
        console.warn("Rejected GT06 frame with invalid CRC", peer, frame.protocol);
        continue;
      }
      try {
        if (frame.protocol === 0x01) {
          imei = decodeGt06Imei(frame.payload);
          if (!imei) throw new Error("Could not decode tracker IMEI from login packet");
          socket.write(gt06Ack(frame));
          lastAckAt = Date.now();
          console.info("GT06 tracker authenticated by IMEI mapping", imei);
        } else if (frame.protocol === 0x12) {
          if (!imei) throw new Error("Tracker must send a valid login packet before GPS data");
          const point = decodeGt06Location(frame.payload);
          await forwardTelemetry(imei, point);
          if (Date.now() - lastAckAt > 1000) {
            socket.write(gt06Ack(frame));
            lastAckAt = Date.now();
          }
          console.info("GPS point forwarded", { imei, latitude: point.latitude, longitude: point.longitude });
        } else {
          // Preserve TCP session but do not claim support for unimplemented packet types.
          socket.write(gt06Ack(frame));
          console.info("GT06 packet acknowledged; protocol not mapped", frame.protocol);
        }
      } catch (error) {
        console.error("GT06 packet rejected", peer, error.message);
      }
    }
  });
});

server.on("error", (error) => {
  console.error("GPS gateway server error", error);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.info(`RADx GPS GT06 gateway listening on ${HOST}:${PORT}`);
});
