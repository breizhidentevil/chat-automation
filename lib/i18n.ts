export type Locale = 'fr' | 'en';

export const LOCALE_STORAGE_KEY = 'chatAutomationLocale';

export const messages = {
  fr: {
    subtitle: 'Détection et automatisation de messages',
    language: 'Langue',
    automation: 'Automatisation',
    variables: 'Variables',
    history: 'Historique',
    logs: 'Logs',
    checkingStrategy: 'Vérification de la stratégie enregistrée pour l’onglet actif…',
    loadingSiteConfig: 'Chargement de la configuration du site.',
    setupStrategy: 'Configurer la stratégie d’envoi',
    testMessage: 'Message de test',
    testAndSave: 'Tester l’envoi et enregistrer la stratégie',
    automateSending: 'Automatiser l’envoi',
    sequence: 'Séquence de messages',
    add: '+ Ajouter',
    cycleSettings: 'Paramètres des cycles',
    frequency: 'Fréquence',
    unit: 'Unité',
    seconds: 'Secondes',
    minutes: 'Minutes',
    cycleCount: 'Nombre de cycles',
    dailyWindow: 'Créneau horaire quotidien',
    limitWindow: 'Limiter les envois à un créneau horaire',
    start: 'Début',
    end: 'Fin',
    startAutomation: 'Démarrer l’automatisation',
    stopAutomation: 'Arrêter l’automatisation',
    tracking: 'Suivi de l’automatisation',
    docs: 'Documentation',
  },
  en: {
    subtitle: 'Chat detection and message automation',
    language: 'Language',
    automation: 'Automation',
    variables: 'Variables',
    history: 'History',
    logs: 'Logs',
    checkingStrategy: 'Checking the saved strategy for the active tab…',
    loadingSiteConfig: 'Loading site configuration.',
    setupStrategy: 'Configure sending strategy',
    testMessage: 'Test message',
    testAndSave: 'Test sending and save strategy',
    automateSending: 'Automate sending',
    sequence: 'Message sequence',
    add: '+ Add',
    cycleSettings: 'Cycle settings',
    frequency: 'Frequency',
    unit: 'Unit',
    seconds: 'Seconds',
    minutes: 'Minutes',
    cycleCount: 'Number of cycles',
    dailyWindow: 'Daily time window',
    limitWindow: 'Restrict sending to a time window',
    start: 'Start',
    end: 'End',
    startAutomation: 'Start automation',
    stopAutomation: 'Stop automation',
    tracking: 'Automation status',
    docs: 'Documentation',
  },
} as const;

export function preferredLocale(language?: string | null): Locale {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function translate(locale: Locale, key: keyof typeof messages.fr): string {
  return messages[locale][key] ?? messages.fr[key];
}
