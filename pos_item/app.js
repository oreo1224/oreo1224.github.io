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
  doc,
  getFirestore,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { adminEmail, firebaseConfig } from "./firebase-config.js";

const els = {
  adminApp: document.querySelector("#admin-app"),
  loginMessage: document.querySelector("#login-message"),
  accountName: document.querySelector("#account-name"),
  login: document.querySelector("#login-button"),
  logout: document.querySelector("#logout-button"),
  form: document.querySelector("#product-form"),
  editorTitle: document.querySelector("#editor-title"),
  productId: document.querySelector("#product-id"),
  name: document.querySelector("#name"),
  priceYen: document.querySelector("#price-yen"),
  category: document.querySelector("#category"),
  menuCategory: document.querySelector("#menu-category"),
  orderCode: document.querySelector("#order-code"),
  colorCode: document.querySelector("#color-code"),
  sortOrder: document.querySelector("#sort-order"),
  active: document.querySelector("#active"),
  soldOut: document.querySelector("#sold-out"),
  voucherEligible: document.querySelector("#voucher-eligible"),
  toppingAllowed: document.querySelector("#topping-allowed"),
  reset: document.querySelector("#reset-button"),
  filter: document.querySelector("#filter"),
  csvFile: document.querySelector("#csv-file"),
  downloadTemplate: document.querySelector("#download-template-button"),
  exportProducts: document.querySelector("#export-products-button"),
  count: document.querySelector("#product-count"),
  notice: document.querySelector("#notice"),
  list: document.querySelector("#product-list"),
  template: document.querySelector("#product-template")
};

let products = [];
let unsubscribeProducts = null;

function orderStatusPayload(nextProducts) {
  return {
    disabledOrderCodes: nextProducts
      .filter((product) => !product.active || product.soldOut)
      .map((product) => Number(product.orderCode))
      .filter((code) => Number.isSafeInteger(code) && code >= 1 && code <= 9999)
      .sort((left, right) => left - right),
    updatedAt: Date.now()
  };
}

function orderStatusRef() {
  return doc(db, "order_menu_status", "current");
}

function showNotice(message = "") {
  els.notice.textContent = message;
}

function clearEditor() {
  els.form.reset();
  els.productId.value = "";
  els.sortOrder.value = "0";
  els.orderCode.value = "";
  els.colorCode.value = "1";
  els.menuCategory.value = "1";
  els.active.checked = true;
  els.voucherEligible.checked = true;
  els.toppingAllowed.checked = false;
  els.editorTitle.textContent = "商品を登録";
}

function productPayload(existing) {
  const name = els.name.value.trim();
  const priceYen = Number(els.priceYen.value);
  const sortOrder = Number(els.sortOrder.value);
  const category = els.category.value.trim();
  const menuCategory = Number(els.menuCategory.value);
  const colorCode = Number(els.colorCode.value);
  const orderCode = Number(els.orderCode.value);
  if (!name) throw new Error("商品名を入力してください。");
  if (!Number.isSafeInteger(priceYen) || priceYen < 0) throw new Error("販売価格は0円以上の整数で入力してください。");
  if (!Number.isSafeInteger(sortOrder)) throw new Error("表示順は整数で入力してください。");
  if (category.length > 40) throw new Error("カテゴリは40文字以内で入力してください。");
  if (!Number.isSafeInteger(menuCategory) || menuCategory < 1 || menuCategory > 9) throw new Error("メニューセットは1〜9で入力してください。");
  if (!Number.isSafeInteger(colorCode) || colorCode < 1 || colorCode > 8) throw new Error("商品ボタン色は1〜8で選択してください。");
  if (!Number.isSafeInteger(orderCode) || orderCode < 1 || orderCode > 9999) throw new Error("商品コードは1〜9999で入力してください。");
  if (products.some((product) => product.id !== existing?.id && product.orderCode === orderCode)) throw new Error(`商品コード ${orderCode} は既に使われています。`);
  const now = Date.now();
  return {
    name,
    priceYen,
    category,
    menuCategory,
    sortOrder,
    active: els.active.checked,
    soldOut: els.soldOut.checked,
    voucherEligible: els.voucherEligible.checked,
    toppingAllowed: els.toppingAllowed.checked,
    colorCode,
    orderCode,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function csvBoolean(value, fallback) {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLocaleLowerCase("ja-JP");
  if (["true", "1", "yes", "on", "はい", "販売", "可", "売切"].includes(normalized)) return true;
  if (["false", "0", "no", "off", "いいえ", "停止", "不可", "在庫あり"].includes(normalized)) return false;
  throw new Error(`真偽値「${value}」を解釈できません。true/false または 1/0 を使ってください。`);
}

function csvRecord(headers, row) {
  const data = Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));
  const name = data.name || data["商品名"];
  const price = data.priceYen || data["販売価格"] || data["価格"];
  const category = data.category || data["カテゴリ"] || "";
  const menuCategory = Number(data.menuCategory || data["メニューセット"] || "1");
  const sortOrder = data.sortOrder || data["表示順"] || "0";
  const color = data.colorCode || data["色"] || "1";
  const code = data.orderCode || data["商品コード"] || "";
  if (!name) throw new Error("商品名（name）が空です。");
  const priceYen = Number(price);
  const order = Number(sortOrder);
  const colorCode = Number(color);
  const orderCode = Number(code);
  if (!Number.isSafeInteger(priceYen) || priceYen < 0) throw new Error(`「${name}」の販売価格が不正です。`);
  if (!Number.isSafeInteger(order)) throw new Error(`「${name}」の表示順が不正です。`);
  if (!Number.isSafeInteger(menuCategory) || menuCategory < 1 || menuCategory > 9) throw new Error(`「${name}」のメニューセットは1〜9で指定してください。`);
  if (!Number.isSafeInteger(colorCode) || colorCode < 1 || colorCode > 8) throw new Error(`「${name}」の商品ボタン色は1〜8で指定してください。`);
  if (!Number.isSafeInteger(orderCode) || orderCode < 1 || orderCode > 9999) throw new Error(`「${name}」の商品コードは1〜9999で指定してください。`);
  return {
    id: data.id,
    name,
    priceYen,
    category,
    menuCategory,
    sortOrder: order,
    active: csvBoolean(data.active || data["販売対象"], true),
    soldOut: csvBoolean(data.soldOut || data["売切"], false),
    voucherEligible: csvBoolean(data.voucherEligible || data["引換券利用可"], true),
    toppingAllowed: csvBoolean(data.toppingAllowed || data["トッピング選択可"], false),
    colorCode,
    orderCode
  };
}

