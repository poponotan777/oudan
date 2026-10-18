import "./globals.css";
import InstallSW from "./components/InstallSW";

export const metadata = {
  metadataBase: new URL(process.env.SITE_ORIGIN || "https://oudan.vercel.app"),
  title: "オウダン | 楽天・Yahoo!・Amazon をポイント込みで比べる",
  description:
    "楽天市場・Yahoo!ショッピング・Amazonの価格を、ポイント込みの実質価格で比較。90日の中央値との差や「3か月で何番目に安いか」で買い時がわかります。",
  applicationName: "オウダン",
  appleWebApp: { capable: true, title: "オウダン", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport = {
  themeColor: "#2346ff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
        />
      </head>
      <body>
        {children}
        <InstallSW />
      </body>
    </html>
  );
}
