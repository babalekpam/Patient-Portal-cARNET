const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildStaticFileWhitelist,
  createRequestHandler,
  parseRequestPath,
} = require("./serve");

function makeBuild(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "expo-static-server-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, "ios"), { recursive: true });
  fs.mkdirSync(path.join(root, "android"), { recursive: true });
  fs.mkdirSync(
    path.join(root, "1700000000000-1", "_expo", "static", "js", "ios"),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(root, "ios", "manifest.json"),
    JSON.stringify({ platform: "ios" }),
  );
  fs.writeFileSync(
    path.join(root, "android", "manifest.json"),
    JSON.stringify({ platform: "android" }),
  );
  fs.writeFileSync(
    path.join(
      root,
      "1700000000000-1",
      "_expo",
      "static",
      "js",
      "ios",
      "bundle.js",
    ),
    "globalThis.__bundleLoaded = true;",
  );
  return root;
}

function request(handler, url, { method = "GET", headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: { host: "preview.example.test", ...headers },
  };
  const result = { status: null, headers: null, body: Buffer.alloc(0) };
  const res = {
    writeHead(status, responseHeaders) {
      result.status = status;
      result.headers = responseHeaders;
    },
    end(body) {
      if (body) result.body = Buffer.from(body);
    },
  };
  handler(req, res);
  return result;
}

test("serves landing page, Expo manifests, and inventoried bundles", (t) => {
  const root = makeBuild(t);
  const handler = createRequestHandler({
    staticRoot: root,
    landingPageTemplate:
      "<title>APP_NAME_PLACEHOLDER</title> exps://EXPS_URL_PLACEHOLDER",
    appName: "CARNET",
    basePath: "/",
  });

  const landing = request(handler, "/");
  assert.equal(landing.status, 200);
  assert.match(landing.body.toString(), /<title>CARNET<\/title>/);
  assert.match(landing.body.toString(), /exps:\/\/preview\.example\.test/);
  assert.equal(landing.headers["x-content-type-options"], "nosniff");
  assert.equal(landing.headers["cache-control"], "no-store");
  assert.equal(landing.headers["x-frame-options"], undefined);

  for (const platform of ["ios", "android"]) {
    const response = request(handler, "/manifest", {
      headers: { "expo-platform": platform },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { platform });
    assert.equal(response.headers["expo-protocol-version"], "1");
  }

  const bundle = request(
    handler,
    "/1700000000000-1/_expo/static/js/ios/bundle.js",
  );
  assert.equal(bundle.status, 200);
  assert.equal(bundle.headers["content-type"], "application/javascript; charset=utf-8");
  assert.match(bundle.body.toString(), /__bundleLoaded/);
});

test("rejects traversal, encoded traversal, and malformed request paths", (t) => {
  const root = makeBuild(t);
  const handler = createRequestHandler({
    staticRoot: root,
    landingPageTemplate: "landing",
    appName: "App",
    basePath: "/",
  });
  const attacks = [
    "/../server/serve.js",
    "/%2e%2e/server/serve.js",
    "/%252e%252e%252fserver%252fserve.js",
    "/..%5cserver%5cserve.js",
    "/%2e%2e%2fios%2fmanifest.json",
    "/%00/ios/manifest.json",
    "/%ZZ",
    "\\..\\server\\serve.js",
  ];

  for (const attack of attacks) {
    const response = request(handler, attack);
    assert.notEqual(response.status, 200, attack);
  }

  assert.equal(parseRequestPath("/safe/%252e%252e/file"), null);
  assert.equal(parseRequestPath("/safe/../file"), null);
});

test("startup whitelist excludes links, source maps, hidden and credential files", (t) => {
  const root = makeBuild(t);
  const outside = path.join(root, "..", `${path.basename(root)}-outside.txt`);
  fs.writeFileSync(outside, "private");
  t.after(() => fs.rmSync(outside, { force: true }));
  fs.writeFileSync(path.join(root, "bundle.js.map"), "{}");
  fs.writeFileSync(path.join(root, "service-account.key"), "private");
  fs.writeFileSync(path.join(root, ".env"), "TOKEN=private");
  fs.symlinkSync(outside, path.join(root, "linked.txt"));

  const whitelist = buildStaticFileWhitelist(root);
  assert.equal(whitelist.has("/ios/manifest.json"), true);
  assert.equal(whitelist.has("/bundle.js.map"), false);
  assert.equal(whitelist.has("/service-account.key"), false);
  assert.equal(whitelist.has("/.env"), false);
  assert.equal(whitelist.has("/linked.txt"), false);
});

test("requests serve the startup snapshot without request-time filesystem reads", (t) => {
  const root = makeBuild(t);
  const bundlePath = path.join(
    root,
    "1700000000000-1",
    "_expo",
    "static",
    "js",
    "ios",
    "bundle.js",
  );
  const handler = createRequestHandler({
    staticRoot: root,
    landingPageTemplate: "landing",
    appName: "App",
    basePath: "/",
  });

  fs.writeFileSync(bundlePath, "changed after startup");
  const response = request(
    handler,
    "/1700000000000-1/_expo/static/js/ios/bundle.js",
  );
  assert.equal(response.status, 200);
  assert.match(response.body.toString(), /__bundleLoaded/);
  assert.doesNotMatch(response.body.toString(), /changed after startup/);
});

test("only GET and HEAD are accepted and HEAD has no body", (t) => {
  const root = makeBuild(t);
  const handler = createRequestHandler({
    staticRoot: root,
    landingPageTemplate: "landing",
    appName: "App",
    basePath: "/",
  });

  const head = request(handler, "/manifest", {
    method: "HEAD",
    headers: { "expo-platform": "ios" },
  });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.ok(Number(head.headers["content-length"]) > 0);

  const post = request(handler, "/manifest", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
});

test("base path matches only a complete path segment", (t) => {
  const root = makeBuild(t);
  const handler = createRequestHandler({
    staticRoot: root,
    landingPageTemplate: "landing",
    appName: "App",
    basePath: "/mobile",
  });

  assert.equal(request(handler, "/mobile").status, 200);
  assert.equal(
    request(handler, "/mobile/manifest", {
      headers: { "expo-platform": "ios" },
    }).status,
    200,
  );
  assert.equal(request(handler, "/mobile-other").status, 404);
});