# PROJECT CONTEXT — Open Source Tax Engine

## 1. Project Overview

Project name: `tax-engine`

This is an **open-source, free-to-use tax calculation API/service**.

The current goal is intentionally simple:

> Users select a country, select a product/category, enter a sale or purchase price, and receive the applicable tax details.

The project should obtain tax/rate information from **official government sources only** whenever possible, using scraper/update bots that run on scheduled jobs.

Initial countries:

- Pakistan (`PK`) — FBR and other relevant official government sources
- United Arab Emirates (`UAE`) — relevant official UAE government/tax sources
- Saudi Arabia (`KSA`) — ZATCA and other relevant official government sources
- United Kingdom (`UK`) — relevant official government/tax sources

More countries should be easy to add later.

This is **NOT a SaaS application**.

Do NOT add:

- User accounts
- Authentication
- Billing/subscriptions
- Payments
- Admin dashboard
- ORM
- Database
- Frontend
- Multi-tenant functionality

The project should remain a clean, open-source developer-focused tax engine/API.

---

## 2. Main User Experience

The public API should make tax calculation simple.

A user/client should be able to provide:

```json
{
  "country": "PK",
  "transaction_type": "sale",
  "product_category": "standard",
  "amount": 10000
}
```

Example response:

```json
{
  "country": "PK",
  "transaction_type": "sale",
  "amount": 10000,
  "tax": {
    "taxable_amount": 10000,
    "rate": 18,
    "tax_amount": 1800,
    "total_amount": 11800
  }
}
```

The exact tax fields must depend on the country's actual rules.

Do NOT hard-code the example 18% rate as a universal rule. It is only an example.

The engine must use the currently published country data.

---

## 3. Important Tax Accuracy Principle

Tax information is high-impact financial information.

Therefore:

1. Prefer official government sources.
2. Store source URLs with tax data.
3. Store the publication/effective date when available.
4. Store the retrieval/update timestamp.
5. Store a version identifier.
6. Never silently overwrite historical versions.
7. Validate scraped/parsed data before making it `latest`.
8. If scraping fails, keep the last known valid version.
9. If parsing confidence is insufficient, do not publish the new data automatically.
10. The API should expose source/version metadata where practical.
11. Do not claim that the result is legal/tax advice.
12. Add a clear disclaimer in API documentation.

The scraper must fail safely.

A bad scrape must NEVER destroy a previously valid tax dataset.

---

## 4. Current Technology Stack

Runtime:

- Node.js
- TypeScript
- Fastify

Dependencies already installed include:

- `fastify`
- `@fastify/swagger`
- `@fastify/swagger-ui`
- `zod`
- `cheerio`
- `playwright`
- `node-fetch`
- `pdf-parse`
- `mammoth`
- `xlsx`
- `adm-zip`
- `@google/genai`
- `dotenv`
- `pino-pretty`

Development:

- TypeScript
- tsx
- Prettier
- Husky
- lint-staged

Do not introduce unnecessary dependencies.

Before adding a dependency, check whether the existing stack can solve the problem.

---

## 5. Current Project Structure

Current important structure:

```text
D:\tax-engine

countries/
    KSA/
        latest.json
    PK/
        downloads/
        versions/
        latest.json
    UAE/
        latest.json
    UK/
        latest.json

data/
    countries/
        PK/
            country.json
            latest.json
            manifest.json
            versions/
                2025.0.0/
                    metadata.json
                    withholding-tax.json

src/
    controllers/
        tax.controller.ts

    engine/

    extractors/
        docx.ts
        excel.ts
        pdf.ts
        zip.ts

    parsers/
        generic.parsers.ts
        llm.parser.ts
        pdf.parser.ts
        regex.parser.ts
        xlsx.parser.ts

    routes/
        tax.ts

    scrapers/
        pk.scraper.ts

    services/
        saveTax.ts
        tax.service.ts

    utils/
        llmFallback.ts
        logger.ts

    validators/
        tax.validator.ts

    app.ts
    server.ts

workers/
    update-all.ts
    update-pk.ts
```

`dist/` is generated build output and should not be treated as the source of truth.

---

## 6. Existing Architecture Direction

Keep the project modular.

Expected flow:

```text
Official Government Source
        ↓
Country Scraper
        ↓
Download
        ↓
File Type Detection
        ↓
Extractor
        ↓
Parser
        ↓
Normalized Tax Rules
        ↓
Validation
        ↓
Versioned Country Data
        ↓
latest.json
        ↓
Tax Engine
        ↓
Fastify API
```

The scraper/update pipeline and tax calculation engine should remain separate.

---

## 7. Scraper Requirements

Each country can have its own scraper.

Example:

