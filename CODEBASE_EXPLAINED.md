# Pran Rekha codebase, explained like a story

## The one-minute explanation

Pran Rekha is a **fictional healthcare-record demonstration** made for a hackathon. It is not a real hospital system and must not be used to make medical decisions.

Imagine a school nurse keeps a folder for each child:

- Every fact in the folder says **who wrote it** and **where it came from**.
- The child chooses which pages may be shown in an emergency.
- A paramedic can use an RFID card or QR-like locator to find the right folder, but cannot immediately read it.
- The paramedic must say why access is needed and receive a short-lived digital key.
- The hospital receives only the pages the patient approved.
- Every time somebody looks, the system writes a receipt.

That is the big idea behind this repository.

The project also demonstrates document uploads, local handwriting reading, face-based candidate suggestions, encrypted offline copies, signed records, medication history, and two RFID hardware designs. All included people and medical details are synthetic.

## The most important safety sentence

This app stores and displays **evidence**, not medical truth.

For example, it may say, “A document recorded blood group O-.” It should not say, “The patient is definitely O- and you should transfuse this blood.” Real clinicians must still verify the information and follow their normal procedures.

## The project as a little town

Think of the codebase as a small town:

| Town building | Code folder | Job |
|---|---|---|
| The front desk | `apps/web` | Shows screens and collects button clicks |
| The town hall | `server` | Checks identity, permissions, rules, and writes data |
| The rulebook | `packages/contracts` | Defines exactly what valid data looks like |
| The careful judge | `packages/domain` | Decides what state a medicine is in from its event history |
| The filing cabinet | SQLite in `.data` | Keeps accounts, records, sessions, receipts, and demo objects |
| The card reader | `firmware` | Reads RFID cards and talks to the server |
| The inspectors | `tests` | Try normal and naughty actions to make sure rules hold |
| The setup helpers | `scripts` | Start phone demos, simulate scans, and enroll demo cards |

## How the pieces talk

```mermaid
flowchart LR
    Person[Patient, paramedic, lab, or hospital user]
    Browser[Next.js web app]
    API[Express API]
    Rules[Contracts and domain rules]
    DB[(SQLite database)]
    Reader[RFID reader]

    Person --> Browser
    Browser -->|JSON requests and secure session cookie| API
    API --> Rules
    API --> DB
    Reader -->|card UID only| API
    API -->|approved, short-lived summary| Browser
    API -->|approved LCD pages| Reader
```

The browser never gets to decide, “I am a doctor” or “I may read this patient.” The server makes those decisions from the logged-in account and stored relationships.

## The four main portals

The root page redirects to `/patient`. Four tiny Next.js page files all load the same large `Portal` component with a different portal name.

### Patient portal

The patient can:

- see their synthetic profile, a QR code of their opaque locator, and source-attributed entries;
- see when the record is due for review (`FRESH`, `AGING` within 30 days, or `EXPIRED`);
- choose exactly which entries may appear in an emergency summary;
- revoke that emergency release;
- add a clearly marked, unverified personal report;
- inspect access receipts;
- book a simulated discounted checkup;
- import a document and confirm text from it;
- add an attributed statement about a recorded medicine (a “use report”);
- prepare an encrypted offline copy.

The patient cannot turn their own statement into a clinician-signed fact. Patient reports remain visibly separate.

### Paramedic portal

The paramedic can:

- read a recent scan from their paired RFID reader;
- resolve an opaque locator entered from a QR code or by hand;
- create a short-lived linkage to a candidate patient;
- state an emergency purpose and confirm the patient linkage;
- request a ten-minute grant;
- open only the patient-approved emergency summary;
- send a pre-arrival alert to the demo hospital;
- request a separately approved five-minute “break glass” grant.

The paramedic screen also has a “Simulate face candidate” button. It is a labelled simulation only: no camera is used and nothing is matched. Real face matching lives in the hospital portal, and even there a result is only a candidate suggestion that never unlocks a record.

### Hospital portal

Hospital staff can:

- register a synthetic patient, account, RFID tag, and optional face photo;
- add or replace the stored face photo of a patient they registered;
- use local face matching to suggest possible patients, with the stored photo shown for comparison (each photo view writes a receipt);
- review and sign handwritten-note candidates for patients they registered;
- receive incoming paramedic alerts, optionally with a sound;
- move an alert from `EN_ROUTE` to `ARRIVED` to `RESOLVED`;
- approve a different staff member's break-glass request.

