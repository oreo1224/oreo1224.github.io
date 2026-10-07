# Vox Lab — Gemini TTS Playground

GitHub Pagesで使える単ページアプリ。Worker不要でGemini APIへ直接接続します。

## 使い方

1. 右上の設定でGemini APIキーを入力し、Flash / Flash-Liteを選択。
2. 本文・演技指示・話速・ピッチを設定。
3. 標準30声、または拡張Voice Libraryで探した声を選び、音声を生成。
4. 生成履歴で再生し、WAVをダウンロード。

キーはページのメモリ内だけに保持します。ブラウザストレージやリポジトリには保存せず、GoogleのAPIに直接送信します。再読み込みで消えます。設定で空欄を保存するとキーを消去できます。

GitHub Secretsは静的ページの実行時には読めません。キーをビルドで埋め込むと公開されるため、このアプリではSecretsを使用しません。

## 拡張Voice Library

「拡張Voice Libraryから探す」を開き、言語コード・声の高さ・声の印象・種類・キーワードで検索。初期言語はja-JP。空欄で全言語を対象にできます。「さらに読み込む」で追加ページを取得します。

保存済みのVoice design / Voice replication音声も検索対象にできます。新しいカスタム音声の作成は含みません。

## 開発

```sh
npm ci
npm run dev
npm run build
```

ビルドしたdistの中身をGitHub Pagesのithiel/へ配置します。相対パス対応なのでサブディレクトリで動きます。対象APIがキーのプロジェクトで利用可能であることが必要です。

公式仕様: https://ai.google.dev/gemini-api/docs/speech-generation
