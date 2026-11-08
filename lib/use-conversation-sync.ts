"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Conversation } from "./types";

interface ConversationSyncOptions {
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
}

/**
 * Gộp lịch sử trên database với bản trong máy.
 * Bản trong máy thắng khi trùng id để không mất tin vừa gửi;
 * cuộc trò chuyện chỉ có trên database vẫn được khôi phục.
 */
function mergeConversations(
  server: Conversation[],
  local: Conversation[],
): Conversation[] {
  if (local.length === 0) return server;
  const localById = new Map(local.map((item) => [item.id, item]));
  const merged = [...local];
  for (const item of server) {
    if (!localById.has(item.id)) merged.push(item);
  }
  return merged;
}

/**
 * Đồng bộ lịch sử chat với MySQL qua /api/conversations.
 * - Database sẵn sàng: gộp lịch sử trên database với bản trong máy.
 * - Database chưa chạy: giữ nguyên bản trong localStorage.
 * - Thay đổi được gửi sau 0,9 giây và thêm một lần khi đóng tab.
 */
export function useConversationSync({
  conversations,
  setConversations,
}: ConversationSyncOptions) {
  const [online, setOnline] = useState<"unknown" | "yes" | "no">("unknown");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/conversations")
      .then((response) => response.json())
      .then(
        (data: {
          ready?: boolean;
          conversations?: Conversation[];
        }) => {
          if (cancelled) return;
          if (!data.ready) {
            setOnline("no");
            return;
          }
          const server = Array.isArray(data.conversations)
            ? data.conversations
            : [];
          if (server.length > 0) {
            setConversations((current) =>
              mergeConversations(server, current),
            );
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
  }, [setConversations]);

  useEffect(() => {
    if (online !== "yes") return;

    const timer = window.setTimeout(() => {
      fetch("/api/conversations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations }),
      }).catch(() => {
        // Database đang tắt: localStorage vẫn giữ lịch sử.
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [conversations, online]);

  useEffect(() => {
    const flush = () => {
      if (online !== "yes") return;
      const payload = JSON.stringify({ conversations });
      // sendBeacon không bị huỷ khi tab đóng như fetch thường.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/conversations",
          new Blob([payload], { type: "application/json" }),
        );
      }
    };

    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [conversations, online]);
}
