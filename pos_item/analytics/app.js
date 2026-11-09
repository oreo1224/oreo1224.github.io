import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, getFirestore, limit, orderBy, query, startAfter, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { adminEmail, firebaseConfig } from "../firebase-config.js";

const els = {
  app: document.querySelector("#analytics-app"), loginMessage: document.querySelector("#login-message"), account: document.querySelector("#account-name"), login: document.querySelector("#login-button"), logout: document.querySelector("#logout-button"),
  terminals: document.querySelector("#terminal-options"), terminalSummary: document.querySelector("#terminal-selection-summary"), terminalSelectAll: document.querySelector("#terminal-select-all"), terminalClearAll: document.querySelector("#terminal-clear-all"),
  period: document.querySelector("#period-filter"), dateRange: document.querySelector("#custom-date-range"), startDate: document.querySelector("#start-date"), endDate: document.querySelector("#end-date"), dateError: document.querySelector("#date-range-error"),
  csv: document.querySelector("#csv-input"), reload: document.querySelector("#reload-button"), notice: document.querySelector("#notice"),
  exportJson: document.querySelector("#export-json-button"), exportReport: document.querySelector("#export-report-button"), exportExcel: document.querySelector("#export-excel-button"), reportType: document.querySelector("#export-report-type"), exportStatus: document.querySelector("#export-status"),
  net: document.querySelector("#net-sales"), count: document.querySelector("#sale-count"), average: document.querySelector("#average-sale"), cancel: document.querySelector("#cancel-sales"),
  daily: document.querySelector("#daily-chart"), hourly: document.querySelector("#hourly-chart"), products: document.querySelector("#product-ranking"), payments: document.querySelector("#payment-breakdown")
};
const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore();
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" });
let events = [];
let source = "Firestore";
let sourceKind = "firestore";
// null means all available terminals; an empty Set means no terminals selected.
let selectedTerminals = null;

function payload(event) { return event.eventType === "DOCUMENT_CONFIRMED" ? event.payload ?? {} : null; }
function timestamp(event) { const data = event.payload ?? {}; return Number(data.confirmed_at ?? data.clientCreatedAt ?? 0); }
function terminal(event) { const value = event.payload?.terminal_id; return value == null || value === "" ? "" : String(value).padStart(3, "0"); }
function sale(data) { return ["SALE", "CORRECTION_SALE", "CANCEL"].includes(data?.type); }
function label(type) { return ({ CASH: "現金", EXTERNAL_CREDIT: "クレジット端末", VOUCHER: "引換券", REPLACEMENT_VOUCHER: "代替値引券", CARRYOVER: "打替繰越" })[type] ?? type; }

function csvRows(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.length)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.length)) rows.push(row);
  return rows;
}
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function parseLines(value) {
  if (!value) return [];
  return value.split(" | ").map((entry) => {
    const match = entry.match(/^(.*?)\s+(-?\d+)x(-?\d+)=(-?\d+)$/);
    if (!match) return null;
    return { product_name: match[1], unit_price_yen: number(match[2]), quantity: number(match[3]), line_total_yen: number(match[4]) };
  }).filter(Boolean);
}
function parsePayments(value) {
  if (!value) return [];
  return value.split(" | ").map((entry) => {
    const [type, amount, ...metadata] = entry.split(":");
    return { type, amount_yen: number(amount), voucher_count: number(metadata.find((part) => part.endsWith("枚"))?.replace("枚", "")), tendered_yen: number(metadata.find((part) => part.startsWith("預"))?.replace("預", "")), change_yen: number(metadata.find((part) => part.startsWith("釣"))?.replace("釣", "")) };
  }).filter((payment) => payment.type);
}
function parsePosCsv(text) {
  const [header, ...rows] = csvRows(text); if (!header) throw new Error("CSVが空です。");
  const fields = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
  const required = ["record_type", "timestamp", "terminal_id", "type", "total_yen"];
  if (!required.every((name) => name in fields)) throw new Error("POS電子ジャーナルCSVの形式ではありません。");
  return rows.filter((row) => row[fields.record_type] === "DOCUMENT").map((row, index) => {
    const get = (name) => row[fields[name]] ?? "";
    return { id: `csv-${index}-${get("record_no")}`, eventType: "DOCUMENT_CONFIRMED", payload: {
      document_no: get("record_no"), confirmed_at: number(get("timestamp")), store_id: number(get("store_id")), terminal_id: number(get("terminal_id")), type: get("type"), status: get("status"), operator_name: get("operator_name"), manager_name: get("manager_name"), original_document_no: get("original_document_no"), cancel_document_no: get("cancel_document_no"), related_document_no: get("related_document_no"), subtotal_yen: number(get("subtotal_yen")), total_yen: number(get("total_yen")), lines: parseLines(get("lines")), payments: parsePayments(get("payments"))
    }};
  });
}

