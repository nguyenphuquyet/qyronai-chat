import { PrismaClient } from "@prisma/client";
import { models, providers, skills } from "../lib/data";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.model.deleteMany();
    await tx.provider.deleteMany();
    await tx.skill.deleteMany();

    for (const [index, provider] of providers.entries()) {
      await tx.provider.create({
        data: {
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          enabled: provider.enabled,
          note: provider.note ?? null,
          builtin: provider.builtin ?? false,
          sortOrder: index,
        },
      });
    }

    for (const [index, model] of models.entries()) {
      await tx.model.create({
        data: {
          id: model.id,
          name: model.name,
          description: model.description,
          providerId: model.providerId,
          contextWindow: model.contextWindow ?? null,
          badge: model.badge ?? null,
          apiModel: model.apiModel ?? null,
          protocol: model.protocol ?? "openai",
          icon: model.icon ?? null,
          systemPrompt: model.systemPrompt ?? null,
          reasoning: model.reasoning,
          enabled: model.enabled,
          sortOrder: index,
        },
      });
    }

    for (const [index, skill] of skills.entries()) {
      await tx.skill.create({
        data: {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          category: skill.category,
          icon: skill.icon,
          enabled: skill.enabled,
          uses: skill.uses,
          builtin: skill.builtin ?? false,
          sortOrder: index,
        },
      });
    }
  });

  console.log(
    `Đã nạp ${providers.length} API, ${models.length} mô hình và ${skills.length} kỹ năng.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed thất bại:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
