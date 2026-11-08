import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  ModelProbeMetadata,
  ModelProbeResult,
  ModelProbeTools,
  ModelProtocol,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Json = Record<string, unknown>;

interface ProbeAttempt {
  ok: boolean;
  tokens: number;
  estimated: boolean;
  error?: string;
}

interface Upstream {
  response: Response;
  json: unknown;
  raw: string;
}

const REQUEST_TIMEOUT = 30_000;
const PROBE_TIMEOUT = 60_000;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function providerKind(
  protocol: string,
  providerId: string,
  baseUrl: string,
): ModelProtocol {
  if (
    protocol === "openai" ||
    protocol === "anthropic" ||
    protocol === "google"
  ) {
    return protocol;
  }
  const key = `${providerId} ${baseUrl}`.toLocaleLowerCase("vi");
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

function resolveBaseUrl(providerId: string, baseUrl: string) {
  let value = baseUrl.trim().replace(/\/+$/, "");
  if (providerId === "prov-openai" && process.env.OPENAI_BASE_URL) {
    value = process.env.OPENAI_BASE_URL.trim().replace(/\/+$/, "");
  }
  if (providerId === "prov-anthropic" && process.env.ANTHROPIC_BASE_URL) {
    value = process.env.ANTHROPIC_BASE_URL.trim().replace(/\/+$/, "");
  }
  if (providerId === "prov-google" && process.env.GOOGLE_AI_BASE_URL) {
    value = process.env.GOOGLE_AI_BASE_URL.trim().replace(/\/+$/, "");
  }
  return value;
}

function upstreamError(json: unknown, raw: string, status: number) {
  if (isRecord(json)) {
    const error = json.error;
    if (typeof error === "string") return error;
    if (isRecord(error) && typeof error.message === "string") {
      return error.message;
    }
    if (typeof json.message === "string") return json.message;
  }
  const text = raw.trim();
  return text ? text.slice(0, 300) : `Nhà cung cấp trả về lỗi ${status}.`;
}

async function getJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = REQUEST_TIMEOUT,
): Promise<Upstream> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await response.text().catch(() => "");
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { response, json, raw };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = PROBE_TIMEOUT,
): Promise<Upstream> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await response.text().catch(() => "");
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { response, json, raw };
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(
  kind: ModelProtocol,
  apiKey: string,
): Record<string, string> {
  if (kind === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  if (kind === "google") return {};
  return { authorization: `Bearer ${apiKey}` };
}

function findEntry(list: Json[], apiModel: string): Json | null {
  const lower = apiModel.toLocaleLowerCase("en");
  const stripped = lower.split(":")[0];
  const idOf = (entry: Json) =>
    typeof entry.id === "string"
      ? entry.id.toLocaleLowerCase("en")
      : typeof entry.name === "string"
        ? entry.name.toLocaleLowerCase("en")
        : "";
  return (
    list.find((entry) => idOf(entry) === lower) ??
    list.find((entry) => idOf(entry).replace(/^models\//, "") === lower) ??
    list.find((entry) => idOf(entry) === stripped) ??
    list.find((entry) => idOf(entry).replace(/^models\//, "") === stripped) ??
    list.find((entry) => idOf(entry).endsWith(`/${lower}`)) ??
    null
  );
}

function pricingLabel(entry: Json) {
  const pricing = isRecord(entry.pricing) ? entry.pricing : null;
  if (!pricing) return undefined;
  // Token Harbor trả giá theo 1M token; OpenRouter trả giá theo 1 token.
  const normalize = (value: number | undefined) => {
    if (value === undefined) return undefined;
    return value > 0 && value < 0.01 ? value * 1_000_000 : value;
  };
  const input = normalize(
    readNumber(pricing.input_usd_per_1m) ?? readNumber(pricing.prompt),
  );
  const output = normalize(
    readNumber(pricing.output_usd_per_1m) ?? readNumber(pricing.completion),
  );
  if (input === undefined && output === undefined) return undefined;
  if (input === 0 && output === 0) return "Miễn phí";
  const format = (value: number | undefined) =>
    value === undefined ? "?" : Number(value.toFixed(4)).toString();
  return `${format(input)} USD / 1M vào · ${format(output)} USD / 1M ra`;
}

async function readMetadata(
  kind: ModelProtocol,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
): Promise<ModelProbeMetadata> {
  const endpoint = `${baseUrl}/models`;
  try {
    if (kind === "google") {
      const { response, json, raw } = await getJson(
        `${endpoint}?key=${encodeURIComponent(apiKey)}&pageSize=200`,
      );
      if (!response.ok) {
        return {
          ok: false,
          found: false,
          endpoint,
          error: upstreamError(json, raw, response.status),
        };
      }
      const root = isRecord(json) ? json : {};
      const list = Array.isArray(root.models)
        ? root.models.filter(isRecord)
        : [];
      const entry = findEntry(list, apiModel);
      if (!entry) {
        return { ok: true, found: false, endpoint };
      }
      return {
        ok: true,
        found: true,
        endpoint,
        contextLength: readNumber(entry.inputTokenLimit),
        maxOutputTokens: readNumber(entry.outputTokenLimit),
      };
    }

    const response = await fetchResponse(kind, endpoint, apiKey);
    if (!response.response.ok) {
      return {
        ok: false,
        found: false,
        endpoint,
        error: upstreamError(
          response.json,
          response.raw,
          response.response.status,
        ),
      };
    }
    const root = isRecord(response.json) ? response.json : {};
    const list = Array.isArray(root.data) ? root.data.filter(isRecord) : [];
    const entry = findEntry(list, apiModel);
    if (!entry) {
      return { ok: true, found: false, endpoint };
    }

    const supported = Array.isArray(entry.supported_parameters)
      ? entry.supported_parameters.filter(
          (item): item is string => typeof item === "string",
        )
      : null;
    const toolCall =
      readBoolean(entry.tool_call) ??
      (supported
        ? supported.includes("tools") || supported.includes("tool_choice")
        : undefined);
    const reasoning =
      readBoolean(entry.reasoning) ??
      (supported
        ? supported.some((param) =>
            ["reasoning", "include_reasoning", "reasoning_effort"].includes(
              param,
            ),
          )
        : undefined);

    return {
      ok: true,
      found: true,
      endpoint,
      contextLength: readNumber(
        entry.context_length ??
          entry.context_window ??
          entry.max_context_length ??
          (isRecord(entry.top_provider)
            ? entry.top_provider.context_length
            : undefined),
      ),
      maxOutputTokens: readNumber(
        entry.max_output_tokens ??
          (isRecord(entry.top_provider)
            ? entry.top_provider.max_completion_tokens
            : undefined),
      ),
      toolCall,
      functionCall: readBoolean(entry.function_call) ?? toolCall,
      promptCache: readBoolean(entry.supports_prompt_cache),
      reasoning,
      pricing: pricingLabel(entry),
    };
  } catch (error) {
    return {
      ok: false,
      found: false,
      endpoint,
      error:
        error instanceof Error
          ? error.message
          : "Không đọc được metadata của nhà cung cấp.",
    };
  }
}

function fetchResponse(
  kind: ModelProtocol,
  endpoint: string,
  apiKey: string,
) {
  if (kind === "anthropic") {
    return getJson(`${endpoint}?limit=1000`, authHeaders(kind, apiKey));
  }
  return getJson(endpoint, authHeaders(kind, apiKey));
}

/* ------------------------------------------------------------------ */
/* Dò suy luận                                                        */
/* ------------------------------------------------------------------ */

const PROBE_PROMPT = "Chỉ trả lời đúng một từ: 2+2 bằng mấy?";

function reasoningTokensFromText(texts: unknown[], reported?: number) {
  const text = texts
    .filter((value): value is string => typeof value === "string")
    .join("");
  if (reported !== undefined) {
    return { tokens: reported, estimated: false };
  }
  if (!text) return { tokens: 0, estimated: false };
  // API không trả số token suy luận: ước lượng khoảng 4 ký tự mỗi token.
  return { tokens: Math.max(1, Math.ceil(text.length / 4)), estimated: true };
}

async function probeOpenAiReasoning(
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  mode: "off" | "high",
): Promise<ProbeAttempt> {
  const native = /^(o\d|gpt-5)/i.test(apiModel);
  const body: Json = {
    model: apiModel,
    messages: [{ role: "user", content: PROBE_PROMPT }],
    stream: false,
    reasoning_effort: mode === "off" ? "none" : "high",
  };
  if (native) {
    body.max_completion_tokens = mode === "off" ? 256 : 2048;
  } else {
    body.max_tokens = mode === "off" ? 256 : 1024;
  }

  const { response, json, raw } = await postJson(
    `${baseUrl}/chat/completions`,
    { authorization: `Bearer ${apiKey}` },
    body,
  );
  if (!response.ok) {
    return {
      ok: false,
      tokens: 0,
      estimated: false,
      error: upstreamError(json, raw, response.status),
    };
  }

  const root = isRecord(json) ? json : {};
  const choice =
    Array.isArray(root.choices) && isRecord(root.choices[0])
      ? root.choices[0]
      : {};
  const message = isRecord(choice.message) ? choice.message : {};
  const usage = isRecord(root.usage) ? root.usage : {};
  const details = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {};
  const reported =
    readNumber(details.reasoning_tokens) ??
    readNumber(usage.reasoning_tokens);
  const result = reasoningTokensFromText(
    [message.reasoning_content, message.reasoning],
    reported,
  );
  return { ok: true, ...result };
}

async function probeAnthropicReasoning(
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  mode: "off" | "high",
): Promise<ProbeAttempt> {
  const body: Json = {
    model: apiModel,
    max_tokens: mode === "off" ? 64 : 1400,
    messages: [{ role: "user", content: PROBE_PROMPT }],
  };
  if (mode === "high") {
    body.thinking = { type: "enabled", budget_tokens: 1024 };
  }

  const { response, json, raw } = await postJson(
    `${baseUrl}/messages`,
    authHeaders("anthropic", apiKey),
    body,
  );
  if (!response.ok) {
    return {
      ok: false,
      tokens: 0,
      estimated: false,
      error: upstreamError(json, raw, response.status),
    };
  }

  const root = isRecord(json) ? json : {};
  const content = Array.isArray(root.content)
    ? root.content.filter(isRecord)
    : [];
  const thinking = content
    .filter((block) => block.type === "thinking")
    .map((block) => block.thinking);
  const usage = isRecord(root.usage) ? root.usage : {};
  const details = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : {};
  const reported = readNumber(details.thinking_tokens);
  const result = reasoningTokensFromText(thinking, reported);
  return { ok: true, ...result };
}

async function probeGoogleReasoning(
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  mode: "off" | "high",
): Promise<ProbeAttempt> {
  const url = `${baseUrl}/models/${encodeURIComponent(
    apiModel,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body: Json = {
    contents: [{ role: "user", parts: [{ text: PROBE_PROMPT }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: mode === "off" ? 128 : 2048,
      thinkingConfig:
        mode === "off"
          ? { thinkingBudget: 0 }
          : { thinkingBudget: 1024, includeThoughts: true },
    },
  };

  const { response, json, raw } = await postJson(url, {}, body);
  if (!response.ok) {
    return {
      ok: false,
      tokens: 0,
      estimated: false,
      error: upstreamError(json, raw, response.status),
    };
  }

  const root = isRecord(json) ? json : {};
  const candidate =
    Array.isArray(root.candidates) && isRecord(root.candidates[0])
      ? root.candidates[0]
      : {};
  const content = isRecord(candidate.content) ? candidate.content : {};
  const parts = Array.isArray(content.parts)
    ? content.parts.filter(isRecord)
    : [];
  const thinking = parts
    .filter((part) => part.thought === true)
    .map((part) => part.text);
  const usageMetadata = isRecord(root.usageMetadata)
    ? root.usageMetadata
    : {};
  const reported = readNumber(usageMetadata.thoughtsTokenCount);
  const result = reasoningTokensFromText(thinking, reported);
  return { ok: true, ...result };
}

function probeReasoning(
  kind: ModelProtocol,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
  mode: "off" | "high",
) {
  if (kind === "anthropic") {
    return probeAnthropicReasoning(baseUrl, apiKey, apiModel, mode);
  }
  if (kind === "google") {
    return probeGoogleReasoning(baseUrl, apiKey, apiModel, mode);
  }
  return probeOpenAiReasoning(baseUrl, apiKey, apiModel, mode);
}

async function attempt(run: () => Promise<ProbeAttempt>): Promise<ProbeAttempt> {
  try {
    return await run();
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Nhà cung cấp phản hồi quá lâu."
        : error instanceof Error
          ? error.message
          : "Không kết nối được nhà cung cấp.";
    return { ok: false, tokens: 0, estimated: false, error: message };
  }
}

function reasoningRejected(value: ProbeAttempt) {
  return (
    !value.ok &&
    /reason|think|budget|effort|unsupported|not supported|invalid/i.test(
      value.error ?? "",
    )
  );
}

function budgetHint(
  kind: ModelProtocol,
  apiModel: string,
  highTokens: number | null,
) {
  if (kind === "google") {
    return /pro/i.test(apiModel)
      ? "Gemini Pro: ngân sách suy nghĩ tối thiểu 128, tối đa 32.768 token (tài liệu Google)."
      : "Gemini Flash: ngân sách suy nghĩ 0–24.576 token (tài liệu Google).";
  }
  if (kind === "anthropic") {
    return "Claude: ngân sách suy nghĩ tối thiểu 1.024 token; Qyron gửi 1.024 / 4.096 / 8.192 theo mức Thấp / Vừa / Cao.";
  }
  if (/^(o\d|gpt-5)/i.test(apiModel)) {
    return "OpenAI dùng mức effort thấp/trung bình/cao, không đặt ngân sách token trực tiếp.";
  }
  if (highTokens !== null && highTokens > 0) {
    return `Lần dò mức cao dùng ${highTokens.toLocaleString(
      "vi-VN",
    )} token suy nghĩ; API không công bố ngân sách tối đa.`;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Dò công cụ (nền tảng của MCP)                                      */
/* ------------------------------------------------------------------ */

const TOOL_PROMPT =
  'Hãy gọi công cụ probe_ping với value là "ok". Không trả lời bằng chữ.';

interface ToolAttempt {
  supported: boolean | null;
  error?: string;
}

function tokenLimit(apiModel: string, value: number) {
  return /^(o\d|gpt-5)/i.test(apiModel)
    ? { max_completion_tokens: value }
    : { max_tokens: value };
}

async function probeOpenAiTools(
  baseUrl: string,
  apiKey: string,
  apiModel: string,
): Promise<ToolAttempt> {
  const run = async (toolChoice: string) => {
    const body: Json = {
      model: apiModel,
      messages: [{ role: "user", content: TOOL_PROMPT }],
      stream: false,
      tools: [
        {
          type: "function",
          function: {
            name: "probe_ping",
            description: "Kiểm tra khả năng gọi công cụ. Luôn gọi công cụ này.",
            parameters: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
            },
          },
        },
      ],
      tool_choice: toolChoice,
      ...tokenLimit(apiModel, 256),
    };
    const upstream = await postJson(
      `${baseUrl}/chat/completions`,
      { authorization: `Bearer ${apiKey}` },
      body,
    );
    return { ...upstream, toolChoice };
  };

  let result = await run("required");
  if (
    !result.response.ok &&
    /tool_choice|required|unsupported|not supported/i.test(
      upstreamError(result.json, result.raw, result.response.status),
    )
  ) {
    result = await run("auto");
  }
  if (!result.response.ok) {
    return {
      supported: null,
      error: upstreamError(result.json, result.raw, result.response.status),
    };
  }

  const root = isRecord(result.json) ? result.json : {};
  const choice =
    Array.isArray(root.choices) && isRecord(root.choices[0])
      ? root.choices[0]
      : {};
  const message = isRecord(choice.message) ? choice.message : {};
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return {
    supported: calls.length > 0 || choice.finish_reason === "tool_calls",
  };
}

async function probeAnthropicTools(
  baseUrl: string,
  apiKey: string,
  apiModel: string,
): Promise<ToolAttempt> {
  const run = async (toolChoice: Json) => {
    const body: Json = {
      model: apiModel,
      max_tokens: 512,
      messages: [{ role: "user", content: TOOL_PROMPT }],
      tools: [
        {
          name: "probe_ping",
          description: "Kiểm tra khả năng gọi công cụ. Luôn gọi công cụ này.",
          input_schema: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
        },
      ],
      tool_choice: toolChoice,
    };
    return postJson(`${baseUrl}/messages`, authHeaders("anthropic", apiKey), body);
  };

  let result = await run({ type: "any" });
  if (
    !result.response.ok &&
    /tool_choice|unsupported|not supported|invalid/i.test(
      upstreamError(result.json, result.raw, result.response.status),
    )
  ) {
    result = await run({ type: "auto" });
  }
  if (!result.response.ok) {
    return {
      supported: null,
      error: upstreamError(result.json, result.raw, result.response.status),
    };
  }

  const root = isRecord(result.json) ? result.json : {};
  const content = Array.isArray(root.content)
    ? root.content.filter(isRecord)
    : [];
  return {
    supported: content.some((block) => block.type === "tool_use"),
  };
}

async function probeGoogleTools(
  baseUrl: string,
  apiKey: string,
  apiModel: string,
): Promise<ToolAttempt> {
  const run = async (mode: string) => {
    const url = `${baseUrl}/models/${encodeURIComponent(
      apiModel,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body: Json = {
      contents: [{ role: "user", parts: [{ text: TOOL_PROMPT }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: "probe_ping",
              description:
                "Kiểm tra khả năng gọi công cụ. Luôn gọi công cụ này.",
              parameters: {
                type: "OBJECT",
                properties: { value: { type: "STRING" } },
                required: ["value"],
              },
            },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode } },
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
    };
    return postJson(url, {}, body);
  };

  let result = await run("ANY");
  if (
    !result.response.ok &&
    /tool|function|mode|unsupported|not supported|invalid/i.test(
      upstreamError(result.json, result.raw, result.response.status),
    )
  ) {
    result = await run("AUTO");
  }
  if (!result.response.ok) {
    return {
      supported: null,
      error: upstreamError(result.json, result.raw, result.response.status),
    };
  }

  const root = isRecord(result.json) ? result.json : {};
  const candidate =
    Array.isArray(root.candidates) && isRecord(root.candidates[0])
      ? root.candidates[0]
      : {};
  const content = isRecord(candidate.content) ? candidate.content : {};
  const parts = Array.isArray(content.parts)
    ? content.parts.filter(isRecord)
    : [];
  return { supported: parts.some((part) => isRecord(part.functionCall)) };
}

function probeTools(
  kind: ModelProtocol,
  baseUrl: string,
  apiKey: string,
  apiModel: string,
): Promise<ToolAttempt> {
  if (kind === "anthropic") {
    return probeAnthropicTools(baseUrl, apiKey, apiModel);
  }
  if (kind === "google") {
    return probeGoogleTools(baseUrl, apiKey, apiModel);
  }
  return probeOpenAiTools(baseUrl, apiKey, apiModel);
}

/* ------------------------------------------------------------------ */
/* Endpoint                                                           */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập." },
      { status: 401 },
    );
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Chỉ quản trị viên được kiểm tra mô hình." },
      { status: 403 },
    );
  }

  let body: { modelId?: string; contextOnly?: boolean };
  try {
    body = (await request.json()) as {
      modelId?: string;
      contextOnly?: boolean;
    };
  } catch {
    return NextResponse.json(
      { error: "JSON không hợp lệ." },
      { status: 400 },
    );
  }

  const modelId = body.modelId?.trim() ?? "";
  if (!modelId) {
    return NextResponse.json(
      { error: "Chưa chọn mô hình." },
      { status: 400 },
    );
  }

  const model = await prisma.model
    .findUnique({ where: { id: modelId }, include: { provider: true } })
    .catch(() => null);
  if (!model) {
    return NextResponse.json(
      { error: "Mô hình không tồn tại." },
      { status: 404 },
    );
  }

  const apiModel = model.apiModel?.trim() || model.id;
  const provider = model.provider;
  const envKey = envKeyFor(provider.id);
  const apiKey = isPlaceholderKey(provider.apiKey)
    ? (envKey ?? "")
    : provider.apiKey.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: `Chưa có khoá API cho ${provider.name}. Nhập khoá trong Quản trị → Nhà cung cấp API trước khi kiểm tra.`,
      },
      { status: 400 },
    );
  }

  const started = Date.now();
  const kind = providerKind(model.protocol, provider.id, provider.baseUrl);
  const baseUrl = resolveBaseUrl(provider.id, provider.baseUrl);
  const notes: string[] = [];

  const metadata = await readMetadata(kind, baseUrl, apiKey, apiModel);

  // Cửa sổ ngữ cảnh chỉ lấy từ API, không cho nhập tay. Lưu luôn vào mô hình
  // để lần sau mở Quản trị vẫn thấy đúng số của nhà cung cấp.
  let contextWindow: string | undefined;
  if (metadata.ok && metadata.found && metadata.contextLength) {
    contextWindow = metadata.contextLength.toLocaleString("vi-VN");
    await prisma.model
      .update({
        where: { id: model.id },
        data: { contextWindow },
      })
      .catch(() => undefined);
    notes.push(
      `Đã lưu cửa sổ ngữ cảnh ${contextWindow} token từ API vào mô hình.`,
    );
  } else if (metadata.ok && metadata.found) {
    notes.push(
      "Nhà cung cấp không công bố cửa sổ ngữ cảnh cho mô hình này, nên chưa lưu được.",
    );
  }

  if (!metadata.ok) {
    notes.push(
      "Không đọc được danh sách mô hình của nhà cung cấp; phần còn lại vẫn được dò trực tiếp.",
    );
  } else if (!metadata.found) {
    notes.push(
      "Không tìm thấy mô hình trong danh sách của nhà cung cấp; kết quả dựa trên dò trực tiếp.",
    );
  }

  // Chế độ chỉ kiểm tra ngữ cảnh: dùng cho nút “Kiểm tra” trong hộp sửa mô
  // hình. Chỉ đọc danh sách mô hình nên nhanh và không tốn token sinh chữ.
  if (body.contextOnly) {
    return NextResponse.json({
      ok: Boolean(contextWindow),
      contextWindow,
      metadata,
      notes,
      error: contextWindow
        ? undefined
        : (metadata.error ??
          "Nhà cung cấp không công bố cửa sổ ngữ cảnh cho mô hình này."),
    });
  }

  // Gửi hai yêu cầu thử song song để rút ngắn thời gian chờ.
  const [offAttempt, highAttempt] = await Promise.all([
    attempt(() => probeReasoning(kind, baseUrl, apiKey, apiModel, "off")),
    attempt(() => probeReasoning(kind, baseUrl, apiKey, apiModel, "high")),
  ]);

  const offHas = offAttempt.ok && offAttempt.tokens > 0;
  const highHas = highAttempt.ok && highAttempt.tokens > 0;

  let supported: boolean | null;
  if (highHas || offHas) {
    supported = true;
  } else if (
    reasoningRejected(offAttempt) ||
    reasoningRejected(highAttempt)
  ) {
    supported = false;
  } else if (offAttempt.ok || highAttempt.ok) {
    supported = metadata.reasoning ?? false;
  } else {
    supported = metadata.reasoning ?? null;
  }

  let canDisable: boolean | null = null;
  if (highHas) {
    if (offAttempt.ok) {
      canDisable = !offHas;
    } else if (reasoningRejected(offAttempt)) {
      // Nhà cung cấp từ chối tham số tắt suy luận, ví dụ Gemini Pro với budget 0.
      canDisable = false;
    }
  }

  const reasoningErrors: string[] = [];
  if (!offAttempt.ok && offAttempt.error) {
    reasoningErrors.push(`Mức tắt: ${offAttempt.error}`);
  }
  if (!highAttempt.ok && highAttempt.error) {
    reasoningErrors.push(`Mức cao: ${highAttempt.error}`);
  }
  const estimated =
    (offAttempt.ok && offAttempt.estimated) ||
    (highAttempt.ok && highAttempt.estimated);
  if (estimated) {
    notes.push(
      "Số token suy luận được ước lượng từ nội dung trả về vì API không kèm usage riêng.",
    );
  }

  const metaTool = metadata.toolCall ?? metadata.functionCall;
  let tools: ModelProbeTools;
  if (typeof metaTool === "boolean") {
    tools = { source: "metadata", supported: metaTool };
  } else {
    try {
      const probe = await probeTools(kind, baseUrl, apiKey, apiModel);
      tools = {
        source: "probe",
        supported: probe.supported,
        error: probe.error,
      };
    } catch (error) {
      tools = {
        source: "probe",
        supported: null,
        error:
          error instanceof Error
            ? error.message
            : "Không dò được khả năng gọi công cụ.",
      };
    }
  }

  if (tools.supported === true) {
    notes.push(
      "MCP là giao thức phía client: mô hình chỉ cần gọi được công cụ là ứng dụng có thể đưa kết quả MCP vào câu trả lời.",
    );
  }
  if (supported === true && metadata.reasoning === false) {
    notes.push(
      "Metadata nói mô hình không hỗ trợ suy luận nhưng lần dò mức cao vẫn trả về suy nghĩ.",
    );
  }

  const result: ModelProbeResult = {
    modelId: model.id,
    modelName: model.name,
    apiModel,
    providerName: provider.name,
    protocol: kind,
    durationMs: Date.now() - started,
    contextWindow,
    metadata,
    reasoning: {
      supported,
      canDisable,
      offTokens: offAttempt.ok ? offAttempt.tokens : null,
      highTokens: highAttempt.ok ? highAttempt.tokens : null,
      estimated,
      budgetHint: budgetHint(
        kind,
        apiModel,
        highAttempt.ok ? highAttempt.tokens : null,
      ),
      error: reasoningErrors.length > 0 ? reasoningErrors.join("\n") : undefined,
    },
    tools,
    notes,
  };

  return NextResponse.json({ ok: true, result });
}
