// ═══════════════════════════════════════════════════════════════
// AI Stock Signal — dashboard logic
// ═══════════════════════════════════════════════════════════════
const SIG_CLASS = { "STRONG BUY": "s-strong", "BUY": "s-buy", "WATCH": "s-watch", "AVOID": "s-avoid" };
const scoreColor = (s) => (s >= 75 ? "#00e676" : s >= 60 ? "#00c853" : s >= 45 ? "#ffc24b" : "#ff5a5a");

let ALL = [];
let BT = {};
let META = {}; // account size, risk %
let activeFilter = "ALL";
let searchTerm = "";
let sortBy = "score";
let gid = 0; // unique gradient ids
let lastGenerated = null;       // เช็คว่าข้อมูลเปลี่ยนไหมตอน auto-refresh
const REFRESH_MS = 60000;       // รีเฟรชหน้าเว็บอัตโนมัติทุก 1 นาที

// ── data loading ──
async function load(isRefresh = false) {
  try {
    const res = await fetch("data/signals.json?_=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    // ตอน auto-refresh: ถ้าข้อมูลยังไม่เปลี่ยน ไม่ต้อง re-render (กันกระพริบ)
    if (!isRefresh || data.generated_at !== lastGenerated) {
      lastGenerated = data.generated_at;
      renderSignals(data);
      if (isRefresh) flashLive();
    }
  } catch (e) {
    if (!isRefresh) {
      document.getElementById("updated").textContent = "โหลดข้อมูลไม่สำเร็จ";
      document.getElementById("cards").innerHTML =
        `<div class="empty">ยังไม่มีข้อมูล — รัน <code>python run.py</code> หรือรอ GitHub Actions ทำงานครั้งแรก<br><small>(${e.message})</small></div>`;
    }
  }
  loadBacktest();
  loadPerformance();
}

function flashLive() {
  const b = document.getElementById("live-badge");
  if (!b) return;
  b.classList.add("flash");
  setTimeout(() => b.classList.remove("flash"), 1200);
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

// ── render: signals ──
function renderSignals(data) {
  ALL = data.signals || [];
  META = { account: data.account_size, risk: data.risk_per_trade_pct };
  document.getElementById("updated").textContent = "อัปเดต: " + (data.generated_at || "-");
  renderRegime(data.regime);
  const s = data.summary || {};
  countUp("s-strong", s.strong_buy ?? 0);
  countUp("s-buy", s.buy ?? 0);
  countUp("s-watch", s.watch ?? 0);
  countUp("s-avoid", s.avoid ?? 0);
  drawCards();
}

function drawCards() {
  let list = ALL.filter((x) =>
    (activeFilter === "ALL" || x.signal === activeFilter) &&
    (x.name.toLowerCase().includes(searchTerm) || x.ticker.toLowerCase().includes(searchTerm)));

  list.sort((a, b) => {
    if (sortBy === "change") return b.change_pct - a.change_pct;
    if (sortBy === "name") return a.name.localeCompare(b.name, "th");
    return b.score - a.score;
  });

  document.getElementById("empty").classList.toggle("hidden", list.length > 0);
  const wrap = document.getElementById("cards");
  wrap.innerHTML = list.map((x, i) => cardHTML(x, i)).join("");
  wrap.querySelectorAll(".card").forEach((el) =>
    el.addEventListener("click", () => openModal(el.dataset.ticker)));
}

function cardHTML(x, i) {
  const cls = SIG_CLASS[x.signal] || "s-watch";
  const up = x.change_pct >= 0;
  return `
  <div class="card ${cls}" data-ticker="${x.ticker}" style="animation-delay:${Math.min(i * 35, 400)}ms">
    <div class="card-top">
      <div><div class="name">${x.name}</div><div class="ticker">${x.ticker}</div></div>
      <span class="badge ${cls}">${x.signal}</span>
    </div>
    <div class="card-mid">
      <div class="price-block">
        <span class="price">${fmt(x.price)}</span>
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
  </div>`;
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
  return `<div class="rec rec-${r.tone}"><span class="rec-label">คำแนะนำ</span><span class="rec-action">${r.action}</span></div>`;
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
function renderRegime(r) {
  const el = document.getElementById("regime-banner");
  if (!el) return;
  if (!r) { el.classList.add("hidden"); return; }
  const map = { BULL: ["bull", "🟢"], NEUTRAL: ["neutral", "🟡"], BEAR: ["bear", "🔴"], UNKNOWN: ["neutral", "⚪"] };
  const [cls, emo] = map[r.regime] || map.UNKNOWN;
  el.className = "regime-banner " + cls;
  el.innerHTML = `<span class="rg-emo">${emo}</span>
    <div><b>ภาวะตลาด: ${r.label}</b>
    <small>breadth ${r.breadth}% ของหุ้นยืนเหนือ EMA20 (${r.uptrend}/${r.stocks} ตัว)${r.regime === "BEAR" ? " · ระบบจะแจ้งเฉพาะสัญญาณแข็งแรงมาก" : ""}</small></div>`;
  const pill = document.getElementById("market-status");
  if (pill) pill.textContent = "SET · " + r.regime;
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
function openModal(ticker) {
  const x = ALL.find((s) => s.ticker === ticker);
  if (!x) return;
  const cls = SIG_CLASS[x.signal] || "s-watch";
  const reasons = (x.reasons || []).map((r) => `<li>${r}</li>`).join("");
  const warns = (x.warnings || []).map((w) => `<li>${w}</li>`).join("");

  const r = recOf(x);
  document.getElementById("modal-content").innerHTML = `
    <div class="md-head"><h2>${x.name}</h2><span class="badge ${cls}">${x.signal}</span></div>
    <div class="md-sub">${x.ticker} · ${fmt(x.price)} บาท
      <span class="change ${x.change_pct >= 0 ? "up" : "down"}">${x.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(x.change_pct).toFixed(2)}%</span></div>

    <div class="rec-banner rec-${r.tone}">${r.text}</div>

    <div class="md-chart">${sparkline(x.history, 510, 110)}</div>

    ${newsSection(x)}

    <div class="md-section"><h3>จุดเข้า / จุดออก (ประเมินคร่าวๆ)</h3>
      <div class="levels">
        <div class="level"><div class="lv-l">จุดเข้า ~</div><div class="lv-v">${fmt(x.entry)}</div></div>
        <div class="level sl"><div class="lv-l">ตัดขาดทุน</div><div class="lv-v">${fmt(x.stop_loss)}</div></div>
        <div class="level tp"><div class="lv-l">เป้า 1 / 2</div><div class="lv-v">${fmt(x.target1)}<br><small style="font-size:12px">${fmt(x.target2)}</small></div></div>
      </div></div>

    ${x.pos_shares ? `<div class="md-section"><h3>ขนาดไม้แนะนำ (เสี่ยง ${META.risk ?? 2}% ของพอร์ต ${(META.account ?? 100000).toLocaleString("th-TH")}฿)</h3>
      <div class="md-row"><span>จำนวนหุ้น</span><span>${x.pos_shares.toLocaleString("th-TH")} หุ้น</span></div>
      <div class="md-row"><span>มูลค่าโดยประมาณ</span><span>${fmt(x.pos_value)} บาท</span></div>
      <div class="md-row"><span>ขาดทุนสูงสุดถ้าโดน stop</span><span style="color:var(--red)">~${fmt((META.account ?? 100000) * (META.risk ?? 2) / 100)} บาท</span></div></div>` : ""}

    <div class="md-section"><h3>ตัวชี้วัด</h3>
      <div class="md-row"><span>คะแนนสัญญาณ</span><span style="color:${scoreColor(x.score)}">${x.score}/100</span></div>
      <div class="md-row"><span>RSI (14)</span><span>${x.rsi}</span></div>
      <div class="md-row"><span>MACD Histogram</span><span>${x.macd_hist}</span></div>
      <div class="md-row"><span>เทรนด์ (EMA20/50)</span><span>${trendIcon(x.trend)} ${x.trend}</span></div>
      <div class="md-row"><span>วอลุ่ม vs เฉลี่ย</span><span>${x.volume_ratio}x</span></div>
      <div class="md-row"><span>โมเมนตัม 5 วัน</span><span>${x.momentum_5d}%</span></div>
    </div>

    ${reasons ? `<div class="md-section"><h3>เหตุผลเชิงบวก</h3><ul class="reason-list">${reasons}</ul></div>` : ""}
    ${warns ? `<div class="md-section"><h3>ข้อควรระวัง</h3><ul class="reason-list warn-list">${warns}</ul></div>` : ""}
    ${backtestSection(x.ticker)}`;
  document.getElementById("modal").classList.remove("hidden");
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

// ── tabs ──
function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById("view-" + view).classList.remove("hidden");
  const tabs = [...document.querySelectorAll(".tab")];
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  moveGlider(tabs.find((t) => t.dataset.view === view));
}
function moveGlider(tab) {
  const g = document.getElementById("glider");
  if (!tab || !g) return;
  g.style.width = tab.offsetWidth + "px";
  g.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
}

// ── events ──
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
document.getElementById("modal-close").addEventListener("click", () =>
  document.getElementById("modal").classList.add("hidden"));
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") document.getElementById("modal").classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.getElementById("modal").classList.add("hidden");
});
window.addEventListener("resize", () => moveGlider(document.querySelector(".tab.active")));

// init
moveGlider(document.querySelector(".tab.active"));
load(false);
setInterval(() => load(true), REFRESH_MS);   // รีเฟรชข้อมูลอัตโนมัติทุก 1 นาที
