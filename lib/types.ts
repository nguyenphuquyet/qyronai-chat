export type StepStatus = "done" | "running" | "error";

export interface Step {
  label: string;
  detail?: string;
  status: StepStatus;
}

export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "note"; text: string };

export type MessageState = "done" | "thinking" | "streaming" | "stopped" | "error";

/** Một trang web được dùng làm nguồn cho câu trả lời. */
export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

/** Một tệp người dùng đính kèm vào câu hỏi. */
export interface Attachment {
  name: string;
  /** Kích thước tệp gốc, tính bằng byte. */
  size: number;
  /** text: đã trích được chữ; image: gửi ảnh cho mô hình xem. */
  kind: "text" | "image";
  /** Nội dung chữ đã trích từ tệp (với tệp văn bản, PDF, Word). */
  text?: string;
  /** Ảnh nén sẵn dạng data URL (với tệp ảnh). */
  dataUrl?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  /** Chữ thường của tin người dùng, và nội dung đang chạy của trợ lý. */
  text?: string;
  /** Tệp người dùng gửi kèm câu hỏi. */
  attachments?: Attachment[];
  /** Nội dung có cấu trúc của câu trả lời đã xong. */
  blocks?: Block[];
  steps?: Step[];
  state?: MessageState;
  error?: { title: string; detail: string };
  suggestions?: string[];
  /** Tên các kỹ năng đã dùng cho câu trả lời này. */
  skills?: string[];
  /** Quá trình suy nghĩ do mô hình trả về (hiện trong nút xổ xuống). */
  reasoning?: string;
  /** Các trang web đã đọc khi bật tìm kiếm web. */
  sources?: WebSource[];
}

export type SkillIconName =
  | "guide"
  | "art"
  | "theme"
  | "design"
  | "code"
  | "check"
  | "doc"
  | "pdf"
  | "layout"
  | "comms"
  | "plug"
  | "slides"
  | "sheet"
  | "skill"
  | "gif"
  | "test";

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: string;
  icon: SkillIconName;
  enabled: boolean;
  uses: number;
  builtin?: boolean;
}

export type SkillInput = Pick<
  Skill,
  "name" | "description" | "category" | "instructions"
>;

export type UserRole = "admin" | "user";

/** Tài khoản đang đăng nhập, chỉ chứa dữ liệu an toàn để gửi xuống trình duyệt. */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: string;
}

export type ConversationGroup = "Hôm nay" | "Hôm qua" | "7 ngày trước";

export interface Conversation {
  id: string;
  title: string;
  group: ConversationGroup;
  updatedAt: string;
  pinned?: boolean;
  messages: Message[];
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  note?: string;
  builtin?: boolean;
}

export type ProviderInput = Pick<
  Provider,
  "name" | "baseUrl" | "apiKey" | "note"
> & { enabled: boolean };

/** Cách gửi và đọc phản hồi của từng nhà cung cấp. */
export type ModelProtocol = "openai" | "anthropic" | "google";

export const modelProtocols: {
  id: ModelProtocol;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    id: "openai",
    label: "OpenAI compatible",
    hint: "Dùng /chat/completions. Hợp với OpenAI, OpenRouter, Hugging Face, Together…",
    placeholder: "gpt-4.1 hoặc Qwen/Qwen3.8-27B",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Dùng /messages với header x-api-key.",
    placeholder: "claude-sonnet-4-5",
  },
  {
    id: "google",
    label: "Google Gemini",
    hint: "Dùng generateContent với khoá trong query.",
    placeholder: "gemini-2.5-flash",
  },
];

