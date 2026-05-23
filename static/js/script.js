/* ============================================================
   script.js  —  War Sentiment Dashboard  v3
   FIXED: extra brace bug, chart heights, loadArticles on refresh,
          article grouping with comments, Excel download
   ============================================================ */
"use strict";

// ─── State ────────────────────────────────────────────────────────────────────
const charts       = {};
let autoTimer      = null;
let currentData    = null;
let allArticles    = [];      // full articles list from /articles
let filteredArts   = [];      // after filters applied
let displayedCount = 0;
const PAGE_SIZE    = 24;

// ─── Chart.js defaults ───────────────────────────────────────────────────────
Chart.defaults.color          = "#7a8899";
Chart.defaults.font.family    = "'Space Grotesk', sans-serif";
Chart.defaults.font.size      = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding  = 14;

const C = {
  pos:  "#22c55e", neu: "#f59e0b", neg: "#ef4444",
  acc:  "#3b82f6", acc2: "#06b6d4",
  grid: "rgba(30,37,48,0.8)",
};
const TOPIC_COLS = [
  "#3b82f6","#06b6d4","#8b5cf6","#ec4899",
  "#f59e0b","#22c55e","#ef4444","#f97316",
];

// =============================================================================
// BOOT
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupScrollSpy();
  // Initialize theme from localStorage
  try {
    const t = localStorage.getItem('theme') || 'dark';
    setTheme(t);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.checked = (t === 'light');
  } catch (e) { console.log('[theme] init error', e.message); }
  triggerRefresh();
  // start polling the backend for background fetch status
  pollFetchStatus();
  setInterval(pollFetchStatus, 3000);
  // Try EventSource for instant updates (fallbacks to polling above)
  if (window.EventSource) startSSE();
});

// Start Server-Sent Events connection to receive live fetch updates
function startSSE() {
  try {
    const es = new EventSource('/events');
    es.onmessage = async (ev) => {
      try {
        const js = JSON.parse(ev.data || '{}');
        const wasFetching = document.getElementById('fs-fetching')?.textContent === 'yes';
        // Update UI same as pollFetchStatus
        const elFetching = document.getElementById('fs-fetching');
        const elStart    = document.getElementById('fs-last-start');
        const elEnd      = document.getElementById('fs-last-end');
        const elCount    = document.getElementById('fs-last-count');
        const elUpdated  = document.getElementById('fs-last-updated');
        if (elFetching) elFetching.textContent = js.bg_fetching ? 'yes' : 'no';
        if (elStart)    elStart.textContent    = js.last_start ? formatDate(js.last_start) : '—';
        if (elEnd)      elEnd.textContent      = js.last_end   ? formatDate(js.last_end)   : '—';
        if (elCount)    elCount.textContent    = js.last_count ?? 0;
        if (elUpdated)  elUpdated.textContent  = js.last_updated ? formatDate(js.last_updated) : '—';

        // Update logs panel if present
        if (js.logs) updateLogArea(js.logs);

        // If fetch just finished, pull latest results and refresh dashboard
        if (wasFetching && !js.bg_fetching) {
          try {
            const r = await apiFetch('/results');
            if (r.ok) {
              const payload = await r.json();
              if (payload && payload.sentiment) {
                currentData = payload;
                renderDashboard(payload);
                await loadArticles();
                toast('📡 Live fetch completed — dashboard updated', 'success');
              }
            }
          } catch (e) {
            console.log('[SSE] failed to refresh results:', e.message);
          }
        }
      } catch (e) {
        console.log('[SSE] parse error', e.message);
      }
    };
    es.onerror = (e) => { /* silent fallback to polling */ es.close(); };
  } catch (e) {
    console.log('[SSE] not available', e.message);
  }
}

// Theme helpers
function toggleTheme() {
  try {
    const cb = document.getElementById('themeToggle');
    const newTheme = cb && cb.checked ? 'light' : 'dark';
    setTheme(newTheme);
  } catch (e) { console.log('[theme] toggle error', e.message); }
}

function setTheme(theme) {
  try {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
    }
  } catch (e) { console.log('[theme] set error', e.message); }
}

