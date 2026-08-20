# 商品マスタ管理Web UI

GitHub Pages向けの依存関係なしの静的管理画面です。Googleログインした `macbooklightning@gmail.com` のみが、Firestoreの `products` コレクションを編集できます。

## 初回準備

1. Firebaseコンソールで **ウェブアプリ** を追加する。
2. Authenticationの「ログイン方法」で **Google** を有効にする。
3. `firebase-config.js` にFirebaseコンソールのWeb設定が入っていることを確認する。この設定値は公開情報であり、アクセス制御にはFirestoreルールを使います。
4. POSリポジトリ側でFirestoreルールを公開する。

   ```bash
   firebase deploy --only firestore:rules
   ```

5. このフォルダを `oreo1224.github.io` リポジトリへコミット・プッシュし、GitHubの **Settings → Pages** で `main` ブランチの `/ (root)` を公開元にする。
6. 公開URLは `https://oreo1224.github.io/pos_item/` です。Firebase Authenticationの **Settings → 承認済みドメイン** に `oreo1224.github.io` を追加する。

## 商品ドキュメント

```text
products/{auto-id}
├ name: string
├ priceYen: int
├ category: string
├ sortOrder: int
├ active: bool
├ soldOut: bool
├ voucherEligible: bool
├ colorCode: int (1〜8)
├ createdAt: int
└ updatedAt: int
```

POS側の商品マスタ取得・売上登録画面は次の実装対象です。このWeb UIは商品データを安全に登録・更新するための先行実装です。

## CSV一括登録

画面上の「CSV雛形をダウンロード」から雛形を取得できます。「登録済みをCSV出力」は既存商品を編集可能なCSVとして出力します。UTF-8（BOM付き）のCSVを想定し、次のヘッダーを使います。

```csv
id,name,priceYen,category,sortOrder,colorCode,active,soldOut,voucherEligible
,焼きそば,500,フード,10,1,true,false,true
```

- `id` が空の行は新規登録です。
- 既存のFirestoreドキュメントIDを `id` に入れた行は更新です。
- `active`、`soldOut`、`voucherEligible` は `true/false` または `1/0` を使えます。
- `colorCode` は商品ボタンの色で、`1`〜`8` を指定します。
- 一度に登録できるのは200件までです。

## 注文QR画面の売切状態

注文QR画面は同フォルダの`order/item.csv`から商品名・価格・カテゴリ・商品コードを読みます。一方、CSVの`active`・`soldOut`は売切判定に使いません。Firestoreの`order_menu_status/current`をページ表示時に1回だけ取得し、`disabledOrderCodes`に含まれる商品コードを売切・販売停止として選択不可にします。

商品マスタ画面で商品を保存・CSV一括登録・削除すると、各`products/{id}`の変更と`order_menu_status/current`の更新を同じバッチで確定します。初回だけ、商品マスタ画面でいずれかの商品を保存して売切状態ドキュメントを作成してください。
