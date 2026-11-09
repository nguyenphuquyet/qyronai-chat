import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/types";

const KEY_PREFIX = "qyron-";

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey() {
  return KEY_PREFIX + randomBytes(24).toString("base64url");
}

export function keyPrefix(key: string) {
  return `${key.slice(0, 10)}…`;
}

/** Xác thực client bên ngoài gọi /api/v1 bằng khoá dịch vụ (Authorization: Bearer). */
export async function userFromBearer(request: Request): Promise<AppUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const key = match[1].trim();
  if (!key.startsWith(KEY_PREFIX)) return null;

  const row = await prisma.apiKey
    .findUnique({ where: { id: hashApiKey(key) }, include: { user: true } })
    .catch(() => null);
  if (!row) return null;

  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  const user = row.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === "admin" ? "admin" : "user",
    plan: user.plan,
    avatar: user.avatar ?? undefined,
  };
}