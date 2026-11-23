# FloodBridge data dictionary

| Entity / field | Meaning |
|---|---|
| Site `id` | Local unique monitored-site ID |
| Site `name`, `type` | Site label and category |
| Site `lat`, `lon` | WGS84 location |
| Site `datum` | Optional surveyed local gauge datum reference |
| `watchLevel`, `alertLevel`, `actionLevel` | Optional site thresholds; must be supplied by competent authority |
| Observation `id` | Unique observation ID |
| Observation `type` | Crossing, water level, flood extent, drainage or damage |
| `siteId` | Linked monitored site, if known |
| `passability` | Reported clear / caution / blocked / unknown; not an official status |
| `depthCm` | Road water depth only when safely and validly measured |
| `stageM` | Water level relative to a documented local datum |
| `source` | Community, trained field team, device, manually attributed official bulletin |
| `lat`, `lon` | WGS84 observation coordinates |
| `observedAt` | Time the observation was made |
| `observer` | Optional pseudonymous observer code |
| `notes` | User's observations and limitations |
| Asset `dependency` | Manually configured crossing site linked to an essential-service asset |
| Telemetry `distance_cm` | Sensor-to-water surface distance, if valid |
| Telemetry `stage_m` | Gauge-relative stage, only if sensor mounting height was surveyed |
| `receivedAt` | Browser receipt time; not necessarily sensor creation time |

## Status interpretation
- Fresh: within 120 minutes in this prototype.
- Aging: over 120 and up to 360 minutes old.
- Expired: over 360 minutes old.
These are interface defaults, not universal flood-report validity periods. Pilot teams must configure periods by hazard, site and operational context.

## V2 institutional tables

| Table | Purpose | Important fields |
|---|---|---|
| `fb_org_profiles` | Institution identity / coverage settings | `org_id`, `data`, `updated_at` |
| `fb_channels` | Public provider details and channel state (never secrets) | `org_id`, `channel_key`, `provider`, `config`, `enabled`, `status` |
| `fb_incidents` | Normalised incident reports from public and connected channels | `incident_ref`, `channel`, `category`, `severity`, `location_text`, `latitude`, `longitude`, `description`, `status`, `verification_status`, `ai_triage`, `source_payload` (including optional `duplicate_review` hint) |
| `fb_response_tasks` | Action and assignment tracking | `incident_id`, `title`, `assigned_team`, `priority`, `due_at`, `status`, `outcome` |
| `fb_messages` | Inbound/outbound message log, including automatic incident email alerts | `direction`, `channel`, `sender`, `recipient`, `provider_message_id`, `delivery_status`, `incident_id` |
| `fb_audit_log` | Audit trail for incident and response-task mutations | `actor_id`, `action`, `entity`, `record_id`, `created_at` |
| `fb_public_rate_limits` | Server-side public intake rate limit counter | `ip_hash`, `window_started_at`, `hit_count` |

`fb_channels.config` contains non-secret account identifiers, URLs and sender labels only. Provider passwords, access tokens, API keys and webhook secrets must be stored in Supabase Edge Function Secrets. `fb_incidents.source_payload` contains provider message metadata and should be subject to the organisation's retention and privacy policy.
