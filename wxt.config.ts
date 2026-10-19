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
    permissions: ['activeTab', 'storage', 'scripting'],
    // Hosts are requested only when the user enables the extension on a specific site.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {},
  },
  hooks: {
    // WXT's runtime registration normally promotes matches to mandatory host_permissions.
    // Move those broad patterns to optional permissions so site access is granted per-origin.
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
      manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'scripting'])];
      manifest.optional_host_permissions = ['http://*/*', 'https://*/*'];
    },
  },
});