function updateTerminalSummary() {
  const total = els.terminals.querySelectorAll('input[type="checkbox"]').length;
  const selected = selectedTerminals === null ? total : selectedTerminals.size;
  els.terminalSummary.textContent = !total ? "対象端末なし" : selected === total ? `全${total}端末を選択中` : `${selected} / ${total}端末を選択中`;
}
function updateTerminalOptions(resetSelection = false) {
  if (resetSelection) selectedTerminals = null;
  const terminalIds = [...new Set(events.map(terminal).filter(Boolean))].sort();
  if (selectedTerminals !== null) {
    selectedTerminals = new Set([...selectedTerminals].filter((id) => terminalIds.includes(id)));
  }
  if (!terminalIds.length) {
    const empty = document.createElement("span");
    empty.className = "filter-empty";
    empty.textContent = "端末データがありません";
    els.terminals.replaceChildren(empty);
  } else {
    els.terminals.replaceChildren(...terminalIds.map((id) => {
      const option = document.createElement("label");
      option.className = "terminal-checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = id;
      checkbox.checked = selectedTerminals === null || selectedTerminals.has(id);
      const name = document.createElement("span");
      name.textContent = `POS ${id}`;
      option.append(checkbox, name);
      return option;
    }));
  }
  updateTerminalSummary();
}
function dateBoundary(value, nextDay = false) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day + (nextDay ? 1 : 0)).getTime();
}
function filtered() {
  const selectedPeriod = els.period.value;
  const custom = selectedPeriod === "CUSTOM";
  const startDate = els.startDate.value;
  const endDate = els.endDate.value;
  const invalidRange = custom && startDate && endDate && startDate > endDate;
  els.dateError.hidden = !invalidRange;
  if (invalidRange) return [];

  const now = Date.now();
  const cutoff = custom ? dateBoundary(startDate)
    : selectedPeriod === "TODAY" ? new Date().setHours(0, 0, 0, 0)
    : selectedPeriod === "7D" ? now - 7 * 86_400_000
    : selectedPeriod === "30D" ? now - 30 * 86_400_000 : null;
  // The end date is inclusive: use the start of the following local day as an exclusive bound.
  const endExclusive = custom ? dateBoundary(endDate, true) : null;
  return events.filter((event) => {
    const time = timestamp(event);
    return (selectedTerminals === null || selectedTerminals.has(terminal(event)))
      && (cutoff === null || time >= cutoff)
      && (endExclusive === null || time < endExclusive);
  });
}
function accumulate(records) {
  const total = { net: 0, sales: 0, cancel: 0, daily: new Map(), hourly: new Map(), products: new Map(), payments: new Map() };
  records.forEach((event) => {
    const data = payload(event); if (!sale(data)) return;
    const amount = Number(data.total_yen ?? 0); const time = timestamp(event);
    total.net += amount; if (data.type === "CANCEL") total.cancel += amount; else total.sales += 1;
    const completed = new Date(time);
    const day = [completed.getFullYear(), String(completed.getMonth() + 1).padStart(2, "0"), String(completed.getDate()).padStart(2, "0")].join("-");
    total.daily.set(day, (total.daily.get(day) ?? 0) + amount);
    const hour = new Date(time).getHours(); total.hourly.set(hour, (total.hourly.get(hour) ?? 0) + amount);
    (data.lines ?? []).forEach((line) => { const name = line.product_name ?? line.productName ?? "名称未設定"; const quantity = Number(line.quantity ?? 0); const lineTotal = Number(line.line_total_yen ?? line.unit_price_yen ?? line.price_yen ?? 0) * (line.line_total_yen == null ? quantity : 1); const current = total.products.get(name) ?? { quantity: 0, amount: 0 }; current.quantity += quantity; current.amount += lineTotal; total.products.set(name, current); });
    (data.payments ?? []).forEach((payment) => total.payments.set(payment.type ?? "OTHER", (total.payments.get(payment.type ?? "OTHER") ?? 0) + Number(payment.amount_yen ?? 0)));
  });
  return total;
}
function renderBars(element, entries, maxCount = 10) {
  element.replaceChildren(); const trimmed = entries.slice(-maxCount); const max = Math.max(1, ...trimmed.map(([, value]) => Math.abs(value)));
  if (!trimmed.length) { element.textContent = "該当する売上がありません。"; return; }
  trimmed.forEach(([name, amount]) => { const item = document.createElement("div"); item.className = "bar-item"; item.innerHTML = `<span>${yen.format(amount)}</span><div class="bar ${amount < 0 ? "negative" : ""}" style="height:${Math.max(5, Math.abs(amount) / max * 150)}px"></div><small>${name}</small>`; element.append(item); });
}
function render() {
  const records = filtered(); const data = accumulate(records);
  els.net.textContent = yen.format(data.net); els.count.textContent = `${data.sales}件`; els.average.textContent = yen.format(data.sales ? data.net / data.sales : 0); els.cancel.textContent = yen.format(data.cancel);
  renderBars(els.daily, [...data.daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, amount]) => [date.format(new Date(`${day}T12:00:00`)), amount]), 14); renderBars(els.hourly, [...data.hourly.entries()].sort(([a], [b]) => a - b).map(([hour, amount]) => [`${hour}時`, amount]), 24);
  els.products.replaceChildren(); const ranked = [...data.products.entries()].filter(([, value]) => value.quantity || value.amount).sort(([, a], [, b]) => b.amount - a.amount).slice(0, 10);
  if (!ranked.length) els.products.innerHTML = "<li class=\"muted\">該当する商品がありません。</li>";
  ranked.forEach(([name, value]) => { const item = document.createElement("li"); item.innerHTML = `<strong>${name}</strong><span>${value.quantity}点　${yen.format(value.amount)}</span>`; els.products.append(item); });
  els.payments.replaceChildren(); const paymentEntries = [...data.payments.entries()].filter(([, amount]) => amount);
  if (!paymentEntries.length) els.payments.textContent = "該当する決済がありません。";
  paymentEntries.sort(([, a], [, b]) => b - a).forEach(([type, amount]) => { const row = document.createElement("div"); row.className = "breakdown-row"; row.innerHTML = `<span>${label(type)}</span><strong class="${amount < 0 ? "negative" : ""}">${yen.format(amount)}</strong>`; els.payments.append(row); });
  els.notice.textContent = `${source}：読み込み済み ${events.length}件のうち、条件一致 ${records.length}件を集計しています。リアルタイム監視は行いません。`;
}
async function load() {
  els.reload.disabled = true; els.notice.textContent = "売上データを読み込み中…";
  try {
    const loaded = [];
    let lastDocument = null;
    for (const pageSize of [200, 200, 100]) {
      const constraints = [orderBy("clientCreatedAt", "desc")];
      if (lastDocument) constraints.push(startAfter(lastDocument));
      constraints.push(limit(pageSize));
      const snapshot = await getDocs(query(collection(db, "sync_events"), ...constraints));
      loaded.push(...snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      if (snapshot.size < pageSize) break;
      lastDocument = snapshot.docs[snapshot.docs.length - 1];
    }
    events = loaded;
    source = "Firestore（直近最大500件）";
    sourceKind = "firestore";
    updateTerminalOptions();
    render();
  }
  catch (error) { els.notice.textContent = `売上データを読み込めませんでした：${error.message}`; }
  finally { els.reload.disabled = false; }
}
async function importCsv(file) {
  if (!file) return;
  els.notice.textContent = "POS電子ジャーナルCSVを読み込み中…";
  try {
    const imported = parsePosCsv(await file.text());
    if (!imported.length) throw new Error("CSV内に集計対象の伝票がありません。");
    events = imported; source = `端末CSV（${file.name}）`; sourceKind = "csv"; updateTerminalOptions(true); render();
  } catch (error) { els.notice.textContent = `CSVを読み込めませんでした：${error.message}`; }
  finally { els.csv.value = ""; }
}


function localDateString(value) {
  const dateValue = new Date(value);
  return [dateValue.getFullYear(), String(dateValue.getMonth() + 1).padStart(2, "0"), String(dateValue.getDate()).padStart(2, "0")].join("-");
}
function exportPeriodBounds() {
  const preset = els.period.value;
  const now = Date.now();
  if (preset === "ALL") throw new Error("JSON保存には「今日」「直近7日」「直近30日」または「日付を指定」を選んでください。");
  if (preset === "CUSTOM") {
    if (!els.startDate.value || !els.endDate.value) throw new Error("開始日と終了日の両方を指定してください。");
    if (els.startDate.value > els.endDate.value) throw new Error("開始日は終了日以前にしてください。");
    return { preset, startMs: dateBoundary(els.startDate.value), endExclusiveMs: dateBoundary(els.endDate.value, true) };
  }
  if (preset === "TODAY") {
    return { preset, startMs: new Date().setHours(0, 0, 0, 0), endExclusiveMs: dateBoundary(localDateString(now), true) };
  }
  if (preset === "7D" || preset === "30D") {
    return { preset, startMs: now - (preset === "7D" ? 7 : 30) * 86_400_000, endExclusiveMs: now + 1 };
  }
  throw new Error("期間指定が不正です。");
}
async function exportJournalJson() {
  if (els.exportJson.disabled) return;
  els.exportStatus.textContent = "";
  let bounds;
  try {
    bounds = exportPeriodBounds();
    if (selectedTerminals !== null && selectedTerminals.size === 0) throw new Error("出力するレジ端末を1つ以上選択してください。");
    if (auth.currentUser?.email?.toLocaleLowerCase() !== adminEmail.toLocaleLowerCase()) throw new Error("管理者アカウントでのログインが必要です。");
  } catch (error) {
    els.exportStatus.textContent = error.message;
    return;
  }

  const terminals = selectedTerminals === null ? null : new Set(selectedTerminals);
  const activeSource = sourceKind;
  els.exportJson.disabled = true;
  try {
    const records = [];
    if (activeSource === "csv") {
      // CSV imports only include document-confirmation records.
      records.push(...events.filter((event) => {
        const time = timestamp(event);
        return time >= bounds.startMs && time < bounds.endExclusiveMs
          && (terminals === null || terminals.has(terminal(event)));
      }));
    } else {
      // Firestore rules allow a maximum of 200 records per list request.
      // Query by the stored event time, rather than limiting exports to the 500 loaded for charts.
      let cursor = null;
      let readCount = 0;
      while (true) {
        const constraints = [
          where("clientCreatedAt", ">=", bounds.startMs),
          where("clientCreatedAt", "<", bounds.endExclusiveMs),
          orderBy("clientCreatedAt", "desc")
        ];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(200));
        const snapshot = await getDocs(query(collection(db, "sync_events"), ...constraints));
        readCount += snapshot.size;
        for (const doc of snapshot.docs) {
          const event = { id: doc.id, ...doc.data() };
          if (terminals === null || terminals.has(terminal(event))) records.push(event);
        }
        els.exportStatus.textContent = `Firestoreから${readCount}件読み込み中…（出力対象${records.length}件）`;
        if (snapshot.size < 200) break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
      }
    }

    const data = {
      format: "festival-pos-journal-v1",
      exportedAt: new Date().toISOString(),
      source: activeSource === "firestore" ? "Firestore sync_events" : "POS electronic journal CSV",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeField: activeSource === "firestore" ? "clientCreatedAt" : "payload.confirmed_at",
      period: {
        preset: bounds.preset,
        startInclusive: new Date(bounds.startMs).toISOString(),
        endExclusive: new Date(bounds.endExclusiveMs).toISOString()
      },
      terminalIds: terminals === null ? null : [...terminals].sort(),
      count: records.length,
      events: records
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const start = localDateString(bounds.startMs);
    const end = localDateString(bounds.endExclusiveMs - 1);
    anchor.download = `pos-journal-${start}_to_${end}.json`;
    anchor.href = url;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    els.exportStatus.textContent = `${records.length}件のJSONダウンロードを開始しました。`;
  } catch (error) {
    // Do not save a partial export if any Firestore page failed.
    els.exportStatus.textContent = `JSON出力に失敗しました：${error.message}`;
  } finally {
    els.exportJson.disabled = false;
  }
}


function reportCsvRows(records, kind) {
  const buckets = new Map();
  const bucket = (map, key) => {
    if (!map.has(key)) map.set(key, { amount: 0, count: 0, quantity: 0 });
    return map.get(key);
  };
  let net = 0, count = 0, cancelled = 0;
  const daily = new Map(), hourly = new Map(), products = new Map(), payments = new Map(), terminals = new Map();
  for (const event of records) {
    const data = payload(event);
    if (!sale(data)) continue;
    const amount = number(data.total_yen);
    const isSale = data.type !== "CANCEL";
    net += amount;
    if (isSale) count += 1; else cancelled += amount;
    const dateValue = new Date(timestamp(event));
    if (!Number.isFinite(dateValue.getTime())) continue;
    const day = localDateString(dateValue.getTime()), hour = dateValue.getHours();
    for (const [map, key] of [[daily, day], [hourly, hour], [terminals, terminal(event) || "未設定"]]) {
      const item = bucket(map, key); item.amount += amount; if (isSale) item.count += 1;
    }
    for (const line of data.lines ?? []) {
      const key = line.product_name ?? line.productName ?? "名称未設定";
      const item = bucket(products, key);
      const quantity = number(line.quantity);
      item.quantity += quantity;
      item.amount += line.line_total_yen == null ? number(line.unit_price_yen ?? line.price_yen) * quantity : number(line.line_total_yen);
    }
    for (const payment of data.payments ?? []) {
      const item = bucket(payments, payment.type ?? "OTHER");
      item.amount += number(payment.amount_yen);
      if (isSale) item.count += 1;
    }
  }
  const sorted = (map, compare) => [...map.entries()].sort(compare);
  switch (kind) {
    case "summary": return [["項目", "値"], ["純売上(円)", net], ["会計件数", count], ["平均会計額(円)", count ? Math.round(net / count) : 0], ["キャンセル額(円)", cancelled], ["集計対象イベント件数", records.length]];
    case "daily": return [["日付", "純売上(円)", "会計件数", "平均会計額(円)"], ...sorted(daily, ([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, v.amount, v.count, v.count ? Math.round(v.amount / v.count) : 0])];
    case "hourly": return [["時間帯", "純売上(円)", "会計件数", "平均会計額(円)"], ...Array.from({ length: 24 }, (_, h) => { const v = hourly.get(h) ?? { amount: 0, count: 0 }; return [String(h).padStart(2, "0") + ":00", v.amount, v.count, v.count ? Math.round(v.amount / v.count) : 0]; })];
    case "products": return [["商品名", "販売数量(純数)", "純売上(円)", "売上構成比(%)"], ...sorted(products, ([, a], [, b]) => b.amount - a.amount).map(([key, v]) => [key, v.quantity, v.amount, net ? (v.amount / net * 100).toFixed(2) : "0.00"])];
    case "payments": {
      const paymentNet = [...payments.values()].reduce((sum, v) => sum + v.amount, 0);
      const paymentCount = [...payments.values()].reduce((sum, v) => sum + v.count, 0);
      return [["決済方法", "決済件数", "純決済額(円)", "件数比率(%)", "金額比率(%)"], ...sorted(payments, ([, a], [, b]) => b.amount - a.amount).map(([key, v]) => [label(key), v.count, v.amount, paymentCount ? (v.count / paymentCount * 100).toFixed(2) : "0.00", paymentNet ? (v.amount / paymentNet * 100).toFixed(2) : "0.00"])];
    }
    case "terminals": return [["端末ID", "純売上(円)", "会計件数", "平均会計額(円)"], ...sorted(terminals, ([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, v.amount, v.count, v.count ? Math.round(v.amount / v.count) : 0])];
    default: throw new Error("出力項目が不正です。");
  }
}
function downloadCsv(rows, filename) {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    // Quote cells so commas, newlines and spreadsheet formula-like text remain data.
    const safe = /^[=+@\t\r]/.test(text) || /^-\D/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const csv = "\uFEFF" + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

let excelJsPromise;
function ensureExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const urls = [
        "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
        "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"
      ];
      const load = (index) => {
        if (index >= urls.length) {
          reject(new Error("Excelライブラリの取得に失敗しました。ネットワーク接続を確認してください。"));
          return;
        }
        const fallbackScript = document.createElement("script");
        fallbackScript.src = urls[index];
        fallbackScript.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : load(index + 1);
        fallbackScript.onerror = () => load(index + 1);
        document.head.append(fallbackScript);
      };
      load(0);
    }).catch((error) => { excelJsPromise = null; throw error; });
  }
  return excelJsPromise;
}
async function downloadWorkbook(records, filename, bounds, terminals) {
  const ExcelJS = await ensureExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Festival POS Analytics";
  workbook.created = new Date();
  const formats = [
    ["summary", "売上サマリー"],
    ["payments", "決済方法別"],
    ["hourly", "時間帯別"],
    ["daily", "日別売上"],
    ["products", "商品別売上"],
    ["terminals", "端末別売上"]
  ];
  const overview = workbook.addWorksheet("出力条件");
  const metadata = [
    ["項目", "値"],
    ["集計開始日", bounds.startMs === null ? "全期間" : localDateString(bounds.startMs)],
    ["集計終了日", bounds.endExclusiveMs === null ? "全期間" : localDateString(bounds.endExclusiveMs - 1)],
    ["対象端末", terminals === null ? "すべて" : [...terminals].sort().join(", ")],
    ["データソース", sourceKind === "firestore" ? "Firestore sync_events" : "POS電子ジャーナルCSV"],
    ["対象イベント件数", records.length],
    ["出力日時", new Date().toLocaleString("ja-JP")],
    ["備考", "売上・修正後新伝・取消を相殺した純額で集計。決済件数は決済手段の記録件数で、複数決済は重複計上。"]
  ];
  const sheets = [[overview, metadata], ...formats.map(([key, name]) => [workbook.addWorksheet(name), reportCsvRows(records, key)])];
  for (const [sheet, rows] of sheets) {
    for (const row of rows) {
      // Keep user-supplied strings as literal text rather than executable spreadsheet formulas.
      sheet.addRow(row.map((value) => typeof value === "string" && /^[=+@\\t\\r]/.test(value) ? "'" + value : value));
    }
    const columns = rows[0]?.length ?? 1;
    for (let i = 1; i <= columns; i++) {
      const widest = rows.reduce((max, row) => Math.max(max, String(row[i - 1] ?? "").length), 0);
      sheet.getColumn(i).width = Math.min(48, Math.max(14, widest + 3));
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (rows.length > 1) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length, column: columns } };
    const header = sheet.getRow(1);
    header.height = 24;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14213D" } };
      cell.alignment = { vertical: "middle" };
    });
    for (let rowIndex = 2; rowIndex <= rows.length; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      if (rowIndex % 2 === 0) row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5FA" } };
      });
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0;[Red]-#,##0";
      });
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportAnalytics(format = "csv") {
  if (els.exportReport.disabled || els.exportExcel.disabled) return;
  els.exportStatus.textContent = "";
  let bounds;
  try {
    bounds = els.period.value === "ALL" ? { preset: "ALL", startMs: null, endExclusiveMs: null } : exportPeriodBounds();
    if (selectedTerminals !== null && selectedTerminals.size === 0) throw new Error("出力するレジ端末を1つ以上選択してください。");
    if (auth.currentUser?.email?.toLocaleLowerCase() !== adminEmail.toLocaleLowerCase()) throw new Error("管理者アカウントでのログインが必要です。");
  } catch (error) { els.exportStatus.textContent = error.message; return; }
  const terminals = selectedTerminals === null ? null : new Set(selectedTerminals);
  els.exportReport.disabled = true;
  els.exportExcel.disabled = true;
  els.exportJson.disabled = true;
  try {
    const records = [];
    if (sourceKind === "csv") {
      records.push(...events.filter((event) => {
        const time = timestamp(event);
        return (bounds.startMs === null || time >= bounds.startMs) && (bounds.endExclusiveMs === null || time < bounds.endExclusiveMs) && (terminals === null || terminals.has(terminal(event)));
      }));
    } else {
      let cursor = null, scanned = 0;
      while (true) {
        const constraints = bounds.preset === "ALL"
          ? [orderBy("clientCreatedAt", "desc")]
          : [
              where("clientCreatedAt", ">=", bounds.startMs),
              where("clientCreatedAt", "<", bounds.endExclusiveMs),
              orderBy("clientCreatedAt", "desc")
            ];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(200));
        const snapshot = await getDocs(query(collection(db, "sync_events"), ...constraints));
        scanned += snapshot.size;
        for (const doc of snapshot.docs) {
          const event = { id: doc.id, ...doc.data() };
          if (terminals === null || terminals.has(terminal(event))) records.push(event);
        }
        els.exportStatus.textContent = `Firestoreから${scanned}件取得中…（対象${records.length}件）`;
        if (snapshot.size < 200) break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
      }
    }
    const recordTimes = records.map(timestamp).filter((time) => Number.isFinite(time) && time > 0);
    const start = bounds.startMs === null ? (recordTimes.length ? localDateString(Math.min(...recordTimes)) : "all") : localDateString(bounds.startMs);
    const end = bounds.endExclusiveMs === null ? (recordTimes.length ? localDateString(Math.max(...recordTimes)) : "all") : localDateString(bounds.endExclusiveMs - 1);
    if (format === "xlsx") {
      els.exportStatus.textContent = `${records.length}件のデータをExcelブックに変換中…`;
      await downloadWorkbook(records, `pos-analytics-${start}_to_${end}.xlsx`, bounds, terminals);
      els.exportStatus.textContent = `${records.length}件を集計し、全6項目のExcelブックを保存しました。`;
    } else {
      const kind = els.reportType.value;
      const rows = reportCsvRows(records, kind);
      downloadCsv(rows, `pos-analytics-${kind}-${start}_to_${end}.csv`);
      els.exportStatus.textContent = `${records.length}件を集計し、${kind}のCSVダウンロードを開始しました。`;
    }
  } catch (error) {
    els.exportStatus.textContent = `集計${format === "xlsx" ? "Excel" : "CSV"}出力に失敗しました：${error.message}`;
  } finally {
    els.exportReport.disabled = false; els.exportExcel.disabled = false; els.exportJson.disabled = false;
  }
}