export function inferProtocol(
  providerId: string,
  baseUrl = "",
): ModelProtocol {
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

/** Biểu tượng có thể chọn cho một mô hình. */
export type ModelIconName =
  | "sparkles"
  | "bot"
  | "brain"
  | "zap"
  | "gem"
  | "feather"
  | "orbit"
  | "boxes"
  | "rocket"
  | "cpu"
  | "cloud"
  | "flame";

export const modelIconOptions: { id: ModelIconName; label: string }[] = [
  { id: "sparkles", label: "Lấp lánh" },
  { id: "bot", label: "Rô-bốt" },
  { id: "brain", label: "Bộ não" },
  { id: "zap", label: "Tia chớp" },
  { id: "gem", label: "Đá quý" },
  { id: "feather", label: "Lông vũ" },
  { id: "orbit", label: "Quỹ đạo" },
  { id: "boxes", label: "Khối hộp" },
  { id: "rocket", label: "Tên lửa" },
  { id: "cpu", label: "Vi xử lý" },
  { id: "cloud", label: "Đám mây" },
  { id: "flame", label: "Ngọn lửa" },
];

/** Gợi ý biểu tượng theo nhà cung cấp khi chưa chọn tay. */
export function inferModelIcon(
  providerId: string,
  apiModel = "",
): ModelIconName {
  const key = `${providerId} ${apiModel}`.toLocaleLowerCase("vi");
  if (key.includes("anthropic") || key.includes("claude")) return "feather";
  if (key.includes("google") || key.includes("gemini")) return "sparkles";
  if (key.includes("huggingface") || key.includes("qwen")) return "boxes";
  if (key.includes("openai") || key.includes("gpt")) return "bot";
  if (key.includes("qyron")) return "sparkles";
  return "orbit";
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  providerId: string;
  contextWindow?: string;
  badge?: string;
  /** Mã mô hình thật dùng khi gọi API, ví dụ gpt-4.1 hoặc Qwen/Qwen3.8-27B. */
  apiModel?: string;
  /** Giao thức dùng để gọi mô hình này. */
  protocol?: ModelProtocol;
  /** Biểu tượng hiển thị cạnh mô hình. */
  icon?: ModelIconName;
  /** Chỉ dẫn riêng cho mô hình, dùng thay cho chỉ dẫn chung khi có. */
  systemPrompt?: string;
  /** Mô hình có hỗ trợ suy luận hay không. */
  reasoning: boolean;
  enabled: boolean;
}

export type ModelInput = Pick<
  ModelOption,
  | "name"
  | "description"
  | "providerId"
  | "contextWindow"
  | "badge"
  | "apiModel"
  | "protocol"
  | "icon"
  | "systemPrompt"
  | "reasoning"
> & { enabled: boolean };

/** Thông tin nhà cung cấp trả về trong danh sách mô hình của họ. */
export interface ModelProbeMetadata {
  ok: boolean;
  found: boolean;
  endpoint: string;
  error?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  toolCall?: boolean;
  functionCall?: boolean;
  promptCache?: boolean;
  reasoning?: boolean;
  pricing?: string;
}

/** Kết quả dò khả năng suy luận bằng hai yêu cầu thử rất ngắn. */
export interface ModelProbeReasoning {
  /** null nghĩa là chưa xác định được. */
  supported: boolean | null;
  /** null nghĩa là chưa thử được việc tắt suy luận. */
  canDisable: boolean | null;
  /** Số token suy luận quan sát khi gửi mức tắt. */
  offTokens: number | null;
  /** Số token suy luận quan sát khi gửi mức cao. */
  highTokens: number | null;
  /** Token được ước lượng từ nội dung vì API không trả số liệu. */
  estimated: boolean;
  budgetHint?: string;
  error?: string;
}

/** Kết quả kiểm tra khả năng gọi công cụ (nền tảng của MCP). */
export interface ModelProbeTools {
  supported: boolean | null;
  source: "metadata" | "probe";
  error?: string;
}

/** Kết quả kiểm tra nhanh riêng cửa sổ ngữ cảnh từ API. */
export interface ModelContextResult {
  ok: boolean;
  contextWindow?: string;
  metadata: ModelProbeMetadata;
  notes: string[];
  error?: string;
}

/** Toàn bộ kết quả của nút “Kiểm tra” trong Quản trị. */
export interface ModelProbeResult {
  modelId: string;
  modelName: string;
  apiModel: string;
  providerName: string;
  protocol: ModelProtocol;
  durationMs: number;
  /** Cửa sổ ngữ cảnh đã đọc từ API và lưu vào mô hình. */
  contextWindow?: string;
  metadata: ModelProbeMetadata;
  reasoning: ModelProbeReasoning;
  tools: ModelProbeTools;
  notes: string[];
}

/** Chỉ dẫn hệ thống gửi kèm câu hỏi, lấy từ chỉ dẫn riêng của mô hình. */
export interface AiSettings {
  /** Chỉ dẫn chung, áp dụng cho mọi mô hình. */
  globalPrompt?: string;
  /** Chỉ dẫn riêng của mô hình. Để trống thì không gửi thêm. */
  systemPrompt: string;
}

export type AppView = "chat" | "skills" | "admin";
