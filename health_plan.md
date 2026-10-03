# Pran Rekha — Patient records and emergency access

## Hackathon build specification and agent runbook

Date: 2 October 2026  
Theme: Health — Ullens Hackathon 2026; confirm the organiser's exact track name.  
Status: Specification complete; application implementation, clinical review, and device testing remain to be done.  
Build window: 36 hours, 3–4 people, final 15% reserved for verification and rehearsal.  
Basis: OpenCode session `ses_f036dc824ffeOboqMQlmtGp9qd`, including its recorded question answers and the later medication request.

This is a separate project from `edu_plan.md` and `biz_plan.md`. It shares their structure: thesis, scope lock, explicit evidence boundaries, deterministic rules, contracts, gates, acceptance checks, and an event-day runbook. Their product rules and unverified claims do not carry into this project.

**How to use this file.** Read §1–§3 first, freeze the contracts and invariants in §4–§10, then build through §12. Section 13 defines acceptance; §15 is the stage script; §20 contains copy-ready implementation prompts. Repository paths and commands below describe the future application, not files or scripts already implemented by this planning task.

---

## 1. Product and thesis

Help a person keep prescriptions, reports, discharge summaries, and family contacts from multiple providers in one patient-controlled record. Give an authorised emergency clinician a small, source-linked summary when the person cannot explain their history.

**Pitch:** Your health history travels with you, even when you cannot speak for yourself.

**Design thesis:** separate what a source reports, how the source was obtained, and what the patient is experiencing now. A stored record supplies context. The treating team decides which present-day assessments and tests are needed.

The memorable interaction is a face scan that suggests a locally enrolled candidate, followed by an authorised, scoped access step. The useful output is an emergency card with medication history, recorded allergies, conditions, and an emergency contact, each showing its source and date.

### 1.1 Name and audience

Working name: **Pran Rekha**. Confirm native-speaker wording, any future native-script rendering, and name availability before public branding. No government affiliation is implied.

Primary users are patients and their chosen caregivers. The second interface serves a clinician at an enrolled demonstration clinic. Patient, caregiver, clinician, and administrator are distinct actors; selecting a UI tab does not grant a role.

Hypothesis: a compact record with provenance can make relevant history easier to find. The hackathon can measure retrieval time and correctness against synthetic fixtures. It cannot establish improved clinical outcomes, fewer tests, biometric reliability, or readiness for hospital use.

### 1.2 Decisions recovered from the conversation

| Decision | Recorded choice | Consequence |
|---|---|---|
| Main demonstration | Face scan as headline; NFC secondary | Give face a visible stage moment; build the credential path first |
| Devices | Phone and clinic machine, offline-first | Prepare and test both devices; define what is available locally |
| Deliverable | Full house-format plan | Twenty sections, types, API table, checks, risks, and agent prompts |
| Team and time | 36 hours, 3–4 people | One end-to-end flow; use gates and cuts |
| Additional pillar | Medication data and current prescription | Separate prescription evidence, lifecycle, and reported use |

### 1.3 Corrections to the earlier analysis

The prior session developed a substantial outline but stopped before creating the file. It also contained contradictions that this specification resolves:

| Earlier proposal | Resolution in this specification |
|---|---|
| Two sources imply `RELIABLE_ENOUGH_TO_ACT` | Show documentary corroboration only; no treatment clearance label |
| One strong factor sometimes sufficient, elsewhere two required | Use the explicit access matrix in §5; avoid an ambiguous generic 2-of-N rule |
| Face narrows thousands with no enrolled biometric store | Local, consented, in-memory demo gallery only; no national search claim |
| No biometric storage anywhere, yet repeat identification | Session-local enrollment is explicit; raw captures and embeddings are cleared at session end |
| NFC tag treated as strong identity proof | Ordinary tag/QR holds a copyable locator; clinical access requires the independent actor and patient-link gates |
| No stop date means active medication | Lifecycle stays `unknown`; separate current-use reports carry their own source and date |
| Stopped drug shown in an active count | Current, uncertain, and historical panels are separate |
| Penicillin versus amoxicillin called an exact-string match | No class inference; the optional text check matches only identical text or reviewed exact aliases |
| Hidden-condition names/counts disclosed by the withholding notice | Always show the same generic completeness notice, without excluded counts or category names |
| All clinical dates converted to UTC | Preserve date-only and uncertain dates; only actual timestamps become UTC |
| Offline access means any record on any device | Only prepared local records/snapshots are available; unavailable records produce an explicit state |
| Claimed emergency numbers and legal scope | Remove unchecked directory entries and broad legal assertions; primary references are in §18 |

---

## 2. Scope lock

This section is authoritative for scope. Section 5 is authoritative for access; §6 for medication derivation; §7 for evidence labels. Changes must update the relevant contract, acceptance check, and demo copy together.

### 2.1 The memorable moment

1. An enrolled demo participant faces the camera. The screen shows “Possible local match. Record remains locked.”
2. The clinician is already signed into a provisioned demo account. They scan the NFC/QR locator, confirm the patient linkage with the demo workflow, and enter an access reason.
3. A limited emergency card opens from the local store. It shows source-linked recorded allergies, reported medication use, uncertain prescription status, and a permitted contact.
4. A conflicting value stays visibly conflicting. The clinician can open its two source excerpts.
5. The patient later sees the access receipt. The same card opens on a prepared phone with internet and local networking disabled.

Target: card render within four seconds **after** the final access check on the presentation device. This is a benchmark to measure, not an established result or a deadline for emergency care.

### 2.2 Mandatory content

- One main synthetic patient plus a second synthetic identity for collision and access-isolation tests.
- Three core synthetic documents from two fictional providers: a discharge summary, lab report, and prescription; a correction/addendum supplies lifecycle changes.
- JPEG/PNG and text-PDF intake, with manual source selection and field confirmation as the reliable path. OCR is optional assistance.
- Patient timeline, document library, emergency card, prescription history, reported-current-use panel, consent settings, and access receipts.
- Nepali-first UI with English toggle, Devanagari text/numerals, and BS/AD date support within a verified conversion range.
- Authenticated actors, patient-specific grants, scoped responses, revocation checks when connected, and an auditable access decision.
- Face-candidate interface; a live local matcher only if its device and privacy gate passes. A simulation remains visibly labelled.
- NFC locator on compatible hardware; QR/manual locator fallback in the same workflow.
- Offline clinic operation and a prepared phone snapshot. The two offline modes have distinct trust and freshness limits (§8).
- Deterministic evidence labels and medication derivation; no AI call in the emergency read path.
- Source and mode badges per item: synthetic/live upload, manual/OCR candidate, and independently reviewed/not reviewed.

### 2.3 Stretch, in order

1. Live OCR of clean Nepali printed reports, evaluated against a transcription fixture.
2. Passkey sign-in for provisioned patient/clinician actors; platform fingerprint verification if available.
3. Reviewed exact drug aliases and the limited text-overlap check.
4. Connected break-glass workflow with review queue and notification outbox.
5. Patient-approved FHIR sample export, validated against a chosen version/profile.
6. Additional caregiver collaboration, a reviewed entitlement-document panel, or lab history plotting.

### 2.4 Hard exclusions

| Excluded | Boundary |
|---|---|
| Diagnosis, triage, treatment selection, interaction/severity scores, dose calculations | Present attributed records and their limits |
| Replacing current assessment, testing, or blood compatibility procedures | Historical context never authorises a treatment |
| Hospital integration, national identity search, EMR write-back | Import documents supplied for this patient; future integrations need agreements and interfaces |
| Fingerprint identification of an unconscious stranger using a phone sensor | Standard browser authentication is credential verification, not arbitrary fingerprint lookup |
| Central face gallery or uploading biometric templates | Face demonstration is limited to explicit session-local enrollment |
| Automatic patient merge or automatic medication reconciliation | Similar names/drug strings are insufficient |
| Real patient data, real clinician credentials, real hospital branding in fixtures | Use clearly fictional data and local demo actors |
| Public deployment or operational clinical use during this task | This deliverable is a plan; event deployment requires its own stated scope |
| Nationwide availability, legal compliance certification, quantified clinical benefit | No evidence exists for those claims in this prototype |

---

## 3. End-user journey

### 3.1 Patient and caregiver

1. Open the patient workspace. Add Nepali and English names as entered, a date-of-birth value with its precision, and an optional contact.
2. Invite or select a previously provisioned caregiver with explicit patient-specific permissions. A contact does not automatically become a proxy.
3. Upload a document, name the stated provider, and confirm which patient it belongs to. A printed hospital name does not authenticate its issuer.
4. Select a passage or image region; confirm extracted text and dates. Preserve the original document and the verbatim prescription strings.
5. Review the timeline and medication panels. Add an attributed use report, stop event, or correction through the appropriate form.
6. Select records and contact fields that may appear in the emergency summary. Preview exactly what a clinician will see.
7. Prepare an offline snapshot on an enrolled device. The screen shows its creation time, expiry, included scope, and offline limitations.
8. Review access receipts and revoke connected grants or replace a lost card locator. Explain that an already-disclosed copy cannot be remotely unread.

### 3.2 Emergency clinician

