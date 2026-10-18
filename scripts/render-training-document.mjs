import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const font = readFileSync(
  "node_modules/@fontsource-variable/noto-sans-thai/files/noto-sans-thai-thai-wght-normal.woff2",
).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 1980 },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Thai;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;font-family:Thai,sans-serif;color:#24211d;background:#eee9df;padding:70px}article{background:#fffef9;min-height:1840px;padding:85px 90px;border:1px solid #ded7c8;box-shadow:0 4px 30px #0001}.training{border:2px solid #914333;color:#914333;text-align:center;padding:12px;font-size:25px;letter-spacing:1px}h1{text-align:center;font-size:55px;font-weight:650;margin:50px 0 40px}.line{font-size:28px;line-height:1.9;border-bottom:1px solid #d4cdbc;padding:12px 0}.row{display:flex;justify-content:space-between;gap:30px}p{font-size:29px;line-height:2.1;text-indent:65px;margin:35px 0}b{font-weight:650}.signature{text-align:center;margin:65px 0 0 400px;font-size:27px;line-height:2.1}.footer{margin-top:80px;border-top:1px solid #ddd5c5;padding-top:20px;color:#9b8c76;font-size:21px;text-align:center}</style><article><div class="training">เอกสารจำลองสำหรับการฝึกอ่านภาพ — ไม่ใช่หนังสือราชการจริง</div><h1>บันทึกข้อความ</h1><div class="line"><b>ส่วนราชการ</b> ศูนย์ฝึกตำรวจตัวอย่าง งานฝึกอบรม</div><div class="line row"><span><b>ที่</b> ฝก. 001/2569</span><span><b>วันที่</b> 18 ตุลาคม 2569</span></div><div class="line"><b>เรื่อง</b> ขอเชิญเข้าร่วมการฝึกใช้ปัญญาประดิษฐ์ในงานตำรวจ</div><div class="line"><b>เรียน</b> ผู้เข้ารับการฝึกอบรม รุ่นตัวอย่าง</div><p>ด้วยศูนย์ฝึกตำรวจตัวอย่าง กำหนดจัดกิจกรรมฝึกใช้ปัญญาประดิษฐ์ในงานตำรวจ เพื่อให้ผู้เข้ารับการฝึกอบรมได้ทดลองถามคำถาม แปลภาษา อ่านข้อความจากภาพ และวิเคราะห์ข้อมูลสมมติ</p><p>ขอให้ผู้เข้ารับการฝึกอบรมเข้าร่วมกิจกรรม ในวันที่ 20 ตุลาคม 2569 เวลา 09.00–11.00 น. ณ ห้องฝึกอบรม 2 พร้อมโทรศัพท์มือถือที่เชื่อมต่ออินเทอร์เน็ตได้</p><p>ในการฝึกครั้งนี้ ให้ใช้ข้อมูลสมมติเท่านั้น ไม่ส่งข้อมูลส่วนบุคคลหรือข้อมูลคดีจริงเข้าไปในระบบปัญญาประดิษฐ์ และตรวจสอบคำตอบก่อนนำไปใช้</p><p>จึงเรียนมาเพื่อทราบและเข้าร่วมกิจกรรมตามวันและเวลาดังกล่าว</p><div class="signature">(ชื่อผู้ประสานงานสมมติ)<br/>ผู้ประสานงานการฝึกอบรม<br/>ไม่มีลายมือชื่อจริง</div><div class="footer">สื่อประกอบการเรียน AI Police Lab · By: Dr.Ake</div></article>`,
);
await page.evaluate(() => document.fonts.ready);
mkdirSync("public/training", { recursive: true });
await page.screenshot({
  path: "public/training/document-ocr.png",
  fullPage: true,
});
await browser.close();
writeFileSync(
  "public/training/document-source.txt",
  "เอกสารจำลองสำหรับการฝึกอ่านภาพ — ไม่ใช่หนังสือราชการจริง\nบันทึกข้อความ\nส่วนราชการ ศูนย์ฝึกตำรวจตัวอย่าง งานฝึกอบรม\nที่ ฝก. 001/2569\nวันที่ 18 ตุลาคม 2569\nเรื่อง ขอเชิญเข้าร่วมการฝึกใช้ปัญญาประดิษฐ์ในงานตำรวจ\nเรียน ผู้เข้ารับการฝึกอบรม รุ่นตัวอย่าง\nวันที่เข้าร่วมกิจกรรม 20 ตุลาคม 2569 เวลา 09.00–11.00 น. ณ ห้องฝึกอบรม 2\nสื่อประกอบการเรียน AI Police Lab · By: Dr.Ake\n",
);
console.log("Rendered fictional OCR training document.");
