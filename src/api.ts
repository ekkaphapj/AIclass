export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retry = false,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json()) as { error?: string; retry?: boolean } & T;
  if (!r.ok)
    throw new ApiError(
      data.error || "เชื่อมต่อระบบไม่สำเร็จ",
      r.status,
      !!data.retry,
    );
  return data as T;
}
export type Config = {
  title: string;
  expected: number;
  active_lesson: number;
  lock_following: number;
  admission_open: number;
  ai_paused: number;
  model: string;
};
export type Person = {
  id: string;
  number: string;
  name: string;
  squad: string;
  created_at: number;
  last_seen: number;
  current_lesson: number;
  help: string;
};
export type Submission = {
  id: string;
  student_id: string;
  lesson: number;
  prompt: string;
  result: string;
  reflection: string;
  tool: string;
  link: string;
  media_state: string;
  status: string;
  score: number | null;
  feedback: string;
  submitted_at: number;
  updated_at: number;
  has_image?: number;
  answers_json?: string;
};
export type QuizResult = { kind: string; score: number; answers?: string };
export type Me = {
  role: "student" | "admin";
  student: Person;
  submissions: Submission[];
  drafts: { lesson: number; body: string; updated_at: number }[];
  quizzes: QuizResult[];
  aiUsed: number;
};
export type Settings = Config & {
  id: number;
  budget: number;
  max_requests: number;
};
export type Overview = {
  settings: Settings;
  students: Person[];
  submissions: Submission[];
  quizzes: (QuizResult & { student_id: string })[];
  usage: { total: number; completed: number; running: number; cost: number };
  serverTime: number;
  model: string;
  classCode: string;
};
