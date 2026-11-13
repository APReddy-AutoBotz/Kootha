// Browser check of the built website and admin page against a LOCAL stack.
//
// Opens the public pages and signs in to the admin page in a real browser,
// visits every admin section, and creates an Ad Work from an enquiry. It fails
// on a page crash, a JavaScript error, an API call the page makes that the
// database refuses, or an error message shown on screen. Screenshots are
// written for review.
//
// It is not a phone test and does not cover every button. It proves the pages
// load and talk to the database with the queries they actually send.
//
// The script refuses to run against anything but local addresses.

import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const siteUrl = (process.env.BROWSER_E2E_SITE_URL ?? "").replace(/\/$/, "");
const apiUrl = (process.env.BROWSER_E2E_API_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.BROWSER_E2E_ANON_KEY ?? "";
const serviceKey = process.env.BROWSER_E2E_SERVICE_ROLE_KEY ?? "";
const outDir = process.env.BROWSER_E2E_OUT ?? "output/browser-e2e";

if (!siteUrl || !apiUrl || !anonKey || !serviceKey) {
  console.error("BROWSER_E2E_SITE_URL, BROWSER_E2E_API_URL, BROWSER_E2E_ANON_KEY and BROWSER_E2E_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

for (const url of [siteUrl, apiUrl]) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
    console.error("Refusing to run: this check creates a fake admin login and only runs against local addresses.");
    process.exit(2);
  }
}

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BROWSER_E2E_PLAYWRIGHT ?? "playwright-core");

mkdirSync(outDir, { recursive: true });

const runId = Date.now().toString(36) + randomBytes(3).toString("hex");
const businessName = "Fake Browser Stores " + runId;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const problems = [];
const passed = [];

function problem(where, what) {
  problems.push({ where, what });
  console.log("FAIL " + where + ": " + String(what).slice(0, 500));
}

function ok(what) {
  passed.push(what);
  console.log("ok   " + what);
}