Incoming alerts update through Server-Sent Events. The event itself contains no patient data; it merely tells the browser to fetch fresh, permission-checked data. A `BroadcastChannel` gives the same nudge between tabs of one browser.

### Lab portal

Lab staff can:

- view an assigned patient (the lab is assigned Siddharth);
- add a signed clinical entry;
- add a prescription and append medication events (started, held, stopped, corrected, and so on);
- review local OCR results from a handwritten page and sign selected lines;
- inspect signed version history;
- see a fake revenue ledger for the hackathon business-model demo (each signing adds a simulated $50 checkup with an 8% commission).

No actual payment happens.

## A complete emergency journey

Here is the core story from card tap to hospital arrival:

1. The RFID device reads a card's UID, such as `DEADBEEF`.
2. It sends only the device ID, event ID, and card UID to the API.
3. The API authenticates the reader and remembers the scan. It returns no medical data.
4. The paramedic portal asks for the newest scan from its paired reader.
5. The API creates a two-minute patient linkage candidate.
6. The paramedic confirms the linkage and explains the purpose.
7. The API creates a grant lasting ten minutes and binds it to that exact login session.
8. The API builds a card containing only entry IDs in the patient's current emergency release.
9. The read is recorded as a receipt. If receipt writing fails, the medical view fails too.
10. If the linkage came from RFID, the little LCD may show the approved summary for only 90 seconds.
11. The paramedic can dispatch the approved summary to the demo hospital.
12. The hospital sees it only while the original grant and release revision are still valid.

If the patient revokes or changes the release, an old grant cannot silently grow into the new scope. A new card tap also cannot reuse the previous card's authorization.

## The rulebook: shared contracts

`packages/contracts` uses Zod schemas. A schema is like a shape sorter for data: a star-shaped block cannot go through the square hole.

The contracts define:

- IDs, timestamps, dates, roles, and demo-data modes;
- exact source pointers into text, images, or attestations;
- medication records and prescription views;
- session and API error shapes;
- signed clinical entries and profile versions;
- RFID scans, grants, emergency cards, dispatch alerts, registration, faces, and handwritten updates (these live in `packages/contracts/src/platform.ts`).

Important validation examples:

- A full timestamp must include an offset.
- A year-only date may not pretend to know a month and day.
- A text source range must end after it starts.
- An image box must remain inside the page.
- An RFID UID must have 8, 14, or 20 hexadecimal characters.
- A face descriptor must contain exactly 128 numbers.
- A registration may include both a face photo and descriptor, or neither—not only one.

## The judge: domain logic

`packages/domain` contains pure rules that do not know about web pages or databases. Today that is one function, `lifecycle` in `lifecycle.ts`.

### Medication state

Medicine is stored as a record plus a timeline of events such as started, held, resumed, stopped, or completed.

The code deliberately distinguishes:

- “a prescription says active” from “the patient is definitely taking it”;
- the date an event happened from the date it was uploaded;
- a passed course end from proof that a person stopped;
- two contradictory same-day instructions from a trustworthy final answer.

`lifecycle` derives the current state and supports corrections, retractions, dose changes, substitutions, and strict event linking. The server uses it when listing medicines and when building an emergency card, where each medication entry gets its state and “actual use not established” appended.

## The server

The Express server listens on `127.0.0.1:4100`. Next.js runs on port `5173` and rewrites `/api/...` calls to it.

### Login and sessions

- Passwords are hashed with `scrypt` and a salt.
- A successful login creates a random 32-byte token.
- Only the token's SHA-256 hash is stored in SQLite.
- The raw token is placed in an HTTP-only, same-site cookie for eight hours.
- Login attempts are limited in memory to 20 per IP per minute.
- State-changing requests reject unexpected or cross-site origins.

The rate limiter resets when the server restarts and would not coordinate between multiple server machines. That is acceptable for this local demo, not for a production deployment.

### Authorization

The app uses several server-owned relationships:

