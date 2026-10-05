import * as xlsx from "xlsx";

export async function extractExcel(buffer: ArrayBuffer): Promise<string> {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_txt(firstSheet);
}
