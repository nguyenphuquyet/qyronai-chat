"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ModelOption, Provider, Skill } from "./types";

interface ConfigSyncOptions {
  skills: Skill[];
  providers: Provider[];
  models: ModelOption[];
  /** Chỉ dẫn chung áp dụng cho mọi mô hình. */
  globalPrompt: string;
  /** Mô hình mặc định cho cuộc trò chuyện mới. */
  defaultModelId: string;
  setSkills: Dispatch<SetStateAction<Skill[]>>;
  setProviders: Dispatch<SetStateAction<Provider[]>>;
  setModels: Dispatch<SetStateAction<ModelOption[]>>;
  setGlobalPrompt: Dispatch<SetStateAction<string>>;
  setDefaultModelId: Dispatch<SetStateAction<string>>;
  /** Chỉ quản trị viên mới được ghi cấu hình dùng chung lên database. */
  canManage: boolean;
}

/**
 * Đồng bộ cấu hình dùng chung với MySQL qua /api/config.
 * Database là bản chính; localStorage chỉ là bản đệm khi mất kết nối.
 * - Quản trị viên đọc và ghi cấu hình.
 * - Tài khoản thường chỉ đọc, khoá API đã được máy chủ che.
 */
export function useConfigSync({
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
  canManage,
}: ConfigSyncOptions) {
  const [online, setOnline] = useState<"unknown" | "yes" | "no">("unknown");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/config")
      .then((response) => response.json())
      .then(
        (data: {
          ready?: boolean;
          providers?: Provider[];
          models?: ModelOption[];
          skills?: Skill[];
          globalPrompt?: string;
          defaultModelId?: string;
        }) => {
          if (cancelled) return;
          if (!data.ready) {
            setOnline("no");
            return;
          }

          // Database là nguồn duy nhất, tránh mô hình hoặc khoá cũ còn sót
          // trong localStorage của trình duyệt.
          if (data.providers?.length) {
            setProviders(data.providers);
          }
          if (data.models?.length) {
            setModels(data.models);
          }
          if (data.skills?.length) {
            setSkills(data.skills);
          }
          if (typeof data.globalPrompt === "string") {
            setGlobalPrompt(data.globalPrompt);
          }
          if (typeof data.defaultModelId === "string") {
            setDefaultModelId(data.defaultModelId);
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
  }, [setDefaultModelId, setGlobalPrompt, setModels, setProviders, setSkills]);

  useEffect(() => {
    if (online !== "yes" || !canManage) return;

    const timer = window.setTimeout(() => {
      fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills, providers, models, globalPrompt, defaultModelId }),
      }).catch(() => {
        // Database đang tắt: localStorage vẫn giữ thay đổi.
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [canManage, defaultModelId, globalPrompt, models, online, providers, skills]);
}
