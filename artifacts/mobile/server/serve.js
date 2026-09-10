/**
 * Standalone production server for Expo static builds.
 *
 * Static files are inventoried once at startup. Request paths are only lookup
 * keys into that inventory and are never appended to a filesystem path.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const BLOCKED_EXTENSIONS = new Set([
  ".map",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".env",
  ".keystore",
  ".jks",
]);

// Fail closed rather than allowing an unexpectedly large build to exhaust the
// server at startup. Normal minified Expo bundles and assets are well below
// these limits.
const MAX_STATIC_FILE_BYTES = 128 * 1024 * 1024;
const MAX_STATIC_TOTAL_BYTES = 512 * 1024 * 1024;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-dns-prefetch-control": "off",
};

function isPublicBuildFile(relativePath) {
  const segments = relativePath.split(path.sep);
  if (segments.some((segment) => !segment || segment.startsWith("."))) {
    return false;
  }

  const basename = segments.at(-1);
  const extension = path.extname(basename).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return false;
  }

  return !/(?:^|[._-])(secret|credentials?|private[-_]?key)(?:[._-]|$)/i.test(
    basename,
  );
}

function buildStaticFileWhitelist(staticRoot) {
  const whitelist = new Map();
  let totalBytes = 0;
  let canonicalRoot;

  try {
    canonicalRoot = fs.realpathSync(staticRoot);
  } catch {
    return whitelist;
  }

  function visit(directory, relativeDirectory = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);

      // Do not follow directory or file symlinks, even if they currently point
      // back into the build root.
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile() || !isPublicBuildFile(relativePath)) {
        continue;
      }

      const descriptor = fs.openSync(
        absolutePath,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
      );
      try {
        const stat = fs.fstatSync(descriptor);
        const canonicalPath = fs.realpathSync(absolutePath);
        if (
          !stat.isFile() ||
          (canonicalPath !== canonicalRoot &&
            !canonicalPath.startsWith(`${canonicalRoot}${path.sep}`))
        ) {
          continue;
        }
        if (stat.size > MAX_STATIC_FILE_BYTES) {
          throw new Error("Static build contains a file larger than the serving limit");
        }
        if (totalBytes + stat.size > MAX_STATIC_TOTAL_BYTES) {
          throw new Error("Static build exceeds the total serving limit");
        }

        const content = fs.readFileSync(descriptor);
        if (content.length > MAX_STATIC_FILE_BYTES) {
          throw new Error("Static build contains a file larger than the serving limit");
        }
        totalBytes += content.length;
        if (totalBytes > MAX_STATIC_TOTAL_BYTES) {
          throw new Error("Static build exceeds the total serving limit");
        }

        const publicPath = `/${relativePath.split(path.sep).join("/")}`;
        const extension = path.extname(entry.name).toLowerCase();
        whitelist.set(publicPath, {
          content,
          contentType: MIME_TYPES[extension] || "application/octet-stream",
        });
      } finally {
        fs.closeSync(descriptor);
      }
    }
  }

  visit(canonicalRoot);
  return whitelist;
}

function getAppName(appJsonPath = path.resolve(__dirname, "..", "app.json")) {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function writeResponse(req, res, status, headers, body = "") {
  const responseBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...headers,
    "content-length": responseBody.length,
  });
  res.end(req.method === "HEAD" ? undefined : responseBody);
}

function serveManifest(req, res, platform, whitelist) {
  const manifest = whitelist.get(`/${platform}/manifest.json`);

  if (!manifest) {
    writeResponse(
      req,
      res,
      404,
      { "content-type": "application/json; charset=utf-8" },
      JSON.stringify({ error: "Manifest not found" }),
    );
    return;
  }

  writeResponse(
    req,
    res,
    200,
    {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
    },
    manifest.content,
  );
}

function firstForwardedValue(value) {
  return Array.isArray(value) ? value[0] : String(value || "").split(",")[0].trim();
}

function getPublicOrigin(req) {
  const protocol = firstForwardedValue(req.headers["x-forwarded-proto"]) || "https";
  if (protocol !== "http" && protocol !== "https") {
    return null;
  }

  const requestedHost =
    firstForwardedValue(req.headers["x-forwarded-host"]) ||
    firstForwardedValue(req.headers.host);
  try {
    const parsed = new URL(`${protocol}://${requestedHost}`);
    if (
      !requestedHost ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return { baseUrl: parsed.origin, host: parsed.host };
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const origin = getPublicOrigin(req);
  if (!origin) {
    writeResponse(req, res, 400, { "content-type": "text/plain; charset=utf-8" }, "Bad Request");
    return;
  }

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, escapeHtml(origin.baseUrl))
    .replace(/EXPS_URL_PLACEHOLDER/g, escapeHtml(origin.host))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  writeResponse(
    req,
    res,
    200,
    {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    html,
  );
}

function parseRequestPath(requestUrl) {
  const rawPath = String(requestUrl || "").split(/[?#]/, 1)[0];
  if (!rawPath.startsWith("/") || rawPath.includes("\\")) {
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  // A remaining percent can be decoded by a downstream layer. Reject it so
  // double-encoded separators and dot segments cannot acquire new meaning.
  if (
    decodedPath.includes("%") ||
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    decodedPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  return decodedPath;
}

function normalizeBasePath(value) {
  const trimmed = String(value || "/").replace(/\/+$/, "");
  return !trimmed || trimmed === "/" ? "" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function createRequestHandler(options = {}) {
  const staticRoot = options.staticRoot || STATIC_ROOT;
  const whitelist =
    options.whitelist || buildStaticFileWhitelist(staticRoot);
  const landingPageTemplate =
    options.landingPageTemplate || fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const appName = options.appName || getAppName();
  const basePath = normalizeBasePath(
    options.basePath === undefined ? process.env.BASE_PATH : options.basePath,
  );

  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      writeResponse(
        req,
        res,
        405,
        {
          allow: "GET, HEAD",
          "content-type": "text/plain; charset=utf-8",
        },
        "Method Not Allowed",
      );
      return;
    }

    let pathname = parseRequestPath(req.url);
    if (pathname === null) {
      writeResponse(req, res, 400, { "content-type": "text/plain; charset=utf-8" }, "Bad Request");
      return;
    }

    if (basePath) {
      if (pathname === basePath) {
        pathname = "/";
      } else if (pathname.startsWith(`${basePath}/`)) {
        pathname = pathname.slice(basePath.length);
      }
    }

    if (pathname === "/" || pathname === "/manifest") {
      const platform = firstForwardedValue(req.headers["expo-platform"]);
      if (platform === "ios" || platform === "android") {
        serveManifest(req, res, platform, whitelist);
        return;
      }

      if (pathname === "/") {
        serveLandingPage(req, res, landingPageTemplate, appName);
        return;
      }
    }

    const staticFile = whitelist.get(pathname);
    if (!staticFile) {
      writeResponse(req, res, 404, { "content-type": "text/plain; charset=utf-8" }, "Not Found");
      return;
    }

    writeResponse(
      req,
      res,
      200,
      {
        "content-type": staticFile.contentType,
        "cache-control": "public, max-age=31536000, immutable",
      },
      staticFile.content,
    );
  };
}

function startServer() {
  const server = http.createServer(createRequestHandler());
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Serving static Expo build on port ${port}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  buildStaticFileWhitelist,
  createRequestHandler,
  parseRequestPath,
  startServer,
};