// Renders every static image in the README, in a dark and a light version:
//
//   node scripts/build-assets.mjs
//
// writes assets/dark/*.svg and assets/light/*.svg, then updates the version
// tags on the README image links. Edit the content below
// (projects, experience, stack) and re-run; text wraps automatically.
// Install fonttools first (pip install fonttools brotli) so each image embeds
// only the glyphs it uses; without it the images still build, just larger.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FONTS, THEMES, measure, round, svgDocument, text, wrap } from "./theme.mjs";

// ---------------------------------------------------------------- content --

const HERO = {
  name: "Zeeshan Saeed",
  role: "Software developer and GenAI engineer in Hyderabad, India",
  now: "Software Developer Intern at AccioJob, final-year BCA student",
  status: "Open to internships and entry-level roles",
};

const PROJECTS = [
  {
    file: "project-aegis",
    title: "Aegis Ultimate",
    kind: "Private search engine and Chromium browser",
    summary: "Zero-logging search that runs entirely in RAM, with in-memory BM25 ranking, an autonomous crawler and an LLM answer layer that cites its sources.",
    specs: [["Query time", "under 5 ms", true], ["Tests", "87 of 87 passing", true], ["Built with", "JavaScript, Node.js, Express"]],
    wide: true,
  },
  {
    file: "project-standup",
    title: "Standup Chief of Staff",
    kind: "Voice briefings for developers on Alexa+",
    summary: "Turns pull requests, failing CI and stale reviews into a 30-second spoken briefing, then acts on voice commands. Built for the Amazon Developer Hackathon.",
    specs: [["Tests", "33 passing", true], ["Built with", "TypeScript, MCP, Amazon Bedrock"]],
  },
  {
    file: "project-intentlock",
    title: "IntentLock",
    kind: "Purchase agent that can only spend what you approved",
    summary: "An AI agent proposes a purchase, deterministic code signs it as a contract, and a virtual card is issued for that purchase only. Built for the Airwallex hackathon.",
    specs: [["Tests", "60 passing", true], ["Built with", "TypeScript, Node.js, Airwallex"]],
  },
  {
    file: "project-fooddash",
    title: "FoodDash",
    kind: "Multi-app food delivery platform",
    summary: "Group ordering with split billing, plus a real-time engine that matches surplus restaurant food with nearby demand.",
    specs: [["Checkout", "about 40% faster", true], ["Built with", "MERN, React Native"]],
  },
  {
    file: "project-serpentai",
    title: "SerpentAI Ultra",
    kind: "Snake identification and venom safety",
    summary: "Identifies snakes from a photo or webcam with Gemini Vision, triages symptoms, finds nearby antivenom hospitals and prints a report.",
    specs: [["Languages", "3", true], ["Built with", "React, Node.js, MongoDB, Gemini"]],
  },
  {
    file: "project-braintumour",
    title: "Brain Tumour Detection",
    kind: "CNN classifier for MRI scans",
    summary: "Classifies MRI scans and explains each prediction with Grad-CAM heatmaps, served from a containerised FastAPI service.",
    specs: [["Accuracy", "94.2%", true], ["Inference", "under 120 ms", true], ["Built with", "Python, TensorFlow, FastAPI"]],
  },
  {
    file: "project-erp",
    title: "College ERP",
    kind: "Student and administration system",
    summary: "Digitises attendance, grading and records with strict role-based access control and event-driven SMS alerts.",
    specs: [["Access control", "4-tier RBAC", true], ["Lookups", "under 100 ms", true], ["Built with", "MERN, Twilio"]],
  },
];

const TIMELINE = [
  {
    dates: "May 2026 – now",
    current: true,
    title: "Software Developer Intern",
    place: "AccioJob",
    points: [
      "Built 14+ REST endpoints in Node.js and Express with JWT authentication and role-based access control.",
      "Cut average API latency by 32% by reworking MongoDB aggregation pipelines and indexes.",
      "Built modular React workflows with custom hooks and shared state, removing redundant re-renders.",
    ],
  },
  {
    dates: "Aug 2024 – Jun 2027",
    current: true,
    title: "BCA, Osmania University",
    place: "New Science Degree College, Hyderabad. CGPA 8.43 / 10",
    points: [
      "Coursework in data structures and algorithms, DBMS, operating systems, computer networks and software engineering.",
    ],
  },
];

