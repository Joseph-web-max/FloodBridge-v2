# FloodBridge V2 — Institutional deployment and go-live guide

**Release:** 2.0.0 · **Deployment model:** Static web frontend + Supabase managed backend + provider webhooks.

FloodBridge V2 is deployable software, but it is **not live against an organisation's cloud project or telecom/social accounts until the organisation supplies its own provider accounts, IDs, API credentials and webhook approvals**. The downloaded package contains the application changes, database migration and backend functions. This guide describes the one-time institutional setup.

## 1. What is included

- Existing V1.1 application: site register, observation register, lifeline assets, rainfall context, device telemetry, exports, Supabase authentication and organisation roles.
- Institutional incident inbox, public community reporting portal, response task register and audit records.
- Integration settings for USSD, inbound email, Meta/WhatsApp, SMS, institutional identity and notification contacts.
- Supabase Edge Functions for public intake and status lookup, Africa's Talking-compatible USSD, SendGrid Inbound Parse, Meta webhooks, Twilio SMS/WhatsApp inbound, outbound email/SMS/WhatsApp, automatic organisation email alerts, AI-assisted incident triage, integration readiness and OpenRouteService route calculation.
- `community.html` for no-login public report submission and reference-number status checking.

## 2. Required accounts

Before production use, the organisation's authorised administrator should have:

1. A Supabase project and an administrator account.
2. A domain or email receiving provider for inbound reports (SendGrid Inbound Parse is the implemented email adapter).
3. An Africa's Talking account and an assigned USSD shortcode if USSD reporting is required. A shortcode typed into FloodBridge is only a record of the assigned code; it does not provision the code.
4. Meta Business / Developer assets for WhatsApp Cloud API, Facebook Messenger and eligible Instagram Business messaging, if those channels are needed.
5. Twilio account and approved sender for inbound/outbound SMS or WhatsApp via Twilio where applicable.
6. Resend account with an authenticated sending domain for outbound email.
7. OpenAI API key for AI-assisted incident triage (optional).
8. OpenRouteService API key for road-network baseline routing (optional).
9. GitHub repository with Pages enabled, or another HTTPS static host.

Do not share account passwords or provider API keys in chat or put them in the website's `config.js`.

## 3. Deploy the database

1. Create the Supabase project in the region selected by the organisation's data-residency and operational requirements.
2. Open the Supabase SQL Editor.
3. Run `supabase/schema.sql` first (existing V1.1 schema).
4. Run `supabase/migrations/202611230001_institutional_v2.sql` second.
5. In Authentication settings, enable the email sign-in options the organisation intends to use. Set allowed redirect URLs to the production website URL and any approved local test URL.
6. Create the first institutional administrator account in the FloodBridge app, sign in, then create the organisation in Settings & team. Add users with the least privilege they need. Use Viewer for read-only staff, Editor for operational staff and Admin only for trusted system administrators.
7. Keep the organisation join code private. Rotate it after the approved staff have joined.

The existing V1.1 `fb_sites`, `fb_observations`, `fb_assets` and `fb_telemetry` data tables are retained. The migration adds the institutional incident, channel, profile, response task, message, audit and rate-limit tables. Do not run V2 on top of an organisation's live database without first taking a Supabase backup and testing the migration in a staging project.

## 4. Configure the frontend

Edit `config.js` and set only these public values:

```js
window.FLOODBRIDGE_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  publicOrgId: "YOUR-ORGANISATION-UUID"
};
```

Use the Supabase **publishable / anon** key only. Never use the `service_role` or Supabase secret key in a browser file. The organisation UUID is visible in the community portal URL after the organisation is created; it is not an authentication secret.

The app can also connect from Settings & team during initial setup, but committing the public URL and publishable key in `config.js` avoids asking each operator to enter them manually. Public website intake additionally requires the `RATE_LIMIT_PEPPER` secret.

## 5. Install Edge Function secrets

Supabase injects the project URL and current key bundles into Edge Functions. Provider credentials belong in Edge Function Secrets, not in the browser. In the Supabase Dashboard open **Edge Functions → Secrets**, or use the Supabase CLI. The names below are read by the included backend code:

