import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../../firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));
const cooking = document.querySelector("#cooking-numbers");
const calling = document.querySelector("#calling-numbers");
const connection = document.querySelector("#connection");
const voiceButton = document.querySelector("#voice-toggle");

let voiceEnabled = false;
let initialSnapshotReceived = false;
let previousCallingIds = new Set();

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

function getJapaneseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((voice) => voice.lang === "ja-JP")
    ?? voices.find((voice) => voice.lang.startsWith("ja"))
    ?? null;
}

function speakNumber(exchangeNumber) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;

  const utterance = new SpeechSynthesisUtterance(
    `番号 ${exchangeNumber}番のお客様、お待たせいたしました。商品をお受け取りください。`
  );
  utterance.lang = "ja-JP";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voice = getJapaneseVoice();
  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}

function updateVoiceButton() {
  voiceButton.textContent = voiceEnabled ? "🔊 音声案内 ON" : "🔇 音声案内 OFF";
  voiceButton.classList.toggle("enabled", voiceEnabled);
  voiceButton.setAttribute("aria-pressed", String(voiceEnabled));
}

voiceButton.addEventListener("click", () => {
  if (!("speechSynthesis" in window)) {
    voiceButton.textContent = "音声案内 非対応";
    voiceButton.disabled = true;
    return;
  }

  voiceEnabled = !voiceEnabled;
  window.speechSynthesis.cancel();
  updateVoiceButton();

  if (voiceEnabled) {
    const confirmation = new SpeechSynthesisUtterance("音声案内を開始しました。");
    confirmation.lang = "ja-JP";
    confirmation.rate = 0.95;
    const voice = getJapaneseVoice();
    if (voice) confirmation.voice = voice;
    window.speechSynthesis.speak(confirmation);
  }
});

updateVoiceButton();

onSnapshot(query(collection(db, "kds_display"), orderBy("confirmedAt", "asc"), limit(200)), (snapshot) => {
  const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const cookingRecords = records.filter((record) => record.status === "COOKING");
  const callingRecords = records.filter((record) => record.status === "CALLING");

  render(cooking, cookingRecords, "現在調理中の番号はありません");
  render(calling, callingRecords, "お呼び出し中の番号はありません");

  const currentCallingIds = new Set(callingRecords.map((record) => record.id));

  if (initialSnapshotReceived) {
    callingRecords
      .filter((record) => !previousCallingIds.has(record.id))
      .forEach((record) => speakNumber(record.exchangeNumber));
  } else {
    initialSnapshotReceived = true;
  }

  previousCallingIds = currentCallingIds;
  connection.textContent = "更新中";
  connection.className = "connection";
}, (error) => {
  connection.textContent = `接続エラー：${error.message}`;
  connection.className = "connection error";
});
