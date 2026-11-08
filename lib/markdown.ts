import type { Block } from "./types";

const fencePattern = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const headingPattern = /^\s{0,3}(#{1,6})\s+(.*)$/;
const bulletPattern = /^\s*[-*+]\s+(.*)$/;
const orderedPattern = /^\s*(\d+)[.)]\s+(.*)$/;
const quotePattern = /^\s*>\s?(.*)$/;
const rulePattern = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const tableRowPattern = /^\s*\|(.+)\|\s*$/;
const tableSeparatorPattern = /^\s*\|?[\s:|-]+\|?\s*$/;

function splitRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableStart(lines: string[], index: number) {
  const head = lines[index];
  const separator = lines[index + 1];
  return (
    tableRowPattern.test(head ?? "") &&
    tableSeparatorPattern.test(separator ?? "") &&
    (separator ?? "").includes("-")
  );
}

/**
 * Chuyển câu trả lời Markdown của mô hình thành các khối hiển thị.
 * Chấp nhận cả đoạn đang chảy dở (ví dụ chưa đóng ```), để code hiện ngay.
 */
export function markdownToBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  const pushParagraph = (chunks: string[]) => {
    const value = chunks.join("\n").trim();
    if (value) blocks.push({ type: "p", text: value });
  };

  while (index < lines.length) {
    const line = lines[index];

    // Khối mã ```lang ... ``` (hoặc còn đang mở lúc streaming).
    const fence = line.match(fencePattern);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || "code";
      const code: string[] = [];
      index += 1;
      while (index < lines.length) {
        const next = lines[index];
        if (next.trim().startsWith(marker)) {
          index += 1;
          break;
        }
        code.push(next);
        index += 1;
      }
      blocks.push({ type: "code", lang, code: code.join("\n") });
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (rulePattern.test(line)) {
      index += 1;
      continue;
    }

    const heading = line.match(headingPattern);
    if (heading) {
      blocks.push({ type: "h", text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const head = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && tableRowPattern.test(lines[index])) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    if (quotePattern.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(quotePattern);
        if (!match) break;
        quoted.push(match[1]);
        index += 1;
      }
      blocks.push({ type: "quote", text: quoted.join("\n").trim() });
      continue;
    }

    const bullet = line.match(bulletPattern);
    const ordered = line.match(orderedPattern);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index];
        const match = isOrdered
          ? current.match(orderedPattern)
          : current.match(bulletPattern);
        if (!match) break;
        items.push((isOrdered ? match[2] : match[1]).trim());
        index += 1;
      }
      blocks.push({ type: "list", items, ordered: isOrdered });
      continue;
    }

    // Đoạn văn: gom các dòng liền nhau, giữ xuống dòng đơn.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        !current.trim() ||
        fencePattern.test(current) ||
        headingPattern.test(current) ||
        bulletPattern.test(current) ||
        orderedPattern.test(current) ||
        quotePattern.test(current) ||
        isTableStart(lines, index)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    pushParagraph(paragraph);
  }

  return blocks;
}
