import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Đăng ký",
  description: "Tạo tài khoản Qyron AI để bắt đầu trò chuyện.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return <AuthForm mode="register" firstAccount={!(await hasAnyUser())} />;
}
