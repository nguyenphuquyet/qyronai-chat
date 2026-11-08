export interface SearchIntent {
  needsSearch: boolean;
  query: string;
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

const TOPIC_PATTERNS: RegExp[] = [
  /thoi tiet|du bao thoi tiet|nhiet do ngoai troi/,
  /\bgia vang\b|\bgia xang\b|\bgia dau\b|\bty gia\b|\bchung khoan\b|\bbitcoin\b|\bethereum\b/,
  /\btin tuc\b|\bthoi su\b|\bban tin\b|\bsu kien\b|\bdien bien\b/,
  /\bty so\b|\bket qua bong da\b|\blich thi dau\b|\bbang xep hang\b/,
  /\b(ra mat|phat hanh|len ke|release)\b.*\b(phien ban|san pham|game|dien thoai|iphone|android|ios|ung dung)\b/,
  /\b(phien ban|san pham|game|dien thoai|iphone|android|ios|ung dung)\b.*\b(moi nhat|ra mat|phat hanh|len ke)\b/,
  /\b(diem chuan|tuyen sinh|ky thi|lich thi|han chot)\b/,
  /\b(dich benh|bau cu|thien tai|bao so|ap thap|dong dat)\b/,
  /\b(tra cuu|tim tren web|tim tren mang|tim kiem tren|google giup|len google)\b/,
];

const TIME_WORDS =
  /hom nay|hom qua|ngay mai|bay gio|hien tai|moi nhat|gan day|tuan nay|thang nay|nam nay|vua moi/;

const QUESTION_WORDS =
  /\?|la gi|the nao|nhu the nao|bao nhieu|o dau|khi nao|may gio|ngay may|thu may|ra sao|gia bao nhieu/;

const LEADING_COMMAND =
  /^\s*(?:hãy\s+)?(?:tìm|tra cứu|tìm kiếm|search)\s+(?:trên\s+)?(?:web|mạng|internet|google)?\s*(?:giúp\s+(?:mình|tôi))?\s*[::,.\-–]?\s*/i;

/**
 * Đoán nhanh câu hỏi có cần dữ liệu thời gian thực không.
 * Dùng làm lớp dự phòng cho mô hình không hỗ trợ tool calling,
 * và để chắc chắn những câu rõ ràng cần dữ liệu mới luôn được tra web.
 */
export function detectSearchIntent(message: string): SearchIntent {
  const original = message
    .split(/\n\nTệp đính kèm:/i)[0]
    .replace(/\s+/g, " ")
    .trim();
  const text = normalize(original);

  if (!text) return { needsSearch: false, query: "" };

  const explicit = TOPIC_PATTERNS.some((pattern) => pattern.test(text));
  const timeSensitive = TIME_WORDS.test(text) && QUESTION_WORDS.test(text);
  const hasUrl = /https?:\/\//i.test(original);

  if (!explicit && !timeSensitive && !hasUrl) {
    return { needsSearch: false, query: "" };
  }

  const query = original
    .replace(LEADING_COMMAND, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  return { needsSearch: true, query: query || original.slice(0, 300) };
}
