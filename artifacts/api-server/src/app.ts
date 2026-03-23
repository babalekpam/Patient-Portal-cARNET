import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

const NAVIMEDI_BASE = "https://navimedi.org/api";

app.all("/api/navimedi/{*path}", async (req: Request, res: Response) => {
  const targetPath = req.originalUrl.replace("/api/navimedi", "");
  const targetUrl = `${NAVIMEDI_BASE}${targetPath}`;
  const headers: Record<string, string> = {};
  const authHeader = req.headers["authorization"];
  if (authHeader && typeof authHeader === "string") {
    headers["Authorization"] = authHeader;
  }
  const incomingContentType = req.headers["content-type"];
  if (incomingContentType && typeof incomingContentType === "string") {
    headers["Content-Type"] = incomingContentType;
  }
  try {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve) => req.on("end", resolve));
    const rawBody = Buffer.concat(chunks);

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0) {
      fetchOptions.body = rawBody;
    }
    logger.info({ targetUrl, method: req.method, bodyLen: rawBody.length }, "Navimedi relay request");
    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    res.status(response.status);
    if (contentType.includes("application/json")) {
      const data = await response.json();
      res.json(data);
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (err) {
    logger.error({ err, targetUrl }, "Navimedi proxy error");
    res.status(502).json({ message: "Failed to reach the healthcare API." });
  }
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
