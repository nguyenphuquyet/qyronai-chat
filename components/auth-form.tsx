"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "register";

interface AuthFormProps {
  mode: AuthMode;
  /** Chưa có tài khoản nào: tài khoản tạo lúc này sẽ là quản trị viên. */
  firstAccount?: boolean;
}

const highlights = [
  {
    icon: Zap,
    title: "Trả lời ngay khi đang gõ",
    detail: "Phản hồi chạy thời gian thực, có phần suy nghĩ thu gọn.",
  },
  {
    icon: Sparkles,
    title: "Tự tra cứu web khi cần",
    detail: "Thông tin mới được kiểm chứng và trích dẫn ngay trong câu.",
  },
  {
    icon: ShieldCheck,
    title: "Dữ liệu chat riêng tư",
    detail: "Mỗi tài khoản giữ lịch sử và kỹ năng riêng của mình.",
  },
];

export default function AuthForm({ mode, firstAccount }: AuthFormProps) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= (isRegister ? 8 : 1) &&
    (!isRegister || name.trim().length >= 2);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canSubmit) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password },
        ),
      });

      let data: { error?: string } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        // Máy chủ không trả JSON: dùng thông báo mặc định bên dưới.
      }

      if (!response.ok) {
        setError(data.error ?? "Không đăng nhập được. Thử lại sau.");
        setPending(false);
        return;
      }

      // Tải lại để server đọc phiên mới và dựng đúng dữ liệu của tài khoản.
      window.location.replace("/");
    } catch {
      setError("Không kết nối được máy chủ. Kiểm tra kết nối rồi thử lại.");
      setPending(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-y-auto bg-background lg:grid lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-[28rem] rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-24 size-[26rem] rounded-full bg-primary/8 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Image
            src="/qyron-logo.png"
            alt="Qyron AI"
            width={40}
            height={40}
            priority
            className="size-10 shrink-0 rounded-full"
          />
          <span className="text-lg font-semibold tracking-tight">Qyron</span>
          <span className="text-sm font-medium text-muted">AI</span>
        </div>

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-background px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Trợ lý AI tiếng Việt
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground xl:text-4xl">
            Một trợ lý AI cho mọi việc trong ngày.
          </h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">
            Hỏi đáp, viết lách, tra cứu và xử lý công việc với nhiều mô hình AI
            trong cùng một chỗ.
          </p>

          <ul className="mt-8 space-y-4">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-pretty text-muted">
                      {item.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-muted">
          © {new Date().getFullYear()} Qyron Studio
        </p>
      </section>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Image
              src="/qyron-logo.png"
              alt="Qyron AI"
              width={32}
              height={32}
              priority
              className="size-8 shrink-0 rounded-full"
            />
            <span className="text-[15px] font-semibold tracking-tight">
              Qyron
            </span>
            <span className="text-xs font-medium text-muted">AI</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isRegister ? "Tạo tài khoản" : "Đăng nhập"}
          </h1>
          <p className="mt-1.5 text-sm text-pretty text-muted">
            {isRegister
              ? "Bắt đầu trò chuyện và lưu lại lịch sử của riêng bạn."
              : "Chào mừng trở lại. Tiếp tục cuộc trò chuyện của bạn."}
          </p>

          {isRegister && firstAccount ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-xs leading-relaxed text-muted">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              Đây là tài khoản đầu tiên nên sẽ có quyền quản trị. Bạn có thể
              thêm API, mô hình và chỉ dẫn chung cho cả ứng dụng.
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {isRegister ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-foreground">
                  Họ và tên
                </span>
                <input
                  name="name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  placeholder="Nguyễn Văn A"
                  className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </span>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus={!isRegister}
                maxLength={200}
                placeholder="ban@qyron.ai"
                className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  Mật khẩu
                </span>
                {isRegister ? (
                  <span className="text-xs text-muted">Tối thiểu 8 ký tự</span>
                ) : null}
              </span>
              <span className="relative block">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  autoFocus={isRegister}
                  maxLength={128}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3 pr-11 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-item-hover hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </span>
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-error-border bg-error-bg px-3 py-2.5 text-sm text-pretty text-error-text"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit || pending}
              className={cn(
                "flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  {isRegister ? "Đang tạo tài khoản…" : "Đang đăng nhập…"}
                </>
              ) : (
                <>
                  {isRegister ? "Tạo tài khoản" : "Đăng nhập"}
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <Link
              href={isRegister ? "/login" : "/register"}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isRegister ? "Đăng nhập" : "Đăng ký ngay"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
