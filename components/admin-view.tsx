"use client";

import {
  ArrowLeft,
  CircleAlert,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Menu as MenuIcon,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ScanSearch,
  Server,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import ModelIcon, { modelIconByName } from "@/components/model-icon";
import { createPortal } from "react-dom";
import IconButton from "@/components/ui/icon-button";
import Menu, { MenuItem, MenuSeparator } from "@/components/ui/menu";
import Switch from "@/components/ui/switch";
import { useAutohideScrollbar } from "@/components/ui/scroll";
import {
  inferModelIcon,
  inferProtocol,
  modelIconOptions,
  modelProtocols,
  type ModelIconName,
  type ModelInput,
  type ModelOption,
  type ModelProbeResult,
  type ModelProtocol,
  type Provider,
  type ProviderInput,
  type Skill,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface AdminViewProps {
  providers: Provider[];
  models: ModelOption[];
  skills: Skill[];
  conversationCount: number;
  /** Chỉ dẫn chung áp dụng cho mọi mô hình. */
  globalPrompt: string;
  onChangeGlobalPrompt: (value: string) => void;
  onToggleProvider: (id: string) => void;
  onSaveProvider: (id: string | null, input: ProviderInput) => void;
  onDeleteProvider: (id: string) => void;
  onToggleModel: (id: string) => void;
  onSaveModel: (id: string | null, input: ModelInput) => void;
  /** Cập nhật cửa sổ ngữ cảnh đọc được từ API sau khi kiểm tra mô hình. */
  onModelContext: (id: string, contextWindow: string) => void;
  onDeleteModel: (id: string) => void;
  /** Mô hình hiện được đặt làm mặc định. */
  defaultModelId: string;
  onSetDefaultModel: (id: string) => void;
  onOpenSkills: () => void;
  onBack: () => void;
  onOpenSidebar: () => void;
}

const inputClass =
  "h-10 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus";

const CONTEXT_UNITS = [
  { id: "1", label: "token", factor: 1 },
  { id: "1000", label: "nghìn", factor: 1000 },
  { id: "1000000", label: "triệu", factor: 1000000 },
] as const;
type ContextUnit = (typeof CONTEXT_UNITS)[number]["id"];

function parseContext(raw?: string): { value: string; unit: ContextUnit } {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  const total = digits ? parseInt(digits, 10) : 0;
  if (total >= 1_000_000 && total % 1_000_000 === 0) {
    return { value: String(total / 1_000_000), unit: "1000000" };
  }
  if (total >= 1_000 && total % 1_000 === 0) {
    return { value: String(total / 1_000), unit: "1000" };
  }
  return { value: total ? String(total) : "", unit: "1" };
}

function contextTotal(value: string, unit: ContextUnit): number {
  const n = parseFloat(value.replace(",", "."));
  if (!isFinite(n) || n <= 0) return 0;
  const factor = CONTEXT_UNITS.find((item) => item.id === unit)?.factor ?? 1;
  return Math.round(n * factor);
}

function maskKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return "Chưa có khoá";
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function DialogShell({
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="fade-in absolute inset-0 bg-black/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        className="fade-in relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-border bg-surface shadow-modal sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2
              id="admin-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          </div>
          <IconButton label="Đóng" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ProviderDialog({
  provider,
  onClose,
  onSave,
}: {
  provider: Provider | null;
  onClose: () => void;
  onSave: (input: ProviderInput) => void;
}) {
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? "");
  const [note, setNote] = useState(provider?.note ?? "");
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [showKey, setShowKey] = useState(false);

  const canSave = name.trim().length > 0 && baseUrl.trim().length > 0;

  return (
    <DialogShell
      title={provider ? "Chỉnh sửa API" : "Thêm nhà cung cấp API"}
      description="Cấu hình điểm kết nối và khoá dùng cho các mô hình."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onSave({
            name: name.trim(),
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            note: note.trim() || undefined,
            enabled,
          });
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Tên nhà cung cấp
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              placeholder="Ví dụ: OpenRouter"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Base URL
            </span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              className={cn(inputClass, "font-mono text-xs")}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              API key
            </span>
            <span className="relative block">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                className={cn(inputClass, "pl-9 pr-10 font-mono text-xs")}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "Ẩn khoá API" : "Hiện khoá API"}
                className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
              </button>
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Ghi chú
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={120}
              placeholder="Ghi chú ngắn về API này…"
              className={inputClass}
            />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">
                Bật nhà cung cấp
              </p>
              <p className="text-xs text-muted">
                Mô hình của API này sẽ hiện khi trò chuyện.
              </p>
            </div>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              label="Bật nhà cung cấp"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 cursor-pointer rounded-xl px-3 text-sm font-medium text-muted outline-hidden transition-colors hover:bg-item-hover hover:text-foreground"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="h-9 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {provider ? "Lưu thay đổi" : "Thêm API"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ModelDialog({
  model,
  providers,
  onClose,
  onSave,
  onContext,
}: {
  model: ModelOption | null;
  providers: Provider[];
  onClose: () => void;
  onSave: (input: ModelInput) => void;
  onContext: (id: string, contextWindow: string) => void;
}) {
  const [name, setName] = useState(model?.name ?? "");
  const [context, setContext] = useState(() =>
    parseContext(model?.contextWindow),
  );
  const contextTokens = contextTotal(context.value, context.unit);
  const contextWindow = contextTokens
    ? contextTokens.toLocaleString("vi-VN")
    : "";
  const [contextChecking, setContextChecking] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState(
    model?.providerId ?? providers[0]?.id ?? "",
  );
  const [badge, setBadge] = useState(model?.badge ?? "");
  const [description, setDescription] = useState(model?.description ?? "");
  const [apiModel, setApiModel] = useState(model?.apiModel ?? "");
  const [icon, setIcon] = useState<ModelIconName>(() => {
    if (model?.icon) return model.icon;
    return inferModelIcon(model?.providerId ?? providers[0]?.id ?? "");
  });
  const [modelPrompt, setModelPrompt] = useState(model?.systemPrompt ?? "");
  const [protocol, setProtocol] = useState<ModelProtocol>(() => {
    if (model?.protocol) return model.protocol;
    const provider = providers.find(
      (item) => item.id === (model?.providerId ?? providers[0]?.id),
    );
    return inferProtocol(provider?.id ?? "", provider?.baseUrl ?? "");
  });
  const [reasoning, setReasoning] = useState(model?.reasoning ?? false);
  const [enabled, setEnabled] = useState(model?.enabled ?? true);

  const protocolInfo =
    modelProtocols.find((item) => item.id === protocol) ?? modelProtocols[0];

  const canSave =
    name.trim().length > 0 &&
    providerId.length > 0 &&
    apiModel.trim().length > 0;

  async function checkContext() {
    if (!model || contextChecking) return;
    setContextChecking(true);
    setContextError(null);
    try {
      const response = await fetch("/api/models/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId: model.id, contextOnly: true }),
      });
      const data = (await response.json().catch(() => null)) as
        | { contextWindow?: string; error?: string }
        | null;
      if (!response.ok) {
        setContextError(
          data?.error ?? `Máy chủ trả về lỗi ${response.status}.`,
        );
        return;
      }
      if (!data?.contextWindow) {
        setContextError(
          data?.error ?? "Nhà cung cấp không trả về cửa sổ ngữ cảnh.",
        );
        return;
      }
      setContext(parseContext(data.contextWindow));
      onContext(model.id, data.contextWindow);
    } catch (error) {
      setContextError(
        error instanceof Error
          ? error.message
          : "Không kết nối được máy chủ.",
      );
    } finally {
      setContextChecking(false);
    }
  }

  return (
    <DialogShell
      title={model ? "Chỉnh sửa mô hình" : "Thêm mô hình"}
      description="Mô hình sẽ hiện trong bộ chọn của cuộc trò chuyện."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onSave({
            name: name.trim(),
            providerId,
            badge: badge.trim() || undefined,
            description: description.trim(),
            apiModel: apiModel.trim(),
            protocol,
            icon,
            systemPrompt: modelPrompt.trim() || undefined,
            reasoning,
            enabled,
            contextWindow: contextWindow || undefined,
          });
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Tên mô hình
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder="Ví dụ: Llama 4 Maverick"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Nhà cung cấp
            </span>
            <select
              value={providerId}
              onChange={(event) => {
                const nextId = event.target.value;
                setProviderId(nextId);
                const provider = providers.find((item) => item.id === nextId);
                if (provider) {
                  setProtocol(inferProtocol(provider.id, provider.baseUrl));
                  setIcon(inferModelIcon(provider.id, apiModel));
                }
              }}
              className={cn(inputClass, "cursor-pointer")}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                  {provider.enabled ? "" : " (đang tắt)"}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Giao thức
              </span>
              <select
                value={protocol}
                onChange={(event) =>
                  setProtocol(event.target.value as ModelProtocol)
                }
                className={cn(inputClass, "cursor-pointer")}
              >
                {modelProtocols.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Mã mô hình tại API
              </span>
              <input
                value={apiModel}
                onChange={(event) => setApiModel(event.target.value)}
                maxLength={120}
                placeholder={protocolInfo.placeholder}
                className={cn(inputClass, "font-mono text-xs")}
              />
            </label>
          </div>

          <p className="-mt-2 text-xs text-pretty text-muted">
            {protocolInfo.hint} Nhập đúng mã nhà cung cấp yêu cầu, giữ nguyên
            dấu <code className="font-mono">/</code> và chữ hoa — ví dụ{" "}
            <code className="font-mono">Qwen/Qwen3.8-27B</code>.
          </p>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Biểu tượng
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {modelIconOptions.map((option) => {
                const Icon = modelIconByName(option.id);
                const selected = icon === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={selected}
                    onClick={() => setIcon(option.id)}
                    className={cn(
                      "grid h-9 cursor-pointer place-items-center rounded-lg border outline-hidden transition-colors",
                      selected
                        ? "border-primary bg-primary-light text-primary"
                        : "border-border-strong bg-surface text-muted hover:bg-button-hover hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="block text-sm font-medium text-foreground">
                  Ngữ cảnh
                </span>
                <button
                  type="button"
                  onClick={checkContext}
                  disabled={!model || contextChecking}
                  title={
                    model
                      ? "Đọc cửa sổ ngữ cảnh trực tiếp từ API"
                      : "Lưu mô hình trước rồi kiểm tra"
                  }
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-border-strong bg-surface px-2 text-xs font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {contextChecking ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ScanSearch className="size-3.5" aria-hidden />
                  )}
                  Kiểm tra
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  inputMode="decimal"
                  value={context.value}
                  onChange={(event) =>
                    setContext((current) => ({
                      ...current,
                      value: event.target.value,
                    }))
                  }
                  placeholder="0"
                  aria-label="Giá trị cửa sổ ngữ cảnh"
                  className="h-8 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
                />
                <select
                  value={context.unit}
                  onChange={(event) =>
                    setContext((current) => ({
                      ...current,
                      unit: event.target.value as ContextUnit,
                    }))
                  }
                  aria-label="Đơn vị cửa sổ ngữ cảnh"
                  className="h-8 shrink-0 cursor-pointer rounded-lg border border-border-strong bg-surface px-1.5 text-xs font-medium text-foreground outline-hidden transition-colors focus:border-focus"
                >
                  {CONTEXT_UNITS.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-muted">
                {contextTokens
                  ? `= ${contextWindow} token`
                  : "Nhập tay nếu API không trả về."}
              </p>
              <p className="mt-0.5 text-[11px] text-pretty text-muted">
                {model
                  ? "Bấm Kiểm tra để đọc từ API, hoặc nhập tay kèm đơn vị."
                  : "Nhập tay kèm đơn vị, hoặc lưu rồi bấm Kiểm tra."}
              </p>
              {contextError ? (
                <p className="mt-1 text-[11px] text-pretty text-red-700">
                  {contextError}
                </p>
              ) : null}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Nhãn
              </span>
              <input
                value={badge}
                onChange={(event) => setBadge(event.target.value)}
                maxLength={12}
                placeholder="Pro, Nhanh…"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Mô tả
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={120}
              placeholder="Một câu ngắn về thế mạnh của mô hình."
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              Chỉ dẫn riêng
              <span className="text-xs font-normal text-muted">
                {modelPrompt.length}/2000
              </span>
            </span>
            <textarea
              value={modelPrompt}
              onChange={(event) => setModelPrompt(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ví dụ: Bạn là trợ lý viết email ngắn gọn, xưng “mình” và gọi người dùng là “bạn”…"
              className="w-full resize-y rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
            />
            <p className="mt-1.5 text-xs text-pretty text-muted">
              Chỉ dẫn này chỉ áp dụng cho mô hình đang sửa. Để trống thì mô
              hình trả lời theo mặc định của nhà cung cấp, không có chỉ dẫn
              nào của Qyron.
            </p>
          </label>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">
                Hỗ trợ suy luận
              </p>
              <p className="text-xs text-muted">
                Hiện lựa chọn bật/tắt và mức suy luận khi chọn mô hình này.
              </p>
            </div>
            <Switch
              checked={reasoning}
              onChange={setReasoning}
              label="Hỗ trợ suy luận"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">
                Bật mô hình
              </p>
              <p className="text-xs text-muted">
                Tắt để ẩn khỏi bộ chọn nhưng vẫn giữ cấu hình.
              </p>
            </div>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              label="Bật mô hình"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 cursor-pointer rounded-xl px-3 text-sm font-medium text-muted outline-hidden transition-colors hover:bg-item-hover hover:text-foreground"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="h-9 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {model ? "Lưu thay đổi" : "Thêm mô hình"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ProbeRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-b-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function TriValue({
  value,
  yes,
  no,
}: {
  value: boolean | null;
  yes: string;
  no: string;
}) {
  const label = value === null ? "Chưa rõ" : value ? yes : no;
  return (
    <span
      className={cn(
        value === null
          ? "text-muted"
          : value
            ? "text-emerald-700"
            : "text-amber-700",
      )}
    >
      {label}
    </span>
  );
}

function ProbeSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-3.5 py-2 shadow-card">
      <h3 className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function formatProbeTokens(tokens: number | null, estimated: boolean) {
  if (tokens === null) return "Không đo được";
  if (tokens === 0) return "0 token";
  return `${tokens.toLocaleString("vi-VN")} token${
    estimated ? " (ước tính)" : ""
  }`;
}

function ModelProbeDialog({
  model,
  onClose,
  onContext,
}: {
  model: ModelOption;
  onClose: () => void;
  onContext: (id: string, contextWindow: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ModelProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setError(null);

    void (async () => {
      try {
        const response = await fetch("/api/models/probe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId: model.id }),
        });
        const data = (await response.json().catch(() => null)) as
          | { result?: ModelProbeResult; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok || !data?.result) {
          setError(
            data?.error ?? `Máy chủ trả về lỗi ${response.status}.`,
          );
          return;
        }
        setResult(data.result);
        if (data.result.contextWindow) {
          onContext(model.id, data.result.contextWindow);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Không kết nối được máy chủ.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [model.id, nonce, onContext]);

  const protocolLabel =
    modelProtocols.find((item) => item.id === model.protocol)?.label ??
    "OpenAI compatible";

  return (
    <DialogShell
      title={`Kiểm tra ${model.name}`}
      description="Dò thông tin thật từ API nhà cung cấp. Mỗi lần kiểm tra gửi vài câu rất ngắn nên có thể tốn một ít token."
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted">
          <span className="font-mono text-foreground">
            {model.apiModel ?? model.id}
          </span>
          <span> · {protocolLabel}</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-6 shadow-card">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Đang kiểm tra…
              </p>
              <p className="mt-0.5 text-xs text-pretty text-muted">
                Đọc metadata, dò suy luận và công cụ. Thường mất 10–40 giây.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-pretty text-red-800">
            {error}
          </div>
        ) : result ? (
          <>
            <ProbeSection title="Thông tin từ API">
              <ProbeRow
                label="Nguồn"
                value={
                  <span className="break-all font-mono text-[11px] font-normal text-muted">
                    {result.metadata.endpoint}
                  </span>
                }
              />
              <ProbeRow
                label="Tìm thấy mô hình"
                value={
                  <TriValue
                    value={
                      result.metadata.ok ? result.metadata.found : null
                    }
                    yes="Có"
                    no="Không"
                  />
                }
              />
              {result.metadata.contextLength ? (
                <ProbeRow
                  label="Ngữ cảnh"
                  value={`${result.metadata.contextLength.toLocaleString(
                    "vi-VN",
                  )} token`}
                />
              ) : null}
              {result.metadata.maxOutputTokens ? (
                <ProbeRow
                  label="Token ra tối đa"
                  value={result.metadata.maxOutputTokens.toLocaleString(
                    "vi-VN",
                  )}
                />
              ) : null}
              {result.metadata.toolCall !== undefined ? (
                <ProbeRow
                  label="Gọi công cụ"
                  value={
                    <TriValue
                      value={result.metadata.toolCall}
                      yes="Có"
                      no="Không"
                    />
                  }
                />
              ) : null}
              {result.metadata.promptCache !== undefined ? (
                <ProbeRow
                  label="Bộ nhớ đệm prompt"
                  value={
                    <TriValue
                      value={result.metadata.promptCache}
                      yes="Có"
                      no="Không"
                    />
                  }
                />
              ) : null}
              {result.metadata.reasoning !== undefined ? (
                <ProbeRow
                  label="Suy luận (metadata)"
                  value={
                    <TriValue
                      value={result.metadata.reasoning}
                      yes="Có"
                      no="Không"
                    />
                  }
                />
              ) : null}
              {result.metadata.pricing ? (
                <ProbeRow label="Giá" value={result.metadata.pricing} />
              ) : null}
              {result.metadata.error ? (
                <p className="py-2 text-xs text-pretty text-red-700">
                  {result.metadata.error}
                </p>
              ) : null}
            </ProbeSection>

            <ProbeSection title="Suy luận">
              <ProbeRow
                label="Hỗ trợ suy luận"
                value={
                  <TriValue
                    value={result.reasoning.supported}
                    yes="Có"
                    no="Không"
                  />
                }
              />
              <ProbeRow
                label="Tắt được suy luận"
                value={
                  <TriValue
                    value={result.reasoning.canDisable}
                    yes="Tắt được"
                    no="Không tắt được"
                  />
                }
              />
              <ProbeRow
                label="Token khi tắt"
                value={formatProbeTokens(
                  result.reasoning.offTokens,
                  result.reasoning.estimated,
                )}
              />
              <ProbeRow
                label="Token mức cao"
                value={formatProbeTokens(
                  result.reasoning.highTokens,
                  result.reasoning.estimated,
                )}
              />
              {result.reasoning.budgetHint ? (
                <p className="py-2 text-xs text-pretty text-muted">
                  {result.reasoning.budgetHint}
                </p>
              ) : null}
              {result.reasoning.error ? (
                <p className="whitespace-pre-line py-2 text-xs text-pretty text-amber-800">
                  {result.reasoning.error}
                </p>
              ) : null}
            </ProbeSection>

            <ProbeSection title="Công cụ / MCP">
              <ProbeRow
                label="Gọi công cụ"
                value={
                  <TriValue
                    value={result.tools.supported}
                    yes="Có"
                    no="Không"
                  />
                }
              />
              <ProbeRow
                label="Nguồn"
                value={
                  result.tools.source === "metadata"
                    ? "Metadata của API"
                    : "Dò trực tiếp"
                }
              />
              {result.tools.error ? (
                <p className="py-2 text-xs text-pretty text-amber-800">
                  {result.tools.error}
                </p>
              ) : null}
            </ProbeSection>

            {result.notes.length > 0 ? (
              <ul className="space-y-1 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-xs text-pretty text-muted">
                {result.notes.map((note) => (
                  <li key={note} className="flex gap-1.5">
                    <span aria-hidden>•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          disabled={loading}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw
            className={cn("size-4", loading && "animate-spin")}
            aria-hidden
          />
          Chạy lại
        </button>
        <span className="text-[11px] text-muted">
          {result
            ? `${(result.durationMs / 1000).toFixed(1)} giây`
            : loading
              ? "Đang dò…"
              : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover"
        >
          Đóng
        </button>
      </div>
    </DialogShell>
  );
}

function DeleteMenuItem({
  close,
  label,
  onDelete,
}: {
  close: () => void;
  label: string;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <MenuItem
      danger
      icon={<Trash2 className="size-4" aria-hidden />}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        onDelete();
        close();
      }}
    >
      {armed ? "Bấm lần nữa để xoá" : label}
    </MenuItem>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

export default function AdminView({
  providers,
  models,
  skills,
  conversationCount,
  globalPrompt,
  onChangeGlobalPrompt,
  onToggleProvider,
  onSaveProvider,
  onDeleteProvider,
  onToggleModel,
  onSaveModel,
  onModelContext,
  onDeleteModel,
  defaultModelId,
  onSetDefaultModel,
  onOpenSkills,
  onBack,
  onOpenSidebar,
}: AdminViewProps) {
  const [providerDialog, setProviderDialog] = useState<Provider | "new" | null>(
    null,
  );
  const [modelDialog, setModelDialog] = useState<ModelOption | "new" | null>(
    null,
  );
  const [probeModel, setProbeModel] = useState<ModelOption | null>(null);
  const scrollRef = useAutohideScrollbar<HTMLElement>();

  const activeProviders = providers.filter((provider) => provider.enabled).length;
  const activeModels = models.filter((model) => model.enabled).length;
  const activeSkills = skills.filter((skill) => skill.enabled).length;
  const providerById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-3 sm:px-6">
        <IconButton
          label="Mở menu"
          onClick={onOpenSidebar}
          className="lg:hidden"
        >
          <MenuIcon className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Quay lại cuộc trò chuyện" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
        </IconButton>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground">
            Quản trị
          </h1>
          <p className="truncate text-xs text-muted">
            {activeProviders}/{providers.length} API · {activeModels}/
            {models.length} mô hình
          </p>
        </div>

        <button
          type="button"
          onClick={() => setProviderDialog("new")}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover"
        >
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">Thêm API</span>
          <span className="sm:hidden">Thêm</span>
        </button>
      </header>

      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <p className="max-w-[62ch] text-sm text-pretty text-muted">
            Quản lý API, mô hình và những gì Qyron được dùng. Thay đổi ở đây áp
            dụng ngay vào bộ chọn mô hình trong cuộc trò chuyện.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard
              icon={<Server className="size-3.5" aria-hidden />}
              label="API"
              value={`${activeProviders}/${providers.length}`}
              hint="Đang bật"
            />
            <StatCard
              icon={<Cpu className="size-3.5" aria-hidden />}
              label="Mô hình"
              value={`${activeModels}/${models.length}`}
              hint="Sẵn sàng chọn"
            />
            <StatCard
              icon={<Sparkles className="size-3.5" aria-hidden />}
              label="Kỹ năng"
              value={`${activeSkills}/${skills.length}`}
              hint="Đang bật"
            />
            <StatCard
              icon={<MessageSquare className="size-3.5" aria-hidden />}
              label="Hội thoại"
              value={`${conversationCount}`}
              hint="Trong phiên này"
            />
          </div>

          <section className="mt-7">
            <div className="mb-2.5">
              <h2 className="text-sm font-semibold text-foreground">
                Chỉ dẫn chung
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Áp dụng cho mọi mô hình. Chỉ dẫn riêng của từng mô hình được
                gửi nối tiếp phía sau.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-card sm:p-4">
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                  Cách Qyron trả lời
                  <span className="text-xs font-normal text-muted">
                    {globalPrompt.length}/2000
                  </span>
                </span>
                <textarea
                  value={globalPrompt}
                  onChange={(event) =>
                    onChangeGlobalPrompt(event.target.value.slice(0, 2000))
                  }
                  rows={5}
                  maxLength={2000}
                  placeholder="Ví dụ: Trả lời bằng tiếng Việt, xưng “mình” và gọi người dùng là “bạn”. Ưu tiên ngắn gọn, có ví dụ khi cần."
                  className="w-full resize-y rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
                />
                <p className="mt-1.5 text-xs text-pretty text-muted">
                  Để trống nếu không muốn thêm chỉ dẫn chung. Thay đổi tự lưu
                  vào MySQL và áp dụng cho cả những mô hình thêm sau này.
                </p>
              </label>
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Nhà cung cấp API
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Điểm kết nối và khoá dùng cho từng nhóm mô hình.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {providers.map((provider) => {
                const modelCount = models.filter(
                  (model) => model.providerId === provider.id,
                ).length;
                return (
                  <div
                    key={provider.id}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-card sm:p-4"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-xs font-semibold tracking-wide text-foreground">
                      {initials(provider.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-sm font-semibold text-foreground">
                          {provider.name}
                        </h3>
                        {provider.builtin ? (
                          <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                            Có sẵn
                          </span>
                        ) : null}
                        {!provider.enabled ? (
                          <span className="text-[11px] font-medium text-muted">
                            Đang tắt
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted">
                        {provider.baseUrl}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <KeyRound className="size-3" aria-hidden />
                        <span className="font-mono">
                          {maskKey(provider.apiKey)}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{modelCount} mô hình</span>
                        {provider.note ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{provider.note}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <Switch
                        checked={provider.enabled}
                        onChange={() => onToggleProvider(provider.id)}
                        label={`${provider.enabled ? "Tắt" : "Bật"} API ${provider.name}`}
                      />
                      <Menu
                        label={`Thao tác với ${provider.name}`}
                        className="w-60"
                        trigger={({ toggle, open, ref }) => (
                          <button
                            ref={ref}
                            type="button"
                            aria-label={`Thao tác với ${provider.name}`}
                            aria-expanded={open}
                            onClick={toggle}
                            className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </button>
                        )}
                      >
                        {(close) => (
                          <>
                            <MenuItem
                              icon={<Pencil className="size-4" aria-hidden />}
                              onClick={() => {
                                setProviderDialog(provider);
                                close();
                              }}
                            >
                              Chỉnh sửa API
                            </MenuItem>
                            <MenuSeparator />
                            {provider.builtin ? (
                              <MenuItem
                                disabled
                                icon={<Trash2 className="size-4" aria-hidden />}
                              >
                                API có sẵn không thể xoá
                              </MenuItem>
                            ) : (
                              <DeleteMenuItem
                                close={close}
                                label="Xoá API"
                                onDelete={() => onDeleteProvider(provider.id)}
                              />
                            )}
                          </>
                        )}
                      </Menu>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Mô hình
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Bật, tắt hoặc thêm mô hình vào bộ chọn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModelDialog("new")}
                disabled={providers.length === 0}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">Thêm mô hình</span>
                <span className="sm:hidden">Thêm</span>
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              {models.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  Chưa có mô hình. Thêm mô hình đầu tiên để bắt đầu.
                </p>
              ) : (
                models.map((model) => {
                  const provider = providerById.get(model.providerId);
                  return (
                    <div
                      key={model.id}
                      className="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-primary">
                        <ModelIcon model={model} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              model.enabled
                                ? "text-foreground"
                                : "text-muted",
                            )}
                          >
                            {model.name}
                          </p>
                          {model.id === defaultModelId ? (
                            <span className="rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              Mặc định
                            </span>
                          ) : null}
                          {model.badge && model.badge !== "Mặc định" ? (
                            <span className="rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {model.badge}
                            </span>
                          ) : null}
                          {model.reasoning ? (
                            <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted">
                              Suy luận
                            </span>
                          ) : null}
                          {provider && !provider.enabled ? (
                            <span className="text-[11px] text-muted">
                              API đang tắt
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {provider?.name ?? "Không rõ API"}
                          {model.contextWindow
                            ? ` · ${model.contextWindow} ngữ cảnh`
                            : ""}
                          {model.description ? ` · ${model.description}` : ""}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                          {modelProtocols.find(
                            (item) => item.id === model.protocol,
                          )?.label ?? "OpenAI compatible"}{" "}
                          · {model.apiModel ?? "chưa có mã mô hình"}
                          {model.systemPrompt ? " · chỉ dẫn riêng" : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={
                            model.id === defaultModelId
                              ? `${model.name} đang là mặc định`
                              : `Đặt ${model.name} làm mặc định`
                          }
                          title={
                            model.id === defaultModelId
                              ? "Đang là mặc định"
                              : "Đặt làm mặc định"
                          }
                          onClick={() => onSetDefaultModel(model.id)}
                          className={cn(
                            "grid size-8 cursor-pointer place-items-center rounded-lg outline-hidden transition-colors",
                            model.id === defaultModelId
                              ? "text-primary hover:bg-primary-light"
                              : "text-muted hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <Star
                            className={cn(
                              "size-4",
                              model.id === defaultModelId && "fill-current",
                            )}
                            aria-hidden
                          />
                        </button>
                        <Switch
                          checked={model.enabled}
                          onChange={() => onToggleModel(model.id)}
                          label={`${model.enabled ? "Tắt" : "Bật"} mô hình ${model.name}`}
                        />
                        <Menu
                          label={`Thao tác với ${model.name}`}
                          className="w-56"
                          trigger={({ toggle, open, ref }) => (
                            <button
                              ref={ref}
                              type="button"
                              aria-label={`Thao tác với ${model.name}`}
                              aria-expanded={open}
                              onClick={toggle}
                              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem
                                icon={<ScanSearch className="size-4" aria-hidden />}
                                onClick={() => {
                                  setProbeModel(model);
                                  close();
                                }}
                              >
                                Kiểm tra khả năng
                              </MenuItem>
                              <MenuItem
                                icon={<Pencil className="size-4" aria-hidden />}
                                onClick={() => {
                                  setModelDialog(model);
                                  close();
                                }}
                              >
                                Chỉnh sửa mô hình
                              </MenuItem>
                              <MenuItem
                                icon={<Star className="size-4" aria-hidden />}
                                disabled={model.id === defaultModelId}
                                onClick={() => {
                                  onSetDefaultModel(model.id);
                                  close();
                                }}
                              >
                                {model.id === defaultModelId
                                  ? "Đang là mặc định"
                                  : "Đặt làm mặc định"}
                              </MenuItem>
                              <MenuSeparator />
                              <DeleteMenuItem
                                close={close}
                                label="Xoá mô hình"
                                onDelete={() => onDeleteModel(model.id)}
                              />
                            </>
                          )}
                        </Menu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-7 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                Kỹ năng
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {activeSkills}/{skills.length} kỹ năng đang bật. Quản lý hướng
                dẫn và bật tắt ở trang riêng.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenSkills}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover"
            >
              Mở
            </button>
          </section>

          <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <CircleAlert
              className="mt-0.5 size-4 shrink-0 text-amber-700"
              aria-hidden
            />
            <p className="text-sm text-pretty text-amber-900">
              Khoá API nằm trong cấu hình và chỉ được gửi tới máy chủ của ứng
              dụng khi gọi mô hình. Khi đưa lên mạng, hãy đặt khoá trong biến
              môi trường thay vì nhập vào trình duyệt.
            </p>
          </div>
        </div>
      </main>

      {providerDialog ? (
        <ProviderDialog
          provider={providerDialog === "new" ? null : providerDialog}
          onClose={() => setProviderDialog(null)}
          onSave={(input) => {
            onSaveProvider(
              providerDialog === "new" ? null : providerDialog.id,
              input,
            );
            setProviderDialog(null);
          }}
        />
      ) : null}

      {modelDialog ? (
        <ModelDialog
          model={modelDialog === "new" ? null : modelDialog}
          providers={providers}
          onClose={() => setModelDialog(null)}
          onContext={onModelContext}
          onSave={(input) => {
            onSaveModel(modelDialog === "new" ? null : modelDialog.id, input);
            setModelDialog(null);
          }}
        />
      ) : null}

      {probeModel ? (
        <ModelProbeDialog
          model={probeModel}
          onClose={() => setProbeModel(null)}
          onContext={onModelContext}
        />
      ) : null}
    </>
  );
}
