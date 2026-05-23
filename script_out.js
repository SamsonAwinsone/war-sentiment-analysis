/* ============================================================
   script.js  —  War Sentiment Dashboard  |  Real-Time Logic
   ============================================================ */

"use strict";

// ─── Chart instances (held for live updates) ─────────────────────────────────
const charts = {};

// ─── Auto-refresh timer ───────────────────────────────────────────────────────
let autoRefreshTimer = null;
const AUTO_INTERVAL  = 60_000;     // 60 seconds

// ─── State ────────────────────────────────────────────────────────────────────
let currentData     = null;
let activePlatform  = "all";

// ─── Chart.js global defaults ────────────────────────────────────────────────
Chart.defaults.color          = "#7a8899";
Chart.defaults.font.family    = "'Space Grotesk', sans-serif";
Chart.defaults.font.size      = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding  = 14;

// ─── Colour palettes ─────────────────────────────────────────────────────────
const C = {
  pos:  "#22c55e",
  neu:  "#f59e0b",
  neg:  "#ef4444",
  acc:  "#3b82f6",
  acc2: "#06b6d4",
  grid: "rgba(30,37,48,0.8)",
};

const TOPIC_COLOURS = [
  "#3b82f6","#06b6d4","#8b5cf6","#ec4899",
  "#f59e0b","#22c55e","#ef4444","#f97316",
];

// =============================================================================
// ENTRY POINT  —  load on page ready
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupNavHighlight();
  // Auto-load on first visit
  triggerRefresh();
});

// =============================================================================
// NAVIGATION  —  highlight active section while scrolling
// =============================================================================
function setupNavHighlight() {
  const sections = document.querySelectorAll(".dash-section");
  const links    = document.querySelectorAll(".nav-link");
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove("active"));
        const active = document.querySelector(`.nav-link[data-section="${e.target.id}"]`);
        if (active) active.classList.add("active");
      }
    });
  }, { threshold: 0.35 });
  sections.forEach(s => obs.observe(s));
}

// =============================================================================
// REFRESH  —  called by button and auto-timer
// =============================================================================
async function triggerRefresh() {
  showSpinner("Fetching live data from news outlets…");
  setStatus("fetching", "Collecting data…");

  const btn = document.getElementById("refreshBtn");
  btn.classList.add("loading");
  btn.innerHTML = `<span class="btn-icon">↻</span> Fetching…`;

  try {
    // Step 1: collect fresh articles from all sources
    spinnerMsg("Scraping BBC · Al Jazeera · Reuters · RT · Google News…");
    const fetchResp = await apiFetch("/fetch-data");
    if (!fetchResp.ok) throw new Error(`/fetch-data returned ${fetchResp.status}`);
    const fetchData = await fetchResp.json();

    if (fetchData.error) throw new Error(fetchData.error);

    // Step 2: retrieve full analysis
    spinnerMsg("Running VADER sentiment + LDA topic modeling…");
    const resResp = await apiFetch("/results");
    if (!resResp.ok) throw new Error(`/results returned ${resResp.status}`);
    const resData = await resResp.json();

    if (resData.error) throw new Error(resData.error);

    // Step 3: paint the dashboard
    spinnerMsg("Rendering dashboard…");
    currentData = resData;
    renderDashboard(resData);
    populatePlatformFilter(resData.sentiment?.platform_stats || []);
    
    // Show cached indicator if applicable
    if (resData.is_cached) {
      setStatus("cached", "Showing cached data (live unavailable)");
      showToast("⚠ Live data unavailable — showing cached data from previous collection", "warning");
    } else {
      setStatus("live", "Live data loaded");
    }
    document.getElementById("lastUpdated").textContent =
      formatDate(resData.last_updated);

  } catch (err) {
    console.error("[Dashboard] Refresh error:", err);
    setStatus("error", `Error: ${err.message}`);
    showToast(`⚠ ${err.message}`, "error");
  } finally {
    hideSpinner();
    btn.classList.remove("loading");
    btn.innerHTML = `<span class="btn-icon">↻</span> Refresh Data`;
  }
}

