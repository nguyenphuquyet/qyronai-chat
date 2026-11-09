"use client";

import { ArrowDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AdminView from "@/components/admin-view";
import { SettingsDialog } from "@/components/account-dialogs";
import ChatHeader from "@/components/chat-header";
import Composer from "@/components/composer";
import MessageItem from "@/components/message";
import Sidebar from "@/components/sidebar";
import SkillsView from "@/components/skills-view";
import {
  conversations as initialConversations,
  models as initialModels,
  providers as initialProviders,
  skills as initialSkills,
} from "@/lib/data";
import type {
  AppUser,
  AppView,
  Attachment,
  Conversation,
  Message,
  ModelInput,
  ModelOption,
  Provider,
  ProviderInput,
  Skill,
  SkillIconName,
  SkillInput,
  Step,
  WebSource,
} from "@/lib/types";
import { useStoredState } from "@/lib/use-stored-state";
import { useConfigSync } from "@/lib/use-config-sync";
import { useConversationSync } from "@/lib/use-conversation-sync";
import { usePreferenceSync, DEFAULT_UI, type UiSetting } from "@/lib/use-preference-sync";
import { cn, truncate, uid } from "@/lib/utils";

interface ChatRequest {
  model: Pick<ModelOption, "id">;
  messages: {
    role: "user" | "assistant";
    content: string;
    images?: string[];
  }[];
  skills: { name: string; instructions: string }[];
  reasoning?: string;
  /** Tắt công cụ cho lần gọi phụ (sinh câu hỏi "Hỏi tiếp"). */
  allowTools?: boolean;
}

/** Tổng chữ tệp gửi kèm mỗi tin, đủ rộng nhưng không làm tràn ngữ cảnh. */
const MAX_TOTAL_FILE_TEXT = 100_000;

/** Ghép chữ trong tệp đính kèm vào nội dung gửi mô hình. */
function attachmentText(attachments?: Attachment[]) {
  let total = 0;
  const blocks: string[] = [];
  for (const item of attachments ?? []) {
    if (item.kind !== "text" || !item.text?.trim()) continue;
    const text = item.text.trim();
    if (total + text.length > MAX_TOTAL_FILE_TEXT) {
      const room = MAX_TOTAL_FILE_TEXT - total;
      if (room > 500) {
        blocks.push(
          `<tệp_đính_kèm tên="${item.name}">\n${text.slice(0, room)}\n[… tệp đã được lược bớt]\n</tệp_đính_kèm>`,
        );
      }
      break;
    }
    total += text.length;
    blocks.push(`<tệp_đính_kèm tên="${item.name}">\n${text}\n</tệp_đính_kèm>`);
  }
  return blocks.join("\n\n");
}

/** Chỉ gửi lên API những tin đã có nội dung thật, bỏ tin lỗi hoặc đang soạn. */
function toApiMessages(list: Message[]) {
  return list
    .filter((message) => message.state !== "error" && message.state !== "thinking")
    .map((message) => {
      const content = [message.text?.trim(), attachmentText(message.attachments)]
        .filter(Boolean)
        .join("\n\n");
      const images = (message.attachments ?? []).flatMap((item) =>
        item.kind === "image" && item.dataUrl ? [item.dataUrl] : [],
      );
      return {
        role: message.role,
        content:
          content ||
          (images.length > 0
            ? "Hãy xem (những) ảnh đính kèm dưới đây."
            : ""),
        ...(images.length > 0 ? { images } : {}),
      };
    })
    .filter((message) => message.content.length > 0);
}

/**
 * Sinh câu hỏi "Hỏi tiếp" từ chính câu trả lời vừa nhận.
 * Gọi mô hình đang dùng một lần phụ; lỗi thì bỏ qua, không dùng câu mẫu.
 */
async function fetchFollowUps(
  request: ChatRequest,
  question: string,
  answer: string,
): Promise<string[]> {
  const instruction = [
    "Dựa vào câu hỏi và câu trả lời dưới đây, viết đúng 3 câu hỏi tiếp theo ngắn gọn bằng tiếng Việt mà người dùng có thể muốn hỏi.",
    "Chỉ trả về 3 dòng, mỗi dòng một câu hỏi, không đánh số, không thêm lời dẫn.",
    "",
    `Câu hỏi: ${question.slice(0, 1500)}`,
    "",
    `Câu trả lời: ${answer.slice(0, 2500)}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: "user", content: instruction }],
        skills: [],
        allowTools: false,
      } satisfies ChatRequest),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return [];

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";

    const handleLine = (line: string) => {
      const raw = line.trim();
      if (!raw) return;
      try {
        const frame = JSON.parse(raw) as { t?: string; v?: string };
        if (frame.t === "a" && frame.v) text += frame.v;
      } catch {
        // Bỏ qua dòng không đúng định dạng.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);

    return text
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
          .replace(/^["“”']+|["“”']+$/g, "")
          .trim(),
      )
      .filter((line) => line.length > 8 && line.includes("?"))
      .slice(0, 3)
      .map((line) => (line.length > 90 ? `${line.slice(0, 87)}…` : line));
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

function iconForCategory(category: string): SkillIconName {
  if (category === "Tài liệu") return "doc";
  if (category === "Phát triển") return "code";
  if (category === "Giao tiếp") return "comms";
  if (category === "Học tập") return "guide";
  if (category === "Sáng tạo & Thiết kế") return "design";
  return "skill";
}

interface ChatAppProps {
  initialView?: AppView;
  user: AppUser;
}

export default function ChatApp({ initialView = "chat", user }: ChatAppProps) {
  const isAdmin = user.role === "admin";
  // Lịch sử và lựa chọn riêng của từng tài khoản, tách khỏi tài khoản khác.
  const userKey = (name: string) => `qyron:v6:${user.id}:${name}`;

  const [items, setItems] = useStoredState<Conversation[]>(
    userKey("conversations"),
    initialConversations,
  );
  const [activeId, setActiveId, activeIdReady] = useStoredState<string | null>(
    userKey("conversation"),
    null,
  );
  const [view, setView] = useState<AppView>(initialView);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useStoredState<Skill[]>(
    "qyron:v5:skills",
    initialSkills,
  );
  const [providers, setProviders] = useStoredState<Provider[]>(
    "qyron:v5:providers",
    initialProviders,
  );
  const [models, setModels] = useStoredState<ModelOption[]>(
    "qyron:v5:models",
    initialModels,
  );
  const [modelId, setModelId, modelIdReady] = useStoredState<string>(
    userKey("model"),
    "",
  );
  const [globalPrompt, setGlobalPrompt] = useStoredState<string>(
    "qyron:v5:globalPrompt",
    "",
  );
  const [defaultModelId, setDefaultModelId] = useStoredState<string>(
    "qyron:v5:defaultModel",
    "",
  );
  const [profile, setProfile] = useState<AppUser>(user);
  const [ui, setUi, uiReady] = useStoredState<UiSetting>(
    "qyron:v5:ui",
    DEFAULT_UI,
  );
  const [accountDialog, setAccountDialog] = useState<
    "profile" | "settings" | null
  >(null);
  useConfigSync({
    skills,
    providers,
    models,
    globalPrompt,
    defaultModelId,
    setSkills,
    setProviders,
    setModels,
    setGlobalPrompt,
    setDefaultModelId,
    canManage: isAdmin,
  });
  useConversationSync({
    conversations: items,
    setConversations: setItems,
  });
  const [reasoning, setReasoning, reasoningReady] = useStoredState<{
    enabled: boolean;
    level: string;
  }>(userKey("reasoning"), { enabled: true, level: "Vừa" });
  const [attachedSkillIds, setAttachedSkillIds] = useState<string[]>([]);
  const [savedIds, setSavedIds, savedIdsReady] = useStoredState<string[]>(
    userKey("saved"),
    [],
  );
  usePreferenceSync({
    modelId,
    reasoning,
    savedIds,
    activeId,
    ui,
    setModelId,
    setReasoning,
    setSavedIds,
    setActiveId,
    setUi,
    ready:
      modelIdReady && activeIdReady && reasoningReady && savedIdsReady && uiReady,
  });

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        ui.theme === "dark" || (ui.theme === "system" && media.matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.style.fontSize =
        ui.fontSize === "small" ? "14px" : ui.fontSize === "large" ? "18px" : "16px";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [ui.theme, ui.fontSize]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const threadRef = useRef<HTMLDivElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stream = useRef<{ convId: string; msgId: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Giữ thanh địa chỉ khớp với màn đang xem để mở thẳng /admin hoặc /skills được.
  useEffect(() => {
    const path =
      view === "admin" && isAdmin
        ? "/admin"
        : view === "skills"
          ? "/skills"
          : "/";
    if (window.location.pathname !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [isAdmin, view]);

  // Không để tài khoản thường mở màn quản trị bằng cách đổi state phía client.
  useEffect(() => {
    if (!isAdmin && view === "admin") setView("chat");
  }, [isAdmin, view]);

  const active = useMemo(
    () => items.find((conversation) => conversation.id === activeId) ?? null,
    [items, activeId],
  );
  const messages = active?.messages ?? [];
  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.enabled),
    [providers],
  );
  const availableModels = useMemo(
    () =>
      models.filter(
        (model) =>
          model.enabled &&
          enabledProviders.some(
            (provider) => provider.id === model.providerId,
          ),
      ),
    [enabledProviders, models],
  );
  const activeModel =
    availableModels.find((model) => model.id === modelId) ??
    availableModels[0] ??
    null;
  const effectiveDefaultModelId =
    defaultModelId ||
    models.find((model) => model.badge === "Mặc định")?.id ||
    "";
  const saved = activeId ? savedIds.includes(activeId) : false;
  const isEmpty = messages.length === 0;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = threadRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  const updateMessage = useCallback(
    (convId: string, msgId: string, patch: (message: Message) => Message) => {
      setItems((current) =>
        current.map((conversation) =>
          conversation.id !== convId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id !== msgId ? message : patch(message),
                ),
              },
        ),
      );
    },
    [],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const current = stream.current;
    if (current) {
      updateMessage(current.convId, current.msgId, (message) => ({
        ...message,
        state: "stopped",
        text: message.text ?? "",
        steps: message.steps?.map((step) =>
          step.status === "running" ? { ...step, status: "done" } : step,
        ),
      }));
      stream.current = null;
    }
    setGeneratingId(null);
  }, [updateMessage]);

  const startGeneration = useCallback(
    async (convId: string, msgId: string, request: ChatRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      stream.current = { convId, msgId };
      setGeneratingId(msgId);
      setAtBottom(true);

      updateMessage(convId, msgId, (message) => ({
        ...message,
        text: "",
        error: undefined,
        suggestions: undefined,
        sources: undefined,
      }));

      const fail = (detail: string) => {
        updateMessage(convId, msgId, (message) => ({
          ...message,
          state: "error",
          text: undefined,
          error: { title: "Không nhận được câu trả lời", detail },
          steps: message.steps?.map((step) =>
            step.status === "running" ? { ...step, status: "error" } : step,
          ),
        }));
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = `Máy chủ trả về lỗi ${response.status}.`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) detail = data.error;
          } catch {
            // Không phải JSON: giữ thông báo mặc định.
          }
          fail(detail);
          return;
        }

        if (!response.body) {
          fail("Máy chủ không trả về nội dung.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const modelName = activeModel?.name ?? "mô hình";
        let text = "";
        let reasoning = "";
        let buffer = "";
        let sawText = false;
        let sawReasoning = false;
        let paintedAt = 0;
        let sources: WebSource[] = [];
        let webPhase: "idle" | "searching" | "done" | "error" = "idle";
        let webError = "";
        let fatal: string | null = null;

        const stepsNow = (): Step[] => {
          const steps: Step[] = [
            { label: "Đã gửi câu hỏi", status: "done" },
          ];
          if (webPhase !== "idle") {
            steps.push({
              label:
                webPhase === "searching"
                  ? "Đang tìm thông tin trên web"
                  : webPhase === "done"
                    ? "Đã đọc thông tin trên web"
                    : "Không tìm được thông tin trên web",
              status:
                webPhase === "searching"
                  ? "running"
                  : webPhase === "done"
                    ? "done"
                    : "error",
              detail: webPhase === "error" ? webError : undefined,
            });
          }
          if (sawReasoning) {
            steps.push({
              label: sawText ? "Đã suy nghĩ xong" : "Đang suy nghĩ",
              status: sawText ? "done" : "running",
            });
          }
          if (sawText) {
            steps.push({ label: "Đang viết câu trả lời", status: "running" });
          } else if (!sawReasoning && webPhase === "idle") {
            steps.push({
              label: `Đang chờ ${modelName} phản hồi`,
              status: "running",
            });
          }
          return steps;
        };

        const paint = (throttle: boolean) => {
          const now = performance.now();
          // Bắn chữ xuống gần như ngay khi máy chủ gửi tới.
          if (throttle && now - paintedAt < 16) return;
          paintedAt = now;
          updateMessage(convId, msgId, (message) => ({
            ...message,
            text,
            reasoning: reasoning || undefined,
            state: text ? "streaming" : "thinking",
            steps: stepsNow(),
          }));
        };

        // Mỗi dòng máy chủ gửi là một khung JSON:
        // r = suy nghĩ, a = câu trả lời, p = tiến trình, s = nguồn,
        // c = xoá phần nháp, e = lỗi.
        const handleLine = (line: string) => {
          const raw = line.trim();
          if (!raw) return;
          try {
            const frame = JSON.parse(raw) as {
              t?: string;
              v?: unknown;
              e?: string;
            };
            if (frame.t === "r" && typeof frame.v === "string" && frame.v) {
              reasoning += frame.v;
              sawReasoning = true;
            } else if (
              frame.t === "a" &&
              typeof frame.v === "string" &&
              frame.v
            ) {
              text += frame.v;
              sawText = true;
            } else if (frame.t === "p" && frame.v === "search") {
              webPhase = "searching";
              webError = "";
              updateMessage(convId, msgId, (message) => ({
                ...message,
                steps: stepsNow(),
              }));
            } else if (frame.t === "s") {
              sources = Array.isArray(frame.v)
                ? (frame.v as WebSource[])
                : [];
              if (sources.length > 0) {
                webPhase = "done";
                webError = "";
              } else {
                webPhase = "error";
                webError =
                  frame.e ?? "Không tìm thấy kết quả phù hợp trên web.";
              }
              updateMessage(convId, msgId, (message) => ({
                ...message,
                sources: sources.length > 0 ? sources : undefined,
                steps: stepsNow(),
              }));
            } else if (frame.t === "c") {
              text = "";
              sawText = false;
            } else if (frame.t === "e" && typeof frame.v === "string") {
              fatal = frame.v;
            }
          } catch {
            // Máy chủ phiên bản cũ chỉ trả chữ thường.
            text += raw;
            sawText = true;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            handleLine(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
          if (fatal) break;
          paint(true);
        }
        buffer += decoder.decode();
        if (buffer.trim()) handleLine(buffer);
        if (fatal) {
          fail(fatal);
          return;
        }

        const answer = text.trim();
        if (!answer) {
          fail(
            reasoning.trim()
              ? "Mô hình chỉ trả về phần suy nghĩ mà không có câu trả lời. Thử lại hoặc chọn mô hình khác."
              : "Mô hình không trả về chữ nào. Thử lại hoặc chọn mô hình khác.",
          );
          return;
        }

        const finalSteps: Step[] = [
          { label: "Đã gửi câu hỏi", status: "done" },
        ];
        const finishedWebPhase: string = webPhase;
        if (finishedWebPhase === "done") {
          finalSteps.push({
            label: "Đã tìm thông tin trên web",
            detail: `${sources.length} nguồn`,
            status: "done",
          });
        } else if (finishedWebPhase === "error") {
          finalSteps.push({
            label: "Không tìm được thông tin trên web",
            detail: webError,
            status: "error",
          });
        }
        if (reasoning.trim()) {
          finalSteps.push({ label: "Đã suy nghĩ xong", status: "done" });
        }
        finalSteps.push({ label: "Đã trả lời", status: "done" });

        updateMessage(convId, msgId, (message) => ({
          ...message,
          text: answer,
          reasoning: reasoning.trim() || undefined,
          sources: sources.length > 0 ? sources : undefined,
          state: "done",
          suggestions: undefined,
          steps: finalSteps,
        }));

        // "Hỏi tiếp" được sinh từ chính câu trả lời, không dùng câu mẫu.
        const question =
          [...request.messages]
            .reverse()
            .find((item) => item.role === "user")?.content ?? "";
        void fetchFollowUps(request, question, answer).then((items) => {
          if (items.length === 0) return;
          updateMessage(convId, msgId, (message) => ({
            ...message,
            suggestions: items,
          }));
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const detail =
          error instanceof Error
            ? error.message
            : "Không kết nối được máy chủ.";
        fail(detail);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (stream.current?.msgId === msgId) stream.current = null;
        setGeneratingId(null);
        setAtBottom(true);
      }
    },
    [updateMessage],
  );

  const makeRequest = useCallback(
    (
      history: Message[],
      skillNames: string[],
      reasoningLevel?: string,
    ): ChatRequest | null => {
      if (!activeModel) {
        notify("Chưa bật mô hình nào. Mở Quản trị để bật một mô hình.");
        return null;
      }
      const provider = enabledProviders.find(
        (item) => item.id === activeModel.providerId,
      );
      if (!provider) {
        notify("Nhà cung cấp của mô hình này đang tắt.");
        return null;
      }

      const attached = skills.filter((skill) =>
        skillNames.includes(skill.name),
      );

      return {
        model: { id: activeModel.id },
        messages: toApiMessages(history),
        skills: attached.map((skill) => ({
          name: skill.name,
          instructions: skill.instructions,
        })),
        reasoning: reasoningLevel,
      };
    },
    [activeModel, enabledProviders, notify, skills],
  );

  const handleSend = useCallback(
    (text: string, attachments: Attachment[]) => {
      if (!text && attachments.length === 0) return;
      if (generatingId) stopGeneration();

      const attachedSkills = skills.filter(
        (skill) => skill.enabled && attachedSkillIds.includes(skill.id),
      );
      const skillNames = attachedSkills.map((skill) => skill.name);
      const reasoningLevel =
        activeModel?.reasoning && reasoning.enabled
          ? reasoning.level
          : undefined;

      const userMessage: Message = {
        id: uid("u"),
        role: "user",
        text,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      const request = makeRequest(
        [...(active?.messages ?? []), userMessage],
        skillNames,
        reasoningLevel,
      );
      if (!request) return;

      const assistantId = uid("a");
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        state: "thinking",
        text: "",
        skills: skillNames.length > 0 ? skillNames : undefined,
        steps: [
          { label: "Đã gửi câu hỏi", status: "done" },
          {
            label: `Đang chờ ${activeModel?.name ?? "mô hình"} phản hồi`,
            status: "running",
          },
        ],
      };

      let targetId = activeId;
      if (!targetId) {
        const conversation: Conversation = {
          id: uid("c"),
          title: truncate(
            text || attachments[0]?.name || "Cuộc trò chuyện mới",
            42,
          ),
          group: "Hôm nay",
          updatedAt: "Vừa xong",
          messages: [userMessage, assistantMessage],
        };
        targetId = conversation.id;
        setItems((current) => [conversation, ...current]);
        setActiveId(conversation.id);
      } else {
        const convId = targetId;
        setItems((current) =>
          current.map((conversation) =>
            conversation.id !== convId
              ? conversation
              : {
                  ...conversation,
                  updatedAt: "Vừa xong",
                  messages: [
                    ...conversation.messages,
                    userMessage,
                    assistantMessage,
                  ],
                },
          ),
        );
      }

      setDraft("");
      setAtBottom(true);
      setGeneratingId(assistantId);
      if (attachedSkillIds.length > 0) {
        setSkills((current) =>
          current.map((skill) =>
            attachedSkillIds.includes(skill.id)
              ? { ...skill, uses: skill.uses + 1 }
              : skill,
          ),
        );
        setAttachedSkillIds([]);
      }
      window.setTimeout(() => scrollToBottom("smooth"), 30);
      void startGeneration(targetId, assistantId, request);
    },
    [
      active,
      activeId,
      activeModel,
      attachedSkillIds,
      generatingId,
      makeRequest,
      reasoning,
      scrollToBottom,
      setSkills,
      skills,
      startGeneration,
      stopGeneration,
    ],
  );

  const handleRegenerate = useCallback(
    (msgId: string) => {
      if (!active) return;
      if (generatingId) stopGeneration();
      const index = active.messages.findIndex((message) => message.id === msgId);
      if (index < 0) return;
      const target = active.messages[index];

      const reasoningLevel =
        activeModel?.reasoning && reasoning.enabled
          ? reasoning.level
          : undefined;
      const request = makeRequest(
        active.messages.slice(0, index),
        target.skills ?? [],
        reasoningLevel,
      );
      if (!request) return;

      updateMessage(active.id, msgId, (message) => ({
        ...message,
        state: "thinking",
        text: "",
        blocks: undefined,
        suggestions: undefined,
        error: undefined,
        reasoning: undefined,
        sources: undefined,
        steps: [
          { label: "Đã gửi câu hỏi", status: "done" },
          {
            label: `Đang chờ ${activeModel?.name ?? "mô hình"} phản hồi`,
            status: "running",
          },
        ],
      }));
      setGeneratingId(msgId);
      void startGeneration(active.id, msgId, request);
    },
    [
      active,
      activeModel,
      generatingId,
      makeRequest,
      reasoning,
      startGeneration,
      stopGeneration,
      updateMessage,
    ],
  );

  const handleRetry = useCallback(
    (msgId: string) => {
      if (!active) return;
      if (generatingId) stopGeneration();
      const index = active.messages.findIndex((message) => message.id === msgId);
      if (index < 0) return;

      const reasoningLevel =
        activeModel?.reasoning && reasoning.enabled
          ? reasoning.level
          : undefined;
      const request = makeRequest(
        active.messages.slice(0, index),
        active.messages[index].skills ?? [],
        reasoningLevel,
      );
      if (!request) return;

      updateMessage(active.id, msgId, (message) => ({
        ...message,
        state: "thinking",
        text: "",
        blocks: undefined,
        error: undefined,
        suggestions: undefined,
        reasoning: undefined,
        sources: undefined,
        steps: [
          { label: "Đã gửi câu hỏi", status: "done" },
          {
            label: `Đang chờ ${activeModel?.name ?? "mô hình"} phản hồi`,
            status: "running",
          },
        ],
      }));
      setGeneratingId(msgId);
      void startGeneration(active.id, msgId, request);
    },
    [
      active,
      activeModel,
      generatingId,
      makeRequest,
      reasoning,
      startGeneration,
      stopGeneration,
      updateMessage,
    ],
  );

  const handleCopy = useCallback(
    (text: string) => {
      navigator.clipboard?.writeText(text).catch(() => undefined);
      notify("Đã sao chép câu trả lời");
    },
    [notify],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (generatingId) stopGeneration();
      setView("chat");
      setActiveId(id);
      setDraft("");
      setAtBottom(true);
      setMobileOpen(false);
      window.setTimeout(() => scrollToBottom("auto"), 30);
    },
    [generatingId, scrollToBottom, stopGeneration],
  );

  const handleNew = useCallback(() => {
    if (generatingId) stopGeneration();
    setView("chat");
    setActiveId(null);
    setDraft("");
    setMobileOpen(false);
    setAtBottom(true);
  }, [generatingId, stopGeneration]);

  const handleDelete = useCallback(
    (id: string) => {
      if (generatingId) stopGeneration();
      setItems((current) => {
        const next = current.filter((conversation) => conversation.id !== id);
        if (activeId === id) {
          setActiveId(next[0]?.id ?? null);
          setDraft("");
        }
        return next;
      });
      notify("Đã xoá cuộc trò chuyện");
    },
    [activeId, generatingId, notify, stopGeneration],
  );

  const handleTogglePin = useCallback(
    (id: string) => {
      setItems((current) =>
        current.map((conversation) =>
          conversation.id === id
            ? { ...conversation, pinned: !conversation.pinned }
            : conversation,
        ),
      );
      notify("Đã cập nhật ghim");
    },
    [notify],
  );

  const handleToggleSaved = useCallback(() => {
    if (!activeId) {
      notify("Gửi tin nhắn trước để lưu cuộc trò chuyện");
      return;
    }
    setSavedIds((current) =>
      current.includes(activeId)
        ? current.filter((id) => id !== activeId)
        : [...current, activeId],
    );
    notify(
      savedIds.includes(activeId)
        ? "Đã bỏ lưu cuộc trò chuyện"
        : "Đã lưu cuộc trò chuyện",
    );
  }, [activeId, notify, savedIds]);

  const handleToggleSkill = useCallback(
    (id: string) => {
      const skill = skills.find((item) => item.id === id);
      if (!skill) return;
      setSkills((current) =>
        current.map((item) =>
          item.id === id ? { ...item, enabled: !item.enabled } : item,
        ),
      );
      if (skill.enabled) {
        setAttachedSkillIds((current) =>
          current.filter((skillId) => skillId !== id),
        );
      }
    },
    [setSkills, skills],
  );

  const handleToggleAttachedSkill = useCallback((id: string) => {
    setAttachedSkillIds((current) =>
      current.includes(id)
        ? current.filter((skillId) => skillId !== id)
        : [...current, id],
    );
  }, []);

  const handleCreateSkill = useCallback(
    (input: SkillInput) => {
      const skill: Skill = {
        id: uid("sk"),
        ...input,
        icon: iconForCategory(input.category),
        enabled: true,
        uses: 0,
      };
      setSkills((current) => [skill, ...current]);
      notify(`Đã tạo kỹ năng “${input.name}”`);
    },
    [notify, setSkills],
  );

  const handleUpdateSkill = useCallback(
    (id: string, input: SkillInput) => {
      setSkills((current) =>
        current.map((skill) =>
          skill.id === id
            ? { ...skill, ...input, icon: iconForCategory(input.category) }
            : skill,
        ),
      );
      notify("Đã lưu kỹ năng");
    },
    [notify, setSkills],
  );

  const handleDeleteSkill = useCallback(
    (id: string) => {
      setSkills((current) => current.filter((skill) => skill.id !== id));
      setAttachedSkillIds((current) =>
        current.filter((skillId) => skillId !== id),
      );
      notify("Đã xoá kỹ năng");
    },
    [notify, setSkills],
  );

  const handleUseSkill = useCallback(
    (id: string) => {
      const skill = skills.find((item) => item.id === id);
      if (!skill) return;
      if (!skill.enabled && !isAdmin) {
        notify("Kỹ năng này đang tắt. Quản trị viên cần bật trước khi dùng.");
        return;
      }
      if (isAdmin) {
        setSkills((current) =>
          current.map((item) =>
            item.id === id ? { ...item, enabled: true } : item,
          ),
        );
      }
      setAttachedSkillIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      setView("chat");
      notify(`Đã gắn kỹ năng “${skill.name}” vào câu hỏi tiếp theo`);
    },
    [isAdmin, notify, setSkills, skills],
  );

  const openSkills = useCallback(() => {
    if (generatingId) stopGeneration();
    setView("skills");
    setMobileOpen(false);
  }, [generatingId, stopGeneration]);

  const openAdmin = useCallback(() => {
    if (!isAdmin) {
      notify("Chỉ quản trị viên mới mở được phần Quản trị.");
      return;
    }
    if (generatingId) stopGeneration();
    setView("admin");
    setMobileOpen(false);
  }, [generatingId, isAdmin, notify, stopGeneration]);

  const handleLogout = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => window.location.replace("/login"));
  }, []);

  const handleToggleProvider = useCallback(
    (id: string) => {
      setProviders((current) =>
        current.map((provider) =>
          provider.id === id
            ? { ...provider, enabled: !provider.enabled }
            : provider,
        ),
      );
    },
    [setProviders],
  );

  const handleSaveProvider = useCallback(
    (id: string | null, input: ProviderInput) => {
      if (id) {
        setProviders((current) =>
          current.map((provider) =>
            provider.id === id ? { ...provider, ...input } : provider,
          ),
        );
        notify("Đã lưu cấu hình API");
      } else {
        setProviders((current) => [
          { id: uid("prov"), ...input, builtin: false },
          ...current,
        ]);
        notify("Đã thêm API mới");
      }
    },
    [notify, setProviders],
  );

  const handleDeleteProvider = useCallback(
    (id: string) => {
      const removedModels = models.filter(
        (model) => model.providerId === id,
      ).length;
      setProviders((current) =>
        current.filter((provider) => provider.id !== id),
      );
      setModels((current) =>
        current.filter((model) => model.providerId !== id),
      );
      notify(
        removedModels > 0
          ? `Đã xoá API và ${removedModels} mô hình đi kèm`
          : "Đã xoá API",
      );
    },
    [models, notify, setModels, setProviders],
  );

  const handleToggleModel = useCallback(
    (id: string) => {
      setModels((current) =>
        current.map((model) =>
          model.id === id ? { ...model, enabled: !model.enabled } : model,
        ),
      );
    },
    [setModels],
  );

  const handleSaveModel = useCallback(
    (id: string | null, input: ModelInput) => {
      if (id) {
        setModels((current) =>
          current.map((model) =>
            model.id === id ? { ...model, ...input } : model,
          ),
        );
        notify("Đã lưu mô hình");
      } else {
        setModels((current) => [
          { id: uid("model"), ...input },
          ...current,
        ]);
        notify("Đã thêm mô hình");
      }
    },
    [notify, setModels],
  );

  const handleModelContext = useCallback(
    (id: string, contextWindow: string) => {
      setModels((current) =>
        current.map((model) =>
          model.id === id ? { ...model, contextWindow } : model,
        ),
      );
    },
    [setModels],
  );

  const handleSetDefaultModel = useCallback(
    (id: string) => {
      setDefaultModelId(id);
      const name = models.find((model) => model.id === id)?.name ?? "mô hình";
      notify(`Đã đặt ${name} làm mặc định`);
    },
    [models, notify, setDefaultModelId],
  );

  const handleDeleteModel = useCallback(
    (id: string) => {
      setModels((current) => current.filter((model) => model.id !== id));
      notify("Đã xoá mô hình");
    },
    [notify, setModels],
  );

  useEffect(() => {
    // Chờ đọc xong lựa chọn đã lưu, tránh ghi đè bằng mô hình đầu tiên.
    if (!modelIdReady) return;
    if (!availableModels.some((model) => model.id === modelId)) {
      // Ưu tiên mô hình mặc định; quản trị viên thấy khoá API thì ưu tiên mô hình có khoá.
      const ready = isAdmin
        ? availableModels.find(
            (model) =>
              (providers.find((provider) => provider.id === model.providerId)
                ?.apiKey ?? "").trim().length > 0,
          )
        : undefined;
      const preferred =
        availableModels.find((model) => model.id === effectiveDefaultModelId) ??
        ready ??
        availableModels[0];
      setModelId(preferred?.id ?? "");
    }
  }, [availableModels, effectiveDefaultModelId, isAdmin, modelId, modelIdReady, providers, setModelId]);

  useEffect(() => {
    if (activeId && !items.some((conversation) => conversation.id === activeId)) {
      setActiveId(items[0]?.id ?? null);
    }
  }, [activeId, items, setActiveId]);

  useEffect(() => {
    if (!atBottom) return;
    const timer = window.setTimeout(() => scrollToBottom("auto"), 20);
    return () => window.clearTimeout(timer);
  }, [messages, atBottom, scrollToBottom]);

  useEffect(() => {
    if (!atBottom) return;
    scrollToBottom("auto");
  }, [activeId, atBottom, scrollToBottom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        if (view !== "chat") return;
        const isDesktop = window.innerWidth >= 1024;
        if (!isDesktop) setMobileOpen(true);
        window.setTimeout(() => {
          const target = isDesktop
            ? desktopSearchRef.current
            : mobileSearchRef.current;
          target?.focus();
          target?.select();
        }, 80);
      }
      if (event.key === "Escape") setMobileOpen(false);
    };

    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [view]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const subtitle = isEmpty
    ? "Chưa có tin nhắn"
    : `${activeModel?.name ?? "Chưa có mô hình"} · ${messages.length} tin nhắn`;

  const shareUrl = `https://qyron.ai/c/${activeId ?? "moi"}`;

  const sidebarProps = {
    conversations: items,
    activeId: view === "chat" ? activeId : null,
    view,
    query,
    onQueryChange: setQuery,
    onSelect: handleSelect,
    onNew: handleNew,
    onOpenSkills: openSkills,
    onOpenAdmin: openAdmin,
    onTogglePin: handleTogglePin,
    onDelete: handleDelete,
    onNotify: notify,
    skillCount: skills.length,
    enabledSkillCount: skills.filter((skill) => skill.enabled).length,
    providerCount: providers.length,
    user: profile,
    canAdmin: isAdmin,
    onLogout: handleLogout,
    onEditProfile: () => setAccountDialog("profile"),
    onOpenSettings: () => setAccountDialog("settings"),
  };

  const composerNode = (
    <Composer
      value={draft}
      onChange={setDraft}
      onSend={handleSend}
      isGenerating={generatingId !== null}
      onStop={stopGeneration}
      skills={skills}
      selectedSkillIds={attachedSkillIds}
      onToggleSkill={handleToggleAttachedSkill}
      onManageSkills={openSkills}
      models={availableModels}
      providers={enabledProviders}
      modelId={modelId}
      defaultModelId={effectiveDefaultModelId}
      onModelChange={setModelId}
      reasoningSupported={Boolean(activeModel?.reasoning)}
      reasoningEnabled={reasoning.enabled}
      reasoningLevel={reasoning.level}
      onToggleReasoning={() =>
        setReasoning((current) => ({
          ...current,
          enabled: !current.enabled,
        }))
      }
      onReasoningLevelChange={(level) =>
        setReasoning((current) => ({ ...current, level }))
      }
      enterToSend={ui.enterToSend}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden h-full lg:flex">
        <Sidebar {...sidebarProps} searchRef={desktopSearchRef} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {view === "chat" ? (
          <>
            <ChatHeader
              title={active?.title ?? "Cuộc trò chuyện mới"}
              subtitle={subtitle}
              onOpenSidebar={() => setMobileOpen(true)}
              saved={saved}
              onToggleSaved={handleToggleSaved}
              shareUrl={shareUrl}
              onNotify={notify}
            />

        <main className="relative flex min-h-0 flex-1 flex-col">
          {isEmpty ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 sm:px-6 sm:pb-24">
              <div className="w-full max-w-3xl">
                <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight text-foreground sm:mb-7 sm:text-[28px]">
                  Chúng ta nên bắt đầu từ đâu?
                </h2>
                {composerNode}
              </div>
            </div>
          ) : (
            <>
              <div
                ref={threadRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  const distance =
                    element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight;
                  setAtBottom(distance < 80);
                }}
                className="min-h-0 flex-1 overflow-y-auto"
              >
                <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6">
                  {messages.map((message, index) => (
                    <MessageItem
                      key={message.id}
                      message={message}
                      isLast={index === messages.length - 1}
                      onCopy={handleCopy}
                      onRegenerate={handleRegenerate}
                      onRetry={handleRetry}
                      onSuggestion={(suggestion) =>
                        handleSend(suggestion, [])
                      }
                    />
                  ))}
                </div>
              </div>

              {!atBottom ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-32 z-10 flex justify-center pb-2">
                  <button
                    type="button"
                    aria-label="Xuống cuối cuộc trò chuyện"
                    onClick={() => {
                      setAtBottom(true);
                      scrollToBottom("smooth");
                    }}
                    className="pointer-events-auto grid size-8 cursor-pointer place-items-center rounded-full border border-border-strong bg-surface text-muted shadow-card outline-hidden transition-colors hover:bg-button-hover hover:text-foreground"
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                </div>
              ) : null}

              <div className="shrink-0 px-4 pb-4 sm:px-6">{composerNode}</div>
            </>
          )}
        </main>
          </>
        ) : view === "skills" ? (
          <SkillsView
            skills={skills}
            canManage={isAdmin}
            onToggleSkill={handleToggleSkill}
            onCreateSkill={handleCreateSkill}
            onUpdateSkill={handleUpdateSkill}
            onDeleteSkill={handleDeleteSkill}
            onUseSkill={handleUseSkill}
            onBack={() => setView("chat")}
            onOpenSidebar={() => setMobileOpen(true)}
          />
        ) : (
          <AdminView
            providers={providers}
            models={models}
            skills={skills}
            conversationCount={items.length}
            globalPrompt={globalPrompt}
            onChangeGlobalPrompt={setGlobalPrompt}
            onToggleProvider={handleToggleProvider}
            onSaveProvider={handleSaveProvider}
            onDeleteProvider={handleDeleteProvider}
            onToggleModel={handleToggleModel}
            onSaveModel={handleSaveModel}
            onModelContext={handleModelContext}
            onDeleteModel={handleDeleteModel}
            defaultModelId={effectiveDefaultModelId}
            onSetDefaultModel={handleSetDefaultModel}
            onOpenSkills={openSkills}
            onBack={() => setView("chat")}
            onOpenSidebar={() => setMobileOpen(true)}
          />
        )}
      </div>

      {/* Sidebar trượt dưới lg */}
      <div className="lg:hidden">
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className={cn(
            "fixed inset-0 z-40 bg-black/15 transition-opacity",
            mobileOpen
              ? "opacity-100 duration-500"
              : "pointer-events-none opacity-0 duration-[350ms]",
          )}
        />
        <div
          inert={!mobileOpen}
          aria-hidden={!mobileOpen}
          style={{
            transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-surface shadow-modal transition-transform",
            mobileOpen
              ? "translate-x-0 duration-500"
              : "-translate-x-full duration-[350ms]",
          )}
        >
          <Sidebar
            {...sidebarProps}
            searchRef={mobileSearchRef}
            onCloseMobile={() => setMobileOpen(false)}
          />
        </div>
      </div>

      {accountDialog ? (
        <SettingsDialog
          initialTab={accountDialog === "profile" ? "profile" : "appearance"}
          user={profile}
          onSaved={setProfile}
          ui={ui}
          onChangeUi={(patch) => setUi((current) => ({ ...current, ...patch }))}
          onClose={() => setAccountDialog(null)}
          onNotify={notify}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fade-in fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-popover"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
