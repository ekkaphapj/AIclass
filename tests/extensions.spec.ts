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
    expect(locked.cases).toEqual([]);
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
    expect(unlocked.content[0]).toContain("ปล้นรถขนเงิน");
    expect(unlocked.content[0]).toContain("IMEI-AAA");
    expect(unlocked.cases[0].sections[2].cards).toHaveLength(9);
    expect(unlocked.cases[1].sections[1].cards).toHaveLength(20);
    const counts: Record<string, number[]> = {
      A: [0, 0, 0, 0],
      B: [0, 0, 0, 0],
      C: [0, 0, 0, 0],
      D: [0, 0, 0, 0],
    };
    for (const card of unlocked.cases[1].sections[1].cards) {
      const match = card.heading.match(/• (\d{2}):\d{2} น\. • โซน ([ABCD])/);
      expect(match).toBeTruthy();
      counts[match![2]][Math.floor(Number(match![1]) / 6)]++;
    }
    // Columns here are midnight, morning, afternoon, evening.
    expect(counts).toEqual({
      A: [0, 4, 0, 0],
      B: [0, 0, 4, 0],
      C: [4, 0, 0, 3],
      D: [2, 0, 0, 3],
    });

    expect(unlocked.content.join("")).not.toContain("ตัวอย่างเฉพาะส่วน");
    expect(unlocked.content.join("")).not.toContain("ช่วยเรียงเหตุการณ์");
    for (const mission of [1, 2]) {
      expect(
        (
          await api.post("/api/extensions", {
            data: {
              mission,
              status: "submitted",
              findings: "ข้อมูลครบแล้ว",
              plan: "แผนตรวจสอบต่อ",
              link: "https://example.com/image",
            },
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await api.post("/api/extensions", {
            data: {
              mission,
              status: "submitted",
              prompt: "สั้น",
              findings: "ข้อมูลครบแล้ว",
              plan: "แผนตรวจสอบต่อ",
              link: "https://example.com/image",
            },
          })
        ).status(),
      ).toBe(400);
    }
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

    const mockHistory: Record<
      number,
      { id: string; prompt: string; result: string }[]
    > = { 1: [], 2: [] };
    await context.route("**/api/chat?extension=*", async (route) => {
      const m = Number(
        new URL(route.request().url()).searchParams.get("extension"),
      );
      await route.fulfill({ json: { messages: mockHistory[m] || [] } });
    });
    await context.route("**/api/ai", async (route) => {
      const b = route.request().postDataJSON();
      const result = `diagram ข้อ ${b.extension}: หลักฐาน fixture → ตรวจเพิ่ม`;
      mockHistory[b.extension].push({ id: b.id, prompt: b.prompt, result });
      await route.fulfill({ json: { result } });
    });
    const page = await context.newPage();
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            sessionStorage.setItem("test-copied", text);
          },
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /ข้อ 1.*ปล้นรถขนเงิน/ }).click();
    await expect(
      page.getByRole("button", { name: "1. อ่านคดี" }),
    ).toHaveAttribute("aria-current", "step");
    await expect(
      page.getByText("เกิดอะไรขึ้น?", { exact: true }),
    ).toBeVisible();
    await page.getByText("CDR 9 รายการ", { exact: false }).click();
    await expect(
      page.getByRole("heading", { name: "R4 • 14:16 น." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/extensions-mobile-data.png",
      fullPage: true,
    });
    const datasetDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "ดาวน์โหลดข้อมูล .txt" }).click();
    const datasetPath = await (await datasetDownload).path();
    expect(readFileSync(datasetPath!, "utf8")).toBe(unlocked.content[0]);
    await page.getByRole("button", { name: "ต่อไป: ใช้ AI →" }).click();
    await expect(page.getByLabel("Prompt ที่คุณเขียนและใช้จริง")).toHaveValue(
      "",
    );
    await page
      .getByRole("button", { name: "ใช้ตัวอย่าง prompt", exact: true })
      .click();
    await expect(page.getByLabel("Prompt ที่คุณเขียนและใช้จริง")).toHaveValue(
      /IMEI/,
    );
    await page
      .getByLabel("Prompt ที่คุณเขียนและใช้จริง")
      .fill(
        "ช่วยดู R3 R4 และ R9 ว่าใครควรตรวจต่อ อธิบายความสัมพันธ์ของเบอร์กับ IMEI ทำผังลูกศรและแยกสิ่งที่ยังไม่รู้ ไม่ตัดสินว่าใครผิด",
      );
    await page
      .getByRole("button", { name: "คัดลอกข้อมูล + prompt", exact: true })
      .click();
    expect(
      await page.evaluate(() => sessionStorage.getItem("test-copied")),
    ).toContain(unlocked.content[0]);
    expect(
      await page.evaluate(() => sessionStorage.getItem("test-copied")),
    ).toContain("ไม่ตัดสินว่าใครผิด");
    await page
      .getByRole("button", { name: "ถาม OpenRouter ด้วย prompt ด้านบน" })
      .click();
    await expect(
      page.getByText("diagram ข้อ 1: หลักฐาน fixture → ตรวจเพิ่ม", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "คัดลอกคำตอบ AI", exact: true })
      .click();
    expect(
      await page.evaluate(() => sessionStorage.getItem("test-copied")),
    ).toContain("diagram ข้อ 1");
    await page.screenshot({
      path: "test-results/extensions-mobile-prompt.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "ต่อไป: ส่งงาน →" }).click();
    await expect(
      page.getByLabel("ผลวิเคราะห์ + diagram การเชื่อมโยง"),
    ).toHaveValue("");
    await page
      .getByLabel("ผลวิเคราะห์ + diagram การเชื่อมโยง")
      .fill(
        "R4 เวลา 14:16 เบอร์ 095-999 ใช้ IMEI-AAA และ R9 ติดต่อเบอร์นายตรี",
      );
    await page
      .getByLabel("รายงานสั้น 5–6 บรรทัด")
      .fill(
        "ควรตรวจผู้ใช้เครื่องและความสัมพันธ์การติดต่อ ยังระบุตัวคนถือเครื่องไม่ได้ ต้องตรวจภาพต้นฉบับเพิ่ม",
      );
    await page
      .getByLabel("ลิงก์ diagram หรือผลงาน Gemini (ถ้ามี, HTTPS)")
      .fill("https://example.com/timeline");
    await page.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "บันทึกร่างบนเซิร์ฟเวอร์แล้ว",
    );
    await page.reload();
    await page.getByRole("button", { name: /ข้อ 1.*ปล้นรถขนเงิน/ }).click();
    await page.getByRole("button", { name: "2. ใช้ AI", exact: true }).click();
    await expect(page.getByLabel("Prompt ที่คุณเขียนและใช้จริง")).toHaveValue(
      /ไม่ตัดสินว่าใครผิด/,
    );
    await page.getByRole("button", { name: "3. ส่งงาน", exact: true }).click();
    await expect(
      page.getByLabel("ผลวิเคราะห์ + diagram การเชื่อมโยง"),
    ).toHaveValue(/14:16/);
    await page.getByText("สร้างภาพไม่ทัน?", { exact: true }).click();
    const pictureDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "ดาวน์โหลดภาพแม่แบบจากคำตอบ" })
      .click();
    expect((await pictureDownload).suggestedFilename()).toContain(".png");
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
    await page.getByRole("button", { name: "← เลือกข้ออื่น" }).click();
    await page.getByRole("button", { name: /ข้อ 2.*20 เหตุ 4 โซน/ }).click();
    await page.locator("summary").filter({ hasText: "รายงาน 20 เหตุ" }).click();
    await expect(
      page.getByRole("heading", { name: "E20 • 01:20 น. • โซน C" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/extensions-mobile-case2.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "2. ใช้ AI", exact: true }).click();
    await expect(page.getByLabel("Prompt ที่คุณเขียนและใช้จริง")).toHaveValue(
      "",
    );
    await page
      .getByRole("button", { name: "ใช้ตัวอย่าง prompt", exact: true })
      .click();
    await expect(page.getByLabel("Prompt ที่คุณเขียนและใช้จริง")).toHaveValue(
      /ได้ 20/,
    );
    await page
      .getByRole("button", { name: "ถาม OpenRouter ด้วย prompt ด้านบน" })
      .click();
    await expect(
      page.getByText("diagram ข้อ 2: หลักฐาน fixture → ตรวจเพิ่ม", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("diagram ข้อ 1: หลักฐาน fixture → ตรวจเพิ่ม", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "3. ส่งงาน", exact: true }).click();
    await page
      .getByLabel("ตาราง / กราฟ / ผังที่ได้จาก AI")
      .fill("A เช้า 4 B บ่าย 4 C ค่ำ 3 ดึก 4 D ค่ำ 3 ดึก 2 รวม 20 เหตุ");
    await page
      .getByLabel("แผนตรวจ + ข้อความเตือนชุมชน")
      .fill(
        "เช้าตลาด บ่ายหมู่บ้าน ค่ำและดึกหอพักกับเลี่ยงเมือง คงรถพร้อมรับเหตุหนึ่งชุด เตือนเก็บทรัพย์และล็อกรถ",
      );
    await page
      .getByLabel("ลิงก์ diagram หรือผลงาน Gemini (ถ้ามี, HTTPS)")
      .fill("https://example.com/clock");
    await page
      .getByRole("button", { name: "ส่งภารกิจต่อยอด 2", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("ส่งภารกิจต่อยอดแล้ว");
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
      review.work.find((w: { mission: number }) => w.mission === 1).prompt,
    ).toContain("ไม่ตัดสินว่าใครผิด");
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
    await expect(dashboard.getByRole("dialog")).toContainText(
      "ไม่ตัดสินว่าใครผิด",
    );
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