// =============================================================================
// FULL DASHBOARD RENDER
// =============================================================================
function renderDashboard(data) {
  try {
    const s = data.sentiment || {};
    const t = data.topics    || [];
    const c = data.collection_table || [];

    renderKPIs(s);
    renderCollectionTable(c);
    renderTopics(t);
    renderPlatformBar(s.platform_stats || []);
    renderPieChart(s.overall || {});
    renderStackedBar(s.platform_stats || []);
    renderCategoryChart(s.category_stats || []);
    renderThemeCards(s.category_stats || []);
    renderPlatformGrid(s.platform_stats || []);
    renderRadarChart(s.platform_stats || []);
    updateArticleCount(s.total_articles || 0, c.length);
  } catch (err) {
    console.error("[Dashboard] Render error:", err);
    showToast("⚠ Error rendering charts: " + err.message, "error");
  }
}

// ── KPI Cards ────────────────────────────────────────────────────────────────
function renderKPIs(s) {
  const ov = s.overall || {};
  set("kpiTotal",   s.total_articles || 0);
  set("kpiSources", `from ${(s.platform_stats||[]).length} sources`);
  set("kpiPos",     ov.positive || 0);
  set("kpiPosPct",  `${ov.pos_pct || 0}%`);
  set("kpiNeu",     ov.neutral  || 0);
  set("kpiNeuPct",  `${ov.neu_pct || 0}%`);
  set("kpiNeg",     ov.negative || 0);
  set("kpiNegPct",  `${ov.neg_pct || 0}%`);
}

