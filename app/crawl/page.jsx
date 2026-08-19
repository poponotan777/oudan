"use client";
import { useState, useRef, useEffect } from "react";
import { searchRakutenClient } from "../../lib/rakutenClient";
import { mergeOffers } from "../../lib/merge";

// ============================================================
// 巡回ページ(運営者専用) v2
// - 約500キーワード × 9ページを1周だけ巡回し、終わったら自動停止
// - 楽天+Yahoo!の価格を価格履歴DBに蓄積
// - 合言葉は環境変数 NEXT_PUBLIC_CRAWL_KEY
// ============================================================

const BASE_KEYWORDS = [
  // ヘアケア・バス
  "シャンプー","コンディショナー","トリートメント","ヘアオイル","ヘアミスト","ヘアワックス","白髪染め","カラートリートメント","育毛剤","ドライシャンプー",
  "ボディソープ","ハンドソープ","泡ハンドソープ","洗顔料","洗顔フォーム","クレンジングオイル","メイク落とし","入浴剤","バスソルト","石鹸",
  // スキンケア・コスメ
  "化粧水","乳液","美容液","保湿クリーム","日焼け止め","リップクリーム","ハンドクリーム","ボディクリーム","フェイスマスク","パック",
  "ニキビケア","洗顔ブラシ","化粧下地","ファンデーション","BBクリーム","アイシャドウ","マスカラ","アイライナー","眉ペンシル","ネイルオイル",
  // オーラルケア
  "歯磨き粉","歯ブラシ","電動歯ブラシ 替えブラシ","デンタルフロス","歯間ブラシ","マウスウォッシュ","ホワイトニング 歯磨き","入れ歯 洗浄剤","舌ブラシ","フッ素 ジェル",
  // 洗濯・掃除
  "洗濯洗剤","柔軟剤","漂白剤","洗濯槽クリーナー","部屋干し 洗剤","おしゃれ着 洗剤","染み抜き","食器用洗剤","食洗機 洗剤","キッチン泡ハイター",
  "トイレ洗剤","トイレスタンプ","お風呂洗剤","カビ取り","排水口 クリーナー","フローリング ワイパー","ウェットシート 掃除","メラミンスポンジ","重曹","クエン酸",
  "セスキ炭酸ソーダ","アルカリ電解水","ガラスクリーナー","エアコン 洗浄スプレー","消臭スプレー","除菌スプレー","アルコールスプレー","ファブリーズ","リセッシュ","消臭剤 部屋",
  // 紙製品・消耗品
  "トイレットペーパー","ティッシュペーパー","キッチンペーパー","ウェットティッシュ","ペーパータオル","食品用ラップ","アルミホイル","クッキングシート","ジップロック","ゴミ袋",
  "ポリ袋","紙皿","紙コップ","割り箸","ストロー","マスク 不織布","マスク 子供","絆創膏","包帯","ガーゼ",
  // 衛生・ヘルスケア
  "消毒液","体温計","綿棒","コットン","カミソリ","シェービングフォーム","脱毛クリーム","制汗剤","汗拭きシート","冷感スプレー",
  "目薬","コンタクト 洗浄液","コンタクトケース","湿布","カイロ","マスクスプレー","のど飴","トローチ","うがい薬","鼻うがい",
  "生理用品","ナプキン","タンポン","サニタリーショーツ","おりものシート","尿漏れパッド","大人用おむつ","介護 手袋","清拭タオル","防水シーツ",
  // ベビー
  "おむつ","おしりふき","粉ミルク","液体ミルク","離乳食","ベビーフード","ベビーパウダー","ベビーローション","ベビーソープ","哺乳瓶 洗剤",
  // ペット
  "猫砂","キャットフード","ドッグフード","ペットシーツ","猫 おやつ","犬 おやつ","ペット 消臭","猫 爪とぎ","ノミダニ 駆除","ペット シャンプー",
  // 健康食品・飲料
  "プロテイン","サプリメント","ビタミンC","ビタミンD","亜鉛 サプリ","鉄分 サプリ","マルチビタミン","乳酸菌 サプリ","DHA サプリ","コラーゲン",
  "青汁","酵素ドリンク","ゼリー飲料","ミネラルウォーター","炭酸水","スポーツドリンク","経口補水液","野菜ジュース","豆乳","オーツミルク",
  "インスタントコーヒー","コーヒー豆","ドリップコーヒー","紅茶 ティーバッグ","緑茶 ティーバッグ","麦茶","ルイボスティー","ココア","甘酒","エナジードリンク",
  // 食品
  "オリーブオイル","ごま油","サラダ油","米油","醤油","味噌","みりん","料理酒","酢","砂糖",
  "塩","小麦粉","片栗粉","パン粉","パスタ","そうめん","うどん 乾麺","そば 乾麺","レトルトカレー","パスタソース",
  "カップ麺","インスタントラーメン","袋麺","冷凍食品","冷凍餃子","冷凍うどん","缶詰","ツナ缶","サバ缶","トマト缶",
  "ふりかけ","お茶漬け","焼きのり","わかめ","シリアル","グラノーラ","オートミール","はちみつ","ジャム","ピーナッツバター",
  "ドレッシング","ケチャップ","マヨネーズ","焼肉のたれ","めんつゆ","ぽん酢","だしの素","コンソメ","鶏がらスープの素","カレールー",
  "お米","無洗米","もち","切り餅","ナッツ","ドライフルーツ","チョコレート","クッキー","せんべい","グミ",
  // キッチン・生活用品
  "フライパン","鍋 セット","包丁","まな板","水筒","タンブラー","弁当箱","保存容器","土鍋","電気ケトル",
  "炊飯器","トースター","電子レンジ 調理器","ミキサー","コーヒーメーカー","ホットプレート","カセットコンロ","カセットガス","浄水器 カートリッジ","ウォーターサーバー ボトル",
  "食器 セット","マグカップ","グラス","箸","スプーン フォーク","キッチンばさみ","ピーラー","おろし金","計量カップ","キッチンスケール",
  "布巾","スポンジ 食器","水切りラック","三角コーナー","シンクマット","排水口ネット","換気扇フィルター","コンロカバー","油はね ガード","キッチンマット",
  // 収納・インテリア
  "収納ボックス","衣装ケース","ハンガー","突っ張り棒","カラーボックス","すのこ","布団圧縮袋","除湿剤","防虫剤","脱臭炭",
  "カーテン","ラグ","クッション","座布団","ブランケット","枕","枕カバー","敷きパッド","ボックスシーツ","掛け布団カバー",
  "マットレス","布団 セット","毛布","タオルケット","バスタオル","フェイスタオル","バスマット","トイレマット","スリッパ","玄関マット",
  // 文房具・オフィス
  "ボールペン","シャープペン","消しゴム","ノート","ふせん","クリアファイル","ファイルボックス","はさみ","のり","セロハンテープ",
  "ガムテープ","油性ペン","蛍光ペン","修正テープ","ホッチキス","電卓","封筒","コピー用紙","ラベルシール","インクカートリッジ",
  // 家電・AV
  "加湿器","除湿機","空気清浄機 フィルター","扇風機","サーキュレーター","電気毛布","ヒーター","ドライヤー","ヘアアイロン","電動歯ブラシ",
  "体重計","血圧計","マッサージガン","マッサージクッション","美顔器","脱毛器","電気シェーバー","鼻毛カッター","爪切り","耳かき",
  "テレビ リモコン","HDMI切替器","LANケーブル","無線LANルーター","ウェブカメラ","スピーカー","ワイヤレスイヤホン","ヘッドホン","スマートウォッチ","スマートプラグ",
  // ゲーム・ホビー・おもちゃ
  "Switch ソフト","Switch コントローラー","プロコン","ゲーミングマウス","ゲーミングキーボード","ゲーミングヘッドセット","PS5 ソフト","トレカ スリーブ","カードケース","ボードゲーム",
  "ジグソーパズル","プラモデル","塗料 プラモ","ガンプラ","ぬいぐるみ","知育玩具","ブロック おもちゃ","粘土 おもちゃ","シャボン玉","水鉄砲",
  // スポーツ・アウトドア
  "ヨガマット","ダンベル","トレーニングチューブ","プロテインシェイカー","ランニングシューズ","スポーツタオル","サウナスーツ","縄跳び","腹筋ローラー","フォームローラー",
  "テント","寝袋","ランタン","クーラーボックス","レジャーシート","折りたたみチェア","バーベキューコンロ","炭","着火剤","虫除けスプレー",
  "水着","ゴーグル 水泳","浮き輪","日傘","帽子 UV","サングラス","レインコート","折りたたみ傘","長靴","防水スプレー",
  // 衣類・服飾雑貨
  "靴下","インナー メンズ","インナー レディース","Tシャツ 無地","パーカー","スウェット","ルームウェア","パジャマ","ステテコ","レギンス",
  "ベルト","財布 メンズ","キーケース","エコバッグ","リュック","トートバッグ","スニーカー","サンダル","インソール","靴 消臭",
  // カー・自転車・園芸
  "洗車 スポンジ","カーシャンプー","車 芳香剤","ドライブレコーダー","タイヤチェーン","自転車 ライト","自転車 鍵","自転車 カバー","ヘルメット 自転車","空気入れ",
  "培養土","肥料","植木鉢","プランター","除草剤","殺虫剤","じょうろ","園芸 手袋","種 野菜","芝生 種",
  // 食品・飲料の拡充
  "米 10kg","パックご飯","餅 シングル","そば","うどん","ラーメン お取り寄せ","カレー レトルト 辛口","シチュー ルー","マカロニ","春雨",
  "コーンフレーク","プロテインバー","ゼリー","プリン","アイス 箱","チョコ 大袋","ポテトチップス","柿の種","ビスケット","ラムネ",
  "缶コーヒー","ペットボトル お茶","オレンジジュース","リンゴジュース","乳酸菌飲料","ノンアルコールビール","梅酒","ワイン 赤","日本酒","焼酎",
  // 日用雑貨・電気
  "乾電池 単3","乾電池 単4","ボタン電池","充電池","電球 LED","蛍光灯","延長コード","電源タップ","USBケーブル","USB充電器",
  "モバイルバッテリー","イヤホン","SDカード","HDMIケーブル","マウス","キーボード","スマホフィルム","スマホケース","タブレットフィルム","スタイラスペン",
];

