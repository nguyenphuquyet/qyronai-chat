import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userFromBearer } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { POST as chatPost } from "@/app/api/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompletionBody {
  model?: string;
  messages?: { role: string; content: string }[];
  stream?: boolean;
  reasoning_effort?: string;
}

/** Endpoint tương thích OpenAI, xác thực bằng API key dịch vụ hoặc phiên đăng nhập. */
export async function POST(request: Request) {
  const user = (await getCurrentUser()) ?? (await userFromBearer(request));
  if (!user) {
    return NextResponse.json(
      { error: { message: "Thiếu API key dịch vụ (Authorization: Bearer …)." } },
      { status: 401 },
    );
  }

  let body: CompletionBody;
  try {
    body = (await request.json()) as CompletionBody;
  } catch {
    return NextResponse.json(
      { error: { message: "JSON không hợp lệ." } },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: { message: "Thiếu messages." } },
      { status: 400 },
    );
  }

  const models = await prisma.model.findMany({
    where: { enabled: true, provider: { enabled: true } },
  });
  const target =
    models.find((m) => m.id === body.model || m.apiModel === body.model) ??
    models[0];
  if (!target) {
    return NextResponse.json(
      { error: { message: "Không có mô hình nào đang bật." } },
      { status: 404 },
    );
  }

  const reasoning =
    body.reasoning_effort === "high"
      ? "Cao"
      : body.reasoning_effort === "low"
        ? "Thấp"
        : body.reasoning_effort === "medium"
          ? "Vừa"
          : undefined;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers.authorization = auth;
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  const internal = new Request(new URL("/api/chat", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: { id: target.id },
      messages: body.messages,
      reasoning,
      allowTools: true,
    }),
  });
  const upstream = await chatPost(internal);
  if (!upstream.ok || !upstream.body) {
    const data = (await upstream.json().catch(() => null)) as {
      error?: string;
    } | null;
    return NextResponse.json(
      { error: { message: data?.error ?? "Không gọi được mô hình." } },
      { status: upstream.status || 500 },
    );
  }

  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  const modelId = target.id;

  if (body.stream) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        const send = (delta: Record<string, string>, finish?: string) =>
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{ index: 0, delta, finish_reason: finish ?? null }],
              })}\n\n`,
            ),
          );
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newline = buffer.indexOf("\n");
            while (newline >= 0) {
              const line = buffer.slice(0, newline).trim();
              buffer = buffer.slice(newline + 1);
              newline = buffer.indexOf("\n");
              if (!line) continue;
              let frame: { t?: string; v?: string };
              try {
                frame = JSON.parse(line);
              } catch {
                continue;
              }
              if (frame.t === "a" && frame.v) send({ content: frame.v });
              else if (frame.t === "r" && frame.v)
                send({ reasoning_content: frame.v });
              else if (frame.t === "e")
                send({ content: `\n[Lỗi: ${frame.v}]` }, "stop");
            }
          }
          send({}, "stop");
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          try {
            controller.close();
          } catch {
            // luồng đã đóng
          }
        }
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }

  const raw = await upstream.text();
  let content = "";
  let reasoningOut = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let frame: { t?: string; v?: string };
    try {
      frame = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (frame.t === "a") content += frame.v ?? "";
    else if (frame.t === "r") reasoningOut += frame.v ?? "";
    else if (frame.t === "e") content += `\n[Lỗi: ${frame.v}]`;
  }
  return NextResponse.json({
    id,
    object: "chat.completion",
    created,
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
          ...(reasoningOut ? { reasoning_content: reasoningOut } : {}),
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}