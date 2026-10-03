# Pran Rekha — combined implementation roadmap

Sources: `health_plan.md`, `pranrekha_system_specification.txt`, and the accepted combined plan. Preserve both source documents; this file resolves conflicts and tracks delivery.

## Decisions

- Next.js App Router frontend; Express, SQLite and shared Zod/domain packages retained.
- Patient, paramedic, hospital and lab portals with authenticated authority independent of navigation.
- ESP32 DevKit + RC522 over local Wi-Fi/HTTPS replaces Web NFC. UID is a revocable locator, never a credential.
- SQLite is authoritative. Zustand holds UI state; localStorage holds language/preferences only.
- Patient reports remain separately attributed. Facility signatures prove demo record integrity, not accreditation.
- Historical blood groups and allergies retain evidence and review notices; no treatment directives.
- Six-month freshness is a review schedule, never prescription activity or clinical validity.
- Synthetic data only. No public deployment, purchases, real payments or institutional integration.

## Delivery stages and mapping

| Stage | Sources | Acceptance | Status |
|---|---|---|---|
| Foundation / Next.js / sessions | Health §§8–11; system §2 | migration, restoration, roles, CSRF, throttling, build | In progress |
| Records / medication / signatures | Health §§4,6,7; system lab portal | private intake, exact sources, lifecycle, signature checks | In progress |
| Releases / grants / receipts | Health §5 | positive projection, expiry, revocation, audit-before-response | Pending |
| RFID / paramedic / hospital | System portals 2–3; accepted RFID choice | deduped scans, paired reader, persisted authorized dispatch, SSE | Pending |
| Patient / offline / localization | Health §§3,8,10; system portal 1 | encrypted prepared snapshot, local receipt, dictionaries | Pending |
| Face / bookings / ledger | Health §5.2; system portals 1,4 | labelled candidate-only simulation, simulated booking, integer ledger | Pending |
| Optional adapters | Health §2.3 | OCR/passkeys/reviewed aliases/FHIR when prerequisites exist | Not verified |
| Integrated verification | Health §§13–15 | API/browser/offline/protocol tests and built runtime smoke test | Pending |

## Required contracts and safeguards

Extend shared contracts for facilities, paramedics, signed records, reviews, releases, grants, excerpts, receipts, reader events, dispatch, appointments and ledger. Mutations require request IDs and optimistic revisions. Bind actor/facility from sessions. Commit receipts before clinical disclosure. Restrict ER alerts to their destination. BroadcastChannel carries opaque refresh identifiers only.

Preserve claims, original medication strings, date precision and source versions. Effective time orders medication events; ambiguity remains conflict; end dates bound validity. Uploads: 10 MiB, 10 PDF pages, 10 documents/patient, bounded candidates, private storage and ownership checks.

Offline: signed device-bound allowlisted snapshots, eight-hour expiry, ten-minute unlock, PBKDF2/AES-GCM, in-memory keys, IndexedDB receipt before display, idempotent receipt sync, visible freshness/revocation limits. BS conversion remains unavailable until 30 independent pairs are verified.

RFID: versioned device-authenticated events `{deviceId,eventId,tagUid}`; HTTPS certificate verification; duplicate retry acknowledgements; revocable reader/tag mappings; no patient information in scanner responses. Real hardware acceptance requires the assembled ESP32/RC522.

## Verification and handoff

Record actual results in `docs/QA_RESULTS.md` and physical checks in `docs/DEVICE_MATRIX.md`. Test unauthorized/forged/cross-patient access, exclusions, audit failure, signature tampering, conflicts, idempotency, reader revocation, reconnect, invalid snapshots, source intake and the complete lab→release→RFID→dispatch→hospital→receipt journey.

Provide runnable startup, fixture accounts, firmware wiring/provisioning, HTTPS preparation, scoped reset and rehearsal instructions. Never mark hardware, native-language, clinical or external-delivery checks complete without evidence.
