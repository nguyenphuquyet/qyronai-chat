"use client";

import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  Lock,
  Monitor,
  Moon,
  Palette,
  Plus,
  Sun,
  Trash2,
  Type,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Avatar from "@/components/ui/avatar";
import Switch from "@/components/ui/switch";
import type { AppUser } from "@/lib/types";
import type { UiSetting } from "@/lib/use-preference-sync";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-10 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus";

type Tab = "profile" | "appearance" | "apikey" | "security";

const TABS: { id: Tab; label: string; Icon: typeof UserRound }[] = [
  { id: "profile", label: "Hồ sơ", Icon: UserRound },
  { id: "appearance", label: "Giao diện", Icon: Palette },
  { id: "apikey", label: "API key", Icon: KeyRound },
  { id: "security", label: "Bảo mật", Icon: Lock },
];

function Shell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden onClick={onClose} className="fade-in absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-in relative z-10 flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-modal sm:h-[82dvh] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

async function fileToAvatar(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không đọc được ảnh."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Không đọc được ảnh."));
    element.src = raw;
  });
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Trình duyệt không xử lý được ảnh.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function ProfileTab({
  user,
  onSaved,
  onNotify,
}: {
  user: AppUser;
  onSaved: (user: AppUser) => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setAvatar(await fileToAvatar(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được ảnh.");
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), avatar: avatar ?? null }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; user?: AppUser; error?: string }
        | null;
      if (!response.ok || !data?.user) {
        setError(data?.error ?? `Máy chủ trả về lỗi ${response.status}.`);
        return;
      }
      onSaved(data.user);
      onNotify("Đã cập nhật hồ sơ");
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={name || user.name} src={avatar} seed={user.email} size={72} />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover"
            >
              <ImagePlus className="size-4" aria-hidden />
              Đổi ảnh
            </button>
            {avatar ? (
              <button
                type="button"
                onClick={() => setAvatar(undefined)}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-muted outline-hidden transition-colors hover:bg-button-hover hover:text-foreground"
              >
                <Trash2 className="size-4" aria-hidden />
                Gỡ ảnh
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted">PNG, JPG, WebP hoặc GIF; tự cắt vuông.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">Tên hiển thị</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder="Tên của bạn"
          className={fieldClass}
        />
      </label>
      <p className="mt-2 text-xs text-muted">{user.email}</p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || name.trim().length === 0}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          Lưu hồ sơ
        </button>
      </div>
    </div>
  );
}

const THEMES: { id: UiSetting["theme"]; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Sáng", Icon: Sun },
  { id: "dark", label: "Tối", Icon: Moon },
  { id: "system", label: "Hệ thống", Icon: Monitor },
];
const FONT_SIZES: { id: UiSetting["fontSize"]; label: string }[] = [
  { id: "small", label: "Nhỏ" },
  { id: "medium", label: "Vừa" },
  { id: "large", label: "Lớn" },
];