```text
src/scrapers/pk.scraper.ts
```

Future:

```text
src/scrapers/uae.scraper.ts
src/scrapers/ksa.scraper.ts
src/scrapers/uk.scraper.ts
```

Scrapers should:

1. Access official government sources.
2. Find the latest relevant tax document/data.
3. Download it when necessary.
4. Detect the file type.
5. Extract the content.
6. Parse relevant tax rules.
7. Normalize the rules into the project's schema.
8. Validate the result.
9. Compare with the existing version.
10. Save a new version only when appropriate.
11. Update `latest.json` only after successful validation.
12. Preserve old versions.

Do not make a scraper dependent on one fragile CSS selector if a more robust approach is possible.

Use multiple extraction strategies where appropriate.

---

## 8. Official Sources Only

Tax data should come from official sources.

Examples:

Pakistan:

- FBR
- Pakistan government official domains
- Other relevant official government authorities

UAE:

- UAE Federal Tax Authority
- Official UAE government domains

Saudi Arabia:

- ZATCA
- Official Saudi government domains

UK:

- GOV.UK
- HMRC

Do not use random tax blogs as authoritative tax sources.

Third-party sources may be useful for discovering a document, but the published tax rule should be verified against an official source.

Each dataset should preserve the original official source URL.

---

## 9. Country Data Must Be Versioned

Never rely only on one mutable file.

Recommended structure:

```text
data/
  countries/
    PK/
      country.json
      manifest.json
      latest.json
      versions/
        2025.0.0/
          metadata.json
          ...
        2025.1.0/
          metadata.json
          ...
```

Historical versions must remain available.

`latest.json` is the active published dataset.

A version should contain enough metadata to answer:

- Which country?
- Which tax rule?
- What rate?
- What category?
- Effective from when?
- Effective until when, if known?
- Source?
- Source URL?
- Retrieved when?
- Published when?
- Dataset version?
- Any notes/exceptions?

---

## 10. Suggested Normalized Rule Concept

Do not force every country into identical tax rules.

Countries can have different tax systems.

However, create a common normalized representation where possible.

Conceptually:

```json
{
  "country": "PK",
  "taxType": "sales_tax",
  "category": "standard",
  "rate": 18,
  "rateType": "percentage",
  "effectiveFrom": "YYYY-MM-DD",
  "effectiveTo": null,
  "source": {
    "authority": "Official Government Authority",
    "url": "https://official-source.example",
    "retrievedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

Country-specific fields may be added when required.

Examples:

- exemptions
- reduced rates
- zero-rated supplies
- thresholds
- withholding taxes
- province-specific rules
- product-specific rates
- registration requirements
- transaction-type differences

Do not destroy country-specific information just to fit a generic schema.

---

## 11. Tax Engine Requirements

The tax calculation logic belongs in services/engine modules, NOT routes.

Routes should only handle:

```text
request
→ validation
→ controller/service
→ response
```

Tax calculation should be independent from Fastify so it can eventually be used by:

- REST API
- CLI
- other Node applications
- future SDK
- tests

The engine should not scrape government websites while calculating a request.

Calculation must use the currently validated local dataset.

---

## 12. Transaction Types

The API should support at least:

```text
sale
purchase
```

Do not assume that sale and purchase always have the same tax treatment.

A rule may depend on:

- transaction type
- product category
- country
- amount
- threshold
- tax type
- exemption
- registration status
- jurisdiction

Design the schema so these can be supported.

---

## 13. Product Categories

Do not create an enormous hard-coded category list unnecessarily.

Start with a small normalized category system, for example:

```text
standard
zero_rated
exempt
reduced
custom
```

But allow country datasets to define more specific categories.

Example:

```text
perfume
food
medicine
electronics
services
standard_goods
```

The exact category/rate must come from the country's data.

---

## 14. API Routes

Initial routes:

```text
GET  /countries
GET  /countries/:country
POST /calculate-tax
```

Recommended additional public/read-only routes if useful:

```text
GET /countries/:country/taxes
GET /countries/:country/version
GET /countries/:country/sources
GET /health
```

Do not add unnecessary endpoints.

---

## 15. Example API

Request:

```http
POST /calculate-tax
Content-Type: application/json
```

```json
{
  "country": "PK",
  "transaction_type": "sale",
  "amount": 10000,
  "product_category": "standard"
}
```

Possible response:

```json
{
  "country": "PK",
  "transaction_type": "sale",
  "product_category": "standard",
  "amount": 10000,
  "tax": {
    "taxable_amount": 10000,
    "rate": 18,
    "tax_amount": 1800,
    "total_amount": 11800
  },
  "source": {
    "version": "2025.0.0",
    "authority": "Official Government Authority",
    "effective_from": "YYYY-MM-DD"
  }
}
```

Actual fields and calculations must come from the country dataset.

---

## 16. Validation

Use Zod for request and data validation.

Validate:

- country
- transaction type
- amount
- category
- required country-specific fields

Reject invalid amounts such as:

```text
NaN
Infinity
negative amounts
non-numeric strings
```

Be careful with floating-point money calculations.

Prefer a reliable money/decimal strategy rather than allowing floating-point errors to affect tax results.

Do not add a dependency solely for this unless necessary; first evaluate integer minor units or another safe existing approach.

---

## 17. Scraper Scheduling

The intended update process is:

```text
Daily at 12:00 AM
        ↓
