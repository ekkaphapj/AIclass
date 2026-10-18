import React, { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
type Message = { id: string; prompt: string; result: string };
export function ExtensionAi({
  mission,
  prompt,
}: {
  mission: number;
  prompt: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const alive = useRef(true);
  const load = async () => {
    const d = await api<{ messages: Message[] }>(`/chat?extension=${mission}`);
    if (alive.current) setMessages(d.messages);
  };
  useEffect(() => {
    alive.current = true;
    void load().catch((e) => setNotice(String(e)));
    return () => {
      alive.current = false;
    };
  }, [mission]);
  const send = async () => {
    if (busy) return;
    if (prompt.trim().length < 20) {
      setNotice("เขียนคำถามด้านบน หรือกดใช้ตัวอย่างก่อนถาม");
      return;
    }
    setBusy(true);
    setNotice("กำลังวิเคราะห์ข้อมูลคดี…");
    const id = crypto.randomUUID();
    try {
      for (let i = 0; i < 15; i++) {
        try {
          await api("/ai", { id, extension: mission, prompt });
          if (alive.current) {
            await load();
            setNotice("ได้คำตอบแล้ว ตรวจข้อมูลก่อนคัดลอกไปส่ง");
          }
          return;
        } catch (e) {
          if (e instanceof ApiError && e.retry && i < 14) {
            if (alive.current) setNotice("มีผู้ใช้พร้อมกัน กำลังรอช่องว่าง…");
            await new Promise((r) => setTimeout(r, 4000));
            if (!alive.current) return;
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      if (alive.current) setNotice(String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      className="extension-internal-ai"
      aria-label={`AI ในระบบ ข้อเสริม ${mission}`}
    >
      <h4>ทางเลือก 1 · ถาม AI ในหน้านี้</h4>
      <p>AI เห็นข้อมูลข้อนี้แล้ว ใช้คำถามด้านบนถามได้เลย ไม่ต้องคัดลอกข้อมูล</p>
      <p className="muted">
        OpenRouter ตอบข้อความและ diagram แบบข้อความ • ไม่ค้นเว็บ/สร้างภาพ •
        ใช้โควตารวม 18 ครั้งกับแชตเดิม
      </p>
      <button className="btn" disabled={busy} onClick={() => void send()}>
        {busy ? "กำลังตอบ…" : "ถาม OpenRouter ด้วย prompt ด้านบน"}
      </button>
      {notice && <p role="status">{notice}</p>}
      <div className="extension-ai-history">
        {messages.map((m) => (
          <article key={m.id}>
            <details>
              <summary>คำถามที่ส่ง</summary>
              <p>{m.prompt}</p>
            </details>
            <pre>{m.result}</pre>
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(m.result);
                  setNotice("คัดลอกคำตอบแล้ว ไปขั้นส่งงานเพื่อวางและแก้ไข");
                } catch {
                  setNotice("คัดลอกไม่ได้ เลือกข้อความแล้วคัดลอกเองได้");
                }
              }}
            >
              คัดลอกคำตอบ AI
            </button>
          </article>
        ))}
      </div>
      <p>
        ถามต่อ: แก้คำถามด้านบนแล้วกดถามอีกครั้ง ประวัติแยกแต่ละข้อ
        คำตอบยังไม่ถูกส่งเป็นงาน
      </p>
    </section>
  );
}
