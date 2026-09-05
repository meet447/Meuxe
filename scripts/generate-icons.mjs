#!/usr/bin/env node
/**
 * Renders Meuxe app icons from source/icon.svg via Playwright, then runs `tauri icon`.
 * Run from repo root: node scripts/generate-icons.mjs  (or npm run icons)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tmpDir = "/tmp/meuxe-icons";
const iconsDir = path.join(root, "src-tauri/icons");
const trayDir = path.join(iconsDir, "tray");
const sourceSvgPath = path.join(iconsDir, "source/icon.svg");
// Prefer an explicit CHROME_PATH, then a system Chrome if present; otherwise
// fall back to Playwright's bundled Chromium (`npx playwright install chromium`).
const chromePath =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

const ROUNDED_RADIUS_RATIO = 230 / 1024;
const MACOS_GRID = { size: 824, radius: 185, margin: 100 };

const BODY_PATH =
  "M32 7C44 6 56 14 56 27c0 13-6 26-22 29C18 59 7 47 8 33 9 19 20 8 32 7Z";

/** @type {string[]} */
const written = [];

function track(filePath) {
  written.push(filePath);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      stdio: options.stdio ?? "inherit",
      env: { ...process.env, ...options.env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function roundedRadius(size) {
  return (size * ROUNDED_RADIUS_RATIO).toFixed(3).replace(/\.?0+$/, "");
}

function trayTemplateHtml(size, id) {
  const scale = (size * 0.9) / 52;
  const cx = size / 2;
  const cy = size / 2;
  return `<!DOCTYPE html>
<html><head><style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body>
<svg id="${id}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <mask id="m-${id}">
      <rect width="${size}" height="${size}" fill="black"/>
      <g transform="translate(${cx} ${cy}) scale(${scale}) translate(-32 -31.5)">
        <path d="${BODY_PATH}" fill="white"/>
        <ellipse cx="23" cy="31.5" rx="3.6" ry="4.6" fill="black"/>
        <ellipse cx="41" cy="31.5" rx="3.6" ry="4.6" fill="black"/>
        <path d="M27.5 42.5Q32 46.2 36.5 42.5" stroke="black" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      </g>
    </mask>
  </defs>
  <rect width="${size}" height="${size}" fill="black" mask="url(#m-${id})"/>
</svg>
</body></html>`;
}

function roundedHtml(svgContent, size, id) {
  const radius = roundedRadius(size);
  const svg = svgContent
    .replace(/\bwidth="1024"/, `width="${size}"`)
    .replace(/\bheight="1024"/, `height="${size}"`);
  return `<!DOCTYPE html>
<html><head><style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body>
  <div id="${id}" style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden">
    ${svg}
  </div>
</body></html>`;
}

function macosHtml(svgContent, id) {
  const { size, radius, margin } = MACOS_GRID;
  const canvas = 1024;
  const svg = svgContent
    .replace(/\bwidth="1024"/, `width="${size}"`)
    .replace(/\bheight="1024"/, `height="${size}"`);
  return `<!DOCTYPE html>
<html><head><style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body>
  <div id="${id}" style="width:${canvas}px;height:${canvas}px">
    <div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;margin:${margin}px">
      ${svg}
    </div>
  </div>
</body></html>`;
}

async function screenshotHtml(cdp, page, html, selector, outputPath, viewport) {
  await page.goto("about:blank");
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    content: `${selector}{position:fixed;top:0;left:0;margin:0;padding:0}`,
  });
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`Could not measure ${selector} for ${outputPath}`);
  }
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      scale: 1,
    },
    // Headless Chrome's real window can be shorter than the emulated viewport;
    // without this the bottom rows are never painted and the tile is cut off.
    captureBeyondViewport: true,
  });
  const png = Buffer.from(data, "base64");
  assertPngSize(png, viewport, outputPath);
  fs.writeFileSync(outputPath, png);
  track(outputPath);
}

/** PNG IHDR sanity check: the capture must be exactly the requested size. */
function assertPngSize(png, viewport, outputPath) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== viewport.width || height !== viewport.height) {
    throw new Error(
      `${path.basename(outputPath)}: rendered ${width}x${height}, expected ${viewport.width}x${viewport.height}`,
    );
  }
  // The last row must contain painted pixels for full-bleed renders (rounded tiles);
  // the macOS variant has a transparent margin, so only check tiles without one.
  if (!outputPath.includes("macos") && !outputPath.includes("Template")) {
    const midBottomOpaque = pngHasOpaqueBottomRow(png);
    if (!midBottomOpaque) {
      throw new Error(`${path.basename(outputPath)}: bottom edge is transparent, capture was cut off`);
    }
  }
}

