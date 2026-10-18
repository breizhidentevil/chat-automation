# Importer le projet et son historique Git

Cette archive contient les fichiers du projet et un bundle Git correspondant à cette version du code.

## Recréer le dépôt local à partir de l'historique inclus

Depuis un terminal, dans le dossier où vous souhaitez installer le dépôt :

```bash
git clone git/chat-automation-git.bundle chat-automation
cd chat-automation
```

Le chemin `git/chat-automation-git.bundle` est relatif au dossier extrait de l'archive. Si vous lancez la commande depuis un autre dossier, adaptez le chemin vers le bundle.

## Publier sur GitHub

Après avoir créé le dépôt GitHub vide `breizhidentevil/chat-automation`, configurez le dépôt distant puis poussez la branche :

```bash
git remote add origin https://github.com/breizhidentevil/chat-automation.git
git push -u origin main
```

Le bundle contient l'historique Git de la version incluse dans cette archive. Les builds, tests et le déploiement doivent être vérifiés après publication ; leur présence dans le workflow ne garantit pas qu'ils ont déjà réussi.
