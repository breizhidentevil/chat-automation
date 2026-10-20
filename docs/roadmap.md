# Roadmap — Chat Automation

Cette roadmap est un plan évolutif. Avant chaque itération, vérifier le code, les issues, les pull requests et le journal pour éviter les doublons. Prioriser les risques réels observés plutôt que développer des fonctionnalités sans preuve de besoin.

## Principes de développement

1. Auditer l'existant avant de modifier le code.
2. Choisir une amélioration prioritaire et limitée par itération.
3. Ajouter ou adapter les tests de non-régression.
4. Exécuter les vérifications disponibles et corriger les échecs.
5. Ne déclarer une vérification réussie que sur la base d'un résultat confirmé, idéalement pour le commit exact.
6. Documenter chaque itération dans `CHANGELOG.md` et dans `docs/continuous-improvement-log.md` lorsque des détails techniques, résultats CI ou décisions de suivi sont utiles.
7. Travailler sur la branche dédiée `autonomous/continuous-improvement`; ne pas écraser le travail existant ni pousser directement sur `main`.
8. Ne jamais fusionner si les contrôles requis sont absents, en échec ou inconnus.

## Axes d'amélioration

### P0 — Fiabilité et sécurité

#### 1. Fiabiliser le moteur d'exécution
- Formaliser les états d'une automatisation : en attente, en cours, réussie, échouée et interrompue.
- Détecter les blocages, boucles et étapes qui ne progressent plus.
- Uniformiser la gestion des erreurs et des délais d'attente.
- Prévenir les exécutions répétées accidentelles d'actions.

**Résultat attendu :** des exécutions prévisibles et robustes.

#### 2. Récupération sûre après échec
- Distinguer les erreurs temporaires des erreurs permanentes.
- Réessayer uniquement les opérations dont la répétition est sûre.
- Reprendre après interruption seulement si l'état précédent est suffisamment fiable.
- Arrêter et signaler le besoin d'intervention lorsque la reprise est ambiguë.

**Résultat attendu :** moins d'échecs évitables sans créer d'effets indésirables.

#### 3. Sécurité des automatisations
- Évaluer les actions selon leur niveau de risque.
- Ajouter des confirmations pour les opérations sensibles ou destructrices lorsque c'est approprié.
- Limiter les répétitions dangereuses et les effets d'instructions ou contenus non fiables.
- Vérifier les permissions et les données accessibles à chaque étape.

**Résultat attendu :** limiter les effets indésirables dus à une configuration incorrecte ou à des entrées malveillantes.

### P1 — Diagnostic, validation et qualité

#### 4. Diagnostic et observabilité
- Tracer les étapes, durées, erreurs et tentatives de reprise.
- Expliquer la cause d'échec et indiquer l'étape concernée.
- Fournir des informations utiles pour reproduire et corriger les incidents.
- Masquer les données sensibles et limiter la taille des journaux.

**Résultat attendu :** réduire le temps de diagnostic sans exposer de données confidentielles.

#### 5. Validation avant exécution
- Vérifier les variables, références, conditions, modèles et configurations.
- Détecter les variables absentes, expressions invalides et configurations incohérentes.
- Repérer les étapes inaccessibles et les risques de boucle lorsque c'est possible.
- Présenter les erreurs avec leur emplacement et une explication exploitable.

**Résultat attendu :** détecter les erreurs de configuration avant le lancement.

#### 6. Variables et templates
- Uniformiser la résolution des variables entre les étapes.
- Renforcer la validation YAML/JSON, les types et les valeurs absentes.
- Détecter les collisions de noms et références ambiguës.
- Couvrir les filtres, conversions, chemins imbriqués et cas limites par des tests.

**Résultat attendu :** des données cohérentes et moins d'erreurs difficiles à reproduire.

#### 9. Tests et intégration continue
- Ajouter des tests unitaires aux fonctions critiques et aux correctifs de bugs.
- Couvrir les parcours d'exécution, interruptions, entrées malformées et scénarios de sécurité.
- Vérifier types, dépendances, smoke tests et builds pour les navigateurs pris en charge.
- Contrôler les artefacts de release et la documentation générée.
- Distinguer les résultats locaux des résultats CI et rattacher ceux-ci au commit validé.

**Résultat attendu :** réduire les régressions et fiabiliser les livraisons.

### P2 — Maintenabilité et cycle de vie

#### 8. Architecture modulaire
- Clarifier les frontières entre moteur, stratégies, variables, interface et persistance.
- Définir des interfaces internes stables.
- Réduire les dépendances croisées et les effets de bord.
- Supprimer les duplications uniquement lorsque la refactorisation est justifiée et testée.

**Résultat attendu :** faciliter les évolutions et limiter les régressions.

#### 10. Cycle de vie et maintenance
- Versionner les formats de configuration et prévoir les migrations nécessaires.
- Détecter les automatisations incompatibles après une mise à jour.
- Fiabiliser import/export, sauvegarde et restauration.
- Documenter les changements incompatibles et les procédures de récupération.
- Contrôler la cohérence des données au démarrage et après mise à jour.

**Résultat attendu :** préserver les automatisations existantes au fil des versions.

### P3 — Expérience utilisateur

#### 7. Éditeur et débogage
- Proposer un aperçu du rendu avant exécution.
- Mettre en évidence les erreurs directement dans l'éditeur.
- Faciliter la navigation entre étapes et dépendances.
- Permettre de tester une étape isolément lorsque cela ne déclenche aucun effet dangereux.
- Simplifier la réutilisation, la duplication et la réorganisation des séquences.

**Résultat attendu :** accélérer la création, la compréhension et la maintenance des automatisations.

## Ordre de traitement

1. **P0 :** fiabilité du moteur et prévention des actions répétées, puis sécurité.
2. **P1 :** récupération sûre, diagnostic, validation anticipée et tests/CI.
3. **P2 :** robustesse des variables, modularisation et cycle de vie.
4. **P3 :** améliorations UX et capacités supplémentaires justifiées par l'usage.

Les priorités peuvent changer à la suite d'un bug critique, d'un incident de sécurité, d'un échec CI ou d'une preuve concrète que l'ordre actuel n'est plus adapté.

## Critères de clôture d'une itération

Une tâche n'est considérée comme terminée que si :
- le changement répond à un problème identifié et ne duplique pas une fonctionnalité existante ;
- les tests pertinents sont ajoutés ou adaptés ;
- les vérifications disponibles ont été exécutées et leurs résultats consignés sans exagération ;
- la documentation et le changelog sont mis à jour si nécessaire ;
- le commit et l'état CI sont vérifiés avant toute demande de fusion ;
- aucune fusion n'est effectuée avec des contrôles requis en échec ou inconnus.

## État de suivi

La roadmap est un plan de travail, pas une affirmation que les dix axes sont déjà implémentés. Le statut et les décisions de chaque itération doivent être consignés dans [le journal d'amélioration continue](continuous-improvement-log.md). Les changements livrés à l'utilisateur doivent être résumés dans [CHANGELOG.md](../CHANGELOG.md).
