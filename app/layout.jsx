export const metadata = {
  title: "オウダン | 楽天・Yahoo!横断 最安値検索",
  description:
    "楽天市場とYahoo!ショッピングをまとめて検索し、同じ商品の最安値を比較。欲しいものリストと価格推移グラフで買い時がわかります。",
};

const responsiveCss = `
  .oud-wrap { max-width: 560px; margin: 0 auto; }
  .oud-grid { display: grid; grid-template-columns: 1fr; gap: 10px; align-items: start; align-content: start; }
  .oud-grid4 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
  .oud-grid > * { align-self: start; }
  @media (min-width: 900px) {
    .oud-wrap { max-width: 1120px; }
    .oud-grid { grid-template-columns: 1fr 1fr; gap: 14px; }
    .oud-grid4 { grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .oud-search input { font-size: 17px !important; padding: 15px 18px !important; }
    .oud-search button { padding: 0 30px !important; font-size: 15px !important; }
  }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
        {children}
      </body>
    </html>
  );
}
