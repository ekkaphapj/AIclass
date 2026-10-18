# AI Police Lab · By: Dr.Ake

Mobile practice classroom and desktop instructor monitor on Cloudflare Workers + D1. Eight exercises, seven required. The music exercise (7) is optional. See [Thai instructor guide](docs/คู่มือฉบับ8ข้อ.md).

**Continuing this project as an agent?** Read [AGENTS.md](AGENTS.md) first, then [the engineering handoff](docs/AGENT_HANDOFF.md) for architecture, API/data contracts, testing, deployment, and known limitations. The repository intentionally excludes operational secrets and learner data. Safe local templates: [.dev.vars.example](.dev.vars.example) and [.secrets.example.json](.secrets.example.json).

## Student flow

Register with class code, roster number/name/group, and a self-selected four-digit numeric PIN. Leading zeroes are preserved. Return using roster number + PIN. Existing students can set a PIN with the key button; an instructor can reset it to four digits, invalidating old student sessions.

One exercise per page, previous/next buttons, clickable steps, progress based on seven required submissions, and editable answers. Local and server drafts preserve unsent work; only explicit submission appears to the instructor. Re-submission clears previous feedback/score for a fresh review. Exercises 1–5 collect pasted external AI answers; 4/5 provide downloadable training images. Exercise 6 has an 18-row fictional dataset, five separately stored answers and persistent contextual OpenRouter chat. Exercises 7/8 accept HTTPS links to Gemini work. Pre/post quizzes remain available in the footer.

## Run and deploy

```powershell
npm ci
npx wrangler types
npx wrangler d1 migrations apply ai-class-p4 --local
npm run build
npm run preview
```

Ignored local `.dev.vars` and `.secrets.json` contain OPENROUTER_API_KEY, ADMIN_PASSWORD and CLASS_CODE. The fixed instructor password/class code requested by the owner are configured as Cloudflare secrets; they are not included in client JS. `credentials.local.txt` is the private handoff file. Never publish these files.

```powershell
npm run typecheck
npm run build
npx wrangler d1 migrations apply ai-class-p4 --remote
npx wrangler secret bulk .secrets.json
npx wrangler deploy
```

Migrations are additive and do not delete students. The current instructor URL is /instructor. Changing a secret needs no client rebuild. Model and estimate prices are configured in wrangler.jsonc.

## AI operation

GLM 5.3 Flash via OpenRouter, server-only key, maximum 18 successful/in-flight requests per learner, one active per learner and 12 globally. Default class budget US$3 and 1,800 successful/in-flight calls; instructor adjustable. Atomic reservation is US$0.004 per admission, replaced with reported cost on success; uncertain/failed requests conservatively retain the reservation. Low reasoning, 2,400 output tokens including reasoning, 55-second provider timeout. Reasoning is not returned to the client. Busy admissions wait/retry in the browser for a bounded interval, not a durable background queue.

Exercise 6 gets its dataset from server source, not untrusted client context. Chat history belongs to one student, persists in D1, and includes up to three preceding turns with capped lengths in each provider request. Duplicate request IDs replay the cached result without a second provider call. AI text does not automatically become a submitted answer.

## Instructor

Monitor refreshes every 10 seconds; “online” means activity within 90 seconds. Eight submission columns, seven required completion count, help requests, admission and AI controls, optional sequential locking, CSV export, manual comments and 0–10 scores. Projection hides author metadata by default, but inspect pasted content for names before projecting. Scores are manual per exercise, not automatically weighted course grades.

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
