import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AVATAR_CHARS = 1_500_000;

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  let body: { name?: unknown; avatar?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const data: { name?: string; avatar?: string | null } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 120) {
      return NextResponse.json(
        { error: "Tên hiển thị từ 1 đến 120 ký tự." },
        { status: 400 },
      );
    }
    data.name = name;
  }

  if (body.avatar === null || body.avatar === "") {
    data.avatar = null;
  } else if (typeof body.avatar === "string") {
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(body.avatar)) {
      return NextResponse.json(
        { error: "Ảnh đại diện phải là PNG, JPG, WebP hoặc GIF." },
        { status: 400 },
      );
    }
    if (body.avatar.length > MAX_AVATAR_CHARS) {
      return NextResponse.json(
        { error: "Ảnh đại diện quá lớn. Hãy chọn ảnh nhỏ hơn." },
        { status: 400 },
      );
    }
    data.avatar = body.avatar;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role === "admin" ? "admin" : "user",
        plan: updated.plan,
        avatar: updated.avatar ?? undefined,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Chưa lưu được hồ sơ vào database." },
      { status: 503 },
    );
  }
}