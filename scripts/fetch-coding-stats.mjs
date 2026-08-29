const FS = await import("node:fs/promises");
const PATH = new URL("../stats.json", import.meta.url);
const UA = "Mozilla/5.0 (compatible; GarvPortfolioStats/1.0; +https://github.com/GarvS2071)";

const HANDLES = {
  codeforces: "CaPSanS623",
  codechef: "capsans623",
  leetcode: "Garvsharma_06",
  github: "GarvS2071",
};

const SKIP_REPOS = new Set(["portfolio", "gs623"]);

const PROJECT_FALLBACKS = {
  "Simple-Kafka":
    "Distributed commit-log engine in Java with NIO, a custom binary protocol, and ZooKeeper failover.",
  "Predictive-maintenance-copilot":
    "Predictive maintenance copilot using Isolation Forest, Random Forest, Streamlit, and a Gemini assistant.",
  "AirBnb-Clone-Application":
    "Full-stack booking platform with Spring Boot, React, and PostgreSQL.",
  "encrypted-chat":
    "AES-CBC client–server CLI chat built for confidential message transfer.",
  Reaction_time: "Visual and auditory reaction-time tests in the browser.",
};

function titleCase(value) {
  if (!value) return "";
  return String(value).replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function utcDay(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayFromUnix(seconds) {
  return utcDay(new Date(Number(seconds) * 1000));
}

function bump(map, day, n = 1) {
  if (!day) return;
  map[day] = (map[day] || 0) + n;
}

async function readExisting() {
  try {
    return JSON.parse(await FS.readFile(PATH, "utf8"));
  } catch {
    return {};
  }
}

async function getJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "User-Agent": UA, ...(options.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return res.json();
}

function firstParagraph(markdown) {
  const lines = String(markdown)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```") && !line.startsWith("---"));
  const text = (lines[0] || "").replace(/[*_`]/g, "");
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

async function fetchCodeforces() {
  const info = await getJson(`https://codeforces.com/api/user.info?handles=${HANDLES.codeforces}`);
  if (info.status !== "OK" || !info.result?.[0]) {
    throw new Error("Codeforces user.info failed");
  }
  const user = info.result[0];

  const status = await getJson(
    `https://codeforces.com/api/user.status?handle=${HANDLES.codeforces}&from=1&count=10000`
  );
  const solved = new Set();
  const days = {};
  if (status.status === "OK") {
    for (const sub of status.result || []) {
      if (sub.creationTimeSeconds) bump(days, dayFromUnix(sub.creationTimeSeconds));
      if (sub.verdict === "OK" && sub.problem) {
        solved.add(`${sub.problem.contestId ?? "x"}-${sub.problem.index}`);
      }
    }
  }

  return {
    stats: {
      rating: user.rating ?? 0,
      maxRating: user.maxRating ?? user.rating ?? 0,
      rank: titleCase(user.rank),
      maxRank: titleCase(user.maxRank || user.rank),
      solved: solved.size,
    },
    days,
  };
}

function codechefStars(rating) {
  if (rating >= 2500) return "7★";
  if (rating >= 2200) return "6★";
  if (rating >= 2000) return "5★";
  if (rating >= 1800) return "4★";
  if (rating >= 1600) return "3★";
  if (rating >= 1400) return "2★";
  return "1★";
}

async function fetchCodechef() {
  const days = {};
  try {
    const payload = await getJson(`https://codechef-stats.tashif.codes/${HANDLES.codechef}`);
    const data = payload.data || {};
    const rating = Math.round(data.currentRating ?? data.rating ?? 0);
    if (Array.isArray(data.activity)) {
      for (const row of data.activity) {
        if (row.date) bump(days, String(row.date).slice(0, 10), Number(row.count) || 1);
      }
    }
    return {
      stats: {
        rating,
        maxRating: Math.round(data.maxRating ?? rating),
        stars: data.rank || codechefStars(rating),
        contests: data.totalContests ?? 0,
        solved: data.totalSolved ?? 0,
      },
      days,
    };
  } catch {
    const res = await fetch(`https://www.codechef.com/users/${HANDLES.codechef}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`CodeChef profile -> ${res.status}`);
    const html = await res.text();
    const ratingMatch = html.match(/"rating":\s*(\d+)/);
    const starMatch = html.match(/(\d)[★*]/);
    const contestMatch = html.match(/No\.\s*of\s*Contests\s*Participated:\s*(\d+)/i);
    const rating = ratingMatch ? Number(ratingMatch[1]) : 0;
    return {
      stats: {
        rating,
        maxRating: rating,
        stars: starMatch ? `${starMatch[1]}★` : codechefStars(rating),
        contests: contestMatch ? Number(contestMatch[1]) : 0,
        solved: 0,
      },
      days,
    };
  }
}

async function fetchLeetcode() {
  const payload = await getJson("https://leetcode.com/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com/",
      Origin: "https://leetcode.com",
    },
    body: JSON.stringify({
      query: `query($username: String!) {
        matchedUser(username: $username) {
          submitStatsGlobal { acSubmissionNum { difficulty count } }
          languageProblemCount { languageName problemsSolved }
          submissionCalendar
        }
        userContestRanking(username: $username) { rating attendedContestsCount }
      }`,
      variables: { username: HANDLES.leetcode },
    }),
  });

  const user = payload.data?.matchedUser;
  if (!user) throw new Error("LeetCode matchedUser missing");

  const counts = Object.fromEntries(
    (user.submitStatsGlobal?.acSubmissionNum || []).map((row) => [row.difficulty, row.count])
  );
  const languages = [...(user.languageProblemCount || [])].sort(
    (a, b) => b.problemsSolved - a.problemsSolved
  );
  const top = languages[0];
  const ranking = payload.data?.userContestRanking || {};
  const days = {};
  try {
    const calendar = JSON.parse(user.submissionCalendar || "{}");
    for (const [unix, count] of Object.entries(calendar)) {
      bump(days, dayFromUnix(unix), Number(count) || 0);
    }
  } catch {
    // keep empty calendar
  }

  return {
    stats: {
      solved: counts.All ?? 0,
      easy: counts.Easy ?? 0,
      medium: counts.Medium ?? 0,
      hard: counts.Hard ?? 0,
      contestRating: ranking.rating ? Math.round(ranking.rating) : 0,
      primaryLanguage: top?.languageName || "",
      primarySolved: top?.problemsSolved ?? 0,
    },
    days,
  };
}

async function fetchGithubLatest() {
  const repos = await getJson(
    `https://api.github.com/users/${HANDLES.github}/repos?sort=pushed&per_page=30&type=owner`
  );
  const latest = (repos || []).find(
    (repo) => !repo.fork && !SKIP_REPOS.has(String(repo.name).toLowerCase())
  );
  if (!latest) throw new Error("No public GitHub repos found");

  let summary = latest.description || PROJECT_FALLBACKS[latest.name] || "";
  if (!summary) {
    try {
      const readme = await getJson(`https://api.github.com/repos/${HANDLES.github}/${latest.name}/readme`);
      summary = firstParagraph(Buffer.from(readme.content, "base64").toString("utf8"));
    } catch {
      summary = "Recent work on GitHub.";
    }
  }

  return {
    name: latest.name.replace(/-/g, " "),
    repo: latest.name,
    url: latest.html_url,
    pushedAt: latest.pushed_at,
    summary,
  };
}

async function fetchGithubDays() {
  const days = {};
  try {
    const payload = await getJson(
      `https://github-contributions-api.jogruber.de/v4/${HANDLES.github}?y=all`
    );
    for (const row of payload.contributions || []) {
      if (row.date && row.count) bump(days, row.date, Number(row.count) || 0);
    }
  } catch {
    // GitHub heatmap is optional
  }
  return days;
}

function mergeDays(...maps) {
  const out = {};
  for (const map of maps) {
    for (const [day, count] of Object.entries(map || {})) {
      bump(out, day, count);
    }
  }
  return out;
}

function bucketByYear(dayMap) {
  const years = {};
  for (const [day, count] of Object.entries(dayMap)) {
    const year = day.slice(0, 4);
    if (!years[year]) years[year] = {};
    years[year][day] = count;
  }
  return years;
}

const previous = await readExisting();
const next = {};
const errors = [];
const dayLayers = [];

async function run(key, fn) {
  try {
    const result = await fn();
    next[key] = result.stats ?? result;
    if (result.days) dayLayers.push(result.days);
    console.log(`ok ${key}`);
  } catch (err) {
    errors.push(`${key}: ${err.message}`);
    console.error(`fail ${key}`, err.message);
  }
}

await run("codeforces", fetchCodeforces);
await run("codechef", fetchCodechef);
await run("leetcode", fetchLeetcode);
await run("github", async () => ({ stats: { latest: await fetchGithubLatest() }, days: await fetchGithubDays() }));

if (!Object.keys(next).length) {
  console.error("All sources failed");
  process.exit(1);
}

const activity = bucketByYear(mergeDays(...dayLayers));
const githubBlock = {
  ...(previous.github || {}),
  ...(next.github || {}),
};

const stats = {
  updatedAt: new Date().toISOString(),
  codeforces: { ...(previous.codeforces || {}), ...(next.codeforces || {}) },
  codechef: { ...(previous.codechef || {}), ...(next.codechef || {}) },
  leetcode: { ...(previous.leetcode || {}), ...(next.leetcode || {}) },
  github: githubBlock,
  activity: Object.keys(activity).length ? activity : previous.activity || {},
};

await FS.writeFile(PATH, `${JSON.stringify(stats, null, 2)}\n`);
if (errors.length) {
  console.error("partial failures:", errors.join("; "));
}
