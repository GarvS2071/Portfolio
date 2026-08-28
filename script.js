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

async function loadCodingStats() {
  try {
    const res = await fetch(`stats.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const stats = await res.json();
    const cf = stats.codeforces || {};
    const cc = stats.codechef || {};
    const lc = stats.leetcode || {};

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
    if (summary) setText("home-coding-profiles", summary);

    if (stats.updatedAt) {
      setText("stats-synced", `last synced ${formatSyncTime(stats.updatedAt)}`);
    }
  } catch {
    // Keep the resume numbers already in the HTML.
  }
}

showPane("home");
loadCodingStats();
