/** @type {import('next').NextConfig} */
const path = require('path');
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  i18n,
  async redirects() {
    // Next applies these redirects to both configured locales and preserves
    // the locale prefix, so old bookmarks land on a working screen.
    return [
      { source: '/investments', destination: '/', permanent: false },
      { source: '/ai-planning', destination: '/agent', permanent: false },
    ];
  },
  webpack: (config) => {
    // onnxruntime-web is loaded at runtime from /ort/ rather than bundled; see
    // lib/ocr/ortRuntime.js for why.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-web$': path.join(__dirname, 'lib/ocr/ortRuntime.js'),
    };
    return config;
  },
};

module.exports = nextConfig;
