# Badassium238

**Un script PixInsight qui donne à chaque raie d'émission sa propre couleur dans les images SHO.**
SII rouge, Ha doré, OIII bleu, au lieu de l'habituel orange et bleu. Seule la teinte bouge :
la luminance, les détails et le bruit restent exactement tels quels.

*English version: [README.md](README.md)*

**À voir sur AstroBin**, grand champ Cassiopée / Céphée (NGC 7380 le Sorcier, NGC 7635 la Bulle),
SHO, SQA55 + QHY600M : [avant](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C) et [après Badassium238](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F).

## Pourquoi

En SHO (palette Hubble), SII et Ha viennent souvent des mêmes nuages de gaz. Après le mappage
habituel des couches, les deux tombent sur le même orange, et l'image devient bichrome : orange et
bleu. On perd la troisième couleur, et avec elle l'information sur l'endroit où chaque élément émet
vraiment.

Les outils classiques (ColorMask, courbes de teinte, masques couleur) travaillent sur la couleur
qu'on *voit*. Quand les zones riches en SII et celles riches en Ha sont toutes les deux orange, un
masque de teinte ne peut pas les distinguer. Badassium238 retourne aux données bande étroite pour
savoir quelle raie domine où, puis les sépare.

## Ce qu'il fait

1. **Diagnostic.** Il lit les trois masters linéaires sans étoiles (SII, Ha, OIII) et mesure, zone
   par zone, la part de chaque raie. Il repère ensuite quelles paires de raies finissent avec la même
   teinte dans l'image finale. Les trois paires sont testées, pas seulement SII/Ha.
2. **Proposition.** Il propose une couleur cible pour chaque raie, par exemple le SII vers le rouge
   et le Ha vers l'or. Force, tolérance et saturation se règlent raie par raie, avec un aperçu en
   direct.
3. **Application.** Il fait tourner uniquement la teinte, pixel par pixel, guidé par des cartes de
   raies adoucies (sans bords durs). La luminance est conservée exactement et un garde-fou empêche
   tout canal d'écrêter. Le résultat est une nouvelle image `<id>_mix` ; l'original n'est jamais
   modifié.

Sur le champ Cassiopée de l'auteur ([avant](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C), [après](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F)) : l'écart de teinte entre SII et Ha est passé d'environ 8° (le même orange) à
environ 24°, avec un écart de luminance mesuré nul et aucun nouveau pixel écrêté.

## Prérequis

| Fichier | PixInsight |
|---|---|
| `scripts/Badassium238.js` | 1.9.4 et suivants (moteur JavaScript V8) |
| `scripts/legacy/Badassium238_PI193.js` | 1.8.9-3 à 1.9.3 (moteur historique, moins éprouvé sur le terrain) |

Les images, toutes alignées pixel à pixel (pas de recadrage ni de rotation entre elles) :

* les **trois masters linéaires sans étoiles** SII, Ha et OIII (niveaux de gris, non étirés) ;
  ils servent seulement à localiser chaque raie ;
* l'**image finale étirée, sans étoiles, en RVB**, dont on veut changer les couleurs.

## Installation

### Par le dépôt de mises à jour PixInsight (recommandé)

1. *Resources > Updates > Manage Repositories*, ajouter
   `https://jps-34.github.io/Badassium238/`
2. *Resources > Updates > Check for Updates*, puis redémarrer PixInsight.
3. Le script apparaît dans *Script > Utilities > Badassium238*.

Tant que le dépôt n'est pas signé, PixInsight ne l'accepte que si l'option de sécurité
*Allow unsigned update repositories* est activée.

### À la main

Télécharger le `.js` qui correspond à ta version de PixInsight, puis soit le lancer avec
*Script > Execute Script File*, soit ajouter son dossier avec *Script > Feature Scripts > Add* pour
qu'il apparaisse dans le menu *Script > Utilities*.

## Démarrage rapide

Badassium238 est la **dernière étape couleur** : termine d'abord l'étirement, les courbes et
l'équilibre des couleurs de l'image sans étoiles, lance Badassium238, puis remets les étoiles. Des
courbes appliquées après déplaceraient de nouveau les teintes.

