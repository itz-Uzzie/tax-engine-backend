export async function runScrapers() {
  console.log("Running scrapers to update country tax data...");
  // TODO: implement actual scrapers execution here
}

if (require.main === module) {
  runScrapers().catch(console.error);
}
