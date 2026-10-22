// ============================================================
// おすすめ(v27)— 「似た商品」と「その商品を見る人が次に見そうな商品」
//
//   考え方(機械的に出せるように、商品を「種類」に分けて、種類どうしのつながりを持つ)
//   1. 商品名から種類(シャンプー・ドッグフードなど)を当てる → 同じ種類の人気商品 = 似た商品
//   2. 種類ごとに「一緒に使う・一緒に買われやすい種類」(rel)を決めておく
//        例:シャンプー → トリートメント・ヘアオイル・ドライヤー
//            ドッグフード → ペットシーツ・犬のおやつ
//      小売の「併売(いっしょに買われる)」の定番の組み合わせをもとにしている
//   3. 種類ごとに「見る人の特性」(who)を付けておく。同じ特性の種類も、少し遠い関連として出す
//        例:おむつ(子育て)→ 子育ての人が見る 洗濯洗剤・水・米
//      → 近すぎず(同じ種類は除く)、遠すぎない(関連か同じ特性)ものだけを出す
//
//   種類を足すときは CONCEPTS に1行足す。id は変えないこと。
// ============================================================

// who(見る人の特性)
//   hair 髪 / skin 肌 / beauty 美容 / laundry 洗濯 / clean 掃除 / kitchen 料理 / cafe コーヒー・お茶
//   stock 買い置き / baby 子育て / dog 犬 / cat 猫 / health 健康 / fit 運動 / sleep 睡眠
//   phone スマホ / pc パソコン / audio 音 / home 家電 / solo 一人暮らし / outdoor 外遊び / dry 乾燥 / cold 寒さ / fashion 服・小物
export const CONCEPTS = [
  // ---- 髪 ----
  { id: "treatment", label: "トリートメント", re: "トリートメント|コンディショナー|ヘアマスク", q: ["トリートメント"], rel: ["shampoo", "hairoil", "dryer"], who: ["hair", "beauty"] },
  { id: "shampoo", label: "シャンプー", re: "シャンプー", q: ["シャンプー"], rel: ["treatment", "hairoil", "dryer", "bodysoap"], who: ["hair", "beauty"] },
  { id: "hairoil", label: "ヘアオイル", re: "ヘアオイル|ヘアミルク|洗い流さない", q: ["ヘアオイル"], rel: ["treatment", "dryer", "hairiron"], who: ["hair", "beauty"] },
  { id: "dryer", label: "ドライヤー", re: "ドライヤー", q: ["ドライヤー"], rel: ["hairoil", "hairiron", "treatment"], who: ["hair", "home"] },
  { id: "hairiron", label: "ヘアアイロン", re: "ヘアアイロン|ストレートアイロン|カールアイロン", q: ["ヘアアイロン"], rel: ["hairoil", "dryer"], who: ["hair", "beauty"] },
  // ---- 肌 ----
  { id: "lotion", label: "化粧水", re: "化粧水|ローション(?!ティッシュ)", q: ["化粧水"], rel: ["serum", "milk", "facewash", "sunscreen"], who: ["skin", "beauty", "dry"] },
  { id: "serum", label: "美容液", re: "美容液|セラム", q: ["美容液"], rel: ["lotion", "milk", "facemask"], who: ["skin", "beauty"] },
  { id: "milk", label: "乳液・クリーム", re: "乳液|保湿クリーム|フェイスクリーム|オールインワン", q: ["乳液", "オールインワン"], rel: ["lotion", "serum"], who: ["skin", "beauty", "dry"] },
  { id: "facewash", label: "洗顔料", re: "洗顔|クレンジング|メイク落とし", q: ["洗顔", "クレンジング"], rel: ["lotion", "milk"], who: ["skin", "beauty"] },
  { id: "facemask", label: "シートマスク", re: "フェイスマスク|シートマスク|パック", q: ["フェイスマスク"], rel: ["lotion", "serum"], who: ["skin", "beauty", "dry"] },
  { id: "sunscreen", label: "日焼け止め", re: "日焼け止め|UVカット|サンスクリーン", q: ["日焼け止め"], rel: ["lotion", "facewash"], who: ["skin", "outdoor"] },
  { id: "handcream", label: "ハンドクリーム", re: "ハンドクリーム", q: ["ハンドクリーム"], rel: ["lipcare", "milk"], who: ["skin", "dry", "cold"] },
  { id: "lipcare", label: "リップ", re: "リップクリーム|リップバーム", q: ["リップクリーム"], rel: ["handcream"], who: ["skin", "dry"] },
  { id: "bodysoap", label: "ボディソープ", re: "ボディソープ|ボディウォッシュ", q: ["ボディソープ"], rel: ["shampoo", "bodycream", "bath"], who: ["skin", "stock"] },
  { id: "bodycream", label: "ボディクリーム", re: "ボディクリーム|ボディミルク|ボディローション", q: ["ボディクリーム", "ボディミルク"], rel: ["bodysoap", "handcream"], who: ["skin", "dry"] },
  // ---- 洗濯・掃除・日用品 ----
  { id: "detergent", label: "洗濯洗剤", re: "洗濯.{0,4}洗剤|洗濯用洗剤|ジェルボール|アタック|アリエール|ボールド|ナノックス", q: ["洗濯洗剤", "ジェルボール"], rel: ["softener", "bleach", "laundrybag"], who: ["laundry", "stock", "baby"] },
  { id: "softener", label: "柔軟剤", re: "柔軟剤|レノア|ソフラン|ハミング", q: ["柔軟剤"], rel: ["detergent", "bleach"], who: ["laundry", "stock"] },
  { id: "bleach", label: "漂白剤", re: "漂白剤|ワイドハイター|オキシクリーン", q: ["漂白剤", "オキシクリーン"], rel: ["detergent", "softener"], who: ["laundry", "clean"] },
  { id: "laundrybag", label: "洗濯グッズ", re: "洗濯ネット|物干し|ピンチハンガー|ランドリー", q: ["洗濯ネット", "物干し"], rel: ["detergent", "dehumid"], who: ["laundry", "solo"] },
  { id: "dishsoap", label: "食器用洗剤", re: "食器用洗剤|食洗機用洗剤|フィニッシュ|キュキュット|ジョイ", q: ["食器用洗剤", "食洗機用洗剤"], rel: ["sponge", "wrap", "trash"], who: ["kitchen", "stock", "clean"] },
  { id: "sponge", label: "スポンジ", re: "スポンジ|たわし", q: ["キッチンスポンジ"], rel: ["dishsoap"], who: ["kitchen", "clean"] },
  { id: "toiletpaper", label: "トイレットペーパー", re: "トイレットペーパー", q: ["トイレットペーパー"], rel: ["tissue", "toiletclean", "kitchenpaper"], who: ["stock", "baby"] },
  { id: "tissue", label: "ティッシュ", re: "ティッシュ(?!ケース)", q: ["ティッシュペーパー"], rel: ["toiletpaper", "kitchenpaper", "mask"], who: ["stock", "dry"] },
  { id: "kitchenpaper", label: "キッチンペーパー", re: "キッチンペーパー|キッチンタオル", q: ["キッチンペーパー"], rel: ["wrap", "toiletpaper"], who: ["kitchen", "stock"] },
  { id: "toiletclean", label: "トイレ掃除", re: "トイレ.{0,4}(洗剤|クリーナー|掃除)|トイレクイックル|スクラビングバブル", q: ["トイレ 洗剤"], rel: ["bathclean", "toiletpaper"], who: ["clean"] },
  { id: "bathclean", label: "お風呂掃除", re: "お風呂.{0,4}(洗剤|掃除)|バスマジックリン|カビキラー", q: ["お風呂 洗剤", "カビキラー"], rel: ["toiletclean", "floorclean"], who: ["clean"] },
  { id: "floorclean", label: "床掃除", re: "クイックルワイパー|フローリング|ハンディモップ|粘着クリーナー|コロコロ", q: ["クイックルワイパー", "フロアワイパー"], rel: ["vacuum", "bathclean"], who: ["clean", "dog", "cat"] },
  { id: "trash", label: "ゴミ袋", re: "ゴミ袋|ごみ袋|ポリ袋", q: ["ゴミ袋"], rel: ["wrap", "dishsoap"], who: ["stock", "kitchen"] },
  { id: "wrap", label: "ラップ・保存袋", re: "ラップ(?!トップ)|ジップロック|保存袋|フリーザーバッグ", q: ["ラップ", "保存袋"], rel: ["container", "kitchenpaper"], who: ["kitchen", "stock"] },
  { id: "mask", label: "マスク", re: "マスク(?!カラ|シート|フェイス)", q: ["不織布マスク"], rel: ["tissue", "sanitizer", "thermometer"], who: ["health", "stock"] },
  { id: "sanitizer", label: "除菌・ハンドソープ", re: "ハンドソープ|除菌|アルコールジェル|消毒", q: ["ハンドソープ", "除菌スプレー"], rel: ["mask", "tissue"], who: ["health", "baby", "stock"] },
  { id: "toothpaste", label: "歯みがき", re: "歯磨き粉|歯みがき|歯磨き|ハミガキ|歯ブラシ|マウスウォッシュ|デンタル", q: ["歯磨き粉", "歯ブラシ"], rel: ["eltoothbrush", "mouthwash"], who: ["health", "stock"] },
  { id: "eltoothbrush", label: "電動歯ブラシ", re: "電動歯ブラシ|ソニッケアー|オーラルB|ジェットウォッシャー", q: ["電動歯ブラシ"], rel: ["toothpaste"], who: ["health", "home"] },
  { id: "mouthwash", label: "マウスウォッシュ", re: "マウスウォッシュ|洗口液|リステリン", q: ["マウスウォッシュ"], rel: ["toothpaste"], who: ["health"] },
  // ---- 食品・飲み物 ----
  { id: "rice", label: "お米", re: "(?<!玄|炊飯)米(?!国|粉)|無洗米|コシヒカリ|ゆめぴりか|あきたこまち", q: ["無洗米", "コシヒカリ"], rel: ["retort", "water", "ricecooker"], who: ["stock", "baby", "solo"] },
  { id: "water", label: "水", re: "天然水|ミネラルウォーター|(?<!化粧|炭酸)水 ?\\d|500ml.*水|2L.*水", q: ["天然水", "ミネラルウォーター"], rel: ["tea", "soda", "rice"], who: ["stock", "baby", "fit"] },
  { id: "tea", label: "お茶", re: "お茶|緑茶|麦茶|ほうじ茶|烏龍茶|伊右衛門|綾鷹|お〜いお茶", q: ["緑茶", "麦茶"], rel: ["water", "coffee", "snack"], who: ["cafe", "stock"] },
  { id: "soda", label: "炭酸水", re: "炭酸水|強炭酸", q: ["炭酸水"], rel: ["water", "tea"], who: ["stock", "fit"] },
  { id: "coffee", label: "コーヒー", re: "コーヒー|珈琲|ドリップバッグ|インスタントコーヒー|カフェラテ", q: ["コーヒー"], rel: ["kettle", "tumbler", "snack", "coffeemaker"], who: ["cafe", "solo", "pc"] },
  { id: "coffeemaker", label: "コーヒーメーカー", re: "コーヒーメーカー|エスプレッソマシン|コーヒーミル|ネスプレッソ|ドルチェグスト", q: ["コーヒーメーカー"], rel: ["coffee", "tumbler"], who: ["cafe", "home"] },
  { id: "snack", label: "お菓子", re: "お菓子|チョコレート|ポテトチップス|クッキー|せんべい|グミ|ナッツ", q: ["お菓子", "ナッツ"], rel: ["coffee", "tea"], who: ["cafe", "stock"] },
  { id: "retort", label: "レトルト・インスタント", re: "レトルト|カレー|パスタソース|カップ麺|インスタント麺|即席|パックご飯|サトウのごはん", q: ["レトルトカレー", "パックご飯"], rel: ["rice", "water"], who: ["stock", "solo"] },
  { id: "beer", label: "ビール・お酒", re: "ビール|発泡酒|ハイボール|チューハイ|日本酒|ワイン|焼酎", q: ["ビール", "チューハイ"], rel: ["snack", "soda"], who: ["solo"] },
  { id: "protein", label: "プロテイン", re: "プロテイン|ホエイ|ソイプロテイン", q: ["プロテイン"], rel: ["shaker", "supplement", "fitness"], who: ["fit", "health"] },
  { id: "supplement", label: "サプリ", re: "サプリ|ビタミン|マルチミネラル|亜鉛|鉄分|乳酸菌|青汁", q: ["サプリメント", "ビタミン"], rel: ["protein", "health_check"], who: ["health", "fit"] },
  // ---- 健康・運動・睡眠 ----
  { id: "fitness", label: "運動グッズ", re: "ダンベル|ヨガマット|トレーニングチューブ|腹筋|ストレッチポール|ランニング|フィットネス", q: ["ヨガマット", "ダンベル"], rel: ["protein", "shaker", "massage"], who: ["fit"] },
  { id: "shaker", label: "シェイカー", re: "シェイカー|シェーカー", q: ["プロテインシェイカー"], rel: ["protein"], who: ["fit"] },
  { id: "massage", label: "マッサージ器", re: "マッサージ|ネックケア|フットケア|マッサージガン|EMS", q: ["マッサージ器"], rel: ["pillow", "bath", "fitness"], who: ["health", "sleep"] },
  { id: "health_check", label: "体重計・体温計", re: "体重計|体組成計|体温計|血圧計", q: ["体組成計", "体温計"], rel: ["supplement", "fitness"], who: ["health", "fit"] },
  { id: "pillow", label: "枕・寝具", re: "枕|まくら|マットレス|敷きパッド|掛け布団|毛布", q: ["枕", "マットレス"], rel: ["eyemask", "massage", "blanket"], who: ["sleep", "solo"] },
  { id: "eyemask", label: "アイマスク・耳栓", re: "アイマスク|ホットアイマスク|耳栓", q: ["アイマスク"], rel: ["pillow", "bath"], who: ["sleep"] },
  { id: "bath", label: "入浴剤", re: "入浴剤|バスソルト|バブ|きき湯", q: ["入浴剤"], rel: ["bodysoap", "eyemask", "massage"], who: ["sleep", "health", "cold"] },
  // ---- 子育て ----
  { id: "diaper", label: "おむつ", re: "おむつ|オムツ|パンパース|メリーズ|ムーニー|グーン", q: ["おむつ"], rel: ["wipes", "babymilk", "babysoap"], who: ["baby", "stock"] },
  { id: "wipes", label: "おしりふき", re: "おしりふき|お尻拭き|ウェットティッシュ", q: ["おしりふき"], rel: ["diaper", "babysoap"], who: ["baby", "stock"] },
  { id: "babymilk", label: "粉ミルク・離乳食", re: "粉ミルク|液体ミルク|離乳食|ベビーフード|哺乳瓶", q: ["粉ミルク", "離乳食"], rel: ["diaper", "water"], who: ["baby"] },
  { id: "babysoap", label: "ベビーソープ・保湿", re: "ベビーソープ|ベビーローション|ベビー.{0,2}保湿|ベビーオイル", q: ["ベビーソープ", "ベビーローション"], rel: ["wipes", "diaper"], who: ["baby", "skin"] },
  { id: "toy", label: "おもちゃ・知育", re: "おもちゃ|知育|絵本|ぬいぐるみ|レゴ|積み木|パズル", q: ["知育玩具"], rel: ["diaper", "babymilk"], who: ["baby"] },
  // ---- ペット ----
  { id: "dogfood", label: "ドッグフード", re: "ドッグフード|犬用.{0,4}(フード|ごはん)|子犬用|成犬用", q: ["ドッグフード"], rel: ["dogsnack", "petsheet", "floorclean"], who: ["dog"] },
  { id: "dogsnack", label: "犬のおやつ", re: "犬用.{0,4}おやつ|ジャーキー|ガム.{0,4}犬|デンタルガム", q: ["犬 おやつ"], rel: ["dogfood", "petsheet"], who: ["dog"] },
  { id: "petsheet", label: "ペットシーツ", re: "ペットシーツ|トイレシート", q: ["ペットシーツ"], rel: ["dogfood", "dogsnack", "floorclean"], who: ["dog", "stock"] },
  { id: "catfood", label: "キャットフード", re: "キャットフード|猫用.{0,4}(フード|ごはん)|ちゅ[ー〜]る|カルカン|モンプチ", q: ["キャットフード", "ちゅーる"], rel: ["catlitter", "cattoy", "floorclean"], who: ["cat"] },
  { id: "catlitter", label: "猫砂", re: "猫砂|猫.{0,4}トイレ|システムトイレ", q: ["猫砂"], rel: ["catfood", "floorclean"], who: ["cat", "stock"] },
  { id: "cattoy", label: "猫のおもちゃ・爪とぎ", re: "爪とぎ|キャットタワー|猫じゃらし", q: ["爪とぎ"], rel: ["catfood", "catlitter"], who: ["cat"] },
  // ---- キッチン家電・キッチン ----
  { id: "kettle", label: "電気ケトル", re: "電気ケトル|電気ポット|ケトル", q: ["電気ケトル"], rel: ["coffee", "tumbler", "tea"], who: ["cafe", "kitchen", "solo"] },
  { id: "ricecooker", label: "炊飯器", re: "炊飯器", q: ["炊飯器"], rel: ["rice", "microwave", "container"], who: ["kitchen", "home", "solo"] },
  { id: "microwave", label: "電子レンジ", re: "電子レンジ|オーブンレンジ|トースター", q: ["電子レンジ", "トースター"], rel: ["container", "ricecooker", "airfryer"], who: ["kitchen", "home", "solo"] },
  { id: "airfryer", label: "調理家電", re: "ノンフライヤー|エアフライヤー|ホットプレート|ホットクック|電気圧力鍋|ブレンダー|ミキサー", q: ["電気圧力鍋", "ホットプレート"], rel: ["fryingpan", "microwave"], who: ["kitchen", "home"] },
  { id: "fryingpan", label: "フライパン・鍋", re: "フライパン|鍋|ティファール|ダッチオーブン", q: ["フライパン"], rel: ["knife", "container", "airfryer"], who: ["kitchen"] },
  { id: "knife", label: "包丁・まな板", re: "包丁|まな板|キッチンバサミ", q: ["包丁", "まな板"], rel: ["fryingpan", "container"], who: ["kitchen"] },
  { id: "container", label: "保存容器", re: "保存容器|タッパー|密閉容器|弁当箱|お弁当", q: ["保存容器", "弁当箱"], rel: ["wrap", "tumbler", "microwave"], who: ["kitchen", "solo"] },
  { id: "tumbler", label: "水筒・タンブラー", re: "水筒|タンブラー|マグボトル|サーモス|象印.{0,4}ステンレス", q: ["水筒", "タンブラー"], rel: ["coffee", "container"], who: ["cafe", "outdoor", "fit"] },
  // ---- 家電(暮らし) ----
  { id: "vacuum", label: "掃除機", re: "掃除機|ロボット掃除機|コードレスクリーナー|ルンバ|ダイソン", q: ["掃除機", "ロボット掃除機"], rel: ["floorclean", "airpurifier"], who: ["clean", "home", "dog", "cat"] },
  { id: "airpurifier", label: "空気清浄機", re: "空気清浄機", q: ["空気清浄機"], rel: ["humidifier", "vacuum", "mask"], who: ["home", "health", "dog", "cat"] },
  { id: "humidifier", label: "加湿器", re: "加湿器", q: ["加湿器"], rel: ["airpurifier", "handcream", "lotion"], who: ["home", "dry", "cold"] },
  { id: "dehumid", label: "除湿機", re: "除湿機|衣類乾燥", q: ["除湿機"], rel: ["laundrybag", "detergent"], who: ["home", "laundry"] },
  { id: "heater", label: "暖房", re: "ヒーター|電気毛布|こたつ|ホットカーペット|セラミックファン", q: ["電気毛布", "ヒーター"], rel: ["blanket", "humidifier"], who: ["home", "cold"] },
  { id: "blanket", label: "毛布・あったかグッズ", re: "毛布|ブランケット|湯たんぽ|カイロ|ルームソックス|着る毛布", q: ["ブランケット", "湯たんぽ"], rel: ["heater", "pillow"], who: ["cold", "sleep"] },
  { id: "fan", label: "扇風機", re: "扇風機|サーキュレーター|ハンディファン", q: ["サーキュレーター"], rel: ["dehumid"], who: ["home"] },
  // ---- スマホ・PC・音 ----
  { id: "earphone", label: "イヤホン", re: "イヤホン|ヘッドホン|ヘッドフォン|AirPods", q: ["ワイヤレスイヤホン"], rel: ["battery", "charger", "phonecase"], who: ["audio", "phone"] },
  { id: "battery", label: "モバイルバッテリー", re: "モバイルバッテリー", q: ["モバイルバッテリー"], rel: ["charger", "cable", "earphone"], who: ["phone", "outdoor"] },
  { id: "charger", label: "充電器", re: "充電器|ACアダプタ|急速充電|USB.{0,3}充電", q: ["充電器 USB"], rel: ["cable", "battery"], who: ["phone", "pc"] },
  { id: "cable", label: "ケーブル", re: "ケーブル|Lightning|ライトニング", q: ["USB ケーブル"], rel: ["charger", "battery"], who: ["phone", "pc"] },
  { id: "phonecase", label: "スマホケース・フィルム", re: "スマホケース|iPhone.{0,10}ケース|保護フィルム|ガラスフィルム", q: ["スマホケース", "ガラスフィルム"], rel: ["charger", "earphone"], who: ["phone"] },
  { id: "mouse", label: "マウス・キーボード", re: "マウス(?!ウォッシュ|ピース)|キーボード|トラックパッド", q: ["ワイヤレスマウス", "キーボード"], rel: ["monitor", "storage", "pcstand"], who: ["pc"] },
  { id: "monitor", label: "モニター", re: "モニター|ディスプレイ", q: ["モニター"], rel: ["mouse", "pcstand"], who: ["pc"] },
  { id: "pcstand", label: "PCスタンド・デスク用品", re: "PCスタンド|ノートパソコンスタンド|モニターアーム|デスクマット|USBハブ", q: ["ノートパソコンスタンド", "USBハブ"], rel: ["mouse", "monitor"], who: ["pc"] },
  { id: "storage", label: "SSD・SDカード", re: "SSD|microSD|SDカード|USBメモリ|外付けHDD", q: ["SSD", "microSD"], rel: ["mouse", "cable"], who: ["pc", "phone"] },
  { id: "speaker", label: "スピーカー", re: "スピーカー|サウンドバー", q: ["Bluetoothスピーカー"], rel: ["earphone"], who: ["audio", "home"] },
  // ---- ファッション ----
  { id: "watch", label: "腕時計", re: "腕時計|ウォッチ(?!ャ)|スマートウォッチ|G-SHOCK", q: ["腕時計"], rel: ["wallet", "bag", "watchcare"], who: ["fashion"] },
  { id: "watchcare", label: "時計ケース・ベルト", re: "時計ケース|ウォッチケース|時計ベルト|替えベルト|ウォッチスタンド", q: ["時計ケース", "時計ベルト"], rel: ["watch"], who: ["fashion"] },
  { id: "wallet", label: "財布・小物", re: "財布|キーケース|名刺入れ|カードケース", q: ["財布", "キーケース"], rel: ["bag", "watch"], who: ["fashion"] },
  { id: "bag", label: "バッグ", re: "バッグ|リュック|トート|ショルダー|ボストン", q: ["リュック", "トートバッグ"], rel: ["wallet", "umbrella"], who: ["fashion", "outdoor"] },
  { id: "shoes", label: "靴", re: "スニーカー|シューズ|ブーツ|パンプス|サンダル|インソール", q: ["スニーカー"], rel: ["socks", "bag"], who: ["fashion", "fit"] },
  { id: "socks", label: "靴下・インナー", re: "靴下|ソックス|インナー|肌着|ヒートテック|レギンス|タイツ", q: ["靴下", "インナー"], rel: ["shoes", "apparel"], who: ["fashion", "stock", "cold"] },
  { id: "apparel", label: "服", re: "Tシャツ|パーカー|スウェット|ジャケット|コート|シャツ|パンツ|ワンピース|カーディガン|ニット", q: ["パーカー", "Tシャツ"], rel: ["socks", "shoes", "bag"], who: ["fashion"] },
  // ---- 外 ----
  { id: "umbrella", label: "傘", re: "折りたたみ傘|日傘|傘", q: ["折りたたみ傘"], rel: ["sunscreen", "tumbler"], who: ["outdoor"] },
  { id: "camp", label: "アウトドア", re: "テント|寝袋|ランタン|アウトドアチェア|クーラーボックス|キャンプ", q: ["キャンプ", "ランタン"], rel: ["tumbler", "battery"], who: ["outdoor"] },
];

