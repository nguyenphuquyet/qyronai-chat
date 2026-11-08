import {
  BookOpen,
  Brush,
  Code,
  FileText,
  FileType,
  Film,
  FlaskConical,
  LayoutDashboard,
  Megaphone,
  Palette,
  PenLine,
  Plug,
  Presentation,
  ShieldCheck,
  Sparkles,
  Table2,
  type LucideIcon,
} from "lucide-react";
import type { SkillIconName } from "@/lib/types";

const icons: Record<SkillIconName, LucideIcon> = {
  guide: BookOpen,
  art: Brush,
  theme: Palette,
  design: PenLine,
  code: Code,
  check: ShieldCheck,
  doc: FileText,
  pdf: FileType,
  layout: LayoutDashboard,
  comms: Megaphone,
  plug: Plug,
  slides: Presentation,
  sheet: Table2,
  skill: Sparkles,
  gif: Film,
  test: FlaskConical,
};

export default function SkillIcon({
  name,
  className,
}: {
  name: SkillIconName;
  className?: string;
}) {
  const Icon = icons[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
