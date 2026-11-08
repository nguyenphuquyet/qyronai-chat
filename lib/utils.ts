export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function uid(prefix = "m") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function truncate(value: string, max = 24) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function plainTextOfMessage(text?: string, blocks?: { type: string }[]) {
  if (text) return text;
  if (!blocks) return "";
  return blocks
    .map((block) => {
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string") return b.text;
      if (Array.isArray(b.items)) return b.items.join("\n");
      if (typeof b.code === "string") return b.code;
      if (Array.isArray(b.rows)) {
        return (b.rows as string[][]).map((row) => row.join("\t")).join("\n");
      }
      return "";
    })
    .join("\n\n");
}

export function formatCount(count: number) {
  return new Intl.NumberFormat("vi-VN").format(count);
}
