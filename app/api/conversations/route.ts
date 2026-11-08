import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  Attachment,
  Block,
  Conversation,
  ConversationGroup,
  Message,
  MessageState,
  Step,
  WebSource,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type ConversationPayload = {
  conversations?: Conversation[];
};

interface MessageRow {
  id: string;
  role: string;
  text: string | null;
  attachments: string | null;
  blocks: string | null;
  steps: string | null;
  state: string | null;
  error: string | null;
  suggestions: string | null;
  skills: string | null;
  reasoning: string | null;
  sources: string | null;
}

interface ConversationRow {
  id: string;
  title: string;
  groupName: string;
  updatedLabel: string | null;
  pinned: boolean;
  updatedAt: Date;
  messages: MessageRow[];
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function toMessage(row: MessageRow): Message {
  const rawState = row.state as MessageState | null;
  // Tin đang chạy dở (do đóng tab giữa chừng) được coi là đã dừng.
  const state: MessageState | undefined =
    rawState === "thinking" || rawState === "streaming" ? "stopped" : rawState ?? undefined;

  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    text: row.text ?? undefined,
    attachments: parseJson<Attachment[]>(row.attachments),
    blocks: parseJson<Block[]>(row.blocks),
    steps: parseJson<Step[]>(row.steps),
    state,
    error: parseJson<Message["error"]>(row.error),
    suggestions: parseJson<string[]>(row.suggestions),
    skills: parseJson<string[]>(row.skills),
    reasoning: row.reasoning ?? undefined,
    sources: parseJson<WebSource[]>(row.sources),
  };
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    group: row.groupName as ConversationGroup,
    updatedAt: row.updatedLabel ?? row.updatedAt.toISOString(),
    pinned: row.pinned,
    messages: row.messages.map(toMessage),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ready: false, error: "Bạn cần đăng nhập." },
      { status: 401 },
    );
  }

  try {
    const rows = await prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      include: { messages: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({
      ready: true,
      database: "online",
      conversations: rows.map(toConversation),
    });
  } catch {
    // Chưa có MySQL: giao diện dùng bản lưu trong trình duyệt.
    return NextResponse.json({
      ready: false,
      database: "offline",
      conversations: [],
    });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Bạn cần đăng nhập." },
      { status: 401 },
    );
  }

  let body: ConversationPayload;
  try {
    body = (await request.json()) as ConversationPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON không hợp lệ." },
      { status: 400 },
    );
  }

  const conversations = Array.isArray(body.conversations)
    ? body.conversations
    : [];

  try {
    await prisma.$transaction(async (tx) => {
      const ids = conversations.map((conversation) => conversation.id);

      // Không cho ghi đè cuộc trò chuyện của tài khoản khác.
      const existing = await tx.conversation.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true },
      });
      const foreign = new Set(
        existing
          .filter((row) => row.userId && row.userId !== user.id)
          .map((row) => row.id),
      );
      const own = conversations.filter(
        (conversation) => !foreign.has(conversation.id),
      );
      const ownIds = own.map((conversation) => conversation.id);

      await tx.conversation.deleteMany({
        where: {
          userId: user.id,
          ...(ownIds.length > 0 ? { id: { notIn: ownIds } } : {}),
        },
      });

      for (const conversation of own) {
        const messages = Array.isArray(conversation.messages)
          ? conversation.messages
          : [];

        await tx.conversation.upsert({
          where: { id: conversation.id },
          create: {
            id: conversation.id,
            title: conversation.title,
            groupName: conversation.group,
            updatedLabel: conversation.updatedAt,
            pinned: conversation.pinned ?? false,
            userId: user.id,
          },
          update: {
            title: conversation.title,
            groupName: conversation.group,
            updatedLabel: conversation.updatedAt,
            pinned: conversation.pinned ?? false,
          },
        });

        await tx.message.deleteMany({
          where: { conversationId: conversation.id },
        });

        if (messages.length > 0) {
          await tx.message.createMany({
            data: messages.map((message, index) => ({
              id: message.id,
              conversationId: conversation.id,
              role: message.role,
              text: message.text ?? null,
              attachments: message.attachments
                ? JSON.stringify(message.attachments)
                : null,
              blocks: message.blocks ? JSON.stringify(message.blocks) : null,
              steps: message.steps ? JSON.stringify(message.steps) : null,
              state: message.state ?? null,
              error: message.error ? JSON.stringify(message.error) : null,
              suggestions: message.suggestions
                ? JSON.stringify(message.suggestions)
                : null,
              skills: message.skills ? JSON.stringify(message.skills) : null,
              reasoning: message.reasoning ?? null,
              sources: message.sources ? JSON.stringify(message.sources) : null,
              sortOrder: index,
            })),
          });
        }
      }
    });

    return NextResponse.json({ ok: true, database: "online" });
  } catch {
    return NextResponse.json(
      { ok: false, database: "offline", error: "Chưa kết nối được MySQL." },
      { status: 503 },
    );
  }
}

/** Cho phép gửi bằng navigator.sendBeacon khi đóng tab. */
export async function POST(request: Request) {
  return PUT(request);
}
