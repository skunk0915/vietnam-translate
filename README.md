# 日本語⇔ベトナム語 音声翻訳アプリ

リアルタイム音声認識と翻訳機能を備えたPWAアプリです。日本語とベトナム語の双方向翻訳が可能です。

## 機能

- 🎤 リアルタイム音声認識（日本語・ベトナム語）
- 🔄 Google Translate APIを使用した双方向翻訳
- 📱 PWA対応（スマートフォンにインストール可能）
- 📝 会話履歴の保存・表示
- 🌐 オフライン対応（Service Worker）

## 必要な環境

- Node.js 16以上
- Google Cloud Translation APIの認証情報

## セットアップ手順

### 1. Google Cloud設定

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. Cloud Translation APIを有効化
3. サービスアカウントキーを作成し、JSONファイルをダウンロード
4. ダウンロードしたJSONファイルをプロジェクトルートに配置

### 2. 環境変数設定

`.env`ファイルを作成し、以下のように設定：

```
GOOGLE_APPLICATION_CREDENTIALS=your-service-account-key.json
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. アプリケーション起動

開発環境：
```bash
npm run dev
```

本番環境：
```bash
npm start
```

アプリケーションは `http://localhost:3000` で起動します。

## xserverでのデプロイ

### 1. ファイルアップロード

以下のファイルをxserverのpublic_htmlディレクトリにアップロード：
- index.html
- style.css
- app.js
- sw.js
- manifest.json
- icon-192x192.png
- icon-512x512.png
- server.js
- package.json
- .env
- サービスアカウントキー（JSONファイル）

### 2. Node.jsアプリの設定

1. xserverの管理パネルでNode.jsを有効化
2. アプリケーションルートを設定
3. 依存関係をインストール：
```bash
npm install --production
```

### 3. 起動

```bash
npm start
```

## 使用方法

1. ブラウザでアプリにアクセス
2. マイクボタンをクリックして音声認識を開始
3. 日本語ウィンドウで話すと、ベトナム語に翻訳されて表示
4. ベトナム語ウィンドウで話すと、日本語に翻訳されて表示
5. 履歴ボタンで過去の会話を確認可能

## ファイル構成

```
vietnam-translate/
├── index.html          # メインHTML
├── style.css           # スタイルシート
├── app.js             # クライアントサイドJS
├── server.js          # Node.jsサーバー
├── sw.js              # Service Worker
├── manifest.json      # PWA設定
├── package.json       # 依存関係
├── .env              # 環境変数
├── icon-192x192.png  # PWAアイコン
├── icon-512x512.png  # PWAアイコン
└── README.md         # このファイル
```

## 注意事項

- HTTPSでのアクセスが必要（音声認識API使用のため）
- Google Cloud Translation APIの使用料金が発生します
- ブラウザによって音声認識の対応状況が異なります

## トラブルシューティング

### 音声認識が動作しない
- HTTPSでアクセスしているか確認
- マイクの権限を許可しているか確認
- 対応ブラウザ（Chrome、Safari等）を使用しているか確認

### 翻訳が失敗する
- Google Cloud認証情報が正しく設定されているか確認
- Translation APIが有効化されているか確認
- ネットワーク接続を確認

## ライセンス

MIT License