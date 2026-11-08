import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 },
    );
  }

  const email = String(body.email ?? "")
    .trim()
    .toLocaleLowerCase("en");
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Nhập email và mật khẩu để đăng nhập." },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không đúng." },
        { status: 401 },
      );
    }

    await createSession(user.id);

    const safeUser: AppUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "admin" ? "admin" : "user",
      plan: user.plan,
    };

    return NextResponse.json({ ok: true, user: safeUser });
  } catch {
    return NextResponse.json(
      { error: "Chưa kết nối được database. Kiểm tra MySQL rồi thử lại." },
      { status: 503 },
    );
  }
}
