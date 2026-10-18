import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
const base = "http://127.0.0.1:8787"; // Deliberately local-only. Never create load-test pupils in production.
const secrets = JSON.parse(readFileSync(".secrets.json", "utf8"));
const timings = [],
  errors = [];
const request = async (path, body, cookie) => {
  const start = performance.now();
  const response = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  timings.push(performance.now() - start);
  if (!response.ok) throw Error(`${path}: ${response.status} ${value.error}`);
  return { value, cookie: response.headers.get("set-cookie")?.split(";")[0] };
};
const start = performance.now();
const seed = 20000 + Math.floor(Math.random() * 10000);
const teacher = await request("/admin/login", {
  password: secrets.ADMIN_PASSWORD,
});
const people = Array.from({ length: 150 }, (_, i) => i);
const outcomes = await Promise.allSettled(
  people.map(async (i) => {
    const reg = await request("/register", {
      number: String(seed + i),
      name: `นักเรียนจำลอง ${String(i + 1).padStart(3, "0")}`,
      squad: `กลุ่ม ${Math.floor(i / 5) + 1}`,
      code: secrets.CLASS_CODE,
      pin: "0123",
    });
    const cookie = reg.cookie;
    await Promise.all([
      request("/me", undefined, cookie),
      request("/config"),
      request("/heartbeat", { lesson: (i % 6) + 1 }, cookie),
    ]);
    await request(
      "/submission",
      {
        lesson: (i % 3) + 1,
        prompt: "ช่วยสรุปข้อมูลสมมติสำหรับการฝึก ห้ามเติมข้อเท็จจริง",
        result:
          "ข้อเท็จจริงจากข้อมูลสมมติ: ยังไม่ทราบเวลาที่แน่ชัด ต้องถามข้อมูลเพิ่มเติมก่อนสรุป",
        reflection:
          "ฉันตรวจเทียบกับต้นฉบับ และตัดส่วนที่ AI แต่งข้อมูลเพิ่มออกแล้ว",
        tool: "เครื่องมือทดสอบจำลอง",
      },
      cookie,
    );
    return true;
  }),
);
outcomes.forEach((o, i) => {
  if (o.status === "rejected")
    errors.push({ pupil: i + 1, error: String(o.reason) });
});
const overview = await request("/admin/overview", undefined, teacher.cookie);
timings.sort((a, b) => a - b);
const report = {
  environment: "local Cloudflare Workers + D1 simulation",
  virtualUsers: 150,
  concurrentRegistrationBurst: 150,
  successfulUsers: outcomes.filter((o) => o.status === "fulfilled").length,
  failedUsers: errors.length,
  totalRequests: timings.length,
  totalSeconds: Number(((performance.now() - start) / 1000).toFixed(2)),
  requestP50Ms: Math.round(timings[Math.floor(timings.length * 0.5)]),
  requestP95Ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
  registeredInMonitor: overview.value.students.length,
  submissionsInMonitor: overview.value.submissions.length,
  aiRequestsDuringLoad: 0,
  errors,
};
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/load-test.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
