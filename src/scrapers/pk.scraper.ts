import * as cheerio from "cheerio";
import { extractPdfText, parseSalesTaxAct } from "../parsers/pdf.parser";
import { extractDocx } from "../extractors/docx";
import { extractExcel } from "../extractors/excel";
import { extractFromZip } from "../extractors/zip";
import { parseWithholdingRateCard } from "../parsers/xlsx.parser";
import {
  taxSchema,
  type TaxDocumentSource,
  type TaxRule,
} from "../validators/tax.validator";
import { logger } from "../utils/logger";
import fs from "fs/promises";
import path from "path";

// FBR sub-pages that contain actual tax data & downloadable files
const FBR_TAX_SECTIONS = [
  {
    name: "Withholding Tax",
    url: "https://fbr.gov.pk/withholding-taxes-rate-card/174298/174301",
  },
  {
    name: "Sales Tax Act",
    url: "https://fbr.gov.pk/categ/sales-tax-act/301",
  },
];

interface ScrapedSection {
  name: string;
  url: string;
  fileLinks: { url: string; anchorText: string; fileType: string }[];
  pageText: string;
}

interface ExtractedDocument {
  text: string;
  type: string;
  fileName: string;
  buffer: ArrayBuffer;
}

const MIN_WITHHOLDING_RULES = 50;
const EFFECTIVE_FROM = "2026-07-01";
const EFFECTIVE_TO = "2027-06-30";

/**
 * Scrape a single FBR sub-page: collect downloadable file links and page text
 */