| Secret name | Used for | Required? |
|---|---|---|
| `USSD_WEBHOOK_SECRET` | Protect the USSD callback URL | Required for USSD |
| `SENDGRID_INBOUND_SECRET` | Protect email inbound parser URL | Required for email intake |
| `META_VERIFY_TOKEN` | Meta webhook GET verification | Required for Meta inbound |
| `META_APP_SECRET` | Verify Meta webhook signatures | Required for Meta inbound |
| `META_ACCESS_TOKEN` | Send WhatsApp Cloud API messages | Optional outbound |
| `META_PHONE_NUMBER_ID` | Optional fallback WhatsApp sender phone-number ID; the saved Meta phone ID field may be used instead | Optional if saved in Integrations & channels |
| `META_GRAPH_VERSION` | Graph API version selected by the Meta app administrator | Optional outbound |
| `TWILIO_ACCOUNT_SID` | Twilio account | Required for Twilio |
| `TWILIO_AUTH_TOKEN` | Verify Twilio inbound and send SMS | Required for Twilio |
| `TWILIO_FROM` | Optional fallback approved Twilio sender; the saved SMS sender field may be used instead | Optional if saved in Integrations & channels |
| `RESEND_API_KEY` | Outbound email | Required for email send |
| `MAIL_FROM` | Verified sender address, e.g. `FloodBridge <alerts@example.org>` | Required for email send |
| `OPENAI_API_KEY` | AI incident triage | Optional |
| `OPENAI_TRIAGE_MODEL` | Model name available to the organisation's OpenAI project; default is `gpt-5-mini` | Optional |
| `ORS_API_KEY` | OpenRouteService directions | Optional |
| `SOCIAL_WEBHOOK_SECRET` | HMAC signature for a third-party social webhook bridge | Optional |
| `RATE_LIMIT_PEPPER` | Secret salt for public intake and status-lookup rate-limit IP hashes | Required for public reporting and status lookup |

