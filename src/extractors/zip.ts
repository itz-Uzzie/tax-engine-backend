import { extractPdf } from "./pdf";
import { extractDocx } from "./docx";
import { extractExcel } from "./excel";
import AdmZip from "adm-zip";

const MAX_ZIP_ENTRIES = 100;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/**
 * Extract text from a ZIP file buffer.
 * For each entry, determines its file type by extension and uses the corresponding extractor.
 * Returns a single concatenated string of all extracted texts.
 */
export async function extractFromZip(buffer: ArrayBuffer): Promise<string> {
  const zip = new AdmZip(Buffer.from(buffer));
  const entries = zip.getEntries();
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP contains more than ${MAX_ZIP_ENTRIES} entries`);
  }
  let combinedText = "";
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.toLowerCase();
    totalUncompressedBytes += entry.header.size;
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("ZIP contents exceed the 50 MB extraction limit");
    }
    const data = entry.getData(); // Buffer
    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;

    try {
      if (name.endsWith(".pdf")) {
        const txt = await extractPdf(arrayBuffer);
        combinedText += `\n--- ${entry.entryName} (pdf) ---\n${txt}`;
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        const txt = await extractDocx(arrayBuffer);
        combinedText += `\n--- ${entry.entryName} (docx) ---\n${txt}`;
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const txt = await extractExcel(arrayBuffer);
        combinedText += `\n--- ${entry.entryName} (excel) ---\n${txt}`;
      } else {
        // Unknown file type – skip
        continue;
      }
    } catch (e) {
      // Log but continue processing other entries
      console.warn(`Failed to extract ${entry.entryName}:`, e);
    }
  }

  return combinedText;
}
