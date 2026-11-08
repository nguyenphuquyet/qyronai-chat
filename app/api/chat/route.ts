import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AiSettings } from "@/lib/types";
import { detectSearchIntent } from "@/lib/search-intent";
import {
  mergeWebSources,
  searchWeb,
  type WebSearchResult,
} from "@/lib/web-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_IDLE_TIMEOUT_MS = 300_000;
const STREAM_HEARTBEAT_MS = 15_000;

type ChatRole = "user" | "assistant";
type ProviderKind = "openai" | "anthropic" | "google";
type UpstreamMessage = Record<string, unknown>;

interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Ảnh đính kèm dạng data URL (data:image/...;base64,...). */
  images?: string[];
}

interface ChatPayload {
  model?: {
    id?: string;
  };
  messages?: ChatMessage[];
  skills?: { name?: string; instructions?: string }[];
  reasoning?: string;
  /** Tắt công cụ cho các lần gọi phụ (ví dụ sinh câu hỏi "Hỏi tiếp"). */
  allowTools?: boolean;
}

const FALLBACK_MODEL_IDS: Record<string, string> = {
  "may-2.5": "qyron-ai",
  "may-2.5-pro": "qyron-pro",
  "may-mini": "qyron-mini",
  "gpt-4.1": "gpt-4.1",
  "gpt-4.1-mini": "gpt-4.1-mini",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-haiku-4.5": "claude-haiku-4-5",
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-2.5-flash": "gemini-2.5-flash",
};

const WEB_SEARCH_DESCRIPTION =
  "Tìm thông tin mới nhất trên Internet. Dùng khi câu hỏi cần dữ liệu thời gian thực như tin tức, thời tiết, giá cả, tỷ số, lịch phát hành, sản phẩm mới, hoặc khi cần kiểm chứng một thông tin có thể đã thay đổi.";

const WEB_SEARCH_PARAMETERS = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Câu truy vấn tìm kiếm ngắn gọn, giữ đúng ngôn ngữ phù hợp với nguồn cần tìm.",
    },
  },
  required: ["query"],
};

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: WEB_SEARCH_DESCRIPTION,
      parameters: WEB_SEARCH_PARAMETERS,
    },
  },
];

const ANTHROPIC_TOOLS = [
  {
    name: "web_search",
    description: WEB_SEARCH_DESCRIPTION,
    input_schema: WEB_SEARCH_PARAMETERS,
  },
];

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "web_search",
        description: WEB_SEARCH_DESCRIPTION,
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description:
                "Câu truy vấn tìm kiếm ngắn gọn, giữ đúng ngôn ngữ phù hợp với nguồn cần tìm.",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];

interface ToolCall {
  index: number;
  id: string;
  name: string;
  args: string;
}

interface ToolDelta {
  index: number;
  id?: string;
  name?: string;
  args?: string;
}

function providerKind(id: string, baseUrl: string): ProviderKind {
  const key = `${id} ${baseUrl}`.toLocaleLowerCase("vi");
  if (key.includes("anthropic") || key.includes("claude")) return "anthropic";
  if (
    key.includes("googleapis") ||
    key.includes("generativelanguage") ||
    key.includes("gemini")
  ) {
    return "google";
  }
  return "openai";
}

function envKeyFor(providerId: string) {
  if (providerId === "prov-openai") return process.env.OPENAI_API_KEY;
  if (providerId === "prov-anthropic") return process.env.ANTHROPIC_API_KEY;
  if (providerId === "prov-google") {
    return process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  }
  if (providerId.includes("huggingface") || providerId.includes("hf")) {
    return process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN;
  }
  return process.env.QYRON_API_KEY;
}

function isPlaceholderKey(key: string) {
  const value = key.trim();
  if (!value) return true;
  if (value.includes("demo") || value.includes("•")) return true;
  return false;
}