- an account can be bound to its own patient;
- a lab or hospital worker can be assigned a patient;
- a staff account has a stored role, facility, unit, and optional paired reader;
- an emergency grant belongs to one actor, one session, one patient, one release revision, and one expiry time.

Forbidden and missing records intentionally look similar to callers. This makes it harder to guess whether another patient's ID exists.

### Integrity and signatures

The demo creates an Ed25519 facility key pair. Clinician-confirmed versions are signed over a canonical, consistently ordered JSON representation.

Before releasing a profile, the server verifies:

- every signed version has a valid signature from the trusted demo key;
- every entry marked reviewed appears unchanged in a signed version.

This proves that demo data was not changed after signing. It does not prove that the signer is a real accredited clinician.

### Safe repeated requests

Mutations use a `requestId`. The server stores a fingerprint of the request and its result.

- Sending the same request again returns the original result.
- Reusing the ID with different content causes a conflict.

This prevents a shaky phone connection from creating two bookings, two records, or two dispatches.

### API groups

| Group | What it does |
|---|---|
| `/api/session` | Sign in, inspect the current session, or sign out |
| `/api/platform/context` | Return server-derived role and visible patient list |
| `/api/platform/profiles/...` | Read profiles and receipts; sign, release, revoke, report, book, snapshot, upload documents, add medicine, sign handwritten notes, or save a face |
| `/api/platform/patients` | Hospital registration of a new synthetic patient |
| `/api/platform/documents/...`, `/handwritten/...` | Download a private original or confirm text from it; view a handwritten-note image |
| `/api/platform/medications/...` | Append medication events and use reports |
| `/api/platform/ledger` | Lab-only simulated revenue ledger |
| `/api/platform/rfid/...` | Accept authenticated device scans, poll reader state, and briefly display an approved card |
| `/api/platform/linkage`, `/grants`, `/cards` | Turn a candidate into a short-lived approved view |
| `/api/platform/dispatch`, `/alerts/...`, `/events` | Send and update hospital arrivals |
| `/api/platform/faces...` | Store and retrieve hospital-only demo enrollments |
| `/api/platform/break-glass...` | Request and separately approve exceptional access |
| `/api/platform/offline...` | Check revocation and upload offline access receipts |
| `/api/platform/readers/provision`, `/readers/:id/revoke`, `/tags` | Admin-only reader provisioning/revocation and card-to-patient mapping |

## Storage: two filing systems in one database

The project uses Node 24's built-in SQLite module with foreign keys and write-ahead logging.

Login uses normal relational tables created by `server/src/storage/migrations/001_initial.sql`: `patients`, `actors`, `actor_patient_bindings`, and `sessions`. (That migration also creates `documents`, `claims`, `medications`, and `medication_events` from an earlier prototype; they are now always empty.)

`PlatformStore` creates its own tables on startup:

- `portal_roles` for staff role and location;
- `platform_objects`, a general box holding JSON objects by `kind` and `id` (profiles, tags, readers, scans, grants, alerts, documents, faces, medication records, the facility key, and so on);
- `platform_receipts` for the audit trail;
- `platform_requests` for idempotent mutation results.

This hybrid design is quick for a hackathon, but a production system would normally give major objects their own strongly constrained tables and migrations.

Transactions use `BEGIN IMMEDIATE`, then either commit everything or roll everything back. It is the database version of “all puzzle pieces go into the box, or none do.”

## Demo data

Two seeders run:

- `PlatformStore.seed()` runs every time the API starts and fills in anything missing: the Ed25519 facility key; the `siddharth`, `paramedic`, `lab`, `hospital`, `approver`, and `admin` accounts; Siddharth Raj Sharma's signed record (blood group, allergy, donor status, two vitals, and one condition deliberately left out of the emergency release); the development reader `reader-demo`; and the card UID `DEADBEEF`. `seedMedicationMatrix` then adds eight demo medicines covering active, unknown, stopped, ended, held, unresolved-brand, dose-change, and conflicting cases. These start outside the emergency release.
- `seedDatabase` (`npm run demo:seed`, or the first API start on an empty database) wipes all tables and adds two login-only fixture accounts used by the API tests: `maya.patient` and `demo.clinician`. They have no platform record, so their portals show nothing.

The seven-card RFID demo batch adds more fictional patients; see `docs/RFID_UNO.md`.

