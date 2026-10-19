# Agent handoff

This is the engineering handoff for continuing AI Police Lab without needing the original chat. Start at the root `AGENTS.md`; the Thai teaching workflow is in [คู่มือฉบับ8ข้อ.md](คู่มือฉบับ8ข้อ.md).

## Deployment identity and current scope

- Repository: https://github.com/ekkaphapj/AIclass (public; do not include operational credentials).
- Worker/project: `ai-class-p4`.
- Student URL: https://ai-class-p4.ekapap-j.workers.dev/
- Instructor URL: https://ai-class-p4.ekapap-j.workers.dev/instructor
- Cloudflare D1 binding: `DB`; name/ID are tracked in `wrangler.jsonc`. `ASSETS` serves the Vite build.
- Last feature release verified in `docs/validation.json`: course v2, eight exercises, seven required; deployed version recorded there is historical, not a promise that it is still the newest deployment.
- The operator chose a fixed production teacher password (Cloudflare secret + ignored local handoff files). The former class code and student PINs were retired by owner request: students now register with their own numeric student ID (1–6 digits, duplicate-checked), group (1–5) and name; that ID is the only login credential. Number-only login is weaker than the old number+PIN flow; per-number and per-IP login throttles remain. Do not print credentials or place them in this public repository.

The main audience is approximately 150 police cadets using phones in a two-hour class. The teacher uses a desktop monitor. All data/examples are fictional. The latest owner direction favors short natural Thai copy, simple copy/paste tasks and one exercise per page, rather than a dashboard of many simultaneous student tasks.

## Course contract

| ID | Exercise | Submitted content |
| --- | --- | --- |
| 1 | One-line question about police patrol duties, asked in external Gemini/ChatGPT | Pasted answer |
| 2 | More complex Thai police/legal question with source checking | Pasted answer |
| 3 | Chinese tourist report about missing passport/phone; translate and research appropriate next steps | Translation, follow-up questions, assistance plan and verified official links |
| 4 | Download fictional official-style document image; ask external AI to transcribe | OCR text, not translation |
| 5 | Download unknown-device image; compare possible device types using visible features | Candidate identifications, supporting features and uncertainty |
| 6 | Analyze 18 fictional incidents in four subdistricts | Five separate answers, 6.1–6.5 |
| 7 | Optional upbeat male-vocal luk thung/molam call-center-scam warning song in Gemini | HTTPS work link; skipping does not block completion |
| 8 | Patrol-workflow infographic generated in Gemini using example prompt | HTTPS work link |

`requiredLessons` excludes ID 7. Instructor and student completion use the set of required IDs. The class is organised into five groups; students pick group 1–5 at registration (stored in `students.squad` as "1"–"5"), and the instructor monitor filters every metric, tally and the roster by group. Some page bounds, labels, and chat routing still explicitly assume eight exercises and analysis at ID 6. If changing the course structure, search both frontends and `worker/index.ts`; changing the lesson array alone is insufficient.

The data lives in `shared/activities.ts`; teacher reference: 18 incidents; areas หนองแสง 6, บ้านใหม่ 5, ทุ่งทอง 4, คลองใส 3. Time bands are 00:00–05:59, 06:00–11:59, 12:00–17:59, 18:00–23:59; evening has 10 incidents. Evening theft: 5, of which 4 in หนองแสง. Evening robbery in บ้านใหม่: 3. The patrol plan is open-ended and must account for the limits of this small sample.

Training images are committed in `public/training/`. Their provenance and generation prompt are in [training-assets.md](training-assets.md). The OCR PNG can be regenerated deterministically with `node scripts/render-training-document.mjs` after installing Chromium; keep the fictional-document markings. Do not regenerate or overwrite the selected object photo unnecessarily.

## Runtime structure

```text
Browser (React/Vite)
  /                 student registration/login or active student view
  /instructor       teacher login or active monitor
       |
       +-- /api/* --> worker/index.ts
                         |-- D1 DB binding (all application records)
                         |-- OpenRouter (server-side text calls)
                         `-- ASSETS (built dist/ and training files)
