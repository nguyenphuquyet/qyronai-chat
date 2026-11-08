const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Bảng CP437 (nửa cao): ký tự thứ i ứng với byte 0x80 + i.
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»" +
  "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0";

const high = [...CP437_HIGH];
if (high.length !== 128) {
  throw new Error(`Bảng CP437 sai kích thước: ${high.length}`);
}

const reverse = new Map(high.map((char, index) => [char, 0x80 + index]));

/** Giải mã một lớp CP437 → UTF-8; trả null nếu không chắc chắn. */
function repairOnce(value) {
  if (typeof value !== "string") return null;
  // Chỉ sửa chuỗi có ký tự vẽ khung — dấu hiệu chắc chắn của lỗi này.
  if (!/[\u2500-\u257F]/.test(value)) return null;

  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
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

/** Sửa nhiều lớp (dữ liệu từng bị mã hoá hai lần). */
function repair(value) {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = repairOnce(current);
    if (next === null) break;
    current = next;
  }
  return current === value ? null : current;
}

const jobs = [
  ["provider", ["note", "name"]],
  ["model", ["name", "description", "systemPrompt", "badge"]],
  ["skill", ["name", "description", "instructions", "category"]],
  ["conversation", ["title"]],
  ["message", ["text", "blocks", "error", "suggestions", "reasoning", "skills"]],
  ["setting", ["value"]],
  ["user", ["name"]],
];

async function main() {
  const dry = process.argv.includes("--dry");
  let total = 0;
  for (const [table, fields] of jobs) {
    const rows = await prisma[table].findMany();
    let changed = 0;
    for (const row of rows) {
      const data = {};
      for (const field of fields) {
        const fixed = repair(row[field]);
        if (fixed !== null) data[field] = fixed;
      }
      if (Object.keys(data).length === 0) continue;
      if (!dry) {
        await prisma[table].update({ where: { id: row.id }, data });
      }
      changed += 1;
      total += 1;
      if (changed <= 3) {
        console.log(`  ${table}.${Object.keys(data).join(",")} =>`, fixedSample(data));
      }
    }
    console.log(`${table}: sửa ${changed} dòng`);
  }
  console.log(`Tổng cộng: ${total} dòng${dry ? " (chạy thử, chưa ghi)" : ""}`);
}

function fixedSample(data) {
  const key = Object.keys(data)[0];
  const text = data[key];
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

main()
  .catch((error) => {
    console.error("Sửa lỗi thất bại:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
