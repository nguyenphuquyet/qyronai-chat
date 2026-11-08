import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tắt nén để chữ từ /api/chat xuống trình duyệt ngay từng đoạn.
  compress: false,
  devIndicators: false,
  // Thư viện đọc PDF/Word chạy phía máy chủ, không đóng gói vào bundle.
  serverExternalPackages: ["unpdf", "mammoth"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "randomuser.me" },
    ],
  },
};

export default nextConfig;
