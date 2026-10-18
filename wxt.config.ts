import { defineConfig } from 'wxt';

export default defineConfig({
  // Cible Manifest V3 par défaut pour tous les navigateurs, y compris Firefox.
  // Une cible MV2 reste possible explicitement via `--mv2` si nécessaire.
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  // WXT expects `vite` to be a callback, not a plain Vite config object.
  // Preserve the relative base for documentation hosted under a GitHub Pages project path.
  vite(config) {
    return config;
  },
  manifest: {
    name: 'Chat Site Automation',
    description: 'Détecte les champs de chat et automatise les envois selon une fréquence et un créneau définis.',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['<all_urls>'],
    action: {},
  },
});