function buildSystemPrompt(
  settings: Partial<AiSettings>,
  skills: { name?: string; instructions?: string }[],
  reasoning: string | undefined,
  allowTools: boolean,
  web?: WebSearchResult,
) {
  const lines: string[] = [];
  // Chỉ dẫn chung đứng trước, rồi tới chỉ dẫn riêng của mô hình.
  const shared = settings.globalPrompt?.trim();
  if (shared) lines.push(shared);

  const base = settings.systemPrompt?.trim();
  if (base) lines.push(base);

  const today = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  lines.push(
    `Hôm nay là ${today}. Hãy ưu tiên câu trả lời đúng với thời điểm hiện tại.`,
  );

  if (allowTools) {
    lines.push(
      [
        "Bạn có công cụ web_search để tra cứu Internet và được tự quyết định khi nào dùng.",
        "Hãy gọi web_search trước khi trả lời nếu câu hỏi liên quan tới tin tức, thời sự, thời tiết, giá cả, tỷ số, lịch phát hành, sản phẩm mới, hoặc thông tin có thể đã thay đổi sau ngày bạn được huấn luyện.",
        "Không cần xin phép người dùng; gọi công cụ rồi trả lời luôn.",
        "Khi dùng thông tin tìm được, hãy chèn liên kết Markdown trực tiếp vào đúng câu hoặc cụm từ liên quan. Không thêm mục “Nguồn tham khảo” riêng ở cuối và không bịa nguồn hoặc đường dẫn.",
      ].join("\n"),
    );
  }

  if (web) {
    lines.push(
      [
        `Kết quả tìm kiếm web cho câu hỏi hiện tại (truy vấn: ${web.query || "không rõ"}):`,
        web.context ||
          `Không đọc được kết quả tìm kiếm. ${web.error ?? ""}`.trim(),
        "Hãy dùng thông tin trên khi trả lời và chèn liên kết Markdown trực tiếp vào đúng câu liên quan. Không thêm mục “Nguồn tham khảo” riêng ở cuối. Nếu kết quả không đủ hoặc mâu thuẫn, hãy nói rõ và bổ sung bằng kiến thức của bạn.",
      ].join("\n"),
    );
  }

  if (reasoning) {
    lines.push(
      `Mức suy luận người dùng chọn: ${reasoning}. Hãy cân nhắc kỹ hơn mức thường ngày nhưng không kể lại quá trình suy nghĩ.`,
    );
  }

  const usable = skills.filter(
    (skill) => skill.name?.trim() && skill.instructions?.trim(),
  );
  if (usable.length > 0) {
    lines.push(
      [
        "Kỹ năng người dùng gắn cho câu trả lời này:",
        ...usable.map(
          (skill) => `- ${skill.name?.trim()}: ${skill.instructions?.trim()}`,
        ),
      ].join("\n"),
    );
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}

const IMAGE_DATA_URL =
  /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;

/** Chỉ nhận ảnh base64 hợp lệ, tối đa 4 ảnh mỗi tin. */
function sanitizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is string =>
        typeof item === "string" &&
        item.length <= 8_000_000 &&
        IMAGE_DATA_URL.test(item),
    )
    .slice(0, 4);
}

