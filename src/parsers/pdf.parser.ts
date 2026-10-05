import { extractPdf } from "../extractors/pdf";
import { TaxRule } from "../validators/tax.validator";

export interface TaxRuleSourceInput {
  url: string;
  documentUrl: string;
  documentName: string;
  retrievedAt: string;
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  return extractPdf(buffer);
}

/** Parse the explicit default sales-tax rate from section 3(1) of the current Act. */
export function parseSalesTaxAct(text: string, source: TaxRuleSourceInput): TaxRule[] {
  const rate = findStatutoryStandardSalesTaxRate(text);
  if (rate === undefined) return [];

  return [{
    id: "pk-sales-tax-section-3-1-standard",
    section: "3(1)",
    category: "standard",
    description: "Standard sales tax on taxable supplies and imports under section 3(1).",
    conditions: ["Subject to the provisions of the Sales Tax Act, 1990."],
    rates: [{
      appliesTo: "all",
      calculation: { kind: "percentage", value: rate, raw: `${rate}%`, basis: "value of supply" },
    }],
    reference: "Sales Tax Act, 1990, section 3(1)",
    source: {
      authority: "FBR",
      ...source,
      location: "Section 3(1)",
    },
  }];
}

function findStatutoryStandardSalesTaxRate(text: string): number | undefined {
  const normalizedText = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const scopeStart = normalizedText.search(
    /\b3\.\s*Scope of tax\.?\s*[–—-]\s*\(1\)/i,
  );
  if (scopeStart < 0) return undefined;

  const sectionText = normalizedText.slice(scopeStart, scopeStart + 1800);
  const rateMatch = sectionText.match(
    /sales tax at the rate of\s+(?:\d+\s*)?(?:\[\s*([a-z]+)\s*\]|(\d{1,3}(?:\.\d+)?))\s*(?:per cent|percent|%)/i,
  );
  if (!rateMatch) return undefined;

  const wordRates: Record<string, number> = {
    zero: 0,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    ten: 10,
    twelve: 12,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    twenty: 20,
  };
  const rate = rateMatch[1]
    ? wordRates[rateMatch[1].toLowerCase()]
    : Number(rateMatch[2]);
  return rate !== undefined && Number.isFinite(rate) && rate <= 100 ? rate : undefined;
}
