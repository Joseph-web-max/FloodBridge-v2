# FloodBridge V2 — release validation record

**Release:** 2.0.0 · **Prepared:** 23 November 2026

## Checks completed on the release files

- Main `index.html` and `community.html` parsed; no duplicate element IDs were found.
- Inline JavaScript in both HTML pages passed Node.js syntax checks.
- `v2-modules.js` passed Node.js syntax validation.
- All Supabase Edge Function TypeScript files passed a static TypeScript compile check with Deno runtime declarations.
- Local documentation links and release file references were checked.
- Added and checked the in-app NASA Worldview satellite flood-observation reference and its cloud / decision-support limitations.
- The release ZIP was integrity-tested after creation.

## Checks that require the organisation's environment

These have **not** been represented as completed because the release author does not have the organisation's cloud project, production domain, accounts or API credentials:

- Applying the SQL migration to a real Supabase project and confirming policies against that project's current schema.
- Deploying and invoking the Edge Functions in the organisation's Supabase environment.
- End-to-end USSD tests with an assigned shortcode and provider callback.
- Inbound email tests with a verified receiving domain, MX record and SendGrid Inbound Parse configuration.
- Meta / WhatsApp / Instagram / Facebook webhook verification and permission review.
- Twilio inbound and outbound message tests; Resend email delivery tests.
- OpenAI and OpenRouteService calls using organisation-owned API keys.
- GitHub Pages publication to the organisation's existing repository.

## Go-live condition

FloodBridge V2 is a consolidated application and backend release, not a claim that the organisation's third-party services are already connected. Follow `START-HERE.md` and `DEPLOYMENT-V2.md`, run the acceptance checklist in a staging environment, verify data access and backups, and obtain the organisation's operational sign-off before relying on it for real flood response.
