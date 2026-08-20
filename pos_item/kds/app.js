import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { adminEmail, firebaseConfig } from "../firebase-config.js";

const states = {
  NEW: { label: "新規", action: "調理を開始", next: "COOKING" },
  COOKING: { label: "調理中", action: "提供待ちにする", next: "READY" },
  READY: { label: "提供待ち", action: "提供完了", next: "DONE" },
  DONE: { label: "完了", action: "新規へ戻す", next: "NEW" },
  CANCELLED: { label: "取消", action: "新規へ戻す", next: "NEW" }
};

const els = {
  login: document.querySelector("#login-button"),
  logout: document.querySelector("#logout-button"),
  loginMessage: document.querySelector("#login-message"),
  app: document.querySelector("#kds-app"),
  summary: document.querySelector("#summary"),
  filters: document.querySelector("#filters"),
  notice: document.querySelector("#notice"),
  orders: document.querySelector("#orders"),
  template: document.querySelector("#order-template"),
  demo: document.querySelector("#demo-button"),
  connection: document.querySelector("#connection-status")
};

const localStateKey = "festival-pos-kds-order-states-v1";
let selectedFilter = "ACTIVE";
let orders = [];
let productsById = new Map();
let unsubscribeEvents = null;
let unsubscribeProducts = null;
let showingDemo = false;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function savedStates() {
  try { return JSON.parse(localStorage.getItem(localStateKey) ?? "{}"); }
  catch { return {}; }
}

function setOrderState(documentNo, state) {
  const statesByDocument = savedStates();
  statesByDocument[documentNo] = state;
  localStorage.setItem(localStateKey, JSON.stringify(statesByDocument));
  render();
}

function isTopping(line) {
  const category = String(productsById.get(line.product_id)?.category ?? "").replaceAll("　", " ");
  const name = String(line.product_name ?? "").trim();
  return category.includes("トッピング") || /^(\+|＋|追加[：:]?)/.test(name);
}

function groupLines(lines = []) {
  const groups = [];
  for (const line of lines) {
    if (isTopping(line) && groups.length > 0) {
      groups[groups.length - 1].toppings.push(line);
    } else if (isTopping(line)) {
      groups.push({ line: { ...line, product_name: "追加・単品" }, toppings: [line], singleTopping: true });
    } else {
      groups.push({ line, toppings: [], singleTopping: false });
    }
  }
  return groups;
}

function displayOrder(event) {
  const payload = event.payload ?? {};
  const sequence = Number(payload.sequence_no ?? 0);
  return {
    id: event.id,
    documentNo: payload.document_no,
    exchangeNumber: String(sequence % 100).padStart(2, "0"),
    terminal: String(payload.terminal_id ?? "").padStart(3, "0"),
    confirmedAt: Number(payload.confirmed_at ?? event.clientCreatedAt ?? Date.now()),
    lines: Array.isArray(payload.lines) ? payload.lines : [],
    cancelled: false
  };
}

function buildOrders(events) {
  const cancelled = new Set(
    events
      .filter((event) => event.eventType === "DOCUMENT_CONFIRMED" && event.payload?.type === "CANCEL")
      .map((event) => event.payload?.original_document_no)
      .filter(Boolean)
  );
  return events
    .filter((event) => event.eventType === "DOCUMENT_CONFIRMED" && event.payload?.type === "SALE")
    .map(displayOrder)
    .map((order) => ({ ...order, cancelled: cancelled.has(order.documentNo) }))
    .sort((left, right) => left.confirmedAt - right.confirmedAt);
}

function orderState(order) {
  if (order.cancelled) return "CANCELLED";
  return savedStates()[order.documentNo] ?? "NEW";
}

