import "quagga.main";

var DetectedCount=0,DetectedCode="";
var video,tmp,tmp_ctx,jan,prev,prev_ctx,w,h,mw,mh,x1,y1;
const searchInput = result.codeResult.code
const searchButton = document.getElementById("searchButton");
const results = document.getElementById("results");
window.addEventListener('load',function(event){
  video=document.createElement('video');
  video.setAttribute("autoplay","");
  video.setAttribute("muted","");
  video.setAttribute("playsinline","");
  video.onloadedmetadata = function(e){video.play();};
  prev=document.getElementById("preview");
  prev_ctx=prev.getContext("2d", {willReadFrequently:true});
  tmp = document.createElement('canvas');
  tmp_ctx = tmp.getContext("2d", {willReadFrequently:true});
  jan=document.getElementById("jan");

  //カメラ使用の許可ダイアログが表示される
  navigator.mediaDevices.getUserMedia(
    //マイクはオフ, カメラの設定   背面カメラを希望する 640×480を希望する
    {"audio":false,"video":{"facingMode":"environment","width":{"ideal":640},"height":{"ideal":480}}}
  ).then( //許可された場合
    function(stream){
      video.srcObject = stream;
      //0.5秒毎にスキャンする
      setTimeout(Scan,500,true);
    }
  ).catch( //許可されなかった場合
    function(err){jan.value+=err+'\n';}
  );

  function Scan(first){
    if(first){
      //選択された幅高さ
      w=video.videoWidth;
      h=video.videoHeight;
      //画面上の表示サイズ
      prev.style.width=(w/2)+"px";
      prev.style.height=(h/2)+"px";
      //内部のサイズ
      prev.setAttribute("width",w);
      prev.setAttribute("height",h);
      mw=w*0.5;
      mh=w*0.2;
      x1=(w-mw)/2;
      y1=(h-mh)/2;
    }
    prev_ctx.drawImage(video,0,0,w,h);
    prev_ctx.beginPath();
    prev_ctx.strokeStyle="rgb(255,0,0)";
    prev_ctx.lineWidth=2;
    prev_ctx.rect(x1,y1,mw,mh);
    prev_ctx.stroke();
    tmp.setAttribute("width",mw);
    tmp.setAttribute("height",mh);
    tmp_ctx.drawImage(prev,x1,y1,mw,mh,0,0,mw,mh);

    tmp.toBlob(function(blob){
      let reader = new FileReader();
      reader.onload=function(){
        let config={
          decoder: {
            readers: ["ean_reader","ean_8_reader"],
            multiple: false, //同時に複数のバーコードを解析しない
          },
          locator:{patchSize:"large",halfSample:false},
          locate:false,
          src:reader.result,
        };
        Quagga.decodeSingle(config,function(){});
      }
      reader.readAsDataURL(blob);
    });
    setTimeout(Scan,50,false);
  }

  Quagga.onDetected(function (result) {
    //読み取り誤差が多いため、3回連続で同じ値だった場合に成功とする
    if(DetectedCode==result.codeResult.code){
      DetectedCount++;
    }else{
      DetectedCount=0;
      DetectedCode=result.codeResult.code;
    }
    if(DetectedCount>=3){
        searchBookoff();
    }
  });
});
document.addEventListener("DOMContentLoaded", function () {
    // 商品情報取得キューを管理するための配列
    const queue = [];

    function searchBookoff() {
        const keyword = result.codeResult.code
        if (!keyword) {
            return;
        }

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
                        const productInfo = `${title} - ${truncatedPrice}`;
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
});