# AI ACADAMIX — Multi-brand GPS device integration

Each school can register a different GPS brand/model for each bus. The school-wide tracker screen consumes one normalized location format; device-specific adapters translate vendor payloads before storage.

## Device profile fields

- Brand/provider and model name (free text; supports OEM/local models)
- IMEI and optional provider-side device ID
- Protocol profile: HTTP JSON, vendor cloud webhook, GT06 TCP, TK103 TCP, or custom gateway
- School bus mapping, SIM number, label, and device status

## Secure ingestion

Endpoint: `https://rofbsjdsxqwbccnoyvyp.supabase.co/functions/v1/gps-ingest`

Send the per-device one-time token as `Authorization: Bearer DEVICE_TOKEN`. The token is shown only once at registration; only its SHA-256 hash is stored. A gateway that accepts vendor callbacks should inject this header server-side. Never put the token or vendor API secrets in a public tracker configuration or browser code.

## Normalized JSON example

```json
{
  "imei": "123456789012345",
  "latitude": 12.3456,
  "longitude": 78.9012,
  "speed_kph": 32,
  "heading": 180,
  "recorded_at": "2026-11-24T08:30:00Z"
}
```

The receiver also recognizes common vendor aliases such as `device_imei`, `device_id`, `lat`, `lng`, `lon`, `speed`, `course`, `direction`, `gps_time`, and `timestamp`. Nested JSON objects and batches of up to 100 points for one device are accepted. Speed units can be supplied as `speed_unit` with `mph`, `knots`, or `m/s`; otherwise speed is treated as km/h. Form-encoded payloads are also accepted.

## Protocol boundaries

- HTTP JSON: tracker or vendor platform posts directly when it supports HTTPS and an Authorization header.
- Vendor cloud: configure the vendor platform webhook to call the ACADAMIX endpoint; use a small server-side adapter if the vendor cannot add the device token or uses a different payload.
- GT06/TK103 TCP: raw TCP trackers cannot call an HTTPS Edge Function directly. Deploy a TCP listener/gateway that decodes the device protocol, verifies the device mapping, and forwards normalized HTTPS JSON with the token.
- Custom gateway: translate the provider's proprietary packet/API response into the normalized JSON contract.

The profile selection records the intended integration route; it does not automatically create vendor API credentials, a TCP listener, or a vendor subscription. Those require the actual brand/model protocol specification and, where applicable, the school's vendor account.
