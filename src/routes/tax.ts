import { FastifyInstance } from "fastify";
import {
  calculateTaxController,
  getCountriesController,
  getCountryController,
  updateTaxDataController,
} from "../controllers/tax.controller";

export default async function taxRoutes(app: FastifyInstance) {
  app.post("/calculate-tax", calculateTaxController);
  app.get("/countries", getCountriesController);
  app.get("/countries/:country", getCountryController);
  app.post("/countries/:country/update", updateTaxDataController);
}