// Poll backend /fetch-status and update sidebar UI
async function pollFetchStatus() {
  try {
    const resp = await apiFetch('/fetch-status');
    if (!resp.ok) return;
    const js = await resp.json();
    const elFetching = document.getElementById('fs-fetching');
    const elStart    = document.getElementById('fs-last-start');
    const elEnd      = document.getElementById('fs-last-end');
    const elCount    = document.getElementById('fs-last-count');
    const elUpdated  = document.getElementById('fs-last-updated');
    if (elFetching) elFetching.textContent = js.bg_fetching ? 'yes' : 'no';
    if (elStart)    elStart.textContent    = js.last_start ? formatDate(js.last_start) : '—';
    if (elEnd)      elEnd.textContent      = js.last_end   ? formatDate(js.last_end)   : '—';
    if (elCount)    elCount.textContent    = js.last_count ?? 0;
    if (elUpdated)  elUpdated.textContent  = js.last_updated ? formatDate(js.last_updated) : '—';

    if (js.bg_fetching) setStatus('fetching', 'Fetching live data…');
    if (js.logs) updateLogArea(js.logs);
  } catch (e) {
    console.log('[fetch-status] poll error:', e.message);
  }
}

// Update the sidebar fetch log area with an array of log lines
function updateLogArea(logs) {
  const el = document.getElementById('fetchLog');
  if (!el || !Array.isArray(logs)) return;
  // Keep last 200 lines, render safely
  const slice = logs.slice(-200);
  el.innerHTML = slice.map(l => `<div class="log-line">${esc(l)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// =============================================================================
// NAVIGATION SCROLL SPY
// =============================================================================
function setupScrollSpy() {
  const sections = document.querySelectorAll(".dash-section");
  const links    = document.querySelectorAll(".nav-link");
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove("active"));
        const a = document.querySelector(`.nav-link[data-section="${e.target.id}"]`);
        if (a) a.classList.add("active");
      }
    });
  }, { threshold: 0.25 });
  sections.forEach(s => obs.observe(s));
}

// =============================================================================
// REFRESH — triggers full data collection + re-renders everything
// =============================================================================
async function triggerRefresh() {
  console.log("[REFRESH] Starting refresh...");
  showSpinner("Connecting to live news sources…");
  setStatus("fetching", "Fetching…");

  const btn  = document.getElementById("refreshBtn");
  const icon = document.getElementById("refreshIcon");
  btn.classList.add("loading");
  icon.classList.add("spinning");

  try {
    // Step 1: fetch fresh data (starts background collection & returns cached data)
    console.log("[REFRESH] Calling /fetch-data...");
    updateSpinner("Initiating live data collection…");
    const fd = await apiFetch("/fetch-data");
    console.log("[REFRESH] /fetch-data response status:", fd.status);
    if (!fd.ok) throw new Error(`Server error: ${fd.status}`);
    const fdJson = await fd.json();
    console.log("[REFRESH] /fetch-data result:", fdJson);
    if (fdJson.error) throw new Error(fdJson.error);

    // Live data is fetching in background, show cached/initial data immediately
    console.log(`[REFRESH] Status: ${fdJson.status}, Records: ${fdJson.total_fetched}, Cached: ${fdJson.is_cached}`);

    const shouldFetchResults = fdJson.is_cached || fdJson.total_fetched > 0;
    let rdJson = null;
    if (shouldFetchResults) {
      // Step 2: get full analysis (will get updated data as background fetch completes)
      console.log("[REFRESH] Calling /results...");
      updateSpinner("Analyzing sentiment & topics…");
      const rd = await apiFetch("/results");
      console.log("[REFRESH] /results response status:", rd.status);
      if (!rd.ok) throw new Error(`Results error: ${rd.status}`);
      rdJson = await rd.json();
      console.log("[REFRESH] /results data:", rdJson);
      if (rdJson.error) throw new Error(rdJson.error);

      // Step 3: render charts + tables
      console.log("[REFRESH] Rendering dashboard...");
      updateSpinner("Rendering dashboard…");
      currentData = rdJson;
      renderDashboard(rdJson);

      // Step 4: load articles with comments
      console.log("[REFRESH] Loading articles...");
      updateSpinner("Loading articles…");
      await loadArticles();
      set("lastUpdated", formatDate(rdJson.last_updated));
      console.log("[REFRESH] Dashboard rendered successfully");
    } else {
      setStatus("fetching", "Live data fetch started — waiting for first results");
      toast("📡 Live fetch started. Dashboard will update when the first results arrive.", "info");
      console.log("[REFRESH] No cached data available yet; waiting for live fetch completion before rendering results.");
    }

    // Status
    if (fdJson.status === "fetching_live") {
      if (fdJson.is_cached || fdJson.total_fetched > 0) {
        setStatus("live", `Live data fetching… (currently ${fdJson.total_fetched} records)`);
        toast("📡 Live data fetching in background…", "info");
      } else {
        setStatus("fetching", "Live fetch started — waiting for first results");
      }
    } else if (fdJson.is_cached) {
      setStatus("cached", "Showing cached data");
      toast("⚠ Using cached data", "warning");
    } else {
      setStatus("live", `Live — ${fdJson.total_fetched} records`);
    }
    
    // Poll for updates every 3 seconds while live fetching is happening and we already have data to compare
    if (fdJson.status === "fetching_live" && (fdJson.is_cached || fdJson.total_fetched > 0)) {
      console.log("[REFRESH] Starting polling for live updates...");
      const pollInterval = setInterval(async () => {
        try {
          const rd2 = await apiFetch("/results");
          if (rd2.ok) {
            const rdJson2 = await rd2.json();
            if (rdJson2.sentiment && rdJson2.sentiment.total_articles > currentData.sentiment.total_articles) {
              console.log(`[REFRESH] Update detected! New count: ${rdJson2.sentiment.total_articles}`);
              currentData = rdJson2;
              renderDashboard(rdJson2);
              
              // Get updated articles
              await loadArticles();
              
              // Update status
              const total = rdJson2.sentiment.total_articles;
              setStatus("live", `Live — ${total} records (updating…)`);
              toast(`📈 Updated: ${total} records now available`, "success");
            }
          }
        } catch (e) {
          console.log("[REFRESH] Poll error (silent):", e.message);
        }
      }, 3000);
      
      // Stop polling after 2 minutes
      setTimeout(() => {
        console.log("[REFRESH] Stopping poll");
        clearInterval(pollInterval);
      }, 120000);
    }

  } catch (err) {
    console.error("[Refresh] ERROR:", err);
    setStatus("error", `Error: ${err.message}`);
    toast("⚠ " + err.message, "error");
  } finally {
    console.log("[REFRESH] Cleanup - hiding spinner");
    hideSpinner();
    btn.classList.remove("loading");
    icon.classList.remove("spinning");
  }
}

// =============================================================================
// RENDER DASHBOARD (charts + tables)
// =============================================================================
function renderDashboard(data) {
  try {
    console.log("[renderDashboard] Called with data:", data);
    const s = data.sentiment      || {};
    const t = data.topics         || [];
    const c = data.collection_table || [];
    
    console.log("[renderDashboard] Sentiment overall:", s.overall);
    console.log("[renderDashboard] Topics count:", t.length);
    console.log("[renderDashboard] Collection table count:", c.length);
    
    renderKPIs(s);
    renderCollectionTable(c);
    renderTopics(t);
    renderPlatformBar(s.platform_stats  || []);
    renderPieChart(s.overall           || {});
    renderStackedBar(s.platform_stats  || []);
    renderCategoryChart(s.category_stats || []);
    renderThemeCards(s.category_stats   || []);
    renderPlatformGrid(s.platform_stats  || []);
    renderRadarChart(s.platform_stats    || []);
    set("articleCount",
      `${s.total_articles || 0} records · ${c.length} sources`);
    console.log("[renderDashboard] Complete");
  } catch (err) {
    console.error("[renderDashboard]", err);
    toast("Chart render error: " + err.message, "error");
  }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(s) {
  console.log("[renderKPIs] Called with sentiment:", s);
  const ov = s.overall || {};
  console.log("[renderKPIs] Overall data:", ov);
  
  set("kpiTotal",   s.total_articles || 0);
  set("kpiSources", `from ${(s.platform_stats||[]).length} sources`);
  set("kpiPos",     ov.positive || 0);  set("kpiPosPct", `${ov.pos_pct||0}%`);
  set("kpiNeu",     ov.neutral  || 0);  set("kpiNeuPct", `${ov.neu_pct||0}%`);
  set("kpiNeg",     ov.negative || 0);  set("kpiNegPct", `${ov.neg_pct||0}%`);
  
  console.log("[renderKPIs] Set KPI values - Total:", s.total_articles, "Pos:", ov.positive, "Neu:", ov.neutral, "Neg:", ov.negative);
}

// ── Collection Table ──────────────────────────────────────────────────────────
function renderCollectionTable(rows) {
  const tb = document.getElementById("tableBody");
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="6" class="table-empty">No data collected</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${esc(r.outlet)}</strong></td>
      <td><span class="count-badge">${r.count}</span></td>
      <td>${esc(r.earliest)}</td>
      <td>${esc(r.latest)}</td>
      <td><span class="method-tag">${esc(r.methods)}</span></td>
      <td style="font-size:10.5px;color:var(--txt3);font-family:'JetBrains Mono',monospace">${esc(r.keywords)}</td>
    </tr>`).join("");
}

