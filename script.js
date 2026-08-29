const tabs = [...document.querySelectorAll(".tab")];
const panes = [...document.querySelectorAll(".pane")];
const statusFile = document.getElementById("status-file");

function typeCommand(pane) {
  const target = pane.querySelector(".cmd[data-type]");
  if (!target) return;
  const text = target.dataset.type;
  target.textContent = "";
  let i = 0;
  const tick = () => {
    target.textContent = text.slice(0, i);
    i += 1;
    if (i <= text.length) {
      window.setTimeout(tick, 18);
    }
  };
  tick();
}

function showPane(id) {
  const tab = tabs.find((t) => t.dataset.pane === id);
  if (!tab) return;

  panes.forEach((pane) => {
    const on = pane.id === id;
    pane.classList.toggle("is-active", on);
    pane.hidden = !on;
  });
  tabs.forEach((t) => {
    const on = t === tab;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  statusFile.textContent = id;
  typeCommand(document.getElementById(id));
}

tabs.forEach((tab) => {
  tab.setAttribute("role", "tab");
  tab.addEventListener("click", () => showPane(tab.dataset.pane));
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;

  const active = document.querySelector(".tab.is-active");
  const idx = tabs.indexOf(active);

  if (event.key === "ArrowRight" && idx < tabs.length - 1) {
    event.preventDefault();
    tabs[idx + 1].click();
  }
  if (event.key === "ArrowLeft" && idx > 0) {
    event.preventDefault();
    tabs[idx - 1].click();
  }

  const number = Number(event.key);
  if (number >= 1 && number <= tabs.length) {
    event.preventDefault();
    tabs[number - 1].click();
  }
});

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value != null && value !== "") el.textContent = value;
}

function formatSyncTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

let activityByYear = {};

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function levelFor(count, max) {
  if (!count) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function renderHeatmap(year) {
  const mapEl = document.getElementById("heat-map");
  const monthsEl = document.getElementById("heat-months");
  if (!mapEl || !monthsEl) return;

  const counts = activityByYear[year] || {};
  const max = Math.max(0, ...Object.values(counts));
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  mapEl.innerHTML = "";
  monthsEl.innerHTML = "";

  const todayKey = toDayKey(new Date());
  let week = document.createElement("div");
  week.className = "heat-week";
  const monthAtWeek = [];
  let lastMonth = -1;

  const stop = new Date(end);
  stop.setDate(stop.getDate() + (6 - stop.getDay()));

  while (cursor <= stop) {
    if (cursor.getDay() === 0 && week.childNodes.length) {
      mapEl.appendChild(week);
      monthAtWeek.push(lastMonth);
      week = document.createElement("div");
      week.className = "heat-week";
    }

    const key = toDayKey(cursor);
    const inYear = cursor.getFullYear() === Number(year);
    const count = inYear ? counts[key] || 0 : 0;
    const cell = document.createElement("span");
    cell.className = `heat-cell l${inYear ? levelFor(count, max) : 0}`;
    if (inYear && key === todayKey) cell.classList.add("is-today");
    cell.title = inYear ? `${key}: ${count} activit${count === 1 ? "y" : "ies"}` : "";
    week.appendChild(cell);

    if (inYear) lastMonth = cursor.getMonth();
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.childNodes.length) {
    mapEl.appendChild(week);
    monthAtWeek.push(lastMonth);
  }

  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let prev = -1;
  monthAtWeek.forEach((month) => {
    const tag = document.createElement("span");
    tag.className = "heat-month";
    tag.style.width = "14px";
    if (month !== prev && month >= 0) {
      tag.textContent = labels[month];
      tag.style.width = "42px";
      prev = month;
    }
    monthsEl.appendChild(tag);
  });

  const todayCount = counts[todayKey] || 0;
  const todayLine = document.getElementById("heat-today");
  if (todayLine) {
    if (Number(year) !== new Date().getFullYear()) {
      todayLine.textContent = `${year} activity across GitHub, Codeforces, CodeChef, and LeetCode`;
    } else if (todayCount > 0) {
      todayLine.textContent = `active today · ${todayCount} recorded across platforms`;
    } else {
      todayLine.textContent = "no recorded activity today yet";
    }
  }
}

function setupYearSelect(activity) {
  const select = document.getElementById("heat-year");
  if (!select) return;
  const years = Object.keys(activity)
    .map(Number)
    .filter((year) => year >= 2023)
    .sort((a, b) => b - a);
  const current = new Date().getFullYear();
  if (!years.includes(current)) years.unshift(current);
  select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
  select.value = String(years[0] || current);
  select.onchange = () => renderHeatmap(Number(select.value));
  renderHeatmap(Number(select.value));
}

async function loadCodingStats() {
  try {
    const res = await fetch(`stats.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const stats = await res.json();
    const cf = stats.codeforces || {};
    const cc = stats.codechef || {};
    const lc = stats.leetcode || {};
    const latest = stats.github?.latest || {};

    if (cf.maxRank || cf.maxRating) {
      setText("cf-max", `${cf.maxRank || "Max"} · ${cf.maxRating}`);
    }
    if (cf.rating != null) setText("cf-current", String(cf.rating));
    if (cf.solved != null) setText("cf-solved", `${cf.solved} problems`);

    if (cc.stars) setText("cc-stars", cc.stars);
    if (cc.rating != null) setText("cc-rating", String(cc.rating));
    if (cc.contests != null) setText("cc-contests", `${cc.contests} rated`);

    if (lc.solved != null) {
      setText(
        "lc-solved",
        `${lc.solved} (${lc.easy ?? 0} / ${lc.medium ?? 0} / ${lc.hard ?? 0})`
      );
    }
    if (lc.contestRating) setText("lc-contest", String(lc.contestRating));
    if (lc.primaryLanguage) {
      setText("lc-primary", `${lc.primaryLanguage} · ${lc.primarySolved ?? 0}`);
    }

    const cfLabel = cf.maxRank && cf.maxRating ? `CF ${cf.maxRank} (max ${cf.maxRating})` : "";
    const ccLabel = cc.stars && cc.rating != null ? `CC ${cc.stars} (${cc.rating})` : "";
    const lcLabel = lc.solved != null ? `LC ${lc.solved}` : "";
    const summary = [cfLabel, ccLabel, lcLabel].filter(Boolean).join(" · ");
    if (summary) {
      setText("home-coding-profiles", summary);
      setText("live-stats-line", summary);
    }

    if (latest.name) {
      const nameEl = document.getElementById("latest-name");
      if (nameEl) {
        nameEl.textContent = latest.name;
        if (latest.url) nameEl.href = latest.url;
      }
      if (latest.summary) setText("latest-summary", latest.summary);
    }

    if (stats.updatedAt) {
      setText("stats-synced", `last synced ${formatSyncTime(stats.updatedAt)}`);
    }

    activityByYear = stats.activity || {};
    setupYearSelect(activityByYear);
  } catch {
    // Keep the resume numbers already in the HTML.
  }
}

showPane("home");
loadCodingStats();

