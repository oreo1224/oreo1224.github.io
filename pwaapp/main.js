// main.js

// Web Share Target APIのonShareイベントハンドラを定義
function onShare(event) {
    // 共有された値をkeywordに代入
    const keyword = event.detail.shareData.text;
  
    // DOMContentLoadedイベントが発生していない場合は検索処理を遅延実行
    if (!document.readyState === "complete") {
      // 検索処理を実行するコールバック関数を定義
      const callback = () => {
        searchBookoff(keyword);
      };
  
      // DOMContentLoadedイベントが発生したらコールバック関数を実行
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      // DOMContentLoadedイベントが発生している場合はすぐに検索処理を実行
      searchBookoff(keyword);
    }
  }
  
  // 商品情報取得キューを管理するための配列
  const queue = [];
  
  // 商品情報を表示
  function displayResults(productInfos) {
    const container = document.createElement("div");
    container.classList.add("results-container");
  
    productInfos.forEach((productInfo) => {
      const productDiv = document.createElement("div");
      productDiv.classList.add("product-item");
      productDiv.textContent = productInfo;
      container.appendChild(productDiv);
    });
  
    results.appendChild(container);
  }
  
  // 検索処理
  function searchBookoff(keyword) {
    // BookoffのURLを構築
    const bookoffUrl = `https://shopping.bookoff.co.jp/search/stock/used/keyword/${keyword}.html`;
  // ページの読み込みをPromiseでラップ
  const fetchData = () => {
  return fetch(bookoffUrl)
  .then((response) => response.text())
  .then((html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const titleElements = doc.querySelectorAll(".productItem__title");
  const priceElements = doc.querySelectorAll(".productItem__price");
  const productInfos = [];
  for (let i = 0; i < titleElements.length; i++) {
  const title = titleElements[i].textContent.trim();
  const price = priceElements[i].textContent.trim();
  // "定" 以下の情報を省略
  const truncatedPrice = price.split("定")[0];
  const productInfo = `</span>{title} - ${truncatedPrice}`;
            productInfos.push(productInfo);
          }
  
          return productInfos;
        })
        .catch((error) => {
          console.error(error);
          return null;
        });
    };
  
    // 商品情報取得処理をキューに追加
    queue.push(fetchData);
  
    // 入力フォームをクリアする
    searchInput.value = "";
  
    // キューが空でなければ処理を実行
    if (queue.length === 1) {
      processQueue();
    }
  }
  
  // キュー内の商品情報取得処理を順番に実行
  function processQueue() {
    const fetchDataFunction = queue[0];
    if (fetchDataFunction) {
      fetchDataFunction()
        .then((productInfos) => {
          if (productInfos) {
            displayResults(productInfos);
          }
  
          // キュー内の次の処理を実行
          queue.shift();
          if (queue.length > 0) {
            processQueue();
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }
  
  // 初期化処理
  document.addEventListener("DOMContentLoaded", () => {
    // 検索ボタンのクリックイベントを登録
    searchButton.addEventListener("click", searchBookoff);
    // 入力フォームのキー入力イベントを登録
    searchInput.addEventListener("keyup", function (event) {
      if (event.key === "Enter") {
        searchBookoff();
      }
    });
  });
  