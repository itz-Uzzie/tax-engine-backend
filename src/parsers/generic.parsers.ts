import { read, utils } from "xlsx";
import { extractPdf } from "../extractors/pdf";
import { logger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";

/**
 * Generic XLSX parser – works on the first sheet regardless of its name.
 * It extracts any numeric values that look like percentages and groups them by column header if possible.
 * The result is a simple key/value map; unknown structures are ignored.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<any> {
  const workbook = read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const result: any = {};
  // Assume first row may contain headers; try to map header -> column index
  const headers = json[0] || [];
  for (let r = 1; r < json.length; r++) {
    const row = json[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell === "string" && cell.includes("%")) {
        const num = parseFloat(cell.replace(/[^0-9.]/g, ""));
        if (!isNaN(num)) {
          const key = typeof headers[c] === "string" ? headers[c].toLowerCase().replace(/\s+/g, "_") : `col_${c}`;
          result[key] = num;
        }
      }
    }
  }
  return result;
}

/**
 * Generic PDF parser – extracts all percentages from the text.
 * Returns a map of discovered numbers; if nothing is found returns {}.
 */
export async function parsePdfFallback(section: string, buffer: ArrayBuffer): Promise<any> {
  const text = await extractPdf(buffer);
  // Save raw text for debugging
  const debugDir = path.join(__dirname, "../../debug");
  await fs.mkdir(debugDir, { recursive: true });
  const debugPath = path.join(debugDir, `${section.replace(/\s+/g, "_")}_pdf.txt`);
  await fs.writeFile(debugPath, text);

  const result: any = {};
  const regex = /([0-9]+(?:\.[0-9]+)?)%/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (!result.rates) result.rates = [];
    result.rates.push(value);
  }
  return result;
}