const STACK = [
  ["Languages", ["JavaScript", "TypeScript", "Python", "C"]],
  ["Frontend", ["React", "React Native", "Tailwind CSS", "HTML", "CSS"]],
  ["Backend", ["Node.js", "Express", "FastAPI", "REST", "JWT", "Twilio"]],
  ["Data", ["MongoDB", "PostgreSQL", "Supabase"]],
  ["AI and ML", ["LLMs and RAG", "MCP", "Gemini API", "Amazon Bedrock", "TensorFlow", "OpenCV"]],
  ["Tooling", ["AWS", "Docker", "Git", "Postman", "Jest"]],
];

// ------------------------------------------------------------------- hero --

// An 8-point star (two overlapping squares) of circumradius r.
const octagram = (cx, cy, r) => {
  const s = r / Math.SQRT2;
  const square = (points) => `M${points.map(([x, y]) => `${round(cx + x)} ${round(cy + y)}`).join("L")}Z`;
  return square([[-s, -s], [s, -s], [s, s], [-s, s]]) + square([[0, -r], [r, 0], [0, r], [-r, 0]]);
};

const heroCss = (theme) => `
.s{fill:none;stroke:${theme.accent};stroke-width:1.25;stroke-opacity:.7;stroke-dasharray:1;animation:draw 1.4s cubic-bezier(.4,0,.2,1) both}
.b{fill:${theme.brass};animation:show .6s ease-out .1s both}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes show{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.s,.b{animation:none}}`;

// Stars on a grid of `cell`, each delayed by its distance from `origin`, so
// the lattice grows outward from the brass star.
const lattice = ({ origin, cell, top, bottom, left, right }) => {
  const stars = [];
  for (let cy = top; cy < bottom + cell; cy += cell) {
    for (let cx = right; cx > left; cx -= cell) {
      const distance = Math.hypot(cx - origin.x, cy - origin.y);
      stars.push(`<path pathLength="1" class="s" style="animation-delay:${round(0.3 + distance / 380)}s" d="${octagram(cx, cy, cell / 2)}"/>`);
    }
  }
  return stars.join("");
};

const fitSize = (value, font, maxSize, maxWidth) =>
  Math.min(maxSize, Math.floor((maxWidth / measure(value, font, 1)) * 10) / 10);

const NARROW = 490;

// Phone layout: the lattice sits in the top-right corner above the name.
const renderHeroNarrow = (theme) => {
  const width = NARROW;
  const cell = 48;
  const origin = { x: width - 8 - cell, y: 8 + cell };
  const nameSize = fitSize(HERO.name, FONTS.display, 46, width - 6);
  const parts = [];
  let y = 168;
  parts.push(text({ x: 0, y, value: HERO.name, font: FONTS.display, size: nameSize, fill: theme.text, extra: ' letter-spacing="-0.5"' }));
  y += 42;
  for (const line of wrap(HERO.role, FONTS.text, 21, width - 4)) {
    parts.push(text({ x: 1, y, value: line, font: FONTS.text, size: 21, fill: theme.text }));
    y += 29;
  }
  y += 4;
  for (const line of wrap(HERO.now, FONTS.text, 17, width - 4)) {
    parts.push(text({ x: 1, y, value: line, font: FONTS.text, size: 17, fill: theme.muted }));
    y += 25;
  }
  y += 10;
  parts.push(`<circle cx="7" cy="${y - 6}" r="5" fill="${theme.brass}"/>`);
  parts.push(text({ x: 21, y, value: HERO.status, font: FONTS.textBold, size: 17, fill: theme.text }));
  const height = y + 10;
  const body = `<defs>
<linearGradient id="fade" x1="140" x2="330" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
<radialGradient id="glow" cx="${origin.x}" cy="${origin.y}" r="190" gradientUnits="userSpaceOnUse"><stop offset=".3" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect x="0" y="0" width="${width}" height="130" fill="url(#fade)"/></mask>
<mask id="r"><rect x="0" y="0" width="${width}" height="130" fill="url(#glow)"/></mask>
</defs>
<g mask="url(#m)"><g mask="url(#r)">${lattice({ origin, cell, top: 8, bottom: 90, left: 120, right: width - 8 })}</g><path class="b" d="${octagram(origin.x, origin.y, cell / 2)}"/></g>
${parts.join("\n")}`;
  return svgDocument({
    width, height, css: heroCss(theme), body,
    label: `${HERO.name}. ${HERO.role}. ${HERO.now}. ${HERO.status}.`,
  });
};

