/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@carbon-companion/db-schema"]
}

module.exports = nextConfig