## Document intake and handwriting OCR

There are two related paths.

### Uploaded documents

Patients may upload a JPEG, PNG, or text PDF up to 10 MiB. Each patient may hold at most ten documents, and a PDF may have at most ten pages.

The server:

- checks magic bytes instead of trusting the filename;
- rejects suspicious PDF actions such as JavaScript, launch actions, or embedded files;
- extracts PDF text with PDF.js;
- validates images with Sharp and limits pixel count;
- de-duplicates by content hash;
- stores the original privately in the database (download is owner-only, sandboxed, and sent as an attachment);
- makes the patient confirm a page, character span, text, and date before it becomes an entry.

Confirmed entries are marked as unreviewed patient-sourced reports, not clinician-signed facts.

Image-only input becomes an attributed manual transcription. The system does not pretend that made-up OCR coordinates exist. (Uploaded documents are not run through OCR; that is only for handwritten notes below.)

### Handwritten clinical notes

The browser performs the image work:

1. Convert the image to grayscale.
2. Normalize shadows and contrast.
3. Estimate and correct skew.
4. Find individual writing lines.
5. Run a handwriting-trained TrOCR model in a Web Worker.
6. Run bundled Tesseract as a second reader.
7. Score both answers using confidence and prescription-like language.
8. Suggest cautious corrections from a medical lexicon.
9. Suggest categories such as medication, allergy, vital, or condition.
10. Require a clinician to review, edit, select, and sign each line.

The raw OCR line and original JPEG are retained as evidence. OCR is never silently promoted to a clinical fact.

The TrOCR model (`Xenova/trocr-small-handwritten`, 8-bit, about 64 MB) is downloaded from Hugging Face on first use and cached by the browser; it is the only thing OCR fetches from outside. Tesseract worker/core/language assets are bundled under `public/tesseract`. If TrOCR cannot load, Tesseract alone is used; setting `localStorage['pran-ocr-engine']='tesseract'` forces that mode.

## Face matching

The browser loads bundled face detector, landmark, and recognition models. It requires exactly one clear face and turns it into a 128-number descriptor.

Matching uses Euclidean distance with a threshold of `0.5`:

- no close result becomes `NO_MATCH`;
- one to three close results become ordered candidates;
- more than three becomes `AMBIGUOUS`;
- a model failure becomes `UNAVAILABLE`.

Distances are never shown. A result contains only handles, labels, and patient IDs. Consent is required before matching.

**Faces are stored.** When hospital staff register a patient with a photo, or later use “Add or update patient photo”, the browser sends a downscaled JPEG (at most 480 px on its longest side) and its 128-number descriptor to the server, which keeps both in SQLite. Both actions require ticking a consent box. Only hospital staff can list the stored descriptors (`GET /faces`) or view a stored photo (`GET /faces/:id/photo`), and every photo view writes a receipt.

Matching itself still happens in the browser: the hospital page downloads the stored descriptors, describes the new image locally, and compares. The image being checked is never uploaded. The lookup panel can also hold up to five session-only enrollments that never leave the browser and are cleared when the page closes.

## Offline mode

The service worker (`public/sw.js`) caches the app shell, `/_next/static` assets, face models, Tesseract files, icons, the logo, and page navigations, fetching from the network first and falling back to the cache or `offline.html`. It deliberately never caches `/api/` responses.

When a patient prepares an offline snapshot:

- the server builds only the currently approved emergency card;
- it binds the snapshot to a browser-generated device ID;
- it expires after eight hours;
- it signs the snapshot with Ed25519;
- the browser derives an AES-256-GCM key from a 12+ character phrase using PBKDF2-SHA-256 with 310,000 iterations;
- the encrypted snapshot is stored in IndexedDB.

On unlock, the browser checks the phrase, clock rollback, expiry, device binding, known revocation (asking the server when online), and signature before displaying anything. It records a local access receipt first and uploads queued receipts when online again.

An offline device cannot learn about a new revocation until it reconnects, so the UI warns that later changes may be unavailable.

## RFID hardware

The repository supports two approaches.

### ESP32 + RC522

`firmware/rc522` is a self-contained Wi-Fi reader:

