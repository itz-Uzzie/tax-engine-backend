import { scrapePakistanTax } from "../src/scrapers/pk.scraper";
import { savePakistanTax } from "../src/services/saveTax";

async function run() {
  const result = await scrapePakistanTax();
  await savePakistanTax(result);
}

run();
