import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Send,
  Loader2,
  Hand,
  LogOut,
  X,
  KeyRound,
  ClipboardCheck,
  ChevronDown,
  BookOpen,
  MessageSquare,
  Award,
} from "lucide-react";
import {
  api,
  ApiError,
  type Config,
  type FinalReviewResult,
  type Me,
  type Submission,
} from "./api";
import {
  lessons,
  requiredLessons,
  incidents,
  incidentContext,
  analysisQuestions,
  quizQuestions,
  type Lesson,
} from "../shared/course";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "เชื่อมต่อไม่สำเร็จ ลองอีกครั้งนะครับ";
const names: Record<string, string> = {
  submitted: "ส่งแล้ว",
  reviewed: "ตรวจแล้ว",
  revision: "ผู้สอนให้แก้ไข",
};
function Btn({
  children,
  busy = false,
  variant = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: string;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`btn ${variant} ${props.className || ""}`}
    >
      {busy ? <Loader2 size={18} className="spin" /> : null}
      {children}
    </button>
  );
}
function MiniModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="student-dialog" onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="ปิด" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
type Fields = {
  result: string;
  answers: string[];
  tool: string;
  reflection: string;
};
function initialFields(me: Me, id: number): Fields {
  const sub = me.submissions.find((s) => s.lesson === id);
  let answers: string[] = [];
  try {
    answers = JSON.parse(sub?.answers_json || "[]");
  } catch {}
  let fields: Fields = {
    result: sub?.result || "",
    answers: Array.from({ length: 5 }, (_, i) => answers[i] || ""),
    tool: sub?.tool || (id === 6 ? "AI ในระบบ" : "Gemini"),
    reflection: sub?.reflection || "",
  };
  let stamp = sub?.updated_at || 0;
  const server = me.drafts.find((d) => d.lesson === id);
  if (server && server.updated_at > stamp) {
    try {
      fields = { ...fields, ...JSON.parse(server.body) };
      stamp = server.updated_at;
    } catch {}
  }
  try {
    const local = JSON.parse(
      localStorage.getItem(`p4-v2-${me.student.id}-${id}`) || "null",
    );
    if (local?.updatedAt > stamp) fields = { ...fields, ...local.fields };
  } catch {}
  return fields;
}
export default function StudentApp({
  me,
  config,
  refresh,
  onLogout,
}: {
  me: Me;
  config: Config;
  refresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const allRequiredDone = requiredLessons.every((l) =>
    me.submissions.some((s) => s.lesson === l.id),
  );
  const [active, setActive] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(`p4-page-${me.student.id}`));
      if (stored >= 1 && stored <= lessons.length) return stored;
    } catch {}
    const server = Number(me.student.current_lesson);
    if (server >= 1 && server <= lessons.length) return server;
    return (
      requiredLessons.find(
        (l) => !me.submissions.some((s) => s.lesson === l.id),
      )?.id || 1
    );
  }),
    [view, setView] = useState<"exercise" | "quiz" | "final">(
      allRequiredDone ? "final" : "exercise",
    ),
    [modal, setModal] = useState<"help" | "pin" | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const completed = requiredLessons.filter((l) =>
    me.submissions.some((s) => s.lesson === l.id),
  ).length;
  const finalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFinalSwitch = useCallback(() => {
    if (finalTimer.current) {
      clearTimeout(finalTimer.current);
      finalTimer.current = null;
    }
  }, []);
  const scheduleFinalSwitch = useCallback(() => {
    cancelFinalSwitch();
    setNotice("ตอบครบทุกข้อหลักแล้ว — เดี๋ยวพาไปหน้าส่งคำตอบทั้งหมด");
    finalTimer.current = setTimeout(() => {
      finalTimer.current = null;
      setView("final");
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 1600);
  }, [cancelFinalSwitch]);
  useEffect(() => cancelFinalSwitch, [cancelFinalSwitch]);
  useEffect(() => {
    if (config.lock_following && active > config.active_lesson)
      setActive(Math.max(1, config.active_lesson));
  }, [config.lock_following, config.active_lesson, active]);
  useEffect(() => {
    const beat = () => {
      if (!document.hidden) {
        void api("/heartbeat", { lesson: active }).catch(() => {});
        void refresh().catch(() => {});
      }
    };
    void api("/heartbeat", { lesson: active }).catch(() => {});
    const interval = setInterval(beat, 30000);
    return () => clearInterval(interval);
  }, [active, refresh]);
  const navigate = (n: number) => {
    cancelFinalSwitch();
    if (config.lock_following && n > config.active_lesson) {
      setNotice("รอผู้สอนเปิดข้อนี้ก่อนนะครับ");
      return;
    }
    setActive(n);
    setView("exercise");
    try {
      localStorage.setItem(`p4-page-${me.student.id}`, String(n));
    } catch {}
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return (
    <div className="police-student">
      <header className="police-header">
        <a className="student-brand" href="/">
          <span>
            <ShieldCheck size={26} />
          </span>
          <div>
            AI POLICE LAB<small>By: Dr.Ake</small>
          </div>
        </a>
        <div className="student-identity">
          <span>เลขที่ {me.student.number}</span>
          <button
            className="icon-btn"
            aria-label="ขอความช่วยเหลือ"
            onClick={() => setModal("help")}
          >
            <Hand size={22} />
          </button>
          <button
            className="icon-btn"
            aria-label="ตั้งรหัสนักเรียนใหม่"
            onClick={() => setModal("pin")}
          >
            <KeyRound size={20} />
          </button>
        </div>
      </header>
      <main className="exercise-main">
        <section className="exercise-progress">
          <div className="progress-title">
            <span>{me.student.name}</span>
            <strong>
              ส่งแล้ว {completed} / {requiredLessons.length} ข้อหลัก
            </strong>
          </div>
          <div className="exercise-progress-track">
            <i
              style={{
                width: `${(completed / requiredLessons.length) * 100}%`,
              }}
            />
          </div>
          <div className="exercise-steps" aria-label="เลือกข้อแบบฝึกหัด">
            {lessons.map((l) => {
              const sent = me.submissions.some((s) => s.lesson === l.id);
              return (
                <button
                  key={l.id}
                  aria-current={
                    view === "exercise" && active === l.id ? "step" : undefined
                  }
                  aria-label={`ข้อ ${l.id} ${l.title}${l.optional ? " (ไม่บังคับ)" : ""}${sent ? " ส่งแล้ว" : ""}`}
                  className={`${active === l.id && view === "exercise" ? "current" : ""} ${sent ? "done" : ""}`}
                  onClick={() => navigate(l.id)}
                  disabled={
                    !!config.lock_following && l.id > config.active_lesson
                  }
                >
                  <span>{sent ? <Check size={17} /> : l.id}</span>
                  <small>{l.optional ? "ไม่บังคับ" : `ข้อ ${l.id}`}</small>
                </button>
              );
            })}
          </div>
          {allRequiredDone && view !== "final" && (
            <button
              className="final-cta"
              onClick={() => {
                cancelFinalSwitch();
                setView("final");
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            >
              <Award size={18} />
              ตอบครบทุกข้อหลักแล้ว — ส่งคำตอบทั้งหมดและดูคะแนนรวม
            </button>
          )}
        </section>
        {view === "quiz" ? (
          <StudentQuiz
            me={me}
            refresh={refresh}
            onBack={() => setView("exercise")}
          />
        ) : view === "final" ? (
          <FinalReview
            me={me}
            refresh={refresh}
            onBack={() => {
              setView("exercise");
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          />
        ) : (
          <Exercise
            key={active}
            lesson={lessons[active - 1]}
            me={me}
            config={config}
            refresh={refresh}
            onNavigate={navigate}
            onCompletedAll={scheduleFinalSwitch}
          />
        )}
        <footer className="student-simple-footer">
          <span>AI Police Lab · By: Dr.Ake</span>
          <div>
            <button
              onClick={() => {
                cancelFinalSwitch();
                setView("quiz");
                window.scrollTo(0, 0);
              }}
            >
              <ClipboardCheck size={16} /> แบบทดสอบก่อน–หลัง
            </button>
            <button onClick={onLogout}>
              <LogOut size={16} /> ออกจากระบบ
            </button>
          </div>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice("")}>
          {notice}
          <X size={16} />
        </div>
      )}
      {modal && (
        <MiniModal
          title={
            modal === "help" ? "แจ้งปัญหาให้ผู้สอน" : "ตั้งรหัสนักเรียนใหม่"
          }
          onClose={() => setModal(null)}
        >
          {modal === "help" ? (
            <div className="stack">
              {[
                "เข้า Gemini / ChatGPT ไม่ได้",
                "ไม่เข้าใจโจทย์",
                "ส่งคำตอบไม่ได้",
                "ใช้งานได้แล้ว",
              ].map((reason) => (
                <Btn
                  key={reason}
                  variant="secondary"
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("/help", {
                        reason: reason === "ใช้งานได้แล้ว" ? "" : reason,
                      });
                      setNotice("แจ้งผู้สอนแล้วครับ");
                      setModal(null);
                    } catch (e) {
                      setNotice(message(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {reason}
                  <ArrowRight size={17} />
                </Btn>
              ))}
            </div>
          ) : (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  await api("/pin", { pin: form.get("pin") });
                  setNotice("เปลี่ยนรหัสนักเรียนแล้ว");
                  setModal(null);
                } catch (e) {
                  setNotice(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>ใช้เลขที่นักเรียนและรหัสนี้เมื่อกลับเข้าเรียน</p>
              <label>
                รหัสนักเรียน 4 หลัก
                <input
                  name="pin"
                  required
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  autoComplete="new-password"
                />
              </label>
              <Btn type="submit" busy={busy}>
                บันทึกรหัส
              </Btn>
            </form>
          )}
        </MiniModal>
      )}
    </div>
  );
}
function Exercise({
  lesson: l,
  me,
  config,
  refresh,
  onNavigate,
  onCompletedAll,
}: {
  lesson: Lesson;
  me: Me;
  config: Config;
  refresh: () => Promise<void>;
  onNavigate: (n: number) => void;
  onCompletedAll?: () => void;
}) {
  const [fields, setFields] = useState<Fields>(() => initialFields(me, l.id)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [draftState, setDraftState] = useState(""),
    [copyState, setCopyState] = useState("");
  const dirty = useRef(false),
    fieldsRef = useRef(fields),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveSequence = useRef<Promise<unknown>>(Promise.resolve());
  fieldsRef.current = fields;
  const previous = me.submissions.find((s) => s.lesson === l.id),
    key = `p4-v2-${me.student.id}-${l.id}`;
  const fullPrompt = l.starter + (l.source ? "\n\n" + l.source : "");
  const enqueueSave = useCallback(
    (f: Fields) => {
      const p = saveSequence.current
        .catch(() => {})
        .then(() =>
          api("/draft", {
            lesson: l.id,
            prompt: fullPrompt,
            ...f,
            link: l.answerType === "link" ? f.result : "",
          }),
        );
      saveSequence.current = p;
      return p;
    },
    [l.id, fullPrompt, l.answerType],
  );
  function update(patch: Partial<Fields>) {
    dirty.current = true;
    setSuccess("");
    setError("");
    const next = { ...fieldsRef.current, ...patch };
    fieldsRef.current = next;
    setFields(next);
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ fields: next, updatedAt: Date.now() }),
      );
      setDraftState("เก็บคำตอบในเครื่องแล้ว");
    } catch {
      setDraftState("ยังไม่ได้บันทึก กรุณากดส่งเมื่อพร้อม");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void enqueueSave(next)
        .then(() => setDraftState("บันทึกฉบับร่างแล้ว"))
        .catch(() =>
          setDraftState("ยังไม่ถึงเซิร์ฟเวอร์ เก็บไว้ในเครื่องก่อน"),
        );
    }, 700);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void enqueueSave(fieldsRef.current).catch(() => {});
    },
    [enqueueSave],
  );
  async function navigate(n: number) {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) {
      try {
        await enqueueSave(fieldsRef.current);
      } catch {}
    }
    onNavigate(n);
  }
  async function copyPrompt(text = fullPrompt) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("คัดลอกแล้ว");
      setTimeout(() => setCopyState(""), 2000);
    } catch {
      setCopyState("คัดลอกไม่ได้ ลองแตะค้างที่ข้อความเพื่อคัดลอก");
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const wasComplete = requiredLessons.every((r) =>
      me.submissions.some((s) => s.lesson === r.id),
    );
    setBusy(true);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    try {
      await saveSequence.current.catch(() => {});
      await api("/submission", {
        lesson: l.id,
        prompt: fullPrompt,
        ...fields,
        link: l.answerType === "link" ? fields.result : "",
      });
      dirty.current = false;
      localStorage.removeItem(key);
      setDraftState("");
      setSuccess("ส่งคำตอบแล้ว กลับมาแก้ไขและส่งใหม่ได้");
      await refresh();
      if (
        !wasComplete &&
        requiredLessons.every(
          (r) => r.id === l.id || me.submissions.some((s) => s.lesson === r.id),
        )
      )
        onCompletedAll?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const blockedNext = !!config.lock_following && l.id >= config.active_lesson;
  return (
    <article className="exercise-page">
      <div className="exercise-heading">
        <div className="exercise-number">{String(l.id).padStart(2, "0")}</div>
        <div>
          <div className="exercise-kicker">
            แบบฝึกหัดข้อ {l.id} จาก 8 {l.optional && <span>ไม่บังคับ</span>}
          </div>
          <h1>{l.title}</h1>
        </div>
        {previous && (
          <span className={`status ${previous.status}`}>
            <CheckCircle2 size={15} />
            {names[previous.status]}
          </span>
        )}
      </div>
      <p className="exercise-intro">{l.brief}</p>
      {l.id !== 6 && (
        <section className="question-sheet">
          <div className="question-sheet-heading">
            <h2>
              {l.image ? "คำสั่งสำหรับถาม AI" : "คัดลอกข้อความนี้ไปถาม AI"}
            </h2>
            <button className="copy-button" onClick={() => void copyPrompt()}>
              <Copy size={18} />
              {copyState || "คัดลอก"}
            </button>
          </div>
          <p className="question-prompt">{l.starter}</p>
          {l.source && (
            <blockquote className="english-source">{l.source}</blockquote>
          )}
          {l.image && (
            <figure className="training-image">
              <a
                href={l.image}
                target="_blank"
                rel="noreferrer"
                aria-label="เปิดภาพขนาดเต็ม"
              >
                <img
                  src={l.image}
                  alt={
                    l.id === 4
                      ? "เอกสารราชการจำลองสำหรับฝึกถอดข้อความ"
                      : "ภาพจำลองกระเป๋าวางอยู่ใต้ที่นั่งที่ป้ายรถโดยสาร"
                  }
                />
              </a>
              <figcaption>
                {l.id === 4
                  ? "เอกสารจำลองสำหรับการฝึก"
                  : "ภาพสร้างด้วย AI สำหรับการฝึก"}
              </figcaption>
              <div className="image-download-actions">
                <a className="btn" href={l.image} download={l.imageName}>
                  <Download size={18} /> บันทึกรูปไปใช้
                </a>
                <a
                  className="btn secondary"
                  href={l.image}
                  target="_blank"
                  rel="noreferrer"
                >
                  ดูภาพเต็ม
                  <ExternalLink size={16} />
                </a>
              </div>
              <small>
                หากมือถือเปิดรูปแทนการดาวน์โหลด
                ให้แตะรูปค้างแล้วเลือกบันทึกรูปภาพ
              </small>
            </figure>
          )}
          {l.tools.length > 0 && (
            <div className="exercise-tools">
              <span>เปิด AI ที่คุณใช้</span>
              {l.tools.map((t) => (
                <a href={t.url} target="_blank" rel="noreferrer" key={t.name}>
                  {t.name}
                  <ExternalLink size={15} />
                </a>
              ))}
            </div>
          )}
        </section>
      )}
      {l.id === 6 && (
        <section className="question-sheet incident-sheet">
          <div className="question-sheet-heading">
            <div>
              <h2>ข้อมูลเหตุสมมติ 18 เหตุ</h2>
              <p>1 แถว = 1 เหตุ · วันที่ 1–8 ตุลาคม 2569</p>
            </div>
            <button
              className="copy-button"
              onClick={() => void copyPrompt(incidentContext)}
            >
              <Copy size={18} />
              {copyState || "คัดลอกข้อมูล"}
            </button>
          </div>
          <div className="incident-table-scroll">
            <table className="incident-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ประเภทเหตุ</th>
                  <th>วันที่</th>
                  <th>เวลา</th>
                  <th>สถานที่</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <span
                        className={`incident-type type-${r[0] === "ปล้น" ? "robbery" : r[0] === "ลักทรัพย์" ? "theft" : "drug"}`}
                      >
                        {r[0]}
                      </span>
                    </td>
                    <td>
                      {r[1].slice(8)}/{r[1].slice(5, 7)}
                    </td>
                    <td>{r[2]}</td>
                    <td>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="time-band-note">
            ใช้ช่วงเวลาเดียวกันทั้งห้อง: 00:00–05:59 / 06:00–11:59 / 12:00–17:59
            / 18:00–23:59
          </p>
        </section>
      )}
      <form id="answer-form" className="answer-sheet" onSubmit={submit}>
        <div className="answer-heading">
          <h2>{l.id === 6 ? "ตอบจากข้อมูลด้านบน" : "คำตอบของคุณ"}</h2>
          <span>{draftState || (previous && "เคยส่งแล้ว แก้ไขได้")}</span>
        </div>
        {l.id === 6 ? (
          <div className="analysis-answers">
            {analysisQuestions.map((q, i) => (
              <label key={q}>
                <span>
                  <b>6.{i + 1}</b> {q}
                </span>
                <textarea
                  required
                  minLength={2}
                  maxLength={3000}
                  rows={3}
                  placeholder={
                    i < 4
                      ? "ระบุพื้นที่ ช่วงเวลา และจำนวนเหตุประกอบคำตอบ"
                      : "เขียนแผนสายตรวจจากข้อมูล เช่น พื้นที่ ช่วงเวลา และสิ่งที่ควรประสานเพิ่มเติม"
                  }
                  value={fields.answers[i] || ""}
                  onChange={(e) =>
                    update({
                      answers: fields.answers.map((a, j) =>
                        j === i ? e.target.value : a,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="answer-field">
            <span className="sr-only">
              {l.answerType === "link" ? "ลิงก์ผลงาน" : "คำตอบ"}
            </span>
            {l.answerType === "link" ? (
              <input
                aria-label="ลิงก์ผลงาน"
                type="url"
                required
                maxLength={1200}
                value={fields.result}
                placeholder={l.placeholder}
                onChange={(e) => update({ result: e.target.value })}
              />
            ) : (
              <textarea
                aria-label="คำตอบ"
                required
                minLength={2}
                rows={l.id === 4 ? 12 : 8}
                maxLength={15000}
                value={fields.result}
                placeholder={l.placeholder}
                onChange={(e) => update({ result: e.target.value })}
              />
            )}
          </label>
        )}
        {l.id !== 6 && (
          <label className="tool-select">
            ใช้ AI ตัวไหน?
            <select
              value={fields.tool}
              onChange={(e) => update({ tool: e.target.value })}
            >
              <option>Gemini</option>
              <option>ChatGPT</option>
              <option>AI อื่น ๆ</option>
            </select>
          </label>
        )}
        {l.checklist.length > 0 && (
          <div className="exercise-hint">
            <ShieldCheck size={19} />
            <p>{l.checklist[0]}</p>
          </div>
        )}
        {previous?.feedback && (
          <div className="teacher-feedback">
            <b>ผู้สอนฝากไว้</b>
            <p>{previous.feedback}</p>
            {previous.score != null && <span>คะแนน {previous.score}/10</span>}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="form-success" role="status">
            <CheckCircle2 size={18} />
            {success}
          </p>
        )}
        <div className="answer-submit">
          <small>
            {l.optional
              ? "ข้อนี้ข้ามได้ ไม่กระทบการส่งครบข้อหลัก"
              : "ตรวจคำตอบสักรอบ แล้วกดส่งได้เลย"}
          </small>
          <Btn type="submit" busy={busy}>
            <Send size={18} />
            {previous ? "ส่งคำตอบที่แก้ไข" : "ส่งคำตอบ"}
          </Btn>
        </div>
      </form>
      {l.id === 6 && (
        <AnalysisChat paused={!!config.ai_paused} used={me.aiUsed} />
      )}
      <nav className="exercise-navigation" aria-label="เปลี่ยนข้อแบบฝึกหัด">
        <Btn
          variant="secondary"
          disabled={l.id === 1 || busy}
          onClick={() => void navigate(l.id - 1)}
        >
          <ArrowLeft size={18} /> ข้อก่อนหน้า
        </Btn>
        <span>ข้อ {l.id} / 8</span>
        {l.id < 8 ? (
          <Btn
            variant="secondary"
            disabled={busy || blockedNext}
            onClick={() => void navigate(l.id + 1)}
          >
            {l.optional ? "ข้ามไปข้อ 8" : "ข้อถัดไป"}
            <ArrowRight size={18} />
          </Btn>
        ) : (
          <Btn
            variant="secondary"
            onClick={() =>
              void navigate(
                requiredLessons.find(
                  (x) => !me.submissions.some((s) => s.lesson === x.id),
                )?.id || 1,
              )
            }
          >
            กลับไปตรวจคำตอบ
            <BookOpen size={18} />
          </Btn>
        )}
      </nav>
      <p className="exercise-bottom-note">
        คำตอบที่ยังไม่กดส่งจะเก็บเป็นฉบับร่าง กลับมาแก้ได้ทุกข้อ
      </p>
    </article>
  );
}
type ChatMessage = {
  id: string;
  prompt: string;
  result: string;
  created_at: number;
};
function AnalysisChat({ paused, used }: { paused: boolean; used: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(""),
    [localUsed, setLocalUsed] = useState(used);
  const alive = useRef(true),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    void api<{ messages: ChatMessage[] }>("/chat")
      .then((r) => {
        if (alive.current) setMessages(r.messages);
      })
      .catch((e) => setError(message(e)));
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (messages.length)
      bottom.current?.parentElement?.scrollTo({
        top: bottom.current.parentElement.scrollHeight,
        behavior: "smooth",
      });
  }, [messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const prompt = input.trim(),
      id = crypto.randomUUID();
    setBusy(true);
    setError("");
    setStatus("กำลังอ่านข้อมูลและคิดคำตอบ…");
    try {
      for (let i = 0; i < 20; i++) {
        try {
          const r = await api<{ result: string }>("/ai", {
            id,
            lesson: 6,
            prompt,
          });
          if (alive.current) {
            setMessages((m) => [
              ...m,
              { id, prompt, result: r.result, created_at: Date.now() },
            ]);
            setInput("");
            setLocalUsed((n) => n + 1);
          }
          return;
        } catch (e) {
          if (e instanceof ApiError && e.retry && i < 19) {
            if (alive.current) setStatus("มีเพื่อนใช้งานพร้อมกัน กำลังรอคิว…");
            await new Promise((r) => setTimeout(r, 4000));
            if (!alive.current) return;
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) {
        setBusy(false);
        setStatus("");
      }
    }
  }
  return (
    <section className="analysis-chat">
      <div className="chat-title">
        <span>
          <MessageSquare size={24} />
        </span>
        <div>
          <h2>ถาม AI ในหน้านี้</h2>
          <p>AI เห็นข้อมูล 18 เหตุด้านบนแล้ว ถามต่อได้เลย</p>
        </div>
        <small>{localUsed}/18 ครั้ง</small>
      </div>
      <div className="chat-starters">
        {analysisQuestions.map((q, i) => (
          <button
            key={q}
            disabled={busy}
            onClick={() =>
              setInput(`ข้อ 6.${i + 1} ${q} ช่วยแสดงจำนวนเหตุประกอบด้วย`)
            }
          >
            ถามข้อ 6.{i + 1}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() =>
            setInput(
              "ช่วยตอบข้อ 6.1–6.5 แยกเป็นข้อ พร้อมตัวเลขจากตารางประกอบคำตอบ และระบุข้อจำกัดของข้อมูล",
            )
          }
        >
          ถามทุกข้อ
        </button>
      </div>
      <div className="chat-messages" aria-live="polite">
        {!messages.length && (
          <div className="chat-empty">
            เลือกคำถามด้านบน หรือพิมพ์สิ่งที่อยากถาม
            <br />
            เมื่อได้คำตอบแล้ว คัดลอกไปวางในช่อง 6.1–6.5
          </div>
        )}
        {messages.map((m) => (
          <React.Fragment key={m.id}>
            <div className="chat-user">
              <span>คุณ</span>
              <p>{m.prompt}</p>
            </div>
            <div className="chat-assistant">
              <div>
                <span>AI ช่วยวิเคราะห์</span>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(m.result);
                      setCopied(m.id);
                      setTimeout(() => setCopied(""), 2200);
                    } catch {
                      setError(
                        "คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกด้วยตัวเอง",
                      );
                    }
                  }}
                >
                  <Copy size={16} />
                  {copied === m.id ? "คัดลอกแล้ว" : "คัดลอกคำตอบ"}
                </button>
              </div>
              <pre>{m.result}</pre>
            </div>
          </React.Fragment>
        ))}
        {busy && (
          <div className="chat-wait" role="status">
            <Loader2 size={19} className="spin" />
            {status}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <form className="chat-compose" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-question">
          คำถามถึง AI
        </label>
        <textarea
          id="chat-question"
          rows={2}
          required
          minLength={5}
          maxLength={6000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="เช่น ข้อ 6.1 พื้นที่ใดมีเหตุมากที่สุด ช่วยนับให้ดูด้วย"
          disabled={busy}
        />
        <Btn
          type="submit"
          busy={busy}
          disabled={paused || localUsed >= 18 || input.trim().length < 5}
        >
          <Send size={18} />
          {paused ? "ผู้สอนพัก AI" : "ส่งคำถาม"}
        </Btn>
      </form>
      <small className="chat-footnote">
        ใช้ GLM 5.3 Flash ผ่าน OpenRouter · อ่านและตรวจตัวเลขก่อนนำคำตอบไปส่ง
      </small>
    </section>
  );
}
function FinalReview({
  me,
  refresh,
  onBack,
}: {
  me: Me;
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [justDone, setJustDone] = useState(false);
  const saved = me.finalReview;
  let result: FinalReviewResult | null = null;
  try {
    result =
      saved && saved.status === "done" ? JSON.parse(saved.result) : null;
  } catch {}
  const stale = !!(
    result &&
    me.submissions.some((s) => s.updated_at > (saved?.created_at || 0))
  );
  async function run() {
    setBusy(true);
    setError("");
    setJustDone(false);
    const id = crypto.randomUUID();
    setStatus("กำลังรวบรวมคำตอบและตรวจสอบลิงก์…");
    try {
      for (let i = 0; i < 25; i++) {
        try {
          await api<FinalReviewResult>("/final-review", { id });
          setJustDone(true);
          await refresh();
          return;
        } catch (e) {
          if (e instanceof ApiError && e.retry && i < 24) {
            setStatus(
              i === 0
                ? "กำลังให้ AI ตรวจงานทุกข้อ ใช้เวลาสักครู่…"
                : "มีผู้ใช้งาน AI พร้อมกัน กำลังรอคิว…",
            );
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  const checkedAt = result?.checkedAt
    ? new Date(result.checkedAt).toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
  return (
    <article className="exercise-page final-page">
      <div className="exercise-heading">
        <div className="exercise-number final">
          <Award size={26} />
        </div>
        <div>
          <div className="exercise-kicker">
            ตอบครบทั้ง {requiredLessons.length} ข้อหลักแล้ว
          </div>
          <h1>สรุปและส่งคำตอบทั้งหมด</h1>
        </div>
      </div>
      <p className="exercise-intro">
        ตรวจรายการคำตอบด้านล่างให้เรียบร้อย แล้วกดปุ่มให้ AI ช่วยตรวจเบื้องต้น
        พร้อมขึ้นคะแนนทันทีทุกข้อ ลิงก์เพลงและภาพจะถูกตรวจด้วยว่าเปิดได้จริง
      </p>
      <section className="final-list">
        {lessons.map((lesson) => {
          const sub = me.submissions.find((s) => s.lesson === lesson.id),
            graded = result?.lessons.find((g) => g.lesson === lesson.id);
          return (
            <div className={`final-row ${sub ? "sent" : ""}`} key={lesson.id}>
              <span className="final-row-number">
                {sub ? <Check size={16} /> : lesson.id}
              </span>
              <div>
                <b>{lesson.title}</b>
                <small>
                  {sub
                    ? `ส่งแล้ว · ${sub.tool}`
                    : lesson.optional
                      ? "ไม่ได้ส่ง — ข้อนี้ไม่บังคับ"
                      : "ยังไม่ส่ง"}
                </small>
                {sub && (
                  <p>
                    {sub.link
                      ? sub.link
                      : sub.result.slice(0, 180) +
                        (sub.result.length > 180 ? "…" : "")}
                  </p>
                )}
                {graded && (
                  <div className="final-grade">
                    <span
                      className={`score-chip ${graded.score >= 7 ? "good" : graded.score >= 4 ? "ok" : "low"}`}
                    >
                      {graded.score}/10
                    </span>
                    <span>{graded.comment}</span>
                    {graded.linkStatus && (
                      <small>ผลตรวจลิงก์: {graded.linkStatus}</small>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>
      {result && (
        <section className="final-result">
          <div className="final-average">
            <Award size={30} />
            <div>
              <span>คะแนนเฉลี่ย {requiredLessons.length} ข้อหลักจาก AI</span>
              <strong>{result.average}/10</strong>
            </div>
          </div>
          {result.summary && <p>{result.summary}</p>}
          {checkedAt && <small>ตรวจเมื่อ {checkedAt}</small>}
          {stale && (
            <p className="final-stale">
              มีการแก้ไขคำตอบหลังตรวจล่าสุด กดตรวจใหม่เพื่ออัปเดตคะแนน
            </p>
          )}
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {justDone && !error && (
        <p className="form-success" role="status">
          <CheckCircle2 size={18} /> ตรวจเรียบร้อย — ดูคะแนนด้านบนได้เลย
        </p>
      )}
      {busy && status && (
        <p className="chat-wait final-wait" role="status">
          <Loader2 size={19} className="spin" /> {status}
        </p>
      )}
      <div className="answer-submit final-submit">
        <small>
          ผลตรวจของ AI เป็นเบื้องต้นเพื่อช่วยการเรียนรู้ คะแนนที่แท้จริงมาจากผู้สอน
          · ตรวจได้สูงสุด 5 ครั้ง
        </small>
        <Btn type="button" busy={busy} onClick={() => void run()}>
          <Award size={18} />
          {result ? "ให้ AI ตรวจใหม่" : "ส่งคำตอบทั้งหมดและให้ AI ตรวจคะแนน"}
        </Btn>
      </div>
      <button className="text-btn final-back" onClick={onBack}>
        <ArrowLeft size={18} /> กลับไปแก้ไขคำตอบ
      </button>
    </article>
  );
}
function StudentQuiz({
  me,
  refresh,
  onBack,
}: {
  me: Me;
  refresh: () => Promise<void>;
  onBack: () => void;
}) {
  const [kind, setKind] = useState<"pre" | "post">(
      me.quizzes.some((q) => q.kind === "pre") ? "post" : "pre",
    ),
    [answers, setAnswers] = useState([-1, -1, -1, -1, -1]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const done = me.quizzes.find((q) => q.kind === kind);
  return (
    <section className="student-quiz">
      <button className="text-btn" onClick={onBack}>
        <ArrowLeft size={18} /> กลับไปทำแบบฝึกหัด
      </button>
      <h1>แบบทดสอบก่อน–หลังเรียน</h1>
      <div className="segmented">
        {(["pre", "post"] as const).map((k) => (
          <button
            key={k}
            className={kind === k ? "selected" : ""}
            onClick={() => {
              setKind(k);
              setAnswers([-1, -1, -1, -1, -1]);
            }}
          >
            {k === "pre" ? "ก่อนเรียน" : "หลังเรียน"}
          </button>
        ))}
      </div>
      {done ? (
        <div className="question-sheet">
          <h2>ได้ {done.score} / 5 คะแนน</h2>
          <p>บันทึกผลแล้วครับ กลับไปทำแบบฝึกหัดต่อได้เลย</p>
          <Btn onClick={onBack}>กลับไปทำแบบฝึกหัด</Btn>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/quiz", { kind, answers });
              await refresh();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {quizQuestions.map((q, i) => (
            <fieldset className="question-sheet" key={q.q}>
              <legend>
                {i + 1}. {q.q}
              </legend>
              {q.options.map((a, j) => (
                <label className="quiz-option" key={a}>
                  <input
                    name={`q${i}`}
                    type="radio"
                    required
                    checked={answers[i] === j}
                    onChange={() =>
                      setAnswers((v) => v.map((n, k) => (i === k ? j : n)))
                    }
                  />
                  {a}
                </label>
              ))}
            </fieldset>
          ))}
          {error && <p className="form-error">{error}</p>}
          <Btn type="submit" busy={busy} disabled={answers.some((n) => n < 0)}>
            ส่งแบบทดสอบ
          </Btn>
        </form>
      )}
    </section>
  );
}
