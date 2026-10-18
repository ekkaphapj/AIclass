# Agent entry point — AI Police Lab

Read this file, `README.md`, and `docs/AGENT_HANDOFF.md` before changing the application. The repository contains the deployed **ai-class-p4** classroom, not a starter template.

## Current product contract

- Thai mobile student UI, police khaki/brown/gold theme, **AI POLICE LAB · By: Dr.Ake** branding.
- Exactly eight numbered exercises, one per page. Previous/next, clickable steps, persistent drafts, and editable submissions must work.
- Returning students resume their last exercise page (localStorage first, then the server-tracked current lesson) with drafts and submitted answers intact.
- Exercise 7 (music) is optional. Completion means all **seven required** exercises, not eight submissions.
- Exercises 1–5 use external AI and pasted text. Exercises 4/5 provide downloadable training images. Exercise 6 has five answer fields and an OpenRouter chat using the server's 18-row dataset. Exercises 7/8 accept HTTPS work links.
- Once all seven required exercises are submitted, the student enters the final summary page. Its submit button runs one OpenRouter grading call giving per-exercise 0–10 scores, an average, and a reachability check of the exercise 7/8 work links. Results persist per student (max 5 runs each); instructor manual scores remain the official review.
- Students register from the landing role chooser by typing their own numeric student ID (1–6 digits, duplicate-checked by the server), picking one of five class groups (1–5) and their name. That student ID is the only login credential. No class code and no teacher gate is required to start. Number-only login is an owner decision; keep the login throttles.
- After login students land on their home view: completed count, average score, per-exercise scores and answers, plus start/continue/redo buttons. A mid-session reload returns to the exact exercise page left behind; a fresh login lands on home.
- Instructor dashboard keeps eight task columns, per-student review, projection with names initially hidden, QR entry and CSV export on a computer, plus a group dropdown (all/1–5) that filters the metrics, per-exercise submitted/correct/incorrect counts (correct = AI final-review score ≥ 5) and the roster. Instructor login uses the production password secret.

## Where to change things

| File | Responsibility |
| --- | --- |
| `shared/activities.ts` | Eight exercises, prompts, dataset, subquestions, required-exercise list, reference counts |
| `shared/course.ts` | Re-exports activities and defines pre/post quiz questions |
| `src/Student.tsx` | Student pages, answer/draft flow, contextual chat, PIN/help dialogs, quizzes |
| `src/main.tsx` | Login, instructor monitor, review, projection, bootstrap |
| `src/student.css` | Current police theme, student UI, some overrides of legacy styles |
| `src/styles.css` | Shared styles and original instructor/base components |
| `src/api.ts` | Client request helper and DTO types |
| `worker/index.ts` | All API routes, authentication, validation, D1, AI quota/cost admission |
| `migrations/` | Additive D1 schema history; do not rewrite applied migrations |
| `tests/classroom-v2.spec.ts` | Current serial Playwright integration suite |

## Local workflow

Use Node 24 and the committed npm lockfile. On a clean checkout:

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
Copy-Item .secrets.example.json .secrets.json
# Edit the ignored copies, not the templates. See the handoff for which values are needed.
npx wrangler types
npx wrangler d1 migrations apply ai-class-p4 --local
npm run build
npm run preview
```

`npm run preview` serves the full app at `http://127.0.0.1:8787`. `npm run dev` is frontend-only Vite and does not provide the API by itself. `worker-configuration.d.ts` is ignored and must be regenerated before typechecking a fresh checkout.

In a second terminal, run the checks appropriate to the change:

```powershell
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

The full suite makes real OpenRouter calls, costs a small amount, and requires a valid key in `.dev.vars`. Test login values come from `.secrets.json`; keep its instructor password and class code aligned with `.dev.vars`. Never claim the suite passed if only build/typecheck ran. Do not run production smoke or the load test as routine documentation checks; they create records and have different scopes.

## Rules that protect existing behavior

- Flush/serialize pending draft saves before final submission; a late draft must not replace a newly submitted answer. Persist drafts when changing pages. Do not auto-submit chat output.
- Server validation, role checks, ownership, budget reservation and request idempotency are required. A disabled UI button is not sufficient enforcement.
- For exercise 6, store all five answers in `answers_json` and maintain the readable `result` representation used by instructor views and CSV.
- New submissions/re-submissions clear old review status/score/feedback. Do not silently retain an obsolete review.
- Keep data fixtures fictional. Document and object images are training assets; do not imply the bag's contents or danger can be established from an image.
- Follow current owner requests over this historical product contract if the task deliberately changes it; update all affected UI, validation, tests, and docs together.

## Deployment and secrets

`wrangler.jsonc` points at the **existing production D1** database. Local commands use `--local`; `--remote` writes affect the real classroom. Preserve the Worker name, database binding and database ID unless the task explicitly requires moving them. Do not recreate or reset production resources to resolve local test errors.

Never commit `.dev.vars`, `.secrets.json`, `credentials.local.txt`, `.wrangler/`, learner exports, test reports/traces, or real keys/passwords. Safe templates are deliberately tracked. Do not upload the empty example secret file to production. Use Cloudflare secrets for real runtime values.

For an authorized release, typecheck/build, apply any new remote migrations, then deploy. Source-only documentation and GitHub publishing do not require redeploying the site. Read deployment and rollback details in `docs/AGENT_HANDOFF.md`. Do not delete student data as part of deployment or test cleanup; cleanup must target only the specific synthetic fixture created by that test.

## Known limitations

Single classroom, no automatic retention/reset, no durable AI job queue. Per-exercise instructor scores stay manual; the end-of-class AI review is preliminary and advisory. The 150-user load result is historical local testing of course v1 without AI calls; it is not proof of current production capacity. See `docs/validation.json` and the handoff for evidence and remaining limits.
