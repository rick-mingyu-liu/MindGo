/** @type {import('next').NextConfig} */
const path = require('path');
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  i18n,
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