function AppearanceTab({
  ui,
  onChangeUi,
}: {
  ui: UiSetting;
  onChangeUi: (patch: Partial<UiSetting>) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Chủ đề</h3>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {THEMES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={ui.theme === id}
            onClick={() => onChangeUi({ theme: id })}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border text-sm font-medium outline-hidden transition-colors",
              ui.theme === id
                ? "border-primary bg-primary-light text-primary"
                : "border-border-strong bg-surface text-muted hover:bg-button-hover hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Type className="size-4 text-muted" aria-hidden />
          Cỡ chữ
        </span>
        <div className="flex gap-1">
          {FONT_SIZES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={ui.fontSize === id}
              onClick={() => onChangeUi({ fontSize: id })}
              className={cn(
                "h-8 cursor-pointer rounded-lg px-3 text-xs font-medium outline-hidden transition-colors",
                ui.fontSize === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Enter để gửi</p>
          <p className="mt-0.5 text-xs text-muted">Tắt thì Enter xuống dòng, Ctrl+Enter để gửi.</p>
        </div>
        <Switch
          checked={ui.enterToSend}
          onChange={() => onChangeUi({ enterToSend: !ui.enterToSend })}
          label="Enter để gửi"
        />
      </div>
    </div>
  );
}

interface ServiceKey {
  id: string;
  prefix: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function ApiKeyTab({ onNotify }: { onNotify: (message: string) => void }) {
  const [keys, setKeys] = useState<ServiceKey[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const base =
    typeof window === "undefined" ? "" : `${window.location.origin}/api/v1`;
  const example = `curl ${base}/chat/completions \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"<model_id>","messages":[{"role":"user","content":"Xin chào"}]}'`;

  const load = () => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((data: { keys?: ServiceKey[] }) => setKeys(data.keys ?? []))
      .catch(() => undefined);
  };
  useEffect(load, []);

  const create = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; key?: string; error?: string }
        | null;
      if (!response.ok || !data?.key) {
        onNotify(data?.error ?? "Chưa tạo được khoá.");
        return;
      }
      setFresh(data.key);
      setReveal(true);
      setLabel("");
      load();
      onNotify("Đã tạo API key — sao chép ngay, khoá chỉ hiện một lần");
    } catch {
      onNotify("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await fetch("/api/keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
    setKeys((current) => current.filter((key) => key.id !== id));
    onNotify("Đã thu hồi khoá");
  };

  const copy = (text: string, message: string) => {
    navigator.clipboard?.writeText(text).then(
      () => onNotify(message),
      () => onNotify("Không sao chép được."),
    );
  };

  return (
    <div>
      <p className="text-xs text-muted">
        Khoá dịch vụ cho phép ứng dụng bên ngoài gọi API của web để dùng mô hình
        (tương thích OpenAI). Khoá gắn với tài khoản của bạn.
      </p>

      {fresh ? (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary-light p-3">
          <p className="text-xs font-medium text-primary">
            Khoá mới — chỉ hiện một lần, hãy sao chép ngay:
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2 py-1.5 font-mono text-xs text-foreground">
              {reveal ? fresh : "••••••••••••••••••••••••"}
            </code>
            <button
              type="button"
              aria-label={reveal ? "Ẩn khoá" : "Hiện khoá"}
              onClick={() => setReveal((v) => !v)}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted outline-hidden hover:text-foreground"
            >
              {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
            <button
              type="button"
              aria-label="Sao chép khoá"
              onClick={() => copy(fresh, "Đã sao chép API key")}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-primary text-primary-foreground outline-hidden hover:bg-primary-hover"
            >
              <Copy className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex gap-1.5">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={60}
          placeholder="Nhãn khoá (ví dụ: máy ở công ty)"
          className={cn(fieldClass, "h-9")}
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          Tạo khoá
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {keys.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-3 py-4 text-center text-sm text-muted">
            Chưa có khoá nào. Tạo khoá đầu tiên để gọi API.
          </p>
        ) : (
          keys.map((key) => (
            <div key={key.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
              <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{key.label}</p>
                <p className="truncate font-mono text-[11px] text-muted">
                  {key.prefix} · tạo {new Date(key.createdAt).toLocaleDateString("vi-VN")}
                  {key.lastUsedAt
                    ? ` · dùng lần cuối ${new Date(key.lastUsedAt).toLocaleDateString("vi-VN")}`
                    : " · chưa dùng"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Thu hồi khoá ${key.label}`}
                onClick={() => void revoke(key.id)}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">Endpoint tương thích OpenAI</p>
          <button
            type="button"
            onClick={() => copy(base, "Đã sao chép endpoint")}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary outline-hidden hover:underline"
          >
            <Copy className="size-3" aria-hidden />
            Sao chép
          </button>
        </div>
        <code className="mt-1 block truncate font-mono text-[11px] text-muted">{base}</code>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-2 font-mono text-[11px] leading-relaxed text-muted">
          {example}
        </pre>
        <p className="mt-2 text-[11px] text-muted">
          Xem danh sách mô hình: <code className="font-mono">{base}/models</code>
        </p>
      </div>
    </div>
  );
}

function SecurityTab({ onNotify }: { onNotify: (message: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    setError(null);
    if (next.length < 8) {
      setError("Mật khẩu mới phải từ 8 ký tự.");
      return;
    }
    if (next !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok) {
        setError(data?.error ?? `Máy chủ trả về lỗi ${response.status}.`);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      onNotify("Đã đổi mật khẩu");
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Đổi mật khẩu</h3>
      <div className="mt-2 space-y-2">
        <input
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          placeholder="Mật khẩu hiện tại"
          autoComplete="current-password"
          className={fieldClass}
        />
        <input
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="Mật khẩu mới (từ 8 ký tự)"
          autoComplete="new-password"
          className={fieldClass}
        />
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Nhập lại mật khẩu mới"
          autoComplete="new-password"
          className={fieldClass}
        />
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void change()}
          disabled={busy || !current || !next || !confirm}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          Đổi mật khẩu
        </button>
      </div>
    </div>
  );
}

export function SettingsDialog({
  initialTab,
  user,
  onSaved,
  ui,
  onChangeUi,
  onClose,
  onNotify,
}: {
  initialTab: Tab;
  user: AppUser;
  onSaved: (user: AppUser) => void;
  ui: UiSetting;
  onChangeUi: (patch: Partial<UiSetting>) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <Shell
      title="Cài đặt"
      description="Hồ sơ, giao diện, API key dịch vụ và bảo mật tài khoản."
      onClose={onClose}
    >
      <nav
        aria-label="Các mục cài đặt"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 sm:w-48 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-2 sm:py-3"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium outline-hidden transition-colors sm:w-full",
              tab === id
                ? "bg-primary-light text-primary"
                : "text-muted hover:bg-item-hover hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "profile" ? (
          <ProfileTab user={user} onSaved={onSaved} onNotify={onNotify} />
        ) : tab === "appearance" ? (
          <AppearanceTab ui={ui} onChangeUi={onChangeUi} />
        ) : tab === "apikey" ? (
          <ApiKeyTab onNotify={onNotify} />
        ) : (
          <SecurityTab onNotify={onNotify} />
        )}
      </div>
    </Shell>
  );
}