const BRAND_KEYWORDS = [
  "メリット シャンプー","パンテーン","ボタニスト","YOLU","いち髪","ラックス シャンプー","エッセンシャル シャンプー","ダイアン シャンプー","クラシエ ヒマワリ","セグレタ",
  "アタックZERO","アリエール","ナノックス","ボールド","レノア","ダウニー","ハミング","ソフラン","ワイドハイター","オキシクリーン",
  "ウタマロ","キュキュット","ジョイ 食器用洗剤","マジックリン","カビキラー","パイプユニッシュ","クイックルワイパー","コロコロ 粘着",
  "クリニカ","シュミテクト","ガム 歯磨き","オーラツー","システマ","リステリン","モンダミン","ピュオーラ",
  "ビオレ","キュレル","ニベア","ハトムギ化粧水","メラノCC","肌ラボ","ちふれ 化粧水","無印良品 化粧水","アネッサ","ビオレUV",
  "パンパース","メリーズ","ムーニー","グーン","ゲンキ おむつ",
  "ザバス プロテイン","マイプロテイン","DHC サプリ","ネイチャーメイド","ディアナチュラ","FANCL サプリ",
  "エリエール","スコッティ","ネピア","クリネックス","エルモア",
  "チャオちゅーる","カルカン","シーバ","ロイヤルカナン","ニュートロ",
  "アイリスオーヤマ","ニトリ","無印良品","サーモス","象印","タイガー 水筒","ジップロック コンテナ","ダスキン","3M スポンジ","レック 激落ちくん",
  "ユニクロ ヒートテック","グンゼ","BVD","ヘインズ","チャンピオン パーカー",
  "コールマン","ロゴス","キャプテンスタッグ","モンベル","スノーピーク",
  "任天堂","ポケモンカード","遊戯王 カード","ワンピースカード","バンダイ ガンプラ",
];

