"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  tooltipSide?: "top" | "bottom";
  children: ReactNode;
  type?: "button" | "submit";
}

export default function IconButton({
  label,
  onClick,
  active,
  className,
  tooltipSide = "bottom",
  children,
  type = "button",
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "group/tip relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground",
        active && "text-primary hover:text-primary",
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-[90] hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-primary-foreground opacity-0 shadow-popover transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100 sm:block",
          tooltipSide === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
        )}
      >
        {label}
      </span>
    </button>
  );
}
