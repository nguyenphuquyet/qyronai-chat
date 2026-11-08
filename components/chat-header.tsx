"use client";

import {
  Copy,
  Download,
  Link2,
  Menu as MenuIcon,
  MoreHorizontal,
  Share2,
  Star,
} from "lucide-react";
import IconButton from "@/components/ui/icon-button";
import Menu, {
  MenuItem,
  MenuSeparator,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  title: string;
  subtitle: string;
  onOpenSidebar: () => void;
  saved: boolean;
  onToggleSaved: () => void;
  shareUrl: string;
  onNotify: (message: string) => void;
}

export default function ChatHeader({
  title,
  subtitle,
  onOpenSidebar,
  saved,
  onToggleSaved,
  shareUrl,
  onNotify,
}: ChatHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-6">
      <IconButton
        label="Mở menu"
        onClick={onOpenSidebar}
        className="lg:hidden"
      >
        <MenuIcon className="size-4" aria-hidden />
      </IconButton>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-foreground">
          {title}
        </h1>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <IconButton
          label={saved ? "Bỏ lưu cuộc trò chuyện" : "Lưu cuộc trò chuyện"}
          onClick={onToggleSaved}
          active={saved}
        >
          <Star
            className={cn(
              "size-4",
              saved && "fill-amber-400 text-amber-500",
            )}
            aria-hidden
          />
        </IconButton>

        <Menu
          label="Chia sẻ"
          className="w-80"
          trigger={({ toggle, open, ref }) => (
            <button
              ref={ref}
              type="button"
              aria-label="Chia sẻ cuộc trò chuyện"
              aria-expanded={open}
              onClick={toggle}
              className="group/tip relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <Share2 className="size-4" aria-hidden />
            </button>
          )}
        >
          {(close) => (
            <div className="space-y-3 p-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Chia sẻ cuộc trò chuyện
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Ai có liên kết đều xem được nội dung này.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  aria-label="Liên kết chia sẻ"
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-background px-2.5 text-xs text-foreground outline-hidden focus:border-focus focus:ring-2 focus:ring-focus"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl);
                    onNotify("Đã sao chép liên kết");
                    close();
                  }}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover"
                >
                  <Copy className="size-3.5" aria-hidden />
                  Chép
                </button>
              </div>
            </div>
          )}
        </Menu>

        <Menu
          label="Thêm"
          className="w-56"
          trigger={({ toggle, open, ref }) => (
            <button
              ref={ref}
              type="button"
              aria-label="Thêm thao tác"
              aria-expanded={open}
              onClick={toggle}
              className="group/tip relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Download className="size-4" aria-hidden />}
                onClick={() => {
                  onNotify("Đang chuẩn bị bản PDF…");
                  close();
                }}
              >
                Xuất bản PDF
              </MenuItem>
              <MenuItem
                icon={<Link2 className="size-4" aria-hidden />}
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                  onNotify("Đã sao chép liên kết");
                  close();
                }}
              >
                Sao chép liên kết
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Share2 className="size-4" aria-hidden />}
                onClick={() => {
                  onNotify("Đã mở hộp thoại chia sẻ (bản demo)");
                  close();
                }}
              >
                Chia sẻ
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