/**
 * Decodes just enough of the PNG to test whether the bottom-centre pixel is
 * opaque. Uses zlib inflate on the IDAT stream (8-bit RGBA, non-interlaced,
 * which is what Chrome emits).
 */
function pngHasOpaqueBottomRow(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4 + 1;
  // Unfilter only the rows we need would require the previous row for some
  // filter types, so unfilter the whole image (cheap at these sizes).
  const out = Buffer.alloc(width * 4 * height);
  let prev = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const row = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    for (let i = 0; i < row.length; i++) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 0xff;
    }
    row.copy(out, y * width * 4);
    prev = row;
  }
  const x = Math.floor(width / 2);
  const alpha = out[((height - 1) * width + x) * 4 + 3];
  return alpha > 0;
}

async function renderIcons(page, svgContent) {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(trayDir, { recursive: true });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });

  const rounded1024 = path.join(tmpDir, "icon-rounded-1024.png");
  await screenshotHtml(
    cdp,
    page,
    roundedHtml(svgContent, 1024, "rounded-1024"),
    "#rounded-1024",
    rounded1024,
    { width: 1024, height: 1024 },
  );

  const macos1024 = path.join(tmpDir, "icon-macos-1024.png");
  await screenshotHtml(
    cdp,
    page,
    macosHtml(svgContent, "macos-1024"),
    "#macos-1024",
    macos1024,
    { width: 1024, height: 1024 },
  );

  await screenshotHtml(
    cdp,
    page,
    trayTemplateHtml(22, "tray-22"),
    "#tray-22",
    path.join(trayDir, "trayTemplate.png"),
    { width: 22, height: 22 },
  );

  await screenshotHtml(
    cdp,
    page,
    trayTemplateHtml(44, "tray-44"),
    "#tray-44",
    path.join(trayDir, "trayTemplate@2x.png"),
    { width: 44, height: 44 },
  );

  await screenshotHtml(
    cdp,
    page,
    roundedHtml(svgContent, 32, "tray-colour-32"),
    "#tray-colour-32",
    path.join(trayDir, "tray.png"),
    { width: 32, height: 32 },
  );

  await screenshotHtml(
    cdp,
    page,
    roundedHtml(svgContent, 64, "tray-colour-64"),
    "#tray-colour-64",
    path.join(trayDir, "tray@2x.png"),
    { width: 64, height: 64 },
  );

  await cdp.detach();

  return { rounded1024, macos1024 };
}

function deleteMobileIconDirs() {
  for (const name of ["android", "ios"]) {
    const dir = path.join(iconsDir, name);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

function trackTauriOutputs() {
  const candidates = [
    "32x32.png",
    "128x128.png",
    "128x128@2x.png",
    "icon.ico",
    "icon.png",
    "Square30x30Logo.png",
    "Square44x44Logo.png",
    "Square71x71Logo.png",
    "Square89x89Logo.png",
    "Square107x107Logo.png",
    "Square142x142Logo.png",
    "Square150x150Logo.png",
    "Square284x284Logo.png",
    "Square310x310Logo.png",
    "StoreLogo.png",
  ];
  for (const name of candidates) {
    const filePath = path.join(iconsDir, name);
    if (fs.existsSync(filePath)) {
      track(filePath);
    }
  }
}

async function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Missing source artwork: ${sourceSvgPath}`);
  }

  const svgContent = fs.readFileSync(sourceSvgPath, "utf8");

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ["--disable-remote-fonts", "--window-size=1200,1200"],
  });

  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();

    const { rounded1024, macos1024 } = await renderIcons(page, svgContent);

    await run("npx", ["tauri", "icon", rounded1024, "-o", "src-tauri/icons"]);
    trackTauriOutputs();

    const macosOut = path.join(tmpDir, "macos");
    await run("npx", ["tauri", "icon", macos1024, "-o", macosOut]);

    const macosIcns = path.join(macosOut, "icon.icns");
    const targetIcns = path.join(iconsDir, "icon.icns");
    fs.copyFileSync(macosIcns, targetIcns);
    track(targetIcns);

    deleteMobileIconDirs();
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("Generated icon files:");
  for (const filePath of written.sort()) {
    if (filePath.startsWith(tmpDir) || !fs.existsSync(filePath)) {
      continue;
    }
    const stat = fs.statSync(filePath);
    console.log(`  ${path.relative(root, filePath)} (${stat.size} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