async function api(method, pathname, body, token, extraHeaders = {}) {
  const response = await fetch(apiUrl + pathname, {
    method,
    headers: {
      apikey: token ? anonKey : serviceKey,
      Authorization: "Bearer " + (token ?? serviceKey),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(method + " " + pathname + " failed with HTTP " + response.status + ": " + text.slice(0, 400));
  }
  return text ? JSON.parse(text) : null;
}

async function seed() {
  const email = "fake-browser-admin-" + runId + "@example.test";
  const password = randomBytes(18).toString("base64url");
  const user = await api("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });
  await api("POST", "/rest/v1/user_profiles", { auth_user_id: user.id, display_name: "Fake Browser Admin", role: "admin" }, undefined, { Prefer: "return=minimal" });
  await api("POST", "/rest/v1/enquiries", {
    customer_name: "Fake Browser Customer",
    business_name: businessName,
    phone: "9000044444",
    city: "Ongole",
    required_areas: "Fake Main Road",
    preferred_start_date: today,
    number_of_days: 1,
    source: "website",
    status: "new",
    message: "Fake browser check announcement",
    package_interest: "standard",
    live_tracking_needed: "no",
    notes: null,
    consent_to_contact: true,
    locale: "en",
    consent_notice_version: "2026-07-12",
  }, undefined, { Prefer: "return=minimal" });
  return { email, password };
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "page";
}

// Everything the page reports while one screen is open.
function watch(page) {
  const seen = { errors: [], refused: [] };
  page.on("pageerror", (error) => seen.errors.push("JavaScript error: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
      seen.errors.push("Console error: " + message.text());
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.startsWith(apiUrl) && response.status() >= 400) {
      const parsed = new URL(url);
      seen.refused.push(response.request().method() + " " + parsed.pathname + " -> HTTP " + response.status() + " (" + parsed.search.slice(0, 160) + ")");
    }
    if (url.startsWith(siteUrl) && response.status() >= 400) {
      seen.refused.push("Site file " + new URL(url).pathname + " -> HTTP " + response.status());
    }
  });
  return {
    take() {
      const snapshot = { errors: [...seen.errors], refused: [...seen.refused] };
      seen.errors.length = 0;
      seen.refused.length = 0;
      return snapshot;
    },
  };
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function report(page, watcher, where, { allowAlerts = false } = {}) {
  const seen = watcher.take();
  for (const error of seen.errors) problem(where, error);
  for (const refused of seen.refused) problem(where, "Refused request: " + refused);
  if (await page.locator(".app-error-boundary").count() > 0) {
    problem(where, "The screen crashed and showed \"Something went wrong\".");
  }
  if (!allowAlerts) {
    const alerts = await page.locator('[role="alert"]:visible').allInnerTexts();
    for (const alert of alerts.filter((text) => text.trim())) problem(where, "Error shown on screen: " + alert.trim());
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 2) {
    problem(where, "Page is " + overflow + "px wider than the screen and scrolls sideways.");
  }
  await page.screenshot({ path: path.join(outDir, slug(where) + ".png"), fullPage: true });
  return seen.errors.length + seen.refused.length;
}

async function publicPages(context, label) {
  const page = await context.newPage();
  const watcher = watch(page);
  for (const [route, expectation] of [
    ["/", "home page"],
    ["/privacy", "privacy page"],
    ["/terms", "terms page"],
    ["/driver-consent", "driver consent page"],
    ["/data-request", "data request page"],
    ["/no-such-page-" + runId, "not-found page"],
  ]) {
    const where = label + " " + expectation;
    await page.goto(siteUrl + route, { waitUntil: "domcontentloaded" });
    await settle(page);
    const heading = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    if (!heading) {
      problem(where, "No main heading was shown.");
    }
    const before = problems.length;
    await report(page, watcher, where);
    if (problems.length === before && heading) ok(where + ": \"" + heading.slice(0, 60) + "\"");
  }
  if (label === "Desktop") {
    await page.goto(siteUrl + "/", { waitUntil: "domcontentloaded" });
    await settle(page);
    const formCount = await page.locator("form").count();
    if (formCount === 0) problem("Desktop home page", "The enquiry form is missing.");
    else ok("Desktop home page has the enquiry form");
    watcher.take();
  }
  await page.close();
}

async function adminPages(context, credentials, label, { act }) {
  const page = await context.newPage();
  const watcher = watch(page);
  const where = label + " admin";

  await page.goto(siteUrl + "/admin", { waitUntil: "domcontentloaded" });
  await settle(page);
  if (await page.locator(".admin-nav-list button").count() === 0) {
    await page.locator('input[type="email"]').fill(credentials.email);
    await page.locator('input[type="password"]').fill(credentials.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.locator(".admin-nav-list button").first().waitFor({ timeout: 20000 }).catch(() => {});
  }
  await settle(page);
  const navCount = await page.locator(".admin-nav-list button").count();
  if (navCount === 0) {
    const shown = (await page.locator("body").innerText()).slice(0, 300);
    problem(where + " login", "Signing in did not open the admin page. Screen shows: " + shown);
    await report(page, watcher, where + " login", { allowAlerts: true });
    await page.close();
    return;
  }
  ok(where + " login opens " + navCount + " sections");

  for (let index = 0; index < navCount; index += 1) {
    const button = page.locator(".admin-nav-list button").nth(index);
    const name = (await button.innerText()).trim();
    const section = where + " section " + name;
    if (!(await button.isVisible())) {
      continue;
    }
    await button.click();
    await settle(page);
    const before = problems.length;
    await report(page, watcher, section);
    if (problems.length === before) ok(section);
  }

  if (act) {
    const section = where + " create Ad Work from enquiry";
    await page.locator(".admin-nav-list button", { hasText: "Enquiries" }).first().click();
    await settle(page);
    const row = page.getByText(businessName, { exact: false }).first();
    if (await row.count() === 0) {
      problem(section, "The seeded enquiry is not listed.");
    } else {
      await row.click();
      await settle(page);
      const create = page.getByRole("button", { name: "Create Ad Work" }).first();
      if (await create.count() === 0) {
        problem(section, "The Create Ad Work button is not shown for the selected enquiry.");
      } else {
        await create.click();
        await settle(page);
        const before = problems.length;
        await report(page, watcher, section);
        const works = await api("GET", "/rest/v1/ad_works?select=id,business_name&business_name=eq." + encodeURIComponent(businessName));
        if (works.length !== 1) {
          problem(section, "Expected one Ad Work for the enquiry, found " + works.length + ".");
        } else if (problems.length === before) {
          ok(section);
        }
      }
    }

    const logout = page.getByRole("button", { name: "Log out" }).first();
    if (await logout.count() > 0 && await logout.isVisible()) {
      await logout.click();
      await settle(page);
      if (await page.locator('input[type="password"]').count() === 0) {
        problem(where + " log out", "Logging out did not return to the login form.");
      } else {
        ok(where + " log out returns to the login form");
      }
      await report(page, watcher, where + " after log out", { allowAlerts: true });
    }
  }
  await page.close();
}

function writeSummary() {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const lines = ["## Browser check", "", passed.length + " screens passed, " + problems.length + " problems.", ""];
  for (const item of problems) lines.push("- FAILED " + item.where + ": " + String(item.what).slice(0, 300).replace(/\n/g, " "));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

const credentials = await seed();
const browser = await chromium.launch({ channel: process.env.BROWSER_E2E_CHANNEL ?? "chrome", headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await publicPages(desktop, "Desktop");
  await adminPages(desktop, credentials, "Desktop", { act: true });
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await publicPages(phone, "Phone-width");
  await adminPages(phone, credentials, "Phone-width", { act: false });
  await phone.close();
} finally {
  await browser.close();
}

writeSummary();
if (problems.length > 0) {
  console.error("\nBrowser check found " + problems.length + " problem(s).");
  process.exit(1);
}
console.log("\nBrowser check passed: " + passed.length + " screens.");
