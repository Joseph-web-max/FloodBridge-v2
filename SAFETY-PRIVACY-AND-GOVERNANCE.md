# Safety, privacy and governance — FloodBridge V2

## Intended use

FloodBridge supports evidence collection, incident triage, response task tracking and essential-service access planning. It is not an official warning service, emergency dispatcher, rescue guarantee, hydrological certification tool or road-safety authority.

## Community reporting

- Explain why reports are collected and which organisation receives them.
- Keep reporter name and contact optional unless follow-up is operationally necessary.
- Avoid collecting information about children, medical conditions, immigration status, exact household locations or other sensitive details unless a lawful and approved operational need exists.
- Do not promise that submitting a report will result in a response or rescue.
- Provide alternative contact instructions for immediate danger and local emergency services.
- Keep incident details limited to authorised staff; review retention and deletion periods.

## Verification and AI

- All community-originated incidents are unverified by default.
- Verify information through trained staff, safe field procedures and official sources.
- AI outputs are advisory. An authorised person must review all suggested category / severity / next actions.
- Never use AI to autonomously issue public warnings, dispatch rescuers, close roads, certify safety or infer a person's identity.

## Physical safety

- Never enter floodwater or approach an unsafe bridge / river to collect evidence.
- Do not ask community reporters to take measurements in dangerous locations.
- Sensor installations require a competent team, surveyed reference datum, safe-work plan and appropriate equipment. The included ESP32 node is a demonstration component, not a certified gauge.
- A baseline road route is not necessarily usable during floods. Confirm road condition and closures with the relevant authorities before travel.

## Security

- Store all API keys and signing secrets in Supabase Edge Function Secrets or the provider's approved secret manager.
- Never commit a service-role key, provider token or webhook signing secret.
- Use MFA where available, least-privilege roles, staff offboarding, join-code rotation and periodic access review.
- Test callback signature validation and secret rotation before production rollout.
- Apply provider rate limits, monitoring, backup, incident-response and breach-notification processes.

## Organisational responsibilities

The deploying organisation is the data controller / responsible operator for its use. It must determine applicable privacy law, publish a privacy notice, establish lawful basis and consent where required, agree data-sharing arrangements, train staff, establish escalation procedures, maintain retention schedules, secure accounts and approve go-live. This software package is not a legal compliance certification.