update-all worker
        ↓
PK scraper
UAE scraper
KSA scraper
UK scraper
        ↓
validate
        ↓
publish changed datasets
```

However, scraper execution should be independent per country.

If Pakistan fails:

```text
PK ❌
UAE ✅
KSA ✅
UK ✅
```

the successful countries should still update.

A single scraper failure must not stop the entire update process.

---

## 18. Idempotency

Running a scraper twice without a source change should NOT create meaningless duplicate versions.

The system should compare normalized tax data or a stable content hash.

If nothing changed:

```text
No new version required.
```

If the official source changed:

```text
Create new version.
Archive/preserve previous version.
Update latest.json.
```

---

## 19. Failure Safety

This is extremely important.

Never do:

```text
download
→ immediately replace latest.json
```

Instead:

```text
download
→ extract
→ parse
→ normalize
→ validate
→ sanity check
→ write new version
→ verify written data
→ update latest.json
```

If anything fails:

```text
keep existing latest.json
```

Log the failure clearly.

---

## 20. Validation/Sanity Checks

Before publishing a new tax dataset, check things such as:

- country code is correct
- tax rate is numeric
- tax rate is within a sensible range
- category exists
- effective date is valid
- source URL exists
- required metadata exists
- no duplicate rules
- no malformed rules
- no empty parsed dataset
- expected tax rules were found

Do not blindly accept LLM output.

---

## 21. LLM Usage

The project currently contains:

```text
src/parsers/llm.parser.ts
src/utils/llmFallback.ts
```

LLMs may be used as a parsing/helper layer for difficult government documents.

They must NOT be treated as the authority.

Correct architecture:

```text
Official Document
      ↓
Extraction
      ↓
Parser
      ↓
LLM assistance if required
      ↓
Strict schema validation
      ↓
Rule sanity checks
      ↓
Publish
```

Never:

```text
Government PDF
      ↓
LLM
      ↓
