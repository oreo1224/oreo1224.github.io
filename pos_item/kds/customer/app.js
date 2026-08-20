import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../../firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));
const cooking = document.querySelector("#cooking-numbers");
const calling = document.querySelector("#calling-numbers");
const connection = document.querySelector("#connection");

function render(target, records, emptyText) {
  target.replaceChildren();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  records.forEach((record) => {
    const number = document.createElement("div");
    number.className = "number";
    number.textContent = record.exchangeNumber;
    target.append(number);
  });
}

onSnapshot(query(collection(db, "kds_display"), orderBy("confirmedAt", "asc"), limit(200)), (snapshot) => {
  const records = snapshot.docs.map((item) => item.data());
  render(cooking, records.filter((record) => record.status === "COOKING"), "現在調理中の番号はありません");
  render(calling, records.filter((record) => record.status === "CALLING"), "お呼び出し中の番号はありません");
  connection.textContent = "更新中";
  connection.className = "connection";
}, (error) => {
  connection.textContent = `接続エラー：${error.message}`;
  connection.className = "connection error";
});
