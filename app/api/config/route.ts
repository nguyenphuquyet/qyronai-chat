import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { repairMojibake } from "@/lib/mojibake";
import { prisma } from "@/lib/prisma";
import type { ModelOption, Provider, Skill } from "@/lib/types";

export const dynamic = "force-dynamic";

type ConfigPayload = {
  providers?: Provider[];
  models?: ModelOption[];
  skills?: Skill[];
  /** Chỉ dẫn chung áp dụng cho mọi mô hình. */
  globalPrompt?: string;
};

function toProvider(row: {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  note: string | null;
  builtin: boolean;
}): Provider {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    enabled: row.enabled,
    note: row.note ?? undefined,
    builtin: row.builtin,
  };
}

function toModel(row: {
  id: string;
  name: string;
  description: string;
  providerId: string;
  contextWindow: string | null;
  badge: string | null;
  apiModel: string | null;
  protocol: string;
  icon: string | null;
  systemPrompt: string | null;
  reasoning: boolean;
  enabled: boolean;
}): ModelOption {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    providerId: row.providerId,
    contextWindow: row.contextWindow ?? undefined,
    badge: row.badge ?? undefined,
    apiModel: row.apiModel ?? undefined,
    protocol:
      row.protocol === "anthropic"
        ? "anthropic"
        : row.protocol === "google"
          ? "google"
          : "openai",
    icon: (row.icon as ModelOption["icon"]) ?? undefined,
    systemPrompt: row.systemPrompt ?? undefined,
    reasoning: row.reasoning,
    enabled: row.enabled,
  };
}