const MODIFIERS = [" 詰め替え", " 大容量", " セット"];

// 約500語のリストを構築(基本+ブランド+修飾語バリエーション)
const KEYWORDS = (() => {
  const list = [...BASE_KEYWORDS, ...BRAND_KEYWORDS];
  // 基本キーワードの前半に修飾語を掛け合わせて増量
  for (let i = 0; i < BASE_KEYWORDS.length && list.length < 500; i++) {
    list.push(BASE_KEYWORDS[i] + MODIFIERS[i % MODIFIERS.length]);
  }
  // シャッフル
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 1000);
})();

// モール別のリクエスト間隔。
//  Yahoo!: 商品検索APIは「アプリIDごと1分30リクエスト(=2秒に1件)」かつ
//    「1クエリー/秒」の制限。これを超えると429が返り0件になる(実証済み)。
//    余裕を見て2.1秒間隔にする。
//  楽天: 1秒1リクエストで従来どおり1.1秒。
const YAHOO_GAP_MS = 2100;
const RAKUTEN_GAP_MS = 1100;
// Yahoo!は1ページ最大50件取得できる(results上限50)。1ページ30件より
// リクエスト数を約6割に減らせるので、2.1秒間隔でも総時間を抑えられる。
const YAHOO_HITS = 50;
// 429(レート制限)などの一時失敗時のリトライ設定。空(本当に0件)と区別して
// パスを誤って打ち切らないためのもの。バックオフは徐々に伸ばす。
const RETRY_MAX = 3;
const RETRY_BACKOFF_MS = [3000, 6000, 10000];
const KW_INTERVAL_MS = 1200; // キーワード間の待ち

