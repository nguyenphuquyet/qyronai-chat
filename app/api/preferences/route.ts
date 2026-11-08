import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chỉ nhận những khoá cấu hình đã biết để tránh lưu dữ liệu tuỳ ý. */
const ALLOWED_KEYS = new Set([
  "modelId",
  "reasoning",
  "saved",
  "activeConversation",
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập." },
      { status: 401 },
    );
  }

  try {
    const rows = await prisma.userSetting.findMany({
      where: { userId: user.id },
    });

    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value) as unknown;
      } catch {
        // Bản ghi hỏng: bỏ qua, không làm sập cấu hình còn lại.
      }
    }

    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json(
      { error: "Chưa đọc được cấu hình từ database." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập." },
      { status: 401 },
    );
  }

  let body: { settings?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 },
    );
  }

  const settings =
    body.settings && typeof body.settings === "object" ? body.settings : null;
  if (!settings) {
    return NextResponse.json(
      { error: "Không có cấu hình để lưu." },
      { status: 400 },
    );
  }

  const entries = Object.entries(settings).filter(([key]) =>
    ALLOWED_KEYS.has(key),
  );
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Không có cấu hình hợp lệ để lưu." },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        if (value === null || value === undefined) {
          await tx.userSetting.deleteMany({
            where: { userId: user.id, key },
          });
          continue;
        }

        const serialized = JSON.stringify(value);
        if (serialized.length > 20_000) continue;

        await tx.userSetting.upsert({
          where: { userId_key: { userId: user.id, key } },
          create: { userId: user.id, key, value: serialized },
          update: { value: serialized },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Chưa lưu được cấu hình vào database." },
      { status: 503 },
    );
  }
}
