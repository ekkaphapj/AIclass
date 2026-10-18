import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("extension gating, persistence, ownership, instructor status and mobile presentation", async ({
  browser,
}) => {
  const baseURL = "http://127.0.0.1:8787";
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const outsider = await browser.newContext({ baseURL });
  const teacher = await browser.newContext({ baseURL });
  const api = context.request;
  try {
    expect((await outsider.request.get("/api/extensions")).status()).toBe(401);
    let registered;
    for (let i = 0; i < 10; i++) {
      registered = await api.post("/api/register", {
        data: {
          number: String(100000 + Math.floor(Math.random() * 899999)),
          name: "ทดสอบภารกิจต่อยอด local",
          squad: "4",
        },
      });
      if (registered.status() === 201) break;
    }
    expect(registered?.status()).toBe(201);
    const student = (await (await api.get("/api/me")).json()).student;
    const locked = await (await api.get("/api/extensions")).json();
    expect(locked.unlocked).toBe(false);
    expect(locked.content).toEqual([]);
    expect(
      (await api.post("/api/extensions", { data: { mission: 1 } })).status(),
    ).toBe(403);
    expect(
      (await api.get(`/api/admin/extensions/${student.id}`)).status(),
    ).toBe(403);
    for (const lesson of [1, 2, 3, 4, 5, 6, 8]) {
      const response = await api.post("/api/submission", {
        data: {
          lesson,
          result: "คำตอบจำลองสำหรับทดสอบ local",
          tool: "test",
          answers: Array(5).fill("คำตอบจำลอง"),
          ...(lesson === 8 ? { link: "https://example.com/work" } : {}),
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    const unlocked = await (await api.get("/api/extensions")).json();
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.content).toHaveLength(2);
    expect(unlocked.content.join("")).not.toContain("เฉลยสำหรับผู้สอน");
    expect(
      (await api.post("/api/extensions", { data: { mission: 3 } })).status(),
    ).toBe(400);
    expect(
      (
        await api.post("/api/extensions", {
          data: {
            mission: 1,
            status: "submitted",
            findings: "ข้อค้นพบ",
            plan: "แผนการ",
            link: "javascript:alert(1)",
          },
        })
      ).status(),
    ).toBe(400);
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /A · สืบคดีจำลอง/ }).click();
    await page
      .getByLabel("ข้อค้นพบ และลำดับเวลา พร้อมรหัสหลักฐาน")
      .fill("19:50 L1 และ 20:05 L2 หลังแก้เวลาลบสองนาที");
    await page
      .getByLabel("สมมติฐานทางเลือก ข้อจำกัด และข้อมูลที่ต้องตรวจต่อ")
      .fill("อาจเป็นการส่งของตามปกติ ยังระบุตัวผู้กระทำไม่ได้");
    await page
      .getByLabel("ลิงก์ภาพนำเสนอ HTTPS")
      .fill("https://example.com/timeline");
    await page.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "บันทึกร่างบนเซิร์ฟเวอร์แล้ว",
    );
    await page.reload();
    await page.getByRole("button", { name: /A · สืบคดีจำลอง/ }).click();
    await expect(
      page.getByLabel("ข้อค้นพบ และลำดับเวลา พร้อมรหัสหลักฐาน"),
    ).toHaveValue(/19:50/);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "ดาวน์โหลดภาพแม่แบบจากคำตอบ" })
      .click();
    expect((await download).suggestedFilename()).toContain(".png");
    await page
      .getByRole("button", { name: "ส่งภารกิจต่อยอด 1", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("ส่งภารกิจต่อยอดแล้ว");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/extensions-mobile.png",
      fullPage: true,
    });
    await api.post("/api/extensions", {
      data: {
        mission: 2,
        status: "submitted",
        findings: "รวม 68 เหตุ เย็น 25",
        plan: "รถหนึ่งชุดพร้อมรับเหตุ อีกชุดตรวจพื้นที่",
        link: "https://example.com/clock",
      },
    });
    const secret = JSON.parse(readFileSync(".secrets.json", "utf8"));
    expect(
      (
        await teacher.request.post("/api/admin/login", {
          data: { password: secret.ADMIN_PASSWORD },
        })
      ).ok(),
    ).toBe(true);
    const overview = await (
      await teacher.request.get("/api/admin/overview")
    ).json();
    expect(
      overview.extensionWork.filter(
        (w: { student_id: string }) => w.student_id === student.id,
      ),
    ).toHaveLength(2);
    const review = await (
      await teacher.request.get(`/api/admin/extensions/${student.id}`)
    ).json();
    expect(
      review.work.every((w: { status: string }) => w.status === "submitted"),
    ).toBe(true);
    expect(
      (
        await outsider.request.get(`/api/admin/extensions/${student.id}`)
      ).status(),
    ).toBe(401);
    const dashboard = await teacher.newPage();
    await dashboard.goto("/instructor");
    await expect(
      dashboard.getByRole("columnheader", { name: "ต่อยอด A" }),
    ).toBeVisible();
    await dashboard
      .getByRole("row")
      .filter({ hasText: student.number })
      .getByRole("button", { name: "ส่งแล้ว", exact: true })
      .first()
      .click();
    await expect(
      dashboard.getByRole("dialog", { name: "ผลงานภารกิจต่อยอด" }),
    ).toBeVisible();
    await expect(
      dashboard.getByRole("link", { name: "เปิดภาพนำเสนอ" }),
    ).toHaveCount(2);
    await dashboard.screenshot({
      path: "test-results/extensions-instructor.png",
      fullPage: true,
    });
  } finally {
    await context.close();
    await outsider.close();
    await teacher.close();
  }
});
