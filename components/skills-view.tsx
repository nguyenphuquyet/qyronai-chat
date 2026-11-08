"use client";

import {
  ArrowLeft,
  ChevronDown,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import IconButton from "@/components/ui/icon-button";
import Switch from "@/components/ui/switch";
import { useAutohideScrollbar } from "@/components/ui/scroll";
import SkillIcon from "@/components/skill-icon";
import type { Skill, SkillInput } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SkillsViewProps {
  skills: Skill[];
  /** Chỉ quản trị viên được sửa bộ kỹ năng dùng chung. */
  canManage: boolean;
  onToggleSkill: (id: string) => void;
  onCreateSkill: (input: SkillInput) => void;
  onUpdateSkill: (id: string, input: SkillInput) => void;
  onDeleteSkill: (id: string) => void;
  onUseSkill: (id: string) => void;
  onBack: () => void;
  onOpenSidebar: () => void;
}

const categoryOptions = [
  "Sáng tạo & Thiết kế",
  "Tài liệu",
  "Phát triển",
  "Giao tiếp",
  "Học tập",
  "Kỹ năng chung",
  "Khác",
];

function SkillCard({
  skill,
  expanded,
  confirmDelete,
  canManage,
  onToggle,
  onExpand,
  onUse,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  expanded: boolean;
  confirmDelete: boolean;
  canManage: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-card transition-colors",
        expanded ? "border-border-strong" : "border-border",
      )}
    >
      <div className="flex items-start gap-2.5 p-3.5 sm:gap-3 sm:p-4">
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
            skill.enabled
              ? "bg-primary-light text-primary"
              : "bg-background text-muted",
          )}
        >
          <SkillIcon name={skill.icon} className="size-5" />
        </div>

        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="min-w-0 flex-1 cursor-pointer text-left outline-hidden"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "text-sm font-semibold",
                skill.enabled ? "text-foreground" : "text-muted",
              )}
            >
              {skill.name}
            </span>
            {!skill.builtin ? (
              <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Của bạn
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-sm text-pretty text-muted">
            {skill.description}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{skill.category}</span>
            <span aria-hidden>·</span>
            <span>{skill.uses} lượt dùng</span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {canManage ? (
            <Switch
              checked={skill.enabled}
              onChange={onToggle}
              label={`${skill.enabled ? "Tắt" : "Bật"} kỹ năng ${skill.name}`}
            />
          ) : null}
          <button
            type="button"
            aria-label={expanded ? "Thu gọn kỹ năng" : "Xem chi tiết kỹ năng"}
            aria-expanded={expanded}
            onClick={onExpand}
            className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <div
        inert={!expanded}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-4 pb-4 pt-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Hướng dẫn cho Qyron
            </p>
            <p className="mt-1.5 max-w-[62ch] whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {skill.instructions}
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUse}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover"
              >
                <Sparkles className="size-4" aria-hidden />
                Dùng trong chat
              </button>
              {canManage ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-button-hover"
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Chỉnh sửa
                </button>
              ) : null}
              {canManage && !skill.builtin ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className={cn(
                    "ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium outline-hidden transition-colors",
                    confirmDelete
                      ? "bg-danger-bg text-danger"
                      : "text-muted hover:bg-danger-bg hover:text-danger",
                  )}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  {confirmDelete ? "Bấm lần nữa để xoá" : "Xoá"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SkillDialog({
  skill,
  onClose,
  onSave,
}: {
  skill: Skill | null;
  onClose: () => void;
  onSave: (input: SkillInput) => void;
}) {
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [category, setCategory] = useState(
    skill?.category ?? "Kỹ năng chung",
  );
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
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

  const canSave =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    instructions.trim().length > 0;

  const categories = categoryOptions.includes(category)
    ? categoryOptions
    : [...categoryOptions, category];

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
        aria-labelledby="skill-dialog-title"
        className="fade-in relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-border bg-surface shadow-modal sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2
              id="skill-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              {skill ? "Chỉnh sửa kỹ năng" : "Tạo kỹ năng mới"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Qyron sẽ làm theo hướng dẫn này khi kỹ năng được bật.
            </p>
          </div>
          <IconButton label="Đóng" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onSave({
              name: name.trim(),
              description: description.trim(),
              category,
              instructions: instructions.trim(),
            });
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Tên kỹ năng
              </span>
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                placeholder="Ví dụ: Viết thiệp tay"
                className="h-10 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Mô tả ngắn
              </span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={120}
                placeholder="Một câu nói rõ kỹ năng này giúp gì."
                className="h-10 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Danh mục
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 w-full cursor-pointer rounded-xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-hidden transition-colors focus:border-focus focus:ring-2 focus:ring-focus"
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Hướng dẫn cho Qyron
              </span>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={6}
                maxLength={1600}
                placeholder="Viết theo cách bạn muốn: giọng văn, việc cần làm, điều nên tránh…"
                className="w-full resize-none rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus"
              />
              <span className="mt-1.5 block text-xs text-muted">
                Càng cụ thể, câu trả lời càng đúng ý.
              </span>
            </label>
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
              {skill ? "Lưu thay đổi" : "Tạo kỹ năng"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default function SkillsView({
  skills,
  canManage,
  onToggleSkill,
  onCreateSkill,
  onUpdateSkill,
  onDeleteSkill,
  onUseSkill,
  onBack,
  onOpenSidebar,
}: SkillsViewProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Skill | "new" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useAutohideScrollbar<HTMLElement>();

  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const categories = [
    "Tất cả",
    ...Array.from(new Set(skills.map((skill) => skill.category))),
  ];
  const normalized = query.trim().toLocaleLowerCase("vi");
  const visible = skills.filter((skill) => {
    const matchesCategory =
      category === "Tất cả" || skill.category === category;
    const haystack =
      `${skill.name} ${skill.description} ${skill.category}`.toLocaleLowerCase(
        "vi",
      );
    return matchesCategory && haystack.includes(normalized);
  });

  useEffect(() => {
    if (category !== "Tất cả" && !skills.some((skill) => skill.category === category)) {
      setCategory("Tất cả");
    }
  }, [category, skills]);

  useEffect(() => {
    if (!confirmId) return;
    const timer = window.setTimeout(() => setConfirmId(null), 3500);
    return () => window.clearTimeout(timer);
  }, [confirmId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            Kỹ năng
          </h1>
          <p className="truncate text-xs text-muted">
            {enabledCount} đang bật · {skills.length} kỹ năng
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground outline-hidden transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Tạo kỹ năng</span>
            <span className="sm:hidden">Tạo</span>
          </button>
        ) : null}
      </header>

      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <p className="max-w-[62ch] text-sm text-pretty text-muted">
            {canManage
              ? "Bật kỹ năng để Qyron làm theo cách bạn muốn. Kỹ năng đang bật sẽ xuất hiện trong ô nhập khi bạn trò chuyện."
              : "Bộ kỹ năng do quản trị viên cấu hình. Bạn có thể xem và dùng những kỹ năng đang bật."}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
            <span>
              Bộ kỹ năng có sẵn lấy từ{" "}
              <a
                href="https://github.com/anthropics/skills"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                kho mở của Anthropic
              </a>
              .
            </span>
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm kỹ năng"
                aria-label="Tìm kỹ năng"
                className="h-10 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-3 text-sm text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {visible.length} kết quả
            </span>
          </div>

          <div className="scrollbar-clean mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={cn(
                  "h-8 shrink-0 cursor-pointer rounded-full border px-3 text-xs font-medium outline-hidden transition-colors",
                  category === item
                    ? "border-primary bg-primary-light text-primary"
                    : "border-border-strong bg-surface text-muted hover:bg-button-hover hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-2.5">
            {visible.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                canManage={canManage}
                expanded={expanded === skill.id}
                confirmDelete={confirmId === skill.id}
                onToggle={() => onToggleSkill(skill.id)}
                onExpand={() => {
                  setExpanded((current) =>
                    current === skill.id ? null : skill.id,
                  );
                  setConfirmId(null);
                }}
                onUse={() => onUseSkill(skill.id)}
                onEdit={() => setEditing(skill)}
                onDelete={() => {
                  if (confirmId === skill.id) {
                    onDeleteSkill(skill.id);
                    setConfirmId(null);
                    setExpanded(null);
                  } else {
                    setConfirmId(skill.id);
                  }
                }}
              />
            ))}

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-5 py-10 text-center">
                <span className="mx-auto grid size-10 place-items-center rounded-xl bg-background text-muted">
                  <Search className="size-4" aria-hidden />
                </span>
                <p className="mt-2.5 text-sm font-medium text-foreground">
                  Không tìm thấy kỹ năng
                </p>
                <p className="mt-1 text-sm text-muted">
                  Thử từ khoá khác, hoặc tạo một kỹ năng mới.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory("Tất cả");
                  }}
                  className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Xoá bộ lọc
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {editing ? (
        <SkillDialog
          skill={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            if (editing === "new") onCreateSkill(input);
            else onUpdateSkill(editing.id, input);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}