function toSkill(row: {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: string;
  icon: string;
  enabled: boolean;
  uses: number;
  builtin: boolean;
}): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    category: row.category,
    icon: row.icon as Skill["icon"],
    enabled: row.enabled,
    uses: row.uses,
    builtin: row.builtin,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập.", ready: false },
      { status: 401 },
    );
  }

  try {
    const [providers, models, skills, globalSetting] = await Promise.all([
      prisma.provider.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.model.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.skill.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.setting.findUnique({ where: { key: "globalPrompt" } }),
    ]);

    const canSeeKeys = user.role === "admin";

    return NextResponse.json({
      ready: providers.length > 0 || models.length > 0 || skills.length > 0,
      database: "online",
      // Khoá API chỉ trả về cho quản trị viên; tài khoản thường chỉ thấy tên.
      providers: providers
        .map(toProvider)
        .map((provider) =>
          canSeeKeys ? provider : { ...provider, apiKey: "" },
        ),
      models: models.map(toModel),
      skills: skills.map(toSkill),
      globalPrompt: globalSetting?.value ?? "",
    });
  } catch {
    // Chưa cấu hình MySQL hoặc database đang tắt: giao diện dùng bản trong máy.
    return NextResponse.json({
      ready: false,
      database: "offline",
      providers: [],
      models: [],
      skills: [],
      globalPrompt: "",
    });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  // Chỉ quản trị viên được thay đổi API, mô hình, kỹ năng và chỉ dẫn chung.
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Chỉ quản trị viên được sửa cấu hình." },
      { status: 403 },
    );
  }

  let body: ConfigPayload;
  try {
    body = (await request.json()) as ConfigPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON không hợp lệ." }, { status: 400 });
  }

  const providers = Array.isArray(body.providers) ? body.providers : [];
  const models = Array.isArray(body.models) ? body.models : [];
  const skills = Array.isArray(body.skills) ? body.skills : [];
  const hasGlobalPrompt = typeof body.globalPrompt === "string";
  const hasCollections =
    providers.length > 0 || models.length > 0 || skills.length > 0;

  if (!hasCollections && !hasGlobalPrompt) {
    return NextResponse.json({ ok: false, error: "Không có dữ liệu để lưu." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (hasGlobalPrompt) {
        const value = repairMojibake(body.globalPrompt?.trim() ?? "");
        if (value) {
          await tx.setting.upsert({
            where: { key: "globalPrompt" },
            create: { key: "globalPrompt", value },
            update: { value },
          });
        } else {
          await tx.setting.deleteMany({ where: { key: "globalPrompt" } });
        }
      }

      // Chỉ đồng bộ danh sách khi có dữ liệu, tránh xoá oan khi chỉ lưu chỉ dẫn chung.
      if (!hasCollections) return;

      const providerIds = providers.map((provider) => provider.id);
      const modelIds = models.map((model) => model.id);
      const skillIds = skills.map((skill) => skill.id);

      // Trình duyệt có thể gửi khoá rỗng (tài khoản thường không thấy khoá);
      // giữ lại khoá đang có trong database thay vì xoá mất.
      const existingKeys = new Map(
        (
          await tx.provider.findMany({ select: { id: true, apiKey: true } })
        ).map((row) => [row.id, row.apiKey]),
      );

      if (modelIds.length > 0) {
        await tx.model.deleteMany({ where: { id: { notIn: modelIds } } });
      } else {
        await tx.model.deleteMany();
      }

      if (providerIds.length > 0) {
        await tx.provider.deleteMany({ where: { id: { notIn: providerIds } } });
      } else {
        await tx.provider.deleteMany();
      }

      for (const [index, provider] of providers.entries()) {
        const apiKey =
          provider.apiKey.trim() || existingKeys.get(provider.id) || "";
        const name = repairMojibake(provider.name);
        const note = provider.note ? repairMojibake(provider.note) : null;
        await tx.provider.upsert({
          where: { id: provider.id },
          create: {
            id: provider.id,
            name,
            baseUrl: provider.baseUrl,
            apiKey,
            enabled: provider.enabled,
            note,
            builtin: provider.builtin ?? false,
            sortOrder: index,
          },
          update: {
            name,
            baseUrl: provider.baseUrl,
            apiKey,
            enabled: provider.enabled,
            note,
            builtin: provider.builtin ?? false,
            sortOrder: index,
          },
        });
      }

      for (const [index, model] of models.entries()) {
        const name = repairMojibake(model.name);
        const description = repairMojibake(model.description);
        const systemPrompt = model.systemPrompt
          ? repairMojibake(model.systemPrompt)
          : null;
        const badge = model.badge ? repairMojibake(model.badge) : null;
        await tx.model.upsert({
          where: { id: model.id },
          create: {
            id: model.id,
            name,
            description,
            providerId: model.providerId,
            // Ngữ cảnh chỉ do API kiểm tra mô hình ghi vào, không nhận từ trình duyệt.
            contextWindow: null,
            badge,
            apiModel: model.apiModel ?? null,
            protocol: model.protocol ?? "openai",
            icon: model.icon ?? null,
            systemPrompt,
            reasoning: model.reasoning,
            enabled: model.enabled,
            sortOrder: index,
          },
          update: {
            name,
            description,
            providerId: model.providerId,
            // Giữ nguyên cửa sổ ngữ cảnh đã dò từ API; không ghi đè bằng dữ
            // liệu cũ trong localStorage của trình duyệt.
            badge,
            apiModel: model.apiModel ?? null,
            protocol: model.protocol ?? "openai",
            icon: model.icon ?? null,
            systemPrompt,
            reasoning: model.reasoning,
            enabled: model.enabled,
            sortOrder: index,
          },
        });
      }

      if (skillIds.length > 0) {
        await tx.skill.deleteMany({ where: { id: { notIn: skillIds } } });
      } else {
        await tx.skill.deleteMany();
      }

      for (const [index, skill] of skills.entries()) {
        const name = repairMojibake(skill.name);
        const description = repairMojibake(skill.description);
        const instructions = repairMojibake(skill.instructions);
        const category = repairMojibake(skill.category);
        await tx.skill.upsert({
          where: { id: skill.id },
          create: {
            id: skill.id,
            name,
            description,
            instructions,
            category,
            icon: skill.icon,
            enabled: skill.enabled,
            uses: skill.uses,
            builtin: skill.builtin ?? false,
            sortOrder: index,
          },
          update: {
            name,
            description,
            instructions,
            category,
            icon: skill.icon,
            enabled: skill.enabled,
            uses: skill.uses,
            builtin: skill.builtin ?? false,
            sortOrder: index,
          },
        });
      }
    });

    return NextResponse.json({ ok: true, database: "online" });
  } catch {
    return NextResponse.json(
      { ok: false, database: "offline", error: "Chưa kết nối được MySQL." },
      { status: 503 },
    );
  }
}
