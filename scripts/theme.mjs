// Shared design tokens and SVG helpers for every image in the profile README.
//
// Theme: "Deccan jaali". The accent is the turquoise of the glazed tiles on
// Hyderabad's Qutb Shahi tombs, brass is used sparingly for "now" markers,
// and the hero lattice borrows the 8-point star of Deccani jaali screens.
// Every image is drawn on a transparent background so it sits on GitHub's
// own page colour, and each one is rendered once per theme.

import { readFileSync } from "node:fs";
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

// Fonts are subset to Latin and embedded as data URIs, because an SVG shown
// through <img> cannot load anything from the network.
// Anybody (wdth 135, wght 800) sets names and titles; IBM Plex Sans sets text.
export const FONTS = {
  display: { file: "anybody-display", family: "ZS Display", weight: 800 },
  text: { file: "plex-sans-400", family: "ZS Text", weight: 400 },
  textBold: { file: "plex-sans-600", family: "ZS Text", weight: 600 },
};

const METRICS = JSON.parse(readFileSync(`${FONT_DIR}metrics.json`, "utf8"));
const fontData = new Map();

const fontFace = (font) => {
  if (!fontData.has(font.file)) {
    fontData.set(font.file, readFileSync(`${FONT_DIR}${font.file}.woff2`).toString("base64"));
  }
  return `@font-face{font-family:"${font.family}";font-weight:${font.weight};`
    + `src:url(data:font/woff2;base64,${fontData.get(font.file)}) format("woff2")}`;
};

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

export const svgDocument = ({ width, height, label, fonts, css = "", body }) => {
  const faces = [...new Set(fonts)].map(fontFace).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${round(height)}" viewBox="0 0 ${width} ${round(height)}" role="img" aria-label="${escapeXml(label)}">
<title>${escapeXml(label)}</title>
<style>${faces}text{font-variant-numeric:tabular-nums;font-kerning:normal}${css}</style>
${body}
</svg>
`;
};
