// Records a realistic demo video of the NaviMED Patient Portal (Expo web build)
// by driving the real app in Chromium and fulfilling its EHR API calls with demo data.
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require("/opt/node22/lib/node_modules/playwright");
}
const { chromium } = playwright;
const path = require("path");
const data = require("./mockdata.js");

const OUT_DIR = path.join(__dirname, "video");
const APP_URL = "http://localhost:8081";
const VIEWPORT = { width: 412, height: 892 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body) {
  return { status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(body) };
}

async function handleApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname; // e.g. /api/patient/profile
  if (req.method() === "OPTIONS") {
    return route.fulfill({ status: 204, headers: CORS });
  }
  if (p.endsWith("/auth/login") || p.endsWith("/auth/patient-login")) return route.fulfill(json(data.loginResponse));
  if (p.endsWith("/patient/profile")) return route.fulfill(json(data.profile));
  if (p.endsWith("/patient/appointments")) return route.fulfill(json(data.appointments));
  if (p.endsWith("/patient/prescriptions")) return route.fulfill(json(data.prescriptions));
  if (p.endsWith("/patient/lab-results")) return route.fulfill(json(data.labResults));
  if (p.endsWith("/medical-communications")) {
    if (req.method() === "POST") return route.fulfill(json({ id: "msg-new", status: "sent" }));
    return route.fulfill(json(data.messages));
  }
  if (p.endsWith("/patient/visit-summaries")) return route.fulfill(json(data.visitSummaries));
  if (p.endsWith("/patient/bills")) return route.fulfill(json(data.bills));
  if (p.includes("/patient/telehealth/appointments")) return route.fulfill(json(data.telehealthAppointments));
  if (p.includes("/patient/telehealth/sessions")) {
    return route.fulfill(json({ sessionId: "sess-1", appointmentId: "tele-1", roomUrl: "https://meet.example.com/demo", status: "scheduled", providerName: "Dr. Marcus Webb" }));
  }
  if (p.endsWith("/patient/appointment-requests")) return route.fulfill(json({ id: "req-1", status: "pending" }));
  return route.fulfill(json([]));
}

const pause = (page, ms) => page.waitForTimeout(ms);

async function smoothScroll(page, totalPx, stepPx = 60, stepDelay = 40) {
  const steps = Math.round(Math.abs(totalPx) / stepPx);
  const dir = totalPx > 0 ? 1 : -1;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dir * stepPx);
    await page.waitForTimeout(stepDelay);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  await context.route("**www.navimedi.org/**", handleApi);
  await context.route("**/api/navimedi/**", handleApi);

  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));

  console.log("Loading app (first Metro bundle may take a while)...");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Sign In", { exact: true }).first().waitFor({ timeout: 300000 });
  console.log("Login screen ready");
  await pause(page, 3000);

  // --- Provider picker tour ---
  await page.getByText("EHR System", { exact: true }).click();
  await pause(page, 1800);
  const navimediCard = page.getByText("Navimedi EHR Platform", { exact: true });
  if (await navimediCard.count()) {
    await navimediCard.click();
  } else {
    await page.getByText("Navimedi", { exact: true }).first().click();
  }
  await pause(page, 1500);

  // --- Type credentials ---
  const emailInput = page.locator('input[placeholder="your@email.com"]');
  await emailInput.click();
  await emailInput.pressSequentially("sarah.mitchell@gmail.com", { delay: 55 });
  await pause(page, 500);
  const pwInput = page.locator('input[placeholder="••••••••"]');
  await pwInput.click();
  await pwInput.pressSequentially("MyHealth2026!", { delay: 65 });
  await pause(page, 800);

  // --- Sign in ---
  await page.getByText("Sign In", { exact: true }).last().click();
  console.log("Signing in...");
  await page.getByText("Sarah", { exact: false }).first().waitFor({ timeout: 60000 });
  console.log("Dashboard loaded");
  await pause(page, 3000);

  // --- Dashboard scroll ---
  await smoothScroll(page, 700);
  await pause(page, 1500);
  await smoothScroll(page, 900);
  await pause(page, 1500);
  await smoothScroll(page, -1700, 90, 25);
  await pause(page, 1500);

  const visit = async (tileText, waitText, scrollPx, dwell = 2600) => {
    const tile = page.getByText(tileText, { exact: false }).first();
    await tile.click();
    if (waitText) {
      await page.getByText(waitText, { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {});
    }
    await pause(page, dwell);
    if (scrollPx) {
      await smoothScroll(page, scrollPx);
      await pause(page, 1600);
    }
    await page.goBack();
    await pause(page, 1800);
  };

  // --- Feature tour from quick-action tiles ---
  console.log("Touring: Test Results");
  await visit("Test Results", "Lipid Panel", 500);

  console.log("Touring: Medications");
  await visit("Medications", "Lisinopril", 450);

  console.log("Touring: Messages");
  await visit("Messages", "lab results", 300);

  console.log("Touring: Visits");
  await visit("Visits", "Dr. Emily Chen", 400);

  console.log("Touring: Account Summary (bills)");
  await visit("Account", "Patient Responsibility", 400);

  console.log("Touring: Telehealth");
  await visit("Telehealth", "Dr. Marcus Webb", 0);

  // --- Symptom checker (local feature) ---
  console.log("Touring: Symptom Checker");
  await smoothScroll(page, 600);
  await pause(page, 800);
  const sympTile = page.getByText("Symptom Checker", { exact: false }).first();
  if (await sympTile.count()) {
    await sympTile.click();
    await pause(page, 3000);
    await smoothScroll(page, 400);
    await pause(page, 1200);
    await page.goBack();
    await pause(page, 1500);
  }
  await smoothScroll(page, -800, 90, 25);
  await pause(page, 1000);

  // --- Tabs: Reminders + Profile ---
  console.log("Touring: Reminders tab");
  await page.getByText("Reminders", { exact: true }).last().click();
  await pause(page, 2800);

  console.log("Touring: Profile tab");
  await page.getByText("Profile", { exact: true }).last().click();
  await page.getByText("Mitchell", { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {});
  await pause(page, 2500);
  await smoothScroll(page, 600);
  await pause(page, 1800);
  await smoothScroll(page, -700, 90, 25);

  // --- Back home, end on dashboard ---
  await page.getByText("Home", { exact: true }).last().click();
  await pause(page, 3000);

  console.log("Tour complete, finalizing video...");
  await context.close();
  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
