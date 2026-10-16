import type { NextConfig } from 'next';

// Export entièrement statique : aucun serveur, aucune route API.
// Hébergement sous un sous-chemin (GitHub Pages : /nom-du-dépôt) : NEXT_PUBLIC_BASE_PATH=/nom-du-dépôt au build. Vide en local.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const config: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
