// ═══════════════════════════════════════════════════════════════
// AI Stock Signal — dashboard logic
// ═══════════════════════════════════════════════════════════════
const SIG_CLASS = { "STRONG BUY": "s-strong", "BUY": "s-buy", "WATCH": "s-watch", "AVOID": "s-avoid" };
const scoreColor = (s) => (s >= 75 ? "#00e676" : s >= 60 ? "#00c853" : s >= 45 ? "#ffc24b" : "#ff5a5a");

let ALL = [];
let UNIVERSE = [];
let universeLoaded = false;
let BT = {};
let META = {}; // account size, risk %
let activeFilter = "ALL";
let searchTerm = "";
let sortBy = "score";
let gid = 0; // unique gradient ids
let lastGenerated = null;       // เช็คว่าข้อมูลเปลี่ยนไหมตอนดึงไฟล์ล่าสุดด้วยตัวเอง
let currentMarket = "all";      // หมวดที่กำลังดู (all = ทุกตลาด, th = ไทย, us = ต่างประเทศ)
const MARKET_FILES = { th: "signals.json", us: "signals_foreign.json" };
const WORKFLOW_URL = "https://github.com/Narenritl05/ai-stock-signal/actions/workflows/analyze.yml";
const JOURNAL_KEY = "ai_stock_signal_journal_v1";
const DIME_DUP_PREFIX = "dime:";
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
let tesseractLoadPromise = null;

// ── data loading ──
async function load(isRefresh = false) {
  try {
    const data = currentMarket === "all" ? await loadAllMarkets() : await loadMarket(currentMarket);
    // ตอน auto-refresh: ถ้าข้อมูลยังไม่เปลี่ยน ไม่ต้อง re-render (กันกระพริบ)
    const stamp = data.generated_at + "|" + currentMarket + "|" + data.count;
    if (!isRefresh || stamp !== lastGenerated) {
      lastGenerated = stamp;
      renderSignals(data);
      if (isRefresh) flashLive();
    }
  } catch (e) {
    if (!isRefresh) {
      document.getElementById("updated").textContent = "โหลดข้อมูลไม่สำเร็จ";
      document.getElementById("cards").innerHTML =
        `<div class="empty">ยังไม่มีข้อมูล — รัน <code>python run.py</code> หรือกด Run workflow บน GitHub Actions<br><small>(${e.message})</small></div>`;
    }
  }
  loadBacktest();
  loadPerformance();
  renderJournal();
  loadStatus();
  loadUniverse().then(() => {
    if (searchTerm) drawCards();
  });
}

async function loadMarket(key) {
  const res = await fetch("data/" + MARKET_FILES[key] + "?_=" + Date.now());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

async function loadAllMarkets() {
  const loaded = await Promise.allSettled(Object.keys(MARKET_FILES).map(loadMarket));
  const payloads = loaded.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!payloads.length) {
    throw new Error("No market data available");
  }
  const signals = payloads.flatMap((p) => p.signals || []);
  const summary = {
    strong_buy: signals.filter((s) => s.signal === "STRONG BUY").length,
    buy: signals.filter((s) => s.signal === "BUY").length,
    watch: signals.filter((s) => s.signal === "WATCH").length,
    avoid: signals.filter((s) => s.signal === "AVOID").length,
  };
  signals.sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    generated_at: payloads.map((p) => p.generated_at).filter(Boolean).sort().slice(-1)[0] || "-",
    generated_at_iso: payloads.map((p) => p.generated_at_iso).filter(Boolean).sort().slice(-1)[0] || "",
    market_key: "all",
    market_name: "ทุกตลาด",
    currency: "",
    count: signals.length,
    summary,
    regimes: payloads.map((p) => ({ market_name: p.market_name, market_key: p.market_key, regime: p.regime })).filter((x) => x.regime),
    account_size: payloads[0]?.account_size,
    risk_per_trade_pct: payloads[0]?.risk_per_trade_pct,
    fetch_fail_ratio: Math.max(0, ...payloads.map((p) => p.fetch_fail_ratio || 0)),
    signals,
  };
}

