// --- 設定ファイルパスの定義 ---
const CONFIG_URL = "data/config.json";

let config = {};
let trainsData = [];
let displayTrains = [];

/**
 * 現在の曜日が土曜日または日曜日かを判定する
 * @returns {boolean} 土休日の場合はtrue
 */
function isWeekend() {
  const today = new Date();
  const day = today.getDay(); // 0:日, 1:月, ..., 6:土
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
 * 'HH:MM'形式の時刻文字列を、現在の日のその時刻のDateオブジェクトに変換
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
  return departure;
}

/**
 * 運行情報を取得し、表示を更新する関数
 */
async function fetchAndRenderStatus() {
  if (!config.data_paths) return;

  const STATUS_URL =
    config.data_paths.data_root + config.data_paths.status_file;

  try {
    const response = await fetch(STATUS_URL + "?t=" + Date.now(), {
      cache: "no-store",
    });
    const statusData = await response.json();
    const status = statusData.status;
    const timestamp = statusData.timestamp || "時刻情報なし";

    const alertElement = document.getElementById("alert-message");
    let timeElement = document.getElementById("status-time");

    if (status.is_normal) {
      alertElement.textContent = "（平常運転）";
      alertElement.style.color = "green";
      alertElement.style.backgroundColor = "#d4edda";
    } else {
      alertElement.textContent = `🚨 ${status.message || "運行情報に注意"}`;
      alertElement.style.color = "red";
      alertElement.style.backgroundColor = "#f8d7da";
    }

    if (!timeElement) {
      timeElement = document.createElement("span");
      timeElement.id = "status-time";
      timeElement.style.fontSize = "0.7em";
      timeElement.style.marginLeft = "10px";
      timeElement.style.color = "#6c757d";
      alertElement.parentNode.insertBefore(
        timeElement,
        alertElement.nextSibling
      );
    }
    timeElement.textContent = `(${timestamp} 取得)`;
  } catch (error) {
    console.error("運行情報の取得に失敗しました:", error);
  }
}

/**
 * データの取得と初期化
 */
async function initializeData() {
  try {
    const configResponse = await fetch(CONFIG_URL);
    config = await configResponse.json();

    const dayType = isWeekend() ? "（土休日）" : "（平日）";
    document.querySelector(
      "h1"
    ).innerHTML = `${config.station_info.line_name} ${config.station_info.station_name} ${config.station_info.direction_name} ${dayType} 発車案内 <span id="alert-message"></span>`;

    const timetableFile = isWeekend()
      ? config.data_paths.weekend_data
      : config.data_paths.weekday_data;
    const targetUrl = config.data_paths.data_root + timetableFile;

    const dataResponse = await fetch(targetUrl);
    const data = await dataResponse.json();

    trainsData = data.trains;

    const now = new Date();
    let startIndex = -1;

    // 発車時刻が現在時刻よりも未来になる最初のインデックスを見つける
    for (let i = 0; i < trainsData.length; i++) {
      const train = trainsData[i];

      let departureTime = parseDepartureTime(train.departure_time);
      const [hours] = train.departure_time.split(":").map(Number);

      // 終電後の0時台の列車（4時までと仮定）の場合、強制的に翌日の日付に修正
      if (hours >= 0 && hours <= 4) {
        departureTime.setDate(departureTime.getDate() + 1);
      }

      if (departureTime.getTime() > now.getTime()) {
        startIndex = i;
        break;
      }
    }

    // 終電後の場合、始発から表示を開始
    if (startIndex === -1) {
      startIndex = 0;
    }

    displayTrains = trainsData.slice(
      startIndex,
      startIndex + config.display_settings.count_limit
    );

    renderTrainList();
    fetchAndRenderStatus();

    setInterval(updateCountdown, 1000);
    setInterval(fetchAndRenderStatus, 30000);

    const RELOAD_INTERVAL_MS = 120000;
    setInterval(() => {
      console.log("2分が経過したため、ページ全体をリロードします。");
      location.reload();
    }, RELOAD_INTERVAL_MS);
  } catch (error) {
    console.error(`初期データの読み込みに失敗しました:`, error);
    document.getElementById(
      "countdown-list"
    ).innerHTML = `<p style="color:red; font-weight:bold;">初期設定または時刻表データの読み込みに失敗しました。</p>`;
  }
}

/**
 * 電車リスト全体を描画する
 */
