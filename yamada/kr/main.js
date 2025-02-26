document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const results = document.getElementById("results");

    searchButton.addEventListener("click", searchBookoff);
    searchInput.addEventListener("keyup", function (event) {
        if (event.key === "Enter") {
            searchBookoff();
        }
    });

    // 商品情報取得キューを管理するための配列
    const queue = [];

    function searchBookoff() {
        const inputValue = searchInput.value;
        if (!inputValue) {
            return;
        }

        // Dに9784832200000を加えてAを計算
        const D = parseInt(inputValue);
        const A = D + 9784832200000;

        // BookoffのURLを構築
        const bookoffUrl = `https://shopping.bookoff.co.jp/search/stock/used/keyword/${A}.html`;

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
                        const truncatedTitle = title.split("まんがタイム")[0];
                        const truncatedPrice = price.split("定")[0];
                        const productInfo = `${truncatedTitle} - ${truncatedPrice}`;
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
                });
        }
    }

    // 商品情報を表示
    function displayResults(productInfos) {
        productInfos.forEach((productInfo) => {
            const productDiv = document.createElement("div");
            productDiv.textContent = productInfo;
            results.appendChild(productDiv);
        });
    }
});