async function loadUniverse() {
  if (universeLoaded) return;
  try {
    const res = await fetch("data/universe.json?_=" + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    UNIVERSE = data.stocks || [];
    universeLoaded = true;
  } catch (e) { /* ค้นหาจากสัญญาณล่าสุดต่อได้ แม้ยังไม่มี universe.json */ }
}

function matchStock(x, q) {
  if (!q) return true;
  return String(x.name || "").toLowerCase().includes(q) ||
    String(x.ticker || "").toLowerCase().includes(q) ||
    String(x.display_ticker || "").toLowerCase().includes(q) ||
    String(x.market || "").toLowerCase().includes(q) ||
    String(x.market_tag || "").toLowerCase().includes(q);
}

function flashLive() {
  const b = document.getElementById("live-badge");
  if (!b) return;
  b.classList.add("flash");
  setTimeout(() => b.classList.remove("flash"), 1200);
}

function refreshLatestData() {
  lastGenerated = null;
  document.getElementById("updated").textContent = "กำลังดึงข้อมูลล่าสุด...";
  load(false);
  flashLive();
}

function getRisk() {
  return {
    account: Number(META.account) || 100000,
    risk: Number(META.risk) || 2,
  };
}

async function loadPerformance() {
  try {
    const res = await fetch("data/performance.json?_=" + Date.now());
    if (!res.ok) return;
    renderPerformance(await res.json());
  } catch (e) { /* ยังไม่มีผลจริง ก็ข้ามไป */ }
}

async function loadBacktest() {
  try {
    const res = await fetch("data/backtest.json?_=" + Date.now());
    if (!res.ok) return;
    renderBacktest(await res.json());
  } catch (e) { /* ไม่มี backtest ก็ข้ามไป */ }
}

async function loadStatus() {
  try {
    const res = await fetch("data/status.json?_=" + Date.now());
    if (!res.ok) return;
    renderStatus(await res.json());
  } catch (e) { /* ไม่มี status ก็ข้ามไป */ }
}

// ── render: signals ──
function renderSignals(data) {
  ALL = data.signals || [];
  META = { account: data.account_size, risk: data.risk_per_trade_pct, currency: data.currency || "฿" };
  document.getElementById("updated").textContent = `อัปเดต: ${data.generated_at || "-"} · ${ALL.length} ตัว`;
  renderRegime(data.regime, data);
  const s = data.summary || {};
  countUp("s-strong", s.strong_buy ?? 0);
  countUp("s-buy", s.buy ?? 0);
  countUp("s-watch", s.watch ?? 0);
  countUp("s-avoid", s.avoid ?? 0);
  drawCards();
}

function drawCards() {
  const q = searchTerm.toLowerCase();
  let list = ALL.filter((x) =>
    (activeFilter === "ALL" || x.signal === activeFilter) &&
    matchStock(x, q));

  if (q && activeFilter === "ALL" && UNIVERSE.length) {
    const seen = new Set(list.map((x) => x.ticker));
    const extras = UNIVERSE
      .filter((x) => (currentMarket === "all" || x.market_key === currentMarket) && !seen.has(x.ticker) && matchStock(x, q))
      .slice(0, 40)
      .map((x) => ({ ...x, is_universe: true, signal: "WATCHLIST", score: -1, change_pct: 0 }));
    list = list.concat(extras);
  }

  list.sort((a, b) => {
    if (a.is_universe !== b.is_universe) return a.is_universe ? 1 : -1;
    if (sortBy === "change") return (b.change_pct || 0) - (a.change_pct || 0);
    if (sortBy === "name") return String(a.name || "").localeCompare(String(b.name || ""), "th");
    return (b.score || 0) - (a.score || 0);
  });

  document.getElementById("empty").classList.toggle("hidden", list.length > 0);
  const wrap = document.getElementById("cards");
  wrap.classList.remove("cards-refresh");
  void wrap.offsetWidth;
  wrap.classList.add("cards-refresh");
  wrap.innerHTML = list.map((x, i) => cardHTML(x, i)).join("");
}

function cardHTML(x, i) {
  if (x.is_universe) return universeCardHTML(x, i);
  const cls = SIG_CLASS[x.signal] || "s-watch";
  const up = x.change_pct >= 0;
  const cur = x.currency || META.currency || "";
  return `
  <div class="card ${cls}" data-ticker="${x.ticker}" style="animation-delay:${Math.min(i * 35, 400)}ms">
    <div class="card-top">
      <div><div class="name">${x.name}</div><div class="ticker">${x.ticker}${x.market ? " · " + x.market : ""}</div></div>
      <span class="badge ${cls}">${x.signal}</span>
    </div>
    <div class="card-mid">
      <div class="price-block">
        <span class="price">${cur}${fmt(x.price)}</span>
        <span class="change ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(x.change_pct).toFixed(2)}%</span>
      </div>
      <div class="spark">${sparkline(x.history, 124, 42)}</div>
    </div>
    <div class="gauge-row">
      ${gauge(x.score, 58)}
      <div class="mini-metrics">
        <div class="mm"><div class="mm-l">RSI</div><div class="mm-v">${x.rsi}</div></div>
        <div class="mm"><div class="mm-l">เทรนด์</div><div class="mm-v">${trendIcon(x.trend)}</div></div>
        <div class="mm"><div class="mm-l">วอลุ่ม</div><div class="mm-v">${x.volume_ratio}x</div></div>
      </div>
    </div>
    ${recStrip(x)}
    ${moreButtonHTML()}
  </div>`;
}

function universeCardHTML(x, i) {
  const ticker = x.display_ticker || x.ticker;
  return `
  <div class="card s-watch" data-ticker="${x.ticker}" data-universe="1" style="animation-delay:${Math.min(i * 35, 400)}ms">
    <div class="card-top">
      <div><div class="name">${x.name}</div><div class="ticker">${ticker}${x.market ? " · " + x.market : ""}</div></div>
      <span class="badge s-watch">WATCHLIST</span>
    </div>
    <div class="card-mid">
      <div class="price-block">
        <span class="price">รอข้อมูลล่าสุด</span>
        <span class="change up">อยู่ในรายการค้นหา</span>
      </div>
    </div>
    <div class="rec rec-hold"><span class="rec-label">Telegram</span><span class="rec-action">/stock ${ticker}</span></div>
    ${moreButtonHTML()}
  </div>`;
}

function moreButtonHTML() {
  return `<button class="card-more" type="button">
    <span>เพิ่มเติม</span><small>ข้อมูล + ข่าวล่าสุด</small>
  </button>`;
}

// ── คำแนะนำ: ควรซื้อ / ถือ-รอ / ควรขาย / เลี่ยง ──
function recommend(signal, trend) {
  if (signal === "STRONG BUY") return { action: "ควรซื้อ", text: "🟢 ควรซื้อ — สัญญาณแข็งแรงมาก", tone: "buy" };
  if (signal === "BUY") return { action: "ควรซื้อ", text: "🟢 ควรซื้อ — สัญญาณเทคนิคเป็นบวก", tone: "buy" };
  if (signal === "WATCH") return { action: "ถือ/รอ", text: "🟡 ถือ/รอจังหวะ — สัญญาณยังไม่ชัด", tone: "hold" };
  if (trend === "DOWN") return { action: "ควรขาย/เลี่ยง", text: "🔴 ควรเลี่ยง — แนวโน้มขาลง (ถ้าถืออยู่ ควรพิจารณาขาย)", tone: "sell" };
  return { action: "เลี่ยง", text: "🔴 ยังไม่น่าสนใจ — เลี่ยงไปก่อน", tone: "avoid" };
}
function recOf(x) {
  return x.rec_text ? { action: x.rec_action, text: x.rec_text, tone: x.rec_tone } : recommend(x.signal, x.trend);
}
function recStrip(x) {
  const r = recOf(x);
  const h = holdingOf(x);
  return `<div class="rec rec-${r.tone}"><span class="rec-label">คำแนะนำ</span><span class="rec-action">${r.action}</span></div>
    <div class="hold-strip hold-${h.tone}"><span>${h.label}</span><b>${h.period}</b></div>`;
}

function holdingOf(x) {
  if (x.holding_label) {
    return {
      label: x.holding_label,
      period: x.holding_period || "-",
      text: x.holding_text || "",
      reason: x.holding_reason || "",
      tone: x.holding_tone || "wait",
    };
  }
  if (x.signal === "STRONG BUY" || x.signal === "BUY") {
    const hot = (x.momentum_5d ?? 0) >= 5 || (x.volume_ratio ?? 0) >= 1.8 || (x.rsi ?? 50) >= 70;
    if (hot) return { label: "ถือสั้น", period: "3-10 วันทำการ", text: "เหมาะเก็งกำไรระยะสั้น ใช้เป้า 1 และ stop loss เคร่งครัด", reason: "โมเมนตัม/วอลุ่มแรง หรือ RSI เริ่มร้อน", tone: "short" };
    return { label: "ถือยาว", period: "2-8 สัปดาห์", text: "เหมาะถือยาวกว่าเดิมตามเทรนด์", reason: "แนวโน้มหลักยังเป็นบวกและโมเมนตัมไม่ร้อนเกินไป", tone: "long" };
  }
  if (x.signal === "WATCH") return { label: "รอดู", period: "รอสัญญาณยืนยัน", text: "ยังไม่เหมาะเลือกกรอบถือ", reason: "สัญญาณยังไม่ผ่านเกณฑ์ซื้อ", tone: "wait" };
  return { label: "ไม่ควรถือ", period: "หลีกเลี่ยง/ลดสถานะ", text: "ไม่เหมาะถือทั้งสั้นและยาว", reason: "คะแนนหรือเทรนด์ยังอ่อน", tone: "avoid" };
}

// ── SVG: sparkline area chart ──
function sparkline(values, w = 120, h = 36, forceColor) {
  if (!values || values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 4 - ((v - min) / range) * (h - 8),
  ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = forceColor || (up ? "#00e676" : "#ff5a5a");
  const id = "sg" + (gid++);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}

// ── SVG: circular score gauge ──
function gauge(score, size = 56) {
  const sw = 5, r = size / 2 - sw, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  const col = scoreColor(score);
  return `<svg class="gauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${sw}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="Inter, sans-serif" font-weight="800" font-size="${size * 0.3}" fill="${col}">${score}</text>
  </svg>`;
}

function trendIcon(t) {
  return { "UP": "📈", "UP-WEAK": "↗", "DOWN": "📉", "SIDEWAYS": "→" }[t] || "→";
}
function fmt(n) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt0(n) {
  return Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtSignedMoney(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? "+" : "-"}฿${fmt(Math.abs(v))}`;
}

// ── count-up animation ──
function countUp(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now(), dur = 700, from = 0;
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── render: backtest ──
function renderBacktest(data) {
  (data.results || []).forEach((r) => (BT[r.ticker] = r));
  const o = data.overall || {};
  document.getElementById("bt-overview").innerHTML = `
    <div class="bt-stat"><div class="v">${o.stocks_tested ?? 0}</div><div class="l">หุ้นที่ทดสอบ</div></div>
    <div class="bt-stat"><div class="v">${o.total_trades ?? 0}</div><div class="l">เทรดทั้งหมด</div></div>
    <div class="bt-stat"><div class="v ${(o.overall_win_rate ?? 0) >= 50 ? "good" : "bad"}">${o.overall_win_rate ?? 0}%</div><div class="l">อัตราชนะรวม</div></div>
    <div class="bt-stat"><div class="v ${(o.avg_return_per_trade ?? 0) >= 0 ? "good" : "bad"}">${o.avg_return_per_trade ?? 0}%</div><div class="l">กำไรเฉลี่ย/เทรด</div></div>`;
  document.getElementById("bt-config").textContent =
    `ช่วง ${data.period} · เข้าที่คะแนน ≥ ${data.entry_score} · เป้า +${data.target_pct}% · ตัดขาดทุน -${data.stop_loss_pct}%`;

  const rows = (data.results || []).map((r) => {
    const tot = r.total_return >= 0 ? "good" : "bad";
    return `<div class="bt-row">
      <div class="bt-name"><b>${r.name}</b><small>${r.ticker}</small></div>
      <div class="bt-bar-wrap"><div class="bt-bar"><i style="width:${Math.min(r.win_rate, 100)}%"></i></div><span>${r.win_rate}%</span></div>
      <div class="bt-total ${tot}">${r.total_return >= 0 ? "+" : ""}${r.total_return}%</div>
      <div class="bt-trades">${r.trades} เทรด</div>
    </div>`;
  }).join("");
  document.getElementById("bt-list").innerHTML = rows;
}

// ── render: market regime banner ──
function renderRegime(r, data) {
  const el = document.getElementById("regime-banner");
  const mlabel = data && data.market_key === "all" ? "ALL" : (data && data.market_key === "us") ? "US" : "SET";
  const pill = document.getElementById("market-status");
  if (pill) pill.textContent = mlabel + (r ? " · " + r.regime : "");
  if (!el) return;
  if (data && data.market_key === "all") {
    const regs = data.regimes || [];
    if (!regs.length) { el.classList.add("hidden"); return; }
    el.className = "regime-banner neutral";
    el.innerHTML = `<span class="rg-emo">🌐</span><div><b>ภาวะตลาดรวมทุกตลาด</b>
      ${regs.map((x) => `<small>${escapeHtml(x.market_name || x.market_key)}: ${escapeHtml(x.regime.label)} · breadth ${x.regime.breadth}% (${x.regime.uptrend}/${x.regime.stocks})</small>`).join("")}</div>`;
    return;
  }
  if (!r) { el.classList.add("hidden"); return; }
  const map = { BULL: ["bull", "🟢"], NEUTRAL: ["neutral", "🟡"], BEAR: ["bear", "🔴"], UNKNOWN: ["neutral", "⚪"] };
  const [cls, emo] = map[r.regime] || map.UNKNOWN;
  el.className = "regime-banner " + cls;
  el.innerHTML = `<span class="rg-emo">${emo}</span>
    <div><b>ภาวะตลาด: ${r.label}</b>
    <small>breadth ${r.breadth}% ของหุ้นยืนเหนือ EMA20 (${r.uptrend}/${r.stocks} ตัว)${r.regime === "BEAR" ? " · ระบบจะแจ้งเฉพาะสัญญาณแข็งแรงมาก" : ""}</small></div>`;
}

// ── render: live paper-trading performance ──
function renderPerformance(p) {
  const el = document.getElementById("live-perf");
  if (!el) return;
  const s = p.summary || {};
  if (!s.closed && !s.open) {
    el.innerHTML = `<div class="lp-empty">ยังไม่มีสัญญาณที่บันทึก — ระบบจะเริ่มเก็บสถิติจริงหลังรันครั้งแรก<br><small>ยิ่งใช้นานยิ่งรู้ว่าระบบแม่นจริงแค่ไหน</small></div>`;
    return;
  }
  const wrCls = s.win_rate >= 50 ? "good" : "bad";
  el.innerHTML = `
    <div class="bt-overview">
      <div class="bt-stat"><div class="v">${s.closed}</div><div class="l">ปิดแล้ว (ไม้)</div></div>
      <div class="bt-stat"><div class="v ${wrCls}">${s.win_rate}%</div><div class="l">อัตราชนะจริง</div></div>
      <div class="bt-stat"><div class="v ${s.avg_return >= 0 ? "good" : "bad"}">${s.avg_return}%</div><div class="l">กำไรเฉลี่ย/ไม้</div></div>
      <div class="bt-stat"><div class="v">${s.open}</div><div class="l">กำลังถือ</div></div>
    </div>
    <div class="lp-breakdown">ปิดด้วย: 🎯 ชนเป้า <b>${s.by_target}</b> · 🛑 ตัดขาดทุน <b>${s.by_stop}</b> · ⏱ ครบเวลา <b>${s.by_time}</b></div>
    ${posList("กำลังถือ", p.open_positions, false)}
    ${posList("ปิดล่าสุด", p.closed_positions, true)}`;
}

// ── render: system status ──
function renderStatus(st) {
  const el = document.getElementById("system-status");
  if (!el) return;
  const iso = st.generated_at_iso ? Date.parse(st.generated_at_iso) : NaN;
  const ageHours = Number.isFinite(iso) ? Math.max(0, (Date.now() - iso) / 36e5) : null;
  const stale = ageHours != null && ageHours > 30;
  const state = stale ? "bad" : st.status === "warning" ? "warn" : "ok";
  const label = stale ? "ข้อมูลเก่า" : st.status === "warning" ? "มีคำเตือน" : "ปกติ";
  const overall = st.overall || {};
  const warnings = (st.warnings || []).map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  const rows = (st.markets || []).map((m) => {
    const ratio = Math.round((m.fetch_fail_ratio || 0) * 100);
    const cls = ratio >= 50 || m.received === 0 ? "bad" : ratio > 0 ? "warn" : "ok";
    const r = m.regime;
    return `<div class="status-row">
      <div><b>${escapeHtml(m.short || m.name)}</b><small>${escapeHtml(m.file)}${r ? " · " + escapeHtml(r.regime) : ""}</small></div>
      <div>${m.received}/${m.attempted} ตัว</div>
      <div class="status-pill ${cls}">fail ${ratio}%</div>
    </div>`;
  }).join("");

  el.innerHTML = `
    <div class="status-hero ${state}">
      <div>
        <span class="status-kicker">สถานะล่าสุด</span>
        <h2>${label}</h2>
        <p>${escapeHtml(st.generated_at || "-")}${ageHours == null ? "" : ` · ${ageHours.toFixed(1)} ชั่วโมงก่อน`}</p>
      </div>
      <div class="status-score">
        <b>${overall.received ?? 0}/${overall.attempted ?? 0}</b>
        <span>ดึงข้อมูลสำเร็จ</span>
      </div>
    </div>
    <div class="status-grid">
      <div class="status-stat"><b>${overall.failed ?? 0}</b><span>ตัวที่ดึงไม่สำเร็จ</span></div>
      <div class="status-stat"><b>${Math.round((overall.fetch_fail_ratio || 0) * 100)}%</b><span>fail ratio รวม</span></div>
      <div class="status-stat"><b>${escapeHtml(st.telegram || "-")}</b><span>Telegram รอบล่าสุด</span></div>
    </div>
    <div class="status-list">${rows}</div>
    ${warnings ? `<div class="status-warnings"><h3>คำเตือน</h3><ul>${warnings}</ul></div>` : ""}`;
}

function reasonIcon(r) { return { target: "🎯", stop: "🛑", time: "⏱" }[r] || "•"; }

function posList(title, list, closed) {
  if (!list || !list.length) return "";
  const rows = list.slice(0, 10).map((p) => {
    if (closed) {
      const c = p.return_pct >= 0 ? "up" : "down";
      return `<div class="lp-row"><span class="lp-n">${reasonIcon(p.reason)} ${p.name}<small>${p.ticker}</small></span>
        <span class="lp-muted">${fmt(p.entry)} → ${fmt(p.exit)}</span>
        <span class="change ${c}">${p.return_pct >= 0 ? "+" : ""}${p.return_pct}%</span></div>`;
    }
    return `<div class="lp-row"><span class="lp-n">${p.name}<small>${p.ticker}</small></span>
      <span class="lp-muted">เข้า ${fmt(p.entry)}</span><span class="lp-muted">ถือ ${p.days} วัน</span></div>`;
  }).join("");
  return `<h3 class="lp-h">${title} (${list.length})</h3><div class="lp-rows">${rows}</div>`;
}

// ── modal ──
let modalCloseTimer = null;

function showModal() {
  const modal = document.getElementById("modal");
  clearTimeout(modalCloseTimer);
  modal.classList.remove("hidden", "is-closing");
  void modal.offsetWidth;
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (modal.classList.contains("hidden") || modal.classList.contains("is-closing")) return;
  modal.classList.add("is-closing");
  modalCloseTimer = setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing");
  }, 260);
}

function openCardModal(ticker) {
  const signal = ALL.find((s) => s.ticker === ticker);
  if (signal) return openModal(ticker);
  const stock = UNIVERSE.find((s) => s.ticker === ticker);
  if (stock) return openUniverseModal(stock);
}

function openModal(ticker) {
  const x = ALL.find((s) => s.ticker === ticker);
  if (!x) return;
  const cls = SIG_CLASS[x.signal] || "s-watch";
  const reasons = (x.reasons || []).map((r) => `<li>${r}</li>`).join("");
  const warns = (x.warnings || []).map((w) => `<li>${w}</li>`).join("");

  const r = recOf(x);
  const h = holdingOf(x);
  const cur = x.currency || META.currency || "฿";
  // ขนาดไม้ — คำนวณจากพอร์ต/ความเสี่ยงที่ผู้ใช้ตั้งไว้ (แท็บบันทึกเทรด)
  let posBlock = "";
  if (x.pos_shares != null) {
    const rk = getRisk();
    const lot = (x.market_tag === "US") ? 1 : 100;
    const riskAmt = rk.account * rk.risk / 100;
    let shares = x.pos_shares;
    if (x.entry > x.stop_loss) shares = Math.floor((riskAmt / (x.entry - x.stop_loss)) / lot) * lot;
    posBlock = `<div class="md-section"><h3>ขนาดไม้แนะนำ (เสี่ยง ${rk.risk}% ของพอร์ต ${cur}${rk.account.toLocaleString("th-TH")})</h3>
      <div class="md-row"><span>จำนวนหุ้น</span><span>${shares.toLocaleString("th-TH")} หุ้น</span></div>
      <div class="md-row"><span>มูลค่าโดยประมาณ</span><span>${cur}${fmt(shares * x.entry)}</span></div>
      <div class="md-row"><span>ขาดทุนสูงสุดถ้าโดน stop</span><span style="color:var(--red)">~${cur}${fmt(riskAmt)}</span></div>
      <p class="bt-disclaimer">คำนวณจากพอร์ต/ความเสี่ยงที่คุณตั้งในแท็บ "บันทึกเทรด"</p></div>`;
  }
  document.getElementById("modal-content").innerHTML = `
    <div class="md-head"><h2>${x.name}</h2><span class="badge ${cls}">${x.signal}</span></div>
    <div class="md-sub">${x.ticker} · ${cur}${fmt(x.price)}
      <span class="change ${x.change_pct >= 0 ? "up" : "down"}">${x.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(x.change_pct).toFixed(2)}%</span></div>

    <div class="rec-banner rec-${r.tone}">${r.text}</div>

    <div class="hold-banner hold-${h.tone}">
      <div><span>กรอบการถือ</span><b>${h.label} · ${h.period}</b></div>
      <p>${h.text}</p>
      ${h.reason ? `<small>${h.reason}</small>` : ""}
    </div>

    <div class="md-chart">${sparkline(x.history, 510, 110)}</div>

    ${newsSection(x)}
    ${sourceLinksSection(x)}

    <div class="md-section"><h3>จุดเข้า / จุดออก (ประเมินคร่าวๆ)</h3>
      <div class="levels">
        <div class="level"><div class="lv-l">จุดเข้า ~</div><div class="lv-v">${fmt(x.entry)}</div></div>
        <div class="level sl"><div class="lv-l">ตัดขาดทุน</div><div class="lv-v">${fmt(x.stop_loss)}</div></div>
        <div class="level tp"><div class="lv-l">เป้า 1 / 2</div><div class="lv-v">${fmt(x.target1)}<br><small style="font-size:12px">${fmt(x.target2)}</small></div></div>
      </div></div>

    ${x.pos_shares ? `<div class="md-section"><h3>ขนาดไม้แนะนำ (เสี่ยง ${META.risk ?? 2}% ของพอร์ต ${cur}${(META.account ?? 100000).toLocaleString("th-TH")})</h3>
      <div class="md-row"><span>จำนวนหุ้น</span><span>${x.pos_shares.toLocaleString("th-TH")} หุ้น</span></div>
      <div class="md-row"><span>มูลค่าโดยประมาณ</span><span>${cur}${fmt(x.pos_value)}</span></div>
      <div class="md-row"><span>ขาดทุนสูงสุดถ้าโดน stop</span><span style="color:var(--red)">~${cur}${fmt((META.account ?? 100000) * (META.risk ?? 2) / 100)}</span></div></div>` : ""}

    <div class="md-section"><h3>ข้อมูลราคา / สภาพคล่อง</h3>
      <div class="md-row"><span>เปิด / สูงสุด / ต่ำสุด</span><span>${fmt(x.open ?? x.price)} / ${fmt(x.day_high ?? x.price)} / ${fmt(x.day_low ?? x.price)}</span></div>
      <div class="md-row"><span>ปิดก่อนหน้า</span><span>${fmt(x.prev_close ?? x.price)}</span></div>
      <div class="md-row"><span>ปริมาณซื้อขาย</span><span>${fmt0(x.volume)} หุ้น</span></div>
      <div class="md-row"><span>วอลุ่มเฉลี่ย</span><span>${fmt0(x.avg_volume)} หุ้น</span></div>
      <div class="md-row"><span>มูลค่าซื้อขายโดยประมาณ</span><span>${cur}${fmt0(x.turnover)}</span></div>
    </div>

    <div class="md-section"><h3>กรอบราคา / ผลตอบแทนย้อนหลัง</h3>
      <div class="md-row"><span>High/Low 20 วัน</span><span>${fmt(x.high_20d ?? x.price)} / ${fmt(x.low_20d ?? x.price)}</span></div>
      <div class="md-row"><span>High/Low 120 วัน</span><span>${fmt(x.high_120d ?? x.price)} / ${fmt(x.low_120d ?? x.price)}</span></div>
      <div class="md-row"><span>ห่างจาก High 120 วัน</span><span>${fmtPct(x.from_high_120d_pct)}</span></div>
      <div class="md-row"><span>เหนือ Low 120 วัน</span><span>${fmtPct(x.from_low_120d_pct)}</span></div>
      <div class="md-row"><span>ผลตอบแทน 20 / 60 วัน</span><span>${fmtPct(x.return_20d)} / ${fmtPct(x.return_60d)}</span></div>
    </div>

    <div class="md-section"><h3>ความเสี่ยง / Reward</h3>
      <div class="md-row"><span>ขาดทุนถึง stop</span><span style="color:var(--red)">${fmt(x.downside_pct ?? 0)}%</span></div>
      <div class="md-row"><span>Upside เป้า 1 / 2</span><span style="color:var(--green)">${fmt(x.upside1_pct ?? 0)}% / ${fmt(x.upside2_pct ?? 0)}%</span></div>
      <div class="md-row"><span>Risk/Reward เป้า 1 / 2</span><span>${x.risk_reward1 ?? "-"} / ${x.risk_reward2 ?? "-"}</span></div>
      <div class="md-row"><span>ATR14 / ATR%</span><span>${fmt(x.atr14 ?? 0)} / ${fmt(x.atr_pct ?? 0)}%</span></div>
      <div class="md-row"><span>Volatility 20 วันต่อปี</span><span>${fmt(x.volatility20 ?? 0)}%</span></div>
    </div>

    <div class="md-section"><h3>ตัวชี้วัด</h3>
      <div class="md-row"><span>คะแนนสัญญาณ</span><span style="color:${scoreColor(x.score)}">${x.score}/100</span></div>
      <div class="md-row"><span>EMA20 / EMA50</span><span>${fmt(x.ema_fast ?? x.price)} / ${fmt(x.ema_slow ?? x.price)}</span></div>
      <div class="md-row"><span>RSI (14)</span><span>${x.rsi}</span></div>
      <div class="md-row"><span>MACD Histogram</span><span>${x.macd_hist}</span></div>
      <div class="md-row"><span>เทรนด์ (EMA20/50)</span><span>${trendIcon(x.trend)} ${x.trend}</span></div>
      <div class="md-row"><span>วอลุ่ม vs เฉลี่ย</span><span>${x.volume_ratio}x</span></div>
      <div class="md-row"><span>โมเมนตัม 5 วัน</span><span>${x.momentum_5d}%</span></div>
    </div>

    ${reasons ? `<div class="md-section"><h3>เหตุผลเชิงบวก</h3><ul class="reason-list">${reasons}</ul></div>` : ""}
    ${warns ? `<div class="md-section"><h3>ข้อควรระวัง</h3><ul class="reason-list warn-list">${warns}</ul></div>` : ""}
    ${backtestSection(x.ticker)}`;
  showModal();
}

function openUniverseModal(stock) {
  const ticker = stock.display_ticker || stock.ticker;
  const market = stock.market ? ` · ${stock.market}` : "";
  const x = {
    ...stock,
    market_tag: stock.market_tag,
    name: stock.name || ticker,
    ticker: stock.ticker,
    news: [],
  };
  document.getElementById("modal-content").innerHTML = `
    <div class="md-head"><h2>${escapeHtml(x.name)}</h2><span class="badge s-watch">WATCHLIST</span></div>
    <div class="md-sub">${escapeHtml(ticker)}${escapeHtml(market)} · ยังไม่มีข้อมูลวิเคราะห์ล่าสุดใน dashboard รอบนี้</div>

    <div class="hold-banner hold-wait">
      <div><span>สถานะข้อมูล</span><b>อยู่ในรายการค้นหา</b></div>
      <p>หุ้นนี้อยู่ใน watchlist แล้ว แต่ยังไม่มีสัญญาณล่าสุดให้แสดงในไฟล์ข้อมูลรอบปัจจุบัน</p>
      <small>กดรันอัปเดตบน GitHub Actions หรือถามใน Telegram ด้วย <code>/stock ${escapeHtml(ticker)}</code> เพื่อวิเคราะห์รายตัว</small>
    </div>

    ${newsSection(x)}
    ${sourceLinksSection(x)}

    <div class="md-section"><h3>วิธีดูข้อมูลล่าสุด</h3>
      <div class="md-row"><span>อัปเดตทั้งระบบ</span><span>กดปุ่มรันอัปเดตบนหน้าเว็บ</span></div>
      <div class="md-row"><span>ถามใน Telegram</span><span><code>/stock ${escapeHtml(ticker)}</code></span></div>
    </div>`;
  showModal();
}

function openUpdateModal() {
  const currentStamp = document.getElementById("updated")?.textContent || "-";
  document.getElementById("modal-content").innerHTML = `
    <div class="md-head"><h2>รันอัปเดตข้อมูลใหม่</h2><span class="badge s-buy">SAFE</span></div>
    <div class="md-sub">${escapeHtml(currentStamp)} · ระบบอัปเดตอัตโนมัติทุก 30 นาที และยังสั่งรันเองได้เมื่อต้องการข้อมูลใหม่ทันที</div>

    <div class="update-help">
      <div class="update-option primary">
        <b>1. ดึงข้อมูลหุ้นใหม่จริง</b>
        <p>ปกติ GitHub Actions จะรันเองทุก 30 นาที ถ้าต้องการรันทันทีให้กดปุ่มนี้ แล้วในหน้า GitHub ให้กด <b>Run workflow</b> สีเขียวอีกครั้ง</p>
        <a class="update-action primary" href="${WORKFLOW_URL}" target="_blank" rel="noopener">เปิดหน้า Run workflow</a>
      </div>
      <div class="update-option">
        <b>2. รีเฟรชหลังรันเสร็จ</b>
        <p>ใช้หลังจาก GitHub Actions ขึ้นว่า success แล้ว หรือถ้าเปิดเว็บค้างไว้บน iPhone และอยากดึงไฟล์ข้อมูลที่ deploy ล่าสุด</p>
        <button class="update-action" id="force-refresh" type="button">↻ ดึงไฟล์ล่าสุดจากเว็บ</button>
      </div>
    </div>
    <p class="bt-disclaimer">หมายเหตุ: ปุ่มรีเฟรชดึงไฟล์ที่ deploy ล่าสุดจากเว็บ ไม่ได้ฝัง GitHub token ในหน้า public เพื่อความปลอดภัย</p>`;
  showModal();
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function newsSection(x) {
  const items = x.news || [];
  if (!items.length) {
    return `<div class="md-section"><h3>📰 ข่าวที่เกี่ยวข้อง</h3>
      <p class="news-empty">ยังไม่พบข่าวล่าสุดสำหรับหุ้นนี้ (ลองดูอีกครั้งภายหลัง)</p></div>`;
  }
  const rows = items.map((n) => `
    <a class="news-item" href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer">
      <div class="news-title">${escapeHtml(n.title)}</div>
      <div class="news-meta">${n.source ? escapeHtml(n.source) + " · " : ""}${escapeHtml(n.published)}</div>
    </a>`).join("");
  return `<div class="md-section"><h3>📰 ข่าวที่เกี่ยวข้อง (ทำไมราคาขยับ?)</h3>
    <div class="news-list">${rows}</div>
    <p class="news-disc">ข่าวเป็นบริบทประกอบให้คุณวิเคราะห์เอง · ไม่ใช่สาเหตุที่พิสูจน์แล้ว · ที่มา: Google News</p></div>`;
}

function sourceLinksSection(x) {
  const ticker = String(x.ticker || "");
  const shortTicker = ticker.endsWith(".BK") ? ticker.slice(0, -3) : ticker;
  const query = encodeURIComponent(`${shortTicker} ${x.name || ""} หุ้น`);
  const links = [
    { label: "Yahoo Finance", hint: "ราคา กราฟ ข่าว และข้อมูลบริษัท", url: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}` },
    { label: "Google News", hint: "ข่าวล่าสุดจากหลายสำนักข่าว", url: `https://news.google.com/search?q=${query}&hl=th&gl=TH&ceid=TH:th` },
  ];

  if (x.market_tag === "TH") {
    const setCode = encodeURIComponent(shortTicker);
    links.unshift(
      { label: "SET Quote", hint: "หน้าหุ้นบนตลาดหลักทรัพย์ไทย", url: `https://www.set.or.th/th/market/product/stock/quote/${setCode}/price` },
      { label: "SET Factsheet", hint: "ข้อมูลพื้นฐาน งบ และสถิติสำคัญ", url: `https://www.set.or.th/th/market/product/stock/quote/${setCode}/factsheet` }
    );
  } else {
    const usCode = encodeURIComponent(shortTicker.toLowerCase());
    links.unshift(
      { label: "Nasdaq Quote", hint: "ราคา ข่าว และข้อมูลหุ้นสหรัฐ", url: `https://www.nasdaq.com/market-activity/stocks/${usCode}` },
      { label: "SEC Filings", hint: "เอกสารบริษัทจดทะเบียนสหรัฐ", url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(shortTicker)}` }
    );
  }

  const rows = links.map((l) => `
    <a class="source-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
      <b>${escapeHtml(l.label)}</b>
      <span>${escapeHtml(l.hint)}</span>
    </a>`).join("");
  return `<div class="md-section"><h3>แหล่งข้อมูล / เว็บของหุ้นนี้</h3>
    <div class="source-grid">${rows}</div>
    <p class="news-disc">ลิงก์เหล่านี้เปิดเว็บภายนอกเพื่อดูข้อมูลและข่าวเพิ่มเติมด้วยตัวเอง</p></div>`;
}

function backtestSection(ticker) {
  const b = BT[ticker];
  if (!b || !b.trades) return "";
  const wrC = b.win_rate >= 55 ? "#00e676" : b.win_rate >= 45 ? "#ffc24b" : "#ff5a5a";
  const totC = b.total_return >= 0 ? "#00e676" : "#ff5a5a";
  return `<div class="md-section"><h3>ผลทดสอบย้อนหลัง (Backtest)</h3>
    <div class="md-row"><span>จำนวนเทรด</span><span>${b.trades} ครั้ง</span></div>
    <div class="md-row"><span>อัตราชนะ</span><span style="color:${wrC}">${b.win_rate}%</span></div>
    <div class="md-row"><span>กำไรเฉลี่ย/เทรด</span><span>${b.avg_return}%</span></div>
    <div class="md-row"><span>ผลตอบแทนสะสม</span><span style="color:${totC}">${b.total_return}%</span></div>
    <div class="md-row"><span>ดี/แย่สุด</span><span>${b.best}% / ${b.worst}%</span></div>
    <p class="bt-disclaimer">อิงข้อมูลในอดีต ไม่การันตีอนาคต และยังไม่หักค่าคอมมิชชั่น/ภาษี</p></div>`;
}

// ── trading journal + Dime slip OCR ──
function parseMoney(s) {
  if (s == null) return null;
  const clean = String(s).replace(/,/g, "").trim().replace(/(\d)\s+(\d{2})$/, "$1.$2").replace(/\s/g, "");
  const v = Number(clean);
  return Number.isFinite(v) ? v : null;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function journalItems() {
  try {
    const data = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    const repaired = repairDimeJournalItems(data);
    if (repaired.changed) saveJournalItems(repaired.items);
    return repaired.items;
  } catch (e) {
    return [];
  }
}

function saveJournalItems(items) {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(items));
}

function repairDimeJournalItems(items) {
  let changed = false;
  const repaired = items.map((item) => {
    if (item?.source !== "dime-slip" || !item.raw_text) return item;
    const parsed = parseDimeSlipText(item.raw_text);
    const inferredTicker = inferDimeTickerFromRawText(item.raw_text);
    const parsedTicker = cleanTickerCandidate(parsed.ticker || inferredTicker);
    const oldTicker = cleanTickerCandidate(item.ticker);
    const isPlaceholderTicker = oldTicker === "DIME" || oldTicker === "DIMESLIP" || /DIME\s*SLIP/i.test(item.ticker || "");
    const canTrustTicker = parsedTicker && (parsed.ticker_source !== "weak-fallback" || isPlaceholderTicker || parsedTicker === inferredTicker);
    const shouldUpdateTicker = canTrustTicker && parsedTicker !== oldTicker;
    const shouldUpgradeSchema = parsed.slip_schema && parsed.slip_schema !== item.slip_schema;
    const shouldFillCompleted = parsed.slip_schema === "completed-trade" && (
      parsed.transaction_id !== item.transaction_id ||
      parsed.executed_price_usd !== item.executed_price_usd ||
      parsed.executed_shares !== item.executed_shares ||
      parsed.total_amount_thb !== item.total_amount_thb
    );
    if (!shouldUpdateTicker && !shouldUpgradeSchema && !shouldFillCompleted) return item;
    changed = true;
    return {
      ...item,
      transaction_type: parsed.transaction_type || item.transaction_type,
      slip_schema: parsed.slip_schema || item.slip_schema,
      slip_approval_status: parsed.slip_schema === "completed-trade" ? "completed" : (item.slip_approval_status || parsed.slip_approval_status),
      ticker: shouldUpdateTicker ? parsedTicker : item.ticker,
      stock_full_name: parsed.stock_full_name || item.stock_full_name,
      ticker_confidence: parsed.ticker_confidence || (shouldUpdateTicker ? 72 : item.ticker_confidence),
      ticker_source: parsed.ticker_source || (shouldUpdateTicker ? "raw-infer" : item.ticker_source),
      market: parsed.market || item.market,
      status: parsed.status || item.status,
      ordered_at: parsed.ordered_at || item.ordered_at,
      amount_thb: parsed.amount_thb || item.amount_thb,
      amount_usd: parsed.amount_usd || item.amount_usd,
      fx_rate: parsed.fx_rate || item.fx_rate,
      entry: parsed.entry || item.entry,
      shares: parsed.shares || item.shares,
      transaction_id: parsed.transaction_id || item.transaction_id,
      reference_valid: parsed.reference_valid ?? item.reference_valid,
      executed_price_usd: parsed.executed_price_usd || item.executed_price_usd,
      executed_shares: parsed.executed_shares || item.executed_shares,
      gross_amount_usd: parsed.gross_amount_usd || item.gross_amount_usd,
      fees_usd: parsed.fees_usd ?? item.fees_usd,
      total_amount_thb: parsed.total_amount_thb || item.total_amount_thb,
      validation_checks: parsed.validation_checks || item.validation_checks,
      order_no: parsed.order_no || item.order_no,
      slip_key: parsed.slip_key || item.slip_key,
      corrected_from_ticker: shouldUpdateTicker ? (item.corrected_from_ticker || item.ticker) : item.corrected_from_ticker,
      updated_at: new Date().toISOString(),
    };
  });
  return { changed, items: repaired };
}

function setJournalIoStatus(text, tone = "") {
  const el = document.getElementById("jn-io-status");
  if (!el) return;
  el.textContent = text || "";
  el.className = "jn-io-status" + (tone ? " " + tone : "");
}

function journalDedupeKey(item) {
  if (!item || typeof item !== "object") return "";
  if (item.slip_key) return `slip:${item.slip_key}`;
  if (item.order_no) return `order:${item.order_no}`;
  if (item.id) return `id:${item.id}`;
  return [
    "manual",
    item.source || "",
    item.side || "",
    item.ticker || "",
    item.entry ?? "",
    item.exit ?? "",
    item.shares ?? "",
    item.amount_thb ?? "",
    item.amount_usd ?? "",
    item.created_at || "",
  ].join(":");
}

function normalizeImportedJournalItems(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.journal)
        ? payload.journal
        : Array.isArray(payload?.trades)
          ? payload.trades
          : null;
  if (!raw) return null;
  const stamp = Date.now().toString(36);
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x, idx) => ({
      ...x,
      id: String(x.id || `import_${stamp}_${idx}`),
      created_at: String(x.created_at || new Date().toISOString()),
    }));
}

function exportJournalItems() {
  const items = journalItems();
  const payload = {
    app: "ai-stock-signal",
    type: "trading-journal",
    exported_at: new Date().toISOString(),
    count: items.length,
    items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-stock-journal-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setJournalIoStatus(items.length ? `ส่งออก ${items.length} รายการแล้ว` : "ส่งออกไฟล์ว่างแล้ว", "good");
}

async function importJournalItemsFromFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const imported = normalizeImportedJournalItems(payload);
    if (!imported) throw new Error("รูปแบบไฟล์ไม่ใช่ trading journal JSON");

    const current = journalItems();
    const keys = new Set(current.map(journalDedupeKey).filter(Boolean));
    const additions = [];
    let skipped = 0;
    imported.forEach((item) => {
      const key = journalDedupeKey(item);
      if (key && keys.has(key)) {
        skipped += 1;
        return;
      }
      if (key) keys.add(key);
      additions.push(item);
    });

    if (additions.length) saveJournalItems([...additions, ...current]);
    renderJournal();
    setJournalIoStatus(`นำเข้า ${additions.length} รายการ${skipped ? ` · ข้ามซ้ำ ${skipped} รายการ` : ""}`, additions.length ? "good" : "");
  } catch (e) {
    setJournalIoStatus(`นำเข้าไม่สำเร็จ: ${e.message}`, "bad");
  } finally {
    if (input) input.value = "";
  }
}

function addJournalItem(item) {
  const items = journalItems();
  if (item.slip_key) {
    const existingIndex = items.findIndex((x) => x.slip_key === item.slip_key);
    const existing = items[existingIndex];
    if (existing) {
      if (item.source === "dime-slip") {
        const approvalStatus = item.slip_schema === "completed-trade"
          ? "completed"
          : existing.slip_approval_status || item.slip_approval_status;
        const updated = { ...existing, ...item, slip_approval_status: approvalStatus, id: existing.id, created_at: existing.created_at, updated_at: new Date().toISOString() };
        items[existingIndex] = updated;
        saveJournalItems(items);
        renderJournal();
        return { duplicate: true, updated: true, item: updated };
      }
      renderJournal();
      return { duplicate: true, item: existing };
    }
  }
  const saved = { id: Date.now().toString(36), created_at: new Date().toISOString(), ...item };
  items.unshift(saved);
  saveJournalItems(items);
  renderJournal();
  return { duplicate: false, item: saved };
}

function updateJournalItem(id, patch) {
  const items = journalItems();
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const next = { ...items[idx], ...patch, updated_at: new Date().toISOString() };
  items[idx] = next;
  saveJournalItems(items);
  renderJournal();
  return next;
}

function approvePendingDimeSlip(id) {
  return updateJournalItem(id, {
    slip_approval_status: "approved_waiting",
    needs_review: false,
    validation_override: true,
    approved_at: new Date().toISOString(),
    cancelled_at: "",
    status: "อนุมัติรอผล",
  });
}

function cancelPendingDimeSlip(id) {
  return updateJournalItem(id, {
    slip_approval_status: "cancelled",
    cancelled_at: new Date().toISOString(),
    status: "ยกเลิก/ไม่ติดตาม",
  });
}

function deleteJournalItem(id) {
  saveJournalItems(journalItems().filter((x) => x.id !== id));
  renderJournal();
}

function stockLookupKey(ticker) {
  return String(ticker || "").replace(/\.BK$/i, "").toUpperCase();
}

function findLatestSignal(ticker, market = "") {
  const key = stockLookupKey(ticker);
  if (!key) return null;
  const marketKey = String(market || "").toUpperCase();
  return ALL.find((s) => {
    const sameTicker = stockLookupKey(s.ticker) === key || stockLookupKey(s.display_ticker) === key || stockLookupKey(s.name) === key;
    if (!sameTicker) return false;
    if (!marketKey) return true;
    return String(s.market || s.market_key || "").toUpperCase().includes(marketKey) ||
      String(s.exchange || "").toUpperCase().includes(marketKey);
  }) || ALL.find((s) => stockLookupKey(s.ticker) === key || stockLookupKey(s.display_ticker) === key || stockLookupKey(s.name) === key) || null;
}

function journalCostBasis(item) {
  const entry = Number(item.entry);
  const shares = Number(item.shares);
  if (entry > 0 && shares > 0) return { amount: entry * shares, entry, shares, mode: "shares" };
  if (Number(item.amount_thb) > 0) return { amount: Number(item.amount_thb), entry: null, shares: null, mode: "amount" };
  if (Number(item.amount_usd) > 0 && Number(item.fx_rate) > 0) {
    return { amount: Number(item.amount_usd) * Number(item.fx_rate), entry: null, shares: null, mode: "amount" };
  }
  return { amount: 0, entry: entry > 0 ? entry : null, shares: shares > 0 ? shares : null, mode: "none" };
}

function journalProjection(item) {
  const signal = findLatestSignal(item.ticker, item.market);
  const basis = journalCostBasis(item);
  if (!signal || !basis.amount) return { signal, basis };

  const currentPrice = Number(signal.price);
  const entryPrice = basis.entry;
  const currentPct = entryPrice > 0 && currentPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : null;
  const currentMoney = currentPct == null ? null : basis.amount * currentPct / 100;
  const targetPct = Number(signal.upside1_pct) || (Number(signal.target1) > 0 && currentPrice > 0 ? ((Number(signal.target1) - currentPrice) / currentPrice) * 100 : null);
  const lossPct = Number(signal.downside_pct) || (Number(signal.stop_loss) > 0 && currentPrice > 0 ? ((currentPrice - Number(signal.stop_loss)) / currentPrice) * 100 : null);

  return {
    signal,
    basis,
    currentPrice,
    currentPct,
    currentMoney,
    targetPct,
    targetMoney: targetPct == null ? null : basis.amount * targetPct / 100,
    lossPct,
    lossMoney: lossPct == null ? null : basis.amount * lossPct / 100,
  };
}

function renderJournalProjection(item, closedPl) {
  const p = journalProjection(item);
  if (closedPl != null) {
    const cost = (Number(item.entry) || 0) * (Number(item.shares) || 0);
    const pct = cost > 0 ? (closedPl / cost) * 100 : null;
    return `<div class="jn-calc closed">
      <b>ปิดแล้ว</b>
      <span class="${closedPl >= 0 ? "up" : "down"}">${pct == null ? "" : fmtPct(pct) + " · "}${fmtSignedMoney(closedPl)}</span>
    </div>`;
  }
  if (!p.signal || !p.basis.amount) {
    return `<div class="jn-calc muted">
      <b>คำนวณยังไม่ได้</b>
      <span>รอราคาล่าสุดหรือกรอกต้นทุนเพิ่ม</span>
    </div>`;
  }
  const currentClass = (p.currentMoney || 0) >= 0 ? "up" : "down";
  return `<div class="jn-calc">
    <b>ปัจจุบัน <span>${p.currentPct == null ? "-" : fmtPct(p.currentPct)}</span></b>
    <span class="${currentClass}">${p.currentMoney == null ? "-" : fmtSignedMoney(p.currentMoney)}</span>
    <small>โอกาสกำไร ${p.targetPct == null ? "-" : fmtPct(p.targetPct)} · ${p.targetMoney == null ? "-" : fmtSignedMoney(p.targetMoney)}</small>
    <small>เสี่ยงขาดทุน ${p.lossPct == null ? "-" : "-" + fmt(p.lossPct) + "%"} · ${p.lossMoney == null ? "-" : "-฿" + fmt(p.lossMoney)}</small>
  </div>`;
}

function dimeWorkflow(item) {
  if (item.source !== "dime-slip") return null;
  if (item.slip_approval_status === "cancelled" || /ยกเลิก|cancel/i.test(item.status || "")) {
    return { code: "cancelled", label: "ยกเลิก/ไม่ติดตาม", tone: "bad", desc: "เก็บไว้เป็นประวัติ แต่ไม่นับเป็นรายการรอผล" };
  }
  const validationBad = !item.validation_override && (item.validation_checks?.some((x) => !x.ok) || (item.slip_schema === "completed-trade" && item.transaction_id && item.reference_valid === false));
  if (validationBad || item.needs_review) {
    return { code: "review", label: "รอตรวจสอบ", tone: "warn", desc: "OCR หรือ validation ยังไม่มั่นใจ ต้องเช็กก่อนใช้จริง" };
  }
  if (item.slip_schema === "completed-trade" || Number(item.entry) > 0 && Number(item.shares) > 0) {
    return { code: "completed", label: "สำเร็จแล้ว", tone: "good", desc: "มีราคาซื้อเฉลี่ยและจำนวนหุ้นจริงแล้ว" };
  }
  if (item.slip_approval_status === "approved_waiting") {
    return { code: "approved_waiting", label: "อนุมัติรอผล", tone: "wait", desc: "คุณยืนยันคำสั่งแล้ว รอสลิปสำเร็จจาก Dime" };
  }
  return { code: "pending", label: "รอดำเนินการ", tone: "wait", desc: "เป็นสลิปส่งคำสั่ง ยังไม่ใช่หุ้นที่ถือจริง" };
}

function renderDimeWorkflow(item) {
  const wf = dimeWorkflow(item);
  if (!wf) return "";
  let actions = "";
  if (wf.code === "pending" || wf.code === "review") {
    actions = `<div class="jn-actions">
      <button class="jn-approve" data-id="${escapeHtml(item.id)}" type="button">อนุมัติรอผล</button>
      <button class="jn-cancel" data-id="${escapeHtml(item.id)}" type="button">ไม่ติดตาม</button>
    </div>`;
  } else if (wf.code === "approved_waiting") {
    actions = `<div class="jn-actions">
      <button class="jn-cancel" data-id="${escapeHtml(item.id)}" type="button">ยกเลิกติดตาม</button>
    </div>`;
  } else if (wf.code === "cancelled") {
    actions = `<div class="jn-actions">
      <button class="jn-approve" data-id="${escapeHtml(item.id)}" type="button">กลับมาติดตาม</button>
    </div>`;
  }
  return `<div class="jn-workflow ${wf.tone}">
    <b>${wf.label}</b>
    <small>${wf.desc}</small>
    ${actions}
  </div>`;
}

function compactSlipPreview(text) {
  return String(text || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function notePart(note, prefix) {
  return String(note || "").split("|").map((x) => x.trim()).find((x) => x.startsWith(prefix)) || "";
}

function renderJournalDetails(item, amount, usd) {
  if (item.source !== "dime-slip") {
    return `<div class="jn-muted">${amount}${usd}${item.fx_rate ? ` · FX ${fmt(item.fx_rate)}` : ""}<br>${escapeHtml(item.note || "")}</div>`;
  }
  const file = notePart(item.note, "ไฟล์ ").replace(/^ไฟล์\s*/, "");
  const confidence = item.ticker_confidence ? `${fmt0(item.ticker_confidence)}%${item.ticker_source ? " · " + item.ticker_source : ""}` : "";
  const total = [amount, usd].filter(Boolean).join(" / ");
  const sub = [
    item.fx_rate ? "FX " + fmt(item.fx_rate) : "",
    item.entry && item.shares ? `$${fmt(item.entry)} x ${Number(item.shares).toLocaleString("th-TH", { maximumFractionDigits: 8 })} หุ้น` : "",
  ].filter(Boolean).join(" · ");
  const chips = [
    item.transaction_id ? ["อ้างอิง", item.transaction_id] : null,
    item.order_no ? ["คำสั่ง", item.order_no] : null,
    file ? ["ไฟล์", file] : null,
    confidence ? ["OCR", confidence] : null,
    item.validation_checks?.length ? ["ตรวจสูตร", item.validation_checks.every((x) => x.ok) ? "ผ่าน" : "ต้องตรวจสอบ"] : null,
  ].filter(Boolean);
  const review = item.needs_review
    ? `<div class="jn-review"><b>ต้องตรวจสอบ</b><span>OCR อ่านข้อมูลไม่ครบ${item.raw_text ? " · " + escapeHtml(compactSlipPreview(item.raw_text)) : ""}</span></div>`
    : "";
  return `<div class="jn-details">
    <div class="jn-amount"><b>${escapeHtml(total || "-")}</b>${sub ? `<span>${escapeHtml(sub)}</span>` : ""}</div>
    ${chips.length ? `<div class="jn-chips">${chips.map(([label, value]) => `<span><em>${escapeHtml(label)}</em>${escapeHtml(value || "-")}</span>`).join("")}</div>` : ""}
    ${review}
  </div>`;
}

function renderJournal() {
  const items = journalItems();
  const summaryEl = document.getElementById("jn-summary");
  const listEl = document.getElementById("jn-list");
  if (!summaryEl || !listEl) return;

  const activeItems = items.filter((x) => dimeWorkflow(x)?.code !== "cancelled");
  const closed = activeItems.filter((x) => Number(x.entry) && Number(x.exit) && Number(x.shares));
  const open = activeItems.length - closed.length;
  const pl = closed.reduce((sum, x) => sum + (Number(x.exit) - Number(x.entry)) * Number(x.shares), 0);
  const invested = activeItems.reduce((sum, x) => sum + (Number(x.amount_thb) || (Number(x.entry) || 0) * (Number(x.shares) || 0)), 0);
  summaryEl.innerHTML = `
    <div class="bt-stat"><div class="v">${items.length}</div><div class="l">รายการ</div></div>
    <div class="bt-stat"><div class="v">${open}</div><div class="l">ยังเปิด/รอดำเนินการ</div></div>
    <div class="bt-stat"><div class="v">฿${fmt(invested)}</div><div class="l">เงินที่บันทึก</div></div>
    <div class="bt-stat"><div class="v ${pl >= 0 ? "good" : "bad"}">฿${fmt(pl)}</div><div class="l">กำไร/ขาดทุนปิดแล้ว</div></div>`;

  if (!items.length) {
    listEl.innerHTML = `<div class="jn-empty">ยังไม่มีรายการ</div>`;
    return;
  }
  listEl.innerHTML = items.map((x) => {
    const side = x.side === "SELL" ? "ขาย" : "ซื้อ";
    const status = x.status || (x.exit ? "ปิดแล้ว" : "ยังถือ");
    const amount = x.amount_thb ? `฿${fmt(x.amount_thb)}` : (x.entry ? `฿${fmt(x.entry)} x ${fmt0(x.shares)}` : "-");
    const usd = x.amount_usd ? ` / $${fmt(x.amount_usd)}` : "";
    const closedPl = Number(x.entry) && Number(x.exit) && Number(x.shares)
      ? (Number(x.exit) - Number(x.entry)) * Number(x.shares)
      : null;
    const projection = renderJournalProjection(x, closedPl);
    const workflow = renderDimeWorkflow(x);
    const details = renderJournalDetails(x, amount, usd);
    const right = x.source === "dime-slip"
      ? `<div class="jn-right-spacer"></div>`
      : closedPl == null
        ? `<div class="jn-open">${escapeHtml(status)}</div>`
        : `<div class="jn-pl ${closedPl >= 0 ? "up" : "down"}">${closedPl >= 0 ? "+" : ""}฿${fmt(closedPl)}</div>`;
    const tag = x.source === "dime-slip"
      ? `<span class="jn-tag">${x.needs_review ? "รอตรวจสอบ · " : ""}Dime slip${x.ticker_confidence ? " · " + fmt0(x.ticker_confidence) + "%" : ""}${x.order_no ? " · " + escapeHtml(x.order_no) : ""}</span>`
      : "";
    return `<div class="jn-row" data-journal-id="${escapeHtml(x.id)}">
      <div class="jn-n"><b>${side} ${escapeHtml(x.ticker || "-")}</b><small>${escapeHtml([x.market, x.ordered_at || x.created_at?.slice(0, 10)].filter(Boolean).join(" · "))}</small>${tag}</div>
      ${details}
      ${projection}
      ${workflow}
      ${right}
      <button class="jn-del" data-id="${escapeHtml(x.id)}" type="button" title="ลบรายการ">ลบ</button>
    </div>`;
  }).join("");
}

function revealJournalItem(id) {
  if (!id) return;
  requestAnimationFrame(() => {
    const rows = [...document.querySelectorAll(".jn-row")];
    const row = rows.find((r) => r.dataset.journalId === String(id));
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    row.classList.add("jn-row-new");
    setTimeout(() => row.classList.remove("jn-row-new"), 1800);
  });
}

function addManualJournalItem() {
  const ticker = document.getElementById("jn-name")?.value.trim().toUpperCase();
  if (!ticker) return;
  addJournalItem({
    source: "manual",
    side: "BUY",
    ticker,
    entry: parseMoney(document.getElementById("jn-entry")?.value),
    exit: parseMoney(document.getElementById("jn-exit")?.value),
    shares: parseMoney(document.getElementById("jn-shares")?.value),
    note: document.getElementById("jn-note")?.value.trim(),
  });
  ["jn-name", "jn-entry", "jn-exit", "jn-shares", "jn-note"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function numberAfter(text, label, currency) {
  const idx = text.search(label);
  if (idx < 0) return null;
  const re = new RegExp("(-?\\s*\\d[\\d,]*(?:[\\s.]\\d{2})?)\\s*" + currency, "i");
  const m = text.slice(idx, idx + 140).match(re);
  return m ? parseMoney(m[1]) : null;
}

function normalizeSlipText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[|]/g, "I")
    .replace(/\bTH[8B]\b/gi, "THB")
    .replace(/\bT\s*H\s*[8B]\b/gi, "THB")
    .replace(/\bUS[DO0]\b/gi, "USD")
    .replace(/\bU\s*S\s*[DO0]\b/gi, "USD")
    .replace(/([0-9])\s+([0-9]{2})\s+(THB|USD)\b/gi, "$1.$2 $3")
    .replace(/([0-9])\s+(THB|USD)\b/gi, "$1 $2");
}

function knownTickers() {
  const items = [...ALL, ...UNIVERSE];
  return [...new Set(items.flatMap((x) => [x.ticker, x.display_ticker])
    .filter(Boolean)
    .map((x) => String(x).replace(/\.BK$/i, "").toUpperCase()))]
    .sort((a, b) => b.length - a.length);
}

function cleanTickerCandidate(ticker) {
  return String(ticker || "")
    .toUpperCase()
    .replace(/\.BK$/i, "")
    .replace(/5/g, "S")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/[^A-Z.]/g, "");
}

function inferDimeTickerFromRawText(text) {
  const raw = String(text || "").toUpperCase();
  const normalized = raw
    .replace(/\b7SM\b/g, "TSM")
    .replace(/\bT5M\b/g, "TSM")
    .replace(/\bTSN\b/g, "TSM")
    .replace(/\bT\s*S\s*M\b/g, "TSM");
  const tickers = knownTickers();
  for (const t of tickers) {
    if (t.length >= 2 && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)) return t;
  }
  return "";
}

const DIME_MARKET_RE = "\\b(?:NYSE|NASDAQ|AMEX|ARCA|SET|MAI)\\b";
const DIME_STRONG_STOP_RE = /บัญชี|ชำระเงิน|รับเงิน|พอร์ต|รายละเอียดการโอน|วัตถุประสงค์|หากยกเลิก|ธนาคาร|เลขที่|Dime!\s*Save|Dime!\s*Fast/i;
const DIME_WEAK_TICKER_IGNORE = new Set([
  "USD", "THB", "VAT", "NYSE", "NASDAQ", "AMEX", "ARCA", "SET", "MAI",
  "DIME", "FAST", "SAVE", "MARKET", "STK", "KKP", "KKPS", "KKS",
]);
const DIME_STRONG_TICKER_IGNORE = new Set([
  "USD", "THB", "VAT", "NYSE", "NASDAQ", "AMEX", "ARCA", "SET", "MAI",
  "DIME", "FAST", "SAVE", "MARKET", "STK",
]);

function cleanSlipLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function dimeOrderLines(text) {
  const lines = cleanSlipLines(text);
  const sideIndex = lines.findIndex((line) => /ซื้อ|ซือ|Buy|ขาย|Sell/i.test(line) && !/ประเภทรายการ|transaction\s*type/i.test(line));
  const assetIndex = lines.findIndex((line) => /(?:^|\s)(?:หุ้น|stock|symbol)\s*[:\-]?\s*[A-Z0-9]{1,8}/i.test(line));
  const marketIndex = lines.findIndex((line) => new RegExp(DIME_MARKET_RE, "i").test(line));
  const start = sideIndex >= 0
    ? sideIndex
    : assetIndex >= 0
      ? assetIndex
      : Math.max(0, marketIndex - 1);
  if (start < 0) return lines.slice(0, 12);

  const scoped = [];
  for (const line of lines.slice(start, start + 12)) {
    if (scoped.length && DIME_STRONG_STOP_RE.test(line)) break;
    scoped.push(line);
    if (/อัตราแลกเปลี่ยน|จำนวนเงิน\s*\(?USD\)?|ประเภทคำสั่ง|ช่วงเวลา/i.test(line)) break;
  }
  return scoped;
}

function dimeOrderScope(text, flat) {
  const scoped = dimeOrderLines(text).join(" ");
  if (scoped) return scoped;
  const stop = String(flat || "").search(DIME_STRONG_STOP_RE);
  return stop > 0 ? String(flat || "").slice(0, stop) : String(flat || "");
}

function isWeakDimeTicker(candidate) {
  const cleaned = cleanTickerCandidate(candidate);
  return !cleaned || DIME_WEAK_TICKER_IGNORE.has(cleaned) || /^\d+$/.test(cleaned) || /^STK/i.test(cleaned);
}

function isStrongDimeTicker(candidate) {
  const cleaned = cleanTickerCandidate(candidate);
  return !!cleaned && !DIME_STRONG_TICKER_IGNORE.has(cleaned) && !/^\d+$/.test(cleaned) && !/^STK/i.test(cleaned);
}

function fallbackTicker(scope, market = "") {
  const stop = String(scope || "").search(DIME_STRONG_STOP_RE);
  const scoped = stop > 0 ? String(scope || "").slice(0, stop) : String(scope || "");
  const nearMarket = market
    ? scoped.match(new RegExp(`\\b([A-Z0-9]{1,8})\\s+${market}\\b`, "i"))?.[1]
    : "";
  const marketCleaned = cleanTickerCandidate(nearMarket);
  if (marketCleaned && !isWeakDimeTicker(marketCleaned)) return { ticker: marketCleaned, source: "market-fallback" };

  for (const t of knownTickers()) {
    if (t.length >= 2 && !isWeakDimeTicker(t) && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(scoped)) {
      return { ticker: t, source: "weak-fallback" };
    }
  }
  const generic = [...scoped.matchAll(/\b[A-Z][A-Z0-9]{1,7}\b/g)]
    .map((m) => cleanTickerCandidate(m[0]))
    .find((x) => !isWeakDimeTicker(x));
  return { ticker: generic || "", source: generic ? "weak-fallback" : "" };
}

function addDimeTickerCandidate(candidates, ticker, source, score, detail = "") {
  const cleaned = cleanTickerCandidate(ticker);
  if (!cleaned) return;
  const strong = source === "side-line" || source === "next-line" || source === "market-line" || source === "asset-label";
  if (strong ? !isStrongDimeTicker(cleaned) : isWeakDimeTicker(cleaned)) return;
  const known = knownTickers().includes(cleaned);
  candidates.push({
    ticker: cleaned,
    source,
    score: score + (known ? 18 : 0),
    detail,
  });
}

function dimeTickerFromText(text, flat, market) {
  const lines = dimeOrderLines(text);
  const orderScope = lines.join(" ");
  const candidates = [];
  lines.forEach((line, idx) => {
    const assetLabelTicker = line.match(/(?:^|\s)(?:หุ้น|stock|symbol)\s*[:\-]?\s*([A-Z0-9]{1,8}(?:\.[A-Z0-9]{1,4})?)/i);
    addDimeTickerCandidate(candidates, assetLabelTicker?.[1], "asset-label", 118, line);

    const sideTicker = line.match(/(?:ซื้อ|ซือ|Buy|ขาย|Sell)\s*[:\-]?\s*([A-Z0-9]{1,8}(?:\.[A-Z0-9]{1,4})?)/i);
    addDimeTickerCandidate(candidates, sideTicker?.[1], "side-line", 120, line);

    if (/ซื้อ|ซือ|Buy|ขาย|Sell/i.test(line)) {
      const next = lines[idx + 1] || "";
      const nextTicker = next.match(/\b([A-Z][A-Z0-9]{0,7}(?:\.[A-Z0-9]{1,4})?)\b/i);
      addDimeTickerCandidate(candidates, nextTicker?.[1], "next-line", 105, next);
    }

    const marketTicker = line.match(new RegExp(`\\b([A-Z][A-Z0-9]{0,7}(?:\\.[A-Z0-9]{1,4})?)\\s+${DIME_MARKET_RE}`, "i"));
    addDimeTickerCandidate(candidates, marketTicker?.[1], "market-line", 100, line);

    const reversedMarketTicker = line.match(new RegExp(`${DIME_MARKET_RE}\\s+([A-Z][A-Z0-9]{0,7}(?:\\.[A-Z0-9]{1,4})?)\\b`, "i"));
    addDimeTickerCandidate(candidates, reversedMarketTicker?.[1], "market-line", 92, line);
  });

  for (const t of knownTickers()) {
    if (t.length >= 2 && !isWeakDimeTicker(t) && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(orderScope)) {
      addDimeTickerCandidate(candidates, t, "universe-in-order", 70, orderScope);
    }
  }

  const fallback = fallbackTicker(orderScope, market);
  addDimeTickerCandidate(candidates, fallback.ticker, fallback.source, fallback.source === "market-fallback" ? 65 : 30, orderScope);

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || { ticker: "", source: "", score: 0, detail: "" };
  return {
    ticker: best.ticker,
    source: best.source,
    confidence: Math.min(99, Math.max(0, best.score)),
    candidates,
    order_scope: orderScope,
  };
}

function moneyValues(text, currency) {
  const re = new RegExp(`(-?\\s*\\d[\\d,]*(?:[\\s.]\\d{2})?)\\s*${currency}\\b`, "gi");
  return [...text.matchAll(re)].map((m) => parseMoney(m[1])).filter((v) => v != null);
}

function numberNearLabel(text, label, tailPattern = "") {
  const idx = text.search(label);
  if (idx < 0) return null;
  const chunk = text.slice(idx, idx + 220);
  const pattern = tailPattern
    ? new RegExp(`(-?\\s*\\d[\\d,]*(?:[\\s.]\\d{1,8})?)\\s*${tailPattern}`, "i")
    : /(-?\s*\d[\d,]*(?:[\s.]\d{1,8})?)/i;
  const match = chunk.match(pattern);
  return match ? parseMoney(match[1]) : null;
}

function extractDimeReference(flat) {
  const refRe = /^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{17}$/;
  const refs = [...flat.matchAll(/\b(20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{17})\b/g)].map((m) => m[1]);
  if (refs[0]) return { value: refs[0], valid: true };
  const loose = flat.match(/(?:เลขที่อ้างอิง|reference)[^\d]*(\d[\d\s-]{20,35})/i)?.[1];
  const cleaned = loose ? loose.replace(/\D/g, "") : "";
  return { value: cleaned || "", valid: refRe.test(cleaned) };
}

function extractDimeDateTime(flat) {
  return flat.match(/(\d{1,2}\s*(?:ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)\s*\d{2,4}\s*(?:-|,)?\s*\d{1,2}:\d{2}\s*น?\.?)/i)?.[1] || "";
}

function extractDimeAssetName(text, ticker) {
  const cleanTicker = cleanTickerCandidate(ticker);
  if (!cleanTicker) return "";
  const lines = cleanSlipLines(text);
  const idx = lines.findIndex((line) => new RegExp(`\\b${cleanTicker}\\b`, "i").test(line));
  const sameLine = lines[idx] || "";
  const afterTicker = sameLine.split(new RegExp(`\\b${cleanTicker}\\b`, "i"))[1]?.trim();
  if (afterTicker && /[A-Za-z]{4,}/.test(afterTicker) && !new RegExp(DIME_MARKET_RE, "i").test(afterTicker)) return afterTicker.slice(0, 140);
  const next = lines[idx + 1] || "";
  if (/[A-Za-z]{4,}/.test(next) && !/USD|THB|ราคา|จำนวน|ยอด|บัญชี/i.test(next)) return next.slice(0, 140);
  return "";
}

function extractDimeCompletedFields(text, flat) {
  const reference = extractDimeReference(flat);
  const avgPrice = numberNearLabel(flat, /ราคาเฉลี่ย|avg(?:erage)?\s*price/i, "USD");
  const quantity = numberNearLabel(flat, /จำนวนหุ้นที่สำเร็จ|จำนวนหุ้น|shares|quantity/i, "(?:หุ้น|share|shares)?");
  const subtotalUsd = numberNearLabel(flat, /ยอดรวม\s*\(?USD\)?|gross|subtotal/i, "USD");
  const totalThb = numberNearLabel(flat, /รวมทั้งหมด|total|ยอดเงินสุทธิ|ยอดรวม\s*\(?THB\)?/i, "THB");
  const fxRate = numberNearLabel(flat, /อัตราแลกเปลี่ยน|exchange\s*rate/i, "(?:THB\\s*\\/\\s*USD|THB|บาท)") ||
    parseMoney(flat.match(/([0-9][\d,.]{1,12})\s*THB\s*\/\s*USD/i)?.[1]);
  const feeUsdValues = [
    numberNearLabel(flat, /commission|ค่าคอมมิชชั่น/i, "USD"),
    numberNearLabel(flat, /trading\s*fee|ค่าธรรมเนียม/i, "USD"),
    numberNearLabel(flat, /VAT|ภาษี/i, "USD"),
  ].filter((v) => v != null);
  const feesUsd = feeUsdValues.length ? feeUsdValues.reduce((sum, v) => sum + v, 0) : null;

  const checks = [];
  if (avgPrice && quantity && subtotalUsd) {
    const calc = round2(avgPrice * quantity);
    checks.push({ name: "asset_value_usd", ok: Math.abs(calc - subtotalUsd) <= 0.02, expected: calc, actual: subtotalUsd });
  }
  if (subtotalUsd && fxRate && totalThb) {
    const calc = round2((subtotalUsd + (feesUsd || 0)) * fxRate);
    checks.push({ name: "settlement_thb", ok: Math.abs(calc - totalThb) <= 0.08, expected: calc, actual: totalThb });
  }

  const isCompleted = !!(reference.value || avgPrice || quantity || subtotalUsd || totalThb);
  const confidenceBoost = (reference.valid ? 16 : 0) +
    (avgPrice ? 8 : 0) +
    (quantity ? 8 : 0) +
    (subtotalUsd ? 6 : 0) +
    (totalThb ? 8 : 0) +
    checks.filter((c) => c.ok).length * 10 -
    checks.filter((c) => !c.ok).length * 18;

  return {
    is_completed: isCompleted,
    reference_number: reference.value,
    reference_valid: reference.valid,
    executed_price_usd: avgPrice,
    executed_shares: quantity,
    gross_amount_usd: subtotalUsd,
    total_amount_thb: totalThb,
    fees_usd: feesUsd,
    exchange_rate: fxRate,
    validation_checks: checks,
    confidence_boost: confidenceBoost,
  };
}

function slipKeyFromText(text) {
  const raw = encodeURIComponent(text.slice(0, 500));
  return DIME_DUP_PREFIX + btoa(raw).replace(/=+$/g, "").slice(0, 40);
}

function parseDimeSlipText(rawText) {
  const text = normalizeSlipText(rawText);
  const flat = text.replace(/\s+/g, " ").trim();
  const orderScope = dimeOrderScope(text, flat);
  const tickerMatch = dimeTickerFromText(text, flat, flat.match(new RegExp(DIME_MARKET_RE, "i"))?.[0]?.toUpperCase() || "");
  const sideMatch = orderScope.match(/ซื้อ|ซือ|Buy|ขาย|Sell/i) || flat.match(/ซื้อ|ซือ|Buy|ขาย|Sell/i);
  const market = flat.match(/\b(NYSE|NASDAQ|AMEX|ARCA|SET|MAI)\b/i)?.[1]?.toUpperCase() || "";
  const status = flat.match(/(รอดำเนินการ|สำเร็จ|ยกเลิก|ไม่สำเร็จ|pending|completed|cancelled|failed)/i)?.[1] || "";
  const orderedAt = extractDimeDateTime(flat);
  const fxRate = parseMoney(flat.match(/1\s*USD\s*=\s*([\d,.]+)\s*THB/i)?.[1]);
  const thbValues = moneyValues(flat, "THB");
  const usdValues = moneyValues(flat, "USD").filter((v) => v !== 1);
  const orderNoMatch = flat.match(/\b(STK[A-Z0-9]{8,})(?:\s*([0-9]{6,}))?/i);
  const orderNo = orderNoMatch ? (orderNoMatch[1] + (orderNoMatch[2] || "")).toUpperCase() : "";
  const completed = extractDimeCompletedFields(text, flat);
  const inferredTicker = inferDimeTickerFromRawText(text);
  const ticker = cleanTickerCandidate(tickerMatch.ticker || inferredTicker);
  const stockFullName = extractDimeAssetName(text, ticker);
  const sideWord = sideMatch?.[0]?.toLowerCase() || "";
  const side = /ขาย|sell/i.test(sideWord) ? "SELL" : "BUY";
  const amountThb = completed.total_amount_thb ||
    numberAfter(flat, /มูลค่าหุ้น|มูลค่า|ยอดเงิน|จำนวนเงิน/i, "THB") ||
    thbValues.filter((v) => v > 0).sort((a, b) => b - a)[0] || null;
  const amountUsd = completed.gross_amount_usd ||
    numberAfter(flat, /จำนวนเงิน\s*\(?USD\)?|ยอดรวม\s*\(?USD\)?/i, "USD") ||
    usdValues.at(-1) || null;
  const confidence = Math.min(99, Math.max(0, (tickerMatch.confidence || (inferredTicker ? 72 : 0)) + (completed.confidence_boost || 0)));
  const primaryId = completed.reference_number || orderNo;

  return {
    source: "dime-slip",
    transaction_type: side === "SELL" ? "ขายหุ้น" : "ซื้อหุ้น",
    slip_schema: completed.is_completed ? "completed-trade" : "order-request",
    slip_approval_status: completed.is_completed ? "completed" : "pending",
    slip_key: primaryId ? DIME_DUP_PREFIX + primaryId : slipKeyFromText(flat),
    side,
    ticker,
    stock_full_name: stockFullName,
    ticker_source: tickerMatch.source || (inferredTicker ? "raw-infer" : ""),
    ticker_confidence: confidence,
    ticker_candidates: tickerMatch.candidates?.slice(0, 5),
    order_scope: tickerMatch.order_scope,
    market,
    status: completed.is_completed && !status ? "สำเร็จ" : status,
    ordered_at: orderedAt,
    amount_thb: amountThb,
    entry: completed.executed_price_usd || null,
    shares: completed.executed_shares || null,
    commission_thb: numberAfter(flat, /ค่าคอมมิชชั่น/i, "THB"),
    discount_thb: thbValues.find((v) => v < 0) || null,
    vat_thb: numberAfter(flat, /VAT|ภาษี/i, "THB"),
    amount_usd: amountUsd,
    fx_rate: completed.exchange_rate || fxRate,
    transaction_id: completed.reference_number || "",
    reference_valid: completed.reference_valid,
    executed_price_usd: completed.executed_price_usd,
    executed_shares: completed.executed_shares,
    gross_amount_usd: completed.gross_amount_usd,
    fees_usd: completed.fees_usd,
    total_amount_thb: completed.total_amount_thb,
    validation_checks: completed.validation_checks,
    order_type: /market|ราคาตลาด/i.test(flat) ? "Market" : "",
    order_no: orderNo,
    note: "นำเข้าจากสลิป Dime",
    raw_text: text.slice(0, 4000),
  };
}

function setSlipStatus(text, tone = "") {
  const el = document.getElementById("slip-status");
  if (!el) return;
  el.textContent = text;
  el.className = "slip-status" + (tone ? " " + tone : "");
}

function clearSlipFileOnly() {
  const input = document.getElementById("slip-file");
  if (input) input.value = "";
}

function fillJournalFormFromSlip(parsed) {
  const nameEl = document.getElementById("jn-name");
  const noteEl = document.getElementById("jn-note");
  if (nameEl && parsed.ticker) nameEl.value = parsed.ticker;
  if (noteEl) {
    const parts = [
      parsed.side === "SELL" ? "ขาย" : "ซื้อ",
      parsed.ticker || "หุ้น",
      "จากสลิป Dime",
      parsed.amount_thb ? "฿" + fmt(parsed.amount_thb) : "",
      parsed.amount_usd ? "$" + fmt(parsed.amount_usd) : "",
      parsed.order_no ? "order " + parsed.order_no : "",
    ].filter(Boolean);
    noteEl.value = parts.join(" ");
  }
}

function reviewSlipItem(parsed, fileName = "") {
  const inferredTicker = inferDimeTickerFromRawText(parsed.raw_text);
  const fallbackTicker = parsed.ticker || inferredTicker || document.getElementById("jn-name")?.value.trim().toUpperCase() || "รอตรวจสอบสลิป";
  return {
    ...parsed,
    source: "dime-slip",
    needs_review: true,
    status: parsed.status || "รอตรวจสอบ",
    ticker: fallbackTicker,
    ticker_source: parsed.ticker_source || (inferredTicker ? "raw-infer" : "needs-review"),
    ticker_confidence: parsed.ticker_confidence || (inferredTicker ? 72 : 0),
    slip_key: parsed.slip_key || DIME_DUP_PREFIX + "review:" + Date.now().toString(36),
    note: [
      "OCR อ่านข้อมูลไม่ครบ ต้องตรวจสอบเอง",
      parsed.ticker_confidence ? `ticker confidence ${parsed.ticker_confidence}% (${parsed.ticker_source || "unknown"})` : "",
      fileName ? `ไฟล์ ${fileName}` : "",
      slipDebugPreview(parsed.raw_text),
    ].filter(Boolean).join(" | "),
  };
}

function slipDebugPreview(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function canvasFromImageFile(file) {
  const bitmap = window.createImageBitmap
    ? await createImageBitmap(file)
    : await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("เปิดรูปสลิปไม่สำเร็จ"));
      };
      img.src = url;
    });
  const maxWidth = 1600;
  const targetWidth = Math.min(maxWidth, Math.max(bitmap.width, 1300));
  const scale = targetWidth / bitmap.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

async function makeDimeOcrCanvas(file) {
  const canvas = await canvasFromImageFile(file);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function scoreDimeParsed(parsed) {
  if (!parsed) return 0;
  return (parsed.ticker_confidence || 0) +
    (parsed.ticker ? 25 : 0) +
    (parsed.amount_thb ? 22 : 0) +
    (parsed.amount_usd ? 8 : 0) +
    (parsed.transaction_id ? 12 : 0) +
    (parsed.reference_valid ? 10 : 0) +
    (parsed.executed_price_usd ? 8 : 0) +
    (parsed.executed_shares ? 8 : 0) +
    (parsed.validation_checks?.filter((x) => x.ok).length || 0) * 12 -
    (parsed.validation_checks?.filter((x) => !x.ok).length || 0) * 24 +
    (parsed.order_no ? 8 : 0) +
    (parsed.market ? 5 : 0);
}

async function runDimeOcrAttempt(image, label, logger) {
  const result = await Tesseract.recognize(image, "tha+eng", {
    logger,
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });
  const text = result?.data?.text || "";
  const parsed = parseDimeSlipText(text);
  return { label, text, parsed, score: scoreDimeParsed(parsed) };
}

async function smartReadDimeSlip(file, onProgress) {
  const attempts = [];
  const enhanced = await makeDimeOcrCanvas(file);
  attempts.push(await runDimeOcrAttempt(enhanced, "enhanced", (m) => {
    if (m.status === "recognizing text") onProgress?.(Math.round((m.progress || 0) * 70));
  }));

  const bestFirst = attempts[0];
  if (!bestFirst.parsed?.ticker || !bestFirst.parsed?.amount_thb || (bestFirst.parsed?.ticker_confidence || 0) < 90) {
    attempts.push(await runDimeOcrAttempt(file, "original", (m) => {
      if (m.status === "recognizing text") onProgress?.(70 + Math.round((m.progress || 0) * 30));
    }));
  }

  attempts.sort((a, b) => b.score - a.score);
  const best = attempts[0];
  best.parsed.raw_text = attempts.map((x) => `[${x.label}]\n${x.text}`).join("\n\n---\n\n").slice(0, 8000);
  best.parsed.ocr_engine = "dime-smart-v2";
  best.parsed.ocr_attempt = best.label;
  best.parsed.ocr_score = best.score;
  return best;
}

function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tesseractLoadPromise) {
    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_SRC;
      script.async = true;
      script.onload = () => window.Tesseract ? resolve() : reject(new Error("โหลดตัวอ่านสลิปไม่สำเร็จ"));
      script.onerror = () => reject(new Error("โหลดตัวอ่านสลิปไม่สำเร็จ"));
      document.head.appendChild(script);
    });
  }
  return tesseractLoadPromise;
}

async function readDimeSlip() {
  const input = document.getElementById("slip-file");
  const btn = document.getElementById("slip-read");
  const file = input?.files?.[0];
  if (!file) return setSlipStatus("เลือกไฟล์สลิปก่อน", "bad");

  btn.disabled = true;
  try {
    if (!window.Tesseract) {
      setSlipStatus("กำลังโหลดตัวอ่านสลิป...");
      await ensureTesseract();
    }
    setSlipStatus("กำลังอ่านข้อความแบบ Dime Smart OCR...");
    const ocr = await smartReadDimeSlip(file, (pct) => setSlipStatus(`กำลังอ่านข้อความแบบ Dime Smart OCR ${pct}%`));
    const parsed = ocr.parsed;
    fillJournalFormFromSlip(parsed);
    const hasBadValidation = parsed.validation_checks?.some((x) => !x.ok) ||
      (parsed.slip_schema === "completed-trade" && parsed.transaction_id && !parsed.reference_valid);
    if (!parsed.ticker || !parsed.amount_thb || (parsed.ticker_confidence || 0) < 80 || hasBadValidation) {
      const missing = [
        !parsed.ticker ? "ticker" : "",
        !parsed.amount_thb ? "ยอดเงิน" : "",
        parsed.ticker && (parsed.ticker_confidence || 0) < 80 ? "ความมั่นใจ ticker ต่ำ" : "",
        hasBadValidation ? "validation ไม่ผ่าน" : "",
      ].filter(Boolean).join(" และ ");
      const saved = addJournalItem(reviewSlipItem(parsed, file.name));
      clearSlipFileOnly();
      revealJournalItem(saved?.item?.id);
      setSlipStatus(`อ่าน${missing}ไม่ครบ แต่บันทึกรายการรอตรวจสอบให้แล้ว`, "good");
      return;
    }
    const saved = addJournalItem(parsed);
    clearSlipFileOnly();
    revealJournalItem(saved?.item?.id);
    const prefix = saved?.updated ? "สลิปนี้เคยบันทึกแล้ว อัปเดตรายการเดิมให้แล้ว" : saved?.duplicate ? "สลิปนี้เคยบันทึกแล้ว แสดงรายการเดิมให้แล้ว" : "บันทึกแล้วและล้างไฟล์สลิปออกจากหน้าเว็บแล้ว";
    setSlipStatus(`${prefix}: ${parsed.side === "SELL" ? "ขาย" : "ซื้อ"} ${parsed.ticker} ${parsed.amount_thb ? "฿" + fmt(parsed.amount_thb) : ""}${parsed.amount_usd ? " / $" + fmt(parsed.amount_usd) : ""} · มั่นใจ ${parsed.ticker_confidence || 0}%`, "good");
  } catch (e) {
    const fallback = reviewSlipItem({ side: "BUY", raw_text: e.message || "OCR failed" }, file.name);
    const saved = addJournalItem(fallback);
    clearSlipFileOnly();
    revealJournalItem(saved?.item?.id);
    setSlipStatus("OCR อ่านไม่สำเร็จ แต่บันทึกรายการรอตรวจสอบให้แล้ว", "good");
  } finally {
    btn.disabled = false;
  }
}

// ── tabs ──
function switchView(view) {
  const tabs = [...document.querySelectorAll(".tab")];
  const currentIndex = tabs.findIndex((t) => t.classList.contains("active"));
  const nextIndex = tabs.findIndex((t) => t.dataset.view === view);
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const activeView = document.getElementById("view-" + view);
  activeView.classList.remove("hidden");
  activeView.classList.remove("view-enter", "view-back");
  activeView.classList.toggle("view-back", nextIndex < currentIndex);
  void activeView.offsetWidth;
  activeView.classList.add("view-enter");
  setTimeout(() => activeView.classList.remove("view-enter", "view-back"), 760);
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  if (view === "journal") renderJournal();
  moveGlider(tabs.find((t) => t.dataset.view === view));
}
function moveGlider(tab) {
  const g = document.getElementById("glider");
  if (!tab || !g) return;
  g.style.width = tab.offsetWidth + "px";
  g.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
}

// ── market switch (ไทย / ต่างประเทศ) ──
function switchMarket(key) {
  if (!(key === "all" || MARKET_FILES[key]) || key === currentMarket) return;
  currentMarket = key;
  document.querySelectorAll(".ms").forEach((b) => b.classList.toggle("active", b.dataset.market === key));
  lastGenerated = null;          // บังคับให้ render ใหม่
  load(false);
}

// ── events ──
const marketSwitchEl = document.getElementById("market-switch");
if (marketSwitchEl) marketSwitchEl.addEventListener("click", (e) => {
  const b = e.target.closest(".ms");
  if (b) switchMarket(b.dataset.market);
});
document.addEventListener("pointerdown", (e) => {
  const target = e.target.closest(".tab, .chip, .tile, .card-more, .ms, .update-action, .news-item, .source-link, .slip-picker span, .slip-read, .jn-tool-btn, .jn-add, .jn-actions button");
  if (!target || target.disabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = target.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "tap-ripple";
  ripple.style.setProperty("--ripple-x", `${e.clientX - rect.left}px`);
  ripple.style.setProperty("--ripple-y", `${e.clientY - rect.top}px`);
  target.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});
document.getElementById("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) switchView(tab.dataset.view);
});
document.getElementById("filters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  activeFilter = e.target.dataset.filter;
  drawCards();
});
document.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => {
  const f = t.dataset.filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === f));
  activeFilter = f;
  drawCards();
}));
document.getElementById("search").addEventListener("input", (e) => {
  searchTerm = e.target.value.toLowerCase().trim();
  drawCards();
});
document.getElementById("sort").addEventListener("change", (e) => { sortBy = e.target.value; drawCards(); });
document.getElementById("cards").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card?.dataset.ticker) return;

  const moreButton = e.target.closest(".card-more");
  if (moreButton) {
    e.preventDefault();
    moreButton.blur();
  }
  openCardModal(card.dataset.ticker);
});
document.getElementById("manual-update")?.addEventListener("click", openUpdateModal);
document.getElementById("slip-file")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  setSlipStatus(file ? `เลือกไฟล์แล้ว: ${file.name}` : "ยังไม่ได้เลือกไฟล์");
});
document.getElementById("slip-read")?.addEventListener("click", readDimeSlip);
document.getElementById("jn-add")?.addEventListener("click", addManualJournalItem);
document.getElementById("jn-export")?.addEventListener("click", exportJournalItems);
document.getElementById("jn-import-file")?.addEventListener("change", importJournalItemsFromFile);
document.getElementById("jn-list")?.addEventListener("click", (e) => {
  const del = e.target.closest(".jn-del");
  if (del?.dataset.id) deleteJournalItem(del.dataset.id);
  const approve = e.target.closest(".jn-approve");
  if (approve?.dataset.id) approvePendingDimeSlip(approve.dataset.id);
  const cancel = e.target.closest(".jn-cancel");
  if (cancel?.dataset.id) cancelPendingDimeSlip(cancel.dataset.id);
});
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
  if (e.target.id === "force-refresh") {
    closeModal();
    refreshLatestData();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
window.addEventListener("resize", () => moveGlider(document.querySelector(".tab.active")));

// init
moveGlider(document.querySelector(".tab.active"));
renderJournal();
load(false);