// ── Topics ────────────────────────────────────────────────────────────────────
function renderTopics(topics) {
  const list = document.getElementById("topicsList");
  if (!topics.length) { list.innerHTML=`<div class="placeholder-msg">No topics</div>`; return; }

  list.innerHTML = topics.map((t,i) => `
    <div class="topic-card" style="border-left-color:${TOPIC_COLS[i%TOPIC_COLS.length]}">
      <div class="topic-header">
        <span class="topic-label">
          <span style="color:${TOPIC_COLS[i%TOPIC_COLS.length]};margin-right:6px">T${t.id+1}</span>
          ${esc(t.label)}
        </span>
        <span class="topic-weight">${t.weight}%</span>
      </div>
      <div class="topic-keywords">
        ${t.keywords.map(k=>`<span class="kw-chip">${esc(k)}</span>`).join("")}
      </div>
    </div>`).join("");

  buildChart("topicChart","bar",{
    labels: topics.map(t=>`T${t.id+1}: ${t.label}`),
    datasets:[{ label:"Weight (%)", data:topics.map(t=>t.weight),
      backgroundColor: topics.map((_,i)=>TOPIC_COLS[i%TOPIC_COLS.length]+"bb"),
      borderColor:     topics.map((_,i)=>TOPIC_COLS[i%TOPIC_COLS.length]),
      borderWidth:1, borderRadius:4 }]
  },{
    indexAxis:"y", responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false} },
    scales:{
      x:{ grid:{color:C.grid}, ticks:{callback:v=>v+"%"} },
      y:{ grid:{display:false}, ticks:{font:{size:11}} }
    }
  });
}

