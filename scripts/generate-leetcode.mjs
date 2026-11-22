// Builds the LeetCode card from LeetCode's public GraphQL API, in the profile
// theme, instead of hot-linking a third-party card service.
//
//   LEETCODE_USER=zeeshansaeed06 node scripts/generate-leetcode.mjs [outDir]
//
// Writes leetcode.svg and leetcode-light.svg. If LeetCode can't be reached,
// it copies the last published cards from the output branch (set
// GITHUB_REPOSITORY) so the README never shows a broken image.
// For offline testing, set LEETCODE_FIXTURE to a JSON file shaped like the
// GraphQL `data` response.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONTS, THEMES, round, svgDocument, text } from "./theme.mjs";

const OUT_DIR = process.argv[2] ?? "dist";
const USER = process.env.LEETCODE_USER;
const FIXTURE = process.env.LEETCODE_FIXTURE;
const REPOSITORY = process.env.GITHUB_REPOSITORY;
const OUTPUTS = [["leetcode.svg", THEMES.dark], ["leetcode-light.svg", THEMES.light]];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

const QUERY = `
query ($username: String!) {
  allQuestionsCount { difficulty count }
  matchedUser(username: $username) {
    profile { ranking }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
}`;

const fetchData = async () => {
  if (FIXTURE) return JSON.parse(readFileSync(FIXTURE, "utf8"));
  if (!USER) throw new Error("Set LEETCODE_USER (or LEETCODE_FIXTURE).");
  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/u/${USER}/`,
      "User-Agent": "Mozilla/5.0 (profile-stats)",
    },
    body: JSON.stringify({ query: QUERY, variables: { username: USER } }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (!response.ok || body.errors || !body.data?.matchedUser) {
    throw new Error(`LeetCode API error: ${response.status} ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  }
  return body.data;
};

const summarise = (data) => {
  const count = (list, difficulty) => list.find((entry) => entry.difficulty === difficulty)?.count ?? 0;
  const solved = data.matchedUser.submitStatsGlobal.acSubmissionNum;
  return {
    solved: count(solved, "All"),
    ranking: data.matchedUser.profile.ranking,
    levels: DIFFICULTIES.map((difficulty) => ({
      difficulty,
      solved: count(solved, difficulty),
      total: count(data.allQuestionsCount, difficulty),
    })),
  };
};

const WIDTH = 1000;
const PAD = 28;

const renderCard = ({ solved, ranking, levels }, theme) => {
  const parts = [
    text({ x: PAD, y: PAD + 24, value: "LeetCode", font: FONTS.display, size: 22, fill: theme.text }),
    text({ x: PAD, y: PAD + 92, value: `${solved.toLocaleString("en-US")} problems solved`, font: FONTS.display, size: 30, fill: theme.accent }),
  ];
  if (ranking) {
    parts.push(text({ x: PAD, y: PAD + 124, value: `Ranked ${ranking.toLocaleString("en-US")} worldwide`, font: FONTS.text, size: 15.5, fill: theme.muted }));
  }

  const barX = 520;
  const barWidth = WIDTH - PAD - barX;
  let y = PAD + 4;
  for (const level of levels) {
    parts.push(text({ x: barX, y: y + 20, value: level.difficulty, font: FONTS.text, size: 15.5, fill: theme.text }));
    parts.push(text({ x: WIDTH - PAD, y: y + 20, value: `${level.solved} of ${level.total.toLocaleString("en-US")}`, font: FONTS.textBold, size: 15, fill: theme.muted, anchor: "end" }));
    parts.push(`<rect x="${barX}" y="${y + 30}" width="${barWidth}" height="4" rx="2" fill="${theme.line}"/>`);
    // Keep a visible sliver for small counts, so a solved level never reads as empty.
    const filled = level.solved ? Math.max(4, (level.solved / (level.total || 1)) * barWidth) : 0;
    parts.push(`<rect x="${barX}" y="${y + 30}" width="${round(filled)}" height="4" rx="2" fill="${theme.accent}"/>`);
    y += 48;
  }

  const height = Math.max(y, PAD + 124) + PAD - 4;
  const label = `LeetCode: ${solved} problems solved${ranking ? `, ranked ${ranking} worldwide` : ""}. `
    + levels.map((level) => `${level.difficulty}: ${level.solved} of ${level.total}.`).join(" ");
  return svgDocument({
    width: WIDTH, height, label,
    fonts: [FONTS.display, FONTS.text, FONTS.textBold],
    body: `<rect x=".5" y=".5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="none" stroke="${theme.line}"/>\n${parts.join("\n")}`,
  });
};

const copyPreviousCards = async () => {
  if (!REPOSITORY) throw new Error("No GITHUB_REPOSITORY set, so there are no previous cards to reuse.");
  for (const [file] of OUTPUTS) {
    const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/output/${file}`);
    if (!response.ok) throw new Error(`No previous ${file} on the output branch (${response.status}).`);
    writeFileSync(join(OUT_DIR, file), await response.text());
  }
};

mkdirSync(OUT_DIR, { recursive: true });
try {
  const summary = summarise(await fetchData());
  for (const [file, theme] of OUTPUTS) writeFileSync(join(OUT_DIR, file), renderCard(summary, theme));
  console.log(JSON.stringify(summary));
} catch (error) {
  console.warn(`::warning::LeetCode card not refreshed: ${error.message}`);
  try {
    await copyPreviousCards();
    console.warn("Reused the previously published LeetCode cards.");
  } catch (fallbackError) {
    console.warn(`::warning::${fallbackError.message}`);
  }
}
