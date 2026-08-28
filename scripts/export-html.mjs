import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(rootDir, ".standalone-html");
const outputFile = path.join(rootDir, "abc-desk.standalone.html");

await fs.rm(tempDir, { recursive: true, force: true });

await build({
  configFile: path.join(rootDir, "vite.config.js"),
  root: rootDir,
  base: "./",
  build: {
    outDir: tempDir,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

const htmlPath = path.join(tempDir, "index.html");
let html = await fs.readFile(htmlPath, "utf8");
const faviconSvg = await fs.readFile(path.join(rootDir, "public", "favicon.svg"), "utf8");
const faviconDataUri = `data:image/svg+xml;base64,${Buffer.from(faviconSvg, "utf8").toString("base64")}`;

html = html.replace(
  /<link[^>]+rel="icon"[^>]+href="[^"]+"[^>]*>/,
  `<link rel="icon" type="image/svg+xml" href="${faviconDataUri}">`,
);

html = html.replace(
  /<link[^>]+rel="preconnect"[^>]+fonts\.googleapis\.com[^>]*>\s*/g,
  "",
);
html = html.replace(
  /<link[^>]+rel="preconnect"[^>]+fonts\.gstatic\.com[^>]*>\s*/g,
  "",
);
html = html.replace(
  /<link[^>]+href="https:\/\/fonts\.googleapis\.com[^"]+"[^>]*>\s*/g,
  "",
);
html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>\s*/g, "");

const cssMatches = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)];
for (const match of cssMatches) {
  const cssPath = path.join(tempDir, match[1]);
  const css = await fs.readFile(cssPath, "utf8");
  html = html.replace(match[0], `<style>\n${css}\n</style>`);
}

const jsMatches = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g)];
if (jsMatches.length !== 1) {
  throw new Error(`Expected exactly one module script, found ${jsMatches.length}.`);
}

const jsSourcePath = path.join(tempDir, jsMatches[0][1]);
const jsBundle = await fs.readFile(jsSourcePath, "utf8");
const jsDataUri = `data:text/javascript;charset=utf-8,${encodeURIComponent(jsBundle)}`;
html = html.replace(jsMatches[0][0], `<script type="module" src="${jsDataUri}"></script>`);

html = html.replaceAll(/<link[^>]+rel="stylesheet"[^>]+href="[^"]+"\s*\/?>/g, "");

await fs.writeFile(outputFile, html, "utf8");
await fs.rm(tempDir, { recursive: true, force: true });

console.log(`Wrote ${path.basename(outputFile)} (fully self-contained)`);