// ── Platform Bar ──────────────────────────────────────────────────────────────
function renderPlatformBar(stats) {
  if (!stats.length) return;
  const top    = stats.slice(0,14);
  const labels = top.map(s=>shorten(s.platform));
  const vals   = top.map(s=>s.avg_compound);
  buildChart("platformBarChart","bar",{
    labels,
    datasets:[{ label:"Avg Compound", data:vals,
      backgroundColor: vals.map(v=>v>=0.05?C.pos+"bb":v<=-0.05?C.neg+"bb":C.neu+"bb"),
      borderColor:     vals.map(v=>v>=0.05?C.pos       :v<=-0.05?C.neg       :C.neu),
      borderWidth:1, borderRadius:4 }]
  },{
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false} },
    scales:{
      y:{ grid:{color:C.grid}, min:-1, max:1, ticks:{callback:v=>v.toFixed(2)} },
      x:{ grid:{display:false}, ticks:{font:{size:10}, maxRotation:45} }
    }
  });
}

// ── Pie Chart ─────────────────────────────────────────────────────────────────
function renderPieChart(ov) {
  const {positive=0, neutral=0, negative=0} = ov;
  buildChart("pieChart","doughnut",{
    labels:["Positive","Neutral","Negative"],
    datasets:[{
      data:[positive,neutral,negative],
      backgroundColor:[C.pos+"bb",C.neu+"bb",C.neg+"bb"],
      borderColor:[C.pos,C.neu,C.neg],
      borderWidth:2, hoverOffset:6
    }]
  },{
    responsive:true, maintainAspectRatio:false, cutout:"65%",
    plugins:{
      legend:{display:false},
      tooltip:{callbacks:{
        label: ctx => {
          const total = ctx.dataset.data.reduce((a,b)=>a+b,0)||1;
          return ` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/total*100).toFixed(1)}%)`;
        }
      }}
    }
  });
  // Custom legend
  document.getElementById("pieLegend").innerHTML =
    [["Positive",C.pos,positive],["Neutral",C.neu,neutral],["Negative",C.neg,negative]]
    .map(([l,c,v])=>`<div class="pie-legend-item">
      <div class="pie-dot" style="background:${c}"></div><span>${l} (${v})</span>
    </div>`).join("");
}

