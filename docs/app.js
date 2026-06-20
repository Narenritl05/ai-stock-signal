// app.js — โหลดข้อมูล signals.json แล้วแสดงผลบน dashboard

const SIG_CLASS = {
  "STRONG BUY": "strong",
  "BUY": "buy",
  "WATCH": "watch",
  "AVOID": "avoid",
};
const SCORE_COLOR = (score) =>
  score >= 75 ? "var(--green)" : score >= 60 ? "var(--green-dim)"
  : score >= 45 ? "var(--amber)" : "var(--red)";

let ALL = [];
let BT = {};            // map: ticker -> ผล backtest
let activeFilter = "ALL";
let searchTerm = "";

async function load() {
  try {
    const res = await fetch("data/signals.json?_=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    render(data);
  } catch (e) {
    document.getElementById("updated").textContent = "โหลดข้อมูลไม่สำเร็จ";
    document.getElementById("cards").innerHTML =
      `<div class="empty">ยังไม่มีข้อมูล — รัน <code>python run.py</code> หรือรอ GitHub Actions ทำงานครั้งแรก<br><small>(${e.message})</small></div>`;
  }
  loadBacktest();   // โหลดผล backtest (ถ้ามี) — ไม่บังคับ
}

async function loadBacktest() {
  try {
    const res = await fetch("data/backtest.json?_=" + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    (data.results || []).forEach((r) => (BT[r.ticker] = r));
    const o = data.overall || {};
    const el = document.getElementById("bt-summary");
    if (el && o.total_trades) {
      el.classList.remove("hidden");
      el.innerHTML =
        `🧪 <b>Backtest ${data.period || ""}</b> · ทดสอบ ${o.stocks_tested} หุ้น · ` +
        `${o.total_trades} เทรด · อัตราชนะ <b>${o.overall_win_rate}%</b> · ` +
        `กำไรเฉลี่ย/เทรด <b>${o.avg_return_per_trade}%</b>` +
        `<span class="bt-note"> (อดีตไม่การันตีอนาคต · ยังไม่รวมค่าธรรมเนียม)</span>`;
    }
  } catch (e) { /* ไม่มี backtest ก็ข้ามไป */ }
}

function render(data) {
  ALL = data.signals || [];
  document.getElementById("updated").textContent =
    "อัปเดตล่าสุด: " + (data.generated_at || "-");

  const s = data.summary || {};
  document.getElementById("s-strong").textContent = s.strong_buy ?? 0;
  document.getElementById("s-buy").textContent = s.buy ?? 0;
  document.getElementById("s-watch").textContent = s.watch ?? 0;
  document.getElementById("s-avoid").textContent = s.avoid ?? 0;

  draw();
}

function draw() {
  const wrap = document.getElementById("cards");
  let list = ALL.filter((x) =>
    (activeFilter === "ALL" || x.signal === activeFilter) &&
    (x.name.toLowerCase().includes(searchTerm) ||
     x.ticker.toLowerCase().includes(searchTerm))
  );

  document.getElementById("empty").classList.toggle("hidden", list.length > 0);
  wrap.innerHTML = list.map(cardHTML).join("");

  document.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("click", () => openModal(el.dataset.ticker));
  });
}

function cardHTML(x) {
  const cls = SIG_CLASS[x.signal] || "watch";
  const up = x.change_pct >= 0;
  return `
  <div class="card" data-ticker="${x.ticker}">
    <div class="card-top">
      <div>
        <div class="name">${x.name}</div>
        <div class="ticker">${x.ticker}</div>
      </div>
      <span class="badge ${cls}">${x.signal}</span>
    </div>
    <div class="price-row">
      <span class="price">${fmt(x.price)}</span>
      <span class="change ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(x.change_pct).toFixed(2)}%</span>
    </div>
    <div class="score-wrap">
      <div class="score-head"><span>คะแนนสัญญาณ</span><b>${x.score}/100</b></div>
      <div class="score-bar"><div class="score-fill" style="width:${x.score}%;background:${SCORE_COLOR(x.score)}"></div></div>
    </div>
    <div class="metrics">
      <div class="metric"><div class="m-lbl">RSI</div><div class="m-val">${x.rsi}</div></div>
      <div class="metric"><div class="m-lbl">เทรนด์</div><div class="m-val">${trendIcon(x.trend)}</div></div>
      <div class="metric"><div class="m-lbl">วอลุ่ม</div><div class="m-val">${x.volume_ratio}x</div></div>
    </div>
  </div>`;
}

function trendIcon(t) {
  if (t === "UP") return "📈";
  if (t === "UP-WEAK") return "↗";
  if (t === "DOWN") return "📉";
  return "→";
}

