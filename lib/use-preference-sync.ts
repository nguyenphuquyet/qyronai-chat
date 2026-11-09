"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

interface ReasoningSetting {
  enabled: boolean;
  level: string;
}

export interface UiSetting {
  theme: "light" | "dark" | "system";
  fontSize: "small" | "medium" | "large";
  enterToSend: boolean;
}

export const DEFAULT_UI: UiSetting = {
  theme: "system",
  fontSize: "medium",
  enterToSend: true,
};

interface PreferenceSyncOptions {
  modelId: string;
  reasoning: ReasoningSetting;
  savedIds: string[];
  activeId: string | null;
  ui: UiSetting;
  setModelId: Dispatch<SetStateAction<string>>;
  setReasoning: Dispatch<SetStateAction<ReasoningSetting>>;
  setSavedIds: Dispatch<SetStateAction<string[]>>;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  setUi: Dispatch<SetStateAction<UiSetting>>;
  /** Chờ localStorage đọc xong trước khi database ghi đè. */
  ready: boolean;
}

/**
 * Đồng bộ cấu hình riêng của tài khoản với MySQL qua /api/preferences.
 * Database là bản chính; localStorage chỉ là bản đệm khi mất kết nối.
 */
export function usePreferenceSync({
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
  ready,
}: PreferenceSyncOptions) {
  const [online, setOnline] = useState<"unknown" | "yes" | "no">("unknown");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    fetch("/api/preferences")
      .then((response) => response.json())
      .then(
        (data: {
          ok?: boolean;
          settings?: {
            modelId?: unknown;
            reasoning?: unknown;
            saved?: unknown;
            activeConversation?: unknown;
            ui?: unknown;
          };
        }) => {
          if (cancelled) return;
          const settings = data.settings;
          if (!settings) {
            setOnline("no");
            return;
          }

          if (typeof settings.modelId === "string") {
            setModelId(settings.modelId);
          }
          if (settings.reasoning && typeof settings.reasoning === "object") {
            const value = settings.reasoning as Partial<ReasoningSetting>;
            if (typeof value.enabled === "boolean" && typeof value.level === "string") {
              setReasoning({ enabled: value.enabled, level: value.level });
            }
          }
          if (Array.isArray(settings.saved)) {
            setSavedIds(
              settings.saved.filter(
                (item): item is string => typeof item === "string",
              ),
            );
          }
          if (
            typeof settings.activeConversation === "string" ||
            settings.activeConversation === null
          ) {
            setActiveId(settings.activeConversation);
          }
          if (settings.ui && typeof settings.ui === "object") {
            const value = settings.ui as Partial<UiSetting>;
            setUi((current) => ({
              theme:
                value.theme === "light" || value.theme === "dark" || value.theme === "system"
                  ? value.theme
                  : current.theme,
              fontSize:
                value.fontSize === "small" || value.fontSize === "medium" || value.fontSize === "large"
                  ? value.fontSize
                  : current.fontSize,
              enterToSend:
                typeof value.enterToSend === "boolean"
                  ? value.enterToSend
                  : current.enterToSend,
            }));
          }

          setOnline("yes");
        },
      )
      .catch(() => {
        if (!cancelled) setOnline("no");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, setActiveId, setModelId, setReasoning, setSavedIds, setUi]);

  useEffect(() => {
    if (online !== "yes") return;

    const timer = window.setTimeout(() => {
      fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            modelId,
            reasoning,
            saved: savedIds,
            activeConversation: activeId,
            ui,
          },
        }),
      }).catch(() => {
        // Mất kết nối: localStorage vẫn giữ cấu hình.
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeId, modelId, online, reasoning, savedIds, ui]);
}
