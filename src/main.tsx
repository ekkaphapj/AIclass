import StudentApp from "./Student";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Users,
  BookOpen,
  Sparkles,
  FileText,
  Languages,
  ChartNoAxesCombined,
  Image as ImageIcon,
  Music2,
  Monitor,
  LayoutDashboard,
  LogOut,
  Search,
  Download,
  Maximize2,
  X,
  Copy,
  ExternalLink,
  Send,
  Loader2,
  AlertCircle,
  Hand,
  Menu,
  Settings2,
  Pause,
  Play,
  KeyRound,
  Eye,
  EyeOff,
  RotateCcw,
  Trophy,
  ClipboardCheck,
  WifiOff,
  Volume2,
  GraduationCap,
} from "lucide-react";
import QRCode from "qrcode";
import "@fontsource-variable/noto-sans-thai";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./student.css";
import {
  api,
  ApiError,
  type Config,
  type Me,
  type Person,
  type Submission,
  type Overview,
  type Settings,
} from "./api";
import {
  lessons,
  quizQuestions,
  type Lesson,
  requiredLessons,
  analysisReference,
} from "../shared/course";

const icons: Record<string, typeof FileText> = {
  file: FileText,
  language: Languages,
  chart: ChartNoAxesCombined,
  image: ImageIcon,
  music: Music2,
  shield: ShieldCheck,
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
const thaiTime = (n: number) =>
  new Date(n).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
const statusLabels: Record<string, string> = {
  submitted: "ส่งแล้ว",
  reviewed: "ตรวจแล้ว",
  revision: "ให้แก้ไข",
};
function Brand({
  light = false,
  small = false,
}: {
  light?: boolean;
  small?: boolean;
}) {
  return (
    <a
      href="/"
      className={`brand ${light ? "brand-light" : ""} ${small ? "brand-small" : ""}`}
    >
      <span className="brand-icon">
        <ShieldCheck size={25} />
      </span>
      <span>
        AI POLICE <b>LAB</b>
        <small>By: Dr.Ake</small>
      </span>
    </a>
  );
}
function Icon({ lesson, size = 22 }: { lesson: Lesson; size?: number }) {
  const I = icons[lesson.icon];
  return (
    <span className={`lesson-icon ${lesson.color}`}>
      <I size={size} />
    </span>
  );
}
function Notice({
  children,
  type = "info",
}: {
  children: React.ReactNode;
  type?: string;
}) {
  return (
    <div
      role={type === "error" ? "alert" : undefined}
      className={`notice ${type}`}
    >
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
function Button({
  children,
  variant = "",
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`btn ${variant} ${props.className || ""}`}
    >
      {busy && <Loader2 size={17} className="spin" />}
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    root
      ?.querySelector<HTMLElement>(
        'button,input,select,textarea,[tabindex="0"]',
      )
      ?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && root) {
        const nodes = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
          ),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

function Login({
  config,
  instructor,
  onLogin,
}: {
  config: Config | null;
  instructor: boolean;
  onLogin: () => Promise<void>;
}) {
  const [role, setRole] = useState<"choose" | "student" | "teacher">(
      instructor ? "teacher" : "choose",
    ),
    [mode, setMode] = useState<"register" | "return">("register"),
    [group, setGroup] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [assigned, setAssigned] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      if (role === "teacher") {
        await api("/admin/login", { password: form.get("password") });
        await onLogin();
      } else if (mode === "return") {
        await api("/login", { number: form.get("number") });
        await onLogin();
      } else {
        if (!group) {
          setError("กรุณาเลือกกลุ่มเรียนก่อน");
          return;
        }
        const r = await api<{ number: string }>("/register", {
          number: form.get("number"),
          name: form.get("name"),
          squad: group,
        });
        setAssigned(r.number);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <a className="nav-link" href={instructor ? "/" : "/instructor"}>
          {instructor ? <GraduationCap size={17} /> : <Monitor size={17} />}{" "}
          {instructor ? "สำหรับนักเรียน" : "สำหรับผู้สอน"}
          <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="landing-grid">
        <section className="landing-story">
          <div className="eyebrow">
            <span className="status-dot" /> ห้องปฏิบัติการ AI สำหรับงานตำรวจ
          </div>
          <h1>
            เรียนรู้ AI
            <br />
            ลงมือใช้<span>ได้จริง.</span>
          </h1>
          <p className="hero-description">
            เปลี่ยนมือถือของคุณเป็นห้องฝึกทักษะใหม่
            <br />
            ฝึกทีละข้อ คัดลอกไปถาม AI แล้วนำคำตอบกลับมาส่ง
          </p>
          <div className="hero-facts">
            <span>
              <Clock size={17} /> 2 ชั่วโมง
            </span>
            <span>
              <BookOpen size={17} /> 8 แบบฝึกหัด
            </span>
            <span>
              <Sparkles size={17} /> 5 กลุ่มเรียน
            </span>
          </div>
          <div className="mission-preview">
            <div className="preview-top">
              <span>YOUR LEARNING JOURNEY</span>
              <span>01 — 08</span>
            </div>
            <div className="preview-icons">
              {lessons.map((l) => (
                <div key={l.id}>
                  <Icon lesson={l} />
                  <span>
                    {
                      [
                        "ถาม AI",
                        "กฎหมาย",
                        "แปลภาษา",
                        "อ่านข้อความ",
                        "อธิบายภาพ",
                        "วิเคราะห์",
                        "เพลง",
                        "Infographic",
                      ][l.id - 1]
                    }
                  </span>
                </div>
              ))}
            </div>
            <div className="preview-bottom">
              <ShieldCheck size={16} /> ฝึกด้วยข้อมูลสมมติ · ตรวจสอบก่อนใช้จริง
            </div>
          </div>
          <div className="landing-foot">
            POLICE TRAINING <span>×</span> ARTIFICIAL INTELLIGENCE{" "}
            <span className="edition">P4 / 2026</span>
          </div>
        </section>
        <section className="enrollment">
          {role === "choose" ? (
            <>
              <div className="enroll-top">
                <span className="mini-label">เลือกบทบาทของคุณ</span>
                <span className="pill">P4 CLASSROOM</span>
              </div>
              <h2>เข้าใช้งานในบทบาทใด</h2>
              <p className="muted">นักเรียนลงชื่อเพื่อทำแบบฝึกหัด · ผู้สอนดูแลห้องเรียน</p>
              <div className="role-cards">
                <button className="role-card" onClick={() => setRole("student")}>
                  <span className="role-icon student">
                    <GraduationCap size={30} />
                  </span>
                  <b>นักเรียน</b>
                  <small>
                    ลงทะเบียนด้วยเลขประจำตัวนักเรียนของคุณ หรือเข้าสู่ระบบด้วยเลขเดิม
                  </small>
                  <ArrowRight size={18} />
                </button>
                <button className="role-card" onClick={() => setRole("teacher")}>
                  <span className="role-icon teacher">
                    <Monitor size={27} />
                  </span>
                  <b>ผู้สอน</b>
                  <small>เข้าสู่ห้องควบคุมด้วยรหัสผ่านผู้สอน</small>
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="enroll-note">
                <ShieldCheck size={16} /> ไม่ต้องติดตั้งแอป · ใช้งานผ่านเบราว์เซอร์บนมือถือ
              </div>
            </>
          ) : (
            <>
              <div className="enroll-top">
                <span className="mini-label">
                  {role === "teacher" ? "INSTRUCTOR ACCESS" : "STUDENT ACCESS"}
                </span>
                <span className="pill">P4 CLASSROOM</span>
              </div>
              <div className="enroll-symbol">
                {role === "teacher" ? (
                  <Monitor size={29} />
                ) : (
                  <GraduationCap size={31} />
                )}
              </div>
              <h2>
                {role === "teacher"
                  ? "ห้องควบคุมสำหรับผู้สอน"
                  : mode === "return"
                    ? "เข้าสู่ระบบด้วยเลขประจำตัวนักเรียน"
                    : "ลงทะเบียนนักเรียน"}
              </h2>
              <p className="muted">
                {role === "teacher"
                  ? "ติดตามชั้นเรียน ดูผลงาน และนำเสนอบนจอ"
                  : "ไม่ต้องมีรหัสห้องเรียน กรอกเลขประจำตัว เลือกกลุ่ม และกรอกชื่อก็เริ่มได้เลย"}
              </p>
              {role === "student" && (
                <div className="segmented">
                  <button
                    className={mode === "register" ? "selected" : ""}
                    onClick={() => {
                      setMode("register");
                      setError("");
                    }}
                  >
                    ลงชื่อครั้งแรก
                  </button>
                  <button
                    className={mode === "return" ? "selected" : ""}
                    onClick={() => {
                      setMode("return");
                      setError("");
                    }}
                  >
                    เข้าสู่ระบบ
                  </button>
                </div>
              )}
              <form onSubmit={submit} className="stack">
                {role === "teacher" ? (
                  <label>
                    รหัสผ่านผู้สอน
                    <input
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="กรอกรหัสผ่านสำหรับผู้สอน"
                    />
                  </label>
                ) : mode === "register" ? (
                  <>
                    <label>
                      เลขประจำตัวนักเรียน
                      <input
                        name="number"
                        required
                        inputMode="numeric"
                        pattern="[0-9]{1,6}"
                        maxLength={6}
                        autoComplete="off"
                        placeholder="เช่น 240125"
                      />
                      <small>ห้ามซ้ำกับเพื่อน — ระบบตรวจให้ทันที</small>
                    </label>
                    <label>
                      เลือกกลุ่มเรียน
                      <div className="group-picker" role="group" aria-label="กลุ่มเรียน 1-5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            type="button"
                            key={n}
                            className={group === String(n) ? "selected" : ""}
                            onClick={() => setGroup(String(n))}
                          >
                            กลุ่ม {n}
                          </button>
                        ))}
                      </div>
                    </label>
                    <label>
                      ชื่อ–สกุล
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        placeholder="ชื่อที่ใช้ในห้องเรียน"
                      />
                    </label>
                    <label className="check-label">
                      <input type="checkbox" required />
                      ฉันจะใช้ข้อมูลสมมติในการฝึก
                      และเข้าใจว่าระบบเก็บชื่อกับผลงานเพื่อใช้ในชั้นเรียน
                      ผู้สอนสามารถนำผลงานมาอภิปรายร่วมกันได้
                    </label>
                  </>
                ) : (
                  <label>
                    เลขประจำตัวนักเรียน
                    <input
                      name="number"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{1,6}"
                      maxLength={6}
                      autoComplete="off"
                      placeholder="เลขที่ใช้ลงทะเบียนไว้"
                    />
                    <small>ใช้เลขประจำตัวนักเรียนนี้เข้าสู่ระบบทุกครั้ง</small>
                  </label>
                )}
                {error && <Notice type="error">{error}</Notice>}
                {!config && (
                  <Notice type="error">
                    ยังเชื่อมต่อห้องเรียนไม่ได้ กรุณารีเฟรชหน้า
                  </Notice>
                )}
                <Button
                  busy={busy}
                  disabled={
                    !config ||
                    (role === "student" &&
                      mode === "register" &&
                      !config.admission_open)
                  }
                  type="submit"
                >
                  {role === "teacher"
                    ? "เข้าสู่ห้องควบคุม"
                    : mode === "return"
                      ? "เข้าสู่ระบบ"
                      : config?.admission_open
                        ? "ลงทะเบียนเข้าห้องเรียน"
                        : "ปิดรับลงชื่อแล้ว"}
                  <ArrowRight size={18} />
                </Button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    setRole("choose");
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} /> กลับไปเลือกบทบาท
                </button>
              </form>
              <div className="enroll-note">
                <ShieldCheck size={16} />{" "}
                {role === "teacher"
                  ? "ข้อมูลผลงานเปิดดูได้เฉพาะผู้สอน"
                  : "เข้าเรียนได้ทันที ไม่ต้องรอผู้สอนเปิดห้อง"}
              </div>
            </>
          )}
        </section>
      </main>
      {assigned && (
        <div
          className="assigned-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="ได้รับเลขนักเรียนแล้ว"
        >
          <div className="assigned-card">
            <CheckCircle2 size={32} />
            <h2>ลงทะเบียนสำเร็จ</h2>
            <p>ยืนยันเลขประจำตัวนักเรียนของคุณ</p>
            <strong className="assigned-number">{assigned}</strong>
            <small>
              จดหรือ capture หน้าจอนี้เก็บไว้ ใช้เลขนี้เข้าสู่ระบบทุกครั้ง
            </small>
            <Button type="button" onClick={() => void onLogin()}>
              เข้าห้องเรียน <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InstructorApp({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [group, setGroup] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [showSettings, setShowSettings] = useState(false),
    [showQr, setShowQr] = useState(false),
    [presentation, setPresentation] = useState<{
      sub: Submission;
      person: Person;
    } | null>(null),
    [lastUpdate, setLastUpdate] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const result = await api<Overview>("/admin/overview");
      setData(result);
      setLastUpdate(Date.now());
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => clearInterval(id);
  }, [refresh]);
  const closeDetail = useCallback(() => setSelected(null), []),
    closePresentation = useCallback(() => setPresentation(null), []),
    closeSettings = useCallback(() => setShowSettings(false), []),
    closeQr = useCallback(() => setShowQr(false), []);
  if (!data)
    return (
      <div className="loading-screen">
        <Loader2 className="spin" />
        <p>{error || "กำลังเปิดห้องควบคุม…"}</p>
        {error && <Button onClick={() => void refresh()}>ลองใหม่</Button>}
      </div>
    );
  const groupStudents =
      group === "all"
        ? data.students
        : data.students.filter((s) => s.squad === group),
    subs = data.submissions.filter((s) =>
      groupStudents.some((p) => p.id === s.student_id),
    ),
    quizzes = data.quizzes.filter((q) =>
      groupStudents.some((p) => p.id === q.student_id),
    ),
    registered = groupStudents.length,
    finished = groupStudents.filter((s) =>
      requiredLessons.every((l) =>
        subs.some((x) => x.student_id === s.id && x.lesson === l.id),
      ),
    ).length,
    help = groupStudents.filter((s) => s.help),
    studentSubs = (id: string) => subs.filter((s) => s.student_id === id);
  const aiScores = new Map<string, Map<number, number>>();
  for (const fr of data.finalReviews) {
    try {
      const parsed = JSON.parse(fr.result) as {
        lessons?: { lesson: number; score: number }[];
      };
      const m = new Map<number, number>();
      for (const row of parsed.lessons || []) m.set(row.lesson, row.score);
      aiScores.set(fr.student_id, m);
    } catch {}
  }
  const people = groupStudents.filter(
    (s) =>
      `${s.number} ${s.name} ${s.squad}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "help" && !!s.help) ||
        (filter === "complete" &&
          requiredLessons.every((l) =>
            studentSubs(s.id).some((x) => x.lesson === l.id),
          )) ||
        (filter === "incomplete" &&
          !requiredLessons.every((l) =>
            studentSubs(s.id).some((x) => x.lesson === l.id),
          ))),
  );
  const updateSettings = async (patch: Partial<Settings>) => {
    try {
      await api("/admin/settings", { ...data.settings, ...patch });
      await refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return (
    <div className="instructor-shell">
      <aside className="sidebar">
        <Brand light small />
        <div className="sidebar-label">CLASSROOM WORKSPACE</div>
        <nav>
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={19} /> ภาพรวมห้องเรียน<span>01</span>
          </button>
          <button
            className={tab === "students" ? "active" : ""}
            onClick={() => setTab("students")}
          >
            <Users size={19} /> นักเรียนและผลงาน<span>{registered}</span>
          </button>
          <button
            className={tab === "missions" ? "active" : ""}
            onClick={() => setTab("missions")}
          >
            <BookOpen size={19} /> จัดการภารกิจ<span>08</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-course">
            <div className="sidebar-course-icon">
              <ShieldCheck size={23} />
            </div>
            <b>AI FOR POLICE</b>
            <small>ห้องฝึกทักษะ · รุ่น P4</small>
            <span>120 MIN / 8 EXERCISES</span>
          </div>
          <button onClick={() => setShowSettings(true)}>
            <Settings2 size={18} /> ตั้งค่าห้องเรียน
          </button>
          <button onClick={onLogout}>
            <LogOut size={18} /> ออกจากระบบ
          </button>
        </div>
      </aside>
      <div className="instructor-content">
        <header className="instructor-topbar">
          <div>
            <span className="breadcrumb">
              WORKSPACE <ChevronRight size={13} /> P4 CLASSROOM
            </span>
            <span className="topbar-mobile">AI POLICE LAB · ผู้สอน</span>
          </div>
          <div>
            <span className="live-badge">
              <span className="status-dot" /> LIVE CLASS
            </span>
            <button
              className="icon-btn"
              onClick={() => void refresh()}
              aria-label="รีเฟรชข้อมูล"
            >
              <RotateCcw size={18} />
            </button>
            <span className="instructor-avatar">T</span>
          </div>
        </header>
        <main className="instructor-main">
          <div className="instructor-heading">
            <div>
              <span className="eyebrow">INSTRUCTOR MONITOR</span>
              <h1>
                {tab === "students"
                  ? "นักเรียนและผลงาน"
                  : tab === "missions"
                    ? "จัดการภารกิจ"
                    : "ภาพรวมห้องเรียน"}
              </h1>
              <p className="muted">
                {data.settings.title} <span className="dot-divider">·</span>{" "}
                อัปเดตทุก 10 วินาที <span className="dot-divider">·</span>{" "}
                ล่าสุด {thaiTime(lastUpdate)}
              </p>
            </div>
            <div className="heading-actions">
              <select
                aria-label="เลือกกลุ่มเรียน"
                className="group-select"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="all">ทุกกลุ่ม</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    กลุ่ม {n}
                  </option>
                ))}
              </select>
              <a className="btn secondary" href="/api/admin/export">
                <Download size={17} /> ส่งออก CSV
              </a>
              <Button onClick={() => setShowQr(true)}>
                <Users size={17} /> QR เข้าห้องเรียน
              </Button>
            </div>
          </div>
          <div className="instructor-mobile-nav">
            <button onClick={() => setTab("overview")}>ภาพรวม</button>
            <button onClick={() => setTab("students")}>นักเรียน</button>
            <button onClick={() => setTab("missions")}>ภารกิจ</button>
            <button onClick={() => setShowSettings(true)}>ตั้งค่า</button>
          </div>
          {error && (
            <Notice type="error">
              เชื่อมต่อไม่สำเร็จ ข้อมูลอาจไม่เป็นปัจจุบัน: {error}
            </Notice>
          )}
          <div className="metrics-grid">
            <Metric
              label={group === "all" ? "นักเรียนทั้งห้อง" : `นักเรียนกลุ่ม ${group}`}
              value={registered}
              icon={Users}
              note={
                group === "all"
                  ? `จาก 5 กลุ่มเรียน`
                  : `กลุ่ม ${group} · เลือกดูได้จากตัวกรอง`
              }
              color="green"
            />
            <Metric
              label="ส่งครบ 7 ข้อหลัก"
              value={finished}
              icon={CheckCircle2}
              note={`${registered ? Math.round((finished / registered) * 100) : 0}% ของนักเรียนที่แสดง`}
              color="orange"
            />
            <Metric
              label="ยังไม่ครบ"
              value={registered - finished}
              icon={Clock}
              note="ยังส่งไม่ครบทุกข้อหลัก"
              color="blue"
            />
            <Metric
              label="ต้องการความช่วยเหลือ"
              value={help.length}
              icon={Hand}
              note={help.length ? "มีคำขอที่รอผู้สอนดูแล" : "ทุกคนพร้อมไปต่อ"}
              color="purple"
            />
          </div>
          {tab === "overview" && (
            <div className="monitor-middle">
              <section className="surface mission-monitor">
                <div className="card-heading">
                  <div>
                    <h3>ความคืบหน้าแต่ละภารกิจ</h3>
                    <p className="muted">
                      ส่งแล้ว / นักเรียน {registered} คน · ถูกต้อง = คะแนนตรวจรวมของ
                      AI ตั้งแต่ 5 ขึ้นไป
                    </p>
                  </div>
                  <BookOpen size={20} />
                </div>
                <div className="mission-bars">
                  {lessons.map((l) => {
                    const sent = subs.filter((s) => s.lesson === l.id);
                    let correct = 0,
                      incorrect = 0;
                    for (const s of sent) {
                      const score = aiScores.get(s.student_id)?.get(l.id);
                      if (score == null) continue;
                      if (score >= 5) correct++;
                      else incorrect++;
                    }
                    const unchecked = sent.length - correct - incorrect;
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          setTab("students");
                          setFilter("all");
                        }}
                      >
                        <Icon lesson={l} size={18} />
                        <div>
                          <span>
                            0{l.id} <b>{l.title}</b>
                          </span>
                          <div className="bar-track">
                            <i
                              style={{
                                width: `${registered ? (sent.length / registered) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <small className="mission-verdict">
                            ส่ง {sent.length} · ถูกต้อง {correct} · ไม่ถูกต้อง{" "}
                            {incorrect}
                            {unchecked > 0 ? ` · ยังไม่ตรวจ ${unchecked}` : ""}
                          </small>
                        </div>
                        <strong>
                          {sent.length}
                          <small>/{registered}</small>
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="class-control">
                <div className="card-kicker">CLASSROOM CONTROL</div>
                <span className="control-state">
                  <span className="status-dot" /> ภารกิจปัจจุบัน
                </span>
                <h2>
                  0{data.settings.active_lesson}
                  <span>{lessons[data.settings.active_lesson - 1].title}</span>
                </h2>
                <label>
                  เปลี่ยนภารกิจ
                  <select
                    value={data.settings.active_lesson}
                    onChange={(e) =>
                      void updateSettings({
                        active_lesson: Number(e.target.value),
                      })
                    }
                  >
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        0{l.id} · {l.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="control-buttons">
                  <button
                    onClick={() =>
                      void updateSettings({
                        ai_paused: data.settings.ai_paused ? 0 : 1,
                      })
                    }
                  >
                    {data.settings.ai_paused ? (
                      <Play size={17} />
                    ) : (
                      <Pause size={17} />
                    )}{" "}
                    {data.settings.ai_paused ? "เปิด AI" : "พัก AI"}
                  </button>
                  <button
                    onClick={() =>
                      void updateSettings({
                        admission_open: data.settings.admission_open ? 0 : 1,
                      })
                    }
                  >
                    {data.settings.admission_open ? (
                      <Users size={17} />
                    ) : (
                      <KeyRound size={17} />
                    )}{" "}
                    {data.settings.admission_open
                      ? "ปิดรับลงชื่อ"
                      : "เปิดรับลงชื่อ"}
                  </button>
                </div>
                <div className="ai-budget">
                  <span>
                    <Sparkles size={15} /> AI USAGE
                  </span>
                  <b>
                    ${(data.usage.cost || 0).toFixed(4)}{" "}
                    <small>/ ${data.settings.budget.toFixed(2)}</small>
                  </b>
                  <small>
                    {data.usage.completed || 0} คำตอบ · กำลังทำงาน{" "}
                    {data.usage.running || 0} · GLM 5.3 Flash
                  </small>
                </div>
              </section>
            </div>
          )}
          {help.length > 0 && (
            <section className="help-strip">
              <Hand size={20} />
              <b>คำขอความช่วยเหลือ</b>
              {help.slice(0, 4).map((s) => (
                <button key={s.id} onClick={() => setSelected(s.id)}>
                  #{s.number} {s.help}
                  <ChevronRight size={14} />
                </button>
              ))}
              {help.length > 4 && (
                <button
                  onClick={() => {
                    setFilter("help");
                    setTab("students");
                  }}
                >
                  อีก {help.length - 4} คน
                </button>
              )}
            </section>
          )}
          {tab === "missions" ? (
            <div className="manage-missions">
              {lessons.map((l) => (
                <section className="surface" key={l.id}>
                  <div className="card-heading">
                    <Icon lesson={l} />
                    <span className="lesson-number">0{l.id}</span>
                  </div>
                  <h3>{l.title}</h3>
                  <p>{l.objective}</p>
                  <small className="muted">
                    {l.kind === "internal"
                      ? "AI ในระบบ"
                      : "เครื่องมือภายนอก / AI ในระบบ"}{" "}
                    · {l.minutes} นาที
                  </small>
                  <Button
                    variant="secondary"
                    onClick={() => void updateSettings({ active_lesson: l.id })}
                  >
                    {data.settings.active_lesson === l.id ? (
                      <>
                        <Check size={16} /> ภารกิจปัจจุบัน
                      </>
                    ) : (
                      "ตั้งเป็นภารกิจปัจจุบัน"
                    )}
                  </Button>
                </section>
              ))}
            </div>
          ) : (
            <section className="surface roster-section">
              <div className="roster-heading">
                <div>
                  <h3>
                    นักเรียนและความคืบหน้า{" "}
                    <span className="count-badge">{registered}</span>
                  </h3>
                  <p className="muted">
                    คลิกชื่อเพื่อดูผลงาน ตรวจงาน หรือเปิดนำเสนอบนจอ
                  </p>
                </div>
                <div className="roster-tools">
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="ค้นหานักเรียน"
                      placeholder="ค้นหาชื่อ เลขที่ หรือกลุ่ม"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="กรองนักเรียน"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">นักเรียนทั้งหมด</option>
                    <option value="incomplete">ยังส่งไม่ครบ</option>
                    <option value="complete">ส่งครบแล้ว</option>
                    <option value="help">ขอความช่วยเหลือ</option>
                  </select>
                </div>
              </div>
              <div className="table-scroll">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>นักเรียน</th>
                      <th>กลุ่ม</th>
                      <th>สถานะ</th>
                      {lessons.map((l) => (
                        <th className="mission-th" key={l.id} title={l.title}>
                          0{l.id}
                        </th>
                      ))}
                      <th>ส่งงาน</th>
                      <th>ก่อน / หลัง</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((s) => {
                      const work = studentSubs(s.id),
                        isOnline = s.last_seen > data.serverTime - 90000,
                        pre = quizzes.find(
                          (q) => q.student_id === s.id && q.kind === "pre",
                        ),
                        post = quizzes.find(
                          (q) => q.student_id === s.id && q.kind === "post",
                        );
                      return (
                        <tr key={s.id}>
                          <td>
                            <button
                              className="student-name"
                              onClick={() => setSelected(s.id)}
                            >
                              <span className="roster-avatar">
                                {s.number.padStart(3, "0")}
                              </span>
                              <span>
                                <b>{s.name}</b>
                                <small>เลขที่ {s.number}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            {/^[1-5]$/.test(s.squad)
                              ? `กลุ่ม ${s.squad}`
                              : s.squad}
                          </td>
                          <td>
                            <span
                              className={`presence ${isOnline ? "online" : ""}`}
                            >
                              <i />
                              {isOnline ? "ออนไลน์" : "ไม่ได้ใช้งาน"}
                            </span>
                            <small className="current-mission">
                              {s.help
                                ? "ขอความช่วยเหลือ"
                                : s.current_lesson
                                  ? `อยู่ภารกิจ 0${s.current_lesson}`
                                  : "หน้าหลัก"}
                            </small>
                          </td>
                          {lessons.map((l) => {
                            const sub = work.find((w) => w.lesson === l.id);
                            return (
                              <td key={l.id} className="mission-td">
                                <button
                                  aria-label={`ดูภารกิจ ${l.id} ของ ${s.name}`}
                                  className={`mission-cell ${sub ? sub.status : ""}`}
                                  onClick={() => setSelected(s.id)}
                                >
                                  {sub ? <Check size={14} /> : <span>—</span>}
                                </button>
                              </td>
                            );
                          })}
                          <td>
                            <b>
                              {
                                work.filter(
                                  (w) =>
                                    !lessons.find((l) => l.id === w.lesson)
                                      ?.optional,
                                ).length
                              }
                              <span className="muted"> / 7</span>
                            </b>
                          </td>
                          <td>
                            {pre ? `${pre.score}/5` : "—"}{" "}
                            <span className="muted">/</span>{" "}
                            {post ? `${post.score}/5` : "—"}
                          </td>
                          <td>
                            <button
                              className="icon-btn"
                              aria-label={`ดูผลงาน ${s.name}`}
                              onClick={() => setSelected(s.id)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {people.length === 0 && (
                <div className="empty-state">
                  <Users size={35} />
                  <h3>
                    {registered
                      ? "ไม่พบนักเรียนที่ตรงกับการค้นหา"
                      : "ห้องเรียนกำลังรอสมาชิก"}
                  </h3>
                  <p>
                    {registered
                      ? "ลองเปลี่ยนคำค้นหาหรือตัวกรอง"
                      : "เปิด QR เข้าห้องเรียน แล้วให้นักเรียนสแกนเพื่อลงชื่อ"}
                  </p>
                  {!registered && (
                    <Button variant="secondary" onClick={() => setShowQr(true)}>
                      เปิด QR เข้าห้องเรียน
                      <ArrowUpRight size={16} />
                    </Button>
                  )}
                </div>
              )}
              <div className="table-footer">
                <span>
                  แสดง {people.length} จาก {registered} คน
                </span>
                <span>
                  <i className="legend-dot" /> ส่งแล้ว{" "}
                  <i className="legend-dot reviewed" /> ตรวจแล้ว{" "}
                  <i className="legend-dot revision" /> ให้แก้ไข
                </span>
              </div>
            </section>
          )}
          <footer className="instructor-footer">
            <span>
              AI POLICE LAB <b>·</b> ห้องปฏิบัติการสำหรับการเรียนรู้
            </span>
            <span>ข้อมูลสมมติ / ตรวจสอบก่อนใช้จริง</span>
          </footer>
        </main>
      </div>
      {selected && (
        <StudentDetail
          id={selected}
          onClose={closeDetail}
          onReview={refresh}
          onPresent={(sub, person) => setPresentation({ sub, person })}
        />
      )}{" "}
      {showSettings && (
        <SettingsModal
          data={data.settings}
          onClose={closeSettings}
          onSave={async (s) => {
            if (await updateSettings(s)) setShowSettings(false);
          }}
        />
      )}
      {showQr && <QrModal onClose={closeQr} />}{" "}
      {presentation && (
        <Presentation {...presentation} onClose={closePresentation} />
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  total,
  icon: I,
  note,
  color,
}: {
  label: string;
  value: number;
  total?: number;
  icon: typeof Users;
  note: string;
  color: string;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>
          <I size={20} />
        </span>
      </div>
      <strong>
        {value}
        <small>{total ? ` / ${total}` : ""}</small>
      </strong>
      <p>{note}</p>
    </div>
  );
}

function StudentDetail({
  id,
  onClose,
  onReview,
  onPresent,
}: {
  id: string;
  onClose: () => void;
  onReview: () => Promise<void>;
  onPresent: (s: Submission, p: Person) => void;
}) {
  const [detail, setDetail] = useState<{
      student: Person;
      submissions: Submission[];
      quizzes: { kind: string; score: number }[];
    } | null>(null),
    [error, setError] = useState(""),
    [active, setActive] = useState(1),
    [feedback, setFeedback] = useState(""),
    [score, setScore] = useState(""),
    [status, setStatus] = useState("reviewed"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      setDetail(await api(`/admin/student/${id}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const s = detail?.submissions.find((s) => s.lesson === active);
  useEffect(() => {
    setFeedback(s?.feedback || "");
    setScore(s?.score == null ? "" : String(s.score));
    setStatus(s?.status === "revision" ? "revision" : "reviewed");
  }, [s?.id, s?.feedback, s?.score]);
  return (
    <Modal
      title={
        detail
          ? `เลขที่ ${detail.student.number} · ${detail.student.name}`
          : "กำลังโหลดผลงาน…"
      }
      onClose={onClose}
      wide
    >
      {error && <Notice type="error">{error}</Notice>}
      {detail && (
        <>
          <div className="detail-person">
            <span className="roster-avatar large">
              {detail.student.number.slice(-3).padStart(3, "0")}
            </span>
            <div>
              <b>{detail.student.name}</b>
              <small>
                {/^[1-5]$/.test(detail.student.squad)
                  ? `กลุ่ม ${detail.student.squad}`
                  : detail.student.squad}{" "}
                · เลขที่ {detail.student.number} · ส่งแล้ว{" "}
                {
                  detail.submissions.filter(
                    (s) => !lessons.find((l) => l.id === s.lesson)?.optional,
                  ).length
                }
                /7 ข้อหลัก
              </small>
            </div>
          </div>
          {detail.student.help && (
            <div className="detail-help">
              <Hand size={17} />
              {detail.student.help}
              <button
                className="text-btn"
                onClick={async () => {
                  await api("/admin/clear-help", { id });
                  await load();
                  await onReview();
                }}
              >
                ดูแลเรียบร้อย
                <Check size={15} />
              </button>
            </div>
          )}
          <div className="detail-tabs">
            {lessons.map((l) => (
              <button
                key={l.id}
                className={active === l.id ? "active" : ""}
                onClick={() => {
                  setMessage("");
                  setActive(l.id);
                }}
              >
                0{l.id}
                {detail.submissions.some((s) => s.lesson === l.id) && (
                  <Check size={12} />
                )}
              </button>
            ))}
          </div>
          <div className="detail-work-heading">
            <h3>{lessons[active - 1].title}</h3>
            {s && (
              <Button
                variant="secondary small"
                onClick={() => onPresent(s, detail.student)}
              >
                <Monitor size={16} /> นำเสนอบนจอ
              </Button>
            )}
          </div>
          {s ? (
            <>
              <div className="work-meta">
                <span className={`status ${s.status}`}>
                  {statusLabels[s.status]}
                </span>
                <span>{s.tool}</span>
                <span>ส่งล่าสุด {thaiTime(s.updated_at)}</span>
                {s.media_state === "blocked" && (
                  <span className="blocked-badge">ยังสร้างสื่อไม่สำเร็จ</span>
                )}
              </div>
              <WorkContent sub={s} />
              {active === 6 && (
                <details className="reference-answer">
                  <summary>เฉลยตัวเลขสำหรับผู้สอน</summary>
                  <p>
                    ข้อมูลสมมติ {analysisReference.total} เหตุ
                    <br />
                    พื้นที่: หนองแสง 6 / บ้านใหม่ 5 / ทุ่งทอง 4 / คลองใส 3<br />
                    ช่วง 18:00–23:59 มี 10 เหตุ มากที่สุด
                    <br />
                    ลักทรัพย์ช่วง 18:00–23:59 มี 5 เหตุ (หนองแสง 4 เหตุ)
                    <br />
                    เหตุปล้น: บ้านใหม่ช่วง 18:00–23:59 มี 3 เหตุ
                  </p>
                </details>
              )}
              <form
                className="review-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await api("/admin/review", {
                      id: s.id,
                      status,
                      score: score === "" ? null : Number(score),
                      feedback,
                    });
                    setMessage("บันทึกผลตรวจแล้ว");
                    await load();
                    await onReview();
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3>ข้อเสนอแนะจากผู้สอน</h3>
                <div className="form-row">
                  <label>
                    สถานะ
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="reviewed">ตรวจแล้ว</option>
                      <option value="revision">ให้แก้ไข</option>
                    </select>
                  </label>
                  <label>
                    คะแนน (ถ้าต้องการ) / 10
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      placeholder="ยังไม่ให้คะแนน"
                    />
                  </label>
                </div>
                <label>
                  ความคิดเห็น
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="ชี้จุดที่ทำได้ดี และสิ่งที่ควรปรับปรุง"
                  />
                </label>
                <Button type="submit" busy={busy}>
                  บันทึกผลตรวจ
                  <Check size={17} />
                </Button>
              </form>
            </>
          ) : (
            <div className="empty-state">
              <FileText size={33} />
              <h3>ยังไม่ได้ส่งภารกิจนี้</h3>
              <p>เมื่อผู้เรียนส่งงาน ผลงานจะปรากฏที่นี่</p>
            </div>
          )}
          {message && <Notice type="success">{message}</Notice>}
        </>
      )}
    </Modal>
  );
}
function WorkContent({
  sub: s,
  present = false,
}: {
  sub: Submission;
  present?: boolean;
}) {
  return (
    <div className={`work-content ${present ? "present-content" : ""}`}>
      <section>
        <span className="card-kicker">คำสั่งที่ใช้</span>
        <pre>{s.prompt}</pre>
      </section>
      <section className="work-result">
        <span className="card-kicker">ผลงานของผู้เรียน</span>
        {!!s.has_image && (
          <img
            src={`/api/image/${s.id}`}
            alt="ผลงานภาพสร้างด้วย AI ของผู้เรียน"
          />
        )}
        <pre>{s.result}</pre>
        {s.link && (
          <a
            href={s.link}
            target="_blank"
            rel="noreferrer"
            className="btn secondary"
          >
            <ExternalLink size={17} />
            {s.lesson === 7 ? "เปิดฟังเพลง / ดูผลงาน" : "เปิดลิงก์ผลงาน"}
          </a>
        )}
      </section>
      {s.reflection && (
        <section className="reflection-block">
          <span className="card-kicker">สิ่งที่ตรวจแก้ / ได้เรียนรู้</span>
          <pre>{s.reflection}</pre>
        </section>
      )}
    </div>
  );
}
function Presentation({
  sub,
  person,
  onClose,
}: {
  sub: Submission;
  person: Person;
  onClose: () => void;
}) {
  const [names, setNames] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", key);
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="presentation"
      role="dialog"
      aria-modal="true"
      aria-label="โหมดนำเสนอผลงาน"
    >
      <header>
        <Brand light small />
        <div>
          <button onClick={() => setNames(!names)}>
            {names ? <EyeOff size={18} /> : <Eye size={18} />}{" "}
            {names ? "ซ่อนชื่อ" : "แสดงชื่อ"}
          </button>
          <button
            aria-label="เต็มจอ"
            onClick={() =>
              void ref.current?.requestFullscreen().catch(() => {})
            }
          >
            <Maximize2 size={19} />
          </button>
          <button aria-label="ปิดโหมดนำเสนอ" onClick={onClose}>
            <X size={23} />
          </button>
        </div>
      </header>
      <main>
        <div className="eyebrow">
          CLASSROOM SHOWCASE · MISSION 0{sub.lesson}
        </div>
        <h1>{lessons[sub.lesson - 1].title}</h1>
        <p className="presentation-author">
          {names
            ? `${person.name} · ${person.squad}`
            : "ผลงานตัวอย่างจากห้องเรียน · ซ่อนชื่อผู้เรียน"}{" "}
          <span>· {sub.tool}</span>
        </p>
        <WorkContent sub={sub} present />
        <footer>
          <ShieldCheck size={18} /> ผลงานเพื่อการเรียนรู้ · สถานการณ์สมมติ ·
          ตรวจสอบก่อนนำไปใช้{" "}
          {sub.media_state === "blocked" ? "· ยังสร้างสื่อไม่สำเร็จ" : ""}
        </footer>
      </main>
    </div>
  );
}
function SettingsModal({
  data,
  onClose,
  onSave,
}: {
  data: Settings;
  onClose: () => void;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [form, setForm] = useState(data),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="ตั้งค่าห้องเรียน" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(form);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          ชื่อห้องเรียน
          <input
            value={form.title}
            maxLength={120}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          จำนวนนักเรียนเป้าหมาย
          <input
            type="number"
            min={1}
            max={300}
            value={form.expected}
            onChange={(e) =>
              setForm({ ...form, expected: Number(e.target.value) })
            }
          />
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={!!form.lock_following}
            onChange={(e) =>
              setForm({ ...form, lock_following: e.target.checked ? 1 : 0 })
            }
          />
          <span>
            <b>เปิดภารกิจตามผู้สอน</b>
            <small>
              ผู้เรียนทำได้ถึงภารกิจปัจจุบัน หากปิดจะเลือกฝึกทั้ง 8 ข้อได้
            </small>
          </span>
        </label>
        <div className="form-row">
          <label>
            เพดานงบ AI (USD)
            <input
              type="number"
              min={0}
              max={25}
              step={0.1}
              value={form.budget}
              onChange={(e) =>
                setForm({ ...form, budget: Number(e.target.value) })
              }
            />
          </label>
          <label>
            จำนวนคำขอสูงสุด
            <input
              type="number"
              min={0}
              max={5400}
              value={form.max_requests}
              onChange={(e) =>
                setForm({ ...form, max_requests: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <Notice>
          โควตาแชตรายคน 18 คำตอบ · ตรวจคะแนนรวมท้ายคาบ 5 ครั้งต่อคน · ไม่เกิน 12
          คำขอพร้อมกัน · จองงบก่อนเรียก AI ค่าใช้จ่ายแสดงเป็น USD
        </Notice>
        <Button busy={busy} type="submit">
          บันทึกการตั้งค่า
          <Check size={17} />
        </Button>
      </form>
    </Modal>
  );
}
function QrModal({ onClose }: { onClose: () => void }) {
  const [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false);
  const url = window.location.origin;
  useEffect(() => {
    void QRCode.toDataURL(url, {
      width: 420,
      margin: 2,
      color: { dark: "#143c34", light: "#ffffff" },
    }).then(setQr);
  }, [url]);
  return (
    <Modal title="สแกนเพื่อเข้าห้องเรียน" onClose={onClose}>
      <div className="qr-content">
        {qr ? (
          <img src={qr} alt="QR เข้าห้องเรียน AI Police Lab" />
        ) : (
          <Loader2 className="spin" />
        )}
        <p>เปิดกล้องมือถือ สแกน QR แล้วกด “นักเรียน”</p>
        <p className="muted">
          ไม่ต้องใช้รหัสห้องเรียน — นักเรียนเลือกกลุ่ม กรอกชื่อ
          แล้วรับเลขนักเรียน 4 หลักไว้เข้าสู่ระบบ
        </p>
        <p className="muted">{url}</p>
        <Button
          variant="secondary"
          onClick={async () => {
            await copy(url);
            setCopied(true);
          }}
        >
          <Copy size={16} />
          {copied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ห้องเรียน"}
        </Button>
      </div>
    </Modal>
  );
}

function App() {
  const [me, setMe] = useState<Me | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [loading, setLoading] = useState(true),
    [bootError, setBootError] = useState("");
  const refresh = useCallback(async () => {
    const result = await api<Me>("/me");
    setMe(result);
  }, []);
  const boot = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await api<Config>("/config"));
      setBootError("");
      try {
        await refresh();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        setMe(null);
      }
    } catch (e) {
      setBootError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden)
        void api<Config>("/config")
          .then(setConfig)
          .catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, []);
  const logout = async () => {
    await api("/logout", {});
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("p4-view-")) sessionStorage.removeItem(key);
    } catch {}
    setMe(null);
    window.location.href = window.location.pathname.startsWith("/instructor")
      ? "/instructor"
      : "/";
  };
  if (loading)
    return (
      <div className="loading-screen">
        <Brand />
        <Loader2 className="spin" />
        <p>กำลังเปิดห้องเรียน…</p>
      </div>
    );
  if (bootError)
    return (
      <div className="loading-screen">
        <WifiOff size={30} />
        <p>{bootError}</p>
        <Button onClick={() => void boot()}>ลองเชื่อมต่อใหม่</Button>
      </div>
    );
  if (me?.role === "admin")
    return <InstructorApp onLogout={() => void logout()} />;
  if (me?.role === "student" && config)
    return (
      <StudentApp
        me={me}
        config={config}
        refresh={refresh}
        onLogout={() => void logout()}
      />
    );
  return (
    <Login
      config={config}
      instructor={window.location.pathname.startsWith("/instructor")}
      onLogin={refresh}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