// ソート別の巡回パス。検索画面の各ソートはAPIにソートを渡して再取得する方式の
// ため、1種類の順序だけ巡回すると他ソートの先頭商品の価格履歴が未記録になる。
// ◆パスの順番の意図:
//  1. 人気順(売れ筋) … アプリのデフォルト表示と同じ並び。網羅の土台
//  2. 安い順 … 人気順との重複が最も少ない=新規商品が多いので早めに実行。
//     「単価が安い順」はクライアント側の並べ替え(API不在)のため専用パスは
//     作れないが、単価安=大容量・セット品はこのパスとレビュー数順に多く現れる
//  3. レビュー数順 / 4. 評価順 … 人気順との重複が比較的大きいソート
// ◆ページ数はモール別:Yahoo!は50件/ページ・楽天は30件/ページのため、同程度の
//   件数深度になるようYahoo!のページ数を少なく設定(Yahoo!のリクエスト削減=時短)。
const SORT_PASSES = [
  { key: "popular", yahooPages: 6, rakutenPages: 9, label: "人気" },
  { key: "cheap",   yahooPages: 4, rakutenPages: 6, label: "安い順" },
  { key: "reviews", yahooPages: 3, rakutenPages: 4, label: "レビュー数" },
  { key: "rating",  yahooPages: 3, rakutenPages: 4, label: "評価順" },
];
const YAHOO_TOTAL_PAGES = SORT_PASSES.reduce((s, p) => s + p.yahooPages, 0);   // 16
const RAKUTEN_TOTAL_PAGES = SORT_PASSES.reduce((s, p) => s + p.rakutenPages, 0); // 23
// 楽天のsort値(app/page.jsxのRAKUTEN_SORTと同じ対応)
const RAKUTEN_SORT = { popular: "standard", cheap: "+itemPrice", reviews: "-reviewCount", rating: "-reviewAverage" };
// 安い順パスのジャンク下限(app/page.jsxのgetJunkFloorと同じルール)。
// これが無いと無関係な激安小物ばかり記録してしまう
function getJunkFloor(kw) {
  if (/シャンプー|トリートメント|コンディショナー|化粧水|乳液|美容液|洗剤|柔軟剤|プロテイン|サプリ|家電|ドライヤー|時計|バッグ|靴/.test(kw)) return 200;
  if (/電池|文具|ペン|ノート|靴下|マスク|ティッシュ/.test(kw)) return 30;
  return 50;
}

