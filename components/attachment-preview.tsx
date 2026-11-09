"use client";

import {
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileType2,
  ImageIcon,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentExt(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

const CODE_EXT = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp", "cs", "go", "rs",
  "php", "rb", "swift", "kt", "sql", "sh", "bat", "ps1", "html", "htm", "css",
  "scss", "xml", "yml", "yaml", "toml", "ini", "env",
]);
const SHEET_EXT = new Set(["csv", "tsv", "json", "jsonl"]);

function docStyle(ext: string) {
  if (ext === "pdf") return { Icon: FileType2, tint: "bg-rose-50 text-rose-600", label: "PDF" };
  if (ext === "docx" || ext === "doc") return { Icon: FileText, tint: "bg-blue-50 text-blue-600", label: "Word" };
  if (CODE_EXT.has(ext)) return { Icon: FileCode2, tint: "bg-primary-light text-primary", label: ext.toUpperCase() };
  if (SHEET_EXT.has(ext)) return { Icon: FileSpreadsheet, tint: "bg-emerald-50 text-emerald-600", label: ext.toUpperCase() };
  return { Icon: FileText, tint: "bg-background text-muted", label: ext ? ext.toUpperCase() : "Tệp" };
}

interface CardProps {
  attachment: Attachment;
  onOpen: () => void;
  onRemove?: () => void;
}

export function AttachmentPreviewCard({ attachment, onOpen, onRemove }: CardProps) {
  const ext = attachmentExt(attachment.name);
  const { Icon, tint, label } = docStyle(ext);
  const isImage = attachment.kind === "image" && attachment.dataUrl;

  return (
    <div className="group/card relative inline-flex max-w-full items-center rounded-xl border border-border-strong bg-surface p-1.5 pr-2.5 shadow-card ring-1 ring-black/3 transition-colors hover:border-focus/50">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Xem trước ${attachment.name}`}
        className="flex min-w-0 cursor-pointer items-center gap-2 outline-hidden"
      >
        <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background">
          {isImage ? (
            <>
              <img
                src={attachment.dataUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-200 group-hover/card:scale-105"
              />
              <span className="absolute inset-0 grid place-items-center bg-foreground/0 text-transparent transition-colors group-hover/card:bg-foreground/35 group-hover/card:text-primary-foreground">
                <ZoomIn className="size-4" aria-hidden />
              </span>
            </>
          ) : (
            <span className={cn("grid h-full w-full place-items-center", tint)}>
              <Icon className="size-5" aria-hidden />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="max-w-[160px] truncate text-xs font-medium text-foreground">
            {attachment.name}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="rounded bg-background px-1 py-px font-medium uppercase tracking-wide">
              {isImage ? "Ảnh" : label}
            </span>
            <span className="tabular-nums">{formatAttachmentSize(attachment.size)}</span>
          </span>
        </span>
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Bỏ tệp ${attachment.name}`}
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-foreground text-primary-foreground shadow-card outline-hidden transition-colors hover:bg-error"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

interface LightboxProps {
  attachment: Attachment;
  onClose: () => void;
}

export function AttachmentLightbox({ attachment, onClose }: LightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ext = attachmentExt(attachment.name);
  const { Icon, tint, label } = docStyle(ext);
  const isImage = attachment.kind === "image" && attachment.dataUrl;
  const extracted = !isImage && (ext === "pdf" || ext === "docx" || ext === "doc");

  useEffect(() => {
    closeRef.current?.focus();
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

  const download = () => {
    let href = "";
    let filename = attachment.name;
    if (isImage) {
      href = attachment.dataUrl ?? "";
    } else if (attachment.text) {
      href = URL.createObjectURL(new Blob([attachment.text], { type: "text/plain;charset=utf-8" }));
      if (extracted) filename = `${attachment.name.replace(/\.[^.]+$/, "")}.txt`;
    }
    if (!href) return;
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    if (href.startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Xem tệp ${attachment.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div className="fade-in absolute inset-0 bg-foreground/45 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-in relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-modal">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className={cn("grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg", isImage ? "border border-border bg-background" : tint)}>
            {isImage ? (
              <img src={attachment.dataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon className="size-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{attachment.name}</p>
            <p className="text-xs text-muted">
              {isImage ? "Ảnh" : label} · {formatAttachmentSize(attachment.size)}
            </p>
          </div>
          {isImage ? (
            <button
              type="button"
              aria-label={zoomed ? "Thu nhỏ" : "Phóng to"}
              onClick={() => setZoomed((value) => !value)}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {zoomed ? <ZoomOut className="size-4" aria-hidden /> : <ZoomIn className="size-4" aria-hidden />}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Tải tệp xuống"
            onClick={download}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <Download className="size-4" aria-hidden />
          </button>
          <button
            ref={closeRef}
            type="button"
            aria-label="Đóng xem trước"
            onClick={onClose}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
          {isImage ? (
            <div className="grid min-h-[40vh] place-items-center">
              <img
                src={attachment.dataUrl}
                alt={attachment.name}
                onClick={() => setZoomed((value) => !value)}
                className={cn(
                  "rounded-lg shadow-card transition-[max-width,max-height] duration-200",
                  zoomed ? "max-w-none cursor-zoom-out" : "max-h-[62vh] max-w-full cursor-zoom-in object-contain",
                )}
              />
            </div>
          ) : attachment.text ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 font-mono text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {attachment.text}
            </pre>
          ) : (
            <div className="grid min-h-[30vh] place-items-center text-sm text-muted">
              Không có nội dung xem trước cho tệp này.
            </div>
          )}
        </div>

        {extracted ? (
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
            Xem trước dạng chữ đã trích từ tệp; tải xuống để giữ bản gốc.
          </p>
        ) : null}
      </div>
    </div>
  );
}