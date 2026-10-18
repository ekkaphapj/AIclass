import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const base = "https://ai-class-p4.ekapap-j.workers.dev",
  secrets = JSON.parse(readFileSync(".secrets.json", "utf8"));
for (const name of readdirSync("dist/assets")) {
  if (!/\.(js|css)$/.test(name)) continue;
  const content = readFileSync("dist/assets/" + name, "utf8");
  for (const value of [secrets.OPENROUTER_API_KEY,secrets.ADMIN_PASSWORD])
    assert(!content.includes(value), "Secret leaked in public assets");
}
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch(),
  learner = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  }),
  teacher = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
let fixture;
const report = { version: 2, url: base, checks: [], errors: [] };
try {
  const adminPage = await teacher.newPage();
  adminPage.on("pageerror", (e) => report.errors.push(e.message));
  await adminPage.goto(base + "/instructor");
  await adminPage
    .locator('input[name="password"]')
    .fill(secrets.ADMIN_PASSWORD);
  await adminPage.getByRole("button", { name: "เข้าสู่ห้องควบคุม" }).click();
  await adminPage.getByRole("heading", { name: "ภาพรวมห้องเรียน" }).waitFor();
  report.checks.push("fixed-instructor-password");
  report.initialStudents = (
    await (await teacher.request.get(base + "/api/admin/overview")).json()
  ).students.length;
  const page = await learner.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(base);
  const name = "ทดสอบระบบ8ข้อก่อนส่งมอบ",
    number = String(150000 + Math.floor(Math.random() * 800000));
  await page.locator(".role-card").first().click();
  await page.locator('input[name="number"]').fill(number);
  await page.locator(".group-picker button").nth(1).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "ลงทะเบียนเข้าห้องเรียน", exact: true })
    .click();
  await page.locator(".assigned-number").waitFor();
  await page.screenshot({
    path: "test-results/production-v2-assigned-number.png",
  });
  await page
    .getByRole("button", { name: "เข้าห้องเรียน", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "หน้าหลักของฉัน", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "เริ่มทำแบบฝึกหัด", exact: true })
    .click();
  await page.getByRole("heading", { name: "ลองถาม AI", exact: true }).waitFor();
  const me = await (await learner.request.get(base + "/api/me")).json();
  fixture = { id: me.student.id, number, name };
  writeFileSync(
    "test-results/production-fixture.json",
    JSON.stringify(fixture),
  );
  report.checks.push("student-entered-unique-student-number");
  assert(
    (await page.locator(".student-brand").innerText()).includes("By: Dr.Ake"),
  );
  assert.equal(await page.locator(".exercise-steps button").count(), 8);
  await page
    .getByLabel("คำตอบ", { exact: true })
    .fill("ตำรวจสายตรวจช่วยดูแลความปลอดภัย ป้องกันเหตุ และช่วยเหลือประชาชน");
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await page.locator(".form-success").waitFor();
  await page.screenshot({
    path: "test-results/production-v2-question1.png",
    fullPage: true,
  });
  report.checks.push("single-page-external-answer");
  for (const i of [3, 4]) {
    await page.locator(".exercise-steps button").nth(i).click();
    await page.locator(".training-image img").waitFor();
    await page.waitForFunction(
      () => document.querySelector(".training-image img")?.naturalWidth > 0,
    );
  }
  report.checks.push("ocr-and-object-image-assets");
  await page.locator(".exercise-steps button").nth(5).click();
  assert.equal(await page.locator(".incident-table tbody tr").count(), 18);
  await page.getByRole("button", { name: "ถามข้อ 6.1", exact: true }).click();
  await page.getByRole("button", { name: "ส่งคำถาม", exact: true }).click();
  await page.locator(".chat-assistant pre").waitFor({ timeout: 75000 });
  assert(
    (await page.locator(".chat-assistant pre").innerText()).includes("หนองแสง"),
  );
  const answers = [
    "หนองแสง 6 เหตุ",
    "18:00–23:59 รวม 10 เหตุ",
    "ช่วง 18:00–23:59 หนองแสง 4 เหตุลักทรัพย์",
    "บ้านใหม่ 18:00–23:59 มีเหตุปล้น 3 เหตุ",
    "ร่างแผนสายตรวจช่วงเย็นในหนองแสงและบ้านใหม่ โดยประสานข้อมูลอื่นก่อนนำไปใช้",
  ];
  for (let i = 0; i < 5; i++)
    await page.locator(".analysis-answers textarea").nth(i).fill(answers[i]);
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await page.locator(".form-success").waitFor();
  report.checks.push("live-context-chat-and-five-answers");
  await page.getByRole("button", { name: "ข้อถัดไป", exact: true }).click();
  await page.getByRole("button", { name: "ข้ามไปข้อ 8", exact: true }).click();
  await page
    .getByLabel("ลิงก์ผลงาน", { exact: true })
    .fill("https://gemini.google.com/share/production-training-fixture");
  await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
  await page.locator(".form-success").waitFor();
  report.checks.push("optional-music-and-infographic-link");
  const denied = await learner.request.get(base + "/api/admin/overview");
  assert.equal(denied.status(), 403);
  await adminPage
    .getByRole("button", { name: "รีเฟรชข้อมูล", exact: true })
    .click();
  await adminPage.getByLabel("ค้นหานักเรียน", { exact: true }).fill(number);
  await adminPage.locator(".student-name").filter({ hasText: name }).click();
  await adminPage.locator(".detail-tabs button").nth(5).click();
  await adminPage.locator(".work-result pre").waitFor();
  assert(
    (await adminPage.locator(".work-result pre").innerText()).includes("6.5"),
  );
  await adminPage
    .getByLabel("ความคิดเห็น", { exact: true })
    .fill("ตรวจการแสดงคำตอบทั้ง 5 ข้อแล้ว");
  await adminPage.getByRole("button", { name: "บันทึกผลตรวจ" }).click();
  await adminPage.getByText("บันทึกผลตรวจแล้ว", { exact: true }).waitFor();
  await adminPage.getByRole("button", { name: "นำเสนอบนจอ" }).click();
  await adminPage.getByRole("dialog", { name: "โหมดนำเสนอผลงาน" }).waitFor();
  assert(
    (await adminPage.locator(".presentation-author").innerText()).includes(
      "ซ่อนชื่อ",
    ),
  );
  await adminPage.screenshot({
    path: "test-results/production-v2-showcase.png",
    fullPage: true,
  });
  report.checks.push("instructor-review-and-private-projection");
  assert.deepEqual(report.errors, []);
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.failure = String(e);
  throw e;
} finally {
  await browser.close();
  if (fixture) {
    const sql = `DELETE FROM students WHERE id='${fixture.id}' AND number='${fixture.number}' AND name='${fixture.name}' AND squad='2';`;
    const cleanup = spawnSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "d1",
        "execute",
        "ai-class-p4",
        "--remote",
        "--command",
        sql,
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    report.fixtureRemoved = cleanup.status === 0;
    if (cleanup.status !== 0)
      console.error(
        "Fixture cleanup failed. Inspect test-results/production-fixture.json",
      );
  }
  writeFileSync(
    "test-results/production-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
