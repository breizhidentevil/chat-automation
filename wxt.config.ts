import { defineConfig } from 'wxt';

export default defineConfig({
  // Les cibles prises en charge et testées par la CI utilisent Manifest V3.
  // Firefox MV2 n’est pas pris en charge par le flux d’enregistrement dynamique des scripts.
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  // Preserve the relative base for documentation hosted under a GitHub Pages project path.
  vite: () => ({ base: './' }),
  manifest: ({ browser }) => ({
    name: 'Chat Site Automation',
    description: 'Détecte les champs de chat et automatise les envois selon une fréquence et un créneau définis.',
    permissions: ['activeTab', 'storage', 'scripting'],
    // The user controls when automation starts; page access is granted by installation.
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {},
    // Firefox MV3 requires a stable ID and an explicit data-collection declaration.
    // This extension keeps its history and diagnostics in local browser storage and does not transmit them.
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'chat-automation@breizhidentevil.github.io',
          data_collection_permissions: { required: ['none'] },
        },
      },
    } : {}),
  }),
  hooks: {
    // WXT may infer optional host access from runtime content-script registration.
    // Override the generated manifest so access is granted at installation.
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.optional_host_permissions;
      manifest.host_permissions = ['http://*/*', 'https://*/*'];
    },
  },
});
