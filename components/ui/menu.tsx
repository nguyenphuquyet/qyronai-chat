"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface MenuProps {
  trigger: (args: {
    open: boolean;
    toggle: () => void;
    ref: RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
  label?: string;
  /** Không cho bảng menu đè lên vùng này (ví dụ khung nhập câu hỏi). */
  boundaryRef?: RefObject<HTMLElement | null>;
}

export default function Menu({
  trigger,
  children,
  align = "end",
  className,
  label = "Menu",
  boundaryRef,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight?: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !panelRef.current || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const boundary = boundaryRef?.current?.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    const anchorTop = boundary ? boundary.top : rect.top;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const openUp = panel.height > spaceBelow;
    let maxHeight: number | undefined;
    let position: { top?: number; bottom?: number };

    if (openUp) {
      // Neo đúng mép trên của nút/khung, không phụ thuộc chiều cao bảng.
      const availableAbove = Math.max(160, anchorTop - margin - gap);
      if (panel.height > availableAbove) maxHeight = availableAbove;
      position = { bottom: window.innerHeight - anchorTop + gap };
    } else {
      position = { top: rect.bottom + gap };
    }

    let left =
      align === "end"
        ? (boundary ? boundary.right : rect.right) - panel.width
        : rect.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - panel.width - margin);
    setPos({ ...position, left, maxHeight });
  }, [open, align, boundaryRef]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const close = () => setOpen(false);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => setOpen((value) => !value);
  const close = () => setOpen(false);

  return (
    <>
      {trigger({
        open,
        toggle,
        ref: triggerRef,
      })}
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              style={{
                top: pos?.top,
                bottom: pos?.bottom,
                left: pos?.left ?? -9999,
                maxHeight: pos?.maxHeight,
                overflowY: pos?.maxHeight ? "auto" : undefined,
                visibility: pos ? "visible" : "hidden",
              }}
              className={cn(
                "menu-in fixed z-[100] rounded-2xl border border-border bg-surface-overlay p-1 shadow-popover",
                className,
              )}
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function MenuItem({
  children,
  icon,
  onClick,
  danger,
  selected,
  description,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  selected?: boolean;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm outline-hidden transition-colors",
        "text-foreground hover:bg-item-hover",
        danger && "hover:bg-rose-500/10 hover:text-rose-700",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      {icon ? <span className="shrink-0 text-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        ) : null}
      </span>
      {selected ? (
        <span className="shrink-0 text-primary" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-2 text-xs text-muted">{children}</div>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
