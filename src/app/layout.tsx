import type { Metadata } from "next";
import { Geist_Mono, IM_Fell_English, IM_Fell_English_SC } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fell = IM_Fell_English({ variable: "--font-fell", weight: "400", style: ["normal", "italic"], subsets: ["latin"] });
const fellSc = IM_Fell_English_SC({ variable: "--font-fell-sc", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Haunt Engine",
  description: "Describe a place. Walk through what's waiting in it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mono.variable} ${fell.variable} ${fellSc.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
