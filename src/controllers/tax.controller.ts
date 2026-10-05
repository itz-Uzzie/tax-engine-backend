import { FastifyRequest, FastifyReply } from "fastify";
import {
  calculateTax,
  getCountries,
  getCountry,
} from "../services/tax.service";
import { scrapePakistanTax } from "../scrapers/pk.scraper";
import { savePakistanTax } from "../services/saveTax";

export async function calculateTaxController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as {
    country: string;
    amount: number;
    product_category?: string;
  };

  if (!body || !body.country || typeof body.amount !== "number") {
    request.log.warn({ body }, "Invalid calculate tax request");
    return reply
      .status(400)
      .send({
        error:
          "Invalid request body: country (string) and amount (number) are required.",
      });
  }

  try {
    request.log.info(
      { country: body.country, amount: body.amount },
      "Calculating tax",
    );
    const result = await calculateTax(body);
    request.log.info({ result }, "Tax calculated successfully");
    return reply.send(result);
  } catch (err: any) {
    request.log.error({ err, body }, "Error calculating tax");
    return reply.status(404).send({ error: err.message });
  }
}

export async function getCountriesController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const countries = await getCountries();
  return reply.send(countries);
}

export async function getCountryController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const params = request.params as { country: string };

  if (!params || !params.country) {
    request.log.warn("Country parameter is missing in get country request");
    return reply.status(400).send({ error: "Country parameter is required." });
  }

  try {
    request.log.info({ country: params.country }, "Fetching country tax data");
    const country = await getCountry(params.country);
    return reply.send(country);
  } catch (err: any) {
    request.log.error(
      { err, country: params.country },
      "Error fetching country tax data",
    );
    return reply.status(404).send({ error: err.message });
  }
}

export async function updateTaxDataController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const params = request.params as { country: string };

  if (!params || !params.country) {
    request.log.warn("Country parameter is missing in update tax request");
    return reply.status(400).send({ error: "Country parameter is required." });
  }

  const countryCode = params.country.toUpperCase();

  try {
    if (countryCode === "PK") {
      request.log.info("Starting tax data scrape for PK");
      const data = await scrapePakistanTax();
      request.log.info(
        {
          version: data.version,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
          ruleCounts: {
            salesTax: data.taxes.sales_tax.length,
            withholdingTax: data.taxes.withholding_tax.length,
            incomeTax: data.taxes.income_tax.length,
            federalExcise: data.taxes.fed.length,
          },
        },
        "Successfully scraped tax data for PK, saving...",
      );
      await savePakistanTax(data);
      request.log.info("Successfully saved tax data for PK");
      return reply.send({
        message: "Tax data for PK updated successfully",
        data,
      });
    } else {
      request.log.warn({ countryCode }, "Scraper not found for country");
      return reply
        .status(404)
        .send({
          error: `Scraper for country ${countryCode} not found or not implemented yet.`,
        });
    }
  } catch (err: any) {
    request.log.error(
      { err, countryCode },
      "Failed to scrape and update tax data",
    );
    return reply
      .status(500)
      .send({
        error: "Failed to scrape and update tax data",
        details: err.message,
      });
  }
}
