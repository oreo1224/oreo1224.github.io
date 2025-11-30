// --- JSONファイルパスの定義 ---
const DATA_URL_WEEKDAY = "data/train_data_weekday.json"; // 平日用時刻表データ
const DATA_URL_WEEKEND = "data/train_data_weekend.json"; // 土休日用時刻表データ
const STATUS_URL = "data/train_status.json"; // 運行状況データ

const COUNT_LIMIT = 4; // 表示する電車の最大本数

// === 運行情報関連の閾値 (秒) ===
const THRESHOLD_GRAY = 6 * 60; // 6分 (360秒) 未満でグレーアウト
const THRESHOLD_RED = 7 * 60; // 7分 (420秒) 未満で赤色
const THRESHOLD_YELLOW = 10 * 60; // 10分 (600秒) 未満で黄色

let trainsData = []; // 元データ（5本目以降も含む）を格納
let displayTrains = []; // 実際に表示する4本のデータを格納

/**
 * 現在の曜日が土曜日または日曜日かを判定する
 * @returns {boolean} 土休日の場合はtrue
 */
function isWeekend() {
  const today = new Date();
  const day = today.getDay(); // 0:日, 1:月, ..., 6:土
  // 2025/11/30 (現在時刻) は日曜日(0)なので、この実行時点では true
  return day === 0 || day === 6;
}

/**
 * 残り秒数を「MM:SS」形式に変換
 * @param {number} totalSeconds - 残り秒数
 * @returns {string} フォーマットされた文字列
 */
function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * 'HH:MM'形式の時刻文字列を、今日のその時刻のDateオブジェクトに変換
 * 時刻が過去の場合は翌日と見なすロジックを含む。
 * @param {string} timeStr - 'HH:MM'形式の時刻
 * @returns {Date} その時刻のDateオブジェクト
 */
function parseDepartureTime(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  let departure = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0
  );

  // 現在時刻より過去の発車時刻（ただし、許容誤差として1分は過去までOKとする）
  if (departure.getTime() < now.getTime() - 60 * 1000) {
    // 時刻が過去なら、それは日付を跨いだ翌日の時刻とみなす
    departure.setDate(departure.getDate() + 1);
  }

  return departure;
}

/**
 * 運行情報を取得し、表示を更新する関数
 */
async function fetchAndRenderStatus() {
  try {
    // キャッシュ対策としてランダムなクエリパラメータを追加
    const response = await fetch(STATUS_URL + "?t=" + Date.now());
    const statusData = await response.json();
    const status = statusData.status;

    // 運行情報の表示
    const alertElement = document.getElementById("alert-message");
    if (status.is_normal) {
      alertElement.textContent = "（平常運転）";
      alertElement.style.color = "green";
      alertElement.style.backgroundColor = "#d4edda";
    } else {
      alertElement.textContent = `🚨 ${status.message || "運行情報に注意"}`;
      alertElement.style.color = "red";
      alertElement.style.backgroundColor = "#f8d7da";
    }
  } catch (error) {
    console.error("運行情報の取得に失敗しました:", error);
  }
}

/**
 * データの取得と初期化（時刻表データのみ）
 */
async function initializeData() {
  // 曜日によって読み込む時刻表JSONファイルを決定
  const targetUrl = isWeekend() ? DATA_URL_WEEKEND : DATA_URL_WEEKDAY;

  try {
    const response = await fetch(targetUrl); // 時刻表はキャッシュされても問題なし
    const data = await response.json();

    trainsData = data.trains;

    // 元データ（trainsData）から、すでに発車済みの電車をフィルタリング
    const now = new Date();
    const futureTrains = trainsData.filter((train) => {
      const depTime = parseDepartureTime(train.departure_time);
      return depTime.getTime() > now.getTime();
    });

    // 表示用のデータセットを作成
    displayTrains = futureTrains.slice(0, COUNT_LIMIT);

    // 初回描画
    renderTrainList();

    // 運行状況をまず読み込む
    fetchAndRenderStatus();

    // カウントダウンを開始
    setInterval(updateCountdown, 1000);

    // 運行状況を30秒ごとに更新 (GitHub Actionsが3分ごとにファイルを更新するため、頻繁にチェック)
    setInterval(fetchAndRenderStatus, 30000);
  } catch (error) {
    console.error(
      `時刻表データの取得または解析に失敗しました (${targetUrl}):`,
      error
    );
    document.getElementById(
      "countdown-list"
    ).innerHTML = `<p style="color:red; font-weight:bold;">時刻表データ（${
      isWeekend() ? "土休日" : "平日"
    }）の読み込みに失敗しました。ファイルパスと形式を確認してください。</p>`;
  }
}

