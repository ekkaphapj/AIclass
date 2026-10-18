import React, { useEffect, useState, useRef } from "react";
import { api } from "./api";
import {
  extensionTitles,
  type ExtensionWork,
  type ExtensionCase,
} from "../shared/extensions";

type Data = {
  unlocked: boolean;
  content: string[];
  cases: ExtensionCase[];
  work: ExtensionWork[];
};
export function Extensions({ studentId }: { studentId: string }) {
  const panel = useRef<HTMLElement>(null);
  const [data, setData] = useState<Data>();
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (active > 0) {
      const frame = requestAnimationFrame(() =>
        panel.current?.scrollIntoView({ block: "start" }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [active, step]);
  const [prompt, setPrompt] = useState("");
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
        prompt: row?.prompt || "",
        findings: row?.findings || "",
        plan: row?.plan || "",
        link: row?.link || "",
      };
      try {
        const draft = JSON.parse(localStorage.getItem(key(n)) || "null");
        if (draft && draft.updated_at > (row?.updated_at || 0)) values = draft;
      } catch {}
      setPrompt(values.prompt || "");
      setFindings(values.findings);
      setPlan(values.plan);
      setLink(values.link);
      setActive(n);
      setStep(1);
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const update = (field: string, value: string) => {
    const values = {
      prompt,
      findings,
      plan,
      link,
      [field]: value,
      updated_at: Date.now(),
    };
    if (field === "prompt") setPrompt(value);
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
        prompt,
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
  const copy = async (withPrompt = false) => {
    try {
      if (withPrompt && prompt.trim().length < 20) {
        setNotice("เขียน prompt หรือเลือกใช้ตัวอย่างก่อนคัดลอก");
        return;
      }
      await navigator.clipboard.writeText(
        data!.content[active - 1] +
          (withPrompt ? "\n\nคำสั่งของฉัน:\n" + prompt : ""),
      );
      setNotice(
        withPrompt
          ? "คัดลอกข้อมูลพร้อม prompt แล้ว — วางใน Gemini ได้เลย"
          : "คัดลอกชุดข้อมูลแล้ว",
      );
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
      [0, 1, 2, 3].forEach((i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, r, a, a + Math.PI / 2);
        c.closePath();
        c.fillStyle = colors[i];
        c.fill();
        c.fillStyle = "#fff";
        c.fillText(
          `${i * 6}–${(i + 1) * 6} น.`,
          cx + 100 * Math.cos(a + Math.PI / 4) - 48,
          cy + 100 * Math.sin(a + Math.PI / 4),
        );
      });
      y = 560;
      c.fillStyle = "#463923";
      lines("นาฬิกา 24 ชั่วโมง / ใช้ข้อค้นพบด้านล่างระบุจำนวนเหตุ");
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
  const current = data?.cases?.[active - 1];
  const move = (n: number) => {
    setStep(n);
    setNotice("");
  };
  return (
    <section
      ref={panel}
      className="surface extension-panel extension-workspace"
    >
      <h2>ภารกิจต่อยอด</h2>
      <p className="muted">
        ทำครบ 7 ข้อหลักก่อน • ข้อละ 10–15 นาที • นำเสนอ 60 วินาที
      </p>
      {notice && (
        <p className="extension-notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <p>กำลังโหลด…</p>
      ) : !data.unlocked ? (
        <p>🔒 ส่งครบ 7 ข้อหลักก่อนเริ่ม (ข้อเพลงไม่บังคับ)</p>
      ) : (
        <>
          {!active ? (
            <div className="extension-choices">
              {extensionTitles.map((title, i) => {
                const work = data.work.find((w) => w.mission === i + 1);
                return (
                  <button
                    className="extension-choice"
                    key={title}
                    disabled={busy}
                    onClick={() => void open(i + 1)}
                  >
                    <span className="extension-kicker">
                      ข้อ {i + 1} · 10–15 นาที
                    </span>
                    <strong>{title}</strong>
                    <span>
                      {i === 0
                        ? "ดูเบอร์โทรและเลขเครื่อง → ผังเชื่อมโยง → ภาพเหตุการณ์"
                        : "นับเหตุจาก 4 โซน → เลือกช่วงออกตรวจ → ภาพเตือนภัย"}
                    </span>
                    <b>
                      {work?.status === "submitted"
                        ? "ส่งแล้ว · เปิดดู / แก้ไข"
                        : work
                          ? "เริ่มแล้ว · ทำต่อ"
                          : "เริ่มทำ →"}
                    </b>
                  </button>
                );
              })}
            </div>
          ) : (
            current && (
              <>
                <button
                  className="extension-back"
                  disabled={busy}
                  onClick={() => {
                    setActive(0);
                    setNotice("");
                  }}
                >
                  ← เลือกข้ออื่น
                </button>
                <h3>
                  ข้อ {active} · {current.title}
                </h3>
                <nav
                  className="extension-tabs"
                  aria-label="ขั้นตอนภารกิจต่อยอด"
                >
                  {["อ่านคดี", "ใช้ AI", "ส่งงาน"].map((title, i) => (
                    <button
                      key={title}
                      disabled={busy}
                      aria-current={step === i + 1 ? "step" : undefined}
                      onClick={() => move(i + 1)}
                    >
                      {i + 1}. {title}
                    </button>
                  ))}
                </nav>
                {step === 1 && (
                  <div className="extension-stage">
                    <div className="extension-brief">
                      <span className="extension-kicker">
                        อ่านประมาณ 2 นาที
                      </span>
                      <h4>เกิดอะไรขึ้น?</h4>
                      <p>{current.intro}</p>
                      <p>
                        <strong>วันนี้ต้องทำ:</strong> {current.goal}
                      </p>
                    </div>
                    <details className="extension-help">
                      <summary>ศัพท์สั้น ๆ ที่ควรรู้</summary>
                      {current.glossary.map((g) => (
                        <p key={g}>{g}</p>
                      ))}
                    </details>
                    {current.sections.map((section, i) => (
                      <details
                        className="extension-evidence"
                        key={`${active}-${i}`}
                        open={i === 0}
                      >
                        <summary>
                          {section.title}{" "}
                          <small>{section.cards.length} รายการ</small>
                        </summary>
                        <div className="extension-evidence-list">
                          {section.cards.map((card) => (
                            <article
                              className="extension-record"
                              key={card.heading}
                            >
                              <h4>{card.heading}</h4>
                              <p>{card.text}</p>
                            </article>
                          ))}
                        </div>
                      </details>
                    ))}
                    <details className="extension-help">
                      <summary>ข้อควรรู้ก่อนวิเคราะห์</summary>
                      <p>{current.note}</p>
                    </details>
                    <div className="extension-actions">
                      <button
                        className="btn secondary"
                        onClick={() => void copy()}
                      >
                        คัดลอกเฉพาะชุดข้อมูล
                      </button>
                      <button className="btn secondary" onClick={downloadText}>
                        ดาวน์โหลดข้อมูล .txt
                      </button>
                    </div>
                    <div className="extension-stepbar">
                      <button className="btn" onClick={() => move(2)}>
                        ต่อไป: ใช้ AI →
                      </button>
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div className="extension-stage">
                    <h4>ให้ AI ช่วย 4 อย่าง</h4>
                    <ol className="extension-task-list">
                      {current.tasks.map((task) => (
                        <li key={task}>{task}</li>
                      ))}
                    </ol>
                    <p>
                      เขียนคำสั่งเอง หรือกดใช้ตัวอย่างแล้วปรับคำถามให้เป็นของคุณ
                    </p>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !prompt.trim() ||
                          window.confirm("แทนที่ prompt ปัจจุบันด้วยตัวอย่าง?")
                        )
                          update("prompt", current.starter);
                      }}
                    >
                      ใช้ตัวอย่าง prompt
                    </button>
                    <label>
                      Prompt ที่คุณเขียนและใช้จริง
                      <textarea
                        rows={7}
                        maxLength={6000}
                        value={prompt}
                        disabled={busy}
                        placeholder="อยากให้ AI ช่วยอะไร? อยากได้คำตอบแบบไหน?"
                        onChange={(e) => update("prompt", e.target.value)}
                      />
                    </label>
                    <div className="extension-actions">
                      <button className="btn" onClick={() => void copy(true)}>
                        คัดลอกข้อมูล + prompt
                      </button>
                      <a
                        className="btn secondary"
                        href="https://gemini.google.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        เปิด Gemini ↗
                      </a>
                    </div>
                    <div className="extension-brief">
                      <h4>ทำบนมือถืออย่างไร?</h4>
                      <p>1. กดคัดลอก → เปิด Gemini → วางแล้วส่ง</p>
                      <p>2. อ่านคำตอบ เทียบกับข้อมูล หากคลาดเคลื่อนให้ถามแก้</p>
                      <p>
                        3. ให้ Gemini ทำภาพ 1 ภาพ
                        แล้วคัดลอกคำตอบและลิงก์ผลงานกลับมาส่ง
                      </p>
                    </div>
                    <div className="extension-stepbar">
                      <button className="btn secondary" onClick={() => move(1)}>
                        ← อ่านคดี
                      </button>
                      <button className="btn" onClick={() => move(3)}>
                        ต่อไป: ส่งงาน →
                      </button>
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="extension-stage">
                    <h4>ส่งเพียง 3 ช่อง</h4>
                    <p>
                      Prompt จากขั้นที่ 2 จะถูกส่งไปด้วย เตรียมเล่าหน้าชั้น 60
                      วินาที
                    </p>
                    <label>
                      {current.findingsLabel}
                      <textarea
                        rows={6}
                        maxLength={8000}
                        disabled={busy}
                        value={findings}
                        placeholder={current.findingsHint}
                        onChange={(e) => update("findings", e.target.value)}
                      />
                    </label>
                    <label>
                      {current.planLabel}
                      <textarea
                        rows={5}
                        maxLength={8000}
                        disabled={busy}
                        value={plan}
                        placeholder={current.planHint}
                        onChange={(e) => update("plan", e.target.value)}
                      />
                    </label>
                    <label>
                      ลิงก์ภาพหรือผลงาน Gemini (HTTPS)
                      <input
                        type="url"
                        inputMode="url"
                        disabled={busy}
                        value={link}
                        maxLength={1200}
                        placeholder="https://gemini.google.com/share/…"
                        onChange={(e) => update("link", e.target.value)}
                      />
                    </label>
                    <details className="extension-help">
                      <summary>สร้างภาพไม่ทัน?</summary>
                      <p>
                        ดาวน์โหลดแม่แบบจากคำตอบสั้น ๆ แล้วแชร์ผ่านบริการที่ใช้
                        นำลิงก์ HTTPS มาวาง ภาพใช้ข้อความส่วนต้น
                        ตรวจภาพก่อนนำเสนอ
                      </p>
                      <button className="btn secondary" onClick={picture}>
                        ดาวน์โหลดภาพแม่แบบจากคำตอบ
                      </button>
                    </details>
                    <p className="muted">
                      ร่างเก็บในเครื่องระหว่างพิมพ์
                      กดบันทึกร่างเพื่อทำต่อข้ามเครื่อง
                      การบันทึกร่างหลังส่งจะเปลี่ยนสถานะกลับเป็นเริ่มแล้ว
                    </p>
                    <div className="extension-stepbar">
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => move(2)}
                      >
                        ← ใช้ AI
                      </button>
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
            )
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
          <h4>Prompt ของผู้เรียน</h4>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {w.prompt || "งานเดิมก่อนเพิ่มช่อง prompt"}
          </p>
          <h4>ข้อค้นพบ</h4>
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
