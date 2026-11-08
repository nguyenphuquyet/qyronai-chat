import { NextResponse } from "next/server";
import { hasAnyUser, createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/types";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 },
    );
  }

  const name = String(body.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const email = String(body.email ?? "")
    .trim()
    .toLocaleLowerCase("en");
  const password = String(body.password ?? "");

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json(
      { error: "Họ tên cần từ 2 đến 60 ký tự." },
      { status: 400 },
    );
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    return NextResponse.json(
      { error: "Email không đúng định dạng." },
      { status: 400 },
    );
  }
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Mật khẩu cần từ 8 đến 128 ký tự." },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email này đã được đăng ký. Hãy đăng nhập." },
        { status: 409 },
      );
    }

    // Tài khoản đầu tiên trở thành quản trị viên và tiếp nhận dữ liệu cũ.
    const isFirstUser = !(await hasAnyUser());
    const user = await prisma.user.create({
      data: {
        id: uid("usr"),
        name,
        email,
        passwordHash: hashPassword(password),
        role: isFirstUser ? "admin" : "user",
        plan: "Qyron",
      },
    });

    if (isFirstUser) {
      await prisma.conversation.updateMany({
        where: { userId: null },
        data: { userId: user.id },
      });
    }

    await createSession(user.id);

    const safeUser: AppUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: isFirstUser ? "admin" : "user",
      plan: user.plan,
    };

    return NextResponse.json({ ok: true, user: safeUser, isFirstUser });
  } catch {
    return NextResponse.json(
      { error: "Chưa kết nối được database. Kiểm tra MySQL rồi thử lại." },
      { status: 503 },
    );
  }
}
