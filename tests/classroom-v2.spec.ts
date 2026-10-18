import {
  test,
  expect,
  request as factory,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
test.describe.configure({ mode: "serial" });
const secret = JSON.parse(readFileSync(".secrets.json", "utf8"));
const base = "http://127.0.0.1:8787";
const uiName = "นักเรียนทดสอบหน้าฝึกใหม่ " + Math.floor(Math.random() * 100000);
let number = "",
  uiNumber = "";
let student: APIRequestContext, teacher: APIRequestContext, studentId: string;
const analysisAnswers = [
  "ตำบลหนองแสง 6 เหตุ มากที่สุด",
  "18:00–23:59 มี 10 เหตุ",
  "18:00–23:59 มีลักทรัพย์ 5 เหตุ โดยหนองแสงมี 4 เหตุ",
  "ตำบลบ้านใหม่ 18:00–23:59 มีเหตุปล้น 3 เหตุ",
  "จัดร่างสายตรวจช่วงเย็นที่หนองแสงและบ้านใหม่ โดยประสานข้อมูลเพิ่มเติมก่อนใช้จริง",
];
test.beforeAll(async () => {
  student = await factory.newContext({ baseURL: base });
  teacher = await factory.newContext({ baseURL: base });
  const login = await teacher.post("/api/admin/login", {
    data: { password: secret.ADMIN_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
});
test.afterAll(async () => {
  await student?.dispose();
  await teacher?.dispose();
});

test("self-entered unique student numbers; ownership and validation", async () => {
  number = String(100000 + Math.floor(Math.random() * 899999));
  expect(
    (
      await student.post("/api/register", {
        data: { name: "ผู้เรียนไม่มีเลข", squad: "3" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await student.post("/api/register", {
        data: { name: "ผู้เรียนกลุ่มผิด", squad: "9", number },
      })
    ).status(),
  ).toBe(400);
  const registered = await student.post("/api/register", {
    data: { name: "ผู้เรียน API รุ่นใหม่", squad: "3", number },
  });
  expect(registered.status()).toBe(201);
  expect((await registered.json()).number).toBe(number);
  expect(
    (
      await student.post("/api/register", {
        data: { name: "ผู้เรียนซ้ำเลข", squad: "1", number },
      })
    ).status(),
  ).toBe(409);
  const other = await factory.newContext({ baseURL: base });
  const otherRegistered = await other.post("/api/register", {
    data: {
      name: "ผู้เรียนอีกคน",
      squad: "1",
      number: String(100000 + Math.floor(Math.random() * 899999)),
    },
  });
  expect(otherRegistered.status()).toBe(201);
  await other.dispose();
  const me = await (await student.get("/api/me")).json();
  studentId = me.student.id;
  expect(me.student.squad).toBe("3");
  expect((await student.get("/api/admin/overview")).status()).toBe(403);
  await student.post("/api/logout", { data: {} });
  expect(
    (
      await student.post("/api/login", { data: { number: "ไม่ใช่ตัวเลข" } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await student.post("/api/login", {
        data: { number: String(Number(number) + 1) },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await student.post("/api/login", { data: { number } })).ok(),
  ).toBeTruthy();
  expect(
    (
      await student.post("/api/submission", {
        data: {
          lesson: 1,
          result: "ตำรวจสายตรวจดูแลความปลอดภัยและช่วยเหลือประชาชน",
          tool: "Gemini",
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await student.post("/api/draft", {
        data: { lesson: 8, result: "https:", link: "https:", tool: "Gemini" },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await student.post("/api/submission", {
        data: { lesson: 6, answers: ["ไม่ครบ"], tool: "AI ในระบบ" },
      })
    ).status(),
  ).toBe(400);
  const saved = await student.post("/api/submission", {
    data: { lesson: 6, answers: analysisAnswers, tool: "AI ในระบบ" },
  });
  expect(saved.ok()).toBeTruthy();
  const sub = (await (await student.get("/api/me")).json()).submissions.find(
    (s: { lesson: number }) => s.lesson === 6,
  );
  expect(JSON.parse(sub.answers_json)).toEqual(analysisAnswers);
  expect(sub.result).toContain("6.5");
  expect(
    (
      await student.post("/api/submission", {
        data: { lesson: 8, result: "javascript:alert(1)", tool: "Gemini" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await student.post("/api/submission", {
        data: {
          lesson: 8,
          result: "https://gemini.google.com/share/training-fixture",
          tool: "Gemini",
        },
      })
    ).ok(),
  ).toBeTruthy();
  const ownChat = await student.get("/api/chat");
  expect((await ownChat.json()).messages).toHaveLength(0);
  const settings = (await (await teacher.get("/api/admin/overview")).json())
    .settings;
  try {
    await teacher.post("/api/admin/settings", {
      data: { ...settings, lock_following: 1, active_lesson: 6 },
    });
    expect(
      (
        await student.post("/api/submission", {
          data: {
            lesson: 8,
            result: "https://example.com/work",
            tool: "Gemini",
          },
        })
      ).status(),
    ).toBe(403);
    await teacher.post("/api/admin/settings", {
      data: { ...settings, budget: 0 },
    });
    expect(
      (
        await student.post("/api/ai", {
          data: { id: randomUUID(), lesson: 6, prompt: "ช่วยตอบข้อ 6.1" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await teacher.post("/api/admin/settings", { data: settings });
  }
  expect(
    (
      await teacher.post("/api/admin/settings", {
        headers: { Origin: "https://evil.invalid" },
        data: settings,
      })
    ).status(),
  ).toBe(403);
});

test("mobile: returning login resumes the last exercise page from the server", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.locator(".role-card").first().click();
  await page.locator(".segmented button").nth(1).click();
  await page.locator('input[name="number"]').fill(number);
  await page
    .locator("form")
    .getByRole("button", { name: "เข้าสู่ระบบ" })
    .click();
  await expect(
    page.getByRole("heading", { name: "หน้าหลักของฉัน", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ทำแบบฝึกหัดต่อ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ทำภาพสรุปงานสายตรวจ", exact: true }),
  ).toBeVisible();
  await ctx.close();
});

test("real analysis chat uses server dataset, retains history, does not duplicate calls", async () => {
  const id = randomUUID();
  const r = await student.post("/api/ai", {
    data: {
      id,
      lesson: 6,
      prompt:
        "ตอบเฉพาะข้อ 6.1 พื้นที่ใดมีเหตุทั้งหมดมากที่สุด พร้อมจำนวนเหตุ โดยนับจากข้อมูลที่ให้มา",
    },
    timeout: 75000,
  });
  const result = await r.json();
  expect(r.ok(), JSON.stringify(result)).toBeTruthy();
  expect(result.result).toContain("หนองแสง");
  expect(result.result).toContain("6");
  expect(
    (
      await (
        await student.post("/api/ai", {
          data: { id, lesson: 6, prompt: "ถามซ้ำ" },
        })
      ).json()
    ).replayed,
  ).toBe(true);
  const history = (await (await student.get("/api/chat")).json()).messages;
  expect(history).toHaveLength(1);
  expect(history[0].result).toBe(result.result);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/ai-v2-smoke.json",
    JSON.stringify(
      {
        model: result.model,
        cost: result.cost,
        characters: result.result.length,
        history: history.length,
      },
      null,
      2,
    ),
  );
});

test("final AI review requires every required lesson, grades with scores and link checks, replays", async () => {
  test.setTimeout(180000);
  expect(
    (
      await student.post("/api/final-review", { data: { id: randomUUID() } })
    ).status(),
  ).toBe(400);
  for (const lesson of [2, 3, 4, 5]) {
    expect(
      (
        await student.post("/api/submission", {
          data: {
            lesson,
            result: `คำตอบข้อ ${lesson} จากการฝึกด้วยข้อมูลสมมติเพื่อการเรียน`,
            tool: "Gemini",
          },
        })
      ).ok(),
    ).toBeTruthy();
  }
  const id = randomUUID();
  const r = await student.post("/api/final-review", {
    data: { id },
    timeout: 95000,
  });
  const result = await r.json();
  expect(r.ok(), JSON.stringify(result)).toBeTruthy();
  const rows = result.lessons as {
    lesson: number;
    score: number;
    linkStatus?: string;
  }[];
  for (const rid of [1, 2, 3, 4, 5, 6, 8])
    expect(
      rows.some((x) => x.lesson === rid && x.score >= 0 && x.score <= 10),
      `lesson ${rid} graded`,
    ).toBe(true);
  expect(result.average).toBeGreaterThanOrEqual(0);
  expect(result.average).toBeLessThanOrEqual(10);
  expect(String(result.summary).length).toBeGreaterThan(0);
  expect(rows.find((x) => x.lesson === 8)?.linkStatus || "").not.toBe("");
  const meAfter = await (await student.get("/api/me")).json();
  expect(meAfter.finalReview.status).toBe("done");
  const replay = await (
    await student.post("/api/final-review", { data: { id }, timeout: 30000 })
  ).json();
  expect(replay.replayed).toBe(true);
  expect(replay.average).toBe(result.average);
  writeFileSync(
    "test-results/final-review-smoke.json",
    JSON.stringify(
      {
        average: result.average,
        lessons: rows.map((x) => ({
          lesson: x.lesson,
          score: x.score,
          linkStatus: x.linkStatus || null,
        })),
        summary: result.summary,
      },
      null,
      2,
    ),
  );
});

test("mobile: eight pages, external answers, downloads, drafts, chat, optional skip and completion", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("By: Dr.Ake");
  await page.locator(".role-card").first().click();
  uiNumber = String(150000 + Math.floor(Math.random() * 800000));
  await page.locator('input[name="number"]').fill(uiNumber);
  await page.locator(".group-picker button").nth(1).click();
  await page.locator('input[name="name"]').fill(uiName);
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "ลงทะเบียนเข้าห้องเรียน", exact: true })
    .click();
  await page.locator(".assigned-number").waitFor();
  await expect(page.locator(".assigned-number")).toHaveText(uiNumber);
  await page.screenshot({
    path: "test-results/v2-student-assigned-number.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "เข้าห้องเรียน", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "หน้าหลักของฉัน", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "เริ่มทำแบบฝึกหัด", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ลองถาม AI", exact: true }),
  ).toBeVisible();
  expect(await page.locator(".exercise-page").count()).toBe(1);
  await page.getByRole("button", { name: "คัดลอก", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "ตำรวจสายตรวจ",
  );
  await page.screenshot({
    path: "test-results/v2-student-question1.png",
    fullPage: true,
  });
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill(
      "ตำรวจสายตรวจมีหน้าที่ดูแลความปลอดภัย ป้องกันเหตุ และช่วยเหลือประชาชน",
    );
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.getByText("ส่งคำตอบแล้ว — กำลังไปข้อถัดไป")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ถามเรื่องกฎหมาย", exact: true }),
  ).toBeVisible({ timeout: 6000 });
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill("คำตอบกฎหมายฉบับร่าง ต้องตรวจแหล่งอ้างอิงกับผู้สอนก่อนใช้");
  await page.getByRole("button", { name: "ข้อถัดไป", exact: true }).click();
  await expect(page.locator(".english-source")).toContainText(
    "Good morning, officer.",
  );
  await page.getByRole("button", { name: "ข้อก่อนหน้า", exact: true }).click();
  await expect(page.getByLabel("คำตอบ", { exact: true })).toHaveValue(
    "คำตอบกฎหมายฉบับร่าง ต้องตรวจแหล่งอ้างอิงกับผู้สอนก่อนใช้",
  );
  await page.reload();
  await expect(page.getByLabel("คำตอบ", { exact: true })).toHaveValue(
    "คำตอบกฎหมายฉบับร่าง ต้องตรวจแหล่งอ้างอิงกับผู้สอนก่อนใช้",
  );
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.locator(".form-success")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "แปลภาษาจีน แล้วช่วยผู้มาติดต่อ",
      exact: true,
    }),
  ).toBeVisible({ timeout: 6000 });
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill(
      "สวัสดีครับคุณตำรวจ ผมต้องการแจ้งกระเป๋าหาย พบครั้งสุดท้ายใกล้สถานีขนส่ง",
    );
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.locator(".form-success")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "อ่านตัวหนังสือจากภาพ", exact: true }),
  ).toBeVisible({ timeout: 6000 });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "บันทึกรูปไปใช้" }).click();
  expect((await download).suggestedFilename()).toContain(".png");
  await expect
    .poll(async () =>
      page
        .locator(".training-image img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill(
      "บันทึกข้อความ ที่ ฝก. 001/2569 วันที่ 18 ตุลาคม 2569 เรื่อง ขอเชิญเข้าร่วมการฝึกใช้ปัญญาประดิษฐ์ในงานตำรวจ",
    );
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.locator(".form-success")).toBeVisible();
  await page.screenshot({
    path: "test-results/v2-student-document.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("heading", { name: "วัตถุนี้อาจเป็นอะไร?", exact: true }),
  ).toBeVisible({ timeout: 6000 });
  await expect
    .poll(async () =>
      page
        .locator(".training-image img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill(
      "มีกระเป๋าสีดำอยู่ใต้ที่นั่ง ไม่สามารถทราบสิ่งที่อยู่ภายในหรือประเมินอันตรายจากภาพนี้เพียงอย่างเดียว",
    );
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.locator(".form-success")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ลองวิเคราะห์ข้อมูลเหตุ", exact: true }),
  ).toBeVisible({ timeout: 6000 });
  expect(await page.locator(".incident-table tbody tr").count()).toBe(18);
  for (let i = 0; i < 5; i++)
    await page
      .locator(".analysis-answers textarea")
      .nth(i)
      .fill(analysisAnswers[i]);
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.locator(".form-success")).toBeVisible();
  await page.getByRole("button", { name: "ถามข้อ 6.2", exact: true }).click();
  await page.getByRole("button", { name: "ส่งคำถาม", exact: true }).click();
  await expect(page.locator(".chat-assistant pre")).toBeVisible({
    timeout: 75000,
  });
  await page.getByRole("button", { name: "คัดลอกคำตอบ", exact: true }).click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).length,
  ).toBeGreaterThan(20);
  await page.screenshot({
    path: "test-results/v2-student-analysis.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "ข้อถัดไป", exact: true }).click();
  await expect(
    page.getByText("ไม่บังคับ", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "ข้ามไปข้อ 8", exact: true }).click();
  await page
    .getByLabel("ลิงก์ผลงาน", { exact: true })
    .fill("https://gemini.google.com/share/ui-training-fixture");
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await expect(page.locator(".form-success")).toBeVisible();
  if (await page.locator(".toast").count())
    await page.locator(".toast").click();
  await page.locator(".exercise-steps button").first().click();
  await expect(
    page.getByText("ส่งแล้ว 7 / 7 ข้อหลัก", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill("คำตอบฉบับแก้ไข: ตำรวจสายตรวจช่วยเหลือประชาชนและดูแลความปลอดภัย");
  await page
    .getByRole("button", { name: "ส่งคำตอบที่แก้ไข", exact: true })
    .click();
  await expect(page.locator(".form-success")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const ctx2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page2 = await ctx2.newPage();
  await page2.goto("/");
  await page2.locator(".role-card").first().click();
  await page2.locator(".segmented button").nth(1).click();
  await page2.locator('input[name="number"]').fill(uiNumber);
  await page2
    .locator("form")
    .getByRole("button", { name: "เข้าสู่ระบบ" })
    .click();
  await expect(
    page2.getByRole("heading", { name: "หน้าหลักของฉัน", exact: true }),
  ).toBeVisible();
  await expect(page2.locator(".home-stat").first()).toContainText("7");
  await expect(
    page2.getByRole("button", { name: "ทำใหม่อีกครั้ง", exact: true }),
  ).toBeVisible();
  await page2.screenshot({
    path: "test-results/v2-student-home.png",
    fullPage: true,
  });
  await page2
    .getByRole("button", { name: "ดูคะแนนรวม / ให้ AI ตรวจ", exact: true })
    .click();
  await expect(
    page2.getByRole("heading", { name: "สรุปและส่งคำตอบทั้งหมด", exact: true }),
  ).toBeVisible();
  await expect(page2.locator(".final-row").nth(6)).toContainText("ไม่ได้ส่ง");
  await page2.screenshot({
    path: "test-results/v2-student-final-review.png",
    fullPage: true,
  });
  await ctx2.close();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("desktop: eight monitor columns, 7 required, separate subanswers, review and display", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await ctx.newPage();
  await page.goto("/instructor");
  await page.locator('input[name="password"]').fill(secret.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ห้องควบคุม" }).click();
  await expect(
    page.getByText("ส่งครบ 7 ข้อหลัก", { exact: true }),
  ).toBeVisible();
  expect(await page.locator(".mission-th").count()).toBe(8);
  expect(await page.locator(".mission-verdict").count()).toBe(8);
  await page.getByLabel("เลือกกลุ่มเรียน", { exact: true }).selectOption("2");
  await expect(
    page.locator(".student-name").filter({ hasText: uiName }),
  ).toBeVisible();
  await page.getByLabel("เลือกกลุ่มเรียน", { exact: true }).selectOption("4");
  await expect(
    page.locator(".student-name").filter({ hasText: uiName }),
  ).toHaveCount(0);
  await page.getByLabel("เลือกกลุ่มเรียน", { exact: true }).selectOption("all");
  await page.getByText("เสร็จเมื่อ", { exact: true }).waitFor();
  await page
    .getByLabel("เรียงลำดับรายชื่อ", { exact: true })
    .selectOption("finish-desc");
  await expect(page.locator(".roster-table tbody tr").first()).toContainText(
    uiName,
  );
  await page
    .getByLabel("เรียงลำดับรายชื่อ", { exact: true })
    .selectOption("number");
  await page.getByLabel("ค้นหานักเรียน", { exact: true }).fill(uiNumber);
  await page.locator(".student-name").filter({ hasText: uiName }).click();
  await expect(page.locator(".detail-person")).toContainText("/7 ข้อหลัก");
  await page.locator(".detail-tabs button").nth(5).click();
  await expect(page.locator(".work-result pre")).toContainText("6.5");
  await expect(page.locator(".work-result pre")).toContainText("บ้านใหม่");
  await page
    .getByLabel("ความคิดเห็น", { exact: true })
    .fill("ตรวจครบทั้งห้าข้อแล้วครับ");
  await page.getByRole("button", { name: "บันทึกผลตรวจ" }).click();
  await expect(
    page.getByText("บันทึกผลตรวจแล้ว", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "นำเสนอบนจอ" }).click();
  await expect(page.locator(".presentation-author")).toContainText("ซ่อนชื่อ");
  await page.screenshot({
    path: "test-results/v2-instructor-presentation.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "ปิดโหมดนำเสนอ" }).click();
  await page.getByRole("button", { name: "ปิด", exact: true }).click();
  await page.screenshot({
    path: "test-results/v2-instructor-monitor.png",
    fullPage: true,
  });
  await ctx.close();
});

test("removed PIN endpoints stay closed; logout invalidates the session", async () => {
  expect(
    (await student.post("/api/pin", { data: { pin: "1234" } })).status(),
  ).toBe(404);
  expect(
    (
      await teacher.post("/api/admin/recovery", { data: { id: studentId } })
    ).status(),
  ).toBe(404);
  await student.post("/api/logout", { data: {} });
  expect((await student.get("/api/me")).status()).toBe(401);
  expect(
    (await student.post("/api/login", { data: { number: "0000" } })).status(),
  ).toBe(403);
  expect(
    (await student.post("/api/login", { data: { number } })).ok(),
  ).toBeTruthy();
  const outsider = await factory.newContext({ baseURL: base });
  expect((await outsider.get("/api/chat")).status()).toBe(401);
  expect((await outsider.get(`/api/admin/student/${studentId}`)).status()).toBe(
    401,
  );
  await outsider.dispose();
});