```

The app is one Worker with static assets, not Pages, not a separate Node server. SPA fallback handles client paths. Fonts are bundled locally. `public/_headers` sets CSP and related headers. There is no external font or analytics dependency.

### Frontend state and saves

- `App` in `src/main.tsx` loads `/api/config` and `/api/me`, then selects login, student or instructor UI by session role. The landing page offers a role chooser (student/instructor); `/instructor` opens the teacher login directly. Students and teachers share the browser cookie name, so use separate browser contexts/profiles for end-to-end tests.
- `src/Student.tsx` opens on the student home view (progress, average score, per-exercise answers, start/continue/redo). The last view is kept in `sessionStorage` under `p4-view-<student-id>` so a mid-session reload returns to the exact view; logout clears it so the next login lands on home. Active page lives under `p4-page-<student-id>` and current-course drafts under `p4-v2-<student-id>-<lesson-id>` in localStorage. On login the page restores from localStorage first, then the server-tracked `current_lesson`, so a student returning on another device still continues on the page they left (clamped to the teacher's active lesson when sequential locking is on). On entry, `initialFields` chooses newer server/local drafts over an older submission.
- Changes save locally immediately, debounce server saves by 700 ms and serialize them through a promise chain. Navigation flushes drafts; final submission waits for earlier saves and clears the local draft. Preserve these ordering properties when refactoring.
- Explicit submission is required. A saved draft is not teacher-visible submitted work. Sending chat messages is not submitting answers.
- Student presence/profile updates run roughly every 30 seconds; config updates roughly every 20. Teacher monitor polls every 10. “Online” is activity within 90 seconds, not formal attendance verification.
- `src/student.css` is loaded after `src/styles.css`. It owns the current police palette/student layout and overrides some legacy instructor/login styles. Check both files before adding another override.

### Backend routes

All handlers are in `worker/index.ts`. JSON errors have `{error}` plus HTTP status; retryable busy AI responses also use `{retry:true}`.

| Access | Routes | Purpose |
| --- | --- | --- |
| Public | `GET /api/health`, `GET /api/config` | Health/public class configuration; no credentials |
| Public with throttles | `POST /api/register`, `/api/login`, `/api/admin/login` | Group+name registration with a student-entered unique numeric ID (409 on duplicates), ID-only student login, instructor login |
| Session | `GET /api/me`, `POST /api/logout` | Current role/profile/state and logout |
| Student | `POST /api/heartbeat`, `/api/help` | Presence and help |
| Student | `POST /api/draft`, `/api/submission`, `/api/quiz` | Drafts, explicit final work and pre/post quizzes |
| Student | `GET /api/chat`, `POST /api/ai` | Private analysis history and AI calls |
| Student | `POST /api/final-review` | End-of-class AI grading of every submitted exercise with link reachability checks; requires all seven required lessons |
| Owner/teacher | `GET /api/image/:submissionId` | Private legacy uploaded image |
| Teacher | `GET /api/admin/overview`, `/api/admin/student/:id`, `/api/admin/export` | Monitor, detailed submissions, CSV |
| Teacher | `POST /api/admin/settings`, `/api/admin/review`, `/api/admin/clear-help` | Class controls, review, help resolution |

The image upload API is legacy support; current tasks 4/5 use provided public training images and text answers. Work links must be HTTPS; drafts allow incomplete link text until final submission. Backend checks all five analysis answers before accepting exercise 6. It builds the readable `result` from them, not from a client-supplied combined result.

### D1 schema

Apply migrations in order; do not edit previously applied files.

| Table | Important behavior |
| --- | --- |
| `settings` | Single row `id=1`; title, expected count, active lesson, sequential lock, admission/AI pause, cumulative budget and request cap |
| `students` | Unique student-entered numeric `number` (1–6 digits, leading zeroes normalized away); `name`; class group `"1"`–`"5"` in `squad`; `recovery_hash` is a legacy NOT-NULL random filler (PIN logins were retired); presence and help |
| `sessions` | Hashed opaque token; student or admin role; 12-hour expiry |
| `submissions` | Unique `(student_id,lesson)`; prompt/result/reflection/tool/link, media/status/score/feedback; `answers_json` added in migration 0002 |
| `drafts` | Per student/lesson JSON text and update time |
| `quizzes` | Per student + pre/post kind; first submitted score is retained |
| `ai_jobs` | Idempotency ID, owner, status, reserved and actual cost, cached result. `lesson=0` rows are end-of-class final reviews; `lesson>0` counts feed the 18-per-student chat quota |
| `chat_messages` | Per-student analysis history; added by migration 0002 |
| `final_reviews` | One row per student with the latest AI final-review status/result; added by migration 0003 |
| `attachments` | Legacy private image data URLs; authorization required when reading |
| `login_attempts` | Throttle counters; 10-minute windows |

Final work is upserted. Re-submission resets status to `submitted`, clears score/feedback, and updates timestamp. Reviews use `reviewed` or `revision`; scores are manual 0–10, not a course-weighted calculation. Foreign-key cascades mean deleting a student also deletes their related work/sessions/chat. Never use a broad student deletion to clean up tests.

## OpenRouter behavior

Secrets: `OPENROUTER_API_KEY`, `ADMIN_PASSWORD` (a legacy `CLASS_CODE` secret may still exist in Cloudflare but nothing reads it). Runtime model/price estimates: `AI_MODEL`, `AI_INPUT_PRICE`, `AI_OUTPUT_PRICE` in Wrangler config. The existing model is `z-ai/glm-5.3-flash`; verify live availability/pricing before replacing it.

- Admission is an atomic `INSERT ... SELECT` conditioned on per-person/global concurrency, quotas and reserved cost. Do not split the checks into a read-then-write race.
- Per student: 18 successful/running chat calls (jobs with `lesson>0`); one active chat call. Global concurrency: 12 across everything. Defaults: US$3 cumulative and 1,800 successful/running calls.
- `POST /api/final-review` requires every required lesson submitted, then admits a `lesson=0` job (separate 5-per-student allowance, shared global caps/budget). It fetches each submitted HTTPS work link once (8-second timeout) for a reachability label, sends one grading call with the text-exercise answers plus the lesson 6 reference counts, and stores strict-JSON scores (averaged over the seven required), summary and link labels in `final_reviews` and the job's cached result. The rubric is deliberately coarse per owner request: correct and complete text answers start at 7 with up to 3 more for detail; link exercises (7/8) are scored by the server from the reachability check alone — opens = 10, broken = 0, inconclusive = 7 — and are not sent to the model. Duplicate job IDs replay the stored review. Edited submissions after a review leave the stored review in place; the student UI flags it stale and re-running spends another of the five runs. Instructor manual scores remain the official review.
- Reserve US$0.004 before calling. Success replaces it with reported usage cost, or configured token-price estimate. Failed/uncertain calls retain a conservative reservation as cost. Running records older than 90 seconds are reclaimed as failed with reserved cost.
- Maximum output: 2,400 tokens including reasoning; provider timeout: 55 seconds. Model rejects reasoning disabled, so keep `reasoning: {effort:'low',exclude:true}` unless a tested model change requires otherwise.
- For lesson 6, the Worker injects the source dataset and five questions, then up to three preceding turns with truncated lengths. It does not trust client-supplied dataset content as the authoritative source.
- Student chat history persists in D1. A repeated job ID returns the cached response rather than issuing another provider request. Failed job IDs need a new request ID to retry.
- The browser retries busy admission with the same ID for a bounded interval. This is **not** a durable background queue. Closing a page before admission does not leave a queued task.
- Built-in AI handles text only. Images/music are created externally. Do not promise image generation merely because OpenRouter is integrated.

## Clean checkout and testing

Use Node 24/npm. Run `npm ci`, copy the safe templates to ignored `.dev.vars` and `.secrets.json`, then edit those copies. `.dev.vars` is used by local Wrangler; `.secrets.json` is read by test/script login helpers. Keep their admin/class values consistent. An empty API key is sufficient for build/typecheck but **not** for the current full integration suite.

```powershell
npx wrangler types
npx wrangler d1 migrations apply ai-class-p4 --local
npm run typecheck
npm run build
npx playwright install chromium
npm run preview
```

Keep preview running, then run `npm test` in a second terminal. Playwright is serial because tests share a fixture/flow. Current API test contexts hardcode `http://127.0.0.1:8787`; setting `TEST_BASE_URL` alone does not safely retarget the suite. Do not point tests at production by changing only that environment variable.

