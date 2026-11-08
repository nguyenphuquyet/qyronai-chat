"use client";

import {
  AlertCircle,
  ArrowUp,
  Brain,
  ChevronDown,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Settings2,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Menu, { MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import Switch from "@/components/ui/switch";
import ModelIcon from "@/components/model-icon";
import SkillIcon from "@/components/skill-icon";
import type {
  Attachment,
  ModelOption,
  Provider,
  Skill,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Trần kích thước để không làm nghẽn máy chủ và ngữ cảnh của mô hình. */
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 5;

interface DraftAttachment {
  id: string;
  name: string;
  size: number;
  status: "loading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Thu nhỏ ảnh trong trình duyệt để gửi và lưu nhẹ hơn. */
async function compressImage(file: File): Promise<Attachment> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không đọc được ảnh."));
    reader.readAsDataURL(file);
  });

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Không đọc được ảnh."));
      element.src = raw;
    });
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không xử lý được ảnh.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      name: file.name,
      size: file.size,
      kind: "image",
      dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    };
  } catch {
    // Ảnh lạ (SVG, HEIC…) chỉ dùng được nếu trình duyệt đọc được và mô hình hỗ trợ.
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) {
      return { name: file.name, size: file.size, kind: "image", dataUrl: raw };
    }
    throw new Error("Ảnh này chưa đọc được. Hãy dùng JPG, PNG hoặc WebP.");
  }
}

/** Tệp văn bản, PDF, Word: máy chủ trích chữ rồi trả về. */
async function readDocument(file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/attachments", {
    method: "POST",
    body: form,
  });
  const data = (await response.json().catch(() => ({}))) as {
    attachment?: Attachment;
    error?: string;
  };
  if (!response.ok || !data.attachment) {
    throw new Error(data.error ?? "Không đọc được tệp.");
  }
  return data.attachment;
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, attachments: Attachment[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  skills: Skill[];
  selectedSkillIds: string[];
  onToggleSkill: (id: string) => void;
  onManageSkills: () => void;
  models: ModelOption[];
  providers: Provider[];
  modelId: string;
  onModelChange: (id: string) => void;
  reasoningSupported: boolean;
  reasoningEnabled: boolean;
  reasoningLevel: string;
  onToggleReasoning: () => void;
  onReasoningLevelChange: (level: string) => void;
  disabled?: boolean;
}

