const FS = await import("node:fs/promises");
const PATH = new URL("../stats.json", import.meta.url);
const UA = "Mozilla/5.0 (compatible; GarvPortfolioStats/1.0; +https://github.com/GarvS2071)";

const HANDLES = {
  codeforces: "CaPSanS623",
  codechef: "capsans623",
  leetcode: "Garvsharma_06",
};

function titleCase(value) {
  if (!value) return "";
  return String(value).replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
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
  if (status.status === "OK") {
    for (const sub of status.result || []) {
      if (sub.verdict === "OK" && sub.problem) {
        solved.add(`${sub.problem.contestId ?? "x"}-${sub.problem.index}`);
      }
    }
  }

  return {
    rating: user.rating ?? 0,
    maxRating: user.maxRating ?? user.rating ?? 0,
    rank: titleCase(user.rank),
    maxRank: titleCase(user.maxRank || user.rank),
    solved: solved.size,
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
  try {
    const payload = await getJson(`https://codechef-stats.tashif.codes/${HANDLES.codechef}`);
    const data = payload.data || {};
    const rating = Math.round(data.currentRating ?? data.rating ?? 0);
    return {
      rating,
      maxRating: Math.round(data.maxRating ?? rating),
      stars: data.rank || codechefStars(rating),
      contests: data.totalContests ?? 0,
      solved: data.totalSolved ?? 0,
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
      rating,
      maxRating: rating,
      stars: starMatch ? `${starMatch[1]}★` : codechefStars(rating),
      contests: contestMatch ? Number(contestMatch[1]) : 0,
      solved: 0,
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

  return {
    solved: counts.All ?? 0,
    easy: counts.Easy ?? 0,
    medium: counts.Medium ?? 0,
    hard: counts.Hard ?? 0,
    contestRating: ranking.rating ? Math.round(ranking.rating) : 0,
    primaryLanguage: top?.languageName || "",
    primarySolved: top?.problemsSolved ?? 0,
  };
}

function merge(previous, next) {
  return {
    updatedAt: new Date().toISOString(),
    codeforces: { ...(previous.codeforces || {}), ...(next.codeforces || {}) },
    codechef: { ...(previous.codechef || {}), ...(next.codechef || {}) },
    leetcode: { ...(previous.leetcode || {}), ...(next.leetcode || {}) },
  };
}

const previous = await readExisting();
const next = {};
const errors = [];

for (const [key, fn] of [
  ["codeforces", fetchCodeforces],
  ["codechef", fetchCodechef],
  ["leetcode", fetchLeetcode],
]) {
  try {
    next[key] = await fn();
    console.log(`ok ${key}`, JSON.stringify(next[key]));
  } catch (err) {
    errors.push(`${key}: ${err.message}`);
    console.error(`fail ${key}`, err.message);
  }
}

if (!Object.keys(next).length) {
  console.error("All sources failed");
  process.exit(1);
}

const stats = merge(previous, next);
await FS.writeFile(PATH, `${JSON.stringify(stats, null, 2)}\n`);
if (errors.length) {
  console.error("partial failures:", errors.join("; "));
}
