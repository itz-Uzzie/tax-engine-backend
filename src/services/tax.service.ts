import fs from "fs/promises";
import path from "path";

const COUNTRIES_DIR = path.join(process.cwd(), "countries");

type JsonRecord = Record<string, unknown>;

export async function getCountry(country: string) {
  const countryCode = country.toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(countryCode)) {
    throw new Error(`Invalid country code: ${country}`);
  }
  try {
    const filePath = path.join(COUNTRIES_DIR, countryCode, "latest.json");
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    throw new Error(`Country ${countryCode} not found or data missing`);
  }
}

export async function getCountries() {
  const dirs = await fs.readdir(COUNTRIES_DIR);
  const countries = [];
  for (const dir of dirs) {
    try {
      const countryData = await getCountry(dir);
      countries.push(countryData);
    } catch {
      // Ignore if no latest.json exists
    }
  }
  return countries;
}

export async function calculateTax({
  country,
  amount,
  product_category,
}: {
  country: string;
  amount: number;
  product_category?: string;
}) {
  const countryData = await getCountry(country);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a finite, non-negative number");
  }
  const taxRate = readSalesTaxRate(countryData);
  if (taxRate === undefined) {
    throw new Error(`No standard sales tax rate is published for ${country.toUpperCase()}`);
  }

  const taxAmount = Math.round((amount * taxRate) / 100 * 100) / 100;

  return {
    country: country.toUpperCase(),
    amount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: Math.round((amount + taxAmount) * 100) / 100,
  };
}

function readSalesTaxRate(countryData: unknown): number | undefined {
  const root = asRecord(countryData);
  const taxes = asRecord(root.taxes);
  const salesTaxRules = taxes.sales_tax;
  if (Array.isArray(salesTaxRules)) {
    const standardRule = salesTaxRules
      .map(asRecord)
      .find((rule) => rule.category === "standard");
    if (standardRule) {
      const rates = Array.isArray(standardRule.rates) ? standardRule.rates : [];
      for (const item of rates) {
        const rate = asRecord(item);
        const calculation = asRecord(rate.calculation);
        if (
          rate.appliesTo === "all" &&
          calculation.kind === "percentage" &&
          typeof calculation.value === "number" &&
          Number.isFinite(calculation.value) &&
          calculation.value >= 0 &&
          calculation.value <= 100
        ) {
          return calculation.value;
        }
      }
    }
  }

  const salesTax = asRecord(salesTaxRules ?? root.sales_tax);
  const rate = salesTax.standard ?? root.taxRate ?? root.tax_rate;
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 100
    ? rate
    : undefined;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
