# まちのNPO

内閣府「NPO法人ポータルサイト」の行政入力情報から、解散情報が空欄の49,062法人を都道府県、活動分野、法人名、目的、市区町村で探すウェブアプリです。気になる法人を最大12件まで端末内に残し、公式記録と照らし合わせられます。

## 開発

```powershell
npm install
npm run dev
```

公式データを更新する場合は、行政入力情報CSVと配布ZIPを取得してから次を実行します。

```powershell
node scripts/build-data.mjs <administrative.csv> <source.zip> public/data
```

公開前の一括確認は `npm run release:check`、`npm run check`、`npm test`、`npm run build` です。

## データと保存

- 47都道府県の静的JSONへ分割し、選んだ地域だけを読み込みます。
- 検索語、活動分野、選択した法人はサーバーへ送らず、ブラウザ内で処理します。
- 気になる箱の最大12法人はブラウザの `localStorage` だけに保存します。
- 匿名計測にはランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保存します。

詳細は [SOURCE.md](SOURCE.md)、[PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md) を参照してください。

## 公開先

<https://machi-npo.yhay81.com>
