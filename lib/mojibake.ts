// Bảng CP437 (nửa cao): ký tự thứ i ứng với byte 0x80 + i.
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»" +
  "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0";

const reverse = new Map(
  [...CP437_HIGH].map((char, index) => [char, 0x80 + index]),
);

/** Giải mã một lớp CP437 → UTF-8; trả null nếu không chắc chắn. */
function repairOnce(value: string): string | null {
  if (!value || !/[\u2500-\u257F]/.test(value)) return null;

  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const byte = reverse.get(char);
    if (byte === undefined) return null;
    bytes.push(byte);
  }

  const fixed = Buffer.from(bytes).toString("utf8");
  if (fixed.includes("\uFFFD")) return null;
  return fixed === value ? null : fixed;
}

/**
 * Sửa chuỗi UTF-8 từng bị giải mã nhầm bằng CP437 (lỗi dữ liệu mẫu cũ).
 * Chỉ động vào chuỗi có ký tự vẽ khung — dấu hiệu chắc chắn của lỗi này.
 * Lặp vài lớp để xử lý cả trường hợp bị mã hoá hai lần.
 */
export function repairMojibake(value: string): string {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = repairOnce(current);
    if (next === null) break;
    current = next;
  }
  return current;
}
