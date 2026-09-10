import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  formatters: {
    log(object) {
      const safe: Record<string, string | number> = {
        category: typeof object.category === "string" ? object.category : "service",
      };
      if (typeof object.status === "number") safe.status = object.status;
      if (typeof object.correlationId === "string") {
        safe.correlationId = object.correlationId;
      }
      return safe;
    },
  },
  redact: [
    "**.authorization",
    "**.cookie",
    "**.token",
    "**.password",
    "**.email",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
