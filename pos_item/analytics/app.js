import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, getFirestore, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { adminEmail, firebaseConfig } from "../firebase-config.js";

const els = {
  app: document.querySelector("#analytics-app"), loginMessage: document.querySelector("#login-message"), account: document.querySelector("#account-name"), login: document.querySelector("#login-button"), logout: document.querySelector("#logout-button"),
  terminal: document.querySelector("#terminal-filter"), period: document.querySelector("#period-filter"), csv: document.querySelector("#csv-input"), reload: document.querySelector("#reload-button"), notice: document.querySelector("#notice"),
  net: document.querySelector("#net-sales"), count: document.querySelector("#sale-count"), average: document.querySelector("#average-sale"), cancel: document.querySelector("#cancel-sales"),
  daily: document.querySelector("#daily-chart"), hourly: document.querySelector("#hourly-chart"), products: document.querySelector("#product-ranking"), payments: document.querySelector("#payment-breakdown")
};
const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore();
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" });
let events = [];
let source = "Firestore";

function payload(event) { return event.eventType === "DOCUMENT_CONFIRMED" ? event.payload ?? {} : null; }
function timestamp(event) { const data = event.payload ?? {}; return Number(data.confirmed_at ?? data.clientCreatedAt ?? 0); }
function terminal(event) { return String(event.payload?.terminal_id ?? "").padStart(3, "0"); }
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

function updateTerminalOptions() {
  const current = els.terminal.value;
  const terminals = [...new Set(events.map(terminal).filter(Boolean))].sort();
  els.terminal.replaceChildren(new Option("全端末", "ALL"), ...terminals.map((id) => new Option(`POS ${id}`, id)));
  els.terminal.value = terminals.includes(current) ? current : "ALL";
}
function filtered() {
  const selectedTerminal = els.terminal.value; const selectedPeriod = els.period.value; const now = Date.now();
  const cutoff = selectedPeriod === "TODAY" ? new Date().setHours(0, 0, 0, 0) : selectedPeriod === "7D" ? now - 7 * 86_400_000 : selectedPeriod === "30D" ? now - 30 * 86_400_000 : 0;
  return events.filter((event) => selectedTerminal === "ALL" || terminal(event) === selectedTerminal).filter((event) => !cutoff || timestamp(event) >= cutoff);
}
function accumulate(records) {
  const total = { net: 0, sales: 0, cancel: 0, daily: new Map(), hourly: new Map(), products: new Map(), payments: new Map() };
  records.forEach((event) => {
    const data = payload(event); if (!sale(data)) return;
    const amount = Number(data.total_yen ?? 0); const time = timestamp(event);
    total.net += amount; if (data.type === "CANCEL") total.cancel += amount; else total.sales += 1;
    const day = date.format(time); total.daily.set(day, (total.daily.get(day) ?? 0) + amount);
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
  renderBars(els.daily, [...data.daily.entries()], 14); renderBars(els.hourly, [...data.hourly.entries()].sort(([a], [b]) => a - b).map(([hour, amount]) => [`${hour}時`, amount]), 24);
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
  try { const snapshot = await getDocs(query(collection(db, "sync_events"), orderBy("clientCreatedAt", "desc"), limit(200))); events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); source = "Firestore（直近200件）"; updateTerminalOptions(); render(); }
  catch (error) { els.notice.textContent = `売上データを読み込めませんでした：${error.message}`; }
  finally { els.reload.disabled = false; }
}
async function importCsv(file) {
  if (!file) return;
  els.notice.textContent = "POS電子ジャーナルCSVを読み込み中…";
  try {
    const imported = parsePosCsv(await file.text());
    if (!imported.length) throw new Error("CSV内に集計対象の伝票がありません。");
    events = imported; source = `端末CSV（${file.name}）`; updateTerminalOptions(); render();
  } catch (error) { els.notice.textContent = `CSVを読み込めませんでした：${error.message}`; }
  finally { els.csv.value = ""; }
}
els.login.onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { els.notice.textContent = `Googleログインに失敗しました：${error.message}`; } };
els.logout.onclick = () => signOut(auth); els.terminal.onchange = render; els.period.onchange = render; els.reload.onclick = load; els.csv.onchange = () => importCsv(els.csv.files[0]);
onAuthStateChanged(auth, (user) => { const admin = user?.email?.toLocaleLowerCase() === adminEmail.toLocaleLowerCase(); els.account.textContent = user?.email ?? "ログインしていません"; els.login.hidden = Boolean(user); els.logout.hidden = !user; els.app.hidden = !admin; els.loginMessage.hidden = admin; if (admin) load(); else if (user) els.notice.textContent = "このアカウントには閲覧権限がありません。"; });
