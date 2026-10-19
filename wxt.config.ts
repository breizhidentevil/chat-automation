import { defineConfig } from 'wxt';

export default defineConfig({
  // Cible Manifest V3 par défaut pour tous les navigateurs, y compris Firefox.
  // Une cible MV2 reste possible explicitement via `--mv2` si nécessaire.
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  // Preserve the relative base for documentation hosted under a GitHub Pages project path.
  vite: () => ({ base: './' }),
  manifest: {
    name: 'Chat Site Automation',
    description: 'Détecte les champs de chat et automatise les envois selon une fréquence et un créneau définis.',
    permissions: ['activeTab', 'storage'],
    // Intentional: the extension supports user-selected chat sites, not a fixed provider list.
    // Keep permissions limited to activeTab/storage plus hosts needed for content-script injection.
    host_permissions: ['<all_urls>'],
    action: {},
  },
});
