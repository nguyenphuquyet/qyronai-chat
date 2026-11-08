import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { getCurrentUser } from "@/lib/auth";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Giới hạn để không kéo sập máy chủ khi ai đó gửi tệp quá lớn. */
const MAX_BYTES = 15 * 1024 * 1024;
/** Chừa chỗ cho chỉ dẫn và lịch sử chat trong ngữ cảnh của mô hình. */
const MAX_TEXT = 60_000;

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "java",
  "c",
  "h",
  "cpp",
  "cs",
  "go",
  "rs",
  "php",
  "rb",
  "swift",
  "kt",
  "sql",
  "sh",
  "bat",
  "ps1",
  "yml",
  "yaml",
  "toml",
  "ini",
  "env",
  "log",
  "srt",
  "vtt",
]);

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLocaleLowerCase("vi") : "";
}

function truncateText(text: string) {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= MAX_TEXT) return cleaned;
  return `${cleaned.slice(0, MAX_TEXT)}\n\n[… nội dung tệp đã được lược bớt vì quá dài]`;
}

/** Văn bản thuần: loại bỏ tệp nhị phân đội lốt .txt. */
function decodeText(buffer: Buffer) {
  if (buffer.includes(0)) return null;
  const text = new TextDecoder("utf-8").decode(buffer);
  const bad = (text.match(/\uFFFD/g) ?? []).length;
  if (text.length > 0 && bad / text.length > 0.1) return null;
  return text;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập để gửi tệp." },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Không đọc được tệp gửi lên." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Chưa chọn tệp để gửi." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Tệp rỗng." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Tệp lớn hơn 15 MB. Hãy chọn tệp nhỏ hơn." },
      { status: 413 },
    );
  }

  const name = file.name || "tệp";
  const ext = extensionOf(name);
  const mime = file.type.toLocaleLowerCase("vi");
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    // PDF: trích toàn bộ chữ trong các trang.
    if (ext === "pdf" || mime === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const merged = Array.isArray(text) ? text.join("\n\n") : text;
      const content = truncateText(merged);
      if (!content) {
        return NextResponse.json(
          {
            error:
              "PDF này không có lớp chữ (có thể là bản scan). Hãy gửi ảnh trang cần đọc.",
          },
          { status: 422 },
        );
      }
      return NextResponse.json({
        ok: true,
        attachment: {
          name,
          size: file.size,
          kind: "text",
          text: content,
        } satisfies Attachment,
      });
    }

    // Word .docx: lấy phần chữ, bỏ định dạng.
    if (
      ext === "docx" ||
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { value } = await mammoth.extractRawText({ buffer });
      const content = truncateText(value);
      if (!content) {
        return NextResponse.json(
          { error: "Không tìm thấy chữ trong tệp Word này." },
          { status: 422 },
        );
      }
      return NextResponse.json({
        ok: true,
        attachment: {
          name,
          size: file.size,
          kind: "text",
          text: content,
        } satisfies Attachment,
      });
    }

    // Các định dạng chữ thuần: mã nguồn, markdown, CSV, JSON…
    if (
      mime.startsWith("text/") ||
      TEXT_EXTENSIONS.has(ext) ||
      mime === "application/json"
    ) {
      const decoded = decodeText(buffer);
      if (decoded === null) {
        return NextResponse.json(
          { error: "Tệp này không phải văn bản đọc được." },
          { status: 415 },
        );
      }
      return NextResponse.json({
        ok: true,
        attachment: {
          name,
          size: file.size,
          kind: "text",
          text: truncateText(decoded),
        } satisfies Attachment,
      });
    }

    return NextResponse.json(
      {
        error:
          "Chưa đọc được định dạng này. Hỗ trợ: PDF, Word (.docx), tệp văn bản, mã nguồn, CSV/JSON và ảnh.",
      },
      { status: 415 },
    );
  } catch {
    return NextResponse.json(
      { error: `Không đọc được nội dung tệp ${name}.` },
      { status: 422 },
    );
  }
}
