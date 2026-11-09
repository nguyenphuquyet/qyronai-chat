"use client";

import { Check, CircleAlert, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Block } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Xử lý **đậm**, *nghiêng*, `mã` và liên kết an toàn. */
export function Inline({ text }: { text: string }) {
  const parts = text
    .split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g)
    .filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={index}
              className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          const href = link[2];
          if (/^(https?:\/\/|mailto:)/i.test(href)) {
            return (
              <a
                key={index}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                {link[1]}
              </a>
            );
          }
          return <span key={index}>{link[1]}</span>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function isNegative(value: string) {
  return value.trim().startsWith("−") || value.trim().startsWith("-");
}

function looksNumeric(value: string) {
  return /^[+\-−]?[\d.,]/.test(value.trim());
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="overflow-clip rounded-2xl border border-border-strong bg-surface">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 py-1.5 pl-4 pr-2 backdrop-blur-md">
        <span className="font-mono text-xs text-muted">{lang}</span>
        <button
          type="button"
          aria-label={copied ? "Đã sao chép mã" : "Sao chép mã"}
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Đã chép" : "Sao chép"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-foreground">{code}</code>
      </pre>
    </div>
  );
}

function TableBlock({ head, rows }: { head: string[]; rows: string[][] }) {
  const numeric = head.map((_, column) =>
    rows.every((row) => looksNumeric(row[column] ?? "")),
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border-strong bg-surface shadow-card ring-1 ring-black/3">
      <table className="w-full min-w-[340px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-strong bg-background/60">
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  "px-3 py-2.5 text-xs font-medium tracking-wide text-muted",
                  numeric[index] ? "text-right" : "text-left",
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border last:border-b-0"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "px-3 py-2.5 align-top text-foreground",
                    numeric[cellIndex] ? "text-right tabular-nums" : "text-left",
                    isNegative(cell) && "font-medium text-rose-700",
                  )}
                >
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case "p":
      return (
        <p className="max-w-[62ch] whitespace-pre-wrap text-base text-pretty">
          <Inline text={block.text} />
        </p>
      );
    case "h":
      return (
        <h3 className="max-w-[62ch] whitespace-pre-wrap pt-2 text-base font-semibold text-foreground">
          <Inline text={block.text} />
        </h3>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          className={cn(
            "max-w-[62ch] space-y-1.5 pl-5 text-base text-pretty marker:text-muted",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <Inline text={item} />
            </li>
          ))}
        </ListTag>
      );
    }
    case "quote":
      return (
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card ring-1 ring-black/3">
          <p className="max-w-[62ch] whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {block.text}
          </p>
        </div>
      );
    case "code":
      return <CodeBlock lang={block.lang} code={block.code} />;
    case "table":
      return <TableBlock head={block.head} rows={block.rows} />;
    case "note":
      return (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-amber-700"
            aria-hidden
          />
          <p className="max-w-[62ch] text-sm text-pretty text-amber-900">
            <Inline text={block.text} />
          </p>
        </div>
      );
    default:
      return null;
  }
}
