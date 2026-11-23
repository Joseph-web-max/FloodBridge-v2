# FloodBridge V2 — Institutional Edition

**From flood evidence to response coordination.** FloodBridge connects community reports, field observations, water-level sensor telemetry, monitored crossings and essential-service dependencies in one organisational workspace.

## Important deployment status

This release includes the V2 frontend, V2 database migration, public reporting portal and backend Edge Function source. It is **not pre-connected to a real organisation or live third-party accounts**. Each organisation must create / supply its own Supabase project, provider accounts, API credentials, shortcode, domain and webhook approvals. This is a security and account-ownership requirement, not something the website can safely guess or invent.

Start with **[START-HERE.md](START-HERE.md)**, then follow the detailed **[DEPLOYMENT-V2.md](DEPLOYMENT-V2.md)** guide. The validation boundaries are recorded in **[RELEASE-VALIDATION.md](RELEASE-VALIDATION.md)**.

## Included modules

- **Command overview:** sites, fresh observations, reported blocked crossings, rainfall context and manually mapped lifeline impacts.
- **Map & monitored sites:** Leaflet / OpenStreetMap map, crossing and gauge register, geolocation, plus a direct NASA Worldview MODIS flood-observation reference.
- **Observation register:** community and field observations, verification, freshness and CSV / JSON exports.
- **Lifeline assets:** hospitals, shelters, schools, water points and other essential facilities with manually mapped dependencies.
- **Institutional incident inbox:** one queue for website, USSD, inbound email, SMS, WhatsApp, Meta messaging and approved signed webhook-bridge reports. Similar reports from the same location within 24 hours are flagged for human duplicate review; they are never silently discarded.
- **Response coordination:** response task creation, assignment labels, due dates, priority and task status.
- **Integrations & channels:** organisation profile, USSD shortcode, inbound email details, social profile links, WhatsApp sender details, SMS and provider callback URLs.
- **Notification centre:** outbound email via Resend, SMS via Twilio and WhatsApp via Meta Cloud API, once credentials are installed. When enabled and configured, Resend can email the organisation’s saved operations address about new incidents.
- **Community portal:** `community.html` public form and reference-number status lookup for people who do not have staff accounts. Reports remain unverified until an officer reviews them.
- **AI-assisted triage:** optional OpenAI-assisted summaries and suggested next steps. All suggestions require human review.
- **Route analysis:** optional OpenRouteService baseline route distance and estimated duration, with open geo-tagged incident information displayed separately.
- **Institutional audit log:** database-triggered audit rows for incident and response-task mutations.
- **Sensor connections:** existing ESP32 data over Web Bluetooth Nordic UART Service or Web Serial.
- **Rainfall outlook:** Open-Meteo precipitation forecasts for coordinates selected by the operator.
- **Cloud collaboration:** Supabase Auth, organisation memberships, roles, RLS and Realtime records.

## Run locally

Static pages can be opened over a local HTTPS server or hosted on GitHub Pages. Browser features such as geolocation, BLE and Web Serial need a supported browser and a secure context. Set only `supabaseUrl`, `supabaseAnonKey` and optionally `publicOrgId` in `config.js`.

## First-time cloud setup

1. Run `supabase/schema.sql` in a new Supabase project's SQL Editor.
2. Run `supabase/migrations/202611230001_institutional_v2.sql`.
3. Configure `config.js` with the Supabase project URL and public anon / publishable key.
4. Deploy the included Edge Functions using the Supabase CLI, including the public community status lookup.
5. Set only the provider secrets that the organisation has approved in Supabase Edge Function Secrets.
6. Create the organisation, set an initial administrator, add staff with least-privilege roles and configure channel accounts.
7. Complete the acceptance tests in `DEPLOYMENT-V2.md` before production use.

Never put a Supabase service-role key, provider password or API secret into `config.js`, `index.html`, GitHub Pages or a public repository.

## Provider integrations

| Capability | Included adapter | External setup needed |
|---|---|---|
| Public website reports | Supabase Edge Function | Supabase project, migration and public organisation ID |
| USSD | Africa's Talking-compatible session callback | Assigned shortcode, provider account and callback registration |
| Inbound email | Twilio SendGrid Inbound Parse | Receiving domain, MX record, parser webhook and shared callback secret |
| WhatsApp / Meta messages | Meta webhook parser | Meta Business / Developer app, permissions, connected assets and subscriptions |
| SMS inbound/outbound | Twilio webhook and Messaging API | Twilio account, approved sender and credentials |
| Outbound email | Resend API | Authenticated sending domain and API key |
| Social profiles | Stored URLs + separately enabled signed webhook bridge | Platform permissions or compliant third-party automation; a profile URL alone does not grant message access |
| AI triage | OpenAI Responses API | Organisation-owned API key and billing / model access |
| Road network routing | OpenRouteService Directions API | API key and rate-limit / use-policy review |

## Safety and data governance

- Reports are unverified by default. AI-generated categories and severity suggestions are advisory.
- FloodBridge does not issue official public warnings, dispatch emergency services, certify water-level sensors, declare roads safe or guarantee rescue.
- The current route planner calculates a baseline route. It does not automatically exclude every flooded road or create a flood-safe detour.
- Rainfall forecasts are weather context, not river-stage or inundation forecasts.
- USSD has no GPS position by default; it records the caller's landmark or location description.
- The organisation is responsible for lawful data processing, consent, retention, staff permissions, secure provider credentials, backups, incident escalation and training.

## Source documents

- [Start here](START-HERE.md)
- [Deployment V2](DEPLOYMENT-V2.md)
- [Release validation](RELEASE-VALIDATION.md)
- [Safety, privacy and governance](docs/SAFETY-PRIVACY-AND-GOVERNANCE.md)
- [System architecture](docs/SYSTEM-ARCHITECTURE.md)
- [Field pilot protocol](docs/FIELD-PILOT-PROTOCOL.md)
- [Known limitations](docs/KNOWN-LIMITATIONS.md)
- [Data dictionary](docs/DATA-DICTIONARY.md)
- [Related work and research gap](docs/RELATED-WORK-AND-RESEARCH-GAP.md)
- [Hardware assembly and wiring](hardware/ASSEMBLY-AND-WIRING.md)
- [Telemetry protocol](hardware/TELEMETRY-PROTOCOL.md)

**Release:** 2.0.0 · Existing V1.1 data tables and ESP32 firmware retained.


### Satellite flood observation reference

The Map & monitored sites page links to NASA Worldview with the near-real-time MODIS 2-day and 3-day flood products. This is an external observational reference, not an automatically processed FloodBridge risk layer. NASA notes that the optical MODIS product cannot detect water under persistent cloud cover. Use it with field verification, gauges and competent-authority information; do not infer road safety from an absence of satellite detections.
