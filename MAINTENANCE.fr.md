# Maintenance : développement, publication et signature

Notes pour l'auteur. Rien ici n'est nécessaire pour utiliser le script.

## 1. Mise en ligne initiale (faite en 1.0.3, gardée pour mémoire)

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

## 3. Branche dev, puis passage en prod

`main` = la production : GitHub Pages sert `docs/` depuis `main`, donc tout ce qui arrive sur `main`
part chez les utilisateurs PixInsight. Une nouvelle version va d'abord sur `dev`.

**Seule source à modifier : `scripts/Badassium238.js`** (V8, PixInsight 1.9.4 et plus).
`scripts/legacy/Badassium238_PI193.js` est la 1.1.0 figée pour PixInsight 1.8.9-3 à 1.9.3 : on n'y
touche plus, PixInsight retire ce moteur. `docs/` (zips, empreintes, `updates.xri`) est généré par
`python3 tools/build_repo.py --user jps-34` ; il garde automatiquement le paquet 1.1.0 pour la plage
1.8.9-3 à 1.9.3 et le paquet courant pour 1.9.4 et plus.

Mettre une nouvelle version sur dev (exemple avec le zip de la 1.2.0) :

```bash
cd <dossier du dépôt local>/Badassium238
git switch dev
git rm -rq .
unzip -o <dossier de téléchargement>/Badassium238-v1.2.0.zip -d /tmp/b238
cp -a /tmp/b238/Badassium238/. .
git add -A
git status                     # vérifier la liste avant de valider
git commit -m "Badassium238 1.2.0"
git push
```

Tester dans PixInsight : *Script > Execute Script File*, choisir
`scripts/Badassium238.js` dans le dépôt local. Le script tourne sans être installé, la version de
prod reste en place.

Passer en prod une fois validée :

```bash
git switch main
git merge dev
git tag -a v1.2.0 -m "Badassium238 1.2.0"
git push origin main --tags
git switch dev
```

Puis, dans PixInsight, *Resources > Updates > Check for Updates*.

Avec la signature (plus tard), l'ordre compte : signer `scripts/Badassium238.js` avec **CodeSign**,
lancer `python3 tools/build_repo.py --user jps-34`, signer `docs/updates.xri` en dernier, puis commit.

## 4. Versions et historique

* Numérotation `MAJEUR.MINEUR.CORRECTIF` : correctif = bug corrigé sans changement de résultat
  voulu, mineur = nouvelle fonction, majeur = réglages ou résultats incompatibles.
* Chaque version publiée a son étiquette `vX.Y.Z` et sa page *Release* avec ses deux zips. C'est là
  que les anciennes versions restent téléchargeables : le dépôt PixInsight (`docs/`) ne sert que la
  dernière.
* L'historique complet reste dans git : `git log --oneline --decorate`.
* Récupérer un fichier d'une ancienne version :
  `git show v1.0.3:scripts/Badassium238.js > Badassium238-1.0.3.js`

## 5. Dépannage : modifier par le site GitHub (sans git)

À réserver aux petites corrections de texte (README, CHANGELOG). Attention : une modification faite
sur le site dans la branche `main` est publiée immédiatement. Pour un script, passer par dev.

1. Sur la page du dépôt, ouvrir le dossier concerné, puis *Add file > Upload files* et déposer les
   fichiers modifiés : un fichier du même nom remplace l'ancien.
2. *Commit changes*. Penser ensuite à faire `git pull` sur `main` et `git merge main` sur dev.

## 6. Points encore à vérifier

* Que la version 1.1.0 pour PI 1.9.3 tourne sur une vraie installation 1.9.3 ou 1.8.9-3 (elle n'a
  été validée qu'en simulation).
* Langue : que la détection de la langue du système fonctionne sur chaque système (Linux, macOS,
  Windows). Si elle se trompe, le menu *Langue / Language* corrige et mémorise le choix.