export default function CrawlPage() {
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({ requests: 0, recorded: 0, rakuten: 0, yahoo: 0, kwDone: 0 });
  const [saleForm, setSaleForm] = useState({ name: "", store: "rakuten", start_date: "", end_date: "", url: "" });
  const [saleMsg, setSaleMsg] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetMsg, setSheetMsg] = useState("");
  const posRef = useRef({ kw: 0, page: 1 });
  const timerRef = useRef(null);

  const requiredKey = process.env.NEXT_PUBLIC_CRAWL_KEY || "";
  useEffect(() => {
    if (!requiredKey) setAuthed(true);
  }, [requiredKey]);

  const addLog = (msg) =>
    setLog((l) => [`${new Date().toLocaleTimeString("ja-JP")} ${msg}`, ...l].slice(0, 40));

  const stop = (msg) => {
    setRunning(false);
    runningRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (msg) addLog(msg);
  };

  // 1キーワード×1ソートパスのページを取得。
  // fetchPage(p)は {items, error} を返す。error=true(429等の一時失敗)は
  // 「本当に0件」と区別してバックオフ再試行し、パスの誤打ち切りを防ぐ。
  // gapMsはモール別のページ間隔(Yahoo!2.1秒/楽天1.1秒)。
  const fetchPagesSequential = async (fetchPage, maxPages, gapMs) => {
    const all = [];
    for (let p = 1; p <= maxPages; p++) {
      let res = await fetchPage(p).catch(() => ({ items: [], error: true }));
      // 一時エラーはバックオフして再試行
      for (let a = 0; res.error && a < RETRY_MAX; a++) {
        await new Promise((ok) => setTimeout(ok, RETRY_BACKOFF_MS[a] || 10000));
        res = await fetchPage(p).catch(() => ({ items: [], error: true }));
      }
      if (res.error) break;           // 再試行しても失敗=このパスは諦めて次へ
      if (res.items.length === 0) break; // 本当に結果が尽きた
      all.push(...res.items);
      if (p < maxPages) await new Promise((ok) => setTimeout(ok, gapMs));
    }
    return all;
  };

  // 1モールぶんの全ソートパスを順次実行(モール内は常にgapMs間隔を維持)。
  // 楽天の系列とYahoo!の系列は並行して走らせる(合計時間はほぼ遅い方=Yahoo!分)。
  // 各パスは必ず実行する(空結果による打ち切りは各パス内のページ単位のみ)。
  const fetchAllPasses = async (fetchPageForPass, pagesOf, gapMs) => {
    const all = [];
    for (let i = 0; i < SORT_PASSES.length; i++) {
      const pass = SORT_PASSES[i];
      const items = await fetchPagesSequential((p) => fetchPageForPass(pass, p), pagesOf(pass), gapMs);
      all.push(...items);
      if (i < SORT_PASSES.length - 1) await new Promise((ok) => setTimeout(ok, gapMs));
    }
    return all;
  };

  const crawlKeyword = async (kw) => {
    // アプリ本体の検索は全ソートでジャンク下限(min)を渡しているため、
    // クローラーも同じ条件で取得し、表示される集合と記録される集合を一致させる
    const floor = getJunkFloor(kw);
    const [yOffers, rOffers] = await Promise.all([
      // Yahoo!: 50件/ページ・2.1秒間隔・rateLimitedフラグでリトライ判定
      fetchAllPasses(
        (pass, p) => {
          const params = new URLSearchParams({ q: kw, page: String(p), sort: pass.key, min: String(floor), hits: String(YAHOO_HITS) });
          return fetch(`/api/search?${params}`)
            .then((r) => r.json())
            .then((d) => ({ items: d.offers || [], error: !!d.rateLimited }))
            .catch(() => ({ items: [], error: true }));
        },
        (pass) => pass.yahooPages,
        YAHOO_GAP_MS
      ),
      // 楽天: 30件/ページ・1.1秒間隔(searchRakutenClientは失敗時[]を返すのみで
      // エラー種別を持たないため、error判定はせず従来どおり空=打ち切り)
      fetchAllPasses(
        (pass, p) =>
          searchRakutenClient(kw, 30, p, RAKUTEN_SORT[pass.key] || "standard", floor)
            .then((items) => ({ items, error: false }))
            .catch(() => ({ items: [], error: false })),
        (pass) => pass.rakutenPages,
        RAKUTEN_GAP_MS
      ),
    ]);
    const products = mergeOffers([...yOffers, ...rOffers]);
    const items = products.flatMap((p) =>
      (p.key || p.jan)
        ? p.offers.map((o) => ({ jan: p.key || p.jan, store: o.store, price: o.price }))
        : []
    );
    let recorded = 0;
    if (items.length) {
      const res = await fetch("/api/record-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).then((r) => r.json()).catch(() => ({ recorded: 0 }));
      recorded = res.recorded || 0;
    }
    return {
      recorded,
      rakuten: items.filter((i) => i.store === "rakuten").length,
      yahoo: items.filter((i) => i.store === "yahoo").length,
    };
  };

  const crawlOnce = async () => {
    const kwIdx = posRef.current.kw;
    if (kwIdx >= KEYWORDS.length) {
      setFinished(true);
      stop(`🎉 全${KEYWORDS.length}キーワードの巡回が完了しました。自動停止します`);
      return;
    }
    const kw = KEYWORDS[kwIdx];
    try {
      const r = await crawlKeyword(kw);
      setStats((st) => ({
        requests: st.requests + YAHOO_TOTAL_PAGES + RAKUTEN_TOTAL_PAGES,
        recorded: st.recorded + r.recorded,
        rakuten: st.rakuten + r.rakuten,
        yahoo: st.yahoo + r.yahoo,
        kwDone: kwIdx + 1,
      }));
      addLog(`「${kw}」 楽天${r.rakuten}+Y!${r.yahoo} → ${r.recorded}件記録`);
    } catch {
      addLog(`「${kw}」 エラー(次へ進みます)`);
    }
    posRef.current = { kw: kwIdx + 1, page: 1 };
  };

  const runningRef = useRef(false);
  const runLoop = async () => {
    while (runningRef.current && posRef.current.kw < KEYWORDS.length) {
      await crawlOnce();
      await new Promise((ok) => setTimeout(ok, KW_INTERVAL_MS));
    }
  };

  const start = () => {
    if (running) return;
    setRunning(true);
    runningRef.current = true;
    setFinished(false);
    posRef.current = { kw: 0, page: 1 };
    setStats({ requests: 0, recorded: 0, rakuten: 0, yahoo: 0, kwDone: 0 });
    addLog(`巡回開始: ${KEYWORDS.length}キーワード(Yahoo!最大${YAHOO_TOTAL_PAGES}p/楽天最大${RAKUTEN_TOTAL_PAGES}pを4ソートに分割して取得。Yahoo!は50件/2.1秒間隔)`);
    runLoop();
  };
  useEffect(() => () => timerRef.current && clearInterval(timerRef.current), []);

  if (!authed) {
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 18 }}>巡回ページ(運営者専用)</h1>
        <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="合言葉" type="password"
          style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "10px 12px", fontSize: 16, marginRight: 8 }} />
        <button onClick={() => setAuthed(pass === requiredKey)} style={btn("#16324F")}>入る</button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>🤖 価格巡回ページ v2</h1>
      <p style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.7 }}>
        {KEYWORDS.length}個のキーワードを1語ずつ巡回します。人気順・安い順・レビュー数順・評価順の4ソートに分割して取得します(各ソート表示の先頭に並ぶ商品の価格履歴を記録するため。単価順は読み込み済み結果の並べ替えなので自動的にカバーされます)。Yahoo!は1ページ50件・{YAHOO_GAP_MS/1000}秒間隔(1分30リクエスト制限の厳守)、楽天は30件・1.1秒間隔。429などの一時失敗はバックオフ再試行し、本当に0件のページで各パスを打ち切ります。
        楽天+Yahoo!の価格を記録します。<b>1周し終えると自動で停止します</b>。
        Yahoo!のレート制限厳守のぶん時間はかかりますが、50件/ページ化でリクエスト数を抑えています(結果が尽きたキーワードは早めに切り上げるので、実際は推定より短くなることが多いです)。
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {!running ? (
          <button onClick={start} style={btn("#10B981")}>{finished ? "▶ もう一周する" : "▶ 巡回スタート"}</button>
        ) : (
          <button onClick={() => stop("手動停止しました")} style={btn("#B0483C")}>■ 停止</button>
        )}
      </div>
      {/* 進捗バー */}
      <div style={{ background: "#EAF3F0", borderRadius: 8, height: 18, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ width: `${Math.min((stats.kwDone / KEYWORDS.length) * 100, 100)}%`, height: "100%", background: finished ? "#059669" : "#10B981", transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
        進捗: {stats.kwDone} / {KEYWORDS.length} キーワード {finished && "✅ 完了"}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 13, fontWeight: 700, margin: "6px 0 10px", flexWrap: "wrap" }}>
        <span>リクエスト: {stats.requests}回</span>
        <span style={{ color: "#059669" }}>記録: {stats.recorded.toLocaleString()}件</span>
        <span style={{ color: "#BF0000" }}>楽天: {stats.rakuten.toLocaleString()}</span>
        <span style={{ color: "#FF0033" }}>Yahoo!: {stats.yahoo.toLocaleString()}</span>
      </div>
      <div style={{ background: "#F5FAF8", border: "1px solid #DDE9E4", borderRadius: 10, padding: 12, fontSize: 11.5, color: "#334155", lineHeight: 1.8, maxHeight: 320, overflowY: "auto" }}>
        {log.length === 0 ? "ログはここに表示されます" : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* スプレッドシートから一括取り込み */}
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: "28px 0 6px" }}>📊 スプレッドシートからセール情報を更新</h2>
      <p style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.7 }}>
        Googleスプレッドシートで管理したセール情報を、URLを貼るだけで反映できます。<br />
        <b>シートの列(1行目は見出し):</b><br />
        A:ステータス / B:対象サイト / C:セール名 / D:期間 / E:概要 / F:URL<br />
        ・対象サイトは「楽天市場 / Amazon / Yahoo!ショッピング」など<br />
        ・期間は「2026年7月19日〜7月26日」等の自由記述でOK(日付を自動抽出)<br />
        ・シート右上「共有」→「リンクを知っている全員」→「閲覧者」に設定<br />
        <b>※取り込むと既存のセール情報は置き換わります(シートが正)。</b>
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 4 }}>
        <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={{ ...inp, flex: 1 }} />
        <button
          onClick={async () => {
            setSheetMsg("取り込み中…");
            try {
              const res = await fetch("/api/admin/import-sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sheetUrl, key: requiredKey || pass }),
              }).then((r) => r.json());
              if (res.ok) {
                let msg = `✅ ${res.imported}件を取り込みました(開催中${res.breakdown?.live ?? 0}件・今後${res.breakdown?.upcoming ?? 0}件)`;
                if (res.debug) msg += `\nシート読み取り: 全${res.debug.totalRows}行・見出し${res.debug.headerRow}行目・データ${res.debug.dataRows}行`;
                if (res.skippedDetail?.length) {
                  msg += "\n⚠ スキップ: " + res.skippedDetail.map((d) => `${d.row}行目(${d.reason})`).join(" / ");
                }
                setSheetMsg(msg);
              }
              else setSheetMsg("⚠ " + (res.error || "失敗"));
            } catch { setSheetMsg("⚠ 通信エラー"); }
          }}
          style={{ ...btn("#10B981"), whiteSpace: "nowrap" }}
        >取り込む</button>
      </div>
      {sheetMsg && <p style={{ fontSize: 12, fontWeight: 700, whiteSpace: "pre-wrap", lineHeight: 1.6, color: sheetMsg.startsWith("✅") ? "#059669" : "#B0483C" }}>{sheetMsg}</p>}

      {/* セール確定日程の登録フォーム(手動1件) */}
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: "28px 0 6px" }}>📅 セール日程を1件だけ手動登録</h2>
      <p style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.7 }}>
        公式発表が出た大型セールをここで登録すると、アプリのホームに
        「開催決定」バナー(会場リンク付き)が自動表示されます。Supabaseを開く必要はありません。
      </p>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input value={saleForm.name} onChange={(e) => setSaleForm({ ...saleForm, name: e.target.value })}
          placeholder="セール名(例: 楽天スーパーSALE)"
          style={inp} />
        <select value={saleForm.store} onChange={(e) => setSaleForm({ ...saleForm, store: e.target.value })} style={inp}>
          <option value="rakuten">楽天</option>
          <option value="yahoo">Yahoo!</option>
          <option value="amazon">Amazon</option>
        </select>
        <label style={{ fontSize: 11, color: "#64748B" }}>開始日
          <input type="date" value={saleForm.start_date} onChange={(e) => setSaleForm({ ...saleForm, start_date: e.target.value })} style={inp} />
        </label>
        <label style={{ fontSize: 11, color: "#64748B" }}>終了日(任意)
          <input type="date" value={saleForm.end_date} onChange={(e) => setSaleForm({ ...saleForm, end_date: e.target.value })} style={inp} />
        </label>
        <input value={saleForm.url} onChange={(e) => setSaleForm({ ...saleForm, url: e.target.value })}
          placeholder="会場URL(任意・空欄なら自動で公式ページを推定)"
          style={inp} />
        <button
          onClick={async () => {
            setSaleMsg("送信中…");
            try {
              const res = await fetch("/api/admin/sale-event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...saleForm, key: requiredKey || pass }),
              }).then((r) => r.json());
              if (res.ok) {
                setSaleMsg("✅ 登録しました。アプリのホームに反映されます");
                setSaleForm({ name: "", store: "rakuten", start_date: "", end_date: "", url: "" });
              } else {
                setSaleMsg("⚠ " + (res.error || "登録に失敗しました"));
              }
            } catch {
              setSaleMsg("⚠ 通信エラー");
            }
          }}
          style={btn("#10B981")}
        >
          セール日程を登録
        </button>
        {saleMsg && <p style={{ fontSize: 12, fontWeight: 700, color: saleMsg.startsWith("✅") ? "#059669" : "#B0483C" }}>{saleMsg}</p>}
      </div>
    </div>
  );
}

const inp = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 16,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const wrap = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "32px 16px",
  fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif",
  color: "#16324F",
};
const btn = (bg) => ({
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
});