function renderTrainList() {
  const listElement = document.getElementById("countdown-list");
  listElement.innerHTML = "";

  if (displayTrains.length === 0) {
    listElement.innerHTML = "<p>現在、表示可能な電車情報はありません。</p>";
    return;
  }

  displayTrains.forEach((train) => {
    const now = new Date();

    let departureTime = parseDepartureTime(train.departure_time);
    const [hours] = train.departure_time.split(":").map(Number);
    if (hours >= 0 && hours <= 4) {
      departureTime.setDate(departureTime.getDate() + 1);
    }

    const remainingSec = Math.max(
      0,
      Math.floor((departureTime.getTime() - now.getTime()) / 1000)
    );

    const row = document.createElement("div");
    row.className = "train-row";
    row.dataset.departure = train.departure_time;

    row.innerHTML = `
            <div class="train-details">
                <strong>${train.departure_time}</strong> ${train.destination}
            </div>
            <div class="countdown-display">
                ${formatTime(remainingSec)}
            </div>
        `;
    listElement.appendChild(row);
  });
}

/**
 * 1秒ごとのカウントダウン更新処理（発車した列車を削除し、次列車を繰り上げる）
 */
function updateCountdown() {
  if (!config.display_settings) return;

  // 設定から閾値を取得し、秒に変換
  const THRESHOLD_GRAY = config.display_settings.threshold_gray_min * 60;
  const THRESHOLD_RED = config.display_settings.threshold_red_min * 60;
  const THRESHOLD_YELLOW = config.display_settings.threshold_yellow_min * 60;

  const now = new Date();
  const rows = document
    .getElementById("countdown-list")
    .querySelectorAll(".train-row");

  let shouldReRender = false;
  let trainsToRemove = [];

  // 最初に発車済みの列車を特定
  for (const train of displayTrains) {
    let departureTime = parseDepartureTime(train.departure_time);
    const [hours] = train.departure_time.split(":").map(Number);
    if (hours >= 0 && hours <= 4) {
      departureTime.setDate(departureTime.getDate() + 1);
    }

    const remainingSec = Math.max(
      0,
      Math.floor((departureTime.getTime() - now.getTime()) / 1000)
    );

    if (remainingSec <= 0) {
      trainsToRemove.push(train);
      shouldReRender = true;
    }
  }

  if (shouldReRender) {
    displayTrains = displayTrains.filter(
      (train) => !trainsToRemove.includes(train)
    );

    // --- 次の列車を繰り上げて表示リストに追加 ---
    while (displayTrains.length < config.display_settings.count_limit) {
      const nextTrain = trainsData.find((t) => {
        let departureTime = parseDepartureTime(t.departure_time);
        const [hours] = t.departure_time.split(":").map(Number);
        if (hours >= 0 && hours <= 4) {
          departureTime.setDate(departureTime.getDate() + 1);
        }

        return (
          departureTime.getTime() > now.getTime() &&
          !displayTrains.some((dt) => dt.departure_time === t.departure_time)
        );
      });

      if (nextTrain) {
        displayTrains.push(nextTrain);
      } else {
        break;
      }
    }

    // リストの描画を更新
    renderTrainList();
  } else {
    // 発車がない場合は、既存の行のカウントダウンと色だけを更新する
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const departureStr = row.dataset.departure;

      let departureTime = parseDepartureTime(departureStr);
      const [hours] = departureStr.split(":").map(Number);
      if (hours >= 0 && hours <= 4) {
        departureTime.setDate(departureTime.getDate() + 1);
      }

      const remainingSec = Math.max(
        0,
        Math.floor((departureTime.getTime() - now.getTime()) / 1000)
      );

      const display = row.querySelector(".countdown-display");
      display.textContent = formatTime(remainingSec);

      // --- 色の変化 (ブロック全体への適用) ---
      display.className = "countdown-display";
      row.className = "train-row";

      if (remainingSec < THRESHOLD_GRAY) {
        row.classList.add("grayed-out");
      } else if (remainingSec < THRESHOLD_RED) {
        row.classList.add("row-color-red");
        display.classList.add("color-red");
      } else if (remainingSec < THRESHOLD_YELLOW) {
        row.classList.add("row-color-yellow");
        display.classList.add("color-yellow");
      } else {
        display.classList.add("color-green");
      }
    }
  }
}

// 初期データの取得と処理の開始
initializeData();