/**
 * 電車リスト全体を描画する
 */
function renderTrainList() {
  const listElement = document.getElementById("countdown-list");
  listElement.innerHTML = ""; // リストをクリア

  if (displayTrains.length === 0) {
    listElement.innerHTML = "<p>現在、表示可能な電車情報はありません。</p>";
    return;
  }

  displayTrains.forEach((train, index) => {
    const now = new Date();
    const departureTime = parseDepartureTime(train.departure_time);
    const remainingMs = departureTime.getTime() - now.getTime();
    const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));

    const row = document.createElement("div");
    row.className = "train-row";
    row.dataset.departure = train.departure_time; // 発車時刻を保存

    row.innerHTML = `
            <div class="train-details">
                <strong>${train.departure_time}</strong> ${train.destination}
            </div>
            <div class="countdown-display" id="countdown-${index}">
                ${formatTime(remainingSec)}
            </div>
        `;
    listElement.appendChild(row);
  });
}

/**
 * 1秒ごとのカウントダウン更新処理
 */
function updateCountdown() {
  const now = new Date();
  const listElement = document.getElementById("countdown-list");
  const rows = listElement.querySelectorAll(".train-row");

  let shouldReRender = false;

  // 逆順に処理することで、削除時にインデックスがずれるのを防ぐ
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const departureStr = row.dataset.departure;

    // 発車済みで表示リストに残っている電車は無視（次の再描画で消える）
    if (
      displayTrains.findIndex((t) => t.departure_time === departureStr) === -1
    )
      continue;

    const departureTime = parseDepartureTime(departureStr);

    // 現在時刻と発車時刻の差分（ミリ秒 -> 秒）
    const remainingMs = departureTime.getTime() - now.getTime();
    const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));

    const display = row.querySelector(".countdown-display");
    display.textContent = formatTime(remainingSec);

    // --- 色の変化とグレーアウト ---
    display.className = "countdown-display"; // クラスをリセット
    row.className = "train-row"; // クラスをリセット

    if (remainingSec < THRESHOLD_GRAY) {
      row.classList.add("grayed-out");
    } else if (remainingSec < THRESHOLD_RED) {
      display.classList.add("color-red");
    } else if (remainingSec < THRESHOLD_YELLOW) {
      display.classList.add("color-yellow");
    } else {
      display.classList.add("color-green");
    }

    // --- 0分になったら行を削除とデータ更新フラグをセット ---
    if (remainingSec <= 0) {
      // displayTrainsから発車済みの電車を削除
      const departureIndex = displayTrains.findIndex(
        (t) => t.departure_time === departureStr
      );
      if (departureIndex !== -1) {
        displayTrains.splice(departureIndex, 1);
        shouldReRender = true;
      }
    }
  }

  // 発車があった場合、次の電車を繰り上げて表示リストに追加し、全体を再描画
  if (shouldReRender) {
    // 元データ (trainsData) から、現在表示中の電車に含まれていない次の電車を見つける
    const nextTrain = trainsData.find(
      (t) => !displayTrains.some((dt) => dt.departure_time === t.departure_time)
    );

    if (nextTrain && displayTrains.length < COUNT_LIMIT) {
      displayTrains.push(nextTrain);
    }

    // リスト全体を再描画することで、行の削除と追加（繰り上げ）をスムーズに処理
    renderTrainList();
  }
}

// 初期データの取得と処理の開始
initializeData();
