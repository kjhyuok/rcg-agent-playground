import type { NextConfig } from "next";

// Flask 백엔드는 EC2 로컬 5050에서만 돈다(SG/CloudFront는 3000만 노출).
// 브라우저는 CloudFront(HTTPS) 뒤에 있으므로 :5050에 직접 도달할 수 없다 →
// Next.js가 같은 오리진의 /api/* 요청을 로컬 Flask로 프록시(rewrite)해서
// mixed-content/CORS/포트개방 없이 백엔드에 연결한다.
const API_ORIGIN = process.env.API_ORIGIN || "http://127.0.0.1:5050";

const nextConfig: NextConfig = {
  // next start의 기본 gzip이 /api/* 프록시(SSE)까지 압축하면 스트리밍이 죽는다
  // (gzip은 버퍼링 → 청크가 마지막에 몰려 도착 → UI가 한 번에 뜸).
  // 압축을 꺼서 text/event-stream이 도착 즉시 흐르게 한다.
  compress: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