1. Sign in as a provisioned clinician. Confirm clinic/device context.
2. Use face candidate matching, NFC/QR lookup, or a registered proxy to help locate the patient. These are separate inputs to the access workflow.
3. Confirm linkage to the patient under the demo policy, enter the reason, and request the limited emergency scope.
4. Read the card: identity banner, recorded allergies, medications, conditions, contact, source dates, and completeness notice.
5. Expand only authorised evidence. A withheld claim's source document must not become a side door to excluded material.
6. Close or let the session expire. The card clears from the UI; reopening requires another access decision and receipt.

### 3.3 Presentation and accessibility

Use a compact clinical dashboard rather than a marketing landing page. Emergency information sits above the fold. Dates and source labels remain visible without hovering. Red/amber/green never carry meaning alone. All scan fallbacks, language switching, consent, and source inspection work by keyboard. Support a 360-pixel phone viewport, 200% zoom, screen-reader labels, and reduced motion. Avoid patient information in document titles, browser notifications, or analytics.

---

## 4. The record model

### 4.1 Claims and source evidence

A claim is an immutable assertion linked to an immutable source version. Its minimum context is: patient, kind, value as recorded, clinical date, record time, source locator, submitter, stated issuer, verification status, and disclosure policy.

There are two allowed source forms:

- **Document source:** exact text span or image bounding box with page, content hash, and source version.
- **Attestation source:** a saved, versioned statement by a patient, caregiver, or clinician. The claim points to a field or span in that statement. Manual entries never masquerade as hospital documents.

A resolvable source reference proves traceability; it does not prove that the source is true, belongs to the right person, or was transcribed correctly. Confirmation checks patient linkage and text, and records the reviewer. Clinical review is a separate attribute.

### 4.2 Import and confirmation pipeline

`upload → validate → preserve original → extract candidate text → select source → confirm patient/date/value → persist claim → derive views`

Prototype limits: 10 MiB per file, 10 pages per PDF, 10 files per patient, 100 proposed fields per job. These are build limits, not clinical recommendations. Validate actual type and size, reject active content, and serve originals through an authorised handler rather than a public static directory.

Image-only PDFs or failed OCR fall back to manual annotation. The user sees which pages were processed; nothing is silently skipped. Text excerpts use UTF-16 code-unit offsets into a versioned extraction string; image regions use normalised coordinates in the displayed, orientation-corrected page. Store the orientation transform with that page rendition.

Candidate extraction returns data only. Treat document instructions as untrusted content; the parser has no tools, external fetches, or authority to change roles. AI output is schema-validated, bounded, and presented for human confirmation. At most one retry/repair per failed job. After interruption, mark the job failed and make retry explicit.

### 4.3 Corroboration and conflict

Deduplicate identical files by SHA-256 **within the patient/workspace**. A duplicate upload does not add corroboration. Preserve its import receipt without making a second clinical source.

Count originating evidence groups, not files or uploads. Reprints, translated copies, and a discharge note copying a lab result share a lineage when known. For the conservative demo count, multiple records from the same organisation contribute at most one origin. Different organisations are not automatically independent if they copied the same evidence.

Display “2 distinct documented origins; independence not established” unless lineage has been reviewed. An organisation name typed by a patient stays “issuer as stated.” Do not automatically turn it into an authenticated provider.

Conflicts remain visible with both values and sources. A third agreeing entry never wins a vote. Exclude an erroneous claim only through a sourced retraction/correction that preserves the original history. Same-kind values from different dates may represent change rather than conflict; only compare compatible concepts, units, and relevant intervals. Unclear comparability gets an uncertainty label.

### 4.4 What the record cannot establish

| Source | Directly supports | Does not establish |
|---|---|---|
| Prescription | What was prescribed on a date | Dispensing, adherence, current use, or suitability today |
| Patient/caregiver statement | What that person reported | Independent clinical confirmation |
| Lab document | A historical reported result and printed range | Current physiology or an automatic diagnosis |
| Discharge summary | The clinician's documented history at discharge | A complete current medication list |
| Emergency contact | A permitted contact relationship | Legal authority to disclose all records |
| Face candidate/NFC locator | A possible link to an enrolled record | Correct identity or permission by itself |

---

## 5. Emergency access model

### 5.1 Two gates, separately evaluated

Every clinician read needs **actor authorisation** and **patient linkage plus an applicable grant**. Face matching is a candidate aid outside these gates. This replaces the session's inconsistent “one strong or two weak” formula.

| Path | Actor gate | Patient-link/grant gate | Result |
|---|---|---|---|
| Patient workspace | Authenticated patient | Own patient binding | Own authorised records |
| Caregiver workspace | Authenticated registered proxy | Active, scoped delegation | Delegated fields/actions only |
| Emergency, normal | Authenticated provisioned clinician | Locator or proxy linkage, explicit identity confirmation, active emergency release | Limited allowlisted summary |
| Face alone | None satisfied | Candidate only | No clinical response |
| NFC/QR alone | None satisfied | Copyable locator only | No clinical response |
| Face + NFC, no clinician session | Actor gate missing | Insufficient | No clinical response |
| Break-glass, stretch | Clinician plus reason and second authorised clinician | Resolved patient linkage and configured exception policy | Temporary limited emergency scope |
| Unknown patient or unresolved mismatch | Any | Failed | No record; normal clinical care continues outside the app |

The demo's identity confirmation is a human workflow on synthetic subjects; it is not validated identity proofing. An authorised staff member with a copied locator could misuse this workflow. Audit and role checks reduce exposure but do not solve that production threat. Production linkage requires a reviewed identity protocol and institutional governance.

### 5.2 Face: candidate generation only

Use a maximum of five explicitly consenting demonstration participants, enrolled on the presentation device at session start. Enrollment photos and embeddings live only in browser memory; clear them on logout, session expiry, and page close. Each person maps to a synthetic profile. No real health data is paired with their face. A fresh browser session requires enrollment again.

A live matcher needs an actual face-recognition embedding model plus local comparison. Face detection or landmark tracking alone does not establish identity. Select and pin an implementation and its model licence only after checking the official model/package documentation at kickoff. Bundle required model assets locally and record their versions/hashes.

Candidate result states: `NO_MATCH`, `CANDIDATES`, `AMBIGUOUS`, `UNAVAILABLE`. Return at most three opaque candidate handles; more plausible candidates yield `AMBIGUOUS`. Avoid confidence percentages and the words “identity confirmed.” Two captures of one face are still one candidate aid. A mismatch with the scanned locator blocks that attempt until the operator restarts linkage.

**Demo deviation (hospital registration):** hospital staff registering a synthetic patient must capture one face photo with the participant's recorded consent. The JPEG (≤480 px) and its 128-value descriptor are stored in the demo SQLite database (`platform_objects`, kind `face`), readable only by hospital-demo clinicians; each photo view writes an access receipt, and `npm run demo:reset` deletes them. Matching still runs in the browser and still returns candidates only. This replaces the session-only rule for registered participants; session enrollment remains in-memory.

No liveness, anti-spoofing, population accuracy, or performance across demographic groups is claimed. If model setup or lighting fails, show the labelled simulation or use the locator path. Simulation cannot silently replace a failed live match.

### 5.3 NFC, QR, and fingerprint

NFC and QR carry an opaque, revocable, high-entropy locator; include no names, medical data, access token, or decryption key. Require an authenticated lookup and rate-limit unsuccessful attempts. A signed static payload can protect integrity but remains copyable; do not call it proof of possession of a secret.

