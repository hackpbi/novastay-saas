/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 검증 빌드를 별도 폴더로 보내 dev 서버(.next)를 깨뜨리지 않도록.
  // 기본은 .next (호스트/Vercel 빌드는 NEXT_DIST_DIR 미설정 → 영향 없음)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
}

module.exports = nextConfig
