import React from "react";
import type { ExtensionReview } from "../shared/extensions";
export function ExtensionGrade({
  review,
  onGrade,
  busy,
  disabled,
}: {
  review?: ExtensionReview;
  onGrade?: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  let result:
    { score: number; feedback: string; improvements: string } | undefined;
  try {
    if (review?.status === "done") result = JSON.parse(review.result);
  } catch {}
  return (
    <section className="extension-internal-ai" aria-label="คะแนน AI ข้อเสริม">
      <h4>คะแนน AI ข้อเสริม · แยกจากคะแนนเดิม</h4>
      {result && (
        <>
          <p>
            <strong>{result.score}/10</strong>
            {review?.stale ? " · ผลเก่า คำตอบหรือเกณฑ์เปลี่ยนแล้ว" : ""}
          </p>
          <p>{result.feedback}</p>
          <p>ควรปรับ: {result.improvements}</p>
        </>
      )}
      {review?.status === "running" && (
        <p>คำขอก่อนหน้าอาจกำลังตรวจอยู่ กรุณารอสักครู่แล้วโหลดใหม่</p>
      )}
      {review?.status === "failed" && (
        <p>การตรวจครั้งก่อนยังไม่สำเร็จ ลองใหม่ได้</p>
      )}
      {onGrade && (
        <button
          className="btn secondary"
          disabled={busy || disabled}
          onClick={onGrade}
        >
          {busy
            ? "กำลังดำเนินการ…"
            : result
              ? "ให้ AI ตรวจข้อเสริมนี้อีกครั้ง"
              : "ให้ AI ตรวจข้อเสริมนี้ (0–10)"}
        </button>
      )}
      <p className="muted">
        ตรวจข้อความกับเฉลยล่าสุด ไม่ได้เปิดดูภาพในลิงก์ · ตรวจได้สูงสุด 5
        ครั้งต่อข้อ · ผลเป็นเบื้องต้น ผู้สอนเป็นผู้ตรวจยืนยัน
      </p>
      {disabled && onGrade && <p>ส่งหรือบันทึกคำตอบล่าสุดก่อนให้ AI ตรวจ</p>}
    </section>
  );
}
