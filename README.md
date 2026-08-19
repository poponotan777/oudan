# オウダン — 楽天×Yahoo! 横断最安値検索アプリ

楽天市場とYahoo!ショッピングをまとめて検索し、同一商品を名寄せして最安値を表示。
欲しいものリストに登録した商品は毎日価格が自動記録され、推移グラフで買い時がわかります。
購入リンクにはあなたのアフィリエイトID(楽天アフィリエイト/バリューコマース)が組み込まれます。

## 構成

- Next.js(Vercelで無料公開)
- Supabase(ログイン・欲しいものリスト・価格履歴の保存)
- 楽天ウェブサービスAPI / Yahoo!ショッピングAPI(サーバー側から呼び出し。キーは非公開)
- Vercel Cron(毎朝6時JSTに価格を自動記録)

## 公開手順(全部で30分ほど)

### 手順1: Supabaseにテーブルを作る(3分)

1. Supabaseダッシュボードを開く
2. 左メニュー「SQL Editor」→「New query」
3. このフォルダの `supabase.sql` の中身を全部コピーして貼り付け →「Run」
4. 「Success」と出たら完了

### 手順2: このフォルダをGitHubに上げる(10分)

一番簡単なのはブラウザだけで済む方法です:

1. github.com にログイン → 右上「+」→「New repository」
2. Repository name: `oudan`、**Private** を選択 →「Create repository」
3. 作成後の画面で「uploading an existing file」リンクをクリック
4. このフォルダの中身を**全部まとめてドラッグ&ドロップ**
   (`node_modules` は無いはずですが、もしあれば除外)
5. 「Commit changes」をクリック

### 手順3: Vercelに公開する(10分)

1. vercel.com にログイン →「Add New...」→「Project」
2. さきほどの `oudan` リポジトリの「Import」をクリック
3. **Environment Variables** を開き、`.env.example` に書いてある名前の通りに
   全部のキーを登録する(名前のスペルは正確に):
   - `RAKUTEN_APP_ID`
   - `RAKUTEN_AFFILIATE_ID`
   - `YAHOO_CLIENT_ID`
   - `VC_SID`
   - `VC_PID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`(sb_publishable_ のキー)
   - `SUPABASE_SECRET_KEY`(sb_secret_ のキー)
   - `CRON_SECRET`(自分で決めた長いランダム文字列)
4. 「Deploy」をクリック → 1〜2分で `https://oudan-○○.vercel.app` が発行される

### 手順4: SupabaseにアプリのURLを教える(2分)

ログインメールのリンクが正しく戻ってくるようにします。

1. Supabase → 左メニュー「Authentication」→「URL Configuration」
2. **Site URL** に VercelのURL(`https://oudan-○○.vercel.app`)を入力して保存

### 手順5: 楽天アプリの設定を更新(2分)

1. 楽天ウェブサービスのアプリ管理画面を開く
2. アプリURLを VercelのURL に変更
3. 「許可IPアドレス」を入れている場合:Vercelは固定IPではないため、
   `0.0.0.0/0`(全許可)に変更する。フォームが受け付けない場合は
   楽天のサポートに問い合わせるか、この欄が空欄にできるか確認

### 動作確認

- トップページで「シャンプー」を検索 → 楽天とYahoo!の結果が名寄せされて出ればOK
- 「購入」ボタンのリンク先URLに `afid` や `valuecommerce` が含まれていればアフィリエイトも有効
- メールアドレスでログイン → 商品詳細で「♡ リストに追加」→ 翌朝以降、価格推移グラフにデータが増えていく

## 運用メモ

- **価格履歴**はリストに登録された商品だけ記録されます(APIレート制限のため)
- 楽天APIは1秒1リクエスト制限があるので、cronは1商品ずつ1.1秒待って処理します。
  リスト登録商品が数百件を超えたら処理の分割が必要です(その時に相談してください)
- **Amazonの追加**: アソシエイトの売上実績ができたら PA-API キーを発行し、
  `lib/stores.js` に searchAmazon を追加する形で拡張できます
- **特定商取引法・プライバシーポリシー**: ユーザー登録機能があるので、
  プライバシーポリシーページを追加してから本格集客するのがおすすめです

## トラブルシューティング

- 検索結果が0件 → Vercelの環境変数の名前が `.env.example` と一致しているか確認。
  変更後は「Redeploy」が必要です
- ログインメールが届かない → 迷惑メールフォルダを確認。Supabase無料枠の
  メール送信は1時間あたり数通の制限があります
- 価格推移が増えない → Vercelダッシュボード → プロジェクト → Settings → Cron Jobs で
  実行履歴を確認。401エラーなら `CRON_SECRET` の不一致です