async function importCsv(file) {
  const rows = csvRows(await file.text());
  if (rows.length < 2) throw new Error("ヘッダー行と商品行を含むCSVを選択してください。");
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  if (!headers.includes("name") && !headers.includes("商品名")) {
    throw new Error("CSVのヘッダーに name または 商品名 が必要です。");
  }
  const records = rows.slice(1).map((row) => csvRecord(headers, row));
  if (records.length > 200) throw new Error("一度に登録できるのは200件までです。");
  const batch = writeBatch(db);
  const existingById = new Map(products.map((product) => [product.id, product]));
  const nextProducts = [...products];
  const now = Date.now();
  let created = 0;
  let updated = 0;
  for (const record of records) {
    const existing = record.id ? existingById.get(record.id) : null;
    const reference = record.id ? doc(db, "products", record.id) : doc(collection(db, "products"));
    const { id: unusedId, ...product } = record;
    batch.set(reference, {
      ...product,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    const nextProduct = { id: reference.id, ...product, createdAt: existing?.createdAt ?? now, updatedAt: now };
    const nextIndex = nextProducts.findIndex((item) => item.id === reference.id);
    if (nextIndex >= 0) nextProducts[nextIndex] = nextProduct;
    else nextProducts.push(nextProduct);
    if (existing) updated += 1;
    else created += 1;
  }
  batch.set(orderStatusRef(), orderStatusPayload(nextProducts));
  await batch.commit();
  return { created, updated };
}

function badge(text, kind = "") {
  const element = document.createElement("span");
  element.className = `badge ${kind}`;
  element.textContent = text;
  return element;
}

function renderProducts() {
  const keyword = els.filter.value.trim().toLocaleLowerCase("ja-JP");
  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.category}`.toLocaleLowerCase("ja-JP");
    return !keyword || haystack.includes(keyword);
  });
  els.list.replaceChildren();
  els.count.textContent = `${filtered.length}件 / 全${products.length}件`;
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "該当する商品はありません。";
    els.list.append(empty);
    return;
  }
  for (const product of filtered) {
    const fragment = els.template.content.cloneNode(true);
    fragment.querySelector(".product-name").textContent = product.name;
    fragment.querySelector(".product-meta").textContent =
      `¥${product.priceYen.toLocaleString("ja-JP")}  /  ${product.category || "カテゴリ未設定"}  /  セット ${product.menuCategory ?? 1}  /  商品コード ${product.orderCode ?? "未設定"}  /  表示順 ${product.sortOrder}  /  色 ${product.colorCode ?? 1}`;
    const badges = fragment.querySelector(".badges");
    badges.append(
      badge(product.active ? "販売対象" : "停止", product.active ? "" : "neutral"),
      badge(product.soldOut ? "売切" : "在庫あり", product.soldOut ? "warn" : ""),
      badge(product.voucherEligible ? "引換券可" : "引換券不可", product.voucherEligible ? "" : "neutral"),
      badge(product.toppingAllowed ? "トッピング可" : "トッピングなし", product.toppingAllowed ? "" : "neutral")
    );
    fragment.querySelector(".edit-button").addEventListener("click", () => {
      els.productId.value = product.id;
      els.name.value = product.name;
      els.priceYen.value = product.priceYen;
      els.category.value = product.category;
      els.menuCategory.value = product.menuCategory ?? 1;
      els.sortOrder.value = product.sortOrder;
      els.orderCode.value = product.orderCode ?? "";
      els.colorCode.value = product.colorCode ?? 1;
      els.active.checked = product.active;
      els.soldOut.checked = product.soldOut;
      els.voucherEligible.checked = product.voucherEligible;
      els.toppingAllowed.checked = product.toppingAllowed ?? false;
      els.editorTitle.textContent = `「${product.name}」を編集`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    fragment.querySelector(".delete-button").addEventListener("click", async () => {
      if (!window.confirm(`「${product.name}」を削除しますか？\nこの操作は取り消せません。`)) return;
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, "products", product.id));
        batch.set(orderStatusRef(), orderStatusPayload(products.filter((item) => item.id !== product.id)));
        await batch.commit();
        showNotice("");
        clearEditor();
      } catch (error) {
        showNotice(`削除できませんでした：${error.message}`);
      }
    });
    els.list.append(fragment);
  }
}

let auth;
let db;
try {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
} catch (error) {
  showNotice(`Firebase設定を読み込めませんでした：${error.message}`);
}

els.login.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    showNotice(`Googleログインに失敗しました：${error.message}`);
  }
});

els.logout.addEventListener("click", () => signOut(auth));
els.reset.addEventListener("click", clearEditor);
els.filter.addEventListener("input", renderProducts);
els.downloadTemplate.addEventListener("click", () => {
  const csv = [
    "id,name,priceYen,category,menuCategory,sortOrder,orderCode,colorCode,active,soldOut,voucherEligible,toppingAllowed",
    ",焼きそば,500,フード,1,10,1,1,true,false,true,false",
    ",フランクフルト,300,フード,1,20,2,4,true,false,true,false"
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "festival-pos-products-template.csv";
  link.click();
  URL.revokeObjectURL(url);
});
els.exportProducts.addEventListener("click", () => {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = ["id", "name", "priceYen", "category", "menuCategory", "sortOrder", "orderCode", "colorCode", "active", "soldOut", "voucherEligible", "toppingAllowed"];
  const rows = products.map((product) => header.map((key) => escapeCell(product[key])).join(","));
  const url = URL.createObjectURL(new Blob(["\uFEFF", [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "festival-pos-products.csv";
  link.click();
  URL.revokeObjectURL(url);
});
els.csvFile.addEventListener("change", async () => {
  const [file] = els.csvFile.files;
  if (!file) return;
  if (!window.confirm(`「${file.name}」を読み込みます。\n同じidの既存商品は更新され、idなしの行は新規登録されます。`)) return;
  try {
    const result = await importCsv(file);
    showNotice(`CSVを反映しました。新規 ${result.created}件、更新 ${result.updated}件。`);
  } catch (error) {
    showNotice(`CSVを反映できませんでした：${error.message}`);
  } finally {
    els.csvFile.value = "";
  }
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = els.productId.value;
  const existing = products.find((product) => product.id === id);
  try {
    const payload = productPayload(existing);
    const reference = id ? doc(db, "products", id) : doc(collection(db, "products"));
    const nextProduct = { id: reference.id, ...payload };
    const nextProducts = existing
      ? products.map((product) => product.id === existing.id ? nextProduct : product)
      : [...products, nextProduct];
    const batch = writeBatch(db);
    batch.set(reference, payload);
    batch.set(orderStatusRef(), orderStatusPayload(nextProducts));
    await batch.commit();
    showNotice("");
    clearEditor();
  } catch (error) {
    showNotice(`保存できませんでした：${error.message}`);
  }
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    unsubscribeProducts?.();
    unsubscribeProducts = null;
    const isAdmin = user?.email?.toLocaleLowerCase() === adminEmail.toLocaleLowerCase();
    els.login.hidden = Boolean(user);
    els.logout.hidden = !user;
    els.accountName.textContent = user?.email ?? "ログインしていません";
    els.adminApp.hidden = !isAdmin;
    els.loginMessage.hidden = isAdmin;
    if (user && !isAdmin) {
      showNotice(`このアカウント（${user.email}）には商品編集の権限がありません。`);
      els.loginMessage.querySelector("p").textContent = "許可された管理者Googleアカウントでログインしてください。";
    } else if (!user) {
      showNotice("");
    }
    if (!isAdmin) return;
    showNotice("");
    unsubscribeProducts = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        products = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ja"));
        renderProducts();
      },
      (error) => showNotice(`商品一覧を読み込めませんでした：${error.message}`)
    );
  });
}
