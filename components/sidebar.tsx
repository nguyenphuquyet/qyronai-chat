"use client";

import {
  ChevronDown,
  ChevronsUpDown,
  Copy,
  LogOut,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useState, type RefObject } from "react";
import Image from "next/image";
import Avatar from "@/components/ui/avatar";
import Menu, { MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { useAutohideScrollbar } from "@/components/ui/scroll";
import type {
  AppView,
  Conversation,
  ConversationGroup,
} from "@/lib/types";
import { cn, truncate } from "@/lib/utils";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  view: AppView;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenSkills: () => void;
  onOpenAdmin: () => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onNotify: (message: string) => void;
  onLogout: () => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  skillCount: number;
  enabledSkillCount: number;
  providerCount: number;
  user: {
    name: string;
    email: string;
    plan: string;
    role: "admin" | "user";
    avatar?: string;
  };
  /** Chỉ hiện mục Quản trị cho tài khoản có quyền. */
  canAdmin: boolean;
  onCloseMobile?: () => void;
}

const groupOrder: ConversationGroup[] = ["Hôm nay", "Hôm qua", "7 ngày trước"];

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-4 first:mt-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium uppercase tracking-wide text-muted outline-hidden transition-colors hover:bg-item-hover hover:text-foreground"
      >
        {label}
        <span className="text-[11px] font-normal normal-case tabular-nums text-muted/80">
          {count}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            !open && "-rotate-90",
          )}
        />
      </button>
      <div
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="flex min-h-0 flex-col gap-1 overflow-hidden pt-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function DeleteMenuItem({
  close,
  onDelete,
}: {
  close: () => void;
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
      {armed ? "Bấm lần nữa để xoá" : "Xoá cuộc trò chuyện"}
    </MenuItem>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onTogglePin,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 w-full cursor-pointer items-center rounded-lg pl-2.5 pr-9 text-left text-sm outline-hidden transition-colors",
          active
            ? "bg-primary-light font-medium text-primary"
            : "text-foreground/75 hover:bg-item-hover hover:text-foreground",
        )}
      >
        <span className="truncate">{conversation.title}</span>
        {conversation.pinned ? (
          <Pin
            className={cn(
              "ml-auto size-3 shrink-0 -rotate-45",
              active ? "text-primary/70" : "text-muted",
            )}
            aria-label="Đã ghim"
          />
        ) : null}
      </button>

      <div
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 transition-opacity",
          active
            ? "opacity-100"
            : "opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100 lg:group-focus-within/row:opacity-100",
        )}
      >
        <Menu
          label={`Thao tác với ${conversation.title}`}
          className="w-56"
          trigger={({ toggle, open, ref }) => (
            <button
              ref={ref}
              type="button"
              aria-label={`Thao tác với ${conversation.title}`}
              aria-expanded={open}
              onClick={toggle}
              className="grid size-7 cursor-pointer place-items-center rounded-md text-muted outline-hidden transition-colors hover:bg-foreground/8 hover:text-foreground"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={
                  conversation.pinned ? (
                    <PinOff className="size-4" aria-hidden />
                  ) : (
                    <Pin className="size-4" aria-hidden />
                  )
                }
                onClick={() => {
                  onTogglePin();
                  close();
                }}
              >
                {conversation.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
              </MenuItem>
              <MenuSeparator />
              <DeleteMenuItem close={close} onDelete={onDelete} />
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

export default function Sidebar({
  conversations,
  activeId,
  view,
  query,
  onQueryChange,
  onSelect,
  onNew,
  onOpenSkills,
  onOpenAdmin,
  onTogglePin,
  onDelete,
  onNotify,
  onLogout,
  onEditProfile,
  onOpenSettings,
  searchRef,
  skillCount,
  enabledSkillCount,
  providerCount,
  user,
  canAdmin,
  onCloseMobile,
}: SidebarProps) {
  const navRef = useAutohideScrollbar<HTMLElement>();

  const normalized = query.trim().toLocaleLowerCase("vi");
  const visible = conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase("vi").includes(normalized),
  );
  const pinned = visible.filter((conversation) => conversation.pinned);
  const rest = visible.filter((conversation) => !conversation.pinned);

  return (
    <div className="flex h-full min-h-0 w-64 shrink-0 flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <button
          type="button"
          className="sr-only"
          onClick={onCloseMobile}
          aria-label="Đóng menu"
        >
          Đóng menu
        </button>
        <Image
          src="/qyron-logo.png"
          alt="Qyron AI"
          width={32}
          height={32}
          priority
          className="size-8 shrink-0 rounded-full"
        />
        <span className="text-[15px] font-semibold tracking-tight">Qyron</span>
        <span className="text-xs font-medium text-muted">AI</span>
      </div>

      <div className="space-y-2 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover"
        >
          <Plus className="size-4" aria-hidden />
          Cuộc trò chuyện mới
        </button>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Tìm cuộc trò chuyện"
            aria-label="Tìm cuộc trò chuyện"
            className="h-10 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-16 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Xoá tìm kiếm"
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted outline-hidden transition-colors hover:bg-foreground/8 hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      <div className="space-y-1 px-3 pb-2">
        <button
          type="button"
          onClick={onOpenSkills}
          aria-current={view === "skills" ? "page" : undefined}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm outline-hidden transition-colors",
            view === "skills"
              ? "bg-primary-light font-medium text-primary"
              : "text-foreground/75 hover:bg-item-hover hover:text-foreground",
          )}
        >
          <Sparkles className="size-4 shrink-0" aria-hidden />
          <span>Kỹ năng</span>
          <span
            className={cn(
              "ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
              view === "skills"
                ? "bg-primary/10 text-primary"
                : "bg-background text-muted",
            )}
          >
            {enabledSkillCount}/{skillCount}
          </span>
        </button>

        {canAdmin ? (
          <button
            type="button"
            onClick={onOpenAdmin}
            aria-current={view === "admin" ? "page" : undefined}
            className={cn(
              "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm outline-hidden transition-colors",
              view === "admin"
                ? "bg-primary-light font-medium text-primary"
                : "text-foreground/75 hover:bg-item-hover hover:text-foreground",
            )}
          >
            <Settings2 className="size-4 shrink-0" aria-hidden />
            <span>Quản trị</span>
            <span
              className={cn(
                "ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                view === "admin"
                  ? "bg-primary/10 text-primary"
                  : "bg-background text-muted",
              )}
            >
              {providerCount} API
            </span>
          </button>
        ) : null}
      </div>

      <nav
        ref={navRef}
        aria-label="Danh sách cuộc trò chuyện"
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-1"
      >
        {conversations.length === 0 ? (
          <p className="px-2.5 py-6 text-sm text-pretty text-muted">
            Chưa có cuộc trò chuyện nào. Bắt đầu bằng một câu hỏi ở ô nhập bên
            dưới.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-2.5 py-6 text-sm text-muted">
            Không có cuộc trò chuyện nào khớp{" "}
            <span className="text-foreground">“{truncate(query, 24)}”</span>.{" "}
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                searchRef.current?.focus();
              }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Xoá tìm kiếm
            </button>
          </p>
        ) : (
          <>
            {pinned.length > 0 ? (
              <Group label="Đã ghim" count={pinned.length}>
                {pinned.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeId}
                    onSelect={() => onSelect(conversation.id)}
                    onTogglePin={() => onTogglePin(conversation.id)}
                    onDelete={() => onDelete(conversation.id)}
                  />
                ))}
              </Group>
            ) : null}

            {groupOrder.map((group) => {
              const items = rest.filter(
                (conversation) => conversation.group === group,
              );
              if (items.length === 0) return null;
              return (
                <Group key={group} label={group} count={items.length}>
                  {items.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onSelect={() => onSelect(conversation.id)}
                      onTogglePin={() => onTogglePin(conversation.id)}
                      onDelete={() => onDelete(conversation.id)}
                    />
                  ))}
                </Group>
              );
            })}
          </>
        )}
      </nav>

      <div className="shrink-0 px-3 pb-3 pt-2">
        <Menu
          align="start"
          label="Tài khoản"
          className="w-64"
          trigger={({ toggle, open, ref }) => (
            <button
              ref={ref}
              type="button"
              aria-label={`Tài khoản của ${user.name}`}
              aria-expanded={open}
              onClick={toggle}
              className="flex h-10 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl px-1 text-left outline-hidden transition-colors hover:bg-item-hover"
            >
              <Avatar name={user.name} src={user.avatar} seed={user.email} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {user.name}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuLabel>
                <span className="block truncate text-xs text-muted">
                  {user.email}
                </span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="size-3" aria-hidden />
                  {user.role === "admin" ? "Quản trị viên" : "Thành viên"}
                </span>
              </MenuLabel>
              <MenuSeparator />
              <MenuItem
                icon={<UserRound className="size-4" aria-hidden />}
                onClick={() => {
                  close();
                  onEditProfile();
                }}
              >
                Chỉnh sửa hồ sơ
              </MenuItem>
              <MenuItem
                icon={<Settings2 className="size-4" aria-hidden />}
                onClick={() => {
                  close();
                  onOpenSettings();
                }}
              >
                Cài đặt
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Copy className="size-4" aria-hidden />}
                onClick={() => {
                  navigator.clipboard?.writeText(user.email);
                  onNotify("Đã sao chép email");
                  close();
                }}
              >
                Sao chép email
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<LogOut className="size-4" aria-hidden />}
                onClick={() => {
                  close();
                  onLogout();
                }}
              >
                Đăng xuất
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}
