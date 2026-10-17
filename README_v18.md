# オウダン v18:3サイトの商品を毎日自動で集める(GitHub Actions)

## これで何ができるか
- 毎日 **午前5時ごろ・午後5時ごろ** に、楽天・Yahoo!・Amazon から商品を自動で集めて、共通のDBに貯めます
  - 楽天:各ジャンルのランキング1000位まで+リアルタイムランキング+有名ブランド571件
  - Yahoo!:高評価トレンドランキング(総合+各ジャンル1000位まで)+急上昇キーワード+有名ブランド
  - Amazon:有名ブランド571件(午前1ページ目・午後2ページ目)
  - あるサイトにしか無い商品は、次の回から **他の2サイトでも探します**(見つかれば1つの商品にまとめます)
- 価格は **圧縮して保存**(1商品×1サイト=1行に90日分)。「中央値から何%安いか」「3か月で何番目に安いか」は保存時に計算済み
- DB容量が **400MBを超えたら GitHub からメールでお知らせ**(実行が「失敗」になる)。450MBを超えたら新しい商品は増やさず、今ある商品の価格だけ更新します
- 画面(サイト)はまだ変わりません。表示は次の v19 で入れます

---

## 手順(前提:新しいSupabaseで v17 の復旧が終わっていること)

### ① SQLを流す(先にこれ)
1. Supabase → 左メニュー「SQL Editor」→「New query」
2. `sql/v18-catalog.sql` の中身を **全部** 貼り付け →「Run」
3. 最後に **collect_runs / collector_state / fill_queue / offers / products** の5つが出ればOK

### ② ファイルをGitHubへ
1. GitHub のリポジトリ画面に、zip の中の **collector フォルダ** と **lib フォルダ** と **sql フォルダ** をドラッグ&ドロップ → Commit
2. 自動実行の設定ファイルを作る(ドラッグ&ドロップだと隠しフォルダが上がらないことがあるので、この方法で):
   1. リポジトリ画面の「Add file」→「Create new file」
   2. ファイル名の欄に `.github/workflows/collect.yml` と入力(「/」を打つとフォルダになります)
   3. zip の中の `.github/workflows/collect.yml` をメモ帳で開き、中身を全部コピーして貼り付け
   4. 「Commit changes」

### ③ キーを GitHub に登録(チャットには貼らないでください)
リポジトリ画面 →「Settings」→ 左の「Secrets and variables」→「Actions」→「New repository secret」で、1つずつ登録します。

| Name(この通りに入力) | Secret(入れる値) |
|---|---|
| `SUPABASE_URL` | Supabase の Project URL(`https://xxxx.supabase.co`) |
| `SUPABASE_SECRET_KEY` | Supabase の Secret key(`sb_secret_...`) |
| `RAKUTEN_APP_ID` | 楽天のアプリID(Vercel の `NEXT_PUBLIC_RAKUTEN_APP_ID` と同じ値) |
| `RAKUTEN_ACCESS_KEY` | 楽天のアクセスキー(Vercel の `NEXT_PUBLIC_RAKUTEN_ACCESS_KEY` と同じ値) |
| `RAKUTEN_AFFILIATE_ID` | 楽天アフィリエイトID(Vercel の `NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID` と同じ値) |
| `YAHOO_CLIENT_ID` | Yahoo! の Client ID(Vercel の `YAHOO_CLIENT_ID` と同じ値) |
| `VC_SID` | バリューコマースの sid(`3518269`) |
| `VC_PID` | バリューコマースの pid(`892657152`) |
| `AMAZON_CLIENT_ID` | Creators API の Credential ID |
| `AMAZON_CLIENT_SECRET` | Creators API の Credential Secret |

- Vercel の値が「Sensitive」で見えない場合は、それぞれのサービスの管理画面から取り直してください
- 楽天は、アプリの「許可されたWebサイト」に `oudan.vercel.app` が登録されている必要があります(今の設定のままでOKのはず)

### ④ 1回手動で動かして確認
1. リポジトリ画面の「Actions」タブ → 左の「collect」→ 右の「Run workflow」→ slot に `am` → 緑の「Run workflow」
2. 30分ほどで終わります。終わったら実行をクリックすると、下に **表(サイトごとのリクエスト数・書き込み件数)** と **DB容量** が出ます
3. 赤い × の場合:赤字の行(`Error:` で始まる行)をスクショで送ってください

---

## 確認ポイント
- 実行結果の表で、3サイトとも「書き込み」が0でないこと
- Supabase → Table Editor → `products` に商品が入っていること
- Amazon が「認証・権限エラー」と出たら:Creators API のアカウントと `popo-kaiteki-22` が別のアカウントの可能性があります(→ 下の注意)

## 知っておくこと
- **GitHub Actions の無料枠**(非公開リポジトリは月2,000分)の中で動くよう、1回の実行時間を **午前33分・午後20分** に制限しています。1日約55分 → 月約1,650分
- **Amazonの上限**(1日8,640回)は、Xツールと同じ認証情報なら **合算** です。こちらは1回900回まで(1日約1,800回)に抑えています。Xツールの価格更新(track)は1日2回程度にしてください
- Amazonのタグは `popo-kaiteki-22` を使います。Creators API は「APIを持っているアカウントのタグ」しか受け付けないため、もし `popo-kaiteki-22` が `hukasei04-22` と別アカウントなら、Amazon だけ認証・権限エラーになります(楽天・Yahoo! は影響なし)
- 古い `/crawl`(ブラウザで開いて動かすクローラー)は不要になります。セールの取り込み欄はそのまま使えます
