export type ExtensionWork = {
  student_id: string;
  mission: number;
  status: "started" | "submitted";
  findings: string;
  plan: string;
  link: string;
  started_at: number;
  updated_at: number;
  submitted_at: number | null;
};
export const extensionTitles = [
  "สืบคดีจำลองและทำ Timeline",
  "นาฬิกาอาชญากรรมและแผนชุมชน",
];
