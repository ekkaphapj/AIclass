# AI Police Lab · By: Dr.Ake

Mobile practice classroom and desktop instructor monitor on Cloudflare Workers + D1. Eight exercises, seven required. The music exercise (7) is optional. See [Thai instructor guide](docs/คู่มือฉบับ8ข้อ.md).

**Continuing this project as an agent?** Read [AGENTS.md](AGENTS.md) first, then [the engineering handoff](docs/AGENT_HANDOFF.md) for architecture, API/data contracts, testing, deployment, and known limitations. The repository intentionally excludes operational secrets and learner data. Safe local templates: [.dev.vars.example](.dev.vars.example) and [.secrets.example.json](.secrets.example.json).

## Student flow

The landing page first asks for a role: student or instructor. Students register by typing their own numeric student ID (1–6 digits, the server rejects duplicates), choosing their class group (1–5) and entering their name — a confirmation screen echoes the registered ID. That student ID is the only credential needed to log in again on any device. There is no class code and no need to wait for the teacher. Login throttles still apply.

After login students land on their home view: how many required exercises are done, the score received so far, a per-exercise list with their own answers and any teacher feedback, and a start/continue/redo button. A mid-session reload returns to the exact exercise page left behind (device storage first, then the server-tracked current lesson). Local and server drafts preserve unsent work; only explicit submission appears to the instructor, and submitting automatically moves to the next exercise (except lesson 6, which stays open for its analysis chat). Re-submission clears previous feedback/score for a fresh review. Exercises 1–5 collect pasted external AI answers; 4/5 provide downloadable training images. Exercise 6 has an 18-row fictional dataset, five separately stored answers and persistent contextual OpenRouter chat. Exercises 7/8 accept HTTPS links to Gemini work. Once all seven required exercises are submitted, students enter a final summary page: one button runs a single OpenRouter grading pass with per-exercise 0–10 scores, an average, and a reachability check of the music/infographic links. The rubric is intentionally simple: correct and complete answers get 7 with up to 3 more for detail, and a working song/image link earns full marks (max 5 runs per student; teacher manual scores stay official). Pre/post quizzes remain available in the footer.

## Run and deploy

```powershell
npm ci
npx wrangler types
npx wrangler d1 migrations apply ai-class-p4 --local
npm run build
npm run preview
```

Ignored local `.dev.vars` and `.secrets.json` contain OPENROUTER_API_KEY and ADMIN_PASSWORD (a legacy CLASS_CODE value may remain but is no longer used by the app). The instructor password is configured as a Cloudflare secret and is not included in client JS. `credentials.local.txt` is the private handoff file. Never publish these files.

```powershell
npm run typecheck
npm run build
npx wrangler d1 migrations apply ai-class-p4 --remote
npx wrangler secret bulk .secrets.json
npx wrangler deploy
```

Migrations are additive and do not delete students. The current instructor URL is /instructor. Changing a secret needs no client rebuild. Model and estimate prices are configured in wrangler.jsonc.

## AI operation

GLM 5.3 Flash via OpenRouter, server-only key, maximum 18 successful/in-flight chat requests per learner, one active chat per learner and 12 requests globally. The end-of-class final review is a separate allowance of 5 runs per student (still inside the shared class budget, request cap and global concurrency). Default class budget US$3 and 1,800 successful/in-flight calls; instructor adjustable. Atomic reservation is US$0.004 per admission, replaced with reported cost on success; uncertain/failed requests conservatively retain the reservation. Low reasoning, 2,400 output tokens including reasoning, 55-second provider timeout. Reasoning is not returned to the client. Busy admissions wait/retry in the browser for a bounded interval, not a durable background queue. The final review grades submitted answers per exercise against the task (lesson 6 against the dataset's reference counts) and reports link reachability; the model never sees link content and its scores are advisory.

Exercise 6 gets its dataset from server source, not untrusted client context. Chat history belongs to one student, persists in D1, and includes up to three preceding turns with capped lengths in each provider request. Duplicate request IDs replay the cached result without a second provider call. AI text does not automatically become a submitted answer.

## Instructor

Instructor login is the second choice on the landing page (or `/instructor`) with the production password. Monitor refreshes every 10 seconds; “online” means activity within 90 seconds. A group dropdown (all/1–5) filters everything: students in group, finished/not-finished counts, per-exercise submitted/correct/incorrect tallies (correct = AI final-review score ≥ 5), help requests and the roster. The roster shows each student's completion date/time and average score, with sorting by completion time or score. Eight submission columns, admission and AI controls, optional sequential locking, CSV export, manual comments and 0–10 scores. Projection hides author metadata by default, but inspect pasted content for names before projecting. Scores are manual per exercise, not automatically weighted course grades.

## Validation

```powershell
npm test
node scripts/production-smoke.mjs
```

Tests expect a running local preview and ignored secret configuration. The suite exercises numeric PINs, drafts, all eight pages, both image downloads, five analysis answers, optional skipping, contextual live AI, idempotency, permissions, budget/lesson controls, reviews and projection. It spends a small amount of actual OpenRouter credit. Production smoke creates one specifically named temporary student and deletes only that fixture afterward, preserving existing learners.

The historical local load test exercised 150 simultaneous registrations and submissions, without 150 AI calls. It is not a production capacity guarantee. `scripts/load-test.mjs` is local-only and requires capacity for 150 fixtures.

Images and provenance: [training assets](docs/training-assets.md). Screenshots/reports are in ignored test-results/. [Validation record](docs/validation.json).

## Data

Opaque hashed sessions, HttpOnly/SameSite cookies (Secure on HTTPS), role/ownership checks, parameterized SQL, bounded input, per-IP and per-student login throttles, HTTPS link validation, private legacy attachments, cross-origin write rejection, safe text rendering and CSV formula escaping. No third-party font requests or analytics. This remains a single class without automatic retention/deletion. Use fictional/public training material only. Real legal/procedural content requires checking against official sources and the unit's approved procedures.

## Extension missions (October 2026)

After all seven required original exercises are submitted, students can open two separate 10–15 minute missions from home or the final-summary page: a fictional investigation with witness/CDR/vehicle records, and a 68-incident community patrol planning exercise. Server-side gating protects the content and submissions. Original course completion and grades are unchanged.

Extension answers and HTTPS presentation links live in `extension_work` (migration 0004). Drafts save locally while typing; the explicit save button persists across devices. Saving a draft after submission changes its status back to started. Students can export a PNG timeline/clock template, then share the image through their chosen service and submit its HTTPS link. The scene asset is an illustrative plan, not a photograph. External AI calls are made in the learner's chosen AI service.

Instructor overview shows group-filtered started/submitted totals and per-student A/B states (locked, ready, started, submitted). Click either status to inspect drafts, answers and presentation links. Extension grading remains separate from original scores. Design and instructor reference: [Thai extension guide](docs/ภารกิจต่อยอด-สองสถานการณ์.md).

Focused local checks without paid provider requests:

```powershell
npx playwright test tests/extensions.spec.ts tests/classroom-v2.spec.ts --grep "extension gating|self-entered|returning login"
```

The legacy budget test requires a nonempty local API key value to reach admission checks; an explicitly fake local test placeholder suffices for this filtered command. Do not run live AI tests with a placeholder or upload local test secrets.
