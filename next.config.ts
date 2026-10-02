import type { NextConfig } from 'next';

// Export entièrement statique : aucun serveur, aucune route API.
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
