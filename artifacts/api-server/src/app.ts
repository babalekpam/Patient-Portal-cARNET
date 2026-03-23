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
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

const NAVIMEDI_BASE = "https://navimedi.org/api";

app.all("/api/navimedi/{*path}", async (req: Request, res: Response) => {
  const targetPath = req.originalUrl.replace("/api/navimedi", "");
  const targetUrl = `${NAVIMEDI_BASE}${targetPath}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authHeader = req.headers["authorization"];
  if (authHeader && typeof authHeader === "string") {
    headers["Authorization"] = authHeader;
  }
  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    logger.info({ targetUrl, method: req.method, body: req.body }, "Navimedi relay request");
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

app.use("/api", router);

export default app;
