import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 5;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const rows = await prisma.apiKey
    .findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })
    .catch(() => []);
  return NextResponse.json({
    ok: true,
    keys: rows.map((row) => ({
      id: row.id,
      prefix: row.prefix,
      label: row.label,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  let body: { label?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : "Khoá dịch vụ";

  const count = await prisma.apiKey.count({ where: { userId: user.id } });
  if (count >= MAX_KEYS) {
    return NextResponse.json(
      { error: `Tối đa ${MAX_KEYS} khoá. Hãy thu hồi bớt trước khi tạo mới.` },
      { status: 400 },
    );
  }

  const key = generateApiKey();
  const row = await prisma.apiKey.create({
    data: {
      id: hashApiKey(key),
      userId: user.id,
      prefix: keyPrefix(key),
      label,
    },
  });
  // Khoá gốc chỉ trả về đúng một lần này; database chỉ giữ bản băm.
  return NextResponse.json({
    ok: true,
    key,
    id: row.id,
    prefix: row.prefix,
    label: row.label,
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Thiếu mã khoá." }, { status: 400 });
  }
  await prisma.apiKey.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}