export default function Composer({
  value,
  onChange,
  onSend,
  isGenerating,
  onStop,
  skills,
  selectedSkillIds,
  onToggleSkill,
  onManageSkills,
  models,
  providers,
  modelId,
  onModelChange,
  reasoningSupported,
  reasoningEnabled,
  reasoningLevel,
  onToggleReasoning,
  onReasoningLevelChange,
  disabled,
}: ComposerProps) {
  const reasoningLevels = ["Thấp", "Vừa", "Cao"];
  const activeModel = models.find((model) => model.id === modelId) ?? models[0];
  const modelGroups = providers
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      provider,
      items: models.filter(
        (model) => model.enabled && model.providerId === provider.id,
      ),
    }))
    .filter((group) => group.items.length > 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const selectedSkills = skills.filter(
    (skill) => skill.enabled && selectedSkillIds.includes(skill.id),
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [value]);

  const isLoadingFile = files.some((file) => file.status === "loading");
  const readyAttachments = files.flatMap((file) =>
    file.status === "ready" && file.attachment ? [file.attachment] : [],
  );
  const canSend =
    !isLoadingFile &&
    (value.trim().length > 0 || readyAttachments.length > 0);

  const addFiles = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setFileNotice(null);

    const room = Math.max(0, MAX_FILES - files.length);
    if (picked.length > room) {
      setFileNotice(`Chỉ đính kèm tối đa ${MAX_FILES} tệp mỗi câu hỏi.`);
    }

    for (const file of picked.slice(0, room)) {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setFiles((current) => [
        ...current,
        { id, name: file.name, size: file.size, status: "loading" },
      ]);

      try {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error("Tệp lớn hơn 15 MB.");
        }
        const attachment = file.type.startsWith("image/")
          ? await compressImage(file)
          : await readDocument(file);
        setFiles((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: "ready", attachment, error: undefined }
              : item,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không đọc được tệp.";
        setFiles((current) =>
          current.map((item) =>
            item.id === id ? { ...item, status: "error", error: message } : item,
          ),
        );
      }
    }
  };

  const submit = () => {
    if (!canSend) {
      if (isGenerating) onStop();
      return;
    }
    onSend(value.trim(), readyAttachments);
    setFiles([]);
    setFileNotice(null);
    if (fileRef.current) fileRef.current.value = "";
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="rounded-3xl border border-border-strong bg-surface p-2 shadow-card transition-colors focus-within:border-focus focus-within:ring-2 focus-within:ring-focus"
      >
        {selectedSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-1 pb-1.5 pt-0.5">
            {selectedSkills.map((skill) => (
              <span
                key={skill.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary-light py-1 pl-2 pr-1 text-xs font-medium text-primary"
              >
                <SkillIcon name={skill.icon} className="size-3.5 shrink-0" />
                <span className="max-w-[170px] truncate">{skill.name}</span>
                <button
                  type="button"
                  aria-label={`Bỏ kỹ năng ${skill.name}`}
                  onClick={() => onToggleSkill(skill.id)}
                  className="grid size-4 cursor-pointer place-items-center rounded text-primary/70 outline-hidden transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {files.length > 0 || fileNotice ? (
          <div className="space-y-1 px-1 pb-1.5 pt-0.5">
            {files.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {files.map((file) => (
                  <span
                    key={file.id}
                    title={file.error}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 rounded-lg border py-1 pl-2 pr-1 text-xs",
                      file.status === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-border-strong bg-background text-foreground",
                    )}
                  >
                    {file.status === "loading" ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" aria-hidden />
                    ) : file.status === "error" ? (
                      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                    ) : file.attachment?.kind === "image" ? (
                      <ImageIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-muted" aria-hidden />
                    )}
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <span className="shrink-0 tabular-nums opacity-60">
                      {file.status === "loading"
                        ? "Đang đọc…"
                        : file.status === "error"
                          ? "Lỗi"
                          : formatSize(file.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Bỏ tệp ${file.name}`}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item.id !== file.id),
                        )
                      }
                      className="grid size-5 cursor-pointer place-items-center rounded-md text-muted outline-hidden transition-colors hover:bg-foreground/8 hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {fileNotice ? (
              <p className="px-0.5 text-xs text-muted">{fileNotice}</p>
            ) : null}
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            void addFiles(event.target.files);
            // Cho phép chọn lại đúng tệp vừa bỏ.
            event.target.value = "";
          }}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          aria-label="Nhập câu hỏi cho Qyron"
          placeholder="Hỏi Qyron bất cứ điều gì…"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          className="block max-h-60 w-full resize-none bg-transparent px-2.5 pb-1 pt-2 text-base text-foreground outline-hidden placeholder:text-muted disabled:opacity-60"
        />

        <div className="flex items-end gap-1.5">
          <button
            type="button"
            aria-label="Đính kèm tệp"
            onClick={() => fileRef.current?.click()}
            className="group/attach relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Paperclip className="size-4" aria-hidden />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-primary-foreground opacity-0 shadow-popover transition-opacity group-hover/attach:opacity-100 sm:block"
            >
              Đính kèm tệp
            </span>
          </button>

          <Menu
            label="Chọn kỹ năng"
            align="start"
            className="max-h-[70vh] w-80 overflow-y-auto"
            trigger={({ toggle, open, ref }) => (
              <button
                ref={ref}
                type="button"
                aria-expanded={open}
                aria-label={
                  selectedSkills.length > 0
                    ? `Chọn kỹ năng, ${selectedSkills.length} đã chọn`
                    : "Chọn kỹ năng"
                }
                onClick={toggle}
                className={cn(
                  "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl outline-hidden transition-colors",
                  selectedSkills.length > 0
                    ? "bg-primary-light text-primary hover:bg-primary/15"
                    : "text-muted hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <WandSparkles className="size-4" aria-hidden />
                {selectedSkills.length > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                    {selectedSkills.length}
                  </span>
                ) : null}
              </button>
            )}
          >
            {(close) => (
              <div className="p-1">
                <MenuLabel>Kỹ năng cho câu hỏi này</MenuLabel>
                {skills.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted">
                    Chưa có kỹ năng nào.
                  </p>
                ) : (
                  skills.map((skill) => (
                    <MenuItem
                      key={skill.id}
                      selected={selectedSkillIds.includes(skill.id)}
                      disabled={!skill.enabled}
                      icon={
                        <SkillIcon name={skill.icon} className="size-4" />
                      }
                      description={
                        skill.enabled
                          ? skill.description
                          : "Đang tắt · bật trong trang Kỹ năng"
                      }
                      onClick={() => onToggleSkill(skill.id)}
                    >
                      {skill.name}
                    </MenuItem>
                  ))
                )}
                <MenuSeparator />
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onManageSkills();
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted outline-hidden transition-colors hover:text-foreground"
                  >
                    <Settings2 className="size-3.5" aria-hidden />
                    Quản lý
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="cursor-pointer text-xs font-semibold text-primary outline-hidden hover:underline"
                  >
                    Xong
                  </button>
                </div>
              </div>
            )}
          </Menu>

          <Menu
            label="Chọn mô hình"
            align="start"
            className="max-h-[70vh] w-80 overflow-y-auto"
            trigger={({ toggle, open, ref }) => (
              <button
                ref={ref}
                type="button"
                aria-expanded={open}
                aria-label={`Mô hình: ${activeModel?.name ?? "Chưa có mô hình"}`}
                onClick={toggle}
                className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-foreground/5"
              >
                <ModelIcon
                  model={activeModel}
                  className="size-4 shrink-0 text-primary"
                />
                <span className="hidden max-w-[120px] truncate sm:inline">
                  {activeModel?.name ?? "Chưa có mô hình"}
                </span>
                <ChevronDown className="hidden size-3 text-muted sm:block" aria-hidden />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Mô hình</MenuLabel>
                {modelGroups.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted">
                    Chưa có mô hình nào đang bật.
                  </p>
                ) : (
                  modelGroups.map((group) => (
                    <div key={group.provider.id} className="mt-1 first:mt-0">
                      <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                        {group.provider.name}
                      </p>
                      {group.items.map((model) => (
                        <MenuItem
                          key={model.id}
                          icon={<ModelIcon model={model} className="size-4" />}
                          selected={model.id === modelId}
                          description={model.description}
                          onClick={() => {
                            onModelChange(model.id);
                            close();
                          }}
                        >
                          {model.name}
                          {model.badge ? (
                            <span className="ml-2 rounded-md bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {model.badge}
                            </span>
                          ) : null}
                          {model.reasoning ? (
                            <span className="ml-1.5 rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted">
                              Suy luận
                            </span>
                          ) : null}
                        </MenuItem>
                      ))}
                    </div>
                  ))
                )}
              </>
            )}
          </Menu>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {reasoningSupported ? (
              <Menu
              label="Tuỳ chọn suy luận"
              className="w-64"
              trigger={({ toggle, open, ref }) => (
                <button
                  ref={ref}
                  type="button"
                  aria-expanded={open}
                  aria-label={`Suy luận: ${reasoningEnabled ? reasoningLevel : "đang tắt"}`}
                  onClick={toggle}
                  className={cn(
                    "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-sm font-medium outline-hidden transition-colors",
                    reasoningEnabled
                      ? "text-primary hover:bg-primary-light"
                      : "text-muted hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  <Brain className="size-4" aria-hidden />
                  <span className="hidden sm:inline">
                    {reasoningEnabled
                      ? `Suy luận · ${reasoningLevel}`
                      : "Suy luận"}
                  </span>
                  <ChevronDown
                    className="hidden size-3 opacity-60 sm:block"
                    aria-hidden
                  />
                </button>
              )}
            >
              {() => (
                <div className="p-1">
                  <MenuLabel>Suy luận</MenuLabel>
                  <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        Bật suy luận
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Dành thêm thời gian để nghĩ trước khi trả lời.
                      </p>
                    </div>
                    <Switch
                      checked={reasoningEnabled}
                      onChange={onToggleReasoning}
                      label="Bật suy luận"
                    />
                  </div>

                  <div
                    className={cn(
                      "mt-1 transition-opacity",
                      !reasoningEnabled && "pointer-events-none opacity-45",
                    )}
                  >
                    <p className="px-3 pb-1.5 text-xs text-muted">
                      Mức suy luận
                    </p>
                    <div className="grid grid-cols-3 gap-1 px-1">
                      {reasoningLevels.map((level) => (
                        <button
                          key={level}
                          type="button"
                          disabled={!reasoningEnabled}
                          aria-pressed={reasoningLevel === level}
                          onClick={() => onReasoningLevelChange(level)}
                          className={cn(
                            "h-8 cursor-pointer rounded-lg text-xs font-medium outline-hidden transition-colors",
                            reasoningLevel === level
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted hover:text-foreground",
                          )}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="px-3 pb-1 pt-2.5 text-[11px] text-muted">
                    Áp dụng cho mô hình đang chọn.
                  </p>
                </div>
              )}
            </Menu>
          ) : null}

          <button
            type={isGenerating ? "button" : "submit"}
            onClick={isGenerating ? onStop : undefined}
            aria-label={isGenerating ? "Dừng trả lời" : "Gửi"}
            disabled={!isGenerating && !canSend}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isGenerating ? (
              <Square className="size-3.5 fill-current" aria-hidden />
            ) : (
              <ArrowUp className="size-4" aria-hidden />
            )}
          </button>
          </div>
        </div>
      </form>

      <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs text-muted">
        <p>Qyron có thể mắc lỗi. Kiểm tra thông tin quan trọng.</p>
        <p className="hidden shrink-0 sm:block">
          Enter để gửi · Shift + Enter xuống dòng
        </p>
      </div>
    </div>
  );
}
