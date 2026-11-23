# FloodBridge V2 — start here

This release is designed for one institutional deployment. It is **software-ready, not pre-connected**: the organisation must own and configure its cloud and provider accounts. Do not place passwords or API secrets in the website.

## Choose the database path

- **Brand-new Supabase project:** run `supabase/schema.sql` in the SQL Editor, then run `supabase/migrations/202611230001_institutional_v2.sql`.
- **Existing FloodBridge V1.1 Supabase project:** take a backup, test first in a staging project, then run **only** `supabase/migrations/202611230001_institutional_v2.sql`. Do not rerun the V1.1 schema on a live database.

## One-time setup order

1. Create the Supabase project in the region approved by the organisation.
2. Apply the correct database path above.
3. Put the project URL and public anon / publishable key in `config.js`. The `publicOrgId` can be filled after the organisation is created.
4. Install the provider secrets listed in `supabase/secrets.example.env` through Supabase Edge Function Secrets (the example file contains blank placeholders only).
5. From this folder, deploy the Edge Functions with the Supabase CLI: `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase functions deploy`.
6. Publish the contents of this folder to the root of the HTTPS website. GitHub Pages deployment is included in `.github/workflows/pages.yml`.
7. Create the initial staff account, create the organisation, and keep the admin/join codes under institutional control.
8. In **Integrations & channels**, enter the organisation's actual shortcode, email address, social handles, phone sender and operations email. Save and enable each channel.
9. Copy the generated callback URLs, replace the visible token placeholders using the matching Supabase secrets, and register those URLs in each provider dashboard. Add DNS records where required.
10. Run every acceptance test in `DEPLOYMENT-V2.md` in a controlled pilot before real incident operations.

## Important go-live facts

- Entering a USSD shortcode does not provision it. The telecom provider must assign it and register the FloodBridge callback.
- Entering an email address does not create a mailbox or receive mail. The configured inbound provider and DNS / parse webhook must forward messages to FloodBridge.
- Entering Facebook, Instagram, X or WhatsApp profile links does not grant private-message access. Connected accounts, permissions and webhook registration are required.
- API keys and signing secrets belong in Supabase Edge Function Secrets, never in `config.js` or GitHub Pages.
- AI triage is advisory. Routes are baseline road-network results, not flood-safe routes. Community reports remain unverified until reviewed.
- For an organisation already using V1.1, preserve and back up its existing data before applying the V2 migration.

See `DEPLOYMENT-V2.md` for provider-specific instructions, security notes and acceptance tests.
