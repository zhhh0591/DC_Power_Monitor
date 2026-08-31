/**
 * End-to-end check for the ON / OFF / RESET control buttons.
 *
 * Drives a real Chromium against the dev server while a separate MQTT client
 * subscribes to dc_monitor/cmd, so we verify what the page actually puts on
 * the wire — not just that the click handler ran.
 *
 * Usage: node scripts/verify-controls.mjs   (dev server must be on :3000)
 */
import { chromium } from "playwright";
import mqtt from "mqtt";

const URL = process.env.APP_URL ?? "http://localhost:3000/";
const BROKER = "wss://broker.emqx.io:8084/mqtt";
const CMD_TOPIC = "dc_monitor/cmd";
const COMMANDS = ["on", "off", "reset"];

const received = [];
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

// --- MQTT spy -------------------------------------------------------------
const spy = mqtt.connect(BROKER, {
  clientId: `verify_spy_${Math.random().toString(16).slice(2, 10)}`,
  connectTimeout: 10000,
});
spy.on("message", (topic, payload) => {
  if (topic === CMD_TOPIC) received.push(payload.toString());
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("spy connect timeout")), 15000);
  spy.on("error", reject);
  spy.on("connect", () => {
    spy.subscribe(CMD_TOPIC, { qos: 0 }, (err) => {
      clearTimeout(t);
      err ? reject(err) : resolve();
    });
  });
});
console.log(`spy subscribed to ${CMD_TOPIC}`);

// --- Browser --------------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

// Count every WebSocket the page opens. Resource-timing doesn't report
// websockets, so wrap the constructor before any app code runs.
await page.addInitScript(() => {
  window.__wsUrls = [];
  const Native = window.WebSocket;
  window.WebSocket = new Proxy(Native, {
    construct(target, args) {
      window.__wsUrls.push(String(args[0]));
      return new target(...args);
    },
  });
});

await page.goto(URL, { waitUntil: "domcontentloaded" });

// Buttons stay disabled until the page's own client reaches "connected".
await page.getByText("Connected", { exact: true }).waitFor({ timeout: 30000 });
console.log("page reports: Connected");

const labelOf = (cmd) => `Send ${cmd} command`;

/** Wait until the button for `cmd` shows exactly `want` as its label. */
const waitForLabel = (cmd, want) =>
  page.waitForFunction(
    ([label, expected]) =>
      [...document.querySelectorAll("button")].some(
        (b) =>
          b.getAttribute("aria-label") === label &&
          b.innerText.trim() === expected,
      ),
    [labelOf(cmd), want],
    { timeout: 6000 },
  );

for (const cmd of COMMANDS) {
  const before = received.length;
  const btn = page.getByRole("button", { name: labelOf(cmd) });

  if (await btn.isDisabled()) fail(`${cmd} button is disabled while connected`);

  await btn.click();

  // 1. visual feedback flipped to "Sent"
  try {
    await waitForLabel(cmd, "Sent");
    console.log(`${cmd}: button showed "Sent"`);
  } catch {
    fail(`${cmd}: button never showed "Sent" (text=${await btn.innerText()})`);
  }

  // 2. screenshot the feedback state on the first command
  if (cmd === "on") {
    await page.screenshot({ path: "scripts/controls-sent.png" });
  }

  // 3. the payload actually reached the broker
  const deadline = Date.now() + 6000;
  while (received.length === before && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }
  const got = received[before];
  if (got === cmd) console.log(`${cmd}: broker received "${got}"`);
  else fail(`${cmd}: broker received ${JSON.stringify(got)}, expected "${cmd}"`);

  // Let the 1.1s feedback window lapse before the next click.
  await page
    .waitForFunction(
      (label) =>
        [...document.querySelectorAll("button")].some(
          (b) =>
            b.getAttribute("aria-label") === label &&
            b.innerText.trim() !== "Sent",
        ),
      labelOf(cmd),
      { timeout: 4000 },
    )
    .catch(() => fail(`${cmd}: feedback never reset`));
}

await page.screenshot({ path: "scripts/controls-idle.png", fullPage: true });

// --- Connection reuse: exactly one websocket to the broker ----------------
const brokerSockets = await page.evaluate(() =>
  (window.__wsUrls ?? []).filter((u) => u.includes("broker.emqx.io")),
);
console.log(
  `broker websockets opened: ${brokerSockets.length}`,
  brokerSockets,
);
if (brokerSockets.length !== 1) {
  fail(
    `expected exactly 1 broker websocket (commands must reuse the data client), got ${brokerSockets.length}`,
  );
}

if (consoleErrors.length) fail(`console errors: ${consoleErrors.join(" | ")}`);

console.log(`\nall received on ${CMD_TOPIC}: ${JSON.stringify(received)}`);
console.log(process.exitCode ? "\nRESULT: FAIL" : "\nRESULT: PASS");

await browser.close();
spy.end(true);
