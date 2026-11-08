import type { WebSource } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface Candidate extends WebSource {
  content?: string;
}

export interface WebSearchResult {
  query: string;
  sources: WebSource[];
  /** Đoạn trích gọn để đưa vào ngữ cảnh cho mô hình. */
  context: string;
  error?: string;
}

function codePoint(value: number) {
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      codePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(
      /&([a-z][a-z0-9]+);/gi,
      (match: string, name: string) =>
        named[name.toLowerCase()] ?? match,
    );
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

const STOP_WORDS = new Set([
  "la",
  "gi",
  "the",
  "nao",
  "cua",
  "va",
  "cho",
  "trong",
  "tren",
  "duoi",
  "voi",
  "hay",
  "khi",
  "bao",
  "nhieu",
  "o",
  "dau",
  "may",
  "gio",
  "hom",
  "nay",
  "ngay",
  "mai",
  "qua",
  "hien",
  "tai",
  "moi",
  "nhat",
  "gan",
  "day",
  "tuan",
  "thang",
  "nam",
  "minh",
  "ban",
  "giup",
  "tim",
  "kiem",
  "tra",
  "cuu",
  "web",
  "mang",
  "internet",
  "google",
  "nhu",
  "co",
  "khong",
  "duoc",
  "ra",
  "sao",
  "de",
  "ve",
  "tu",
  "den",
  "mot",
  "cac",
  "nhung",
  "thi",
  "ma",
  "nen",
  "se",
  "da",
  "dang",
  "bi",
  "vao",
  "len",
  "xuong",
  "cung",
  "rat",
  "hon",
  "nua",
  "chi",
  "con",
]);

function queryTokens(query: string) {
  return Array.from(
    new Set(
      normalizeText(query)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
    ),
  );
}

function matchesQuery(
  item: Candidate,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const words = new Set(
    normalizeText(`${item.title} ${item.snippet ?? ""} ${item.url}`)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  let score = 0;
  for (const token of tokens) {
    if (words.has(token)) score += 1;
  }
  return score >= (tokens.length >= 3 ? 2 : 1);
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host,
      )
    ) {
      return null;
    }
    if (host === "bing.com" || host.endsWith(".bing.com")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractHtml(html: string) {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
  const scoped = article ?? main ?? html;

  const text = scoped
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 5000);
}

async function readPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return "";
    const type = response.headers.get("content-type") ?? "";
    if (type && !/text\/html|text\/plain/i.test(type)) return "";
    return extractHtml(await response.text());
  } catch {
    return "";
  }
}

function tagOf(block: string, name: string) {
  const match = block.match(
    new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"),
  );
  return match ? cleanText(match[1]) : "";
}

async function bingRss(query: string) {
  const url =
    "https://www.bing.com/search?" +
    new URLSearchParams({
      q: query,
      format: "rss",
      mkt: "vi-VN",
      setlang: "vi",
    }).toString();

  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/rss+xml,application/xml,text/xml",
      "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Máy tìm kiếm trả về lỗi ${response.status}.`);
  }

  const xml = await response.text();
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const results: Candidate[] = [];
  const seen = new Set<string>();
  const tokens = queryTokens(query);

  for (const block of blocks) {
    const title = tagOf(block, "title");
    const link = tagOf(block, "link");
    const snippet = tagOf(block, "description");
    const safe = safeUrl(link);
    if (!title || !safe || seen.has(safe)) continue;
    const item: Candidate = { title, url: safe, snippet };
    if (!matchesQuery(item, tokens)) continue;
    seen.add(safe);
    results.push(item);
    if (results.length >= 6) break;
  }

  return results;
}

function mergeSources(results: WebSearchResult[]) {
  const merged: WebSource[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    for (const source of result.sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      merged.push(source);
    }
  }
  return merged;
}

/**
 * Tìm thông tin trên web mà không cần API key riêng.
 * Dùng kết quả RSS của Bing, sau đó đọc nhanh nội dung vài trang đầu.
 */
export async function searchWeb(query: string): Promise<WebSearchResult> {
  const cleaned = query.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!cleaned) {
    return {
      query: "",
      sources: [],
      context: "",
      error: "Công cụ không nhận được câu truy vấn.",
    };
  }

  let candidates: Candidate[];
  try {
    candidates = await bingRss(cleaned);
  } catch (error) {
    return {
      query: cleaned,
      sources: [],
      context: "",
      error:
        error instanceof Error
          ? error.message
          : "Không kết nối được máy tìm kiếm.",
    };
  }

  if (candidates.length === 0) {
    return {
      query: cleaned,
      sources: [],
      context: "",
      error: "Không tìm thấy kết quả phù hợp trên web.",
    };
  }

  const top = candidates.slice(0, 4);
  const enriched = await Promise.all(
    top.map(async (item) => ({
      ...item,
      content: await readPage(item.url),
    })),
  );

  const sources = enriched.map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.snippet,
  }));

  const parts = enriched.map((item, index) => {
    const body =
      item.content && item.content.length > 160
        ? item.content.slice(0, 4000)
        : item.snippet;
    return [
      `[${index + 1}] ${item.title}`,
      `URL: ${item.url}`,
      body || "(không đọc được nội dung trang)",
    ].join("\n");
  });

  let context = parts.join("\n\n");
  if (context.length > 9000) context = `${context.slice(0, 9000)}\n…`;

  return { query: cleaned, sources, context };
}

export function mergeWebSources(results: WebSearchResult[]) {
  return mergeSources(results);
}
