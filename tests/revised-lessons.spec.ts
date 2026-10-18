import { test, expect } from "@playwright/test";
test("mobile Chinese translation-followup and unfamiliar object identification", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:8787",
    viewport: { width: 390, height: 844 },
  });
  try {
    let registered;
    for (let i = 0; i < 10; i++) {
      registered = await context.request.post("/api/register", {
        data: {
          number: String(100000 + Math.floor(Math.random() * 899999)),
          name: "ผู้เรียนทดสอบโจทย์จีนและวัตถุ",
          squad: "2",
        },
      });
      if (registered.status() === 201) break;
    }
    expect(registered?.status()).toBe(201);
    const me = await (await context.request.get("/api/me")).json();
    const page = await context.newPage();
    await page.addInitScript((id) => {
      sessionStorage.setItem(`p4-view-${id}`, "exercise");
      localStorage.setItem(`p4-page-${id}`, "3");
    }, me.student.id);
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "แปลภาษาจีน แล้วช่วยผู้มาติดต่อ",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/警官您好/)).toBeVisible();
    await expect(
      page.getByText(/แหล่งข้อมูล ลิงก์ และวันที่ตรวจ/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/chinese-followup-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: /^ข้อ 5 วัตถุนี้อาจเป็นอะไร/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "วัตถุนี้อาจเป็นอะไร?", exact: true }),
    ).toBeVisible();
    const image = page.locator(".training-image img");
    await expect(image).toHaveAttribute("src", "/training/unknown-device.png");
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    const downloaded = page.waitForEvent("download");
    await page.getByRole("link", { name: "บันทึกรูปไปใช้" }).click();
    expect((await downloaded).suggestedFilename()).toContain(
      "อุปกรณ์ไม่ทราบชนิด",
    );
    await expect(
      page.getByText(/เสนอคำตอบที่เป็นไปได้ไม่เกิน 3 ชนิด/),
    ).toBeVisible();
    await page
      .getByLabel("คำตอบ", { exact: true })
      .fill(
        "อาจเป็นกล้องตรวจจับการเคลื่อนไหว เพราะมีเลนส์และช่องคล้ายเซนเซอร์ ต้องเทียบรุ่นกับเอกสารผู้ผลิต ยังยืนยันหน้าที่ภายในหรือความปลอดภัยไม่ได้",
      );
    await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
    const saved = await (await context.request.get("/api/me")).json();
    expect(
      saved.submissions.find((s: { lesson: number }) => s.lesson === 5).result,
    ).toContain("เอกสารผู้ผลิต");
  } finally {
    await context.close();
  }
});
