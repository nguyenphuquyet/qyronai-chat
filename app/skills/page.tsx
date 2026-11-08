import type { Metadata } from "next";
import ChatApp from "@/components/chat-app";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Kỹ năng",
  description: "Bộ kỹ năng Qyron dùng khi trả lời câu hỏi.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const user = await requireUser();
  return <ChatApp initialView="skills" user={user} />;
}
