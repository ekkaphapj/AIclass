export type ExtensionWork = {
  student_id: string;
  mission: number;
  status: "started" | "submitted";
  prompt: string;
  findings: string;
  plan: string;
  link: string;
  started_at: number;
  updated_at: number;
  submitted_at: number | null;
};
export type ExtensionCase = {
  title: string;
  intro: string;
  goal: string;
  glossary: string[];
  tasks: string[];
  sections: { title: string; cards: { heading: string; text: string }[] }[];
  note: string;
  starter: string;
  findingsLabel: string;
  findingsHint: string;
  planLabel: string;
  planHint: string;
};
export const extensionTitles = [
  "ปล้นรถขนเงิน: CDR และ IMEI",
  "20 เหตุ 4 โซน: นาฬิกาและแผนที่อาชญากรรม",
];

export type ExtensionReview = {
  mission: number;
  status: "running" | "done" | "failed";
  result: string;
  stale: boolean;
  created_at: number;
};
