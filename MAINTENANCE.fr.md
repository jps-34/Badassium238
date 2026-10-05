# Maintenance : publication et signature

Notes pour l'auteur. Rien ici n'est nécessaire pour utiliser le script.

## 1. Mise en ligne initiale

1. Le nom d'utilisateur `jps-34` est déjà en place partout (README, page du dépôt, en-têtes des
   scripts), et le dépôt de mises à jour est déjà construit dans `docs/`. Pour le reconstruire
   après une modification des scripts :

   ```bash
   python3 tools/build_repo.py --user jps-34
   ```

2. Créer le dépôt `Badassium238` sur GitHub (public), puis :

   ```bash
   git init && git add . && git commit -m "Badassium238 1.0.3"
   git branch -M main
   git remote add origin git@github.com:jps-34/Badassium238.git
   git push -u origin main
   ```

3. Sur GitHub : *Settings > Pages > Build and deployment > Deploy from a branch*, branche `main`,
   dossier `/docs`. Le dépôt PixInsight est alors servi à
   `https://jps-34.github.io/Badassium238/`.

4. Test : dans PixInsight, *Resources > Updates > Manage Repositories*, ajouter cette URL, puis
   *Check for Updates*. Tant que ce n'est pas signé, il faut l'option de sécurité
   *Allow unsigned update repositories*.

## 2. Signature (une fois pour toutes)

Référence : [Script code signing](https://pixinsight.com/doc/docs/ScriptCodeSigning/ScriptCodeSigning.html)
et [Update repositories](https://pixinsight.com/doc/docs/PIRepositoryReference/PIRepositoryReference.html).

1. **Clés** : script **SigningKeys** (fourni avec PixInsight). Il crée une paire de clés dans un
   fichier `.xssk` protégé par mot de passe. Mot de passe très fort, fichier sauvegardé hors ligne,
   **jamais dans Git** (le `.gitignore` l'exclut).
2. **Statut de développeur certifié (CPD)** : script **SubmitCPD**, avec un identifiant de
   développeur, la clé publique et une adresse e-mail. L'équipe PixInsight étudie la demande et
   recontacte si besoin. C'est une vérification d'identité, pas une revue du code. Sans ce statut,
   la signature n'est reconnue que sur tes propres machines.

## 3. Publier une version (signée)

L'ordre compte : toute modification après une signature l'invalide.

1. Mettre à jour `VERSION` dans les deux scripts et le `CHANGELOG.md`.
2. Signer `scripts/Badassium238.js` et `scripts/legacy/Badassium238_PI193.js` avec le script
   **CodeSign** : il crée les fichiers `.xsgn` à côté des `.js`.
3. `python3 tools/build_repo.py --user jps-34` : les `.xsgn` sont inclus dans les archives,
   les empreintes SHA-1 recalculées, `docs/updates.xri` régénéré.
4. Signer `docs/updates.xri` avec **CodeSign** (la signature est ajoutée à la fin du fichier).
5. Commit et push. GitHub Pages met le dépôt à jour en une minute environ.

Les `.xsgn` se committent avec les scripts : ils permettent aussi de vérifier une installation
manuelle.

## 4. Points à vérifier au premier essai

* Que PixInsight lit bien le dépôt servi par GitHub Pages (il ne demande que des fichiers statiques
  en HTTPS ; d'autres dépôts PixInsight fonctionnent sur ce principe, mais celui-ci n'a pas encore
  été testé).
* Que la version PI 1.9.3 tourne sur une vraie installation 1.9.3 (elle n'a été validée qu'en
  simulation).