Trust output blindly
```

LLM output must always pass deterministic validation.

If the LLM produces uncertain/invalid data, reject the update.

---

## 22. Source Provenance

Every published tax rule should ideally be traceable back to its official source.

Store metadata such as:

```json
{
  "source": {
    "authority": "FBR",
    "url": "https://...",
    "documentUrl": "https://...",
    "documentName": "...",
    "retrievedAt": "...",
    "effectiveFrom": "...",
    "publishedAt": "..."
  }
}
```

This is important for an open-source tax engine because developers need to understand where a rule came from.

---

## 23. API Documentation

Swagger UI is already installed.

Keep the API well documented.

Swagger should explain:

- endpoint
- request schema
- response schema
- country codes
- transaction types
- category values
- errors
- tax source/version metadata
- disclaimer

The API should be easy for another developer to test.

---

## 24. Error Handling

Use predictable HTTP errors.

Examples:

```text
400 Invalid request
404 Country not found
404 Tax category/rule not found
422 Unable to calculate from supplied data
500 Internal server error
```

Do not leak internal stack traces in production responses.

Log detailed errors server-side.

---

## 25. Logging

Use the existing logger.

Log important scraper events:

```text
[PK] Starting scraper
[PK] Source discovered
[PK] Download completed
[PK] Extracting PDF
[PK] Parsing rules
[PK] Validation passed
[PK] No tax changes detected
```

or:

```text
[PK] Validation failed
[PK] Existing latest dataset preserved
```

Logs should make debugging scraper failures easy.

---

## 26. Testing

The project should have tests for the most important logic.

Prioritize:

### Tax calculation tests

Examples:

```text
10000 × 18% = 1800
```

### Category tests

```text
standard
zero-rated
exempt
reduced
```

### Country tests

At least PK initially, then UAE/KSA/UK.

### Data validation tests

Invalid rate, invalid country, missing source, malformed rule, etc.

### Scraper tests

Prefer fixture/sample documents over repeatedly hitting government websites during normal tests.

Tests must not depend on live government websites.

---

## 27. Open Source Expectations

This should be a professional open-source repository.

Add:

```text
README.md
LICENSE
CONTRIBUTING.md
```

README should explain:

- what the project does
- supported countries
- API usage
- examples
- data update mechanism
- official sources
- disclaimer
- development setup
- how to add a country
- how to add a scraper
- how to run workers
- how to run tests

---

## 28. Country Expansion

Adding a country should be straightforward.

Ideally:

```text
src/scrapers/<country>.scraper.ts
countries/<COUNTRY>/
data/countries/<COUNTRY>/
```

A new country should not require rewriting the entire tax engine.

Use interfaces/contracts where useful.

For example, conceptually:

```ts
interface CountryScraper {
  countryCode: string;
  run(): Promise<ScrapeResult>;
}
```

and:

```ts
interface TaxRule {
  ...
}
```

Do not over-engineer this prematurely.

---

## 29. Current Important Constraint

This project is **not a general accounting system**.

It is a **tax rules/data + calculation engine**.

Do not add:

- invoices
- accounting ledgers
- customers
- inventory
- payments
- bookkeeping
- user profiles

unless explicitly requested later.

---

## 30. Deployment Goal

The project should eventually be deployable as a free/public API.

Keep deployment simple.

The architecture should support:

```text
API server
+
scheduled scraper worker
+
file-based tax data
```

No database is required.

If the deployment platform cannot persist filesystem changes reliably, do NOT silently assume runtime-generated files will survive redeploy/restart.

For the open-source version, prefer a workflow where generated tax-data changes can be committed/versioned into the repository or otherwise stored in a persistent location.

Do not introduce a database merely to solve deployment unless explicitly requested.

---

## 31. Security

Even though there is no authentication, the API should still be hardened.

Consider:

- request validation
- payload size limits
- rate limiting if appropriate
- SSRF protection for any user-controlled URL fetching
- scraper URL allowlists
- safe file handling
- path traversal prevention
- avoiding arbitrary command execution
- avoiding unsafe ZIP extraction
- timeout handling
- Playwright resource limits

Never allow public API users to provide arbitrary URLs that the server blindly fetches.

---

## 32. Development Principles

Always follow:

- TypeScript strict mode
- async/await
- modular architecture
- small focused functions
- clear naming
- deterministic calculations
- schema validation
- source provenance
- versioned data
- safe updates
- proper error handling

Do not put business logic in routes.

Do not put tax calculation logic in controllers.

Do not couple tax calculation to scrapers.

Do not couple the engine to Fastify.

---

## 33. Current Priority

The immediate priority is:

### Phase 1

Make the core engine reliable.

```text
Country data
      ↓
Validation
      ↓
Tax calculation
      ↓
POST /calculate-tax
```

### Phase 2

Make Pakistan scraper reliable.

```text
FBR official source
      ↓
Download
      ↓
Extract
      ↓
Parse
      ↓
Validate
      ↓
Version
      ↓
latest.json
```

### Phase 3

Add UAE, Saudi Arabia and UK.

### Phase 4

Add scheduled update-all worker.

### Phase 5

Improve documentation, tests and open-source contributor experience.

---

## 34. What Codex Should Do

When modifying this project:

1. First inspect the existing source code.
2. Understand the current architecture before changing it.
3. Reuse existing modules where possible.
4. Do not blindly recreate files that already exist.
5. Do not introduce a database.
6. Do not introduce authentication.
7. Do not create a frontend.
8. Do not turn this into SaaS.
9. Do not remove working scraper/extractor/parser code without understanding it.
10. Preserve existing country data and historical versions.
11. Prefer small, reviewable changes.
12. Run TypeScript/build checks after changes.
13. Add tests for important tax logic.
14. Keep generated `dist/` output consistent with the normal build process rather than manually editing it.
15. When a scraper changes, make sure a failed scrape cannot corrupt `latest.json`.

Before implementing a major architectural change, explain the reason and impact.

---

## 35. Definition of Success

The project is successful when someone can clone the repository and run:

```bash
npm install
npm run dev
```

Then open Swagger UI and perform:

```text
GET /countries
```

select a country, provide:

```text
country
transaction type
product category
amount
```

and receive a trustworthy, structured tax calculation backed by versioned tax data with source metadata.

The system should also be able to periodically inspect official government sources and safely update the country datasets without destroying previously valid data.

---

## 36. Legal/Tax Disclaimer

The project should clearly state that:

> This project provides tax calculations based on publicly available tax rules and official government sources. It is an open-source software project and does not constitute legal, tax, accounting, or financial advice. Users should verify applicable tax rules with the relevant government authority or a qualified professional before relying on a calculation for compliance purposes.

The disclaimer should be visible in the README and API documentation.
