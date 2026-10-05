import { read, utils } from "xlsx";
import { TaxRateValue, TaxRule } from "../validators/tax.validator";
import { TaxRuleSourceInput } from "./pdf.parser";

export async function parseXlsx(buffer: ArrayBuffer): Promise<Record<string, number[]>> {
  const workbook = read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return {};
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const rates: number[] = [];
  for (const row of rows) {
    for (const value of row) {
      if (typeof value === "number" && Number.isFinite(value)) {
        rates.push(value);
      } else if (typeof value === "string") {
        const matches = value.match(/\b(\d+(?:\.\d+)?)\s*%/g) ?? [];
        for (const match of matches) rates.push(Number(match.replace(/[^\d.]/g, "")));
      }
    }
  }
  return { rates };
}

/** Parse FBR's structured ATL / non-ATL rate-card worksheet without collapsing conditions. */
export function parseWithholdingRateCard(
  buffer: ArrayBuffer,
  source: TaxRuleSourceInput,
  taxYear: number,
): TaxRule[] {
  const workbook = read(buffer, { type: "buffer" });
  const worksheetName = workbook.SheetNames.find((name) =>
    /withholding tax rates/i.test(name),
  );
  if (!worksheetName) throw new Error("Withholding rate-card worksheet was not found");

  const worksheet = workbook.Sheets[worksheetName];
  if (!worksheet) throw new Error(`Worksheet ${worksheetName} is missing`);
  const rows = utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => normalize(value) === "sections") &&
    row.some((value) => normalize(value) === "atl rates") &&
    row.some((value) => normalize(value) === "non-atl rates"),
  );
  if (headerIndex < 0) throw new Error("Withholding rate-card headers were not found");

  const rules: TaxRule[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const sequence = row[1];
    const section = stringify(row[3]);
    const sectionDescription = stringify(row[4]);
    if (!section && !sectionDescription && !sequence) continue;
    if (!sectionDescription) continue;

    const rates = [
      makeRate("atl", row[7]),
      makeRate("non_atl", row[8]),
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
    if (rates.length === 0) continue;

    const sequenceText = stringify(sequence) || String(index - headerIndex);
    const sectionName = sectionDescription.replace(/^\s*\S+\s+/, "").trim() || sectionDescription;
    const conditions = [stringify(row[5]), stringify(row[6])].filter(Boolean);
    const references = stringify(row[9]);
    const notes = stringify(row[10]);
    rules.push({
      id: `pk-wht-${taxYear}-row-${sequenceText}`,
      section: section || "unspecified",
      category: sectionName,
      description: sectionDescription,
      conditions,
      rates,
      ...(references ? { reference: references } : {}),
      ...(notes ? { notes } : {}),
      source: {
        authority: "FBR",
        ...source,
        location: `${worksheetName}, row ${index + 1} (rate-card entry ${sequenceText})`,
      },
    });
  }
  return rules;
}

function makeRate(
  appliesTo: "atl" | "non_atl",
  value: unknown,
): TaxRule["rates"][number] | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  return { appliesTo, calculation: normalizeRate(value) };
}

function normalizeRate(value: unknown): TaxRateValue {
  if (typeof value === "number" && Number.isFinite(value)) {
    const percentage = Number((value * 100).toFixed(4));
    return {
      kind: "percentage",
      value: percentage,
      raw: `${percentage}%`,
    };
  }

  const raw = stringify(value);
  const match = raw.match(/^\s*(?:Rs\.?\s*)?(\d+(?:\.\d+)?)\s*%\s*(.*)$/i);
  if (match && !/\d+(?:\.\d+)?\s*%/.test(match[2])) {
    const basis = match[2].trim().replace(/^[\s,;:()-]+|[\s,;:()-]+$/g, "");
    return {
      kind: "percentage",
      value: Number(match[1]),
      raw,
      ...(basis ? { basis } : {}),
    };
  }

  return { kind: "formula", expression: raw, raw };
}

function normalize(value: unknown): string {
  return stringify(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function stringify(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}
