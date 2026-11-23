# Known limitations — FloodBridge V2

## Deployment dependencies

- The release is not pre-connected to an organisation's Supabase project or telecom / messaging accounts. The organisation must deploy the schema migration and Edge Functions and supply its own provider credentials.
- USSD needs an assigned shortcode and provider callback registration. A shortcode entered in settings does not create or purchase that code.
- Email intake currently has an implemented SendGrid Inbound Parse adapter. Other email providers need an adapter or compliant forwarding integration.
- Social profile links are descriptive only. Message ingestion requires platform APIs, permissions, connected assets and webhooks. X native DM ingestion is not supplied; a signed third-party webhook bridge is available.
- Public community reports use IP-hash rate limiting, but organisations should add additional bot protection, abuse monitoring and operational review before high-profile public launch.
- The public portal requires the production Supabase URL / public key in `config.js` and an organisation UUID in the page URL or `publicOrgId`.

## Decision-support boundaries

- Community incident reports may be inaccurate, duplicated, malicious, delayed or incomplete. They are unverified until an authorised person checks them.
- AI triage is an advisory classification and summarisation aid. It can be wrong and must never make autonomous dispatch, evacuation, road-closure, safety or rescue decisions.
- The route planner returns baseline OpenRouteService road-network distance and duration. It currently does not automatically intersect routes with flood-depth rasters or reliably exclude road segments from incident point reports. A calculated route is not a safe route.
- Open-Meteo rainfall forecasts are not flood-stage or inundation predictions. The NASA Worldview MODIS reference is optical, may miss water under persistent cloud and is not processed into road-closure or flood-depth decisions by FloodBridge.
- USSD collects a caller's text description and phone number sent by the provider; it does not obtain GPS coordinates by itself.
- Email parsing extracts text and creates an incident record; attachments are not currently retained as managed evidence files.
- Outbound provider acceptance does not prove delivery, reading or receipt by the intended person.
- Audit rows cover incident, response-task, organisation-profile and channel-setting mutations. The communication log records provider message events separately. Reads, logins and every action in the original V1.1 modules are not comprehensively audited. Organisations needing regulatory-grade audit should add a wider audit/retention design.

## Original V1.1 features retained

- BLE / USB sensor connection is browser-dependent and the ESP32 sensor must be calibrated against a surveyed reference by a qualified team.
- The rainfall forecast and OpenStreetMap basemap require internet access.
- Offline-first evidence capture remains browser-local until a signed-in user syncs it to the organisation workspace. Avoid shared/public devices for sensitive work.
- Existing observations, site and asset data are not automatically imported into V2 incident records. The existing V1.1 tables are retained.

## Operational prerequisites

Before using FloodBridge for actual incidents, complete a controlled pilot, provider security tests, user access tests, data-protection review, escalation SOPs, staff training, backup and restore test, and an approved operational sign-off. Do not use it as the sole emergency communications or safety system.

- Duplicate detection is a heuristic flag for similar descriptions reported at the same location within a rolling 24-hour window. It does not merge or reject reports; officers must decide whether records refer to the same incident.
- Public report status lookup exposes only the reference, workflow status and verification state. It does not provide a rescue ETA or guarantee that a response team has been dispatched.
- Automatic incident alerts are email-only in this release and require a configured operations address, enabled notification channel, and Resend credentials. SMS / WhatsApp notifications remain operator-initiated through Notification Centre.
