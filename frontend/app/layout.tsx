import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo App",
  description: "業務支援アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
