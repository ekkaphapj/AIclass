import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { build } from "esbuild";

// Run the actual Worker and SQL with an in-memory D1 adapter. Only the provider is mocked.
const compiled = await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
});
const worker = (
  await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].text).toString("base64")
  )
).default;
function setup(unlocked = true) {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("migrations/" + file, "utf8"));
  for (const id of ["pupil", "other"]) {
    db.prepare(
      "INSERT INTO students(id,number,name,squad,recovery_hash,created_at,last_seen) VALUES(?,?,?,?,?,?,?)",
    ).run(
      id,
      id === "pupil" ? "123" : "124",
      "fixture",
      "1",
      "unused",
      Date.now(),
      Date.now(),
    );
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      createHash("sha256").update(id).digest("hex"),
      id,
      "student",
      Date.now() + 3600000,
    );
  }
  if (unlocked)
    for (const lesson of [1, 2, 3, 4, 5, 6, 8])
      db.prepare(
        "INSERT INTO submissions(id,student_id,lesson,prompt,result,reflection,tool,submitted_at,updated_at) VALUES(?,'pupil',?,'prompt','answer','','test',?,?)",
      ).run(randomUUID(), lesson, Date.now(), Date.now());
  function prepare(sql) {
    let args = [];
    return {
      bind(...values) {
        args = values;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...args) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args) };
      },
      async run() {
        const r = db.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes) } };
      },
    };
  }
  const env = {
    DB: {
      prepare,
      async batch(stmts) {
        db.exec("BEGIN");
        try {
          const r = await Promise.all(stmts.map((s) => s.run()));
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    OPENROUTER_API_KEY: "mock-key",
    AI_MODEL: "mock-model",
    AI_INPUT_PRICE: "0.048",
    AI_OUTPUT_PRICE: "0.20",
  };
  const request = (body, token = "pupil", path = "/api/ai") =>
    worker.fetch(
      new Request("https://classroom.test" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: "p4_session=" + token,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  return { db, request };
}
const prompt = "ช่วยทำ diagram จากข้อมูลจริงในโจทย์ พร้อมรหัสหลักฐาน";
test("extension AI: gating and invalid missions never call provider", async () => {
  const f = setup(false),
    saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("unexpected provider");
  };
  try {
    for (const extension of [0, 1, 2, 3])
      assert.equal(
        (await f.request({ id: randomUUID(), extension, prompt })).status,
        extension === 1 || extension === 2 ? 403 : 400,
      );
    assert.equal(
      (await f.request(null, "pupil", "/api/chat?extension=1")).status,
      403,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
test("extension AI: authoritative case, private history, replay, mission separation and text-only submission", async () => {
  const f = setup(),
    saved = globalThis.fetch,
    payloads = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    payloads.push(JSON.parse(init.body));
    return Response.json({
      choices: [
        { message: { content: "ผลวิเคราะห์ fixture → IMEI พร้อมข้อจำกัด" } },
      ],
      usage: { cost: 0.001 },
    });
  };
  try {
    const id = randomUUID();
    let r = await f.request({ id, extension: 1, prompt });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).result.includes("IMEI"));
    assert.ok(
      payloads[0].messages.some(
        (m) =>
          m.role === "system" &&
          m.content.includes("IMEI-AAA") &&
          m.content.includes("R9"),
      ),
    );
    assert.equal((await f.request({ id, extension: 1, prompt })).status, 200);
    assert.equal(payloads.length, 1);
    assert.equal(
      (await f.request({ id }, "pupil", "/api/final-review")).status,
      409,
    );
    assert.equal((await f.request({ id, extension: 2, prompt })).status, 409);
    assert.equal(
      (await f.request({ id, extension: 1, prompt }, "other")).status,
      403,
    );
    r = await f.request({
      id: randomUUID(),
      extension: 1,
      prompt: "ถามต่อช่วยอธิบายข้อจำกัดจากคำตอบก่อนหน้า",
    });
    assert.equal(r.status, 200);
    assert.ok(
      payloads[1].messages.some(
        (m) => m.role === "assistant" && m.content.includes("fixture"),
      ),
    );
    r = await f.request({ id: randomUUID(), extension: 2, prompt });
    assert.equal(r.status, 200);
    assert.ok(
      payloads[2].messages.some(
        (m) => m.role === "system" && m.content.includes("E20"),
      ),
    );
    assert.ok(!payloads[2].messages.some((m) => m.role === "assistant"));
    assert.equal(
      (await (await f.request(null, "pupil", "/api/chat?extension=1")).json())
        .messages.length,
      2,
    );
    assert.equal(
      (await (await f.request(null, "pupil", "/api/chat?extension=2")).json())
        .messages.length,
      1,
    );
    assert.equal(
      (await (await f.request(null, "other", "/api/chat")).json()).messages
        .length,
      0,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM ai_jobs WHERE status='done'").get()
        .n,
      3,
    );
    assert.equal(
      f.db.prepare("SELECT SUM(cost) c FROM ai_jobs").get().c,
      0.003,
    );
    assert.equal(
      (
        await f.request(
          {
            mission: 1,
            status: "submitted",
            prompt,
            findings: "diagram ข้อความและเหตุผล",
            plan: "ตรวจผู้ใช้เครื่องและหลักฐานเพิ่มเติม",
            link: "",
          },
          "pupil",
          "/api/extensions",
        )
      ).status,
      200,
    );
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
test("extension AI: shared pause, budget, concurrency and learner quota", async () => {
  const f = setup(),
    saved = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("unexpected provider");
  };
  const ask = () => f.request({ id: randomUUID(), extension: 1, prompt });
  try {
    f.db.exec("UPDATE settings SET ai_paused=1");
    assert.equal((await ask()).status, 403);
    f.db.exec("UPDATE settings SET ai_paused=0,budget=0");
    assert.equal((await ask()).status, 403);
    f.db.exec("UPDATE settings SET budget=3");
    f.db
      .prepare(
        "INSERT INTO ai_jobs(id,student_id,lesson,status,reserved,created_at) VALUES(?,'pupil',6,'running',0.004,?)",
      )
      .run(randomUUID(), Date.now());
    assert.equal((await ask()).status, 429);
    f.db.exec("UPDATE ai_jobs SET status='done'");
    for (let i = 1; i < 18; i++)
      f.db
        .prepare(
          "INSERT INTO ai_jobs(id,student_id,lesson,status,created_at) VALUES(?,'pupil',6,'done',?)",
        )
        .run(randomUUID(), Date.now());
    assert.equal((await ask()).status, 403);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
test("extension AI: provider failure retains reservation and does not save a chat answer", async () => {
  const f = setup(),
    saved = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    assert.equal(
      (await f.request({ id: randomUUID(), extension: 2, prompt })).status,
      502,
    );
    const row = f.db.prepare("SELECT status,cost FROM ai_jobs").get();
    assert.equal(row.status, "failed");
    assert.equal(row.cost, 0.004);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM chat_messages").get().n,
      0,
    );
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