The suite creates local students, makes real paid AI calls and tests PINs (including leading zeroes), one-page navigation, editable drafts, image downloads, five analysis answers, optional completion, chat history/idempotency, access/CSRF/budget/lesson controls, review, and projection. It does not prove current 150-user production performance. Screenshots/traces/reports stay in ignored directories. Chromium success is not a claim of physical-device Safari/Android testing.

`node scripts/load-test.mjs` creates 150 local virtual learners and does not call AI. It requires spare capacity (the app caps registrations at 300), changes local data and leaves fixtures. Do not run it repeatedly against an accumulated local class or against production. Prefer an isolated fresh local persistence directory when developing a load-test workflow.

`node scripts/production-smoke.mjs` delegates to `production-v2-smoke.mjs`, is hardcoded to the deployed URL, makes a real AI call and writes one specifically named production test pupil. Its `finally` cleanup deletes only that exact generated ID/number/name/group. Treat it as an explicitly scoped production operation; if it fails before fixture capture or cleanup fails, inspect ignored `test-results/production-fixture.json` and verify ownership before manually removing anything. Never “clean up” by deleting all rows.

Historical verification is in `docs/validation.json`. Update evidence honestly when behavior changes, retaining the limitation that the recorded 150-user run belonged to course v1 and did not invoke 150 simultaneous AI requests.

## Releases and rollback