- reads a card UID;
- creates a random event ID;
- sends it over HTTPS with a device bearer token;
- validates the server through a configured CA certificate;
- retries temporary failures using the same event ID;
- stores no patient data.

### Arduino Uno + Raspberry Pi bridge + LCD

`firmware/uno_scanner` reads an RC522 card and controls a 16x2 LCD. It speaks a tiny serial language:

- `PING` asks for hardware status;
- `CLEAR` resets the screen;
- `LCD<TAB>line 1<TAB>line 2` displays text;
- `SCAN<TAB>UID` reports a card.

The Uno removes duplicate rapid taps and clears patient text after eight seconds.

`firmware/pi_bridge/scanner.py` runs on a Raspberry Pi. It:

- reconnects when USB is unplugged;
- accepts HTTPS, or loopback HTTP through a tunnel;
- authenticates the reader to the API;
- retries scans safely;
- polls for approval;
- paginates complete fields onto the tiny LCD instead of silently cutting off an allergy or name;
- replaces unsupported characters or tells the operator to read the app;
- clears data after expiry or failure.

## Frontend details

- Next.js App Router supplies routes and metadata.
- React 19 renders the interactive client portal.
- Zustand holds language and theme; both are saved in `localStorage`, the theme only once the user explicitly picks one (light is the default).
- English and draft Nepali labels are available; the footer says native-speaker review is pending.
- Radix Dialog displays source evidence accessibly.
- Lucide supplies icons.
- QRCode makes the opaque locator image.
- The manifest and service worker make the project installable as a PWA.
- `styles.css` (Tailwind import, base tokens, form basics) and `platform/portal.css` implement responsive layouts, cards, warnings, portal boards, and dark mode.
- Noto Sans Devanagari is bundled for the Nepali text.

## Important files, one by one

### Root

| File | Plain-English purpose |
|---|---|
| `package.json` | Defines the npm workspaces and commands for development, build, tests, seeding, reset, phone mode, and RFID simulation |
| `package-lock.json` | Freezes exact package versions |
| `tsconfig.base.json` | Enables strict TypeScript safety rules for every workspace |
| `vitest.config.ts` | Runs Node-based unit and integration tests |
| `playwright.config.ts` | Runs browser tests against a disposable SQLite database |
| `readme.md` | Quick-start guide |
| `.env.example` | Reference environment variables (not loaded automatically) |

### Shared packages

| File | Purpose |
|---|---|
| `packages/contracts/src/index.ts` | Core schemas for dates, sources, medicines, sessions, and errors |
| `packages/contracts/src/platform.ts` | Newer portal schemas for profiles, releases, cards, faces, handwriting, scans, and alerts |
| `packages/domain/src/lifecycle.ts` | Event-based medication lifecycle logic (re-exported by `index.ts`) |

### Server

| File | Purpose |
|---|---|
| `server/src/index.ts` | Opens/initializes the database, starts the API, and shuts down cleanly |
| `server/src/app.ts` | Security headers, origin check, login rate limit, sessions, and mounting of the platform router |
| `server/src/storage/database.ts` | Opens SQLite, finds the migration, and provides transactions |
| `server/src/storage/migrations/001_initial.sql` | Creates the core relational tables and indexes |
| `server/src/storage/repository.ts` | Actor, session, and patient-binding queries |
| `server/src/storage/seed.ts` | `hashPassword` (scrypt) and the login-only test fixtures |
| `server/src/storage/demo-paths.ts` | Prevents reset code from targeting any database except the named demo file |
| `server/src/storage/seed-cli.ts` | `npm run demo:seed`: wipes and reseeds, and writes the demo-workspace marker |
| `server/src/storage/reset-cli.ts` | Safely removes only marked demo SQLite files |
| `server/src/platform/store.ts` | Generic platform object store, receipts, request replay protection, signatures, and the portal-account/Siddharth seed |
| `server/src/platform/routes.ts` | Main profiles, RFID, release, registration, face, handwritten, dispatch, alerts, booking, ledger, and offline routes |
| `server/src/platform/intake.ts` | Safe PDF/image import and confirmation |
| `server/src/platform/medications.ts` | Medication creation, lifecycle events, and use reports |
| `server/src/platform/operations.ts` | Reader/tag administration, break-glass approval, and offline revocation checks |
| `server/src/platform/fixtures.ts` | Seeds Siddharth's eight demo medication cases |
| `server/src/platform/enroll-demo-batch.ts` | Atomically turns seven named RFID cards into fictional demo patients |
| `server/tsup.config.ts` | Bundles the API into `server/dist` for `npm start` |