// ── Stacked Bar ───────────────────────────────────────────────────────────────
function renderStackedBar(stats) {
  if (!stats.length) return;
  const top = stats.slice(0,12);
  buildChart("stackedBar","bar",{
    labels: top.map(s=>shorten(s.platform)),
    datasets:[
      {label:"Positive", data:top.map(s=>s.positive), backgroundColor:C.pos+"aa", borderRadius:2},
      {label:"Neutral",  data:top.map(s=>s.neutral),  backgroundColor:C.neu+"aa", borderRadius:2},
      {label:"Negative", data:top.map(s=>s.negative), backgroundColor:C.neg+"aa", borderRadius:2},
    ]
  },{
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:"#7a8899"}} },
    scales:{
      x:{ stacked:true, grid:{display:false}, ticks:{font:{size:10},maxRotation:45} },
      y:{ stacked:true, grid:{color:C.grid} }
    }
  });
}

// ── Category Chart ────────────────────────────────────────────────────────────
function renderCategoryChart(stats) {
  if (!stats.length) return;
  const vals = stats.map(s=>s.avg_compound);
  buildChart("categoryChart","bar",{
    labels: stats.map(s=>s.category),
    datasets:[{ label:"Avg Compound", data:vals,
      backgroundColor: vals.map(v=>v>=0.05?C.pos+"bb":v<=-0.05?C.neg+"bb":C.neu+"bb"),
      borderColor:     vals.map(v=>v>=0.05?C.pos       :v<=-0.05?C.neg       :C.neu),
      borderWidth:1, borderRadius:5 }]
  },{
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false} },
    scales:{
      y:{ grid:{color:C.grid}, min:-1, max:1, ticks:{callback:v=>v.toFixed(2)} },
      x:{ grid:{display:false}, ticks:{font:{size:11}} }
    }
  });
}

// ── Theme Cards ───────────────────────────────────────────────────────────────
function renderThemeCards(stats) {
  const el = document.getElementById("themeCards");
  if (!stats.length) { el.innerHTML=`<div class="placeholder-msg">No data</div>`; return; }
  el.innerHTML = stats.map(s => {
    const cls = s.avg_compound >= 0.05 ? "pos" : s.avg_compound <= -0.05 ? "neg" : "neu";
    const tot = (s.positive+s.neutral+s.negative)||1;
    return `<div class="theme-card">
      <div class="theme-name">${esc(s.category)}</div>
      <div class="theme-score ${cls}">${s.avg_compound.toFixed(3)}</div>
      <div class="theme-bars">
        <div class="bar-pos" style="flex:${s.positive}"></div>
        <div class="bar-neu" style="flex:${s.neutral}"></div>
        <div class="bar-neg" style="flex:${s.negative}"></div>
      </div>
      <div class="theme-count">${s.count} articles</div>
    </div>`;
  }).join("");
}

// ── Platform Grid ─────────────────────────────────────────────────────────────
function renderPlatformGrid(stats) {
  const el = document.getElementById("platformGrid");
  if (!stats.length) { el.innerHTML=`<div class="placeholder-msg">No data</div>`; return; }
  el.innerHTML = stats.slice(0,20).map(s => {
    const col = s.avg_compound>=0.05?C.pos:s.avg_compound<=-0.05?C.neg:C.neu;
    return `<div class="platform-card">
      <div class="platform-name" title="${esc(s.platform)}">${esc(s.platform)}</div>
      <div class="platform-count">${s.count} records</div>
      <div class="platform-score" style="color:${col}">${s.avg_compound.toFixed(3)}</div>
      <div class="platform-dist">
        <div class="bar-pos" style="flex:${s.positive}"></div>
        <div class="bar-neu" style="flex:${s.neutral}"></div>
        <div class="bar-neg" style="flex:${s.negative}"></div>
      </div>
      <div class="platform-pcts">
        <span class="pct-pos">+${s.pos_pct}%</span>
        <span class="pct-neu">${s.neu_pct}%</span>
        <span class="pct-neg">-${s.neg_pct}%</span>
      </div>
    </div>`;
  }).join("");
}