function renderFilters() {
  const filters = [
    ["ACTIVE", "進行中"], ["NEW", "新規"], ["COOKING", "調理中"],
    ["READY", "提供待ち"], ["DONE", "完了"], ["CANCELLED", "取消"]
  ];
  els.filters.replaceChildren(...filters.map(([value, label]) => {
    const button = document.createElement("button");
    button.className = `button filter ${selectedFilter === value ? "active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => { selectedFilter = value; render(); });
    return button;
  }));
}

function lineText(line) {
  const quantity = Number(line.quantity ?? 1);
  return `${line.product_name ?? "商品"} ×${quantity}`;
}

function formatTime(time) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(time);
}

function renderOrder(order) {
  const state = orderState(order);
  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector(".order-card");
  card.dataset.state = state;
  fragment.querySelector(".order-number").textContent = `#${order.exchangeNumber}`;
  fragment.querySelector(".order-meta").textContent = `${formatTime(order.confirmedAt)}　POS ${order.terminal}`;
  fragment.querySelector(".state-badge").textContent = states[state].label;
  const lines = fragment.querySelector(".order-lines");
  for (const group of groupLines(order.lines)) {
    const dish = document.createElement("section");
    dish.className = `dish ${group.singleTopping ? "single-topping" : ""}`;
    const main = document.createElement("p");
    main.className = "dish-main";
    main.textContent = lineText(group.line);
    dish.append(main);
    if (group.toppings.length > 0) {
      const toppings = document.createElement("div");
      toppings.className = "toppings";
      for (const toppingLine of group.toppings) {
        const topping = document.createElement("span");
        topping.className = "topping";
        topping.textContent = `＋ ${lineText(toppingLine).replace(/^[＋+]/, "").trim()}`;
        toppings.append(topping);
      }
      dish.append(toppings);
    }
    lines.append(dish);
  }
  const action = document.createElement("button");
  action.className = "state-action";
  action.textContent = states[state].action;
  action.addEventListener("click", () => setOrderState(order.documentNo, states[state].next));
  fragment.querySelector(".order-actions").append(action);
  return fragment;
}

function render() {
  renderFilters();
  const counts = Object.keys(states).reduce((result, state) => ({ ...result, [state]: 0 }), {});
  for (const order of orders) counts[orderState(order)] += 1;
  els.summary.textContent = `新規 ${counts.NEW}件　調理中 ${counts.COOKING}件　提供待ち ${counts.READY}件`;
  const visibleOrders = orders.filter((order) => {
    const state = orderState(order);
    if (selectedFilter === "ACTIVE") return ["NEW", "COOKING", "READY"].includes(state);
    return state === selectedFilter;
  });
  els.orders.replaceChildren();
  if (visibleOrders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "表示する注文はありません。";
    els.orders.append(empty);
  } else {
    for (const order of visibleOrders) els.orders.append(renderOrder(order));
  }
}

function startRealtimeOrders() {
  unsubscribeEvents?.();
  unsubscribeProducts?.();
  showingDemo = false;
  els.connection.textContent = "Firestoreを同期中";
  els.connection.className = "connection";
  unsubscribeProducts = onSnapshot(collection(db, "products"), (snapshot) => {
    productsById = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    render();
  });
  unsubscribeEvents = onSnapshot(
    query(collection(db, "sync_events"), orderBy("clientCreatedAt", "desc"), limit(200)),
    (snapshot) => {
      orders = buildOrders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      els.connection.textContent = "Firestore 接続中";
      els.connection.className = "connection online";
      els.notice.textContent = "";
      render();
    },
    (error) => {
      els.connection.textContent = "Firestore 接続エラー";
      els.connection.className = "connection error";
      els.notice.textContent = `注文を読み込めませんでした：${error.message}`;
    }
  );
}

function showDemo() {
    unsubscribeEvents?.();
    unsubscribeProducts?.();
    showingDemo = true;
    els.loginMessage.hidden = true;
    els.app.hidden = false;
  productsById = new Map([["topping", { category: "トッピング" }]]);
  orders = buildOrders([
    { id: "demo-1", eventType: "DOCUMENT_CONFIRMED", clientCreatedAt: Date.now() - 120000, payload: { type: "SALE", document_no: "0001-401-000101", terminal_id: 401, sequence_no: 101, confirmed_at: Date.now() - 120000, lines: [
      { product_id: "yakisoba", product_name: "焼きそば", quantity: 1 },
      { product_id: "topping", product_name: "大盛り", quantity: 1 },
      { product_id: "topping", product_name: "マヨネーズ", quantity: 1 },
      { product_id: "frank", product_name: "フランクフルト", quantity: 2 }
    ] } },
    { id: "demo-2", eventType: "DOCUMENT_CONFIRMED", clientCreatedAt: Date.now() - 35000, payload: { type: "SALE", document_no: "0001-401-000102", terminal_id: 401, sequence_no: 102, confirmed_at: Date.now() - 35000, lines: [
      { product_id: "drink", product_name: "ラムネ", quantity: 1 },
      { product_id: "topping", product_name: "氷なし", quantity: 1 }
    ] } }
  ]);
  els.connection.textContent = "デモ表示中";
  els.connection.className = "connection";
  els.notice.textContent = "デモ注文です。状態変更はこのブラウザ内だけに保存されます。";
  render();
}

els.login.addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (error) { els.notice.textContent = `Googleログインに失敗しました：${error.message}`; }
});
els.logout.addEventListener("click", () => signOut(auth));
els.demo.addEventListener("click", showDemo);

onAuthStateChanged(auth, (user) => {
  const isAdmin = user?.email?.toLowerCase() === adminEmail.toLowerCase();
  els.login.hidden = Boolean(user);
  els.logout.hidden = !user;
  els.loginMessage.hidden = isAdmin;
  els.app.hidden = !isAdmin;
  if (isAdmin) startRealtimeOrders();
  else {
    unsubscribeEvents?.();
    unsubscribeProducts?.();
    orders = [];
    if (user) els.notice.textContent = "このGoogleアカウントにはKDS利用権限がありません。";
  }
});