Web NFC support must be tested on the exact Android/Chrome device. It exposes NDEF tags and does not supply general smart-card authentication. Desktop and unsupported phone browsers use QR or manual entry. NFC is an optional input transport over the same access policy. [Chrome Web NFC documentation](https://developer.chrome.com/docs/capabilities/nfc).

WebAuthn can verify a registered credential using the device's local user-verification mechanism. The application receives a cryptographic assertion, not fingerprint data, and generally cannot assume a specific biometric modality or a unique natural person on a shared device. It cannot scan an unknown unconscious patient's finger and search the record archive. Keep “fingerprint identification” outside this MVP; label any platform demo “device verification.” [W3C WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/).

### 5.4 Disclosure and inference

Emergency access uses a **positive per-record allowlist**, selected in the patient's preview. Unreviewed records default out. Restriction applies to values, medications, source snippets, attachments, filenames, search results, counts, and exports.

Use this same notice on every emergency card, including an empty card: “This summary may be incomplete. Information outside the selected emergency scope is not shown.” Do not disclose whether excluded records exist, their number, condition categories, or drug names.

A drug can imply a condition. The plan therefore does not rely on a blacklist of supposedly sensitive drug classes. The patient/reviewer explicitly approves each medication entry and excerpt for the emergency view. A full source page with excluded content is unavailable; serve an approved excerpt/crop only. If a safe excerpt has not been prepared, show “Source available through an authorised full-record review.”

This is a demonstration disclosure policy, not a universal clinical or legal rule. Production policy must address situations where incomplete history affects care. The UI always states the limits of the summary.

### 5.5 Grants, audit, and break-glass

Connected emergency grants expire after ten minutes in the prototype, bind actor/patient/device/scope, and carry a policy version. Requests check actor role, grant scope, revocation, expiry, and the requested object. Grant IDs and client flags alone never authorise access.

For each response, the trusted server selects the authorised projection and inserts an access receipt in the same database transaction. Send the response only after commit. If audit persistence fails, return no clinical payload. A committed receipt means the service made the disclosure available; it does not prove a human viewed it.

Record actor, patient ID, device, purpose, scope, policy version, resource-version IDs, request ID, outcome, server time, and snapshot ID if relevant. Avoid raw clinical values or tokens in logs. Every disclosure attempt, including a retry that returns data, is accounted for. Failed attempts have a separate security event with minimal details.

The application has no edit/delete endpoint for audit rows. SQLite and browser storage are not tamper-proof against their administrator. Hash chains can show some modifications but do not create independent immutability. Describe receipts as append-only at the application layer.

Break-glass is stretch and connected-only: resolved patient, provisioned clinician, reason, second clinician approval, five-minute expiry, review queue, and notification outbox. It may override a configured routine-consent requirement only within its allowed emergency scope; it cannot bypass identity checks or release excluded records. Notification delivery is recorded as pending/delivered/failed. Baseline demonstration uses preauthorised emergency release and does not depend on break-glass.

---

## 6. Medication and current prescription

### 6.1 Three separate objects

- **MedicationRecord:** immutable evidence of a prescription as written, including drug, dose, frequency, route, dates, and source.
- **PrescriptionView:** derived lifecycle state at an explicit `asOf` instant/date from the record and its events.
- **MedicationUseReport:** an attributed report of what the patient says they are taking, when it was reported, and any reported last dose. It never rewrites the prescription.

The screen heading may say “Current prescriptions and reported use,” but it must divide entries into documented active prescription, current use reported, needs reconciliation, and historical. A documented active prescription still does not prove ingestion. The default for an indefinite or undated prescription is `unknown` unless an explicit valid status assertion supports another state.

### 6.2 Append-only events

Events: `started`, `stopped`, `held`, `resumed`, `completed`, `dose_changed`, `substituted`, `status_confirmed`, `corrected`, and `retracted`.

Every event includes actor role, evidence source, effective clinical date, recorded timestamp, stream revision, and idempotency key. A caregiver can report stopped use, but cannot silently produce a clinician-issued discontinuation. Preserve both the report and the documented prescription state.

`dose_changed` and `substituted` link the old record to a new verbatim MedicationRecord. They do not edit strings in the old record. A correction/retraction points to one earlier event, states why, and supplies evidence. Retractions cannot erase audit history. Unclear chronology or contradictory events yield `conflict`, not latest-upload-wins.

### 6.3 Derivation table

| Evidence at `asOf` | Derived state | Display |
|---|---|---|
| Valid explicit stop for this prescription stream | `stopped` | Stopped; effective date and source |
| Explicit completion | `completed` | Completion documented |
| Documented end date passed, no contradictory event | `course_end_passed` | Documented course end passed; actual use unknown |
| Explicit hold with no valid later resume | `held` | Hold documented |
| Replacement linked by substitution | `superseded` | Replaced by linked prescription |
| Explicit start/status-confirmation, effective interval includes `asOf` | `documented_active` | Active in the cited record; last confirmation shown |
| No end/status information or date cannot be resolved | `unknown` | Current prescription status needs confirmation |
| Incompatible effective events or competing source instructions | `conflict` | Both sources; reconciliation needed |

This is a reduction over a single prescription stream with explicit relationships. Different prescriptions for the same drug stay separate until an authorised reconciliation event links them. Same-day events without a reliable order cannot override one another by ingestion order. Explicit end dates bound validity; a report after that date is a use report, not an automatic prescription extension.

### 6.4 Verbatim law

Store and display the original drug, dose, frequency, route, and duration text. Preserve “1-0-1,” “BD,” mixed-script numerals, and uncertain handwriting as recorded. Any transcription correction creates a new source/record version with the original retained.

Do not compute a dose, pill count, route, quantity, or course end from those strings. An explicit date may be compared with the date of review, but “five days” is not turned into an end date in this MVP. Keep `durationText` and mark the end date unknown. Optional translations appear beside, and never replace, the original prescription text; medication instruction translation is excluded until reviewed.

### 6.5 Drug identity and optional text overlap

Drug identity is verbatim-first. A small fixture-specific alias table may add a reviewed generic label with reviewer and version metadata. Use perhaps 10–20 entries if review is available; broad Nepal-market coverage is not an event task. Unresolved or ambiguous strings remain unresolved.

Optional exact-text overlap compares an allergy's recorded substance text with a medication name, or a pharmacist-reviewed exact-identity alias. It returns the matched text and source IDs only, labelled “Same recorded substance text; review the source.” It produces no contraindication, class relationship, severity, or treatment recommendation.

Use literal `amoxicillin` in both relevant synthetic source fields to exercise an exact match. `Penicillin` versus `amoxicillin` must **not** trigger a literal match or an unreviewed class mapping. No-match does not mean safe; the UI always says that interactions and allergy cross-reactivity are not assessed. Omit the entire optional check if it distracts from the core record workflow.

### 6.6 Required medication fixture cases

Include an explicitly active prescription, one with no current-status evidence, a stopped entry, a course whose documented end has passed, a held entry, an unresolved brand string, a caregiver-reported last dose, a linked dose change, and conflicting same-day instructions. Include an excluded medication and confirm that its name, category, and existence do not leak to the emergency response.

Every dose is fictional demonstration text, checked for exact copying rather than offered as a treatment regimen. External clinician/pharmacist review, if obtained, is logged honestly; absence of review does not block work on synthetic record software.

---

## 7. Evidence presentation engine

Use a frozen, versioned `EVIDENCE_RULE_TABLE`. This replaces the earlier `ACTIONABILITY_RULE_TABLE`; the engine classifies evidence handling, not clinical safety. Runtime clients and model output cannot supply or extend a rule.

### 7.1 Ordered rules

| Priority | Rule | Trigger | Result |
|---|---|---|---|
| 0 | Access projection | Record outside grant/allowlist | Exclude before derivation/serialization; generic completeness notice |
| 1 | Broken provenance | Missing, cross-patient, or invalid evidence | Reject claim commit; quarantine imported candidate |
| 2 | Unresolved contradiction | Incompatible values/events | `CONFLICT`; return authorised alternatives with evidence |
| 3 | Historical medication state | Stopped/completed/held/superseded/end passed | `HISTORICAL_OR_HELD`; show exact lifecycle reason |
| 4 | Missing context | Unresolved date, missing unit/range where needed, incomplete status | `CONTEXT_INCOMPLETE`; name what is missing |
| 5 | Documentary agreement | At least two reviewed independent origin groups with agreeing compatible assertions | `CORROBORATED_RECORD`; state count and provenance |
| 6 | Single/uncertain origin | Otherwise valid evidence | `RECORDED_CLAIM`; source and review status |

Flags are orthogonal to the main label: `HISTORICAL_INFORMATION`, `CURRENT_USE_UNCONFIRMED`, `SOURCE_NOT_AUTHENTICATED`, `RANGE_NOT_PROVIDED`, `DATE_UNCERTAIN`, `SUMMARY_INCOMPLETE`, and `BLOOD_GROUP_REQUIRES_CURRENT_CLINICAL_VERIFICATION`.

### 7.2 Hard presentation rules

- Every visible clinical field remains attributed and dated even when corroborated.
- Every blood-group display carries “Historical recorded blood group. Follow the treating service's required verification and compatibility procedures.” A conflict adds a warning; agreement never suppresses this text.
- Preserve a lab's value, unit, specimen date, and printed range as separate fields. With no printed range, show “Range not supplied.” No universal normal range or automatic interpretation is generated, even when a range is available.
- No allergy entry means “No allergy information available in this summary,” never “No known allergies.” An explicit negative allergy statement remains dated and attributed.
- No medical field is assigned a confidence percentage. Evidence quantity is shown as countable documentary information, not health certainty.
- Strict schemas restrict outputs but cannot make free text clinically safe by themselves. Review and tests must inspect rendered copy, source excerpts, and UI fallbacks as well as enums.

### 7.3 AI boundary

One optional extraction adapter may propose verbatim fields and source coordinates at import time. It cannot approve a claim, identify a patient, set a lifecycle status, modify consent, create an access grant, or write clinical advice. Generated narrative is omitted from the emergency MVP; deterministic templates are sufficient.

Live model access and pricing are checked at kickoff. Only synthetic documents may be submitted in this demonstration. `AI_MODE=off` supports the full manual workflow; `fixture` returns prepared extraction only for its matching fixture hash; `live` records the model/version and errors. The source badge survives every downstream view.

---

## 8. Architecture and offline operation

### 8.1 Stack and responsibility

| Layer | Proposed choice | Owns |
|---|---|---|
| Web | React, TypeScript, Vite; responsive PWA shell | Forms, source highlights, local camera, card rendering |
| API | Node.js and Express | Sessions, grants, validation, disclosure, transactional receipts |
| Validation | Shared Zod schemas | Strict requests and deliberately scoped response types |
| Main store | SQLite on clinic laptop | Records, grants, events, receipts, fixture resets |
| Source storage | Private local file directory | Immutable originals and approved emergency excerpts |
| Phone offline store | IndexedDB plus Web Crypto | Encrypted preprovisioned emergency snapshot and local receipts |
| Domain package | Pure TypeScript | Medication reduction, evidence labels, date handling, projection |
| Face | Session-local adapter | Candidate handles only |
| Extraction | Manual first; optional OCR/model adapter | Proposed fields for review |

Pin mutually compatible versions at G0 from the actual environment and current official documentation. Do not inherit version numbers from unrelated plans. The domain functions are shared between server and offline viewer; the trust boundary differs and is described below.

### 8.2 Clinic offline mode

Run server and database on the presentation laptop with a loopback browser. Internet can be off while the local API, authentication, sources, and SQLite receipts still work. Provision demo accounts and records in advance. No CDN, hosted font, model download, cloud auth, or remote call may be required after preparation.

An unprepared clinic device cannot retrieve a stranger's records offline. It shows “No local record available.” This is a supported state, not an invitation to guess or select the nearest name.

### 8.3 Phone offline mode

Prepare the PWA over HTTPS before the demonstration. A plain HTTP LAN address does not satisfy the secure-context requirements for all device APIs. Store the app shell and locally bundled assets separately from patient data; the service worker must not broadly cache API responses.

While connected and authorised, the server creates a signed, versioned emergency snapshot for the enrolled device. It contains only allowlisted fields, approved excerpts, permitted contact data, policy metadata, and an expiry. Excluded records never reach the phone snapshot.

Use Web Crypto authenticated encryption for stored snapshot bytes, with a standard password-derived key for this **synthetic-only demo**. Store a salt and work-factor metadata; hold the decryption key in memory during the unlocked session, not in the same persistent object as plaintext key material. Make a strong demo unlock phrase and its limitations explicit. Browser storage and passphrases are not an institutional key-management system.

Verify signature, snapshot binding, known revocation state, and expiry before opening; locally record the scope and snapshot revision in an IndexedDB transaction before rendering. If storage cannot commit the receipt, the viewer remains locked. Sync receipts by `(deviceId, localSequence)` when reconnected, retaining device-reported and server-received times separately.

For the demonstration, use an eight-hour snapshot expiry and a ten-minute unlocked session. These are prototype policy constants. Display “Offline snapshot from [time]; changes and revocations after that time may be unavailable.” Reject expired snapshots, unknown verification keys, and detected clock rollback. Device-clock tampering and local code modification remain outside the prototype's assurance. Immediate offline revocation and centrally guaranteed audit are not claimed.

A prepared phone can show the pre-released summary to an authenticated demo clinician using a preprovisioned local actor lease, or let the patient open their own saved summary. A local actor lease names the device, actor, role, policy, and validity period; the snapshot is not unlocked by a role-selector button. This demonstrates the flow, not robust offline professional-credential verification.

### 8.4 Failure and restart behaviour

| Event | Expected behaviour |
|---|---|
| Internet lost on clinic laptop | Existing local records continue to work |
| Phone loses all network | Prepared, valid snapshot only; freshness banner persists |
| Snapshot absent/expired | Clear unavailable state and reconnect instruction |
| Local audit write fails | No record rendered |
| Camera/NFC permission denied | QR/manual linkage remains available |
| Upload/OCR interrupted | Persist original if committed; job explicitly failed/retryable |
| Server restarts | Committed records/events/receipts survive; abandoned jobs fail visibly |
| New conflicting prescription arrives | Derive a conflict; never rewrite previous source history |

---

## 9. Contracts and API

These are the minimum implementation contracts. The lead creates equivalent strict runtime schemas at G0. An ID is an opaque identifier; branded types, runtime validation, foreign keys, and ownership checks must enforce its actual namespace. ISO strings alone do not validate a date.

### 9.1 Shared domain types

```ts
type Id = string;
type Instant = string; // validated ISO 8601 UTC timestamp
type ADDate = string;  // validated YYYY-MM-DD, date only
type DataMode = 'synthetic_fixture' | 'user_uploaded';
type ActorRole = 'patient' | 'caregiver' | 'clinician' | 'admin';
type Scope = 'records:read' | 'records:contribute' | 'emergency:read'
  | 'consent:manage' | 'audit:read';

type ClinicalDate = {
  rawText: string;
  calendar: 'AD' | 'BS' | 'unknown';
  precision: 'instant' | 'day' | 'month' | 'year' | 'unknown';
  adDate: ADDate | null;
  instant: Instant | null;
  sourceTimezone: string | null;
  conversionVersion: string | null;
  confirmedBy: Id | null;
};

type SourceRef =
  | { kind: 'text'; sourceId: Id; version: number; sha256: string;
      page: number; start: number; end: number }
  | { kind: 'image'; sourceId: Id; version: number; sha256: string;
      page: number; x: number; y: number; width: number; height: number }
  | { kind: 'attestation'; sourceId: Id; version: number;
      sha256: string; field: string };

type Origin = {
  originGroupId: Id;
  statedOrganisation: string | null;
  organisationId: Id | null;
  submitterId: Id;
  issuerStatus: 'as_stated' | 'demo_verified';
  independence: 'unknown' | 'reviewed_independent' | 'copied';
  derivedFromSourceIds: Id[];
};

type ClaimValue =
  | { kind: 'blood_group'; text: string }
  | { kind: 'allergy'; substanceText: string; reactionText: string | null }
  | { kind: 'condition'; text: string }
  | { kind: 'procedure'; text: string }
  | { kind: 'immunization'; text: string }
  | { kind: 'lab_result'; testText: string; valueText: string;
      unitText: string | null; referenceRangeText: string | null }
  | { kind: 'contact'; name: string; relationshipText: string;
      contactText: string };

type Claim = {
  id: Id; patientId: Id; value: ClaimValue;
  clinicalDate: ClinicalDate; recordedAt: Instant;
  sourceRefs: [SourceRef, ...SourceRef[]];
  origin: Origin; mode: DataMode;
  extraction: 'manual' | 'ocr_candidate' | 'model_candidate';
  confirmation: { actorId: Id; at: Instant; sourceVersion: number };
  supersedesClaimId: Id | null;
};

type DrugRef = {
  rawText: string;
  genericName: string | null;
  resolution: 'verbatim' | 'reviewed_alias' | 'unresolved';
  aliasEntryId: Id | null;
  aliasTableVersion: string | null;
};

type MedicationRecord = {
  id: Id; patientId: Id; prescriptionStreamId: Id;
  drug: DrugRef;
  doseText: string; frequencyText: string;
  routeText: string | null; durationText: string | null;
  startDate: ClinicalDate | null; endDate: ClinicalDate | null;
  prescriberText: string | null; organisationText: string | null;
  sourceRefs: [SourceRef, ...SourceRef[]];
  recordedAt: Instant; mode: DataMode;
};

type MedState = 'documented_active' | 'unknown' | 'held' | 'stopped'
  | 'completed' | 'course_end_passed' | 'superseded' | 'conflict';

type MedicationEventPayload =
  | { kind: 'started' | 'stopped' | 'held' | 'resumed' | 'completed' }
  | { kind: 'dose_changed' | 'substituted'; replacementRecordId: Id }
  | { kind: 'status_confirmed'; state: 'documented_active' | 'unknown' }
  | { kind: 'corrected'; correctsEventId: Id; replacementEventId: Id }
  | { kind: 'retracted'; retractsEventId: Id; reason: string };

type MedicationEvent = {
  id: Id; patientId: Id; prescriptionStreamId: Id; recordId: Id;
  payload: MedicationEventPayload;
  effectiveDate: ClinicalDate; recordedAt: Instant;
  actorId: Id; actorRole: ActorRole;
  authority: 'prescription_document' | 'clinician_attestation';
  sourceRefs: [SourceRef, ...SourceRef[]];
  revision: number; requestId: Id;
};

type MedicationUseReport = {
  id: Id; patientId: Id; medicationRecordId: Id | null;
  drugText: string;
  use: 'taking' | 'not_taking' | 'uncertain';
  lastDoseText: string | null; lastDoseAt: ClinicalDate | null;
  reportedBy: Id; reporterRole: 'patient' | 'caregiver' | 'clinician';
  reportedAt: Instant; sourceRef: SourceRef;
};

type PrescriptionView = {
  recordId: Id; prescriptionStreamId: Id;
  state: MedState;
  basis: string; basisEventIds: Id[];
  drug: DrugRef; doseText: string; frequencyText: string;
  startDate: ClinicalDate | null; endDate: ClinicalDate | null;
  useReports: MedicationUseReport[];
  asOf: Instant; sourceRevision: number;
};

type EvidenceLabel = 'CONFLICT' | 'HISTORICAL_OR_HELD'
  | 'CONTEXT_INCOMPLETE' | 'CORROBORATED_RECORD' | 'RECORDED_CLAIM';

type EvidenceFlag = 'HISTORICAL_INFORMATION' | 'CURRENT_USE_UNCONFIRMED'
  | 'SOURCE_NOT_AUTHENTICATED' | 'RANGE_NOT_PROVIDED' | 'DATE_UNCERTAIN'
  | 'SUMMARY_INCOMPLETE' | 'BLOOD_GROUP_REQUIRES_CURRENT_CLINICAL_VERIFICATION';

type FaceResult =
  | { kind: 'CANDIDATES'; candidateHandles: [Id, ...Id[]];
      mode: 'live_local' | 'simulated'; modelVersion: string | null }
  | { kind: 'NO_MATCH' | 'AMBIGUOUS' | 'UNAVAILABLE';
      mode: 'live_local' | 'simulated'; reason: string };

type EmergencyRelease = {
  id: Id; patientId: Id; version: number;
  allowedClaimIds: Id[]; allowedMedicationRecordIds: Id[];
  allowedUseReportIds: Id[]; approvedExcerptIds: Id[];
  startsAt: Instant; expiresAt: Instant | null;
  revokedAt: Instant | null; approvedBy: Id; approvedAt: Instant;
};

type AccessGrant = {
  id: Id; actorId: Id; patientId: Id; deviceId: Id;
  scope: Scope[]; releaseVersion: number; policyVersion: string;
  issuedAt: Instant; expiresAt: Instant; revokedAt: Instant | null;
  purpose: string; mode: 'normal' | 'break_glass';
};

// An emergency response never embeds a full Claim or Source object.
type EmergencyEntry = {
  handle: Id; label: string; displayText: string;
  sourceDateText: string; provenanceText: string;
  evidenceLabel: EvidenceLabel; flags: EvidenceFlag[];
  approvedExcerptHandles: Id[];
  mode: DataMode;
};

type EmergencyCard = {
  patientHandle: Id; permittedIdentityText: string;
  entries: EmergencyEntry[];
  medicationPanels: {
    documentedActive: EmergencyEntry[];
    reportedUse: EmergencyEntry[];
    needsReconciliation: EmergencyEntry[];
    historical: EmergencyEntry[];
  };
  completenessNotice: string;
  generatedAt: Instant; sourceRevision: number;
  releaseVersion: number; policyVersion: string;
  expiresAt: Instant; receiptId: Id;
};

type OfflineSnapshot = {
  id: Id; patientHandle: Id; deviceId: Id;
  card: Omit<EmergencyCard, 'receiptId'>;
  approvedExcerpts: { handle: Id; mime: string; content: string }[];
  createdAt: Instant; expiresAt: Instant;
  signingKeyId: Id; policyVersion: string; signature: string;
};

type AccessReceipt = {
  id: Id; actorId: Id; patientId: Id; deviceId: Id;
  purpose: string; scope: Scope[]; policyVersion: string;
  resourceVersionIds: Id[]; requestId: Id;
  outcome: 'disclosure_committed' | 'denied';
  snapshotId: Id | null; localSequence: number | null;
  deviceReportedAt: Instant | null; serverRecordedAt: Instant | null;
};
```

Runtime refinements enforce source existence and patient equality; nonempty strings and evidence; valid page/offset/box bounds; max three face candidates; clinical-date precision consistency; required reviewed alias metadata; valid event links without cycles; actor authority; and known policy/version values. Role and verification fields come from trusted server state, never accepted from a request body.

Corrected events refer to a replacement event already present in the same validated transaction. Both belong to the same patient and stream; cycles, cross-stream rewrites, and repeated retractions fail. A valid record snapshot is signed using a standard library and deterministic canonical serialization of the fields excluding `signature`; use fixed algorithms and key identifiers, never an algorithm supplied unchecked by the client. Encrypt that signed snapshot for storage. On opening, authenticated decryption must succeed, then the server signature and all binding/expiry checks must pass before any clinical content is rendered.

### 9.2 HTTP surface

| Endpoint | Input | Result / access |
|---|---|---|
| `POST /api/session` | Provisioned demo credentials | Secure session; no public role assignment |
| `DELETE /api/session` | CSRF-protected request | End session and clear unlocked views |
| `POST /api/patients/:pid/documents` | Validated upload, stated issuer, request ID | Patient/proxy contribution scope; document/job IDs |
| `GET /api/jobs/:id` | Session | Ownership-checked status and bounded warnings |
| `GET /api/documents/:id/preview` | Session | Authorised source rendition |
| `POST /api/patients/:pid/claims` | Confirmed candidates, sources, expected revision | Persist claims or validation/conflict error |
| `POST /api/patients/:pid/attestations` | Attributed form data | Versioned statement source |
| `GET /api/patients/:pid/timeline` | Session, optional date filter | Scoped records and source references |
| `POST /api/patients/:pid/medications` | Verbatim record and source references | Immutable medication record |
| `POST /api/medications/:id/events` | Event payload, source, expected revision, request ID | Append authorised event, return derived view |
| `POST /api/patients/:pid/use-reports` | Use report plus attestation source | Attributed report; no prescription rewrite |
| `GET /api/patients/:pid/prescriptions` | Session, `asOf` | Derived prescription views |
| `POST /api/patients/:pid/releases` | Explicit allowlist and preview version | New patient-approved release version |
| `POST /api/releases/:id/revoke` | Owner request | Connected revocation plus invalidation |
| `POST /api/locators/resolve` | Locator, clinician session | Minimal linkage handle; no medical fields |
| `POST /api/emergency/grants` | Link handle, release, purpose, device | Evaluated grant; actor obtained from session |
| `POST /api/emergency/cards` | Grant ID, request ID | Filtered card and committed receipt |
| `POST /api/emergency/excerpts/:handle` | Grant ID, request ID | Approved excerpt plus receipt |
| `POST /api/offline/snapshots` | Patient release and enrolled device | Authorised signed emergency projection |
| `POST /api/offline/receipts` | Device-authenticated receipt batch | Deduplicated ingestion acknowledgement |
| `GET /api/patients/:pid/access-history` | Patient or authorised auditor | Minimal patient-readable access reports |
| `POST /api/break-glass/requests` | Reason, resolved linkage | Stretch: pending second-clinician approval |
| `POST /api/break-glass/:id/approve` | Different authorised clinician | Stretch: narrow expiring grant |

Face capture/embedding has **no API endpoint**. Emergency source retrieval uses an approved excerpt handle, never an arbitrary original-document URL. Every endpoint validates object-level access; a known ID is not permission.

### 9.3 Integrity and error semantics

Mutations use `(actorId, patientId, requestId)` with payload hash: same payload reuses the stored result; a changed payload returns 409. Medication events, source revisions, and resulting projections commit consistently. A stale `expectedRevision` returns 409 with authorised fresh state. Offline receipt ingestion deduplicates device sequence and rejects altered replays.

Sensitive reads are POST requests with `Cache-Control: no-store`; clinical values and bearer secrets do not enter URLs. Use secure, HttpOnly cookies and CSRF/origin checks for the connected app. Scope local-development exceptions to loopback. Do not log request bodies containing records or credentials.

Standard error: `{ error: { code, message, retryable }, requestId }`. Codes include `INVALID_INPUT`, `SOURCE_UNRESOLVED`, `PATIENT_MISMATCH`, `FORBIDDEN`, `GRANT_EXPIRED`, `GRANT_REVOKED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SNAPSHOT_UNAVAILABLE`, `SNAPSHOT_EXPIRED`, `UNSUPPORTED_FILE`, `EXTRACTION_FAILED`, and `RATE_LIMITED`.

Unauthorised object lookups use a non-enumerating response. Error messages describe recovery without revealing whether another person's record exists. Admins provision demo accounts; admin status alone does not grant clinical record access.

---

## 10. Nepali support

### 10.1 Calendar and time

Store real timestamps in UTC; render them in `Asia/Kathmandu`. Preserve date-only clinical values as dates. Do not invent midnight for a report that only states a day, and do not create a full birthday from a birth year. Unknown calendar and ambiguous date order require confirmation.

Keep the original BS or AD text, confirmed calendar, converted AD date when available, conversion-library version, and precision. A naive timestamp may be interpreted as Kathmandu time only after the user confirms the source context; imported time offsets are preserved before normalization.

Choose a maintained BS conversion library after checking its documented supported years. Pin it and validate against 30 independently checked BS↔AD pairs including month/year boundaries and leap-day cases. Round-trip consistency alone cannot prove the conversion table is correct. Outside the verified range, retain the original and show “Conversion unavailable.” Never fabricate the BS equivalent of a sample AD date in this plan.

### 10.2 Script, names, and search

Use UTF-8, Unicode NFC normalization for search keys, and a bundled font with Devanagari shaping. Preserve the unmodified source text for medication strings and evidence offsets. Search may normalise Latin/Devanagari numerals (`0–9` / `०–९`) but display retains the original and optional preferred numeral style.

Preserve patient-entered name forms. Romanized and Nepali names are aliases attached to a verified patient ID, not merge keys. No fuzzy name search auto-opens a record. Test conjuncts, combining signs, copy/paste, and line wrapping with a native speaker.

Starter interface copy, subject to native-speaker review:

| English | Nepali draft |
|---|---|
| Health records | स्वास्थ्य अभिलेख |
| Medicines | औषधि |
| Emergency contact | आकस्मिक सम्पर्क |
| Source | स्रोत |
| Date | मिति |
| Information unavailable | जानकारी उपलब्ध छैन |

### 10.3 Local records and contacts

Support mixed Nepali/English printed records, provider names as stated, and patient-selected emergency contacts. Accept a contact as entered; optional validated phone formatting must not silently rewrite an uncertain number. Demo contacts use unmistakably non-dialable placeholders; no click-to-call action is active in synthetic mode.

Keep public emergency directories outside the MVP. The earlier chat swapped service labels and included unchecked numbers. Any later directory needs a primary source, jurisdiction, service label, verification date, and independent review before enabling calls.

An insurance/entitlement card can later be stored as another source document. It does not prove eligibility, coverage, balance, or payment authorisation. Do not ship an inferred entitlement table or unsupported national coding claim. Terminology codes are optional metadata only after the exact code system and version are confirmed.

---

## 11. Repository layout and ownership

```text
apps/web/src/
  app/                     # composition, routing, API client — lead
  features/records/        # upload, confirmation, sources — records/UI
  features/medications/    # lifecycle and use panels — UI
  features/emergency/     # linkage, grant, card — identity/UI
  features/consent/       # allowlist preview, release — UI
  features/audit/         # patient access history — UI
  face/                    # in-memory local matcher — identity
  offline/                 # snapshots, encryption, local receipts — identity
  i18n/                    # reviewed English/Nepali copy — records/UI
server/src/
  routes/                  # authorised endpoint handlers — backend
  ingestion/               # source preservation and candidate jobs — records
  identity/                # actors, grants, locators — identity
  disclosure/              # projection, safe excerpts, receipts — backend
  storage/                 # SQLite, private files, transactions — backend
  snapshots/               # signed device-bound projections — identity
packages/contracts/src/    # runtime schemas and wire types — lead
packages/domain/src/       # evidence, medication, projection, dates — backend
fixtures/                  # synthetic data and truth manifest — records
tests/                     # domain, API, browser and offline checks — owners
scripts/                   # dev, build, seed, scoped reset — lead
docs/RULE_REVIEW.md         # review status and scope; no invented sign-off
docs/DEVICE_MATRIX.md       # actual tested hardware/browser/modes
docs/FIXTURE_MANIFEST.md    # expected values, privacy and provenance
docs/QA_RESULTS.md          # pass/fail/not-run with evidence
docs/ASSET_LICENSES.md      # fonts, face model, dependencies and assets
health_plan.md             # this specification
README.md                  # setup, demo, limits
```

Three people: lead/backend; identity/offline; records/UI. Four people: split records/fixtures and UI. QA is a rotating review role, with one owner signing each gate. These are responsibilities, not a request to start agents during the planning task.

Create the shared contracts and one compiling vertical slice before splitting implementation. The lead alone changes shared contracts, dependencies, lockfile, app composition, and top-level scripts. Contributors own bounded files and hand off changed paths, checks run, unresolved issues, and integration needs. Existing user work is preserved.

---

## 12. Gates, cut order, and contingency

Times are elapsed build time, not calendar appointments. Recompute proportionally if the event window changes.

| Gate | Cumulative time | Observable completion |
|---|---|---|
| G0 | 10% — 3h36m | Compiling skeleton; actors and contracts; synthetic truth manifest; source locator and evidence rules |
| G1 | 30% — 10h48m | Import → confirmed claim → source-linked patient view; one medication stream derives correctly |
| G2 | 50% — 18h | Clinician/locator/consent gates → projected card → committed receipt; clinic works without internet |
| G3 | 70% — 25h12m | Prepared phone works without any network; medication edge cases, privacy exclusions, Nepali/date support |
| G4 | 85% — 30h36m | Face/NFC path or labelled fallback integrated; mandatory checks pass; device demo rehearsed |
| Reserve | Final 5h24m | Fix failures, rehearse, package backup; no new features |

### 12.1 Cut order

1. Entitlements, coding tables, lab charts, FHIR export, and extra caregivers.
2. Break-glass and notification delivery; retain preauthorised emergency release.
3. Exact alias/overlap feature; retain verbatim medication evidence.
4. Live AI/OCR; retain manual annotation and fixture extraction labels.
5. Live face matcher if it fails its timebox; retain the honest candidate UI demonstration and reliable locator route.
6. Direct NFC reading on unsupported devices; retain printed QR/manual locator and demonstrate NFC on the tested phone if available.
7. Full original-document browsing in emergency mode; retain approved source excerpts and full patient-side originals.

Do not cut source traceability, actor/object authorization, explicit uncertainty, medication event history, verbatim dosing, privacy projection, receipts, mode labels, or tested local access. If phone offline cannot meet G3, report a missed requirement and show the tested clinic mode; do not call a screenshot or cached public webpage “offline patient access.”

### 12.2 Timeboxes

At G0, allow at most 45 minutes to prove camera and NFC feasibility on actual devices. At G3, allow at most 90 minutes to integrate a chosen face adapter. Stop at the timebox if it lacks a reliable candidate-only result. Spend the saved time on the medication and emergency flow.

Rebuild the fixture from a fixed seed and a injected demo clock. Show simulated time explicitly. Keep the main document dates and event ordering consistent with that clock; do not silently change the machine clock to make snapshots appear valid.

---

## 13. Acceptance and test matrix

Each row is a required behavioural check unless marked stretch. Record pass/fail/not-run, environment, and evidence in `docs/QA_RESULTS.md`. These checks are specifications for the future application; none is claimed to have passed merely because this plan exists.

| # | Check and expected outcome | Owner / method |
|---|---|---|
| 1 | Claim with missing, invalid, or cross-patient source cannot commit | Records / API |
| 2 | Text span/image box resolves to the exact saved source version | Records / unit + visual |
| 3 | Manual assertion has a real attributed statement source | Records / API |
| 4 | Same document imported twice does not create duplicate evidence | Backend / integration |
| 5 | Two same-origin documents count once; copied cross-org evidence remains one lineage | Backend / unit |
| 6 | A 2-to-1 blood-group disagreement remains conflict; no vote | Backend / unit |
| 7 | Every blood-group card carries verification text, including conflicts | UI / browser |
| 8 | No evidence result says safe to treat or supplies a confidence percentage | QA / schema + copy audit |
| 9 | Face alone and repeated face scans return no medical fields | Identity / API + browser |
| 10 | More than three plausible candidates returns ambiguous | Identity / adapter test |
| 11 | Face/NFC mismatch blocks the current linkage attempt | Identity / integration |
| 12 | No face/template network transmission or persistent storage; logout clears gallery | Identity / network + storage inspection |
| 13 | NFC/QR alone or with face but no actor session grants nothing | Identity / API |
| 14 | Actor, patient, device, grant, expiry, scope, and revocation checked independently | Identity / negative API cases |
| 15 | Caregiver permissions are patient-specific; emergency contact is not a proxy grant | Identity / API |
| 16 | Forged role, patient ID, or verification field cannot elevate access | Backend / API |
| 17 | Excluded claims, drugs, counts, names, filenames, and snippets absent from emergency JSON | Backend / response inspection |
| 18 | Always-present completeness notice does not reveal whether excluded data exists | QA / paired fixtures |
| 19 | Original source endpoint cannot expose excluded parts through an emergency grant | Backend / API |
| 20 | Medication record and event history persist; no direct prescription-state write endpoint | Backend / integration |
| 21 | Verbatim drug/dose/frequency survive Unicode and whitespace round-trip | Records / unit |
| 22 | No derived dose/count/end date appears from frequency or duration strings | Backend / fixtures + output inspection |
| 23 | Missing end/status yields unknown; a use report does not upgrade prescription authority | Backend / unit |
| 24 | Stop/hold/substitution/completion/end-passed derive distinct correct states | Backend / unit |
| 25 | Delayed entry and contradictory same-day events preserve conflict | Backend / unit |
| 26 | Corrections/retractions are linked and auditable; cycles rejected | Backend / API |
| 27 | Same-drug name across prescriptions does not auto-merge streams | Backend / unit |
| 28 | Last dose shows who reported it and when; missing is unknown | UI / browser |
| 29 | Stretch text overlap accepts literal identity but never penicillin→amoxicillin class inference | Backend / unit or not-built |
| 30 | Lab without unit/range shows missing context; no generated normal range | UI / browser |
| 31 | Disclosure projection and receipt commit before response; audit failure exposes no card | Backend / injected failure |
| 32 | No audit edit/delete API; reset excludes unrelated data | Backend / API + reset review |
| 33 | Repeated mutation is idempotent; changed payload/revision returns conflict | Backend / integration |
| 34 | Cross-patient source, job, card, snapshot, and history reads are denied | QA / API |
| 35 | Clinic full read flow survives internet disconnection and server restart | QA / device test |
| 36 | Prepared phone survives airplane mode plus Wi-Fi off and app reload | Identity / physical device |
| 37 | Unprepared phone/clinic cannot retrieve an unknown patient's data offline | QA / clean-storage device |
| 38 | Expired/invalid-signature/wrong-device snapshot stays locked | Identity / negative tests |
| 39 | Offline receipt failure blocks display; reconnect ingestion deduplicates receipts | Identity / injected failure |
| 40 | Snapshot freshness/revocation limitations remain visible throughout offline access | UI / browser |
| 41 | Thirty externally checked BS/AD pairs match; unsupported dates stay unconverted | Records / unit + source review |
| 42 | Date-only/year-only values retain precision; naive timestamp assumption is confirmed | Backend / unit + browser |
| 43 | Nepali names/numerals search correctly without mutating source or prescription text | Records / unit |
| 44 | Similar names remain different patients in all routes | QA / two-patient fixture |
| 45 | Keyboard-only full workflow, text status cues, 200% zoom, phone layout | UI / accessibility walkthrough |
| 46 | Font, script shaping, camera, NFC, PWA, and offline assets tested on named devices | QA / device matrix |
| 47 | Failed OCR preserves manual path; no fixture result impersonates arbitrary live upload | Records / integration |
| 48 | Oversized/malformed/active-content files fail safely; document instructions stay data | Records / adversarial fixture |
| 49 | Fixture has no real health data or active phone numbers; face demo consent documented | QA / manual audit |
| 50 | Card benchmark measured over ten runs after final grant, reporting median/max and device | Lead / timed rehearsal |
| 51 | Stretch break-glass requires distinct approver and expires; excluded data stays excluded | Identity / integration or not-built |
| 52 | Stage claims match actual modes, review status, and completed checks | Lead / rehearsal |

Security-negative tests should exercise the actual service boundary, not only pure functions. Document-only checks may be manual. A missing optional feature is “not built,” while a missing mandatory property is a failed gate.

---

## 14. Risks and fallbacks

| Risk | Detect early | Fallback / remaining limit |
|---|---|---|
| Wrong patient linkage | Second similar-name fixture, locator mismatch, adversarial input | Deny and restart; production identity assurance remains unproven |
| Face model fails or can be spoofed | Consent/enrollment/lighting test before G1 | Locator route; visible simulation if used; no accuracy or liveness claim |
| NFC unavailable | Test exact phone/tag/browser | QR/manual locator; same authorisation gates |
| Copied card locator | Copy it during negative tests | Actor gate, linkage confirmation, revocation, receipts; copied locator is still a production threat |
| Stale prescription looks current | Unknown/end-passed/stop fixtures | Explicit uncertain/historical panels; use reports stay separate |
| Privacy leak through medication or source | Inspect JSON and all source routes | Positive allowlist plus approved excerpts; reject uncertain projection |
| Poor Nepali OCR | Review actual synthetic scans before integration | Manual source selection and transcription |
| BS conversion wrong | Thirty independent reference pairs | Show original date and unavailable conversion |
| Phone storage evicted | Reload and quota/cleared-storage tests | Reprepare while connected; no availability guarantee |
| Revocation cannot reach offline device | Revoke grant after disconnect | Short expiry and persistent stale-policy notice; no instant-revocation claim |
| Offline device/browser compromised | Threat-model review | Synthetic-only demonstration; production needs managed-device/key controls |
| Audit fails or is tampered with | Inject disk/IndexedDB error | Deny disclosure on commit failure; avoid tamper-proof claims |
| Clinical review unavailable | Review-status record at kickoff | Continue synthetic software build; show “Not clinically validated” |
| AI quota or network unavailable | Disable provider during rehearsal | Full manual/fixture path remains usable |
| Time pressure | Gate review at stated elapsed times | Apply §12 cuts; protect emergency and medication correctness |

---

## 15. Demonstration script

Four minutes, with prepared synthetic documents, provisioned actors, and consented face enrollment completed beforehand. Show setup assumptions on the opening slide or UI badge.

| Time | Beat | What the judge sees |
|---|---|---|
| 0:00–0:20 | Problem | One patient, documents from two fictional providers, history hard to assemble |
| 0:20–0:55 | Import and provenance | Confirm a prescription field against its highlighted original; display Nepali/English UI |
| 0:55–1:20 | Medications | Active as documented, use reported by caregiver, uncertain, and stopped panels |
| 1:20–1:50 | Face headline | Local camera produces candidate; record stays locked; live/simulated badge visible |
| 1:50–2:25 | NFC/QR and emergency card | Signed-in clinician completes linkage and purpose; scoped card appears with receipt |
| 2:25–2:55 | Evidence disagreement | Two sources disagree; source drawer preserves both; blood-group warning persists |
| 2:55–3:25 | Offline phone | Prepared snapshot opens with networking disabled; timestamp and completeness notice visible |
| 3:25–3:45 | Accountability | Patient sees who accessed which scope and when; offline receipt later syncs if network returns |
| 3:45–4:00 | Close | “A portable record with sources, medication history, and controlled emergency access.” |

Do not suggest that the face scan itself unlocked the chart, that the snapshot is current after disconnection, or that the product decides which tests to skip. If the NFC transport is QR in rehearsal, name the actual transport.

### 15.1 Fallback ladder

1. Live local face + tested NFC + local card.
2. Live local face + QR/manual locator + local card.
3. Labelled face simulation + QR/manual locator + local card.
4. Credential/locator flow without face if the camera adapter is unavailable.
5. If a mandatory runtime fails, show a clearly labelled recorded walkthrough, report the failure, and distinguish it from a working application.

A recording is backup evidence of an earlier run; it is never passed off as the current interactive demo. Keep copies of the app build, fixtures, dependency lock, assets, source, and startup notes on the presentation machine.

---

## 16. Budget, privacy, and data handling

### 16.1 Budget

Zero mandatory cloud spend. Use existing laptop/phone, local storage, locally bundled fonts/assets, and manual extraction. Printed QR cards cost only printing; use an NFC tag only if one is available within the team's agreed budget. No hardware purchase, paid account, API credit, or deployment is authorised by this plan alone.

Optional model access uses the team's existing permitted account and an explicit usage cap. Free-tier availability and terms are checked at kickoff; absence of a free tier does not block the build. Provider-specific data use claims from the old chat are not carried forward unchecked.

### 16.2 Data lifecycle

| Data | Storage/use | End of demo |
|---|---|---|
| Synthetic documents/claims | Private project fixture store | Retain for reproducible testing |
| Consenting participant face captures/embeddings | Session memory only | Clear on logout/end; close camera tracks |
| Locator identifiers | Demo registry; no medical payload | Revoke/reset with fixture workspace |
| Phone snapshot | Encrypted local demo store, short expiry | Remove through explicit demo reset |
| Connected access receipts | Application-append-only SQLite rows | Retain synthetic audit test data or reset only demo namespace |
| Offline receipts | Local device queue then synced store | Preserve until acknowledged; reset only with clear demo action |
| Secrets/signing keys | Local environment or protected key file | Exclude from git, screenshots, logs, and fixture exports |

Do not promise secure erasure from SSDs, backups, browser internals, screenshots, or third-party captures. A local reset removes application-managed demo data; it cannot reverse previous disclosure.

### 16.3 Production gates, outside this hackathon

Real deployment needs an accountable health organisation, legal review, reliable professional identity checks, consent/exception governance, patient identity matching, retention/deletion policy, security assessment, incident response, clinical review, accessibility review, device/key management, and operational support. These are product-development dependencies, not a claim that a hackathon prototype has satisfied them.

Nepal's Privacy Act 2075 is a relevant primary legal reference. This plan does not interpret its full scope or assert compliance, and it does not repeat the old chat's claim that privacy duties apply only to public bodies. Obtain qualified local review before processing real health information. [Nepal Law Commission: Privacy Act 2075](https://lawcommission.gov.np/content/12261/the-privacy-act-2075/).

---

## 17. Positioning, claims, and honesty

### 17.1 Positioning

The product is a patient-held longitudinal document record with a focused emergency view and explicit medication evidence. Its hackathon differentiation is the combination of Nepali presentation, source traceability, current-use uncertainty, controlled candidate lookup, and a prepared offline card.

Compare categories cautiously: hospital EMRs manage institutional care workflows; document vaults store files; patient portals expose an organisation's records; this prototype concentrates on patient-supplied records across providers. These are positioning choices, not verified claims that competing products lack a feature. Do not assert Nepal has no national/patient-level system or that existing infrastructure is exclusively aggregate without separate current research.

### 17.2 Claims permitted after checks pass

- The demonstrated documents are collected in one patient workspace and fields link to source evidence.
- Prescription state is derived from recorded events, while reported medication use remains separately attributed.
- A face result suggests a local candidate and grants no clinical access on its own.
- The tested clinic reads local records without internet; the prepared phone reads its dated emergency snapshot without networking.
- Emergency responses contain the configured release scope and produce the stated receipts.
- The prototype supports the demonstrated Nepali text, numerals, and verified date range.

### 17.3 Claims not supported

No diagnosis, triage, prescription, interaction screening, safe-to-treat judgement, reduced testing, clinical-outcome benefit, biometric accuracy, liveness protection, national coverage, hospital integration, regulatory compliance, universal browser/NFC support, instantaneous offline revocation, or tamper-proof audit.

Do not call the project a certified or exempt medical device; intended use and applicable law require assessment. A clinician's review of a synthetic fixture does not certify the whole product. A structurally valid schema does not prove semantic correctness or privacy.

### 17.4 Review and mode labelling

`docs/RULE_REVIEW.md` states `not_reviewed`, `demo_reviewed`, or `clinically_reviewed_scope`, with exact reviewed material, reviewer permission, date, and limitations. Add a professional registration detail only if supplied and verified with consent. Never invent sign-off to unblock a gate.

Separate badges for document source, extraction method, face mode, and offline mode. A live camera with synthetic medical records is a legitimate mixed demonstration. State both facts. Performance numbers must identify machine, preparation, input size, and what timing includes.

---

## 18. Implementation references and workspace commands

### 18.1 Primary references checked for this plan

Accessed 2 October 2026. These inform particular design boundaries; they do not certify this application. Recheck package APIs and deployment conditions at implementation time.

| Reference | Use in this plan |
|---|---|
| [FHIR R5 DocumentReference](https://hl7.org/fhir/R5/documentreference.html) | Document metadata and source linkage concepts |
| [FHIR R5 Provenance](https://hl7.org/fhir/R5/provenance.html) | Origin and transformation history, distinct from access history |
| [FHIR R5 AuditEvent](https://hl7.org/fhir/R5/auditevent.html) | Accountability concepts for access and other security events |
| [FHIR R5 MedicationRequest](https://hl7.org/fhir/R5/medicationrequest.html) | Prescription/order concept |
| [FHIR R5 MedicationStatement](https://hl7.org/fhir/R5/medicationstatement.html) | Reported medication use concept |
| [W3C WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/) | Credential authentication and local biometric verification boundary |
| [Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc) | NDEF scope, hardware/permission checks, Android browser path |
| [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) | Authentication guidance to consult for a future assurance design; no assurance-level claim |
| [Nepal Law Commission: Privacy Act 2075](https://lawcommission.gov.np/content/12261/the-privacy-act-2075/) | Legal review starting point |

The domain model is inspired by these distinctions, not a conformant FHIR implementation. A future export must select a version and profile, map fields explicitly, validate with appropriate tooling, and document gaps. A JSON file with FHIR-like names does not establish interoperability.

Still to verify during implementation: face model/package and licence; BS library and 30 reference pairs; exact browser/device matrix; OCR quality; any live provider terms; any directory/entitlement content; event rules on prepared code/assets. Avoid unverifiable placeholders by leaving those features out until their gate is met.

### 18.2 Scripts to implement

These commands are desired interface names, not commands already run. Preserve the RTK requirement in the user's environment; elsewhere use the actual installed tooling.

```sh
rtk npm install
rtk npm run dev
rtk npm run typecheck
rtk npm run test
rtk npm run test:e2e
rtk npm run build
rtk npm run demo:seed
rtk npm run demo:reset
rtk npm run offline:check
```

`demo:reset` resolves a named synthetic workspace and checks its marker before removing application data. It must never target a home directory, a repository root, an unrelated database, or every browser origin. `offline:check` checks bundled assets and the prepared snapshot; physical-device airplane-mode verification remains a manual check.

Configuration names: `APP_MODE`, `AI_MODE`, `DATABASE_PATH`, `PRIVATE_DOCUMENT_PATH`, `PORT`, `PUBLIC_ORIGIN`, `SESSION_SECRET`, `SNAPSHOT_SIGNING_KEY_PATH`, `SNAPSHOT_PUBLIC_KEY_ID`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`. Keep secrets server-side. `.env.example` lists names and non-secret sample paths only. Face credentials are unnecessary because matching is local; model assets still need licensing and packaging.

---

## 19. Pre-event checklist

Before implementation begins, the lead records the actual event rules, duration, team, permitted prepared materials, and local/deployment scope. Then complete these concrete preparations:

1. Freeze the main synthetic patient's truth manifest, separate identity-collision patient, document lineage, and medication event order.
2. Prepare three clean documents plus addendum, original source regions, permitted emergency excerpts, and expected outputs.
3. Record independent/native-speaker/clinical review status without delaying the synthetic software work for unavailable reviewers.
4. Test the presentation laptop, Android phone if NFC is planned, NFC tag or QR card, camera permission, local fonts, and secure PWA setup.
5. Prepare offline records/snapshot, demo actor leases, expiry times, and verification keys before disconnecting.
6. Confirm consent for local face enrollment. Keep that data out of the source repository and recording unless separately permitted.
7. Verify the BS date test pairs and preserve their sources. If not ready, show original dates and label conversion unavailable until completed.
8. Exercise the full four-minute script, failed match, expired snapshot, denied access, and stopped/unknown medication states.
9. Package source, build, dependencies/assets needed offline, fixture seed, QR fallback, and startup instructions.
10. Assign a presenter and an operator; keep the final reserve for bugs and rehearsal.

The kickoff has succeeded when there is a compiling slice with one source-linked claim, one derived prescription, and a denied unauthorised read—not merely a checklist marked complete.

---

## 20. Event-day agent runbook

This section is a set of future implementation prompts. It does not start agents, deploy the application, or create scheduled work. Use sequential owners when agent delegation is unavailable or not authorised.

### 20.1 Kickoff message

> Build the Health-track prototype in [repository] using `health_plan.md` as the implementation specification. We have 36 hours and [3 or 4] people. The organiser's rule on prepared code/assets is [rule]. Deployment scope is [local demo or explicitly authorised destination]. Face scan is the headline, NFC/QR is the reliable lookup path, and both clinic-local and prepared-phone offline access must be demonstrated. Medication history and current-use reporting are core. Start with the contracts and one complete source→claim→prescription→scoped-card→receipt loop. Use only synthetic health data. Record actual verification results and follow the cut order when gates slip.

### 20.2 Lead / integration owner

> Read this plan, repository instructions, and the existing code before editing. Preserve user changes. Create shared runtime schemas, pure domain interfaces, role/session stubs, the frozen evidence rules, a fixture truth manifest, scripts, and a compiling vertical slice. Treat §5, §6, and §7 as the authority for access, medication states, and evidence labels. Resolve routine implementation choices from these requirements; ask only about missing constraints that would materially expand scope. Allocate bounded ownership to specialists if delegation is explicitly permitted; otherwise perform the work sequentially. Integrate at every gate. Completion requires the mandatory §13 checks to be recorded, the §15 demo to run on named devices, the four-second target to be measured, and limitations to match actual behaviour. Report failed requirements rather than substituting screenshots or mock success.

### 20.3 Identity / offline owner

> Read §5, §8, §9, §12, and §13. Own actor sessions, patient-specific grants, locators, face adapter, device preparation, signed snapshots, and offline receipts. Implement the actor and patient-link/grant gates separately. Face returns candidate handles only; an NFC/QR locator is copyable and never grants access alone. Use session-local consented face enrollment; clear captures, embeddings, and camera tracks. Prepare a phone PWA with no runtime asset downloads, a device-bound pre-released encrypted snapshot, an expiring local actor lease, and receipt-before-render behaviour. Verify missing/expired/modified snapshots and clock rollback handling; state local-device trust and delayed revocation limits. Test the exact phone/browser with all network disabled. Completion means access-negative tests and prepared-phone reload work with documented modes; fingerprint identification, global galleries, and untested Web NFC are not acceptable substitutes.

### 20.4 Backend / medication owner

> Read §4–§9 and §13. Own SQLite repositories, disclosure projections, medication reduction, evidence rules, and transactions. Preserve immutable source and prescription versions. Implement append-only events with effective time, revision checks, authority, correction links, and idempotency. Keep reported use distinct from prescription lifecycle; no end/status evidence yields unknown. Preserve original dose/frequency strings. Conflicting or unordered instructions stay conflicting. Build positive release projections before serialization, including medication and source-excerpt restrictions. Commit each disclosure receipt before sending its payload; deny when audit storage fails. Verify object-level authorization for every source, job, medication, receipt, and snapshot. Completion requires the medication fixture matrix, conflict behaviour, privacy-paired fixtures, and transaction-failure tests, with no direct state-edit endpoint.

### 20.5 Records / Nepali / fixture owner

> Read §4, §6, §7, §10, §13, and §19. Own document ingestion, source-region validation, synthetic truth manifests, candidate extraction, Nepali copy, and date fixtures. Start with manual confirmation over immutable originals. Produce three core fictional-provider documents and an addendum with the required medication cases and a second similar-name patient. Keep source lineage explicit, and label stated issuers honestly. Validate text/image coordinates and candidate limits. Record manual, fixture, OCR, and live-model modes separately; an arbitrary upload must never receive canned fixture values. Preserve source text while normalising search keys. Pin BS conversion only after checking 30 independent date pairs and supported years. Completion means every expected claim resolves visually to the correct source and native-script display and precision-preserving dates pass their checks. Keep model/clinical review status truthful.

### 20.6 UI owner

> Read §3, §5, §6, §7, §9, §10, §13, and §15. Own records, medications, consent, emergency, and audit panels within assigned files. Render server/domain results without independently deciding clinical state or access. Give current documented prescriptions, use reports, uncertain entries, and historical medications separate panels. Show source dates, reporter roles, and uncertainty beside the value. Implement the always-present generic completeness notice and only approved excerpt handles. Show live/simulated face and prepared-offline modes visibly. Provide keyboard and manual scan alternatives, 360-pixel layout, zoom support, text equivalents for colours, and properly shaped Nepali text. Completion means the integrated four-minute journey works against real handlers, all failure states are actionable, and no full record is fetched merely to hide fields in the browser.

### 20.7 QA / rehearsal owner

> Read §13–§17, then test the integrated application against every applicable row. Prioritise wrong-patient access, role forgery, locator copying, privacy leaks through source endpoints or medication names, missing-end-date prescriptions, out-of-order events, audit failure, and expired/offline snapshots. Run negative tests through service boundaries as well as domain functions. Inspect network and storage for biometric leakage and unwanted remote dependencies. Walk the clinic flow with internet disabled, and the phone flow in airplane mode with Wi-Fi off after reload. Record actual devices, pass/fail/not-run evidence, mode badges, and timing. Review the stage script against what the build actually does. Report reproduction steps and gate-blocking defects; coordinate fixes with file owners. Completion requires an honest QA record and rehearsed fallback, not a blanket “all tests pass” statement.

### 20.8 Final handoff

The lead hands over the runnable project, exact startup instructions, fixture seed and reset scope, device preparation instructions, tested modes, QA results, measured timing, known limitations, and the four-minute demo. Name any requirement that was cut or remains unverified. At that point the hackathon prototype is ready to present within its stated scope.
