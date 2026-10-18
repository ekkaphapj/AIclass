import React, { useEffect, useState } from "react";
import { api } from "./api";
import { extensionTitles, type ExtensionWork } from "../shared/extensions";

type Data = { unlocked: boolean; content: string[]; work: ExtensionWork[] };
export function Extensions({ studentId }: { studentId: string }) {
  const [data, setData] = useState<Data>();
  const [active, setActive] = useState(0);
  const [findings, setFindings] = useState(""),
    [plan, setPlan] = useState(""),
    [link, setLink] = useState("");
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const d = await api<Data>("/extensions");
    setData(d);
    return d;
  };
  useEffect(() => {
    void refresh().catch((e) => setNotice(String(e)));
  }, []);
  const key = (n: number) => `p4-extension-${studentId}-${n}`;
  const open = async (n: number) => {
    setBusy(true);
    setNotice("");
    try {
      let row = data?.work.find((w) => w.mission === n);
      if (!row) {
        await api("/extensions", { mission: n, status: "started" });
        row = (await refresh()).work.find((w) => w.mission === n);
      }
      let values = {
        findings: row?.findings || "",
        plan: row?.plan || "",
        link: row?.link || "",
      };
      try {
        const draft = JSON.parse(localStorage.getItem(key(n)) || "null");
        if (draft && draft.updated_at > (row?.updated_at || 0)) values = draft;
      } catch {}
      setFindings(values.findings);
      setPlan(values.plan);
      setLink(values.link);
      setActive(n);
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const update = (field: string, value: string) => {
    const values = {
      findings,
      plan,
      link,
      [field]: value,
      updated_at: Date.now(),
    };
    if (field === "findings") setFindings(value);
    if (field === "plan") setPlan(value);
    if (field === "link") setLink(value);
    try {
      localStorage.setItem(key(active), JSON.stringify(values));
    } catch {
      setNotice("เครื่องนี้บันทึกร่างไม่ได้ กรุณากดบันทึกร่างบนเซิร์ฟเวอร์");
    }
  };
  const save = async (submit: boolean) => {
    setBusy(true);
    setNotice("");
    try {
      await api("/extensions", {
        mission: active,
        status: submit ? "submitted" : "started",
        findings,
        plan,
        link,
      });
      await refresh();
      localStorage.removeItem(key(active));
      setNotice(submit ? "ส่งภารกิจต่อยอดแล้ว" : "บันทึกร่างบนเซิร์ฟเวอร์แล้ว");
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data!.content[active - 1]);
      setNotice("คัดลอกข้อมูลและคำสั่งแล้ว");
    } catch {
      setNotice("คัดลอกไม่ได้ เลือกข้อความในชุดข้อมูลด้านล่างได้");
    }
  };
  const downloadText = () =>
    download(
      new Blob([data!.content[active - 1]], {
        type: "text/plain;charset=utf-8",
      }),
      `mission-${active}.txt`,
    );
  const picture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1600;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.fillStyle = "#faf5e9";
    c.fillRect(0, 0, 900, 1600);
    c.fillStyle = "#463923";
    c.font = "bold 32px sans-serif";
    c.fillText(
      active === 1 ? "คดีจำลอง — Timeline" : "แผนชุมชนจำลอง 7 วัน",
      40,
      65,
    );
    let y = 125;
    c.font = "24px sans-serif";
    const lines = (text: string) => {
      for (const paragraph of text.split("\n")) {
        let line = "";
        for (const char of paragraph) {
          if (c.measureText(line + char).width > 810) {
            c.fillText(line, 40, y);
            y += 36;
            line = "";
          }
          line += char;
        }
        c.fillText(line, 40, y);
        y += 36;
      }
    };
    if (active === 2) {
      const cx = 450,
        cy = 330,
        r = 175;
      const colors = ["#c3b79c", "#af9e79", "#927c51", "#72592f"];
      [13, 14, 16, 25].forEach((v, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, r, a, a + Math.PI / 2);
        c.closePath();
        c.fillStyle = colors[i];
        c.fill();
        c.fillStyle = "#fff";
        c.fillText(
          `${i * 6}–${(i + 1) * 6}: ${v}`,
          cx + 100 * Math.cos(a + Math.PI / 4) - 48,
          cy + 100 * Math.sin(a + Math.PI / 4),
        );
      });
      y = 560;
      c.fillStyle = "#463923";
      lines("นาฬิกา 24 ชั่วโมง / รวมยอดรับแจ้ง 28 วัน 68 เหตุ");
    }
    if (active === 1) {
      const events = findings
        .split("\n")
        .filter((x) => x.trim())
        .slice(0, 6);
      c.strokeStyle = "#927c51";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(55, 120);
      c.lineTo(55, 120 + Math.max(0, events.length - 1) * 160);
      c.stroke();
      events.forEach((event, i) => {
        const top = 120 + i * 160;
        c.fillStyle = "#72592f";
        c.beginPath();
        c.arc(55, top, 12, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#463923";
        let line = "",
          row = 0;
        for (const char of event.slice(0, 100)) {
          if (c.measureText(line + char).width > 720) {
            c.fillText(line, 90, top + row * 34);
            line = "";
            row++;
          }
          line += char;
        }
        c.fillText(line, 90, top + row * 34);
      });
      y = 1150;
      lines("สมมติฐาน / ข้อจำกัด / ตรวจต่อ");
      lines(plan.slice(0, 220));
    } else {
      lines(findings.slice(0, 280));
      y += 20;
      lines(plan.slice(0, 280));
    }
    c.font = "20px sans-serif";
    c.fillText("ข้อมูลจำลองเพื่อการฝึก • ตรวจข้อความก่อนนำเสนอ", 40, 1550);
    canvas.toBlob((blob) => {
      if (blob) download(blob, `mission-${active}-presentation.png`);
    });
  };
  return (
    <section className="surface extension-panel">
      <h2>ภารกิจต่อยอด 2 สถานการณ์</h2>
      <p>แยกจากคะแนนเดิม • ข้อละ 10–15 นาที • นำเสนอ 60–90 วินาที</p>
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>กำลังโหลด…</p>
      ) : !data.unlocked ? (
        <p>🔒 ส่งครบ 7 ข้อหลักก่อนเริ่ม (ข้อเพลงไม่บังคับ)</p>
      ) : (
        <>
          <div className="extension-actions">
            {extensionTitles.map((title, i) => (
              <button
                className="btn secondary"
                key={title}
                disabled={busy}
                onClick={() => void open(i + 1)}
              >
                {String.fromCharCode(65 + i)} · {title} —{" "}
                {data.work.find((w) => w.mission === i + 1)?.status ===
                "submitted"
                  ? "ส่งแล้ว"
                  : data.work.some((w) => w.mission === i + 1)
                    ? "เริ่มแล้ว"
                    : "พร้อมเริ่ม"}
              </button>
            ))}
          </div>
          {active > 0 && (
            <div className="stack">
              <h3>{extensionTitles[active - 1]}</h3>
              <p>
                อ่าน 2 นาที → วิเคราะห์ 4 → ตรวจ 3 → ทำภาพ 3 นาที ใช้ AI
                ภายนอกที่เคยใช้ได้เลย
              </p>
              <div className="extension-actions">
                <button className="btn" onClick={() => void copy()}>
                  คัดลอกโจทย์พร้อมข้อมูล
                </button>
                <button className="btn secondary" onClick={downloadText}>
                  ดาวน์โหลดข้อมูล .txt
                </button>
                <a
                  className="btn secondary"
                  href="https://gemini.google.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  เปิด Gemini
                </a>
              </div>
              {active === 1 && (
                <img
                  src="/training/extension-scene.svg"
                  alt="แผนภาพจำลองร้าน เคาน์เตอร์ ประตูหลัง และลานส่งของ ไม่มีภาพผู้หยิบทรัพย์"
                  style={{ width: "100%", maxWidth: 650 }}
                />
              )}
              <details>
                <summary>อ่านชุดข้อมูลและคำสั่ง AI</summary>
                <pre className="extension-data">{data.content[active - 1]}</pre>
              </details>
              <label>
                ข้อค้นพบ{" "}
                {active === 1
                  ? "และลำดับเวลา พร้อมรหัสหลักฐาน"
                  : "3 ประเด็นพร้อมตัวเลข"}
                <textarea
                  disabled={busy}
                  rows={6}
                  maxLength={8000}
                  value={findings}
                  onChange={(e) => update("findings", e.target.value)}
                />
              </label>
              <label>
                {active === 1
                  ? "สมมติฐานทางเลือก ข้อจำกัด และข้อมูลที่ต้องตรวจต่อ"
                  : "แผนสายตรวจ แผนเผชิญเหตุ และประชาสัมพันธ์"}
                <textarea
                  disabled={busy}
                  rows={6}
                  maxLength={8000}
                  value={plan}
                  onChange={(e) => update("plan", e.target.value)}
                />
              </label>
              <button className="btn secondary" onClick={picture}>
                ดาวน์โหลดภาพแม่แบบจากคำตอบ
              </button>
              <p>
                ภาพแม่แบบใช้ข้อความสั้นส่วนต้น ตรวจว่าแสดงครบก่อนนำเสนอ ภารกิจ A
                ให้เรียงเวลาในช่องข้อค้นพบ แชร์ภาพผ่านบริการที่ใช้ แล้ววางลิงก์
                HTTPS
              </p>
              <label>
                ลิงก์ภาพนำเสนอ HTTPS
                <input
                  disabled={busy}
                  type="url"
                  value={link}
                  maxLength={2000}
                  onChange={(e) => update("link", e.target.value)}
                />
              </label>
              <p>
                ร่างเก็บในเครื่องอัตโนมัติ กดบันทึกร่างเพื่อเปิดทำต่อข้ามเครื่อง
                การบันทึกร่างหลังส่งจะเปลี่ยนสถานะกลับเป็นเริ่มแล้ว
              </p>
              <div className="extension-actions">
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void save(false)}
                >
                  บันทึกร่าง
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  ส่งภารกิจต่อยอด {active}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function InstructorExtension({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const [work, setWork] = useState<ExtensionWork[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ work: ExtensionWork[] }>(`/admin/extensions/${studentId}`)
      .then((d) => setWork(d.work))
      .catch((e) => setError(String(e)));
  }, [studentId]);
  return (
    <dialog open className="extension-review" aria-label="ผลงานภารกิจต่อยอด">
      <button className="btn secondary" onClick={onClose}>
        ปิด
      </button>
      <h2>ผลงานภารกิจต่อยอด</h2>
      {error && <p role="alert">{error}</p>}
      {!work && !error && <p>กำลังโหลด…</p>}
      {work?.length === 0 && <p>ยังไม่เริ่มภารกิจต่อยอด</p>}
      {work?.map((w) => (
        <article key={w.mission}>
          <h3>
            {extensionTitles[w.mission - 1]} —{" "}
            {w.status === "submitted" ? "ส่งแล้ว" : "เริ่มแล้ว / ร่าง"}
          </h3>
          <p>
            อัปเดต{" "}
            {new Date(w.updated_at).toLocaleString("th-TH", {
              timeZone: "Asia/Bangkok",
            })}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{w.findings}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{w.plan}</p>
          {w.link && (
            <a className="btn" href={w.link} target="_blank" rel="noreferrer">
              เปิดภาพนำเสนอ
            </a>
          )}
        </article>
      ))}
    </dialog>
  );
}
