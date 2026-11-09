import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userFromBearer } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Danh sách mô hình của dịch vụ, định dạng tương thích OpenAI. */
export async function GET(request: Request) {
  const user = (await getCurrentUser()) ?? (await userFromBearer(request));
  if (!user) {
    return NextResponse.json(
      { error: { message: "Thiếu API key dịch vụ (Authorization: Bearer …)." } },
      { status: 401 },
    );
  }
  const models = await prisma.model.findMany({
    where: { enabled: true, provider: { enabled: true } },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({
    object: "list",
    data: models.map((model) => ({
      id: model.id,
      object: "model",
      created: Math.floor(model.createdAt.getTime() / 1000),
      owned_by: model.providerId,
      name: model.name,
      context_window: model.contextWindow ?? null,
      reasoning: model.reasoning,
    })),
  });
}