// 古いブラウザ(後読み (?<! ) が使えない)でも動くように、作れなければ後読みを外して作る
function mkRe(src) {
  try { return new RegExp(src); } catch { return new RegExp(src.replace(/\(\?<[!=][^)]*\)/g, "")); }
}
const COMPILED = CONCEPTS.map((c) => ({ ...c, rx: mkRe(c.re) }));
export const CONCEPT_BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

// 商品名(とジャンル)から種類を当てる。いちばん前に出てくる言葉の種類を優先
export function conceptsOf(name = "", genre = "") {
  const text = String(name || "");
  const hits = [];
  for (const c of COMPILED) {
    const m = text.match(c.rx);
    if (m) hits.push({ id: c.id, at: m.index });
  }
  if (!hits.length && genre) {
    for (const c of COMPILED) if (c.rx.test(String(genre))) hits.push({ id: c.id, at: 999 });
  }
  hits.sort((a, b) => a.at - b.at);
  return [...new Set(hits.map((h) => h.id))].slice(0, 2);
}

// 関連する種類を、近い順に(同じ種類は「似た商品」なので除く)
//   rel(いっしょに使う)… 3点 / rel の rel … 1点 / 同じ特性(who)… 1点
export function relatedConcepts(ids, max = 4) {
  const self = new Set(ids);
  const score = new Map();
  const add = (id, s) => { if (!self.has(id) && CONCEPT_BY_ID[id]) score.set(id, (score.get(id) || 0) + s); };
  for (const id of ids) {
    const c = CONCEPT_BY_ID[id];
    if (!c) continue;
    c.rel.forEach((r, i) => add(r, 3 - i * 0.3));
    for (const r of c.rel) for (const rr of CONCEPT_BY_ID[r]?.rel || []) add(rr, 0.6);
    for (const o of CONCEPTS) if (o.who.some((w) => c.who.includes(w))) add(o.id, 0.8);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}
