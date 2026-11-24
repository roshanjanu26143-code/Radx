# RADx GPS TCP Gateway

A separate long-running TCP service for GPS trackers that speak the supported GT06 binary protocol. It forwards normalized points to the existing Supabase `gps-ingest` Edge Function; it does not write to the database directly.

## Current support boundary

- **GT06 login (0x01) + GPS location (0x12):** initial adapter implemented.
- **Other GT06 packet types:** acknowledged where applicable, but not interpreted.
- **TK103, proprietary vendor protocols, encrypted variants:** not enabled. They need a verified packet specification or a sample packet and device-specific adapter. A product name alone is not enough to guarantee wire compatibility.
- **HTTP JSON trackers:** should post directly to the existing Supabase HTTPS endpoint and do not need this TCP gateway.

## Run

Requires Node.js 20+.

```sh
cp .env.example .env
# Edit .env and set GPS_GATEWAY_TOKEN to the one-time token generated for the registered device.
set -a && . ./.env && set +a
npm test
npm start
```

Expose TCP port 5023 on a host that supports inbound TCP. Configure the tracker server/host and port to that public address. Do not deploy this as a short-lived HTTP-only function: the listener must keep TCP sockets open.

## Docker

```sh
docker build -t radx-gps-gateway .
docker run --restart unless-stopped --env-file .env -p 5023:5023 radx-gps-gateway
```

Use a VPS/container host with inbound TCP support, firewall the port to the device provider's known IP ranges where possible, and use TLS/VPN or a private APN if the hardware supports it. Never expose the Supabase service-role key to this service; only the per-device ingest token is required.

## Device identity and tenancy

The tracker login packet supplies its IMEI. Supabase resolves that IMEI against the registered device and validates the bearer token. The gateway token must be the same one-time token shown when the device is registered in the AcadAMIX GPS device screen. For one tracker, set `GPS_GATEWAY_TOKEN`. For multiple trackers/schools, set `GPS_DEVICE_TOKENS` to a JSON object mapping each registered IMEI to its own token. The token and IMEI must belong to the same school device record. Keep this mapping in the host's secret manager; do not commit real tokens to Git.

## Packet caveats

GT06 implementations vary by manufacturer and firmware. Validate login, CRC, coordinate hemisphere flags, and timestamp against the exact device model before production rollout. This starter decoder handles the common 0x12 location layout; it is not a certification for every GT06-labelled device.