1. Choisir les masters SII, Ha et OIII et l'image finale, vérifier la palette (SHO par défaut).
2. **Analyser** : lit les images et affiche le tableau de diagnostic. Une paire marquée
   *confondues* est celle qui provoque la bichromie.
3. **Proposition** : met les cibles, forces et tolérances proposées.
4. Ajuster en regardant l'aperçu ; cocher **Avant** pour comparer.
5. **Appliquer** : crée `<id>_mix` en pleine résolution. La console donne les réglages, la part de
   pixels modifiés, l'écart de luminance maximal et le nombre de nouveaux pixels écrêtés.

Glisser le triangle *Nouvelle instance* sur le bureau enregistre tous les réglages dans une icône.

## Réglages

| Réglage | Rôle |
|---|---|
| **Cible** | Teinte visée en degrés : 0 rouge, 30 orange, 50 or, 60 jaune, 120 vert, 180 cyan, 240 bleu, 300 magenta. La laisser sur la couleur actuelle ne change rien. |
| **Force** | Jusqu'où les zones de cette raie vont vers la cible. 0 = raie inactive, 1 = en partie, 2 à 3 = presque jusqu'à la cible. |
| **Tolérance** | Quelles couleurs actuelles ont le droit de bouger, en degrés autour de la couleur actuelle de la raie. C'est ce qui protège les zones d'une autre couleur (par exemple une nébuleuse OIII bleue pendant qu'on règle SII et Ha). |
| **Saturation** | Intensité de la couleur dans les zones de cette raie : 1 = inchangée, 1,3 = 30 % plus franche, 0,8 = plus douce. La luminosité ne change pas. |
| **Carte des raies** | Ouvre les cartes utilisées : rouge = où le SII est plus fort que d'habitude, vert = Ha, bleu = OIII, noir = rien ne bougera. |

Les réglages avancés (lissage des raies, des cartes et de la couleur, seuil de signal, fonds de
ciel, poids SII et OIII) sont calculés automatiquement et changent rarement. Chaque réglage a une
infobulle.

### Conseils tirés des essais de l'auteur

* Une cible Ha au-delà d'environ 50° tire vers le jaune-vert à l'écran. Entre 40 et 48°, les cœurs
  sont dorés.
* Un SII vers 5° donne des filaments franchement rouges à côté du Ha doré.
* Le script ne fait jamais dépasser sa cible à un pixel : c'est la cible qui fixe la limite, pas la
  force.

## Le principe, en bref

Les couleurs sont traitées dans l'espace YCbCr Rec. 709. Pour chaque pixel, le vecteur de
chrominance (Cb, Cr) tourne vers la cible de chaque raie, pondéré par la carte de la raie, la force
et la proximité de la couleur actuelle avec la famille de couleur de cette raie.
Y = 0,2126 R + 0,7152 V + 0,0722 B est conservée exactement. Si la nouvelle couleur sort des
couleurs affichables, sa saturation est réduite juste assez pour qu'aucun canal ne dépasse
max(0,99 ; sa valeur d'origine).

## Licence

Copyright (c) 2026 Jacques Pouyaud. Publié sous [licence MIT](LICENSE).

Si tu t'en sers pour autre chose, une mention et un lien vers ce dépôt font toujours plaisir.
Les rapports de bug et suggestions sont bienvenus dans les issues GitHub.

## Remerciements

* Motifs de code PJSR repris de scripts PixInsight : PhotometricContinuumSubtraction et ApplySTF
  (Charles Hagen), portages V8 de VeraLux HyperMetric Stretch et GAME (salvolm84), portage historique
  de VeraLux Suite 2.1.0 (killerciao, lucasssvaz).
* Le nom est un clin d'œil à l'élément que Tony Stark synthétise dans *Iron Man 2*, surnommé
  « Badassium ».

*Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud, qui a défini le
besoin, testé sur ses propres données et validé les résultats.*