// ── Collection Table ─────────────────────────────────────────────────────────
function renderCollectionTable(rows) {
  const tbody = document.getElementById("tableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No data collected</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${esc(r.outlet)}</strong></td>
      <td><span class="count-badge">${r.count}</span></td>
      <td>${esc(r.earliest)}</td>
      <td>${esc(r.latest)}</td>
      <td><span class="method-tag">${esc(r.methods)}</span></td>
      <td style="font-size:11px;color:#3d4d5c;font-family:'JetBrains Mono',monospace">${esc(r.keywords)}</td>
    </tr>`
  ).join("");
}

// ── Topic Cards + Chart ───────────────────────────────────────────────────────
function renderTopics(topics) {
  const list = document.getElementById("topicsList");
  if (!topics.length) {
    list.innerHTML = `<div class="placeholder-msg">No topics generated</div>`;
    return;
  }
  list.innerHTML = topics.map((t, i) => `
    <div class="topic-card" style="border-left-color:${TOPIC_COLOURS[i%TOPIC_COLOURS.length]}">
      <div class="topic-header">
        <span class="topic-label">
          <span style="color:${TOPIC_COLOURS[i%TOPIC_COLOURS.length]};margin-right:6px">T${t.id+1}</span>
          ${esc(t.label)}
        </span>
        <span class="topic-weight">${t.weight}%</span>
      </div>
      <div class="topic-keywords">
        ${t.keywords.map(k=>`<span class="kw-chip">${esc(k)}</span>`).join("")}
      </div>
    </div>`
  ).join("");

  // Chart
  const labels  = topics.map(t => `T${t.id+1}: ${t.label}`);
  const weights = topics.map(t => t.weight);
  const colours = topics.map((_, i) => TOPIC_COLOURS[i % TOPIC_COLOURS.length]);

  buildOrUpdate("topicChart", "bar", {
    labels,
    datasets: [{
      label: "Topic Weight (%)",
      data:  weights,
      backgroundColor: colours.map(c => c + "cc"),
      borderColor:     colours,
      borderWidth: 1,
      borderRadius: 4,
    }]
  }, {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: C.grid }, ticks: { callback: v => v + "%" } },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  });
}

// ── Platform Bar Chart ────────────────────────────────────────────────────────
function renderPlatformBar(stats) {
  if (!stats || stats.length === 0) return;
  
  const filtered = activePlatform === "all"
    ? stats
    : stats.filter(s => s.platform === activePlatform);

  if (filtered.length === 0) return;

  const labels   = filtered.map(s => shortenPlatform(s.platform));
  const values   = filtered.map(s => s.avg_compound || 0);
  const barColours = values.map(v =>
    v >= 0.05 ? C.pos + "cc" : v <= -0.05 ? C.neg + "cc" : C.neu + "cc"
  );

  buildOrUpdate("platformBarChart", "bar", {
    labels,
    datasets: [{
      label:           "Avg Compound Score",
      data:            values,
      backgroundColor: barColours,
      borderColor:     barColours.map(c => c.replace("cc","ff")),
      borderWidth: 1,
      borderRadius: 4,
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        grid: { color: C.grid },
        min: -1, max: 1,
        ticks: { callback: v => v.toFixed(2), color: "#7a8899" },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, maxRotation: 45, color: "#7a8899" },
      },
    },
  });
}

// ── Pie Chart ─────────────────────────────────────────────────────────────────
function renderPieChart(overall) {
  const positive = overall.positive || 0;
  const neutral = overall.neutral || 0;
  const negative = overall.negative || 0;
  const total = positive + neutral + negative || 1;
  
  buildOrUpdate("pieChart", "doughnut", {
    labels: ["Positive","Neutral","Negative"],
    datasets: [{
      data:            [positive, neutral, negative],
      backgroundColor: [C.pos+"cc", C.neu+"cc", C.neg+"cc"],
      borderColor:     [C.pos, C.neu, C.neg],
      borderWidth: 2,
      hoverOffset: 6,
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const val = ctx.parsed || 0;
            return ` ${ctx.label}: ${val} (${(val/total*100).toFixed(1)}%)`;
          }
        }
      }
    },
  });

  // Custom legend
  document.getElementById("pieLegend").innerHTML = [
    { label:"Positive", colour: C.pos, value: positive },
    { label:"Neutral",  colour: C.neu, value: neutral  },
    { label:"Negative", colour: C.neg, value: negative },
  ].map(i => `
    <div class="pie-legend-item">
      <div class="pie-dot" style="background:${i.colour}"></div>
      <span>${i.label} (${i.value})</span>
    </div>`
  ).join("");
}

// ── Stacked Bar ───────────────────────────────────────────────────────────────
function renderStackedBar(stats) {
  if (!stats.length) return;
  const top     = stats.slice(0, 12);
  const labels  = top.map(s => shortenPlatform(s.platform));

  buildOrUpdate("stackedBar", "bar", {
    labels,
    datasets: [
      {
        label: "Positive",
        data: top.map(s => s.positive),
        backgroundColor: C.pos + "bb",
        borderColor: C.pos + "ff",
        borderWidth: 0,
        borderRadius: 2,
      },
      {
        label: "Neutral",
        data: top.map(s => s.neutral),
        backgroundColor: C.neu + "bb",
        borderColor: C.neu + "ff",
        borderWidth: 0,
        borderRadius: 2,
      },
      {
        label: "Negative",
        data: top.map(s => s.negative),
        backgroundColor: C.neg + "bb",
        borderColor: C.neg + "ff",
        borderWidth: 0,
        borderRadius: 2,
      },
    ]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#7a8899", boxWidth: 12, padding: 14 },
      }
    },
    scales: {
      x: {
        stacked: true,
        grid:  { display: false },
        ticks: { font: { size: 11 }, maxRotation: 45, color: "#7a8899" },
      },
      y: {
        stacked: true,
        grid: { color: C.grid },
        ticks: { color: "#7a8899" },
      },
    },
  });
}

// ── Category Bar ─────────────────────────────────────────────────────────────
function renderCategoryChart(stats) {
  if (!stats || stats.length === 0) return;
  
  const labels = stats.map(s => s.category || "Unknown");
  const values = stats.map(s => s.avg_compound || 0);
  const cols   = values.map(v =>
    v >= 0.05 ? C.pos + "bb" : v <= -0.05 ? C.neg + "bb" : C.neu + "bb"
  );

  buildOrUpdate("categoryChart", "bar", {
    labels,
    datasets: [{
      label: "Avg Compound",
      data: values,
      backgroundColor: cols,
      borderColor: cols,
      borderWidth: 1,
      borderRadius: 5,
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        grid: { color: C.grid },
        min: -1, max: 1,
        ticks: { callback: v => v.toFixed(2), color: "#7a8899" },
      },
      x: { 
        grid: { display: false },
        ticks: { color: "#7a8899" },
      },
    },
  });
}

// ── Theme Cards ───────────────────────────────────────────────────────────────
function renderThemeCards(stats) {
  const el = document.getElementById("themeCards");
  if (!stats || stats.length === 0) {
    el.innerHTML = `<div class="placeholder-msg">No thematic data</div>`;
    return;
  }
  el.innerHTML = stats.map(s => {
    const avg = s.avg_compound || 0;
    const cls   = avg >= 0.05 ? "pos" : avg <= -0.05 ? "neg" : "neu";
    const total = (s.positive + s.neutral + s.negative) || 1;
    const pp    = (s.positive/total*100).toFixed(0);
    const np    = (s.neutral /total*100).toFixed(0);
    const ngp   = (s.negative/total*100).toFixed(0);
    return `
      <div class="theme-card">
        <div class="theme-name">${esc(s.category || "Unknown")}</div>
        <div class="theme-score ${cls}">${avg.toFixed(3)}</div>
        <div class="theme-bars">
          <div class="bar-pos" style="flex:${pp}"></div>
          <div class="bar-neu" style="flex:${np}"></div>
          <div class="bar-neg" style="flex:${ngp}"></div>
        </div>
        <div class="theme-count">${s.count || 0} articles</div>
      </div>`;
  }).join("");
}

// ── Platform Cards ────────────────────────────────────────────────────────────
function renderPlatformGrid(stats) {
  const el = document.getElementById("platformGrid");
  if (!stats || stats.length === 0) {
    el.innerHTML = `<div class="placeholder-msg">No platform data</div>`;
    return;
  }
  el.innerHTML = stats.slice(0, 20).map(s => {
    const avg = s.avg_compound || 0;
    const cls   = avg >= 0.05 ? "pos" : avg <= -0.05 ? "neg" : "neu";
    const col   = avg >= 0.05 ? C.pos : avg <= -0.05 ? C.neg : C.neu;
    const total = (s.positive+s.neutral+s.negative)||1;
    return `
      <div class="platform-card">
        <div class="platform-name" title="${esc(s.platform)}">${esc(s.platform)}</div>
        <div class="platform-count">${s.count || 0} articles</div>
        <div class="platform-score" style="color:${col}">${avg.toFixed(3)}</div>
        <div class="platform-dist">
          <div class="bar-pos" style="flex:${s.positive || 0}"></div>
          <div class="bar-neu" style="flex:${s.neutral || 0}"></div>
          <div class="bar-neg" style="flex:${s.negative || 0}"></div>
        </div>
        <div class="platform-pcts">
          <span class="pct-pos">+${(s.pos_pct || 0).toFixed(0)}%</span>
          <span class="pct-neu">${(s.neu_pct || 0).toFixed(0)}%</span>
          <span class="pct-neg">-${(s.neg_pct || 0).toFixed(0)}%</span>
        </div>
      </div>`;
  }).join("");
}

// ── Radar Chart ───────────────────────────────────────────────────────────────
function renderRadarChart(stats) {
  if (stats.length < 2) return;
  const top    = stats.slice(0, 8);
  const labels = top.map(s => shortenPlatform(s.platform));

  buildOrUpdate("radarChart", "radar", {
    labels,
    datasets: [
      {
        label: "Avg Compound Score",
        data: top.map(s => Math.max(-1, Math.min(1, s.avg_compound))),
        borderColor: C.acc,
        backgroundColor: C.acc + "22",
        pointBackgroundColor: C.acc,
        pointRadius: 4,
        borderWidth: 2,
      },
      {
        label: "% Positive",
        data: top.map(s => (s.pos_pct || 0) / 100),
        borderColor: C.pos,
        backgroundColor: C.pos + "11",
        pointBackgroundColor: C.pos,
        pointRadius: 3,
        borderWidth: 1.5,
      },
      {
        label: "% Negative (inv)",
        data: top.map(s => -((s.neg_pct || 0) / 100)),
        borderColor: C.neg,
        backgroundColor: C.neg + "11",
        pointBackgroundColor: C.neg,
        pointRadius: 3,
        borderWidth: 1.5,
      },
    ]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: -1, max: 1,
        grid:          { color: C.grid },
        pointLabels:   { color: "#7a8899", font: { size: 11 } },
        ticks:         { display: false },
        angleLines:    { color: C.grid },
      }
    },
    plugins: {
      legend: { labels: { color: "#7a8899" } }
    },
  });
}

// =============================================================================
// PLATFORM FILTER
// =============================================================================
function populatePlatformFilter(stats) {
  const sel = document.getElementById("platformFilter");
  const current = sel.value;
  // Keep first "all" option, rebuild rest
  while (sel.options.length > 1) sel.remove(1);
  stats.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.platform;
    opt.text  = `${shortenPlatform(s.platform)} (${s.count})`;
    sel.add(opt);
  });
  sel.value = current && [...sel.options].some(o=>o.value===current) ? current : "all";
}

function applyPlatformFilter() {
  activePlatform = document.getElementById("platformFilter").value;
  if (currentData?.sentiment?.platform_stats) {
    renderPlatformBar(currentData.sentiment.platform_stats);
  }
}

// =============================================================================
// AUTO-REFRESH
// =============================================================================
function toggleAutoRefresh() {
  const checked = document.getElementById("autoRefresh").checked;
  if (checked) {
    autoRefreshTimer = setInterval(triggerRefresh, AUTO_INTERVAL);
    showToast("Auto-refresh ON — updates every 60 seconds", "info");
  } else {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    showToast("Auto-refresh OFF", "info");
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function apiFetch(endpoint) {
  return fetch(endpoint, { cache: "no-store" });
}

function buildOrUpdate(canvasId, type, data, options) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn(`[Chart] Canvas ${canvasId} not found`);
      return;
    }
    
    // Validate data
    if (!data || !data.datasets) {
      console.warn(`[Chart] ${canvasId} has invalid data`, data);
      return;
    }
    
    if (charts[canvasId]) {
      charts[canvasId].destroy();
      delete charts[canvasId];
    }
    
    const ctx = canvas.getContext("2d");
    charts[canvasId] = new Chart(ctx, {
      type,
      data,
      options: { ...options, animation: { duration: 600, easing: "easeInOutQuart" } },
    });
  } catch (err) {
    console.error(`[Chart] Error rendering ${canvasId}:`, err);
  }
}

function showSpinner(msg = "Loading…") {
  spinnerMsg(msg);
  document.getElementById("spinnerOverlay").classList.add("active");
}
function hideSpinner() {
  document.getElementById("spinnerOverlay").classList.remove("active");
}
function spinnerMsg(msg) {
  const el = document.getElementById("spinnerText");
  if (el) el.textContent = msg;
}

function setStatus(state, text) {
  const dot  = document.getElementById("statusDot");
  const txt  = document.getElementById("statusText");
  dot.className = "status-dot " + state;
  txt.textContent = text;
}

function updateArticleCount(n, sources) {
  document.getElementById("articleCount").textContent =
    `${n} articles · ${sources} sources`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day:"2-digit", month:"short", year:"numeric",
      hour:"2-digit", minute:"2-digit", hour12: false,
    });
  } catch { return iso; }
}

function shortenPlatform(name) {
  return name
    .replace("Reddit/r/", "r/")
    .replace("YouTube/", "YT/")
    .replace(" (comment)", "†")
    .slice(0, 22);
}

function esc(str) {
  if(!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  let bg, textColor;
  if (type === "error") {
    bg = "#ef4444";
    textColor = "#fff";
  } else if (type === "warning") {
    bg = "#f59e0b";
    textColor = "#1f2937";
  } else if (type === "success") {
    bg = "#22c55e";
    textColor = "#fff";
  } else {
    bg = "#3b82f6";
    textColor = "#fff";
  }
  
  Object.assign(toast.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: 999,
    background: bg, color: textColor,
    padding: "12px 18px", borderRadius: "8px",
    fontFamily: "'Space Grotesk', sans-serif", fontSize: "13px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    transition: "opacity 0.4s",
    maxWidth: "340px",
  });
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; }, 3500);
  setTimeout(() => toast.remove(), 4000);
}
}

// =============================================================================
// POSTS & COMMENTS FUNCTIONALITY
// =============================================================================

let allPosts = [];

function loadPosts() {
  try {
    fetch("/posts?limit=500", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        allPosts = data || [];
        populatePostFilters();
        renderPostsTable(allPosts);
        if(data.length === 0) {
          document.getElementById("postsTableBody").innerHTML = 
            `<tr><td colspan="7" class="table-empty">No posts collected yet. Click "Refresh Data" first.</td></tr>`;
        }
      })
      .catch(err => {
        console.error("[Posts] Error loading posts:", err);
        showToast("Error loading posts: " + err.message, "error");
      });
  } catch (err) {
    console.error("[Posts] Failed:", err);
  }
}

function populatePostFilters() {
  // Populate source filter
  const sources = [...new Set(allPosts.map(p => p.source))].sort();
  const sourceFilter = document.getElementById("postsSourceFilter");
  sources.forEach(src => {
    if(!Array.from(sourceFilter.options).find(o => o.value === src)) {
      const opt = document.createElement("option");
      opt.value = src;
      opt.text = src;
      sourceFilter.add(opt);
    }
  });
  
  // Populate category filter
  const categories = [...new Set(allPosts.map(p => p.category))].sort();
  const catFilter = document.getElementById("postsCategoryFilter");
  categories.forEach(cat => {
    if(!Array.from(catFilter.options).find(o => o.value === cat)) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.text = cat;
      catFilter.add(opt);
    }
  });
}

function filterPosts() {
  const search = document.getElementById("postsSearch")?.value || "";
  const source = document.getElementById("postsSourceFilter")?.value || "";
  const sentiment = document.getElementById("postsSentimentFilter")?.value || "";
  const category = document.getElementById("postsCategoryFilter")?.value || "";
  
  let filtered = allPosts;
  
  if(search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(q) || 
      p.text_preview.toLowerCase().includes(q)
    );
  }
  if(source) filtered = filtered.filter(p => p.source === source);
  if(sentiment) filtered = filtered.filter(p => p.sentiment === sentiment);
  if(category) filtered = filtered.filter(p => p.category === category);
  
  renderPostsTable(filtered);
}

function renderPostsTable(posts) {
  const tbody = document.getElementById("postsTableBody");
  if(!posts || posts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No posts match your filters</td></tr>`;
    return;
  }
  
  tbody.innerHTML = posts.map(p => {
    const sentimentClass = p.sentiment.toLowerCase();
    return `<tr>
      <td><strong>${esc(p.source)}</strong></td>
      <td title="${esc(p.text_preview)}">${esc(p.title?.substring(0, 80) || "Untitled")}</td>
      <td class="${sentimentClass}">
        <span class="sentiment-badge ${sentimentClass.charAt(0)}">${esc(p.sentiment)}</span>
      </td>
      <td><span class="score-badge">${p.compound.toFixed(3)}</span></td>
      <td><small>${esc(p.category)}</small></td>
      <td><small>${esc(p.date?.substring(0, 10) || "—")}</small></td>
      <td><button class="btn-view" onclick="openPostModal('${esc(p.id)}')">View</button></td>
    </tr>`;
  }).join("");
}

