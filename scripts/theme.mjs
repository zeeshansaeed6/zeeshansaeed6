// Shared design tokens and SVG helpers for every image in the profile README.
//
// Theme: "Deccan jaali". The accent is the turquoise of the glazed tiles on
// Hyderabad's Qutb Shahi tombs, brass is used sparingly for "now" markers,
// and the hero lattice borrows the 8-point star of Deccani jaali screens.
// Every image is drawn on a transparent background so it sits on GitHub's
// own page colour, and each one is rendered once per theme.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FONT_DIR = fileURLToPath(new URL("../assets/fonts/", import.meta.url));

export const THEMES = {
  dark: {
    text: "#e6edf3",
    muted: "#9198a1",
    line: "#30363d",
    accent: "#3fbfb0",
    brass: "#d6aa5c",
  },
  light: {
    text: "#1f2328",
    muted: "#59636e",
    line: "#d1d9e0",
    accent: "#0b7a70",
    brass: "#8a6414",
  },
};

// Fonts are embedded as data URIs, because an SVG shown through <img> cannot
// load anything from the network. Each image gets a copy cut down to just the
// characters it uses (via fonttools' pyftsubset), which keeps the images small.
// Without pyftsubset installed, the full Latin subset is embedded instead.
// Anybody (wdth 135, wght 800) sets names and titles; IBM Plex Sans sets text.
export const FONTS = {
  display: { file: "anybody-display", family: "ZS Display", weight: 800 },
  text: { file: "plex-sans-400", family: "ZS Text", weight: 400 },
  textBold: { file: "plex-sans-600", family: "ZS Text", weight: 600 },
};

const METRICS = JSON.parse(readFileSync(`${FONT_DIR}metrics.json`, "utf8"));
const subsets = new Map();
let canSubset = true;

const fontBase64 = (font, characters) => {
  const key = `${font.file}:${characters}`;
  if (subsets.has(key)) return subsets.get(key);
  const source = `${FONT_DIR}${font.file}.woff2`;
  let data = null;
  if (canSubset) {
    const dir = mkdtempSync(join(tmpdir(), "font-"));
    try {
      const output = join(dir, "subset.woff2");
      execFileSync("pyftsubset", [source, `--text=${characters}`, "--flavor=woff2",
        "--layout-features=kern,liga,tnum,lnum", `--output-file=${output}`], { stdio: "pipe" });
      data = readFileSync(output);
    } catch {
      canSubset = false;
      console.warn("pyftsubset not available; embedding full fonts.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const encoded = (data ?? readFileSync(source)).toString("base64");
  subsets.set(key, encoded);
  return encoded;
};

const unescapeXml = (value) =>
  value.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"' })[name]);

// Collects the characters each font draws in an SVG body built with text().
const charactersByFont = (body) => {
  const used = new Map();
  for (const [, family, weight, content] of body.matchAll(/<text[^>]*font-family='([^']*)'[^>]*font-weight="(\d+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const font = family.includes(FONTS.display.family) ? FONTS.display
      : weight === String(FONTS.textBold.weight) ? FONTS.textBold : FONTS.text;
    const chars = used.get(font) ?? new Set();
    for (const char of unescapeXml(content.replace(/<[^>]*>/g, ""))) chars.add(char);
    used.set(font, chars);
  }
  return used;
};

const fontFaces = (body) =>
  [...charactersByFont(body)]
    .map(([font, chars]) => {
      const characters = [...chars].sort().join("");
      return `@font-face{font-family:"${font.family}";font-weight:${font.weight};`
        + `src:url(data:font/woff2;base64,${fontBase64(font, characters)}) format("woff2")}`;
    })
    .join("");

export const measure = (text, font, size) => {
  const { upm, adv } = METRICS[font.file];
  const fallback = adv.n ?? upm / 2;
  let units = 0;
  for (const char of text) units += adv[char] ?? fallback;
  return (units / upm) * size;
};

export const wrap = (text, font, size, maxWidth) => {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, font, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};

export const escapeXml = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const STACKS = {
  display: `"ZS Display","Arial Black",sans-serif`,
  text: `"ZS Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif`,
};

// <text> helper. `font` is one of FONTS; colour is a theme key or a hex value.
export const text = ({ x, y, value, font, size, fill, anchor, extra = "" }) => {
  const family = font === FONTS.display ? STACKS.display : STACKS.text;
  const anchorAttr = anchor ? ` text-anchor="${anchor}"` : "";
  return `<text x="${round(x)}" y="${round(y)}"${anchorAttr} font-family='${family}' font-weight="${font.weight}" `
    + `font-size="${size}" fill="${fill}"${extra}>${escapeXml(value)}</text>`;
};

export const round = (value) => Math.round(value * 100) / 100;

export const svgDocument = ({ width, height, label, css = "", body }) => {
  const faces = fontFaces(body);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${round(height)}" viewBox="0 0 ${width} ${round(height)}" role="img" aria-label="${escapeXml(label)}">
<title>${escapeXml(label)}</title>
<style>${faces}text{font-variant-numeric:tabular-nums;font-kerning:normal}${css}</style>
${body}
</svg>
`;
};
