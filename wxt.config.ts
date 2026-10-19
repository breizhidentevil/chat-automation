import { defineConfig } from 'wxt';

export default defineConfig({
  // Les cibles prises en charge et testées par la CI utilisent Manifest V3.
  // Firefox MV2 n’est pas pris en charge par le flux d’enregistrement dynamique des scripts.
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