function parseDataUrl(url: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(url);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

function sanitizeMessages(messages: ChatMessage[]) {
  const cleaned = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .map((message) => {
      const images = sanitizeImages(message.images);
      return {
        role: message.role,
        content: message.content,
        ...(images.length > 0 ? { images } : {}),
      };
    });

  // Một số API (Anthropic) yêu cầu vai trò xen kẽ và mở đầu bằng user.
  const merged: ChatMessage[] = [];
  for (const message of cleaned) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`;
      if (message.images?.length) {
        last.images = [...(last.images ?? []), ...message.images].slice(0, 4);
      }
    } else {
      merged.push({ ...message });
    }
  }
  while (merged.length > 0 && merged[0].role !== "user") {
    merged.shift();
  }
  return merged;
}

async function readErrorMessage(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return `Máy chủ trả về lỗi ${response.status}.`;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // Không phải JSON: trả về đoạn đầu của nội dung lỗi.
  }
  return raw.slice(0, 400);
}

async function* sseData(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (line: string) => {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.startsWith("data:")) return null;
    const data = trimmed.slice(5).trim();
    return data || null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const data = handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (data) yield data;
        newline = buffer.indexOf("\n");
      }
    }

    const rest = handleLine(buffer);
    if (rest) yield rest;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

interface Extracted {
  text: string[];
  reasoning: string[];
  tools: ToolDelta[];
}

function extractParts(kind: ProviderKind, raw: string): Extracted {
  const empty: Extracted = { text: [], reasoning: [], tools: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }

  if (kind === "openai") {
    const data = parsed as {
      choices?: {
        delta?: {
          content?: string | null;
          reasoning_content?: string | null;
          reasoning?: string | null;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
      error?: { message?: string };
    };
    if (data.error?.message) throw new Error(data.error.message);
    const delta = data.choices?.[0]?.delta;
    const reasoning = [delta?.reasoning_content, delta?.reasoning].filter(
      (value): value is string => Boolean(value),
    );
    const tools = (delta?.tool_calls ?? []).map((call, index) => ({
      index: typeof call.index === "number" ? call.index : index,
      id: call.id,
      name: call.function?.name,
      args: call.function?.arguments,
    }));
    return {
      text: delta?.content ? [delta.content] : [],
      reasoning,
      tools,
    };
  }

  if (kind === "anthropic") {
    const data = parsed as {
      type?: string;
      index?: number;
      content_block?: {
        type?: string;
        id?: string;
        name?: string;
        input?: unknown;
      };
      delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        partial_json?: string;
      };
      error?: { message?: string };
    };
    if (data.type === "error" && data.error?.message) {
      throw new Error(data.error.message);
    }
    if (
      data.type === "content_block_start" &&
      data.content_block?.type === "tool_use"
    ) {
      const input = data.content_block.input;
      const hasInput =
        input &&
        typeof input === "object" &&
        Object.keys(input as Record<string, unknown>).length > 0;
      return {
        text: [],
        reasoning: [],
        tools: [
          {
            index: data.index ?? 0,
            id: data.content_block.id,
            name: data.content_block.name,
            args: hasInput ? JSON.stringify(input) : undefined,
          },
        ],
      };
    }
    if (data.type === "content_block_delta") {
      if (data.delta?.type === "thinking_delta" && data.delta.thinking) {
        return { text: [], reasoning: [data.delta.thinking], tools: [] };
      }
      if (data.delta?.type === "text_delta" && data.delta.text) {
        return { text: [data.delta.text], reasoning: [], tools: [] };
      }
      if (
        data.delta?.type === "input_json_delta" &&
        data.delta.partial_json
      ) {
        return {
          text: [],
          reasoning: [],
          tools: [
            {
              index: data.index ?? 0,
              args: data.delta.partial_json,
            },
          ],
        };
      }
    }
    return empty;
  }

  const data = parsed as {
    candidates?: {
      content?: {
        parts?: {
          text?: string;
          thought?: boolean;
          functionCall?: { name?: string; args?: unknown };
        }[];
      };
    }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  if (data.promptFeedback?.blockReason) {
    throw new Error(
      `Mô hình từ chối trả lời (${data.promptFeedback.blockReason}).`,
    );
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const tools: ToolDelta[] = [];
  parts.forEach((part, index) => {
    if (part.functionCall?.name) {
      tools.push({
        index,
        name: part.functionCall.name,
        args: JSON.stringify(part.functionCall.args ?? {}),
      });
    }
  });
  return {
    text: parts
      .filter((part) => !part.thought && part.text)
      .map((part) => part.text as string),
    reasoning: parts
      .filter((part) => part.thought && part.text)
      .map((part) => part.text as string),
    tools,
  };
}

function mergeToolDeltas(
  store: Map<number, ToolCall>,
  deltas: ToolDelta[],
) {
  for (const delta of deltas) {
    const current = store.get(delta.index) ?? {
      index: delta.index,
      id: "",
      name: "",
      args: "",
    };
    if (delta.id) current.id = delta.id;
    if (delta.name && !current.name) current.name = delta.name;
    if (delta.args) current.args += delta.args;
    store.set(delta.index, current);
  }
}

function makeChain(kind: ProviderKind, messages: ChatMessage[]) {
  if (kind === "google") {
    return messages.map((message) => {
      const images = message.images ?? [];
      if (images.length === 0) {
        return {
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        };
      }
      const parts: unknown[] = images.flatMap((url) => {
        const parsed = parseDataUrl(url);
        return parsed
          ? [{ inlineData: { mimeType: parsed.mimeType, data: parsed.data } }]
          : [];
      });
      parts.push({ text: message.content });
      return {
        role: message.role === "assistant" ? "model" : "user",
        parts,
      };
    }) as UpstreamMessage[];
  }

  if (kind === "anthropic") {
    return messages.map((message) => {
      const images = message.images ?? [];
      if (images.length === 0) {
        return { role: message.role, content: message.content };
      }
      const parts: unknown[] = images.flatMap((url) => {
        const parsed = parseDataUrl(url);
        return parsed
          ? [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: parsed.mimeType,
                  data: parsed.data,
                },
              },
            ]
          : [];
      });
      parts.push({ type: "text", text: message.content });
      return { role: message.role, content: parts };
    }) as UpstreamMessage[];
  }

  return messages.map((message) => {
    const images = message.images ?? [];
    if (images.length === 0) {
      return { role: message.role, content: message.content };
    }
    const parts: unknown[] = [{ type: "text", text: message.content }];
    for (const url of images) {
      parts.push({ type: "image_url", image_url: { url } });
    }
    return { role: message.role, content: parts };
  }) as UpstreamMessage[];
}

function toToolPayload(result: WebSearchResult) {
  return {
    query: result.query,
    results: result.sources.map((source) => ({
      title: source.title,
      url: source.url,
      snippet: source.snippet,
    })),
    excerpt: result.context || undefined,
    error: result.error,
  };
}

function appendToolTurn(
  kind: ProviderKind,
  chain: UpstreamMessage[],
  calls: ToolCall[],
  results: WebSearchResult[],
  assistantText: string,
) {
  const payloads = results.map(toToolPayload);

  if (kind === "openai") {
    chain.push({
      role: "assistant",
      content: assistantText.trim() || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.args || "{}",
        },
      })),
    });
    calls.forEach((call, index) => {
      chain.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(payloads[index]),
      });
    });
    return;
  }

  if (kind === "anthropic") {
    const content: unknown[] = [];
    if (assistantText.trim()) {
      content.push({ type: "text", text: assistantText });
    }
    calls.forEach((call) => {
      let input: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(call.args || "{}") as unknown;
        if (parsed && typeof parsed === "object") {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        // Giữ input rỗng nếu mô hình trả JSON dở.
      }
      content.push({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input,
      });
    });
    chain.push({ role: "assistant", content });
    chain.push({
      role: "user",
      content: calls.map((call, index) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(payloads[index]),
      })),
    });
    return;
  }

  const callParts = calls.map((call) => {
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.args || "{}") as unknown;
      if (parsed && typeof parsed === "object") {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Giữ args rỗng nếu mô hình trả JSON dở.
    }
    return { functionCall: { name: call.name, args } };
  });
  const modelParts: unknown[] = [];
  if (assistantText.trim()) modelParts.push({ text: assistantText });
  modelParts.push(...callParts);
  chain.push({ role: "model", parts: modelParts });
  chain.push({
    role: "user",
    parts: calls.map((call, index) => ({
      functionResponse: {
        name: call.name,
        response: payloads[index],
      },
    })),
  });
}

function reasoningBudget(level?: string) {
  if (level === "Cao") return 8192;
  if (level === "Thấp") return 1024;
  return 4096;
}

function makeBody(options: {
  kind: ProviderKind;
  apiModel: string;
  baseUrl: string;
  chain: UpstreamMessage[];
  system?: string;
  temperature: number;
  reasoning?: string;
  /** Mô hình có hỗ trợ suy luận theo cấu hình hay không. */
  reasoningModel: boolean;
  toolsEnabled: boolean;
  toolChoice?: "auto" | "none";
}) {
  const {
    kind,
    apiModel,
    baseUrl,
    chain,
    system,
    temperature,
    reasoning,
    reasoningModel,
    toolsEnabled,
    toolChoice = "auto",
  } = options;

  if (kind === "anthropic") {
    const budget = reasoningBudget(reasoning);
    const think = reasoningModel && Boolean(reasoning);
    return {
      model: apiModel,
      max_tokens: think ? budget + 4096 : 4096,
      messages: chain,
      stream: true,
      ...(system ? { system } : {}),
      // Bật suy luận mở rộng; tắt thì không gửi "thinking" để Claude trả lời thẳng.
      // Anthropic yêu cầu temperature mặc định khi bật thinking.
      ...(think
        ? { thinking: { type: "enabled", budget_tokens: budget } }
        : { temperature }),
      ...(toolsEnabled
        ? {
            tools: ANTHROPIC_TOOLS,
            ...(toolChoice === "none"
              ? { tool_choice: { type: "none" } }
              : {}),
          }
        : {}),
    } satisfies Record<string, unknown>;
  }

  if (kind === "google") {
    // Gemini 2.5 bật suy luận mặc định: phải đặt budget 0 mới tắt được.
    // Riêng bản Pro không cho tắt hoàn toàn nên dùng mức thấp nhất.
    const thinkingConfig = reasoningModel
      ? reasoning
        ? {
            includeThoughts: true,
            thinkingBudget: reasoningBudget(reasoning),
          }
        : { thinkingBudget: /pro/i.test(apiModel) ? 128 : 0 }
      : null;
    return {
      contents: chain,
      generationConfig: {
        temperature,
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(toolsEnabled
        ? {
            tools: GEMINI_TOOLS,
            ...(toolChoice === "none"
              ? {
                  toolConfig: {
                    functionCallingConfig: { mode: "NONE" },
                  },
                }
              : {}),
          }
        : {}),
    } satisfies Record<string, unknown>;
  }

  const officialOpenAI = /(^|\.)openai\.com/i.test(baseUrl);
  const nativeReasoningModel = /^(o\d|gpt-5)/i.test(apiModel);
  const supportsTemperature = !nativeReasoningModel;
  const effort =
    reasoning === "Cao" ? "high" : reasoning === "Thấp" ? "low" : "medium";

  // Tắt suy luận phải nói rõ với nhà cung cấp; nếu không, mô hình suy luận
  // (DeepSeek, Qwen, Gemini…) vẫn nghĩ theo mặc định của nó.
  const reasoningParams: Record<string, unknown> = {};
  if (reasoningModel) {
    if (reasoning) {
      if (nativeReasoningModel || !officialOpenAI) {
        reasoningParams.reasoning_effort = effort;
      }
    } else if (!officialOpenAI) {
      // Các API tương thích OpenAI (Token Harbor, OpenRouter, DeepSeek…)
      // hiểu "none" là tắt hẳn.
      reasoningParams.reasoning_effort = "none";
    } else if (/^gpt-5\.1/i.test(apiModel)) {
      reasoningParams.reasoning_effort = "none";
    } else if (nativeReasoningModel) {
      // OpenAI o-series/GPT-5 đời đầu không có mức tắt: dùng mức thấp nhất.
      reasoningParams.reasoning_effort = "minimal";
    }
  }

  return {
    model: apiModel,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...chain,
    ],
    stream: true,
    ...(supportsTemperature ? { temperature } : {}),
    ...(toolsEnabled
      ? { tools: OPENAI_TOOLS, tool_choice: toolChoice }
      : {}),
    ...reasoningParams,
  } satisfies Record<string, unknown>;
}

function queryFromCall(call: ToolCall) {
  try {
    const parsed = JSON.parse(call.args || "{}") as { query?: unknown };
    if (typeof parsed.query === "string" && parsed.query.trim()) {
      return parsed.query.trim();
    }
  } catch {
    // Mô hình có thể trả tham số dở dang; thử dùng nguyên văn bên dưới.
  }
  return call.args.trim();
}

async function runToolCall(call: ToolCall): Promise<WebSearchResult> {
  const query = queryFromCall(call).slice(0, 300);
  if (!query) {
    return {
      query: "",
      sources: [],
      context: "",
      error: "Công cụ không nhận được câu truy vấn.",
    };
  }
  try {
    return await searchWeb(query);
  } catch (error) {
    return {
      query,
      sources: [],
      context: "",
      error:
        error instanceof Error
          ? error.message
          : "Không tìm được thông tin trên web.",
    };
  }
}

async function fetchWithIdleTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  register?: (controller: AbortController) => void,
) {
  const controller = new AbortController();
  register?.(controller);
  const parentSignal = options.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  };
  const armTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort(
        new DOMException(
          `Không nhận được dữ liệu từ mô hình trong ${Math.ceil(timeoutMs / 1000)} giây.`,
          "TimeoutError",
        ),
      );
    }, timeoutMs);
  };

  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  armTimeout();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.body) {
      cleanup();
      return response;
    }

    armTimeout();
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanup();
            output.close();
            return;
          }
          armTimeout();
          output.enqueue(value);
        } catch (error) {
          cleanup();
          output.error(error);
          await reader.cancel(error).catch(() => undefined);
        }
      },
      async cancel(reason) {
        cleanup();
        await reader.cancel(reason).catch(() => undefined);
      },
    });

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập để trò chuyện." },
      { status: 401 },
    );
  }

  let payload: ChatPayload;
  try {
    payload = (await request.json()) as ChatPayload;
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 },
    );
  }

  const modelId = payload.model?.id?.trim() ?? "";
  const messages = sanitizeMessages(payload.messages ?? []);

  if (!modelId) {
    return NextResponse.json({ error: "Chưa chọn mô hình." }, { status: 400 });
  }
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "Chưa có nội dung để gửi cho mô hình." },
      { status: 400 },
    );
  }

  // Chỉ tin cấu hình trong database: trình duyệt không được tự đặt base URL
  // hoặc khoá API để gọi nhà cung cấp khác.
  const model = await prisma.model
    .findUnique({
      where: { id: modelId },
      include: { provider: true },
    })
    .catch(() => null);

  if (!model) {
    return NextResponse.json(
      { error: "Mô hình không tồn tại. Chọn lại trong ô nhập." },
      { status: 400 },
    );
  }
  if (!model.enabled || !model.provider.enabled) {
    return NextResponse.json(
      {
        error: `Mô hình ${model.name} đang tắt. Quản trị viên cần bật lại trước khi dùng.`,
      },
      { status: 400 },
    );
  }

  const provider = model.provider;
  const providerId = provider.id;
  const envKey = envKeyFor(providerId);
  const apiKey = isPlaceholderKey(provider.apiKey)
    ? (envKey ?? "")
    : provider.apiKey.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: `Chưa có khoá API cho ${provider.name}. Quản trị viên cần nhập khoá trong Quản trị → Nhà cung cấp API, hoặc đặt biến môi trường trên máy chủ.`,
      },
      { status: 400 },
    );
  }

  const globalSetting = await prisma.setting
    .findUnique({ where: { key: "globalPrompt" } })
    .catch(() => null);

  const settings: Partial<AiSettings> = {
    globalPrompt: globalSetting?.value?.trim() || undefined,
    systemPrompt: model.systemPrompt?.trim() || undefined,
  };

  // Lấy hướng dẫn kỹ năng từ database theo tên, không tin nội dung gửi lên.
  const requestedSkillNames = (payload.skills ?? [])
    .map((skill) => skill.name?.trim() ?? "")
    .filter(Boolean);
  const skillRows =
    requestedSkillNames.length > 0
      ? await prisma.skill
          .findMany({
            where: {
              name: { in: requestedSkillNames },
              enabled: true,
            },
          })
          .catch(() => [])
      : [];
  const skills = skillRows.map((skill) => ({
    name: skill.name,
    instructions: skill.instructions,
  }));

  const allowTools = payload.allowTools !== false;
  const kind: ProviderKind =
    model.protocol === "openai" ||
    model.protocol === "anthropic" ||
    model.protocol === "google"
      ? model.protocol
      : providerKind(providerId, provider.baseUrl);

  let baseUrl = provider.baseUrl.trim().replace(/\/+$/, "");
  if (providerId === "prov-openai" && process.env.OPENAI_BASE_URL) {
    baseUrl = process.env.OPENAI_BASE_URL.trim().replace(/\/+$/, "");
  }
  if (providerId === "prov-anthropic" && process.env.ANTHROPIC_BASE_URL) {
    baseUrl = process.env.ANTHROPIC_BASE_URL.trim().replace(/\/+$/, "");
  }
  if (providerId === "prov-google" && process.env.GOOGLE_AI_BASE_URL) {
    baseUrl = process.env.GOOGLE_AI_BASE_URL.trim().replace(/\/+$/, "");
  }
  if (providerId === "prov-may" && process.env.QYRON_API_BASE_URL) {
    baseUrl = process.env.QYRON_API_BASE_URL.trim().replace(/\/+$/, "");
  }
  if (
    (providerId.includes("huggingface") || providerId.includes("hf")) &&
    process.env.HUGGINGFACE_BASE_URL
  ) {
    baseUrl = process.env.HUGGINGFACE_BASE_URL.trim().replace(/\/+$/, "");
  }

  const apiModel =
    providerId === "prov-may" && process.env.QYRON_MODEL
      ? process.env.QYRON_MODEL
      : model.apiModel?.trim() || FALLBACK_MODEL_IDS[model.id] || model.id;

  let url = "";
  let headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (kind === "anthropic") {
    url = `${baseUrl}/messages`;
    headers = {
      ...headers,
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  } else if (kind === "google") {
    url = `${baseUrl}/models/${encodeURIComponent(
      apiModel,
    )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  } else {
    url = `${baseUrl}/chat/completions`;
    headers = {
      ...headers,
      authorization: `Bearer ${apiKey}`,
    };
  }

  const chain = makeChain(kind, messages);
  const lastUser =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";
  const temperature = 0.7;

  const callUpstream = (
    toolsEnabled: boolean,
    bodySystem: string | undefined,
    toolChoice: "auto" | "none" = "auto",
  ) =>
    fetchWithIdleTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(
          makeBody({
            kind,
            apiModel,
            baseUrl,
            chain,
            system: bodySystem,
            temperature,
            reasoning: payload.reasoning,
            reasoningModel: model.reasoning,
            toolsEnabled,
            toolChoice,
          }),
        ),
        signal: request.signal,
        cache: "no-store",
      },
      UPSTREAM_IDLE_TIMEOUT_MS,
      (controller) => {
        activeController = controller;
      },
    );

  const encoder = new TextEncoder();
  let activeController: AbortController | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Mỗi dòng là một khung JSON:
      // r = suy nghĩ, a = câu trả lời, p = tiến trình, s = nguồn,
      // c = xoá nháp, e = lỗi, h = giữ kết nối.
      const send = (frame: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
      };
      heartbeat = setInterval(() => send({ t: "h" }), STREAM_HEARTBEAT_MS);

      try {
        let toolsEnabled = allowTools;
        let webResult: WebSearchResult | null = null;

        // Lớp chắc chắn: câu hỏi rõ ràng cần dữ liệu mới thì tra web trước,
        // kể cả khi mô hình không hỗ trợ tool calling.
        if (allowTools && lastUser) {
          const intent = detectSearchIntent(lastUser);
          if (intent.needsSearch) {
            send({ t: "p", v: "search" });
            webResult = await searchWeb(intent.query);
            send({
              t: "s",
              v: webResult.sources,
              ...(webResult.sources.length === 0 && webResult.error
                ? { e: webResult.error }
                : {}),
            });
            toolsEnabled = false;
          }
        }

        let currentSystem = buildSystemPrompt(
          settings,
          skills,
          payload.reasoning,
          toolsEnabled,
          webResult ?? undefined,
        );

        let upstream: Response;
        try {
          upstream = await callUpstream(toolsEnabled, currentSystem);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Không gọi được API.";
          send({
            t: "e",
            v: `Không kết nối được ${provider.name}: ${message}. Kiểm tra base URL và kết nối mạng.`,
          });
          return;
        }

        // Nhà cung cấp không hỗ trợ tools: tra web dự phòng rồi thử lại.
        if (
          !upstream.ok &&
          toolsEnabled &&
          (upstream.status === 400 || upstream.status === 422)
        ) {
          const detail = await readErrorMessage(upstream);
          toolsEnabled = false;

          const toolIssue =
            /tool|function|tool_choice|unsupported|not supported/i.test(
              detail,
            );

          if (toolIssue && webResult === null) {
            const intent = detectSearchIntent(lastUser);
            if (intent.needsSearch) {
              send({ t: "p", v: "search" });
              webResult = await searchWeb(intent.query);
              send({
                t: "s",
                v: webResult.sources,
                ...(webResult.sources.length === 0 && webResult.error
                  ? { e: webResult.error }
                  : {}),
              });
            }
          }

          currentSystem = buildSystemPrompt(
            settings,
            skills,
            payload.reasoning,
            false,
            webResult ?? undefined,
          );

          try {
            upstream = await callUpstream(false, currentSystem);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Không gọi được API.";
            send({
              t: "e",
              v: `Không kết nối được ${provider.name}: ${message}. Kiểm tra base URL và kết nối mạng.`,
            });
            return;
          }
        }

        if (!upstream.ok) {
          const detail = await readErrorMessage(upstream);
          send({
            t: "e",
            v: `${provider.name} báo lỗi ${upstream.status}: ${detail}`,
          });
          return;
        }

        if (!upstream.body) {
          send({ t: "e", v: `${provider.name} không trả về nội dung.` });
          return;
        }

        let current = upstream;
        let rounds = 0;

        while (true) {
          const body = current.body;
          if (!body) throw new Error("Không đọc được luồng phản hồi.");

          const toolStore = new Map<number, ToolCall>();
          let answerText = "";
          let sawText = false;

          for await (const raw of sseData(body)) {
            if (raw === "[DONE]") break;
            const parts = extractParts(kind, raw);
            // Nhà cung cấp trả về suy nghĩ thì hiển thị đầy đủ, kể cả khi
            // model không hỗ trợ tắt suy luận.
            for (const chunk of parts.reasoning) send({ t: "r", v: chunk });
            for (const chunk of parts.text) {
              answerText += chunk;
              sawText = true;
              send({ t: "a", v: chunk });
            }
            if (parts.tools.length > 0) {
              mergeToolDeltas(toolStore, parts.tools);
            }
          }

          const calls = [...toolStore.values()].filter((call) => call.name);
          if (!calls.length || !toolsEnabled) break;
          if (rounds >= 1) break;

          // Mô hình quyết định tra web: bỏ phần nháp (nếu có), báo tiến trình.
          if (sawText) send({ t: "c" });
          send({ t: "p", v: "search" });

          rounds += 1;
          const results = await Promise.all(calls.map(runToolCall));
          const sources = mergeWebSources(results);
          const errors = results
            .map((result) => result.error)
            .filter((value): value is string => Boolean(value));
          send({
            t: "s",
            v: sources,
            ...(sources.length === 0 && errors.length > 0
              ? { e: errors.join(" ") }
              : {}),
          });

          appendToolTurn(kind, chain, calls, results, answerText);

          let next: Response;
          try {
            // Đã tra cứu xong: bỏ tools để mô hình buộc phải viết câu trả lời.
            const finalSystem = [
              buildSystemPrompt(
                settings,
                skills,
                payload.reasoning,
                false,
              ),
              "Bạn đã tra cứu web xong. Hãy trả lời ngay dựa trên kết quả đã có; không gọi thêm công cụ.",
            ]
              .filter(Boolean)
              .join("\n\n");
            next = await callUpstream(false, finalSystem);
            toolsEnabled = false;
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Không gọi lại được API.";
            send({
              t: "e",
              v: `Không gọi lại được ${provider.name}: ${message}`,
            });
            return;
          }

          if (!next.ok) {
            const detail = await readErrorMessage(next);
            send({
              t: "e",
              v: `${provider.name} báo lỗi ${next.status}: ${detail}`,
            });
            return;
          }

          current = next;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Lỗi không xác định.";
        send({ t: "e", v: `Qyron không đọc được phản hồi: ${message}` });
      } finally {
        clearInterval(heartbeat);
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      clearInterval(heartbeat);
      activeController?.abort(
        new DOMException("Người dùng đã dừng trả lời.", "AbortError"),
      );
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
