// Records the animated ad intro and outro pages as video.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const path = require("path");

const VIEWPORT = { width: 412, height: 892 };

async function record(file, seconds, outDir) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: outDir, size: VIEWPORT },
  });
  const page = await context.newPage();
  await page.goto("file://" + path.join(__dirname, file));
  await page.waitForTimeout(seconds * 1000);
  await context.close();
  await browser.close();
}

(async () => {
  console.log("Recording intro (22s)...");
  await record("intro.html", 22, path.join(__dirname, "intro-vid"));
  console.log("Recording outro (8s)...");
  await record("outro.html", 8, path.join(__dirname, "outro-vid"));
  console.log("DONE");
})().catch((e) => { console.error(e); process.exit(1); });
