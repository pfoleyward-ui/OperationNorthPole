import type { NextConfig } from 'next';
const config: NextConfig = {
  // Build-time variants preserve the existing Next/WebP rendering without a paid Images service.
  images: { loader: 'custom', loaderFile: './src/config/image-loader.ts' },
};
export default config;
