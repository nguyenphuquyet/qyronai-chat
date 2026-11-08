import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AppUser, UserRole } from "@/lib/types";

const COOKIE_NAME = "qyron_session";
const SESSION_DAYS = 30;
const KEY_LENGTH = 64;

/** Băm mật khẩu bằng scrypt kèm muối ngẫu nhiên cho từng tài khoản. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, salt, expected.length || KEY_LENGTH);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

/** Token trong cookie chỉ được lưu dưới dạng băm trong database. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toAppUser(row: {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
}): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role === "admin" ? "admin" : "user") satisfies UserRole,
    plan: row.plan,
  };
}

async function cookieIsSecure() {
  try {
    const header = await headers();
    const proto = header.get("x-forwarded-proto")?.split(",")[0]?.trim();
    return proto === "https";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await cookieIsSecure(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { id: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(COOKIE_NAME);
}

/** Đọc phiên đăng nhập từ cookie và kiểm tra hạn dùng trong database. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const row = await prisma.session
    .findUnique({
      where: { id: hashToken(token) },
      include: { user: true },
    })
    .catch(() => null);

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  return toAppUser(row.user);
}

/** Dùng trong page/layout: chưa đăng nhập thì chuyển tới /login. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Dùng trong page/layout: chỉ quản trị viên mới được vào. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** Đã có tài khoản nào chưa — dùng để biến tài khoản đầu tiên thành quản trị viên. */
export async function hasAnyUser(): Promise<boolean> {
  const count = await prisma.user.count().catch(() => 0);
  return count > 0;
}
