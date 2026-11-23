# Changelog — FloodBridge V2

## 2.0.0 — Institutional Edition

- Retained V1.1 site, observation, asset, rainfall, sensor and offline-first records.
- Added unified cloud incident inbox with verification, status management, geolocated incident map, and CSV export.
- Added public community reporting portal, rate-limited reference-number status lookup, and central intake Edge Functions.
- Added same-location / similar-description duplicate-review flags; potential duplicates are retained rather than discarded.
- Added optional automatic Resend email alerts to the organisation operations address for new incidents.
- Added configurable USSD, inbound email, Meta/social, Twilio SMS/WhatsApp webhook adapters.
- Added notification dispatch adapters for Resend, Twilio and Meta WhatsApp Cloud API.
- Added AI-assisted incident triage and OpenRouteService baseline route calculation.
- Added response task assignment to organisation staff members, due dates, priority and status.
- Added organisation profile, channel enable/disable, integration readiness, message log and full data export.
- Added an in-app link to NASA Worldview near-real-time MODIS flood observations with explicit cloud-coverage and verification limitations.
- Added database mutation audit records, server-side public intake rate limiting, provider callback validation, and deployment documentation.

## 1.1

- Existing V1.1 production foundation and ESP32 telemetry retained.
