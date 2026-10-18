import {
  lessons,
  quizQuestions,
  incidentContext,
  analysisQuestions,
  analysisReference,
} from "../shared/course";

declare global {
  namespace Cloudflare {
    interface Env {
      OPENROUTER_API_KEY: string;
      ADMIN_PASSWORD: string;
      CLASS_CODE: string;
    }
  }
}
type Settings = {
  id: number;
  title: string;
  expected: number;
  active_lesson: number;
  lock_following: number;
  admission_open: number;
  ai_paused: number;
  budget: number;
  max_requests: number;
};
type Session = { student_id: string | null; role: "student" | "admin" };
type Student = {
  id: string;
  number: string;
  name: string;
  squad: string;
  created_at: number;
  last_seen: number;
  current_lesson: number;
  help: string;
};
type Job = { id: string; student_id: string; status: string; result: string };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const now = () => Date.now();
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const equal = async (a: string, b: string) => {
  const x = await hash(a),
    y = await hash(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
};
const str = (v: unknown, max = 10000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
async function body(req: Request) {
  if (!req.body) throw new HttpError(400, "ไม่มีข้อมูลคำขอ");
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 950000) {
      await reader.cancel();
      throw new HttpError(413, "ไฟล์หรือข้อความใหญ่เกินไป");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  }
}
async function settings(env: Cloudflare.Env) {
  return (await env.DB.prepare(
    "SELECT * FROM settings WHERE id=1",
  ).first<Settings>())!;
}
async function session(req: Request, env: Cloudflare.Env): Promise<Session> {
  const token = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)p4_session=([^;]+)/)?.[1];
  if (!token) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const s = await env.DB.prepare(
    "SELECT student_id,role FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), now())
    .first<Session>();
  if (!s) throw new HttpError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
  return s;
}
async function admin(req: Request, env: Cloudflare.Env) {
  const s = await session(req, env);
  if (s.role !== "admin") throw new HttpError(403, "เฉพาะผู้สอนเท่านั้น");
  return s;
}
async function student(req: Request, env: Cloudflare.Env) {
  const s = await session(req, env);
  if (!s.student_id || s.role !== "student")
    throw new HttpError(403, "เฉพาะนักเรียนเท่านั้น");
  return s.student_id;
}
async function makeSession(
  req: Request,
  env: Cloudflare.Env,
  studentId: string | null,
  role: string,
) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO sessions(token_hash,student_id,role,expires_at) VALUES(?,?,?,?)",
  )
    .bind(await hash(token), studentId, role, now() + 12 * 3600000)
    .run();
  return `p4_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function rateLimit(
  req: Request,
  env: Cloudflare.Env,
  bucket: string,
  limit: number,
) {
  const key = await hash(
    bucket + ":" + (req.headers.get("CF-Connecting-IP") || "local"),
  );
  const t = now();
  const row = await env.DB.prepare(
    "INSERT INTO login_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts",
  )
    .bind(key, t, t - 600000, t - 600000)
    .first<{ attempts: number }>();
  if (row && row.attempts > limit)
    throw new HttpError(429, "ลองหลายครั้งเกินไป กรุณารอ 10 นาที");
}
async function ensureLesson(env: Cloudflare.Env, id: number) {
  if (!lessons.some((l) => l.id === id))
    throw new HttpError(400, "ไม่พบภารกิจ");
  const c = await settings(env);
  if (c.lock_following && id > c.active_lesson)
    throw new HttpError(403, "ผู้สอนยังไม่เปิดภารกิจนี้");
  return c;
}
function safeLink(value: unknown) {
  const v = str(value, 1200);
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") throw Error();
    return u.toString();
  } catch {
    throw new HttpError(400, "ลิงก์ต้องเริ่มด้วย https://");
  }
}
function parseGrading(text: string, requiredIds: number[]) {
  const stripped = text.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{"),
    end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(stripped.slice(start, end + 1)) as {
      lessons?: unknown;
      summary?: unknown;
    };
    if (!Array.isArray(data.lessons)) return null;
    const rows: { lesson: number; score: number; comment: string }[] = [];
    for (const item of data.lessons) {
      const l = item as { lesson?: unknown; score?: unknown; comment?: unknown };
      const lesson = Number(l.lesson),
        score = Number(l.score);
      if (!Number.isInteger(lesson) || lesson < 1 || lesson > lessons.length)
        continue;
      if (!Number.isFinite(score) || score < 0 || score > 10) continue;
      if (rows.some((r) => r.lesson === lesson)) continue;
      rows.push({
        lesson,
        score: Math.round(score * 2) / 2,
        comment: typeof l.comment === "string" ? l.comment.trim().slice(0, 400) : "",
      });
    }
    if (!requiredIds.every((rid) => rows.some((r) => r.lesson === rid)))
      return null;
    return {
      lessons: rows,
      summary: typeof data.summary === "string" ? data.summary.trim().slice(0, 800) : "",
    };
  } catch {
    return null;
  }
}
const projection =
  "id,number,name,squad,created_at,last_seen,current_lesson,help";
async function api(req: Request, env: Cloudflare.Env) {
  const url = new URL(req.url),
    path = url.pathname,
    method = req.method;
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("Origin");
    if (origin && origin !== url.origin)
      throw new HttpError(403, "ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
    if (req.headers.get("Sec-Fetch-Site") === "cross-site")
      throw new HttpError(403, "ไม่อนุญาตคำขอข้ามเว็บไซต์");
  }
  if (path === "/api/health") return json({ ok: true, app: "ai-class-p4" });
  if (path === "/api/config" && method === "GET") {
    const c = await settings(env);
    return json({
      title: c.title,
      expected: c.expected,
      active_lesson: c.active_lesson,
      lock_following: c.lock_following,
      admission_open: c.admission_open,
      ai_paused: c.ai_paused,
      model: env.AI_MODEL,
    });
  }
  if (path === "/api/register" && method === "POST") {
    await rateLimit(req, env, "register", 200);
    const b = await body(req);
    const c = await settings(env);
    if (!c.admission_open) throw new HttpError(403, "ผู้สอนปิดรับลงชื่อแล้ว");
    const name = str(b.name, 100),
      squad = str(b.squad, 30);
    if (name.length < 2 || !/^[1-5]$/.test(squad))
      throw new HttpError(400, "กรุณากรอกชื่อ-นามสกุล และเลือกกลุ่มเรียน 1–5");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) n FROM students",
    ).first<{ n: number }>();
    if ((count?.n || 0) >= 300) throw new HttpError(403, "ห้องเรียนเต็มแล้ว");
    const t = now(),
      filler = await hash(crypto.randomUUID());
    let id = "",
      number = "";
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = String(1000 + Math.floor(Math.random() * 9000));
      try {
        id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO students(id,number,name,squad,recovery_hash,created_at,last_seen) VALUES(?,?,?,?,?,?,?)",
        )
          .bind(id, candidate, name, squad, filler, t, t)
          .run();
        number = candidate;
        break;
      } catch {
        // เลขนี้ถูกใช้แล้ว สุ่มใหม่
      }
    }
    if (!number)
      throw new HttpError(503, "สร้างเลขนักเรียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    return json({ ok: true, number }, 201, {
      "Set-Cookie": await makeSession(req, env, id, "student"),
    });
  }
  if (path === "/api/login" && method === "POST") {
    const b = await body(req);
    await rateLimit(req, env, "login-shared-network", 600);
    const number = str(b.number, 12);
    await rateLimit(req, env, "login-" + number, 15);
    if (!/^\d{4}$/.test(number))
      throw new HttpError(400, "เลขนักเรียนเป็นตัวเลข 4 หลัก");
    const row = await env.DB.prepare("SELECT id FROM students WHERE number=?")
      .bind(number)
      .first<{ id: string }>();
    if (!row)
      throw new HttpError(
        403,
        "ไม่พบเลขนักเรียนนี้ กรุณาตรวจอีกครั้ง หรือลงชื่อใหม่",
      );
    return json({ ok: true }, 200, {
      "Set-Cookie": await makeSession(req, env, row.id, "student"),
    });
  }
  if (path === "/api/admin/login" && method === "POST") {
    await rateLimit(req, env, "admin", 10);
    const b = await body(req);
    if (
      !env.ADMIN_PASSWORD ||
      !(await equal(str(b.password, 200), env.ADMIN_PASSWORD))
    )
      throw new HttpError(403, "รหัสผู้สอนไม่ถูกต้อง");
    return json({ ok: true }, 200, {
      "Set-Cookie": await makeSession(req, env, null, "admin"),
    });
  }
  if (path === "/api/logout" && method === "POST") {
    const token = req.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)p4_session=([^;]+)/)?.[1];
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": "p4_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
  }
  if (path === "/api/chat" && method === "GET") {
    const id = await student(req, env);
    const messages = await env.DB.prepare(
      "SELECT id,prompt,result,created_at FROM chat_messages WHERE student_id=? AND lesson=6 ORDER BY created_at",
    )
      .bind(id)
      .all();
    return json({ messages: messages.results });
  }
  if (path === "/api/me" && method === "GET") {
    const s = await session(req, env);
    if (s.role === "admin") return json({ role: "admin" });
    const person = await env.DB.prepare(
      `SELECT ${projection} FROM students WHERE id=?`,
    )
      .bind(s.student_id)
      .first();
    const [sub, drafts, quiz, usage, review] = await Promise.all([
      env.DB.prepare(
        "SELECT s.*,EXISTS(SELECT 1 FROM attachments a WHERE a.submission_id=s.id) has_image FROM submissions s WHERE student_id=? ORDER BY lesson",
      )
        .bind(s.student_id)
        .all(),
      env.DB.prepare(
        "SELECT lesson,body,updated_at FROM drafts WHERE student_id=?",
      )
        .bind(s.student_id)
        .all(),
      env.DB.prepare(
        "SELECT kind,score,answers FROM quizzes WHERE student_id=?",
      )
        .bind(s.student_id)
        .all(),
      env.DB.prepare(
        "SELECT COUNT(*) n FROM ai_jobs WHERE student_id=? AND lesson<>0 AND status IN ('running','done')",
      )
        .bind(s.student_id)
        .first<{ n: number }>(),
      env.DB.prepare(
        "SELECT status,result,created_at FROM final_reviews WHERE student_id=?",
      )
        .bind(s.student_id)
        .first(),
    ]);
    return json({
      role: "student",
      student: person,
      submissions: sub.results,
      drafts: drafts.results,
      quizzes: quiz.results,
      aiUsed: usage?.n || 0,
      finalReview: review || null,
    });
  }
  if (path === "/api/heartbeat" && method === "POST") {
    const id = await student(req, env),
      b = await body(req);
    await env.DB.prepare(
      "UPDATE students SET last_seen=?,current_lesson=? WHERE id=?",
    )
      .bind(
        now(),
        Math.min(lessons.length, Math.max(0, Number(b.lesson) || 0)),
        id,
      )
      .run();
    return json({ ok: true });
  }
  if (path === "/api/help" && method === "POST") {
    const id = await student(req, env),
      b = await body(req);
    await env.DB.prepare("UPDATE students SET help=?,last_seen=? WHERE id=?")
      .bind(str(b.reason, 200), now(), id)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/draft" && method === "POST") {
    const id = await student(req, env),
      b = await body(req),
      lesson = Number(b.lesson);
    await ensureLesson(env, lesson);
    const draft = JSON.stringify({
      prompt: str(b.prompt, 6000),
      result: str(b.result, 15000),
      reflection: str(b.reflection, 4000),
      tool: str(b.tool, 100),
      link: str(b.link, 1200),
      media_state: str(b.media_state, 30),
      answers: Array.isArray(b.answers)
        ? Array.from({ length: 5 }, (_, i) =>
            str(b.answers instanceof Array ? b.answers[i] : "", 3000),
          )
        : [],
    });
    await env.DB.prepare(
      "INSERT INTO drafts(student_id,lesson,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(student_id,lesson) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
    )
      .bind(id, lesson, draft, now())
      .run();
    return json({ ok: true, savedAt: now() });
  }
  if (path === "/api/submission" && method === "POST") {
    const id = await student(req, env),
      b = await body(req),
      lesson = Number(b.lesson);
    await ensureLesson(env, lesson);
    const lessonInfo = lessons.find((l) => l.id === lesson)!;
    const answers = Array.isArray(b.answers)
      ? Array.from({ length: 5 }, (_, i) =>
          str(b.answers instanceof Array ? b.answers[i] : "", 3000),
        )
      : [];
    const prompt = str(b.prompt, 6000) || lessonInfo.starter,
      result =
        lesson === 6
          ? answers
              .map((a, i) => `6.${i + 1} ${analysisQuestions[i]}\n${a}`)
              .join("\n\n")
          : lessonInfo.answerType === "link"
            ? safeLink(b.link || b.result)
            : str(b.result, 15000),
      reflection = str(b.reflection, 4000),
      tool = str(b.tool, 100),
      link = safeLink(
        b.link || (lessonInfo.answerType === "link" ? b.result : ""),
      ),
      mediaState = b.media_state === "blocked" ? "blocked" : "complete";
    if (prompt.length < 5 || result.length < 2 || !tool)
      throw new HttpError(400, "กรุณาวางคำตอบก่อนกดส่ง");
    if (
      lesson === 6 &&
      (answers.length !== 5 || answers.some((a) => a.length < 2))
    )
      throw new HttpError(400, "กรุณาตอบข้อ 6.1–6.5 ให้ครบก่อนส่ง");
    const existing = await env.DB.prepare(
      "SELECT id FROM submissions WHERE student_id=? AND lesson=?",
    )
      .bind(id, lesson)
      .first<{ id: string }>();
    const subId = existing?.id || crypto.randomUUID();
    const image = str(b.image, 650000);
    if (
      image &&
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
    )
      throw new HttpError(400, "รองรับภาพ JPG, PNG หรือ WebP เท่านั้น");
    if (lessonInfo.answerType === "link" && !link)
      throw new HttpError(400, "กรุณาวางลิงก์ผลงานที่เริ่มด้วย https://");
    const t = now(),
      stmt = env.DB.prepare(
        "INSERT INTO submissions(id,student_id,lesson,prompt,result,reflection,tool,link,media_state,status,submitted_at,updated_at,answers_json) VALUES(?,?,?,?,?,?,?,?,?,'submitted',?,?,?) ON CONFLICT(student_id,lesson) DO UPDATE SET prompt=excluded.prompt,result=excluded.result,reflection=excluded.reflection,tool=excluded.tool,link=excluded.link,media_state=excluded.media_state,status='submitted',score=NULL,feedback='',updated_at=excluded.updated_at,answers_json=excluded.answers_json",
      ).bind(
        subId,
        id,
        lesson,
        prompt,
        result,
        reflection,
        tool,
        link,
        mediaState,
        t,
        t,
        JSON.stringify(answers),
      );
    const batch = [
      stmt,
      env.DB.prepare("DELETE FROM drafts WHERE student_id=? AND lesson=?").bind(
        id,
        lesson,
      ),
      env.DB.prepare(
        "UPDATE students SET last_seen=?,current_lesson=? WHERE id=?",
      ).bind(t, lesson, id),
    ];
    if (image)
      batch.push(
        env.DB.prepare(
          "INSERT INTO attachments(submission_id,image) VALUES(?,?) ON CONFLICT(submission_id) DO UPDATE SET image=excluded.image",
        ).bind(subId, image),
      );
    await env.DB.batch(batch);
    return json({ ok: true, id: subId });
  }
  if (path.startsWith("/api/image/") && method === "GET") {
    const s = await session(req, env),
      subId = path.split("/").pop();
    const row = await env.DB.prepare(
      "SELECT a.image,s.student_id FROM attachments a JOIN submissions s ON s.id=a.submission_id WHERE s.id=?",
    )
      .bind(subId)
      .first<{ image: string; student_id: string }>();
    if (!row) throw new HttpError(404, "ไม่มีภาพแนบ");
    if (s.role !== "admin" && s.student_id !== row.student_id)
      throw new HttpError(403, "ไม่มีสิทธิ์ดูภาพนี้");
    const [prefix, data] = row.image.split(","),
      bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return new Response(bin, {
      headers: {
        "Content-Type": prefix.slice(5).split(";")[0],
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (path === "/api/quiz" && method === "POST") {
    const id = await student(req, env),
      b = await body(req),
      kind = b.kind === "post" ? "post" : "pre",
      answers = b.answers;
    if (
      !Array.isArray(answers) ||
      answers.length !== 5 ||
      answers.some((a) => !Number.isInteger(a) || a < 0 || a > 2)
    )
      throw new HttpError(400, "กรุณาตอบให้ครบ 5 ข้อ");
    const score = answers.reduce(
      (n, a, i) => n + (a === quizQuestions[i].correct ? 1 : 0),
      0,
    );
    await env.DB.prepare(
      "INSERT INTO quizzes(student_id,kind,answers,score,submitted_at) VALUES(?,?,?,?,?) ON CONFLICT(student_id,kind) DO NOTHING",
    )
      .bind(id, kind, JSON.stringify(answers), score, now())
      .run();
    const stored = await env.DB.prepare(
      "SELECT score,answers FROM quizzes WHERE student_id=? AND kind=?",
    )
      .bind(id, kind)
      .first();
    return json({ ok: true, ...stored });
  }
  if (path === "/api/ai" && method === "POST") {
    const id = await student(req, env),
      b = await body(req),
      lesson = Number(b.lesson),
      c = await ensureLesson(env, lesson),
      prompt = str(b.prompt, 6000),
      jobId = str(b.id, 80);
    if (!/^[a-f0-9-]{36}$/.test(jobId) || prompt.length < 5)
      throw new HttpError(400, "กรุณาเขียนคำสั่งอย่างน้อย 5 ตัวอักษร");
    const existing = await env.DB.prepare(
      "SELECT id,student_id,status,result FROM ai_jobs WHERE id=?",
    )
      .bind(jobId)
      .first<Job>();
    if (existing) {
      if (existing.student_id !== id) throw new HttpError(403, "ไม่มีสิทธิ์");
      if (existing.status === "done")
        return json({ result: existing.result, replayed: true });
      if (existing.status === "running")
        return json(
          { error: "คำขอนี้กำลังทำงาน กรุณารอสักครู่", retry: true },
          409,
        );
      throw new HttpError(409, "คำขอเดิมไม่สำเร็จ กรุณาสร้างคำขอใหม่");
    }
    if (c.ai_paused) throw new HttpError(403, "ผู้สอนพักการใช้ AI ชั่วคราว");
    if (!env.OPENROUTER_API_KEY)
      throw new HttpError(503, "ยังไม่ได้ตั้งค่า AI กรุณาแจ้งผู้สอน");
    await env.DB.prepare(
      "UPDATE ai_jobs SET status='failed',cost=reserved,finished_at=? WHERE status='running' AND created_at<?",
    )
      .bind(now(), now() - 90000)
      .run();
    const reserve = 0.004;
    const inserted = await env.DB.prepare(
      "INSERT INTO ai_jobs(id,student_id,lesson,status,reserved,created_at) SELECT ?,?,?,'running',?,? WHERE (SELECT COUNT(*) FROM ai_jobs WHERE student_id=? AND lesson<>0 AND status IN ('running','done'))<18 AND (SELECT COUNT(*) FROM ai_jobs WHERE student_id=? AND lesson<>0 AND status='running')=0 AND (SELECT COUNT(*) FROM ai_jobs WHERE status IN ('running','done'))<? AND (SELECT COUNT(*) FROM ai_jobs WHERE status='running')<12 AND (SELECT COALESCE(SUM(CASE WHEN status='running' THEN reserved ELSE cost END),0) FROM ai_jobs)+?<=?",
    )
      .bind(
        jobId,
        id,
        lesson,
        reserve,
        now(),
        id,
        id,
        c.max_requests,
        reserve,
        c.budget,
      )
      .run();
    if (!inserted.meta.changes) {
      const used = await env.DB.prepare(
        "SELECT COUNT(*) n FROM ai_jobs WHERE student_id=? AND lesson<>0 AND status IN ('done','running')",
      )
        .bind(id)
        .first<{ n: number }>();
      if ((used?.n || 0) >= 18)
        throw new HttpError(
          403,
          "ใช้โควตา AI ครบ 18 ครั้งแล้ว ยังส่งงานจากเครื่องมือภายนอกได้",
        );
      const totals = await env.DB.prepare(
        "SELECT COALESCE(SUM(CASE WHEN status IN ('running','done') THEN 1 ELSE 0 END),0) n,COALESCE(SUM(CASE WHEN status='running' THEN reserved ELSE cost END),0) cost FROM ai_jobs",
      ).first<{ n: number; cost: number }>();
      if (
        (totals?.n || 0) >= c.max_requests ||
        (totals?.cost || 0) + reserve > c.budget
      )
        throw new HttpError(
          403,
          "ถึงเพดานการใช้ AI ของห้องเรียนแล้ว กรุณาแจ้งผู้สอน",
        );
      return json(
        {
          error: "มีผู้ใช้งาน AI พร้อมกันจำนวนมาก กำลังรอช่องว่าง…",
          retry: true,
        },
        429,
      );
    }
    try {
      const history =
        lesson === 6
          ? (
              await env.DB.prepare(
                "SELECT prompt,result FROM chat_messages WHERE student_id=? AND lesson=6 ORDER BY created_at DESC LIMIT 3",
              )
                .bind(id)
                .all<{ prompt: string; result: string }>()
            ).results.reverse()
          : [];
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": url.origin,
            "X-Title": "AI Police Lab P4",
          },
          body: JSON.stringify({
            model: env.AI_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "คุณเป็นผู้ช่วยฝึก AI ภาษาไทยสำหรับนักเรียนนายสิบตำรวจ ใช้เฉพาะสถานการณ์สมมติ ช่วยงานบริการประชาชน งานร่าง และการเรียนรู้ ตอบกระชับไม่เกิน 500 คำ ใช้ข้อความธรรมดา ไม่ใช้เครื่องหมาย Markdown หรือตาราง แยกหัวข้อและรายการด้วยบรรทัดใหม่ แยกข้อเท็จจริงจากข้อสันนิษฐาน ไม่แต่งข้อมูล บุคคล เวลา หรือข้อกฎหมาย ไม่วินิจฉัยความผิดหรือระบุตัวบุคคลจากภาพ ถ้ามีข้อมูลส่วนบุคคลจริงให้แนะนำปิดบังและไม่ทวนข้อมูลนั้น ห้ามอ้างว่าคำตอบใช้แทนการตรวจของเจ้าหน้าที่ได้",
              },
              ...(lesson === 6
                ? [
                    {
                      role: "system",
                      content:
                        incidentContext +
                        "\n\nคำถามที่ต้องตอบ:\n" +
                        analysisQuestions
                          .map((q, i) => `6.${i + 1} ${q}`)
                          .join("\n"),
                    },
                    ...history.flatMap((m) => [
                      { role: "user", content: m.prompt.slice(0, 1000) },
                      { role: "assistant", content: m.result.slice(0, 2500) },
                    ]),
                  ]
                : []),
              { role: "user", content: prompt },
            ],
            max_tokens: 2400,
            temperature: 0.5,
            reasoning: { effort: "low", exclude: true },
          }),
          signal: AbortSignal.timeout(55000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(
          502,
          response.status === 402
            ? "เครดิต AI ของระบบไม่เพียงพอ กรุณาแจ้งผู้สอน"
            : "บริการ AI ไม่พร้อมชั่วคราว กรุณาลองใหม่ภายหลัง",
        );
      }
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: {
          cost?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        };
      };
      const result = data.choices?.[0]?.message?.content;
      if (typeof result !== "string" || !result.trim())
        throw new HttpError(502, "AI ไม่ส่งข้อความตอบกลับ กรุณาลองใหม่");
      const computed =
        ((data.usage?.prompt_tokens || 0) * Number(env.AI_INPUT_PRICE) +
          (data.usage?.completion_tokens || 0) * Number(env.AI_OUTPUT_PRICE)) /
        1000000;
      const reported = data.usage?.cost;
      const cost =
        typeof reported === "number" && reported >= 0
          ? reported
          : computed || reserve;
      const completedJob = env.DB.prepare(
        "UPDATE ai_jobs SET status='done',result=?,cost=?,finished_at=? WHERE id=?",
      ).bind(result.slice(0, 20000), cost, now(), jobId);
      if (lesson === 6)
        await env.DB.batch([
          completedJob,
          env.DB.prepare(
            "INSERT INTO chat_messages(id,student_id,lesson,job_id,prompt,result,created_at) VALUES(?,?,6,?,?,?,?)",
          ).bind(
            crypto.randomUUID(),
            id,
            jobId,
            prompt,
            result.slice(0, 20000),
            now(),
          ),
        ]);
      else await completedJob.run();
      return json({ result, cost, model: env.AI_MODEL });
    } catch (e) {
      await env.DB.prepare(
        "UPDATE ai_jobs SET status='failed',cost=reserved,finished_at=? WHERE id=?",
      )
        .bind(now(), jobId)
        .run();
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        504,
        "AI ใช้เวลานานเกินไป กรุณาลองใหม่ หรือใช้บัญชี AI ของคุณ",
      );
    }
  }
  if (path === "/api/final-review" && method === "POST") {
    const id = await student(req, env);
    const b = await body(req);
    const jobId = str(b.id, 80);
    if (!/^[a-f0-9-]{36}$/.test(jobId))
      throw new HttpError(400, "รูปแบบคำขอไม่ถูกต้อง");
    const c = await settings(env);
    const requiredIds = lessons.filter((l) => !l.optional).map((l) => l.id);
    const subs = (
      await env.DB.prepare(
        "SELECT lesson,result,link FROM submissions WHERE student_id=? ORDER BY lesson",
      )
        .bind(id)
        .all<{ lesson: number; result: string; link: string }>()
    ).results;
    if (!requiredIds.every((rid) => subs.some((s) => s.lesson === rid)))
      throw new HttpError(
        400,
        "ยังส่งไม่ครบทุกข้อหลัก กรุณากลับไปทำข้อที่เหลือก่อน",
      );
    const existing = await env.DB.prepare(
      "SELECT id,student_id,status FROM ai_jobs WHERE id=?",
    )
      .bind(jobId)
      .first<Job>();
    if (existing) {
      if (existing.student_id !== id) throw new HttpError(403, "ไม่มีสิทธิ์");
      if (existing.status === "done") {
        const saved = await env.DB.prepare(
          "SELECT result FROM final_reviews WHERE student_id=? AND job_id=? AND status='done'",
        )
          .bind(id, jobId)
          .first<{ result: string }>();
        if (saved) return json({ ...JSON.parse(saved.result), replayed: true });
      } else if (existing.status === "running")
        return json(
          { error: "คำขอนี้กำลังทำงาน กรุณารอสักครู่", retry: true },
          409,
        );
      throw new HttpError(409, "คำขอเดิมไม่สำเร็จ กรุณากดตรวจใหม่อีกครั้ง");
    }
    if (c.ai_paused) throw new HttpError(403, "ผู้สอนพักการใช้ AI ชั่วคราว");
    if (!env.OPENROUTER_API_KEY)
      throw new HttpError(503, "ยังไม่ได้ตั้งค่า AI กรุณาแจ้งผู้สอน");
    await env.DB.prepare(
      "UPDATE ai_jobs SET status='failed',cost=reserved,finished_at=? WHERE status='running' AND created_at<?",
    )
      .bind(now(), now() - 90000)
      .run();
    const reserve = 0.004;
    const inserted = await env.DB.prepare(
      "INSERT INTO ai_jobs(id,student_id,lesson,status,reserved,created_at) SELECT ?,?,0,'running',?,? WHERE (SELECT COUNT(*) FROM ai_jobs WHERE student_id=? AND lesson=0 AND status IN ('running','done'))<5 AND (SELECT COUNT(*) FROM ai_jobs WHERE status IN ('running','done'))<? AND (SELECT COUNT(*) FROM ai_jobs WHERE status='running')<12 AND (SELECT COALESCE(SUM(CASE WHEN status='running' THEN reserved ELSE cost END),0) FROM ai_jobs)+?<=?",
    )
      .bind(jobId, id, reserve, now(), id, c.max_requests, reserve, c.budget)
      .run();
    if (!inserted.meta.changes) {
      const used = await env.DB.prepare(
        "SELECT COUNT(*) n FROM ai_jobs WHERE student_id=? AND lesson=0 AND status IN ('done','running')",
      )
        .bind(id)
        .first<{ n: number }>();
      if ((used?.n || 0) >= 5)
        throw new HttpError(
          403,
          "ใช้สิทธิ์ตรวจคะแนนรวมครบ 5 ครั้งแล้ว กรุณาแจ้งผู้สอน",
        );
      const totals = await env.DB.prepare(
        "SELECT COALESCE(SUM(CASE WHEN status IN ('running','done') THEN 1 ELSE 0 END),0) n,COALESCE(SUM(CASE WHEN status='running' THEN reserved ELSE cost END),0) cost FROM ai_jobs",
      ).first<{ n: number; cost: number }>();
      if (
        (totals?.n || 0) >= c.max_requests ||
        (totals?.cost || 0) + reserve > c.budget
      )
        throw new HttpError(
          403,
          "ถึงเพดานการใช้ AI ของห้องเรียนแล้ว กรุณาแจ้งผู้สอน",
        );
      return json(
        {
          error: "มีผู้ใช้งาน AI พร้อมกันจำนวนมาก กำลังรอช่องว่าง…",
          retry: true,
        },
        429,
      );
    }
    await env.DB.prepare(
      "INSERT INTO final_reviews(student_id,status,job_id,created_at) VALUES(?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET status='running',result='',job_id=excluded.job_id,created_at=excluded.created_at",
    )
      .bind(id, "running", jobId, now())
      .run();
    try {
      const checks = await Promise.all(
        subs
          .filter(
            (s) =>
              s.link &&
              lessons.find((l) => l.id === s.lesson)?.answerType === "link",
          )
          .map(async (s) => {
            try {
              const r = await fetch(s.link, {
                redirect: "follow",
                signal: AbortSignal.timeout(8000),
                headers: {
                  "User-Agent": "Mozilla/5.0 (compatible; AI-Police-Lab/1.0)",
                },
              });
              const status = r.status;
              await r.body?.cancel();
              return { lesson: s.lesson, status };
            } catch {
              return { lesson: s.lesson, status: 0 };
            }
          }),
      );
      const linkText = (lesson: number) => {
        const k = checks.find((x) => x.lesson === lesson);
        if (!k) return "";
        return !k.status
          ? "ตรวจไม่ได้ในขณะนี้"
          : k.status < 400
            ? "เปิดได้"
            : `เปิดไม่ได้ (HTTP ${k.status})`;
      };
      const ref = analysisReference;
      const key6 =
        "เฉลยตัวเลขอ้างอิงสำหรับตรวจข้อ 6: " +
        Object.entries(ref.areas)
          .map(([k, v]) => `${k} ${v} เหตุ`)
          .join(" / ") +
        "; " +
        Object.entries(ref.timeBands)
          .map(([k, v]) => `ช่วง ${k} มี ${v} เหตุ`)
          .join(", ") +
        `; ลักทรัพย์ช่วง 18:00–23:59 มี ${ref.theftEvening} เหตุ โดยหนองแสง ${ref.theftNongSaengEvening} เหตุ; ปล้นบ้านใหม่ช่วง 18:00–23:59 มี ${ref.robberyBanMaiEvening} เหตุ; ข้อ 6.5 เป็นแผนปลายเปิด ดูความสอดคล้องกับข้อมูลและการระบุข้อจำกัดของข้อมูล`;
      const parts = subs.map((s) => {
        const info = lessons.find((l) => l.id === s.lesson)!;
        return (
          `### ข้อ ${s.lesson} — ${info.title}${info.optional ? " (ข้อไม่บังคับ)" : ""}\n` +
          `โจทย์: ${info.starter.slice(0, 500)}\n` +
          `คำตอบผู้เรียน: ${s.result.slice(0, 2500)}` +
          (s.link
            ? `\nลิงก์ผลงาน: ${s.link}\nผลตรวจลิงก์โดยระบบ: ${linkText(s.lesson)}`
            : "") +
          (s.lesson === 6 ? `\n${key6}` : "")
        );
      });
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": url.origin,
            "X-Title": "AI Police Lab P4",
          },
          body: JSON.stringify({
            model: env.AI_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "คุณเป็นผู้ช่วยตรวจงานในชั้นเรียน AI สำหรับนักเรียนนายสิบตำรวจ ข้อมูลทั้งหมดเป็นสถานการณ์สมมติ หน้าที่คือให้คะแนนคำตอบของผู้เรียนทีละข้อเป็นเลข 0 ถึง 10 โดยดูว่าตรงคำถาม ถูกต้อง ครบถ้วน และแยกข้อเท็จจริงจากข้อสันนิษฐานหรือระบุข้อจำกัดได้ ข้อ 6 ให้เทียบตัวเลขกับเฉลยอ้างอิงที่แนบให้ ข้อที่ส่งลิงก์ผลงาน ให้พิจารณาจากผลตรวจลิงก์ของระบบเท่านั้น ห้ามอ้างว่าเห็นเนื้อหาในลิงก์ ห้ามวินิจฉัยความผิดของบุคคล ความเห็นต่อข้อยาวไม่เกิน 80 ตัวอักษร ตอบกลับเป็น JSON เท่านั้น ตามรูปแบบ {\"lessons\":[{\"lesson\":เลขข้อ,\"score\":คะแนน 0-10,\"comment\":\"เหตุผลสั้น\"}],\"summary\":\"สรุปภาพรวม 2-3 ประโยค\"} ห้ามเขียนข้อความอื่นนอกจาก JSON",
              },
              {
                role: "user",
                content:
                  "ตรวจงานต่อไปนี้ทุกข้อที่แนบมา แล้วให้คะแนน\n\n" +
                  parts.join("\n\n"),
              },
            ],
            max_tokens: 2400,
            temperature: 0.3,
            reasoning: { effort: "low", exclude: true },
          }),
          signal: AbortSignal.timeout(55000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(
          502,
          response.status === 402
            ? "เครดิต AI ของระบบไม่พอเพียง กรุณาแจ้งผู้สอน"
            : "บริการ AI ไม่พร้อมชั่วคราว กรุณาลองใหม่ภายหลัง",
        );
      }
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: {
          cost?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        };
      };
      const graded = parseGrading(
        data.choices?.[0]?.message?.content || "",
        requiredIds,
      );
      if (!graded)
        throw new HttpError(
          502,
          "AI ส่งผลตรวจไม่ครบถ้วน กรุณากดตรวจใหม่อีกครั้ง",
        );
      const computed =
        ((data.usage?.prompt_tokens || 0) * Number(env.AI_INPUT_PRICE) +
          (data.usage?.completion_tokens || 0) * Number(env.AI_OUTPUT_PRICE)) /
        1000000;
      const reported = data.usage?.cost;
      const cost =
        typeof reported === "number" && reported >= 0
          ? reported
          : computed || reserve;
      const scores = requiredIds.map(
        (rid) => graded.lessons.find((l) => l.lesson === rid)!.score,
      );
      const average =
        Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
        10;
      const stored = {
        lessons: graded.lessons
          .filter((l) => subs.some((s) => s.lesson === l.lesson))
          .map((l) => ({
            ...l,
            linkStatus: checks.some((k) => k.lesson === l.lesson)
              ? linkText(l.lesson)
              : undefined,
          })),
        average,
        summary: graded.summary,
        checkedAt: now(),
      };
      const resultJson = JSON.stringify(stored);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE ai_jobs SET status='done',result=?,cost=?,finished_at=? WHERE id=?",
        ).bind(resultJson.slice(0, 20000), cost, now(), jobId),
        env.DB.prepare(
          "UPDATE final_reviews SET status='done',result=?,finished_at=? WHERE student_id=? AND job_id=?",
        ).bind(resultJson, now(), id, jobId),
      ]);
      return json({ ...stored, cost, model: env.AI_MODEL });
    } catch (e) {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE ai_jobs SET status='failed',cost=reserved,finished_at=? WHERE id=?",
        ).bind(now(), jobId),
        env.DB.prepare(
          "UPDATE final_reviews SET status='failed',finished_at=? WHERE student_id=? AND job_id=?",
        ).bind(now(), id, jobId),
      ]);
      if (e instanceof HttpError) throw e;
      throw new HttpError(504, "AI ใช้เวลานานเกินไป กรุณากดตรวจใหม่อีกครั้ง");
    }
  }
  if (path === "/api/admin/overview" && method === "GET") {
    await admin(req, env);
    const [c, students, submissions, quizzes, usage, reviews] =
      await Promise.all([
      settings(env),
      env.DB.prepare(
        `SELECT ${projection} FROM students ORDER BY CAST(number AS INTEGER)`,
      ).all<Student>(),
      env.DB.prepare(
        "SELECT id,student_id,lesson,status,score,media_state,submitted_at,updated_at FROM submissions ORDER BY updated_at DESC",
      ).all(),
      env.DB.prepare("SELECT student_id,kind,score FROM quizzes").all(),
      env.DB.prepare(
        "SELECT COUNT(*) total,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running,COALESCE(SUM(cost),0) cost FROM ai_jobs",
      ).first(),
      env.DB.prepare(
        "SELECT student_id,result,created_at FROM final_reviews WHERE status='done'",
      ).all(),
    ]);
    return json({
      settings: c,
      students: students.results,
      submissions: submissions.results,
      quizzes: quizzes.results,
      usage,
      finalReviews: reviews.results,
      serverTime: now(),
      model: env.AI_MODEL,
    });
  }
  if (path.startsWith("/api/admin/student/") && method === "GET") {
    await admin(req, env);
    const id = path.split("/").pop();
    const [person, subs, quiz] = await Promise.all([
      env.DB.prepare(`SELECT ${projection} FROM students WHERE id=?`)
        .bind(id)
        .first(),
      env.DB.prepare(
        "SELECT s.*,EXISTS(SELECT 1 FROM attachments a WHERE a.submission_id=s.id) has_image FROM submissions s WHERE student_id=? ORDER BY lesson",
      )
        .bind(id)
        .all(),
      env.DB.prepare("SELECT kind,score FROM quizzes WHERE student_id=?")
        .bind(id)
        .all(),
    ]);
    if (!person) throw new HttpError(404, "ไม่พบผู้เรียน");
    return json({
      student: person,
      submissions: subs.results,
      quizzes: quiz.results,
    });
  }
  if (path === "/api/admin/review" && method === "POST") {
    await admin(req, env);
    const b = await body(req);
    const status = ["reviewed", "revision", "submitted"].includes(str(b.status))
        ? str(b.status)
        : "reviewed",
      score = b.score === null || b.score === "" ? null : Number(b.score);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10))
      throw new HttpError(400, "คะแนนต้องอยู่ระหว่าง 0–10");
    const r = await env.DB.prepare(
      "UPDATE submissions SET status=?,score=?,feedback=? WHERE id=?",
    )
      .bind(status, score, str(b.feedback, 2000), str(b.id, 80))
      .run();
    if (!r.meta.changes) throw new HttpError(404, "ไม่พบงาน");
    return json({ ok: true });
  }
  if (path === "/api/admin/settings" && method === "POST") {
    await admin(req, env);
    const b = await body(req);
    await env.DB.prepare(
      "UPDATE settings SET title=?,expected=?,active_lesson=?,lock_following=?,admission_open=?,ai_paused=?,budget=?,max_requests=? WHERE id=1",
    )
      .bind(
        str(b.title, 120) || "AI Police Lab · P4",
        Math.min(300, Math.max(1, Number(b.expected) || 150)),
        Math.min(lessons.length, Math.max(1, Number(b.active_lesson) || 1)),
        b.lock_following ? 1 : 0,
        b.admission_open ? 1 : 0,
        b.ai_paused ? 1 : 0,
        Math.min(25, Math.max(0, Number(b.budget) || 0)),
        Math.min(5400, Math.max(0, Number(b.max_requests) || 0)),
      )
      .run();
    return json({ ok: true });
  }
  if (path === "/api/admin/clear-help" && method === "POST") {
    await admin(req, env);
    const b = await body(req);
    await env.DB.prepare("UPDATE students SET help='' WHERE id=?")
      .bind(str(b.id, 80))
      .run();
    return json({ ok: true });
  }
  if (path === "/api/admin/export" && method === "GET") {
    await admin(req, env);
    const rows = await env.DB.prepare(
      "SELECT st.number,st.name,st.squad,s.lesson,s.prompt,s.result,s.reflection,s.tool,s.link,s.media_state,s.status,s.score,s.feedback,s.updated_at FROM students st LEFT JOIN submissions s ON s.student_id=st.id ORDER BY CAST(st.number AS INTEGER),s.lesson",
    ).all<Record<string, unknown>>();
    const cols = [
      "number",
      "name",
      "squad",
      "lesson",
      "prompt",
      "result",
      "reflection",
      "tool",
      "link",
      "media_state",
      "status",
      "score",
      "feedback",
      "updated_at",
    ];
    const cell = (v: unknown) => {
      let t = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return '"' + t.replaceAll('"', '""') + '"';
    };
    return new Response(
      "\uFEFF" +
        [
          cols.join(","),
          ...rows.results.map((r) => cols.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="ai-class-p4-results.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  throw new HttpError(404, "ไม่พบรายการที่ร้องขอ");
}
export default {
  async fetch(req, env) {
    try {
      const path = new URL(req.url).pathname;
      const res = path.startsWith("/api/")
        ? await api(req, env)
        : await env.ASSETS.fetch(req);
      const headers = new Headers(res.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "same-origin");
      headers.set("X-Frame-Options", "DENY");
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(
        JSON.stringify({
          event: "request_failed",
          path: new URL(req.url).pathname,
          error: e instanceof Error ? e.name : "unknown",
        }),
      );
      return json({ error: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่" }, 500);
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