function openPostModal(postId) {
  const post = allPosts.find(p => p.id === postId);
  if(!post) return;
  
  const modal = document.getElementById("postDetailModal");
  document.getElementById("postModalTitle").textContent = post.source + " — " + (post.title || "Article");
  
  const sentClass = post.sentiment.toLowerCase().charAt(0);
  const body = document.getElementById("postModalBody");
  body.innerHTML = `
    <div class="post-detail-row">
      <div class="post-detail-label">Source</div>
      <div class="post-detail-value">${esc(post.source)}</div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Title</div>
      <div class="post-detail-value"><strong>${esc(post.title || "Untitled")}</strong></div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Content</div>
      <div class="post-detail-value" style="max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-word">${esc(post.text_full)}</div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Sentiment</div>
      <div><span class="sentiment-badge ${sentClass}">${esc(post.sentiment)}</span></div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Sentiment Score</div>
      <div class="post-detail-value" style="font-family:'JetBrains Mono';font-size:14px;font-weight:700">
        ${post.compound > 0 ? "+" : ""}${post.compound.toFixed(4)} 
        <span style="font-size:11px;color:var(--txt-secondary)">(pos:${(post.pos*100).toFixed(0)}% neu:${(post.neu*100).toFixed(0)}% neg:${(post.neg*100).toFixed(0)}%)</span>
      </div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Category</div>
      <div class="post-detail-value">${esc(post.category)}</div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Date</div>
      <div class="post-detail-value">${esc(post.date)}</div>
    </div>
    <div class="post-detail-row">
      <div class="post-detail-label">Collection Method</div>
      <div class="post-detail-value"><small>${esc(post.method)}</small></div>
    </div>
  `;
  
  document.getElementById("postModalLink").href = post.url;
  modal.classList.add("active");
}

function closePostModal() {
  document.getElementById("postDetailModal").classList.remove("active");
}

function downloadExcel() {
  try {
    showToast("⏳ Generating Excel file...", "info");
    window.location.href = "/export-excel";
    setTimeout(() => showToast("✓ Excel file downloaded!", "success"), 500);
  } catch (err) {
    console.error("[Export] Error:", err);
    showToast("Error exporting Excel: " + err.message, "error");
  }
}

// Close modal when clicking overlay
document.addEventListener("click", (e) => {
  const modal = document.getElementById("postDetailModal");
  if(e.target === document.querySelector(".modal-overlay")) {
    closePostModal();
  }
});

