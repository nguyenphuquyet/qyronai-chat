import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://qyron.ai";
const siteName = "Qyron AI";
const title = "Qyron AI — Trợ lý AI cho mọi việc trong ngày";
const description =
  "Qyron AI giúp bạn hỏi đáp, tìm ý tưởng, viết lách và xử lý việc thường ngày bằng tiếng Việt. Chọn mô hình, bật suy luận và dùng kỹ năng riêng cho từng câu hỏi.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · Qyron AI",
  },
  description,
  applicationName: siteName,
  generator: "Next.js",
  keywords: [
    "Qyron AI",
    "trợ lý AI",
    "chatbot tiếng Việt",
    "AI hỏi đáp",
    "AI viết lách",
    "kỹ năng AI",
    "mô hình AI",
    "Qyron Studio",
  ],
  authors: [{ name: "Qyron Studio", url: siteUrl }],
  creator: "Qyron Studio",
  publisher: "Qyron Studio",
  category: "productivity",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/",
    siteName,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@qyronai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f4f6",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Qyron Studio",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/qyron-logo.png`,
        width: 500,
        height: 500,
      },
      sameAs: ["https://github.com/anthropics/skills"],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      inLanguage: "vi-VN",
      description,
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      url: siteUrl,
      inLanguage: "vi-VN",
      description,
      image: `${siteUrl}/opengraph-image.png`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "VND" },
      publisher: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="h-dvh overflow-hidden font-sans">
        {children}
        <script
          type="application/ld+json"
          // Dữ liệu có cấu trúc cho công cụ tìm kiếm.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
