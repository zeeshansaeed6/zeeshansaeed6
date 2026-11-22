// Builds the GitHub stats cards from the GraphQL API, so the README doesn't
// depend on a shared public stats server that gets rate-limited.
//
//   GITHUB_TOKEN=... GITHUB_USER=zeeshansaeed6 node scripts/generate-stats.mjs [outDir]
//
// Writes stats.svg, stats-light.svg, languages.svg and languages-light.svg.
// For offline testing, set STATS_FIXTURE to a JSON file shaped like the
// GraphQL `data` response instead of passing a token.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONTS, THEMES, round, svgDocument, text } from "./theme.mjs";

const OUT_DIR = process.argv[2] ?? "dist";
const USER = process.env.GITHUB_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const FIXTURE = process.env.STATS_FIXTURE;
const TOP_LANGUAGES = 6;

const QUERY = `
query ($login: String!, $cursor: String) {
  user(login: $login) {
    pullRequests { totalCount }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $cursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

const graphql = async (variables) => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-stats",
    },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(`GitHub API error: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.data;
};

const fetchUser = async () => {
  if (FIXTURE) return JSON.parse(readFileSync(FIXTURE, "utf8")).user;
  if (!USER || !TOKEN) throw new Error("Set GITHUB_USER and GITHUB_TOKEN (or STATS_FIXTURE).");

  const first = (await graphql({ login: USER, cursor: null })).user;
  const repos = [...first.repositories.nodes];
  let pageInfo = first.repositories.pageInfo;
  while (pageInfo.hasNextPage) {
    const page = (await graphql({ login: USER, cursor: pageInfo.endCursor })).user.repositories;
    repos.push(...page.nodes);
    pageInfo = page.pageInfo;
  }
  return { ...first, repositories: { ...first.repositories, nodes: repos } };
};

// Current streak counts back from today, or from yesterday if today has no
// contributions yet, so the streak doesn't read 0 every morning.
const computeStreaks = (weeks) => {
  const days = weeks.flatMap((week) => week.contributionDays);
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  let index = days.length - 1;
  if (index >= 0 && days[index].contributionCount === 0) index -= 1;
  while (index >= 0 && days[index].contributionCount > 0) {
    current += 1;
    index -= 1;
  }
  return { current, longest };
};

const summarise = (user) => {
  const collection = user.contributionsCollection;
  const repos = user.repositories.nodes;
  const languageBytes = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      const entry = languageBytes.get(node.name) ?? { size: 0 };
      entry.size += size;
      languageBytes.set(node.name, entry);
    }
  }
  const totalBytes = [...languageBytes.values()].reduce((sum, lang) => sum + lang.size, 0) || 1;
  const languages = [...languageBytes]
    .map(([name, { size }]) => ({ name, percent: (size / totalBytes) * 100 }))
    .filter((language) => language.percent >= 0.5)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, TOP_LANGUAGES);

  return {
    stats: [
      ["Contributions (last year)", collection.contributionCalendar.totalContributions],
      ["Commits (last year)", collection.totalCommitContributions],
      ["Pull requests", user.pullRequests.totalCount],
      ["Repositories", user.repositories.totalCount],
      ["Stars earned", repos.reduce((sum, repo) => sum + repo.stargazerCount, 0)],
    ],
    streaks: computeStreaks(collection.contributionCalendar.weeks),
    languages,
  };
};

const WIDTH = 490;
const PAD = 28;

// Returns the card's natural height and a renderer, so the two cards shown
// side by side can be drawn at the same height.
const card = ({ height, label, body, theme }) => ({ height, render: (finalHeight) => svgDocument({
  width: WIDTH, height: finalHeight, label,
  body: `<rect x=".5" y=".5" width="${WIDTH - 1}" height="${finalHeight - 1}" rx="12" fill="none" stroke="${theme.line}"/>\n${body}`,
}) });

const title = (value, theme) => text({ x: PAD, y: PAD + 24, value, font: FONTS.display, size: 22, fill: theme.text });

const renderStatsCard = ({ stats, streaks }, theme) => {
  const parts = [title("GitHub activity", theme)];
  let y = PAD + 48;
  for (const [name, value] of stats) {
    parts.push(`<line x1="${PAD}" x2="${WIDTH - PAD}" y1="${y}" y2="${y}" stroke="${theme.line}"/>`);
    parts.push(text({ x: PAD, y: y + 24, value: name, font: FONTS.text, size: 15, fill: theme.muted }));
    parts.push(text({ x: WIDTH - PAD, y: y + 24, value: value.toLocaleString("en-US"), font: FONTS.textBold, size: 15.5, fill: theme.text, anchor: "end" }));
    y += 36;
  }
  y += 22;
  const half = (WIDTH - PAD * 2 - 16) / 2;
  const streak = (x, days, name, color) =>
    text({ x, y: y + 24, value: `${days} ${days === 1 ? "day" : "days"}`, font: FONTS.display, size: 22, fill: color })
    + text({ x, y: y + 48, value: name, font: FONTS.text, size: 14, fill: theme.muted });
  parts.push(streak(PAD, streaks.current, "Current streak", theme.brass));
  parts.push(streak(PAD + half + 16, streaks.longest, "Longest streak this year", theme.accent));
  const height = y + 48 + PAD;
  const label = stats.map(([name, value]) => `${name}: ${value}`).join(", ")
    + `. Current streak ${streaks.current} days, longest streak ${streaks.longest} days.`;
  return card({ height, label, body: parts.join("\n"), theme });
};

const renderLanguagesCard = ({ languages }, theme) => {
  const parts = [title("Most used languages", theme)];
  const barWidth = WIDTH - PAD * 2;
  let y = PAD + 48;
  const top = languages[0]?.percent || 1;
  for (const { name, percent } of languages) {
    parts.push(text({ x: PAD, y: y + 20, value: name, font: FONTS.text, size: 15, fill: theme.text }));
    parts.push(text({ x: WIDTH - PAD, y: y + 20, value: `${percent.toFixed(1)}%`, font: FONTS.textBold, size: 15, fill: theme.muted, anchor: "end" }));
    parts.push(`<rect x="${PAD}" y="${y + 30}" width="${barWidth}" height="4" rx="2" fill="${theme.line}"/>`);
    parts.push(`<rect x="${PAD}" y="${y + 30}" width="${round((percent / top) * barWidth)}" height="4" rx="2" fill="${theme.accent}"/>`);
    y += 48;
  }
  const height = y + PAD - 8;
  const label = `Most used languages: ${languages.map(({ name, percent }) => `${name} ${percent.toFixed(1)}%`).join(", ")}`;
  return card({ height, label, body: parts.join("\n"), theme });
};

const summary = summarise(await fetchUser());
mkdirSync(OUT_DIR, { recursive: true });
for (const [suffix, theme] of [["", THEMES.dark], ["-light", THEMES.light]]) {
  const stats = renderStatsCard(summary, theme);
  const languages = renderLanguagesCard(summary, theme);
  const height = Math.max(stats.height, languages.height);
  writeFileSync(join(OUT_DIR, `stats${suffix}.svg`), stats.render(height));
  writeFileSync(join(OUT_DIR, `languages${suffix}.svg`), languages.render(height));
}
console.log(JSON.stringify(summary, null, 2));
