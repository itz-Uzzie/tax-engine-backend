import { z } from "zod";
import { callLLMFallback } from "../utils/llmFallback";

type LegacyLlmTaxRates = {
  sales_tax: { standard?: number };
  withholding_tax: { contracts?: number };
  income_tax: Record<string, never>;
  fed: Record<string, never>;
};

const llmTaxSchema = z.object({
  sales_tax: z.object({ standard: z.number().min(0).max(100).optional() }).default({}),
  withholding_tax: z.object({ contracts: z.number().min(0).max(100).optional() }).default({}),
  income_tax: z.record(z.string(), z.never()).default({}),
  fed: z.record(z.string(), z.never()).default({}),
});

/** Parse extracted official-source text. Output is schema checked before returning. */
export async function parseWithLLM(text: string): Promise<LegacyLlmTaxRates | null> {
  const prompt = `Extract only rates explicitly stated in the text. Do not infer missing values.
Return only JSON with this shape:
{"sales_tax":{"standard":number},"withholding_tax":{"contracts":number},"income_tax":{},"fed":{}}
Omit unavailable numeric values. Values must be percentages from 0 to 100.

Text:\n${text.slice(0, 15000)}`;

  try {
    const rawResponse = await callLLMFallback([
      { role: "user", content: prompt },
    ]);
    const jsonString = rawResponse
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed: unknown = JSON.parse(jsonString);
    return llmTaxSchema.parse(parsed);
  } catch (error) {
    console.error("LLM parsing failed or returned invalid data:", error);
    return null;
  }
}