const renderHero = (theme) => {
  const width = 1000;
  const height = 264;
  const cell = 64;
  // The lattice grows outward from one brass star.
  const origin = { x: 1000 - 10 - cell * 2, y: 4 + cell * 2 };
  const brass = octagram(origin.x, origin.y, cell / 2);

  const nameSize = 60;
  const css = heroCss(theme);

  const body = `<defs>
<linearGradient id="fade" x1="700" x2="900" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
<radialGradient id="glow" cx="${origin.x}" cy="${origin.y}" r="250" gradientUnits="userSpaceOnUse"><stop offset=".3" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect x="0" y="0" width="${width}" height="${height}" fill="url(#fade)"/></mask>
<mask id="r"><rect x="0" y="0" width="${width}" height="${height}" fill="url(#glow)"/></mask>
</defs>
<g mask="url(#m)"><g mask="url(#r)">${lattice({ origin, cell, top: 4, bottom: height, left: 660, right: 1000 - 10 })}</g><path class="b" d="${brass}"/></g>
${text({ x: 0, y: 96, value: HERO.name, font: FONTS.display, size: nameSize, fill: theme.text, extra: ' letter-spacing="-1"' })}
${text({ x: 2, y: 150, value: HERO.role, font: FONTS.text, size: 25, fill: theme.text })}
${text({ x: 2, y: 188, value: HERO.now, font: FONTS.text, size: 18, fill: theme.muted })}
<circle cx="9" cy="220" r="5" fill="${theme.brass}"/>
${text({ x: 24, y: 226, value: HERO.status, font: FONTS.textBold, size: 18, fill: theme.text })}`;

  if (measure(HERO.name, FONTS.display, nameSize) > 710) throw new Error("Hero name is too wide for the layout.");
  return svgDocument({
    width, height, css, body,
    label: `${HERO.name}. ${HERO.role}. ${HERO.now}. ${HERO.status}.`,
  });
};

// --------------------------------------------------------------- projects --

const PAD = 28;

// Lays out the text of a project card and returns its height plus a renderer,
// so cards that sit side by side can share the taller height.
const layoutProject = (project, theme, width) => {
  const parts = [];
  const textWidth = project.wide ? 520 : width - PAD * 2;
  let y = PAD + 26;
  const titleSize = Math.min(24, Math.floor((textWidth / measure(project.title, FONTS.display, 1)) * 10) / 10);
  parts.push(text({ x: PAD, y, value: project.title, font: FONTS.display, size: titleSize, fill: theme.text }));
  y += 28;
  parts.push(text({ x: PAD, y, value: project.kind, font: FONTS.text, size: 15, fill: theme.accent }));
  y += 34;
  for (const line of wrap(project.summary, FONTS.text, 15.5, textWidth)) {
    parts.push(text({ x: PAD, y, value: line, font: FONTS.text, size: 15.5, fill: theme.text }));
    y += 24;
  }

  // Results sit in a small two-column table: beside the text on the wide
  // card, below it on the others.
  const specX = project.wide ? 620 : PAD;
  const specWidth = project.wide ? width - 620 - PAD : width - PAD * 2;
  const labelWidth = 116;
  let specY = project.wide ? PAD + 10 : y + 6;
  for (const [label, value, isResult] of project.specs) {
    parts.push(`<line x1="${specX}" x2="${specX + specWidth}" y1="${specY}" y2="${specY}" stroke="${theme.line}"/>`);
    const lines = wrap(value, FONTS.textBold, 14.5, specWidth - labelWidth);
    let lineY = specY + 24;
    parts.push(text({ x: specX, y: lineY, value: label, font: FONTS.text, size: 14, fill: theme.muted }));
    for (const line of lines) {
      parts.push(text({ x: specX + labelWidth, y: lineY, value: line, font: FONTS.textBold, size: 14.5, fill: isResult ? theme.accent : theme.text }));
      lineY += 21;
    }
    specY = lineY - 21 + 15;
  }

  const contentHeight = Math.max(y - 24 + 10, specY) + PAD - 10;
  // Half-width cards carry a transparent strip below the border, so they
  // keep a gap when they stack on narrow screens.
  const gap = project.wide ? 0 : 14;
  const render = (height) => svgDocument({
    width, height: height + gap,
    label: `${project.title}: ${project.kind}. ${project.summary} ${project.specs.map(([l, v]) => `${l}: ${v}.`).join(" ")}`,
    body: `<rect x=".5" y=".5" width="${width - 1}" height="${round(height - 1)}" rx="12" fill="none" stroke="${theme.line}"/>\n${parts.join("\n")}`,
  });
  return { height: contentHeight, render };
};

