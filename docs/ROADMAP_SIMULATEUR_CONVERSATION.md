# Roadmap — Simulateur de conversations

## Objectif

Remplacer le simulateur de planification actuel par un simulateur comportemental de conversations LLM. L'utilisateur définit une séquence ordonnée de paires : **message envoyé** et **message reçu attendu**. Le simulateur joue ces échanges de manière déterministe, sans contacter de LLM et sans envoyer de message réel.

## Périmètre fonctionnel

- Ajouter autant de paires envoyé/reçu que nécessaire.
- Modifier et supprimer chaque paire.
- Conserver strictement l'ordre des paires.
- Afficher la conversation simulée sous forme d'échanges successifs.
- Valider que les champs requis sont renseignés et signaler les erreurs de rendu des modèles.
- Utiliser les mécanismes de rendu Liquid et les variables déjà pris en charge par l'extension, dans la mesure où ils s'appliquent aux messages envoyés.
- Indiquer clairement qu'un message reçu est une réponse attendue simulée, pas une réponse générée par un vrai LLM.
- Fournir un résultat simple par paire et un état global.

## Hors périmètre explicite

- Intervalles, délais et horaires.
- Créneaux horaires, cycles et planification.
- Appels réseau ou connexion à un LLM.
- Envoi réel de messages dans un site.
- Configuration de contexte JSON séparé, historique réel, logs ou stratégie de site.
- Toute option qui ne sert pas directement à définir ou tester la séquence de contenu.

## Étapes de développement

### Étape 1 — Simplifier le modèle de données
- Définir une paire avec identifiant stable, message envoyé et message reçu attendu.
- Remplacer le modèle fondé sur les cycles et horodatages.
- Définir la validation d'une séquence et des paires incomplètes.

### Étape 2 — Refaire l'interface
- Afficher des cartes numérotées avec deux champs par paire.
- Ajouter et supprimer des paires à volonté.
- Supprimer l'affichage des paramètres temporels, du contexte JSON et des métriques de durée.
- Ajouter une action unique pour lancer la simulation.

### Étape 3 — Implémenter le déroulement conversationnel
- Traiter les paires dans l'ordre.
- Résoudre les modèles des messages envoyés.
- Injecter le message reçu attendu dans la conversation simulée comme réponse déterministe.
- Ne jamais appeler le réseau, le DOM du site, l'API d'envoi ou un LLM réel.
- Afficher clairement ce qui a été simulé et ce qui a été validé.

### Étape 4 — Tests automatisés
- Ajouter, supprimer et ordonner les paires.
- Séquence complète et séquence vide.
- Champs vides et modèles invalides.
- Rendu Liquid et variables.
- Garantir l'absence d'effet de bord réseau/envoi.
- Vérifier que la réponse attendue est affichée comme réponse simulée, sans prétendre mesurer la qualité d'une vraie réponse LLM.

### Étape 5 — Intégration et livraison
- Mettre à jour les traductions FR/EN et la documentation.
- Exécuter npm test, npm run typecheck et les builds pertinents.
- Corriger les régressions, ouvrir une PR et vérifier la CI.

## Critères d'acceptation

1. L'interface du simulateur ne comporte que la définition des paires et l'action de simulation, plus les résultats.
2. Chaque paire comporte exactement un message envoyé et un message reçu attendu.
3. Le nombre de paires n'est pas limité artificiellement à un nombre de cycles.
4. La simulation est déterministe et n'envoie aucun message réel.
5. Les résultats n'affirment pas qu'une réponse réelle d'un LLM a été évaluée.
6. Les tests et le contrôle TypeScript passent.
