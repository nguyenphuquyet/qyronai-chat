import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  if (next.length < 8) {
    return NextResponse.json(
      { error: "Mật khẩu mới phải từ 8 ký tự." },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.user.findUnique({ where: { id: session.id } });
    if (!row || !verifyPassword(current, row.passwordHash)) {
      return NextResponse.json(
        { error: "Mật khẩu hiện tại không đúng." },
        { status: 403 },
      );
    }
    await prisma.user.update({
      where: { id: session.id },
      data: { passwordHash: hashPassword(next) },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Chưa đổi được mật khẩu. Thử lại sau." },
      { status: 503 },
    );
  }
}