import "dotenv/config";
import { buildApp } from "./app";

const start = async () => {
  const app = buildApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 2000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await app.listen({
      port,
      host,
    });

    console.log(`Server running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