const renderProjects = (theme) => {
  const files = {};
  const wide = PROJECTS.filter((project) => project.wide);
  const half = PROJECTS.filter((project) => !project.wide);
  for (const project of wide) {
    const card = layoutProject(project, theme, 1000);
    files[project.file] = card.render(card.height);
    // On phones the wide card is drawn like the others, specs below the text.
    const narrow = layoutProject({ ...project, wide: false }, theme, NARROW);
    files[`${project.file}-narrow`] = narrow.render(narrow.height);
  }
  for (let i = 0; i < half.length; i += 2) {
    const pair = half.slice(i, i + 2).map((project) => ({ project, card: layoutProject(project, theme, 490) }));
    const height = Math.max(...pair.map(({ card }) => card.height));
    for (const { project, card } of pair) files[project.file] = card.render(height);
  }
  return files;
};

// --------------------------------------------------------------- timeline --

const renderTimeline = (theme) => {
  const width = 1000;
  const railX = 196;
  const contentX = 228;
  const contentWidth = width - contentX;
  const parts = [];
  const nodes = [];
  let y = 26;
  for (const entry of TIMELINE) {
    nodes.push(y - 6);
    parts.push(text({ x: railX - 24, y, value: entry.dates, font: FONTS.textBold, size: 14.5, fill: theme.muted, anchor: "end" }));
    parts.push(text({ x: contentX, y: y + 1, value: entry.title, font: FONTS.display, size: 21, fill: theme.text }));
    y += 28;
    parts.push(text({ x: contentX, y, value: entry.place, font: FONTS.text, size: 15, fill: theme.accent }));
    y += 30;
    for (const point of entry.points) {
      const lines = wrap(point, FONTS.text, 15.5, contentWidth - 20);
      parts.push(`<circle cx="${contentX + 3}" cy="${y - 5}" r="2.5" fill="${theme.muted}"/>`);
      for (const line of lines) {
        parts.push(text({ x: contentX + 18, y, value: line, font: FONTS.text, size: 15.5, fill: theme.text }));
        y += 23;
      }
      y += 6;
    }
    y += 30;
  }
  const height = y - 30;
  const rail = `<line x1="${railX}" x2="${railX}" y1="${nodes[0]}" y2="${height - 10}" stroke="${theme.line}" stroke-width="2"/>`;
  const dots = TIMELINE.map((entry, index) => entry.current
    ? `<circle cx="${railX}" cy="${nodes[index]}" r="6" fill="${theme.brass}"/>`
    : `<circle cx="${railX}" cy="${nodes[index]}" r="5" fill="none" stroke="${theme.muted}" stroke-width="2"/>`).join("");
  return svgDocument({
    width, height,
    label: TIMELINE.map((entry) => `${entry.title}, ${entry.place}, ${entry.dates}. ${entry.points.join(" ")}`).join(" "),
    body: `${rail}${dots}\n${parts.join("\n")}`,
  });
};

// Phone layout: dates sit above each title and the rail runs down the left.
const renderTimelineNarrow = (theme) => {
  const width = NARROW;
  const railX = 7;
  const contentX = 30;
  const contentWidth = width - contentX;
  const parts = [];
  const nodes = [];
  let y = 20;
  for (const entry of TIMELINE) {
    nodes.push(y - 5);
    parts.push(text({ x: contentX, y, value: entry.dates, font: FONTS.textBold, size: 14.5, fill: theme.muted }));
    y += 32;
    const titleSize = fitSize(entry.title, FONTS.display, 21, contentWidth);
    parts.push(text({ x: contentX, y, value: entry.title, font: FONTS.display, size: titleSize, fill: theme.text }));
    y += 26;
    for (const line of wrap(entry.place, FONTS.text, 15, contentWidth)) {
      parts.push(text({ x: contentX, y, value: line, font: FONTS.text, size: 15, fill: theme.accent }));
      y += 22;
    }
    y += 8;
    for (const point of entry.points) {
      parts.push(`<circle cx="${contentX + 3}" cy="${y - 5}" r="2.5" fill="${theme.muted}"/>`);
      for (const line of wrap(point, FONTS.text, 15.5, contentWidth - 18)) {
        parts.push(text({ x: contentX + 18, y, value: line, font: FONTS.text, size: 15.5, fill: theme.text }));
        y += 23;
      }
      y += 6;
    }
    y += 30;
  }
  const height = y - 30;
  const rail = `<line x1="${railX}" x2="${railX}" y1="${nodes[0]}" y2="${height - 10}" stroke="${theme.line}" stroke-width="2"/>`;
  const dots = nodes.map((nodeY) => `<circle cx="${railX}" cy="${nodeY}" r="6" fill="${theme.brass}"/>`).join("");
  return svgDocument({
    width, height,
    label: TIMELINE.map((entry) => `${entry.title}, ${entry.place}, ${entry.dates}. ${entry.points.join(" ")}`).join(" "),
    body: `${rail}${dots}\n${parts.join("\n")}`,
  });
};

