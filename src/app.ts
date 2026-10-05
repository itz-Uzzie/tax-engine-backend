import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import taxRoutes from "./routes/tax";

export function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  app.register(taxRoutes, { prefix: "/api" });

  return app;
}
