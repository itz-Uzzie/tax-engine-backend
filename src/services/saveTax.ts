import { createHash } from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { taxSchema, type TaxData, type TaxRule } from "../validators/tax.validator";

const COUNTRY_DIR = path.join(process.cwd(), "countries/PK");

export async function savePakistanTax(input: unknown): Promise<void> {
  const data = taxSchema.parse(input);
  const ruleCount = Object.values(data.taxes).reduce((count, rules) => count + rules.length, 0);
  if (ruleCount === 0) {
    throw new Error("Refusing to publish an empty or invalid Pakistan tax dataset");
  }

  const latestPath = path.join(COUNTRY_DIR, "latest.json");
  const versionsDir = path.join(COUNTRY_DIR, "versions");
  await fs.mkdir(versionsDir, { recursive: true });

  const taxFingerprint = fingerprintTaxes(data.taxes);
  let previousContents: string | undefined;
  try {
    previousContents = await fs.readFile(latestPath, "utf8");
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  if (previousContents !== undefined) {
    const legacyOrCurrent: unknown = JSON.parse(previousContents);
    const previousResult = taxSchema.safeParse(legacyOrCurrent);
    if (previousResult.success) {
      const previous = previousResult.data;
      const previousFingerprint = fingerprintTaxes(previous.taxes);
      if (previousFingerprint === taxFingerprint) return;
    } else {
      const legacyHash = createHash("sha256").update(previousContents).digest("hex");
      const legacyPath = path.join(versionsDir, `legacy-${legacyHash.slice(0, 16)}.json`);
      await writeImmutableFile(legacyPath, previousContents);
    }
  }

  const versionPath = path.join(versionsDir, `${data.version}-${taxFingerprint.slice(0, 12)}.json`);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await writeImmutableFile(versionPath, serialized);

  const temporaryPath = `${latestPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, serialized);
  await fs.rename(temporaryPath, latestPath);
}

async function writeImmutableFile(filePath: string, contents: string): Promise<void> {
  try {
    await fs.writeFile(filePath, contents, { flag: "wx" });
  } catch (error) {
    if (!isExistsError(error)) throw error;
    const existing = await fs.readFile(filePath, "utf8");
    if (existing !== contents) throw new Error(`Immutable version already exists: ${filePath}`);
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function fingerprintTaxes(taxes: TaxData["taxes"]): string {
  const stableRules = (rules: TaxRule[]) => rules.map((rule) => {
    const { retrievedAt: _retrievedAt, ...source } = rule.source;
    return { ...rule, source };
  });
  const stableTaxes = {
    sales_tax: stableRules(taxes.sales_tax),
    withholding_tax: stableRules(taxes.withholding_tax),
    income_tax: stableRules(taxes.income_tax),
    fed: stableRules(taxes.fed),
  };
  return createHash("sha256").update(JSON.stringify(stableTaxes)).digest("hex");
}