// ------------------------------------------------------------------ stack --

// Phone layout: each group's label sits above its items, which wrap.
const renderStackNarrow = (theme) => {
  const width = NARROW;
  const gap = 24;
  const parts = [];
  let y = 0;
  STACK.forEach(([label, items], row) => {
    if (row > 0) parts.push(`<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="${theme.line}"/>`);
    y += 28;
    parts.push(text({ x: 0, y, value: label, font: FONTS.textBold, size: 14.5, fill: theme.muted }));
    y += 28;
    let x = 0;
    for (const item of items) {
      const itemWidth = measure(item, FONTS.text, 16.5);
      if (x > 0 && x + itemWidth > width) {
        x = 0;
        y += 26;
      }
      parts.push(text({ x, y, value: item, font: FONTS.text, size: 16.5, fill: theme.text }));
      x += itemWidth + gap;
    }
    y += 16;
  });
  return svgDocument({
    width, height: y,
    label: STACK.map(([label, items]) => `${label}: ${items.join(", ")}.`).join(" "),
    body: parts.join("\n"),
  });
};


const renderStack = (theme) => {
  const width = 1000;
  const itemX = 196;
  const gap = 30;
  const rowHeight = 46;
  const parts = [];
  STACK.forEach(([label, items], row) => {
    const top = row * rowHeight;
    const baseline = top + 29;
    if (row > 0) parts.push(`<line x1="0" x2="${width}" y1="${top}" y2="${top}" stroke="${theme.line}"/>`);
    parts.push(text({ x: 0, y: baseline, value: label, font: FONTS.textBold, size: 15, fill: theme.muted }));
    let x = itemX;
    for (const item of items) {
      parts.push(text({ x, y: baseline, value: item, font: FONTS.text, size: 16.5, fill: theme.text }));
      x += measure(item, FONTS.text, 16.5) + gap;
    }
    if (x - gap > width) throw new Error(`Stack row "${label}" is too wide.`);
  });
  return svgDocument({
    width, height: STACK.length * rowHeight,
    label: STACK.map(([label, items]) => `${label}: ${items.join(", ")}.`).join(" "),
    body: parts.join("\n"),
  });
};

// ------------------------------------------------------------------ write --

for (const [name, theme] of Object.entries(THEMES)) {
  const dir = `assets/${name}`;
  mkdirSync(dir, { recursive: true });
  const files = {
    hero: renderHero(theme),
    "hero-narrow": renderHeroNarrow(theme),
    experience: renderTimeline(theme),
    "experience-narrow": renderTimelineNarrow(theme),
    stack: renderStack(theme),
    "stack-narrow": renderStackNarrow(theme),
    ...renderProjects(theme),
  };
  for (const [file, svg] of Object.entries(files)) {
    writeFileSync(`${dir}/${file}.svg`, svg);
    console.log(`${dir}/${file}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
  }
}

// Stamp each image link in the README with a hash of the file, so browsers
// and GitHub's image cache fetch an image again as soon as it changes.
const README = "README.md";
const IMAGE_LINK = /(main\/(assets\/(?:dark|light)\/[a-z-]+\.svg))(?:\?v=[0-9a-f]+)?/g;
const readme = readFileSync(README, "utf8");
const stamped = readme.replace(IMAGE_LINK, (_, link, path) =>
  `${link}?v=${createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 8)}`);
if (stamped !== readme) {
  writeFileSync(README, stamped);
  console.log("README image links re-stamped.");
}