### Web app

| File | Purpose |
|---|---|
| `apps/web/next.config.mjs` | Proxies `/api/*` to the Express API on port 4100 |
| `apps/web/src/app/layout.tsx` | Global metadata, fonts, CSS, and early dark-theme setup |
| `apps/web/src/app/manifest.ts` | PWA name, icons, colors, start page, and shortcuts |
| `apps/web/src/app/page.tsx` | Redirects `/` to `/patient` |
| `apps/web/src/app/*/page.tsx` | Very small route entry points for the four portals |
| `apps/web/src/platform/Portal.tsx` | Main role-aware UI and most user journeys |
| `apps/web/src/platform/client.ts` | Fetch helper, preferences, translations, and request IDs |
| `apps/web/src/platform/Workflows.tsx` | Document, medication, use-report, and break-glass forms |
| `apps/web/src/platform/RegisterPatient.tsx` | Hospital registration, optional face data, and locator QR |
| `apps/web/src/platform/EnrollFace.tsx` | Add/update the stored face photo for a patient the hospital registered |
| `apps/web/src/platform/FaceLookup.tsx` | Consent-gated local matching against stored and session-only faces |
| `apps/web/src/platform/PhotoCapture.tsx` | Camera/upload component with careful stream and URL cleanup |
| `apps/web/src/platform/face.ts` | Face model loading, description, distance, and cautious result states |
| `apps/web/src/platform/HandwrittenUpdate.tsx` | OCR review and clinician signing screen |
| `apps/web/src/platform/ocr.ts` | Coordinates preprocessing, TrOCR, Tesseract, and winner selection |
| `apps/web/src/platform/ocr.worker.ts` | Runs the handwriting model away from the main UI thread |
| `apps/web/src/platform/ocr-image.ts` | Pure grayscale, shadow, threshold, skew, and line-segmentation math |
| `apps/web/src/platform/medical-lexicon.ts` | Corrects likely drug/unit OCR mistakes and scores plausibility |
| `apps/web/src/platform/categorize.ts` | Suggests a record type from keywords while keeping the raw line |
| `apps/web/src/platform/offline.ts` | Encryption, signature checks, IndexedDB vault, and receipt syncing |
| `apps/web/public/sw.js` | Offline shell cache that excludes API data |
| `apps/web/public/offline.html` | Page shown when offline and the requested page is not cached |
| `apps/web/src/styles.css` and `platform/portal.css` | Visual design, responsiveness, portal widgets, and dark mode |

### Scripts, firmware, and assets

| Path | Purpose |
|---|---|
| `scripts/simulate-rfid.mjs` | Sends one authenticated fake card scan (`npm run rfid:simulate`) |
| `scripts/capture-rfid-cards.mjs` | Collects seven physical cards in first-seen order without assigning patients yet |
| `scripts/enroll-demo-batch.ts` | Generates private passwords first, then atomically registers a named seven-card batch |
| `scripts/phone.mjs` | Builds the app, opens a temporary Cloudflare HTTPS tunnel, starts both servers, and prints a QR code (`npm run phone`) |
| `apps/web/scripts/generate-icons.mjs` | Rebuilds PWA icons from source artwork |
| `firmware/rc522` | ESP32 Wi-Fi reader implementation |
| `firmware/uno_scanner` | Arduino reader and LCD implementation |
| `firmware/pi_bridge` | Raspberry Pi serial-to-API bridge, service file, and tests |
| `docs/RFID.md`, `docs/RFID_UNO.md`, `docs/DEVICE_MATRIX.md` | Hardware setup and supported-device notes |
| `docs/ASSET_LICENSES.md` | Licences and SHA-256 hashes of bundled models and OCR files |
| `apps/web/assets` | Source artwork for the logo and icon |
| `apps/web/public/brand`, `apps/web/public/icons` | Generated logo and app icons |
| `apps/web/public/models` | Bundled face-model weights |
| `apps/web/public/tesseract` | Bundled Tesseract runtime and English language data |

