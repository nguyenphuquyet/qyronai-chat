import {
  Bot,
  Boxes,
  Brain,
  Cloud,
  Cpu,
  Feather,
  Flame,
  Gem,
  Orbit,
  Rocket,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ModelIconName, ModelOption } from "@/lib/types";

const modelIcons: Record<ModelIconName, LucideIcon> = {
  sparkles: Sparkles,
  bot: Bot,
  brain: Brain,
  zap: Zap,
  gem: Gem,
  feather: Feather,
  orbit: Orbit,
  boxes: Boxes,
  rocket: Rocket,
  cpu: Cpu,
  cloud: Cloud,
  flame: Flame,
};

/** Lấy icon theo tên đã chọn trong Quản trị. */
export function modelIconByName(name?: ModelIconName): LucideIcon {
  return name ? (modelIcons[name] ?? Sparkles) : Sparkles;
}

/** Biểu tượng gợi ý theo nhóm mô hình khi chưa chọn tay. */
export function modelIconFor(
  model?: Pick<ModelOption, "id" | "name" | "providerId" | "icon">,
): LucideIcon {
  if (!model) return Sparkles;
  if (model.icon) return modelIconByName(model.icon);

  const id = model.id.toLocaleLowerCase("vi");
  const name = model.name.toLocaleLowerCase("vi");
  const key = `${id} ${name}`;

  // Kiểm tra theo mã/tên đầy đủ để “gemini” không bị nhầm thành “mini”.
  if (
    id.includes("-mini") ||
    name.includes("mini") ||
    key.includes("flash") ||
    key.includes("haiku")
  ) {
    return Zap;
  }
  if (key.includes("pro")) return Gem;
  if (model.providerId === "prov-anthropic") return Feather;
  if (model.providerId === "prov-openai") return Bot;
  if (model.providerId === "prov-google") return Sparkles;
  if (model.providerId === "prov-huggingface") return Boxes;
  return Orbit;
}

export default function ModelIcon({
  model,
  className,
}: {
  model?: Pick<ModelOption, "id" | "name" | "providerId" | "icon">;
  className?: string;
}) {
  const Icon = modelIconFor(model);
  return <Icon className={className} aria-hidden />;
}
