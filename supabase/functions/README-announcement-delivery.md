# RADX parent announcement delivery setup

## Implemented
- Scheduled announcements are released by a Supabase Cron job every minute.
- Publishing fans out to the selected parent channels using the student's registered father, mother and guardian mobile numbers.
- In-app parent inbox records are stored in `school_parent_inbox`.
- Circular files are stored in the private `school-announcements` bucket and shared using short-lived signed links.
- SMS and WhatsApp are dispatched through Twilio.
- Browser push uses Web Push/VAPID keys generated on first parent opt-in and stored in the service-role-only `school_push_vapid_keys` table.
- Parents open `/parent-notifications`, enter their School ID and registered mobile number, verify an SMS OTP, and can read their school inbox and enable browser push.

## Required Supabase Edge Function secrets
Set these in Supabase Dashboard → Edge Functions → Secrets (or with the Supabase CLI):
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM` — an SMS-enabled E.164 sender owned by the Twilio account
- `TWILIO_WHATSAPP_FROM` — an approved WhatsApp sender, E.164; the dispatcher adds the `whatsapp:` prefix

The WhatsApp sender must be approved/enabled in the Twilio account. Template rules may apply for WhatsApp messages outside the customer-service window.

## Notes
- The dispatcher is invoked every minute by `pg_cron` + `pg_net`; it claims jobs with `FOR UPDATE SKIP LOCKED` and retries transient provider failures with backoff.
- Push subscriptions are tied to a verified parent mobile number and school.
- The public dispatcher only drains already-authorized delivery rows; only the service-role Edge Function can claim or update them.
