import { PDFParse } from "pdf-parse";

export async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({
    data: Buffer.from(buffer),
  });

  const result = await parser.getText();

  await parser.destroy();

  return result.text;
}