For an authorized code release:

1. Inspect current Git changes and preserve unrelated owner work.
2. Build/typecheck; run meaningful tests for affected flows.
3. Keep the production binding identity in `wrangler.jsonc`. If adding schema, add a new migration and apply it before code that requires it.
4. Run `npx wrangler deploy --dry-run`, then the explicitly intended remote migration command and `npx wrangler deploy`.
5. Update secrets only when the task requires it, using an actual ignored credential file or secure secret input. Never bulk-upload `.secrets.example.json`: it would overwrite real keys with placeholders/empty values.
6. Record the deployment result and verification limits. Run the production smoke only within an authorized release/test scope.

GitHub push is not configured to auto-deploy; the repository currently has no deployment workflow. A documentation-only commit/push does not need a Cloudflare deployment. Runtime secrets and D1 data are not stored in Git. Redeploying source does not reset class data.

For rollback, inspect the actual current deployment history with Wrangler and its current CLI help before choosing a prior version. Source rollback does not reverse D1 migrations. Keep migrations backward compatible where possible; do not restore a database or drop tables as a casual code rollback. Avoid replacing the active production database merely to reproduce a clean local environment.

## Known boundaries and useful follow-ups

- Single classroom, no class/tenant ID; no reusable-cohort archive/reset flow yet.
- No automatic retention/deletion policy; no official identity/attendance verification.
- No weighted course grade or certificate generation. The end-of-class AI review gives advisory per-exercise scores; instructor reviews and 0–10 scores remain manual and official.
- No durable work queue, live WebSocket presence, model fallback, offline service worker, or resumable file-upload flow.
- The instructor file is still large; changing shared UI/layout requires checking both screens. Some teacher reference prose and numeric course labels are intentionally explicit and can drift if the dataset changes.
- Number-only student login (no PIN, no class code) is an owner choice made for classroom speed. Keep session authorization and the per-number/per-network login throttles; do not silently reintroduce or remove credentials without an owner request.
- Law answers, generated infographics and object descriptions are training outputs, not validated legal/procedural decisions. Do not bake an AI's unverified response into an official answer key.

Before handing off another change, summarize what changed, tests actually run, deployment status, and any remaining limitation. Keep credentials and real learner records out of Git and final public artifacts.

## Extension chat and revised content (2026-10-19)

Exercise 3 now requires Chinese translation plus follow-up assistance research with official links (no promise of travel permission). Exercise 5 uses unknown-device.png and asks for candidate device types and evidence, not a general scene caption. See training-assets.md for image provenance.

Both extension missions offer OpenRouter or external Gemini in step 2. /api/ai accepts extension=1/2; server verifies all seven original required submissions before calls/replay and injects its own case dataset. Internally these use ai_jobs/chat_messages lesson=9/10; original lesson validation still accepts only 1–8 and lesson 6 chat is unchanged. All chats share the existing 18 successful/running allowance, atomic reservation, global concurrency, budget, retries and idempotency rules. /api/chat?extension=1 or 2 retrieves only the authenticated learner's matching history and rechecks unlock. Job IDs cannot be replayed across lesson/extension/final-review scopes.

Internal AI is text-only, with no web search or image generation. Learners may submit a text diagram without a work link; supplied links still require HTTPS. Copying an AI answer never submits it automatically. Mission 1 asks for a person–phone–IMEI evidence diagram with times, R labels and uncertain links rather than a reenactment image; mission 2 remains a simple count/map/patrol planning task. No migration needed.

Run npm run test:extension-ai for eight mocked-provider tests executing the actual Worker against in-memory SQLite using applied migration SQL. Browser checks are separate; neither is proof of live provider availability. A full suite still needs a real local API key.

## Grading revision

worker/grading.ts contains private answer keys; do not expose these through student data APIs or import it into frontend code. /api/final-review now supplies Chinese source/reference translation and the current unknown-device reference to the grader and stamps rubricVersion. Existing 7+3 grading and seven-required averaging remain unchanged. The UI flags missing/older rubric versions; it never silently replaces persisted scores.

POST /api/extensions/review with mission and UUID requires seven original submissions plus a submitted extension work row. Uses atomic ai_jobs reservation, per-mission five-run allowance, global class caps and student concurrency. Channels -1/-2 are excluded from chat allowance (>0), while original final review stays 0. Job replay is scoped by student and channel. Table extension_reviews (migration 0006) stores the latest review and source hash. GET /api/extensions and admin student-extension detail include review rows with computed stale status. Saving changed work makes the prior result stale, and an in-flight result is flagged stale if work changes during provider latency. Do not treat links as inspected image content. Scores are advisory and remain separate from original scores.
