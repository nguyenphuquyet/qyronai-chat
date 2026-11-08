import type { Metadata } from "next";
import ChatApp from "@/components/chat-app";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Quản trị",
  description: "Quản lý API, mô hình và kỹ năng của Qyron AI.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdmin();
  return <ChatApp initialView="admin" user={user} />;
}
