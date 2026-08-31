/**
 * End-to-end check for the Power Sweep overlay, against real hardware.
 *
 * Clicks TEST, watches the curve grow point-by-point, then exercises every
 * export button and validates the bytes that actually land on disk.
 *
 * Usage: node scripts/verify-sweep.mjs   (dev server on :3000, ESP32 powered)
 */
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.APP_URL ?? "http://localhost:3000/";
const EXPECTED_POINTS = 18;

let failed = false;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  failed = true;
};
const ok = (m) => console.log(`  ok  ${m}`);

const downloadDir = mkdtempSync(join(tmpdir(), "sweep-dl-"));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1000, height: 1200 },
  acceptDownloads: true,
});
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.getByText("Connected", { exact: true }).waitFor({ timeout: 30000 });
console.log("connected");

// --- Trigger the sweep ----------------------------------------------------
await page.getByRole("button", { name: "Send test command" }).click();
const dialog = page.getByRole("dialog", { name: "Power sweep" });
await dialog.waitFor({ timeout: 5000 });
ok("overlay opened on TEST");

await dialog.getByText("Sweeping…").waitFor({ timeout: 10000 });
ok('status shows "Sweeping…"');

// --- Watch the curve grow incrementally -----------------------------------
const counter = dialog.locator("p", { hasText: "of 18 points" });
const observed = [];
const deadline = Date.now() + 60000;
let complete = false;
while (Date.now() < deadline) {
  const txt = await counter.innerText().catch(() => "");
  const n = Number(txt.match(/(\d+) of 18/)?.[1] ?? -1);
  if (n >= 0 && observed[observed.length - 1] !== n) observed.push(n);
  if (await dialog.getByText("Complete").isVisible().catch(() => false)) {
    complete = true;
    break;
  }
  await page.waitForTimeout(300);
}

if (!complete) fail("sweep never reported Complete within 60s");
else ok("status reached Complete");

console.log(`  point counts seen: ${observed.join(" → ")}`);
if (observed.length >= 5) {
  ok(`curve grew incrementally (${observed.length} distinct counts observed)`);
} else {
  fail(
    `expected to see the curve grow step-by-step, only saw ${observed.length} distinct counts`,
  );
}
const finalCount = observed[observed.length - 1];
if (finalCount === EXPECTED_POINTS) ok(`received all ${EXPECTED_POINTS} points`);
else fail(`final point count was ${finalCount}, expected ${EXPECTED_POINTS}`);

// --- Tooltip shows all four values ----------------------------------------
const canvas = dialog.locator("canvas").first();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
await page.waitForTimeout(600);
await page.screenshot({ path: "scripts/sweep-tooltip.png" });
// Chart.js draws the tooltip into the canvas, so assert on the chart model.
const tip = await page.evaluate(() => {
  const cs = window.__sweepCharts;
  if (!cs) return null;
  for (const c of cs) {
    const t = c.tooltip;
    if (t && t.opacity > 0 && t.title?.length) {
      return { title: t.title.join(" "), body: t.body.map((b) => b.lines.join(" | ")).join(" ") };
    }
  }
  return null;
});
if (tip) {
  console.log(`  tooltip: ${tip.title} :: ${tip.body}`);
  const hasAll =
    /Duty/.test(tip.title) &&
    /Voltage/.test(tip.body) &&
    /Current/.test(tip.body) &&
    /Power/.test(tip.body);
  hasAll
    ? ok("tooltip shows duty %, voltage, current, power")
    : fail(`tooltip missing fields: ${tip.title} ${tip.body}`);
} else {
  fail("no tooltip became visible on hover");
}
await page.mouse.move(0, 0);

// --- Exports --------------------------------------------------------------
async function download(name) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    dialog.getByRole("button", { name }).click(),
  ]);
  const path = join(downloadDir, dl.suggestedFilename());
  await dl.saveAs(path);
  return path;
}