// ── Radar Chart ───────────────────────────────────────────────────────────────
function renderRadarChart(stats) {
  if (stats.length < 3) return;
  const top = stats.slice(0,8);
  buildChart("radarChart","radar",{
    labels: top.map(s=>shorten(s.platform)),
    datasets:[
      { label:"Avg Compound", data:top.map(s=>s.avg_compound),
        borderColor:C.acc, backgroundColor:C.acc+"22",
        pointBackgroundColor:C.acc, pointRadius:4, borderWidth:2 },
      { label:"% Positive",  data:top.map(s=>s.pos_pct/100),
        borderColor:C.pos, backgroundColor:C.pos+"11",
        pointBackgroundColor:C.pos, pointRadius:3, borderWidth:1.5 },
      { label:"% Negative",  data:top.map(s=>-s.neg_pct/100),
        borderColor:C.neg, backgroundColor:C.neg+"11",
        pointBackgroundColor:C.neg, pointRadius:3, borderWidth:1.5 },
    ]
  },{
    responsive:true, maintainAspectRatio:false,
    scales:{ r:{
      min:-1, max:1, grid:{color:C.grid},
      pointLabels:{color:"#7a8899",font:{size:11}},
      ticks:{display:false}, angleLines:{color:C.grid}
    }},
    plugins:{ legend:{labels:{color:"#7a8899"}} }
  });
}

// =============================================================================
// ARTICLES WITH COMMENTS
// =============================================================================

