import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { adminEmail, firebaseConfig } from "../firebase-config.js";

const els = {
  app: document.querySelector("#journal-app"), loginMessage: document.querySelector("#login-message"), account: document.querySelector("#account-name"), login: document.querySelector("#login-button"), logout: document.querySelector("#logout-button"),
  terminal: document.querySelector("#terminal-filter"), search: document.querySelector("#search"), net: document.querySelector("#net-sales"), cash: document.querySelector("#cash-sales"), credit: document.querySelector("#credit-sales"), voucher: document.querySelector("#voucher-count"),
  chart: document.querySelector("#sales-chart"), count: document.querySelector("#journal-count"), notice: document.querySelector("#notice"), list: document.querySelector("#journal-list"), template: document.querySelector("#journal-template"), receipt: document.querySelector("#receipt-text"), receiptEmpty: document.querySelector("#receipt-empty")
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
let events = [];
let selectedId = null;
let unsubscribe = null;
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function documentPayload(event) { return event.eventType === "DOCUMENT_CONFIRMED" ? event.payload ?? {} : null; }
function terminalId(event) { const payload = event.payload ?? {}; return String(payload.terminal_id ?? "").padStart(3, "0"); }
function eventLabel(event) {
  const payload = event.payload ?? {};
  if (event.eventType !== "DOCUMENT_CONFIRMED") return payload.purpose === "OPENING_FLOAT" ? "開設時釣銭登録" : event.eventType;
  return ({ SALE: "売上", CORRECTION_SALE: "修正後新伝", CANCEL: "キャンセル", CASH_IN: "入金", CASH_OUT: "出金", SETTLEMENT: "精算", CLOSURE: "閉設" })[payload.type] ?? payload.type ?? "伝票";
}
function eventNo(event) { const payload = event.payload ?? {}; return payload.document_no ?? payload.record_no ?? event.eventId; }
function eventTime(event) { const payload = event.payload ?? {}; return Number(payload.confirmed_at ?? payload.inspected_at ?? event.clientCreatedAt ?? 0); }
function eventAmount(event) { const payload = event.payload ?? {}; return Number(payload.total_yen ?? payload.actual_balance_yen ?? 0); }
function filteredEvents() {
  const terminal = els.terminal.value;
  const keyword = els.search.value.trim().toLocaleLowerCase("ja-JP");
  return events.filter((event) => {
    const payload = event.payload ?? {};
    const text = `${eventNo(event)} ${eventLabel(event)} ${JSON.stringify(payload.lines ?? [])}`.toLocaleLowerCase("ja-JP");
    return (terminal === "ALL" || terminalId(event) === terminal) && (!keyword || text.includes(keyword));
  });
}
function updateTerminalOptions() {
  const current = els.terminal.value;
  const terminals = [...new Set(events.map(terminalId).filter(Boolean))].sort();
  els.terminal.replaceChildren(new Option("全端末", "ALL"), ...terminals.map((value) => new Option(`POS ${value}`, value)));
  els.terminal.value = terminals.includes(current) ? current : "ALL";
}
function updateSummary(records) {
  let net = 0; let cash = 0; let credit = 0; let voucher = 0;
  records.forEach((event) => {
    const payload = documentPayload(event); if (!payload) return;
    if (["SALE", "CORRECTION_SALE", "CANCEL"].includes(payload.type)) net += Number(payload.total_yen ?? 0);
    (payload.payments ?? []).forEach((payment) => {
      if (payment.type === "CASH") cash += Number(payment.amount_yen ?? 0);
      if (payment.type === "EXTERNAL_CREDIT") credit += Number(payment.amount_yen ?? 0);
      if (payment.type === "VOUCHER") voucher += Number(payment.voucher_count ?? 0);
    });
  });
  els.net.textContent = yen.format(net); els.cash.textContent = yen.format(cash); els.credit.textContent = yen.format(credit); els.voucher.textContent = `${voucher}枚`;
}
function updateChart(records) {
  const totals = new Map();
  records.forEach((event) => {
    const payload = documentPayload(event); if (!payload || !["SALE", "CORRECTION_SALE", "CANCEL"].includes(payload.type)) return;
    const key = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(eventTime(event));
    totals.set(key, (totals.get(key) ?? 0) + Number(payload.total_yen ?? 0));
  });
  const entries = [...totals.entries()].slice(-7);
  const max = Math.max(1, ...entries.map(([, value]) => Math.abs(value)));
  els.chart.replaceChildren();
  if (!entries.length) { els.chart.textContent = "売上データがありません。"; return; }
  entries.forEach(([day, amount]) => { const item = document.createElement("div"); item.className = "chart-day"; item.innerHTML = `<span class="chart-value">${yen.format(amount)}</span><div class="chart-bar" style="height:${Math.max(4, Math.abs(amount) / max * 110)}px"></div><span>${day}</span>`; els.chart.append(item); });
}
function select(event) {
  selectedId = event.id;
  const text = event.payload?.receipt_text;
  els.receiptEmpty.hidden = Boolean(text);
  els.receipt.hidden = !text;
  els.receipt.textContent = text ?? "この伝票はレシート本文が保存される前のデータです。";
  if (!text) els.receiptEmpty.hidden = false;
  render();
}
function render() {
  const records = filteredEvents();
  updateSummary(records); updateChart(records);
  els.count.textContent = `${records.length}件 / 直近${events.length}件`;
  els.list.replaceChildren();
  if (!records.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "該当する記録はありません。"; els.list.append(empty); return; }
  records.forEach((event) => {
    const fragment = els.template.content.cloneNode(true); const row = fragment.querySelector(".journal-row");
    row.classList.toggle("selected", selectedId === event.id);
    fragment.querySelector(".journal-title").textContent = `${eventLabel(event)}　${eventNo(event)}`;
    fragment.querySelector(".journal-meta").textContent = `${dateTime.format(eventTime(event))}　POS ${terminalId(event)}`;
    const amount = fragment.querySelector(".journal-amount"); amount.textContent = yen.format(eventAmount(event)); amount.classList.toggle("negative", eventAmount(event) < 0);
    row.onclick = () => select(event); els.list.append(fragment);
  });
}

els.login.onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { els.notice.textContent = `Googleログインに失敗しました：${error.message}`; } };
els.logout.onclick = () => signOut(auth); els.terminal.onchange = render; els.search.oninput = render;
onAuthStateChanged(auth, (user) => {
  unsubscribe?.(); unsubscribe = null;
  const isAdmin = user?.email?.toLocaleLowerCase() === adminEmail.toLocaleLowerCase();
  els.account.textContent = user?.email ?? "ログインしていません"; els.login.hidden = Boolean(user); els.logout.hidden = !user; els.app.hidden = !isAdmin; els.loginMessage.hidden = isAdmin;
  if (!isAdmin) { if (user) els.notice.textContent = "このアカウントには閲覧権限がありません。"; return; }
  unsubscribe = onSnapshot(query(collection(db, "sync_events"), orderBy("clientCreatedAt", "desc"), limit(200)), (snapshot) => {
    events = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); updateTerminalOptions(); els.notice.textContent = ""; render();
  }, (error) => { els.notice.textContent = `電子ジャーナルを読み込めませんでした：${error.message}`; });
});