## What the tests protect

Vitest covers the rule and API layers. Playwright drives real browser portals. Python tests cover the Pi bridge.

The tests specifically check:

- session cookies, role forgery at login, and allowed-origin checks;
- medication states, conflicts, course ends, corrections, and retractions;
- role forgery, patient signing, unassigned-lab, and wrong-destination denial;
- authenticated and deduplicated RFID scans;
- LCD approval, expiry, logout, release change, new-card isolation, and failed auditing;
- grant expiry, revocation, session binding, and break-glass two-person approval;
- signed-record tamper detection;
- private originals and attributed transcriptions;
- patient registration, duplicate protection, optional/later face enrollment, and seven-card atomic enrollment;
- offline encryption, wrong phrases, expiry, signature tampering, receipts, and offline reload;
- face candidate-only results;
- OCR image segmentation, shadows, touching lines, blank pages, skew, lexicon fixes, and categorization;
- light/dark theme behavior and key end-to-end portal journeys;
- the Pi bridge's LCD paging, UID formats, character handling, command-injection safety, and refusal of unencrypted remote APIs.

## How to run it

Requirements: Node.js 24+ and npm 11+.

```powershell
rtk npm install
rtk npm run dev
```

Then open `http://localhost:5173`. The database and demo accounts are created on the API's first start.

Useful demo accounts include:

| Portal | Username | Password |
|---|---|---|
| Patient | `siddharth` | `pran-demo-siddharth` |
| Paramedic | `paramedic` | `pran-demo-paramedic` |
| Hospital | `hospital` | `pran-demo-hospital` |
| Lab | `lab` | `pran-demo-lab` |
| Break-glass approver | `approver` | `pran-demo-approver` |
| Admin (API only) | `admin` | `pran-demo-admin` |

Verification commands:

```powershell
rtk npm run typecheck
rtk npm run test
rtk npm run build
rtk npm run test:e2e
```

`test:e2e` needs a fresh `npm run build`, free ports 5173/4100, and Microsoft Edge.

## Honest limitations

This is a thoughtful hackathon prototype, not a production clinical system.

- All data and credentials are demo data.
- The facility signing key is stored in the same demo database, not a secure key service.
- Consented face photos and descriptors are stored in the demo database; there is no retention limit or delete control.
- The generic JSON object table has fewer database-level rules than dedicated tables would.
- The login limiter is only in one process's memory.
- Break-glass approval creates a grant, but the paramedic screen only shows the approval status; there is no button yet to open the card with it.
- The two older login fixtures (`maya.patient`, `demo.clinician`) exist only for tests and see no data.
- No production backup, disaster recovery, key rotation, regulatory validation, clinical governance, or real identity proofing is implemented.
- Nepali copy still needs native-speaker review, and verified Bikram Sambat conversion is intentionally unavailable.
- The Cloudflare quick tunnel is a demo convenience, not a production deployment plan.
- OCR and face matching can be wrong, so the design keeps them as human-reviewed suggestions.

## Tiny glossary

| Word | Kid-friendly meaning |
|---|---|
| API | A waiter carrying requests between the screen and the server |
| Schema | A rule-shaped cookie cutter for data |
| Hash | A one-way fingerprint of some data |
| Signature | A mathematical tamper-evident seal |
| Session | A temporary “you are signed in” pass |
| Grant | A smaller, short-lived key to one approved record view |
| Revision | A numbered version of something |
| Idempotent | Safe to repeat without accidentally doing it twice |
| Transaction | An all-or-nothing group of database changes |
| OCR | Software trying to read words from a picture |
| PWA | A website that can behave like an installed phone app |
| RFID | A card/tag that shares a small ID over radio when tapped |
| SSE | A simple open line where the server can say, “please refresh” |
| Provenance | The story of where information came from |

## If a kid remembers only five things

1. Pran Rekha is a pretend medical-record system for a demo.
2. Facts keep links to their sources instead of pretending to be unquestionable truth.
3. The patient chooses what may be shared in an emergency.
4. Every emergency key is narrow, temporary, checked by the server, and recorded.
5. Computers may suggest text or faces, but a human must confirm important decisions.