const csvPath = await download("Export CSV");
const csv = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const csvLines = csv.trim().split(/\r?\n/);
if (csvLines.length === EXPECTED_POINTS + 1) {
  ok(`CSV has header + ${EXPECTED_POINTS} rows`);
} else {
  fail(`CSV had ${csvLines.length} lines, expected ${EXPECTED_POINTS + 1}`);
}
if (/Duty \(%\)/.test(csvLines[0]) && /Power \(mW\)/.test(csvLines[0])) {
  ok("CSV header names the columns");
} else {
  fail(`unexpected CSV header: ${csvLines[0]}`);
}
console.log(`  csv row 2: ${csvLines[1]}`);

// Hover first: the export must not bake a leftover tooltip into the image.
const preBox = await canvas.boundingBox();
await page.mouse.move(preBox.x + preBox.width * 0.5, preBox.y + preBox.height * 0.5);
await page.waitForTimeout(400);

const pngPath = await download("Save Chart");
const pngBuf = readFileSync(pngPath);
const isPng = pngBuf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
isPng
  ? ok(`PNG is a real PNG (${Math.round(pngBuf.length / 1024)} KB)`)
  : fail("chart PNG has a bad magic number");

// The panel headings are HTML on screen and must be redrawn into the export,
// otherwise the image identifies each series by colour alone.
const exported = await page.evaluate(async () => {
  const cs = window.__sweepCharts ?? [];
  const first = cs[0]?.canvas;
  if (!first) return null;
  return { w: first.width, h: first.height };
});
const dims = await page.evaluate(
  ([b64]) =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.width, h: img.height });
      img.src = b64;
    }),
  [`data:image/png;base64,${pngBuf.toString("base64")}`],
);
if (exported && dims.h > exported.h * 3) {
  ok(`PNG includes headings + all 3 panels (${dims.w}×${dims.h})`);
} else {
  fail(`PNG looks too short for 3 labelled panels: ${JSON.stringify(dims)}`);
}

// The tooltip is a dark rounded box; on a white chart card any large cluster
// of near-black pixels means one got baked into the export.
const darkFraction = await page.evaluate(
  ([b64]) =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        const { data } = x.getImageData(0, 0, c.width, c.height);
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 70 && data[i + 1] < 70 && data[i + 2] < 70) dark++;
        }
        res(dark / (data.length / 4));
      };
      img.src = b64;
    }),
  [`data:image/png;base64,${pngBuf.toString("base64")}`],
);
// Title text alone is well under 1%; a tooltip block pushes it far past that.
if (darkFraction < 0.012) {
  ok(`no tooltip baked into export (${(darkFraction * 100).toFixed(2)}% dark)`);
} else {
  fail(
    `export looks like it contains a tooltip: ${(darkFraction * 100).toFixed(2)}% dark pixels`,
  );
}

const xlsxPath = await download("Export Excel");
const xlsxBuf = readFileSync(xlsxPath);
const isZip = xlsxBuf.subarray(0, 2).toString() === "PK";
isZip
  ? ok(`XLSX is a valid zip container (${Math.round(statSync(xlsxPath).size / 1024)} KB)`)
  : fail("xlsx is not a zip container");
// An embedded chart image means the zip carries a media entry.
const asText = xlsxBuf.toString("latin1");
/xl\/media\/image/.test(asText)
  ? ok("XLSX embeds the chart image (xl/media/image*)")
  : fail("XLSX contains no embedded image");
/xl\/worksheets\/sheet1\.xml/.test(asText)
  ? ok("XLSX contains the data worksheet")
  : fail("XLSX has no worksheet");

// --- Done closes the overlay ----------------------------------------------
await page.screenshot({ path: "scripts/sweep-complete.png" });
await dialog.getByRole("button", { name: "Done" }).click();
await dialog.waitFor({ state: "detached", timeout: 5000 });
ok("Done closed the overlay");

await page.getByText("DC Energy Monitor").first().waitFor({ timeout: 5000 });
ok("returned to the dashboard");

if (errors.length) fail(`console errors: ${errors.join(" | ")}`);

console.log(`\nartifacts in ${downloadDir}`);
console.log(failed ? "\nRESULT: FAIL" : "\nRESULT: PASS");
process.exitCode = failed ? 1 : 0;
await browser.close();