Example CLI command (replace each placeholder with the organisation's actual values; do not commit the resulting command history or `.env` file to a public repository):

```bash
supabase secrets set \
  USSD_WEBHOOK_SECRET="LONG_RANDOM_SECRET" \
  SENDGRID_INBOUND_SECRET="LONG_RANDOM_SECRET" \
  META_VERIFY_TOKEN="LONG_RANDOM_SECRET" \
  META_APP_SECRET="META_APP_SECRET_FROM_META" \
  META_GRAPH_VERSION="vXX.X" \
  SOCIAL_WEBHOOK_SECRET="LONG_RANDOM_SECRET" \
  RATE_LIMIT_PEPPER="LONG_RANDOM_SECRET" \
  TWILIO_ACCOUNT_SID="AC..." \
  TWILIO_AUTH_TOKEN="..." \
  TWILIO_FROM="+..." \
  RESEND_API_KEY="re_..." \
  MAIL_FROM="FloodBridge <alerts@example.org>" \
  OPENAI_API_KEY="sk-..." \
  OPENAI_TRIAGE_MODEL="gpt-5-mini" \
  ORS_API_KEY="..."
```

Only set secrets for services the organisation has approved. Keep them in a password manager and rotate them if exposed. `RATE_LIMIT_PEPPER` is required for public website reports and community status lookups. Each inbound provider is accepted only while its matching channel is enabled in Integrations & channels. Disabling a channel blocks intake at FloodBridge, but the organisation should also switch off its callback at the provider. The notification channel must be enabled before outbound messages can be sent.

## 6. Deploy the backend functions

Install the Supabase CLI, sign in, and link the local project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy
```

The included `supabase/config.toml` leaves JWT verification enabled for staff-only functions and disables the gateway JWT check for provider webhooks/public intake. Those public functions perform their own validation: public intake uses a server-side peppered IP rate limit; USSD/email use high-entropy shared callback tokens; Meta uses webhook signature verification; the generic social bridge uses HMAC-SHA256; Twilio validates `X-Twilio-Signature`. Do not remove those checks.

If the project already has a `supabase/config.toml`, merge the function sections rather than overwriting unrelated project settings. Confirm deployment for each function in the Supabase Dashboard.

## 7. Configure provider callbacks

### USSD — Africa's Talking

1. Apply for and receive an actual shortcode/service code from Africa's Talking; the code cannot be created by typing it into FloodBridge.
2. In FloodBridge → Integrations & channels, save the assigned shortcode and provider label; this enables the channel in the application.
3. Copy the USSD callback URL. Replace `YOUR_USSD_WEBHOOK_SECRET` with the exact `USSD_WEBHOOK_SECRET` value saved in Supabase Edge Function Secrets.
4. Add that HTTPS URL as the USSD callback URL in the Africa's Talking dashboard and use its test/sandbox environment first.
5. Test a complete menu session and confirm the report appears in Incident inbox with channel `ussd` and a reference ID.

The supplied menu records incident type, a landmark/location description, severity and a short description. Option 4 checks a report using its reference number. USSD does not provide GPS coordinates by itself.

### Email — Twilio SendGrid Inbound Parse

1. Choose a dedicated receiving subdomain such as `reports.example.org` and verify/authenticate the domain in SendGrid.
2. Configure the DNS MX record for that inbound subdomain to `mx.sendgrid.net.` with priority `10` (confirm the exact values in the current SendGrid account wizard and DNS host).
3. In FloodBridge → Integrations & channels, save the public reporting email, provider and receiving domain; saving enables the channel.
4. Copy the callback URL and replace `YOUR_SENDGRID_INBOUND_SECRET` with the `SENDGRID_INBOUND_SECRET` value in Supabase.
5. In SendGrid **Settings → Inbound Parse**, add the receiving hostname and the callback URL. Send a test email and check Incident inbox.

SendGrid's inbound parser sends a POST containing sender, subject and parsed message fields to the callback. The V2 handler creates an unverified incident from the email content. When the notification channel, operations email and Resend credentials are configured, new reports can also trigger an email alert to the organisation. The inbound handler does not automatically store large email attachments as evidence; retain the source mailbox according to organisational policy.

### Facebook, Instagram and WhatsApp — Meta

1. Create or use the organisation's Meta developer app and connect the appropriate verified business assets.
2. In FloodBridge save the Facebook Page, Instagram Business profile and WhatsApp Business number.
3. Save the social / Meta channel in FloodBridge → Integrations & channels so the backend marks it enabled. Set the Meta callback URL copied from FloodBridge and use the exact `META_VERIFY_TOKEN` from Supabase as the webhook verify token.
4. Subscribe only to the required message fields/products, complete Meta's app review / permissions where required, and configure the app secret as `META_APP_SECRET`.
5. For outbound WhatsApp, also set `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` and the Graph version currently supported by the app.
6. Test with approved test accounts and verify incident receipt in FloodBridge.

Social-profile URLs alone do not grant private-message access. Instagram and Messenger ingestion requires eligible account types, connected assets, permissions and webhook subscriptions. WhatsApp uses the Meta Cloud API payload. The app does not scrape social profiles or bypass platform permissions.

### X / other social networks

The social page URL is stored as organisation information. Native X DM ingestion is not activated merely by saving an X profile URL; it requires the organisation's currently eligible X developer API product and permissions. A third-party automation or integration service can forward supported messages to the signed generic bridge at `social-webhook?org_id=...` with a JSON body such as:

```json
{"messages":[{"channel":"x","from":"@community_user","text":"Flooding near the market bridge","location":"Market bridge","id":"external-message-id"}]}
```

In FloodBridge, save and enable the separate **signed social bridge** setting. Sign the exact raw request body using HMAC-SHA256 with `SOCIAL_WEBHOOK_SECRET` and send the header `X-FloodBridge-Signature: sha256=<lowercase-hex-digest>`. The bridge rejects missing or invalid signatures. The organisation must verify that its automation provider and API access comply with platform terms.

### SMS / WhatsApp via Twilio

1. Save the SMS / notification channel in FloodBridge → Integrations & channels and enter the approved sending number / sender ID. This enables inbound Twilio messages and outbound notifications.
2. Configure the Twilio incoming message webhook to the Twilio callback URL shown in FloodBridge. Keep the full query string, including organisation ID.
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` in Supabase secrets.
4. Test an inbound SMS and an outbound SMS to an authorised test recipient. Inbound webhooks are validated using Twilio's signature; the response is TwiML.
5. Twilio WhatsApp senders require their own WhatsApp-enabled configuration and policy-compliant message templates/consent as applicable. Meta Cloud API is a separate WhatsApp option.

### Outbound email

Verify the sending domain in Resend, then set `RESEND_API_KEY` and `MAIL_FROM`. Use Notification centre to send a test to an authorised test mailbox and check the provider message ID / log.

## Satellite observation reference

The Map & monitored sites page provides a direct link to NASA Worldview's near-real-time MODIS flood layers. No FloodBridge API key is required for this reference link. NASA describes the MODIS product as an optical observation product; it cannot detect water beneath persistent cloud cover. The display is supplementary context only and is not automatically intersected with local road segments, incident reports or response tasks. Use field verification and competent local-authority information for operational decisions. See [NASA Worldview Flood](https://worldview.earthdata.nasa.gov/?tr=flood-product) and [NASA's product description](https://www.earthdata.nasa.gov/data/instruments/modis/near-real-time-data/modis-nrt-flood-product).

## 8. AI triage and route calculation

- **AI triage:** set `OPENAI_API_KEY` and, optionally, `OPENAI_TRIAGE_MODEL`. Editors/admins can request triage on an incident. The response is stored as an advisory suggestion and requires human review. It is not an official severity assessment or automatic dispatch decision.
- **Road routes:** set `ORS_API_KEY`. Route analysis returns a baseline road-network distance and duration. The current route planner does **not** polygon-mask all flooded road segments or guarantee a flood-safe detour. It separately lists open geo-tagged incidents for human review. Do not use it as the sole basis for a travel decision.

## 9. Publish the website

1. Extract the release ZIP and upload all of its top-level contents to the repository root (not an extra enclosing folder).
2. Confirm `index.html`, `community.html`, `config.js`, `v2-modules.js` and `supabase/` are in the release root.
3. Enable GitHub Pages with the provided workflow or publish the root directory on an HTTPS static host.
4. Open `index.html`, sign in and complete organisation setup.
5. Share the `community.html?org_id=...` URL from the Community access page only after the public intake and status-check Edge Functions are deployed and configured. Community members can use their reference to check status, but the lookup reveals only status and verification state.

## 10. Acceptance test before real use

- [ ] Run the migration in staging and confirm all expected tables / RLS policies exist.
- [ ] Confirm users can sign in and cannot read another organisation's data.
- [ ] Confirm Viewer cannot add/modify incidents, tasks or integration settings.
- [ ] Submit one public website report, see it appear as unverified, and check its status using the reference number.
- [ ] Submit two similar reports for the same location and confirm the second is flagged for human duplicate review rather than discarded.
- [ ] Configure an operations email and confirm automatic Resend incident-alert delivery.
- [ ] Submit a complete USSD test session and verify its report.
- [ ] Send a test email to the inbound address and verify its report.
- [ ] Send a test Meta / Twilio webhook from provider test tools and verify signature handling.
- [ ] Test AI triage and confirm it remains advisory.
- [ ] Calculate a test route and confirm the warning that it is not flood-safe.
- [ ] Send a provider test notification to a consenting test recipient.
- [ ] Review incident privacy notice, data retention, escalation, backups, access control and incident-response procedures with the organisation.
- [ ] Train staff and publish written standard operating procedures before live incident operations.

## 11. Operational boundaries

FloodBridge is an evidence and coordination aid. It is not an official public warning authority, emergency dispatch service, rescue guarantee, hydrological gauge certification or road-safety certification. Community messages can be false, duplicated, delayed or inaccurate. Verify information through trained staff and official sources. Never ask community members or staff to enter floodwater or approach dangerous crossings to verify reports. The organisation remains responsible for lawful processing, security, data retention, safeguarding, staff training and response decisions.
