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

const saveExtension = async (f, mission = 1) => {
  const r = await f.request(
    {
      mission,
      status: "submitted",
      prompt,
      findings: "R3 R4 R9 หรือ E01 เป็นหลักฐาน ต้องตรวจคนใช้เครื่อง",
      plan: "สรุปสิ่งที่พบและตรวจหลักฐานเพิ่มเติมก่อนสรุป",
      link: "",
    },
    "pupil",
    "/api/extensions",
  );
  assert.equal(r.status, 200);
};
test("grading: final review receives current Chinese source, translation and unknown-device criteria", async () => {
  const f = setup(),
    saved = globalThis.fetch;
  let payload;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    payload = JSON.parse(init.body);
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              lessons: [1, 2, 3, 4, 5, 6].map((lesson) => ({
                lesson,
                score: 8,
                comment: "fixture",
              })),
              summary: "ตรวจตามเกณฑ์ใหม่",
            }),
          },
        },
      ],
      usage: { cost: 0.001 },
    });
  };
  try {
    const response = await f.request(
      { id: randomUUID() },
      "pupil",
      "/api/final-review",
    );
    assert.equal(response.status, 200);
    const content = payload.messages[1].content;
    assert.ok(content.includes("警官您好"));
    assert.ok(content.includes("พรุ่งนี้บ่าย"));
    assert.ok(content.includes("คำแปลอ้างอิง"));
    assert.ok(content.includes("unknown-device.png"));
    assert.ok(content.includes("trail camera"));
    assert.ok(content.includes("เฉลยตัวเลขอ้างอิงสำหรับตรวจข้อ 6"));
    assert.equal((await response.json()).rubricVersion, "2026-10-19-v2");
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
test("grading: private reference, scope-safe replay, saved scores and stale-answer detection", async () => {
  const f = setup(),
    saved = globalThis.fetch;
  let calls = 0,
    payload;
  globalThis.fetch = async (url, init) => {
    calls++;
    payload = JSON.parse(init.body);
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 8.5,
              feedback: "อ้างหลักฐานได้",
              improvements: "แยกข้อสันนิษฐานให้ชัด",
            }),
          },
        },
      ],
      usage: { cost: 0.001 },
    });
  };
  try {
    assert.equal(
      (
        await f.request(
          { mission: 1, id: randomUUID() },
          "pupil",
          "/api/extensions/review",
        )
      ).status,
      400,
    );
    await saveExtension(f);
    const id = randomUUID();
    let r = await f.request(
      { mission: 1, id },
      "pupil",
      "/api/extensions/review",
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).score, 8.5);
    assert.ok(payload.messages[0].content.includes("R4/R6/R8/R9"));
    assert.ok(payload.messages[0].content.includes("ไม่เปิดดูเนื้อหาลิงก์"));
    let d = await (await f.request(null, "pupil", "/api/extensions")).json();
    assert.equal(d.reviews[0].stale, false);
    assert.equal(JSON.parse(d.reviews[0].result).score, 8.5);
    assert.ok(!JSON.stringify(d.cases).includes("promptที่กำหนดงานชัด0–2"));
    r = await f.request({ mission: 1, id }, "pupil", "/api/extensions/review");
    assert.equal((await r.json()).replayed, true);
    assert.equal(calls, 1);
    await saveExtension(f, 2);
    assert.equal(
      (await f.request({ mission: 2, id }, "pupil", "/api/extensions/review"))
        .status,
      409,
    );
    assert.equal((await f.request({ extension: 1, id, prompt })).status, 409);
    f.db.exec(
      "UPDATE extension_work SET findings='แก้คำตอบให้เพิ่มข้อมูลใหม่' WHERE mission=1",
    );
    d = await (await f.request(null, "pupil", "/api/extensions")).json();
    assert.equal(d.reviews.find((r) => r.mission === 1).stale, true);
    assert.equal(
      (
        await (
          await f.request({ mission: 1, id }, "pupil", "/api/extensions/review")
        ).json()
      ).stale,
      true,
    );
    assert.equal(
      (await (await f.request(null, "pupil", "/api/me")).json()).aiUsed,
      0,
    );
    assert.equal(
      (
        await f.request(
          { mission: 1, id: randomUUID() },
          "other",
          "/api/extensions/review",
        )
      ).status,
      403,
    );
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
test("grading: per-mission five-run cap, separate original review allowance and second case answer key", async () => {
  const f = setup(),
    saved = globalThis.fetch;
  let calls = 0,
    last;
  globalThis.fetch = async (url, init) => {
    calls++;
    last = JSON.parse(init.body);
    return Response.json({
      choices: [
        {
          message: {
            content:
              '{"score":7,"feedback":"ครบ","improvements":"เพิ่มรายละเอียด"}',
          },
        },
      ],
      usage: { cost: 0.001 },
    });
  };
  try {
    await saveExtension(f);
    await saveExtension(f, 2);
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await f.request(
            { mission: 1, id: randomUUID() },
            "pupil",
            "/api/extensions/review",
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await f.request(
          { mission: 1, id: randomUUID() },
          "pupil",
          "/api/extensions/review",
        )
      ).status,
      403,
    );
    assert.equal(calls, 5);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM ai_jobs WHERE lesson=0").get().n,
      0,
    );
    assert.equal(
      (
        await f.request(
          { mission: 2, id: randomUUID() },
          "pupil",
          "/api/extensions/review",
        )
      ).status,
      200,
    );
    assert.ok(last.messages[0].content.includes("C=0/0/3/4"));
    assert.ok(last.messages[0].content.includes("D=0/0/3/2"));
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
test("grading: malformed provider result retains cost and does not persist a false score", async () => {
  const f = setup(),
    saved = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: '{"score":99,"feedback":"bad","improvements":"bad"}',
          },
        },
      ],
    });
  try {
    await saveExtension(f);
    assert.equal(
      (
        await f.request(
          { mission: 1, id: randomUUID() },
          "pupil",
          "/api/extensions/review",
        )
      ).status,
      502,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM extension_reviews").get().status,
      "failed",
    );
    assert.equal(f.db.prepare("SELECT cost FROM ai_jobs").get().cost, 0.004);
  } finally {
    globalThis.fetch = saved;
    f.db.close();
  }
});
