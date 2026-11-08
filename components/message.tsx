"use client";

import {
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  ImageIcon,
  LoaderCircle,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { useState, useMemo } from "react";
import { BlockView } from "@/components/message-blocks";
import { markdownToBlocks } from "@/lib/markdown";
import type { Message, Step, StepStatus } from "@/lib/types";
import { cn, plainTextOfMessage } from "@/lib/utils";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <LoaderCircle
        className="mt-0.5 size-4 shrink-0 animate-spin text-muted motion-reduce:animate-none"
        aria-hidden
      />
    );
  }
  if (status === "error") {
    return (
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-red-600"
        aria-hidden
      />
    );
  }
  return (
    <Check
      className="mt-0.5 size-4 shrink-0 text-muted"
      aria-hidden
    />
  );
}

function Process({
  steps,
  reasoning,
  thinking,
}: {
  steps: Step[];
  reasoning?: string;
  thinking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const running = steps.find((step) => step.status === "running");

  const label = thinking
    ? (running?.label ?? (reasoning ? "Đang suy nghĩ" : "Đang xử lý"))
    : reasoning
      ? "Quá trình suy nghĩ"
      : "Quá trình xử lý";

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md text-sm text-muted outline-hidden transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-90",
          )}
          aria-hidden
        />
        {label}
        {thinking && !open ? (
          <LoaderCircle
            className="size-3.5 shrink-0 animate-spin text-muted motion-reduce:animate-none"
            aria-hidden
          />
        ) : null}
      </button>

      <div
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {steps.length > 0 ? (
            <ul className="mb-3 ml-[7px] mt-1 space-y-3 border-l border-border-strong pl-5">
              {steps.map((step, index) => (
                <li key={index} className="flex gap-2">
                  <StepIcon status={step.status} />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{step.label}</p>
                    {step.detail ? (
                      <p className="text-xs text-muted">{step.detail}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {reasoning ? (
            <div className="mb-3 ml-[7px] mt-2 border-l border-border-strong pl-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Suy nghĩ của mô hình
              </p>
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-pretty text-muted [overflow-wrap:anywhere]">
                {reasoning}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group/action relative grid size-8 cursor-pointer place-items-center rounded-md text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-primary-foreground opacity-0 shadow-popover transition-opacity group-hover/action:opacity-100 group-focus-visible/action:opacity-100 sm:block"
      >
        {label}
      </span>
    </button>
  );
}

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  onCopy: (text: string) => void;
  onRegenerate: (id: string) => void;
  onRetry: (id: string) => void;
  onSuggestion: (text: string) => void;
}

export default function MessageItem({
  message,
  isLast,
  onCopy,
  onRegenerate,
  onRetry,
  onSuggestion,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const state = message.state ?? "done";
  const isThinking = state === "thinking";
  const isStreaming = state === "streaming";
  const isError = state === "error";
  const isFinished = state === "done" || state === "stopped";
  const markdown = useMemo(
    () =>
      message.role === "assistant" && message.text && !isError
        ? markdownToBlocks(message.text)
        : [],
    [isError, message.role, message.text],
  );

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.attachments?.length ? (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 sm:max-w-[75%]">
            {message.attachments.map((file) => (
              <span
                key={`${file.name}-${file.size}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-card"
              >
                {file.kind === "image" ? (
                  <ImageIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted" aria-hidden />
                )}
                <span className="max-w-[200px] truncate font-medium">
                  {file.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatFileSize(file.size)}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        {message.text ? (
          <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-3xl bg-surface px-4 py-2.5 text-base text-pretty text-foreground shadow-card ring-1 ring-black/3 [overflow-wrap:anywhere] sm:max-w-[75%]">
            {message.text}
          </p>
        ) : null}
      </div>
    );
  }

  const copy = () => {
    const text = plainTextOfMessage(
      message.text,
      message.blocks as unknown as { type: string }[] | undefined,
    );
    onCopy(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group/msg max-w-[62ch]">
      {message.skills?.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary-light px-1.5 py-0.5 text-xs font-medium text-primary">
            <Sparkles className="size-3" aria-hidden />
            Đã dùng
          </span>
          {message.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-border-strong bg-surface px-1.5 py-0.5 text-xs text-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      {message.steps?.length || message.reasoning ? (
        <Process
          steps={message.steps ?? []}
          reasoning={message.reasoning}
          thinking={!isFinished && !isError}
        />
      ) : null}

      {isError && message.error ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-red-600">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {message.error.title}
          </p>
          <p className="max-w-[55ch] text-sm text-pretty text-muted">
            {message.error.detail}
          </p>
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            className="mt-1 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover"
          >
            <RotateCw className="size-4" aria-hidden />
            Thử lại
          </button>
        </div>
      ) : null}

      {isThinking && !message.steps?.length && !message.reasoning ? (
        <div className="flex items-center gap-2 py-1 text-sm text-muted">
          Đang soạn câu trả lời
          <span className="flex items-end gap-1" aria-hidden>
            <span className="typing-dot size-1 rounded-full bg-muted" />
            <span className="typing-dot size-1 rounded-full bg-muted" />
            <span className="typing-dot size-1 rounded-full bg-muted" />
          </span>
        </div>
      ) : null}

      {markdown.length > 0 ? (
        <div className="space-y-3.5">
          {markdown.map((block, index) => (
            <BlockView key={index} block={block} />
          ))}
          {isStreaming ? (
            <span
              className="inline-block h-[1.1em] w-2 animate-pulse rounded-sm bg-foreground/30 align-text-bottom"
              aria-hidden
            />
          ) : null}
        </div>
      ) : message.blocks?.length && !isError ? (
        <div className="space-y-3.5">
          {message.blocks.map((block, index) => (
            <BlockView key={index} block={block} />
          ))}
        </div>
      ) : null}

      {isFinished ? (
        <div
          className={cn(
            "flex items-center gap-1 pt-1.5 transition-opacity",
            isLast
              ? "opacity-100"
              : "opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100",
          )}
          style={{ marginLeft: -8 }}
        >
          <ActionButton label={copied ? "Đã sao chép" : "Sao chép"} onClick={copy}>
            {copied ? (
              <Check className="size-4 text-emerald-600" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
          </ActionButton>
          <ActionButton
            label="Tạo lại câu trả lời"
            onClick={() => onRegenerate(message.id)}
          >
            <RotateCw className="size-4" aria-hidden />
          </ActionButton>
          {state === "stopped" ? (
            <span className="ml-1 text-xs text-muted">Đã dừng giữa chừng</span>
          ) : null}
        </div>
      ) : null}

      {isLast && state === "done" && message.suggestions?.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted">Hỏi tiếp</p>
          {message.suggestions.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="block w-fit max-w-full cursor-pointer rounded-xl border border-border-strong bg-surface px-3 py-2 text-left text-sm text-foreground outline-hidden transition-colors hover:bg-button-hover"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
