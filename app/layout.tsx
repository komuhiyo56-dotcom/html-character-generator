import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HTML Character Generator",
  description: "PSDのレイヤーを確認しながら、立ち絵つきHTML作品を作るローカルツール。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
