# FloodBridge V2 system architecture

## Components

1. **Static client:** `index.html`, `v2-modules.js`, `community.html` and `config.js`, hosted on GitHub Pages or another HTTPS static host.
2. **Identity and shared data:** Supabase Auth, PostgreSQL, Row Level Security, organisation memberships, database triggers and Realtime.
3. **Evidence modules:** original V1.1 sites, observations, assets and telemetry tables.
4. **Public access:** no-login community submission and rate-limited status lookup by unguessable incident reference; USSD also includes a status-check menu option.
5. **Institutional workflow:** `fb_incidents`, `fb_response_tasks`, `fb_messages`, `fb_channels`, `fb_org_profiles` and `fb_audit_log`.
6. **Inbound adapters:** public website intake, Africa's Talking-compatible USSD callback, SendGrid Inbound Parse, Meta webhook, signed social bridge and Twilio inbound messaging webhook.
7. **Outbound adapters:** Resend email, Twilio SMS and Meta WhatsApp Cloud API.
8. **Decision support:** OpenAI-assisted incident triage and OpenRouteService baseline route calculation.
9. **Hardware:** ESP32 ultrasonic distance telemetry over USB Serial or Bluetooth LE Nordic UART Service.

## Trust boundaries

- The browser receives only the Supabase public anon / publishable key. RLS limits the user's visible organisational data.
- Provider keys and shared webhook secrets remain in Supabase Edge Function Secrets.
- Public intake writes only through server-side Edge Functions and uses server-side rate limiting.
- USSD and email callbacks use high-entropy URL tokens. Meta webhook requests use HMAC signature verification. Twilio requests validate `X-Twilio-Signature`.
- Staff-only functions validate the caller's Supabase JWT and organisation membership / role server-side.
- `fb_channels.config` contains public settings and provider identifiers only. It must never contain passwords, access tokens or API secrets.

## Data flow

`Community / sensor / provider → inbound Edge Function → fb_incidents + fb_messages → possible-duplicate review flag → staff incident inbox → human verification → response tasks → provider notification / closure notes`.

New incident records can trigger an optional Resend email alert to the organisation's saved operations address. OpenAI and route APIs are called from Edge Functions so provider credentials are not exposed in the browser. AI output is stored as an advisory JSON object. Route output is a baseline network path summary and is explicitly not a flood-safety certification.

## Organisation isolation

Each operational row is scoped to `org_id`. Supabase RLS policies use existing `fb_is_member`, `fb_can_write` and `fb_is_admin` helpers. Administrators manage channel settings and view audit rows; editors can manage incident and response workflows; viewers have read-only access.