els.login.onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { els.notice.textContent = `Googleログインに失敗しました：${error.message}`; } };
els.logout.onclick = () => signOut(auth);
els.terminals.onchange = (event) => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  const options = [...els.terminals.querySelectorAll('input[type="checkbox"]')];
  const checked = options.filter((option) => option.checked).map((option) => option.value);
  selectedTerminals = checked.length === options.length ? null : new Set(checked);
  updateTerminalSummary();
  render();
};
els.terminalSelectAll.onclick = () => { selectedTerminals = null; els.terminals.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = true; }); updateTerminalSummary(); render(); };
els.terminalClearAll.onclick = () => { selectedTerminals = new Set(); els.terminals.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; }); updateTerminalSummary(); render(); };
els.period.onchange = () => { els.dateRange.hidden = els.period.value !== "CUSTOM"; render(); };
els.startDate.onchange = render;
els.endDate.onchange = render;
els.reload.onclick = load;
els.exportJson.onclick = exportJournalJson;
els.exportReport.onclick = () => exportAnalytics("csv");
els.exportExcel.onclick = () => exportAnalytics("xlsx");
els.csv.onchange = () => importCsv(els.csv.files[0]);
onAuthStateChanged(auth, (user) => { const admin = user?.email?.toLocaleLowerCase() === adminEmail.toLocaleLowerCase(); els.account.textContent = user?.email ?? "ログインしていません"; els.login.hidden = Boolean(user); els.logout.hidden = !user; els.app.hidden = !admin; els.loginMessage.hidden = admin; if (admin) load(); else if (user) els.notice.textContent = "このアカウントには閲覧権限がありません。"; });
