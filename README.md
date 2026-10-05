# Tax Engine

Tax Engine is an open-source, file-based tax rules and calculation API built with Node.js, TypeScript, and Fastify. It serves locally stored country datasets and includes a Pakistan scraper that retrieves tax documents from official FBR pages.

Tax rules are high impact financial information. This project is a software tool, not a tax authority or a substitute for professional advice. Verify the applicable rules with the relevant government authority or a qualified professional before relying on a calculation for compliance.

## Current status

- Country datasets are present for Pakistan (PK), UAE, Saudi Arabia (KSA), and the United Kingdom (UK).
- Automatic source discovery and document parsing are currently implemented for Pakistan only.
- Pakistan scraping prioritizes local extraction and parsers for official HTML, PDF, and XLSX documents. The active update flow does not call an LLM.
- The calculation endpoint currently calculates a standard sales-tax rate from the selected country's local dataset. It does not yet calculate the full range of parsed withholding-tax rules, exemptions, or transaction-specific cases.
- Scraper updates are validated before publication. A failed or incomplete parse should preserve the previously published dataset.

Country files and their version history live under `countries/`. Raw downloaded source documents are stored under `countries/<COUNTRY>/downloads/` while scraping and are excluded from Git; the scraper can fetch them again. Keep normalized `latest.json` files and versioned data in the repository.

## Requirements

- Node.js 20 or newer
- npm

No database or LLM API key is required to run the current API and local parsing flow.

## Quick start

```bash
git clone <repository-url>
cd tax-engine
npm ci
```

Copy `.env.example` to `.env` if you want to configure the host or port. The defaults are `0.0.0.0:2000`.

```bash
npm run dev
```

The API is available at `http://localhost:2000`.

## Commands

```bash
npm run dev       # Run the API with tsx watch
npm run build     # Compile TypeScript into dist/
npm start         # Run the compiled API
```

The update worker exists at `workers/update-pk.ts`, but there is not yet an npm script for it. The all-country worker is a placeholder. Add a documented package script when worker invocation is standardized.

## API

All API routes use the `/api` prefix.

### List available country datasets

```http
GET /api/countries
```

### Read a country's current dataset

```http
GET /api/countries/PK
```

### Calculate standard sales tax

```http
POST /api/calculate-tax
Content-Type: application/json
```

```json
{
  "country": "PK",
  "amount": 10000,
  "product_category": "standard"
}
```

The current handler requires `country` and numeric `amount`. `product_category` is accepted in the request type, but the current calculation logic uses the standard sales-tax rate and does not yet select rules by category or transaction type. A successful response currently has this shape:

```json
{
  "country": "PK",
  "amount": 10000,
  "tax_rate": 18,
  "tax_amount": 1800,
  "total_amount": 11800
}
```

The rate comes from the active local country dataset; the example rate is not universal.

### Refresh Pakistan data

```http
POST /api/countries/PK/update
```

This fetches current documents from the Pakistan Federal Board of Revenue (FBR), extracts their content locally, parses supported tax rules, validates the result, and saves a versioned dataset. It requires network access to official FBR pages and the linked document host. The endpoint is currently implemented for PK only.

## Data sources and parsing

The Pakistan scraper discovers documents from official FBR pages, including the [Withholding Tax Rate Card](https://fbr.gov.pk/withholding-taxes-rate-card/174298/174301) and [Sales Tax Act](https://fbr.gov.pk/categ/sales-tax-act/301). Local extractors handle supported formats such as PDF and XLSX, and parsed rules retain source and document provenance.

Parsing can be incomplete when a source document changes format or contains rules the local parser does not yet understand. The update should fail validation rather than publish an empty or incomplete replacement. Review scraper logs and the generated diff/data before relying on a new dataset.

## Adding a country or parser

Country datasets are stored under `countries/<COUNTRY>/`, with `latest.json` pointing to the currently published rules and `versions/` retaining prior snapshots. A country scraper should use official government sources, preserve source URLs and retrieval/effective dates, normalize rules into the validated schema, and publish only after validation. Add fixtures for parser changes where possible; ordinary development should not depend on live government websites.

When adding a parser, prefer deterministic local extraction first. LLM parser/fallback modules exist in the repository but are not used in the active Pakistan update flow. Do not publish unverified model output as a tax rule.

## Contributing

Contributions should preserve official-source provenance, historical versions, and failure-safe publication. Do not commit `.env` files, API credentials, or raw downloaded source documents. Run `npm run build` before opening a change. Please include parser fixtures or reproducible examples for parsing changes. A dedicated `CONTRIBUTING.md`, automated test suite, and license file have not yet been added.

## Disclaimer

This project provides tax calculations based on publicly available tax rules and official government sources. It is an open-source software project and does not constitute legal, tax, accounting, or financial advice. Users should verify applicable tax rules with the relevant government authority or a qualified professional before relying on a calculation for compliance purposes.