async function loadArticles() {
  try {
    const resp = await apiFetch("/articles?limit=300");
    if (!resp.ok) throw new Error(`/articles ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    allArticles  = data;
    filteredArts = [...allArticles];

    populateArticleFilters();
    displayedCount = 0;
    renderArticleGrid(true);

  } catch (err) {
    console.error("[loadArticles]", err);
    document.getElementById("artGrid").innerHTML =
      `<div class="placeholder-card">
        <div class="placeholder-icon">⚠</div>
        <div>Could not load articles: ${esc(err.message)}</div>
      </div>`;
  }
}

function populateArticleFilters() {
  // Sources
  const srcSel = document.getElementById("artSource");
  // clear existing dynamic options (keep first default)
  while (srcSel.options.length > 1) srcSel.remove(1);
  const sources = [...new Set(allArticles.map(a=>a.source || ""))].filter(Boolean).sort();
  sources.forEach(s => {
    const o = document.createElement("option"); o.value = s; o.text = s; srcSel.add(o);
  });

  // Categories
  const catSel = document.getElementById("artCategory");
  while (catSel.options.length > 1) catSel.remove(1);
  const cats = [...new Set(allArticles.map(a=>a.category || ""))].filter(Boolean).sort();
  cats.forEach(c => { const o = document.createElement("option"); o.value = c; o.text = c; catSel.add(o); });
}

function filterArticles() {
  const q   = (document.getElementById("artSearch")?.value   || "").toLowerCase();
  const src = (document.getElementById("artSource")?.value   || "");
  const sen = (document.getElementById("artSentiment")?.value|| "");
  const cat = (document.getElementById("artCategory")?.value || "");

  filteredArts = allArticles.filter(a => {
    if (src && String(a.source||"").trim() !== String(src).trim()) return false;
    if (sen && String(a.sentiment||"").trim() !== String(sen).trim()) return false;
    if (cat && String(a.category||"").trim() !== String(cat).trim()) return false;
    if (q && !String(a.title||"").toLowerCase().includes(q)
          && !String(a.text||"").toLowerCase().includes(q)) return false;
    return true;
  });

  displayedCount = 0;
  renderArticleGrid(true);
}

function renderArticleGrid(reset = false) {
  const grid = document.getElementById("artGrid");
  const btn  = document.getElementById("loadMoreBtn");
  set("artCount", `${filteredArts.length} articles`);

  if (filteredArts.length === 0) {
    grid.innerHTML = `<div class="placeholder-card">
      <div class="placeholder-icon">🔍</div>
      <div>No articles match your filters</div>
    </div>`;
    btn.style.display = "none";
    return;
  }

  const page = filteredArts.slice(displayedCount, displayedCount + PAGE_SIZE);
  const html = page.map(a => buildArticleCard(a)).join("");

  if (reset) {
    grid.innerHTML = html;
  } else {
    grid.insertAdjacentHTML("beforeend", html);
  }

  displayedCount += page.length;
  btn.style.display = displayedCount < filteredArts.length ? "inline-block" : "none";
}

function loadMoreArticles() {
  renderArticleGrid(false);
}

function buildArticleCard(a) {
  const cls     = a.sentiment.toLowerCase();
  const badgeCls= `badge-${cls}`;
  const scoreCls= a.compound >= 0.05 ? "pos" : a.compound <= -0.05 ? "neg" : "neu";
  const preview = (a.text || "").slice(0, 160);
  const dateStr = (a.date || "").slice(0, 10);
  const hasComments = a.comment_count > 0;

  return `
  <div class="art-card" onclick="openArticleModal('${esc(a.id)}')">
    <div class="art-card-head">
      <span class="art-card-source">${esc(a.source)}</span>
      <span class="art-card-badge ${badgeCls}">${esc(a.sentiment)}</span>
    </div>
    <div class="art-card-title">${esc(a.title || "Untitled")}</div>
    ${preview ? `<div class="art-card-preview">${esc(preview)}</div>` : ""}
    <div class="art-card-foot">
      <div class="art-card-meta">
        <span>${dateStr || "—"}</span>
        <span>${esc(a.category)}</span>
        ${hasComments ? `<span class="art-comment-count">💬 ${a.comment_count}</span>` : ""}
      </div>
      <span class="art-card-score ${scoreCls}">
        ${a.compound >= 0 ? "+" : ""}${a.compound.toFixed(3)}
      </span>
    </div>
  </div>`;
}

// =============================================================================
// ARTICLE DETAIL MODAL
// =============================================================================

function openArticleModal(articleId) {
  const art = allArticles.find(a => a.id === articleId);
  if (!art) return;

  // Header
  set("modalSource", art.source);
  set("modalTitle",  art.title || "Untitled");

  // Meta
  set("modalDate",     `📅 ${(art.date || "—").slice(0,19)}`);
  set("modalMethod",   `🔧 ${art.method || "—"}`);
  set("modalCategory", `🏷 ${art.category || "—"}`);

  const linkEl = document.getElementById("modalLink");
  if (art.url) {
    linkEl.href = art.url;
    linkEl.style.display = "flex";
  } else {
    linkEl.style.display = "none";
  }

  // Scores
  const scoreCls = art.compound >= 0.05 ? "pos" : art.compound <= -0.05 ? "neg" : "neu";
  const scoreEl  = document.getElementById("modalCompound");
  scoreEl.textContent = `${art.compound >= 0 ? "+" : ""}${art.compound.toFixed(4)}`;
  scoreEl.style.color = art.compound >= 0.05 ? "var(--pos)"
                       : art.compound <= -0.05 ? "var(--neg)" : "var(--neu)";
  set("modalPos", `${(art.pos * 100).toFixed(1)}%`);
  set("modalNeu", `${(art.neu * 100).toFixed(1)}%`);
  set("modalNeg", `${(art.neg * 100).toFixed(1)}%`);

  // Article body
  set("modalBodyText", art.text || "No content available.");

  // Sentiment badge on header
  set("modalCompound", `${art.compound >= 0 ? "+" : ""}${art.compound.toFixed(4)} (${art.sentiment})`);

  // Comments
  const comments   = art.comments || [];
  const countLabel = `COMMENTS (${comments.length}${art.comment_count > 50 ? "+" : ""})`;
  set("commentsLabel", countLabel);

  const commentsList = document.getElementById("commentsList");
  if (comments.length === 0) {
    commentsList.innerHTML = `<div class="no-comments">
      No comments collected for this article.<br>
      <small>Comments are available for Reddit posts and YouTube videos when API keys are configured.</small>
    </div>`;
  } else {
    commentsList.innerHTML = comments.map(c => {
      const cls  = c.compound >= 0.05 ? "pos" : c.compound <= -0.05 ? "neg" : "neu";
      const col  = c.compound >= 0.05 ? "var(--pos)" : c.compound <= -0.05 ? "var(--neg)" : "var(--neu)";
      const date = (c.date || "").slice(0, 10);
      return `
      <div class="comment-item ${cls}">
        <div class="comment-head">
          <span class="comment-meta">${esc(c.source)} · ${date}</span>
          <span class="comment-score" style="color:${col}">
            ${c.compound >= 0 ? "+" : ""}${c.compound.toFixed(3)}
            <span class="sentiment-badge ${cls.charAt(0)}">${esc(c.sentiment)}</span>
          </span>
        </div>
        <div class="comment-body">${esc(c.text)}</div>
        ${c.url ? `<a class="comment-link" href="${esc(c.url)}" target="_blank" rel="noopener">
          🔗 View original comment ↗
        </a>` : ""}
      </div>`;
    }).join("");
  }

  // Open modal
  document.getElementById("articleModal").classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("articleModal").classList.remove("active");
  document.body.style.overflow = "";
}

// Close on Escape key
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// =============================================================================
// EXCEL DOWNLOAD
// =============================================================================
function downloadExcel() {
  toast("⏳ Generating Excel workbook…", "info");
  // Use a temp link to avoid blocking the page
  const a = document.createElement("a");
  a.href  = "/export-excel";
  a.click();
  setTimeout(() => toast("✅ Excel download started!", "success"), 800);
}

// =============================================================================
// AUTO-REFRESH
// =============================================================================
function toggleAutoRefresh() {
  const on = document.getElementById("autoRefresh").checked;
  if (on) {
    autoTimer = setInterval(triggerRefresh, 60_000);
    toast("Auto-refresh ON — updates every 60 seconds", "info");
  } else {
    clearInterval(autoTimer);
    autoTimer = null;
    toast("Auto-refresh OFF", "info");
  }
}

// =============================================================================
// CHART BUILDER  —  destroy old instance then create fresh
// =============================================================================
function buildChart(id, type, data, options) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  charts[id] = new Chart(canvas.getContext("2d"), {
    type, data,
    options: {
      ...options,
      animation: { duration: 550, easing: "easeInOutQuart" },
    }
  });
}

// =============================================================================
// UTILITIES
// =============================================================================

function apiFetch(endpoint) {
  return fetch(endpoint, { cache: "no-store" });
}

function showSpinner(msg) {
  updateSpinner(msg);
  document.getElementById("spinnerOverlay").classList.add("active");
}
function hideSpinner() {
  document.getElementById("spinnerOverlay").classList.remove("active");
}
function updateSpinner(msg) {
  const el = document.getElementById("spinnerText");
  if (el) el.textContent = msg;
}

function setStatus(state, text) {
  document.getElementById("statusDot").className = `status-dot ${state}`;
  set("statusText", text);
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day:"2-digit", month:"short", year:"numeric",
      hour:"2-digit", minute:"2-digit", hour12:false
    });
  } catch { return iso; }
}

function shorten(name) {
  return (name || "")
    .replace("Reddit/r/","r/")
    .replace("YouTube/","YT/")
    .replace(" (comment)","†")
    .slice(0, 22);
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val ?? "");
}

function toast(msg, type = "info") {
  const el  = document.createElement("div");
  el.className = "toast";
  const bg  = type === "error"   ? "#ef4444"
             : type === "warning" ? "#f59e0b"
             : type === "success" ? "#22c55e"
             : "#3b82f6";
  // Choose foreground based on theme for readability
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const fg  = type === "warning" ? (isLight ? "#1f2937" : "#1f2937") : (isLight ? "#0f1724" : "#fff");
  Object.assign(el.style, {
    background: bg, color: fg,
    bottom: `${22 + document.querySelectorAll(".toast").length * 52}px`
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; }, 3500);
  setTimeout(() => el.remove(), 4000);
}