async function scrapeSubPage(section: { name: string; url: string }): Promise<ScrapedSection> {
  logger.info({ section: section.name, url: section.url }, "Scraping sub-page");

  const response = await fetch(section.url, {
    headers: { "user-agent": "tax-engine/1.0 (+https://github.com/open-source/tax-engine)" },
    signal: AbortSignal.timeout(30000),
  });
  assertOfficialFbrUrl(response.url);
  if (!response.ok) throw new Error(`FBR page returned HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const rawLinks = $("a")
    .toArray()
    .map((element) => ({
      text: $(element).text().trim(),
      href: $(element).attr("href") ?? null,
    }));

  const fileLinks: ScrapedSection["fileLinks"] = [];
  rawLinks.forEach(({ text, href }) => {
    if (!href) return;
    const lowerText = text.toLowerCase();
    const fullUrl = href.startsWith("http")
      ? href
      : new URL(href, section.url).toString();
    const hasFileExtension = /\.(pdf|docx?|xlsx?|xls|zip)(?:$|\?)/i.test(fullUrl);
    const host = new URL(fullUrl).hostname.toLowerCase();
    const isFbrDownloadDomain =
      host === "fbr.gov.pk" || host.endsWith(".fbr.gov.pk");
    const isFbrDocumentPath = /\/(?:Docs|Downloads)\//i.test(new URL(fullUrl).pathname);
    const textHintsFile =
      /^\.?\s*(pdf|xlsx?|docx?|word|excel)$/i.test(lowerText);

    if (
      ((isFbrDownloadDomain && (hasFileExtension || isFbrDocumentPath || textHintsFile))) &&
      !fileLinks.some((f) => f.url === fullUrl)
    ) {
      let fileType = "unknown";
      if (/\.pdf(?:$|\?)/i.test(fullUrl) || /^\.?\s*pdf$/i.test(lowerText)) fileType = "pdf";
      else if (/\.docx?(?:$|\?)/i.test(fullUrl) || /\bword\b/i.test(lowerText))
        fileType = "docx";
      else if (
        /\.xlsx?(?:$|\?)/i.test(fullUrl) ||
        /\bexcel\b/i.test(lowerText)
      )
        fileType = "xlsx";
      else if (/\.zip(?:$|\?)/i.test(fullUrl)) fileType = "zip";
      fileLinks.push({ url: fullUrl, anchorText: text, fileType });
    }
  });

  // Also grab the page's main text content as fallback
  const pageText = $("body").text().replace(/\s+/g, " ").trim();

  logger.info(
    {
      section: section.name,
      fileCount: fileLinks.length,
      pageTextLength: pageText.length,
    },
    "Sub-page scraping complete",
  );

  if (fileLinks.length === 0) {
    logger.warn(
      { section: section.name },
      "No downloadable files found on this sub-page",
    );
  }

  return {
    name: section.name,
    url: section.url,
    fileLinks,
    pageText,
  };
}

/**
 * Download a file, detect its type from content-type headers, extract text
 */
async function downloadAndExtract(
  fileUrl: string,
  hintedType: string,
  downloadsDir: string,
): Promise<ExtractedDocument> {
  logger.info({ fileUrl }, "Downloading file...");

  assertOfficialFbrUrl(fileUrl);
  const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
  assertOfficialFbrUrl(response.url);
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
  const maximumDownloadBytes = 25 * 1024 * 1024;
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maximumDownloadBytes) throw new Error("Downloaded file exceeds 25 MB limit");
  const contentType = response.headers.get("content-type") || "";
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maximumDownloadBytes) throw new Error("Downloaded file exceeds 25 MB limit");

  // Determine filename
  const urlFileName = path.basename(new URL(fileUrl).pathname);
  const fileName = urlFileName.replace(/[^a-zA-Z0-9._-]/g, "_") || `document_${Date.now()}`;
  const filePath = path.join(downloadsDir, fileName);

  await fs.writeFile(filePath, Buffer.from(buffer));
  logger.info(
    { filePath, contentType, size: buffer.byteLength },
    "File downloaded and stored",
  );

  // Detect actual file type from content-type header (more reliable than URL)
  let detectedType = hintedType;
  if (contentType.includes("pdf")) detectedType = "pdf";
  else if (
    contentType.includes("wordprocessingml") ||
    contentType.includes("msword")
  )
    detectedType = "docx";
  else if (
    contentType.includes("spreadsheetml") ||
    contentType.includes("ms-excel")
  )
    detectedType = "xlsx";
  else if (contentType.includes("zip")) detectedType = "zip";

  logger.info({ detectedType, contentType }, "File type detected");

  // Extract text content
  let textContent = "";
  if (detectedType === "pdf") {
    // Return parsed PDF data as JSON string
    textContent = await extractPdfText(buffer);
  } else if (detectedType === "docx") {
    textContent = await extractDocx(buffer);
  } else if (detectedType === "xlsx" || detectedType === "xls") {
    textContent = await extractExcel(buffer);
  } else if (detectedType === "zip") {
    textContent = await extractFromZip(buffer);
  } else {
    logger.warn(
      { detectedType, contentType, fileUrl },
      "Unrecognized file type, skipping extraction",
    );
  }

  if (textContent.length > 0) {
    logger.info(
      { extractedLength: textContent.length },
      "Text extracted from file successfully",
    );
  } else {
    logger.warn({ fileUrl }, "No text could be extracted from this file");
  }

  return { text: textContent, type: detectedType, fileName, buffer };
}

/**
 * Pick only the latest files from a section (by checking year in URL/anchor text)
 */
function filterLatestFiles(
  files: ScrapedSection["fileLinks"],
): ScrapedSection["fileLinks"] {
  if (files.length === 0) return files;

  // Extract years from anchor text and URLs
  const currentYear = new Date().getFullYear();
  const filesWithYear = files.map((f) => {
    const yearMatches = (f.anchorText + " " + f.url).match(/20\d{2}/g);
    const years = yearMatches ? yearMatches.map(Number) : [];
    const maxYear = years.length > 0 ? Math.max(...years) : 0;
    return { ...f, maxYear };
  });

  // Find the highest year across all files
  const highestYear = Math.max(...filesWithYear.map((f) => f.maxYear));

  if (highestYear > 0 && highestYear >= currentYear - 2) {
    // Only keep files from the latest year
    const latestFiles = filesWithYear.filter((f) => f.maxYear === highestYear);
    logger.info(
      {
        highestYear,
        totalFiles: files.length,
        latestFiles: latestFiles.length,
      },
      "Filtered to latest year files only",
    );
    return latestFiles;
  }

  // If no year detected, return first 2 files (most likely the latest ones on top)
  logger.info("No year detected in file links, taking first 2 files");
  return files.slice(0, 2);
}

export async function scrapePakistanTax() {
  logger.info("Starting Pakistan (FBR) multi-section tax scrape...");

  const downloadsDir = path.join(process.cwd(), "countries/PK/downloads");
  await fs.mkdir(downloadsDir, { recursive: true });

  let extractedDocumentCount = 0;
  let extractedPdfCount = 0;
  let withholdingRules: TaxRule[] = [];
  let salesTaxRules: TaxRule[] = [];
  const sourceDocuments: TaxDocumentSource[] = [];
  const scrapedSections: ScrapedSection[] = [];

  // Phase 1: Scrape all sub-pages
  for (const section of FBR_TAX_SECTIONS) {
    try {
      const result = await scrapeSubPage(section);
      scrapedSections.push(result);
    } catch (err) {
      logger.error(
        { err, section: section.name },
        "Failed to scrape sub-page, continuing...",
      );
    }
  }

  logger.info("FBR page discovery complete. Processing discovered documents...");

  // Phase 2: Download files and extract text from each section
  for (const section of scrapedSections) {
    const latestFiles = filterLatestFiles(section.fileLinks);
    logger.info(
      { section: section.name, selectedFileCount: latestFiles.length },
      "Processing current official documents",
    );

    if (latestFiles.length > 0) {
      for (const file of latestFiles) {
        try {
          const extracted = await downloadAndExtract(
            file.url,
            file.fileType,
            downloadsDir,
          );
          if (extracted.text.length > 0) {
            extractedDocumentCount += 1;
            if (extracted.type === "pdf") extractedPdfCount += 1;
            const retrievedAt = new Date().toISOString();
            const genericLinkText = /^\.?\s*(pdf|xlsx?|docx?|word|excel)$/i.test(file.anchorText);
            const documentName = genericLinkText || !file.anchorText
              ? extracted.fileName
              : file.anchorText;
            const ruleSource = {
              url: section.url,
              documentUrl: file.url,
              documentName,
              retrievedAt,
            };
            sourceDocuments.push({ authority: "FBR", ...ruleSource });

            if (section.name === "Withholding Tax" && extracted.type === "xlsx") {
              withholdingRules = parseWithholdingRateCard(
                extracted.buffer,
                ruleSource,
                extractTaxYear(file.url),
              );
            }
            if (section.name === "Sales Tax Act" && extracted.type === "pdf") {
              salesTaxRules = parseSalesTaxAct(extracted.text, ruleSource);
            }
          }
        } catch (err) {
          logger.error(
            { err, fileUrl: file.url },
            "Error downloading/extracting file",
          );
        }
      }
    } else {
    }
  }

  logger.info(
    {
      extractedDocumentCount,
      extractedPdfCount,
      sectionsScraped: scrapedSections.length,
      parsedWithholdingRules: withholdingRules.length,
      parsedSalesTaxRules: salesTaxRules.length,
    },
    "Official documents extracted and parsed locally",
  );

  if (withholdingRules.length < MIN_WITHHOLDING_RULES || salesTaxRules.length === 0) {
    throw new Error(
      `Local parsing was incomplete (withholding=${withholdingRules.length}, sales_tax=${salesTaxRules.length}); existing data was preserved.`,
    );
  }

  const updatedAt = new Date().toISOString();
  const parsedData = {
    country: "PK" as const,
    currency: "PKR" as const,
    version: "2026.0.0",
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: EFFECTIVE_TO,
    updated_at: updatedAt,
    taxes: {
      sales_tax: salesTaxRules,
      withholding_tax: withholdingRules,
      income_tax: [],
      fed: [],
    },
    source: {
      authority: "FBR",
      url: "https://fbr.gov.pk",
      documents: sourceDocuments,
    },
  };

  logger.info("Validating structured data against tax schema...");
  const validatedData = taxSchema.parse(parsedData);
  logger.info("Scraping completed and data validated successfully!");
  return validatedData;
}

function extractTaxYear(url: string): number {
  const match = url.match(/TaxRatesCard(\d{4})/i);
  if (!match) throw new Error(`Tax year could not be read from official document URL: ${url}`);
  return Number(match[1]);
}

function assertOfficialFbrUrl(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "fbr.gov.pk" || url.hostname.endsWith(".fbr.gov.pk"))
  ) {
    throw new Error(`Refusing non-official FBR URL: ${value}`);
  }
}