function fmt(n) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function backtestSection(ticker) {
  const b = BT[ticker];
  if (!b || !b.trades) return "";
  const wr = b.win_rate;
  const wrColor = wr >= 55 ? "var(--green)" : wr >= 45 ? "var(--amber)" : "var(--red)";
  const totColor = b.total_return >= 0 ? "var(--green)" : "var(--red)";
  return `
    <div class="md-section">
      <h3>ผลทดสอบย้อนหลัง (Backtest)</h3>
      <div class="md-row"><span>จำนวนเทรด</span><span>${b.trades} ครั้ง</span></div>
      <div class="md-row"><span>อัตราชนะ</span><span style="color:${wrColor}">${wr}%</span></div>
      <div class="md-row"><span>กำไรเฉลี่ย/เทรด</span><span>${b.avg_return}%</span></div>
      <div class="md-row"><span>ผลตอบแทนสะสม</span><span style="color:${totColor}">${b.total_return}%</span></div>
      <div class="md-row"><span>ดี/แย่สุด</span><span>${b.best}% / ${b.worst}%</span></div>
      <div class="md-row"><span>ถือเฉลี่ย</span><span>${b.avg_hold} วัน</span></div>
      <p class="bt-disclaimer">อิงข้อมูลในอดีต ไม่การันตีผลในอนาคต และยังไม่หักค่าคอมมิชชั่น/ภาษี</p>
    </div>`;
}

function openModal(ticker) {
  const x = ALL.find((s) => s.ticker === ticker);
  if (!x) return;
  const cls = SIG_CLASS[x.signal] || "watch";
  const reasons = (x.reasons || []).map((r) => `<li>${r}</li>`).join("");
  const warns = (x.warnings || []).map((w) => `<li>${w}</li>`).join("");

  document.getElementById("modal-content").innerHTML = `
    <div class="md-head">
      <h2>${x.name}</h2>
      <span class="badge ${cls}">${x.signal}</span>
    </div>
    <div class="price-row">
      <span class="price">${fmt(x.price)}</span>
      <span class="change ${x.change_pct >= 0 ? "up" : "down"}">${x.change_pct >= 0 ? "▲" : "▼"} ${Math.abs(x.change_pct).toFixed(2)}%</span>
    </div>

    <div class="md-section">
      <h3>จุดเข้า / จุดออก (ประเมินคร่าวๆ)</h3>
      <div class="levels">
        <div class="level"><div class="lv-lbl">จุดเข้า ~</div><div class="lv-val">${fmt(x.entry)}</div></div>
        <div class="level sl"><div class="lv-lbl">ตัดขาดทุน</div><div class="lv-val">${fmt(x.stop_loss)}</div></div>
        <div class="level tp"><div class="lv-lbl">เป้า 1 / 2</div><div class="lv-val">${fmt(x.target1)}<br><small>${fmt(x.target2)}</small></div></div>
      </div>
    </div>

    <div class="md-section">
      <h3>ตัวชี้วัด</h3>
      <div class="md-row"><span>คะแนนรวม</span><span>${x.score}/100</span></div>
      <div class="md-row"><span>RSI (14)</span><span>${x.rsi}</span></div>
      <div class="md-row"><span>MACD Histogram</span><span>${x.macd_hist}</span></div>
      <div class="md-row"><span>เทรนด์ (EMA20/50)</span><span>${x.trend}</span></div>
      <div class="md-row"><span>วอลุ่ม vs เฉลี่ย</span><span>${x.volume_ratio}x</span></div>
      <div class="md-row"><span>โมเมนตัม 5 วัน</span><span>${x.momentum_5d}%</span></div>
    </div>

    ${reasons ? `<div class="md-section"><h3>เหตุผลเชิงบวก</h3><ul class="reason-list">${reasons}</ul></div>` : ""}
    ${warns ? `<div class="md-section"><h3>ข้อควรระวัง</h3><ul class="reason-list warn-list">${warns}</ul></div>` : ""}
    ${backtestSection(x.ticker)}
  `;
  document.getElementById("modal").classList.remove("hidden");
}

// ── event listeners ──
document.getElementById("filters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  activeFilter = e.target.dataset.filter;
  draw();
});
document.getElementById("search").addEventListener("input", (e) => {
  searchTerm = e.target.value.toLowerCase().trim();
  draw();
});
document.getElementById("modal-close").addEventListener("click", () =>
  document.getElementById("modal").classList.add("hidden"));
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") document.getElementById("modal").classList.add("hidden");
});

load();
