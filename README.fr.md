# Badassium238

**Un script PixInsight qui donne à chaque raie d'émission sa propre couleur dans les images SHO.**
SII rouge, Ha doré, OIII bleu, au lieu de l'habituel orange et bleu. Seule la teinte bouge :
la luminance, les détails et le bruit restent exactement tels quels. Des préréglages de palette
peuvent aussi recolorer les raies séparées (vraies couleurs des longueurs d'onde, rouge et
turquoise, tons minéraux doux, cuivre et sarcelle...).

*English version: [README.md](README.md)*

**À voir sur AstroBin**, grand champ Cassiopée / Céphée (NGC 7380 le Sorcier, NGC 7635 la Bulle),
SHO, SQA55 + QHY600M : [avant](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C) et [après Badassium238](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F).

## Pourquoi

En SHO (palette Hubble), des raies qui viennent des mêmes nuages de gaz finissent souvent avec la
même couleur après le mappage habituel des couches. Le plus souvent, ce sont le SII et le Ha, qui
tombent tous les deux sur le même orange : l'image devient bichrome, orange et bleu, et on perd
l'information sur l'endroit où chaque élément émet vraiment.

Les outils classiques (ColorMask, courbes de teinte, masques couleur) travaillent sur la couleur
qu'on *voit*. Quand les zones riches en SII et celles riches en Ha sont toutes les deux orange, un
masque de teinte ne peut pas les distinguer. Badassium238 retourne aux données bande étroite pour
savoir quelle raie domine où, puis les sépare.

## Ce qu'il fait

1. **Analyse.** Il lit les trois masters linéaires sans étoiles (SII, Ha, OIII) et mesure, zone par
   zone, la part de chaque raie et les endroits où une raie est plus forte que d'habitude par
   rapport à sa partenaire. Il repère ensuite quelles paires de raies finissent avec la même teinte
   dans l'image finale (les trois paires sont testées), mesure la couleur actuelle de chaque raie,
   et signale quand cette couleur est indéterminée (un cœur blanc, par exemple).
2. **Proposition.** Il propose une couleur cible par raie : la couleur actuelle pour les raies qui
   vont bien, et une séparation pour les paires confondues ou seulement en partie séparées, par
   exemple le SII vers le rouge et le Ha vers l'or. Les préréglages de palette remplissent les
   cibles autrement.
3. **Couleurs.** Par raie : cible, force, tolérance, saturation, avec un aperçu en direct et des
   curseurs fins. Un seul réglage global, *Zones mixtes*, décide si les zones où deux raies sont
   dans leur rapport habituel gardent leur couleur (séparation subtile) ou suivent les cibles
   (palette).
4. **Application.** Il fait tourner uniquement la teinte, pixel par pixel, guidé par des cartes de
   raies adoucies. La luminance est conservée exactement et un garde-fou empêche tout canal d'écrêter. Avec la
   proposition, un pixel ne dépasse jamais sa cible ; avec une palette, chaque famille est centrée
   sur sa cible et garde la moitié de ses écarts des deux côtés. Le résultat est une nouvelle image `<id>_mix` ;
   l'original n'est jamais modifié.

**Les masters linéaires ne servent qu'à la détection.** Ils indiquent au script où les raies se
recouvrent et laquelle domine. Ils ne sont jamais modifiés et leur luminosité ne se retrouve pas dans
le résultat : les couleurs sont changées uniquement sur l'image finale étirée.

Sur le champ Cassiopée de l'auteur ([avant](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C), [après](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F)) : l'écart de teinte entre SII et Ha est passé d'environ 8° (le même orange) à
environ 24°, avec un écart de luminance mesuré nul et aucun nouveau pixel écrêté.

## Prérequis

| Fichier | PixInsight |
|---|---|
| `scripts/Badassium238.js` (1.2.3) | 1.9.4 et suivants (moteur JavaScript V8) |
| `scripts/legacy/Badassium238_PI193.js` (1.1.0, figée) | 1.8.9-3 à 1.9.3 (moteur historique) |

PixInsight retire son moteur JavaScript historique (il est déjà absent sur macOS Apple Silicon) :
à partir de la version 1.2, Badassium238 est développé pour le moteur V8 seulement. La version
1.1.0 reste disponible pour PixInsight 1.9.3 et antérieurs, par le même dépôt de mises à jour.

Les images, toutes alignées pixel à pixel (pas de recadrage ni de rotation entre elles) :

* les **trois masters linéaires sans étoiles** SII, Ha et OIII (niveaux de gris, non étirés, en
  32 bits flottant de préférence), qui servent seulement à localiser chaque raie ;
* l'**image finale étirée, sans étoiles, en RVB**, dont on veut changer les couleurs.

## Langue

L'interface existe en **anglais et en français**. PixInsight lui-même n'est pas traduit
([FAQ PixInsight](https://pixinsight.com/faq/) : « We currently have no plans to publish localized
versions of PixInsight »), le script ne peut donc pas suivre un réglage de langue de PixInsight. Au
premier lancement, il prend la langue du système, et l'anglais sinon. Le menu **Langue / Language**
en haut du dialogue permet de changer à tout moment : le dialogue se rouvre aussitôt, en gardant
l'analyse et tous les réglages, et le choix est mémorisé.

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

1. **Images** : choisir les masters SII, Ha et OIII et l'image finale.
2. **Analyser** : lit les images, affiche le tableau de diagnostic et un résumé d'une ligne, puis
   applique la proposition. La console donne le détail.
3. **Couleurs** : ajuster en regardant l'aperçu, cocher **Avant** pour comparer, ou choisir une
   palette dans le menu *Préréglage*. *Familles* montre à quelle raie appartient chaque zone.
4. **Appliquer** : crée `<id>_mix` en pleine résolution. La console donne les réglages, la part de
   pixels modifiés, l'écart de luminance maximal et le nombre de nouveaux pixels écrêtés.

Glisser le triangle *Nouvelle instance* sur le bureau enregistre tous les réglages dans une icône.
**Réinitialiser** remet tous les réglages par défaut en gardant les images.

Le script mémorise ses réglages d'une session à l'autre. Quand des réglages qui ne sont pas ceux
par défaut sont restaurés (réglages avancés, fonds ou poids manuels, cibles personnalisées), un
avertissement le dit en haut du dialogue, jusqu'à ce que tu cliques sur *Réinitialiser*.

## Réglages

### Couleurs

| Réglage | Rôle |
|---|---|
| **Préréglage** | *Proposition* (par défaut) : cibles sur les couleurs actuelles, séparation des paires confondues ou en partie séparées. Les autres remplissent les cibles d'une palette. *Personnalisée* : tes propres cibles (automatique dès qu'on en modifie une). |
| **Zones mixtes** | Zones où les deux raies d'une paire sont dans leur rapport habituel. 0 = elles gardent leur couleur, seules les zones où une raie est plus forte que d'habitude vont vers sa cible (séparation subtile, comme la proposition). 1 = elles prennent la couleur à mi-chemin des deux cibles (toute la paire est recolorée, comme avec une palette). |

### Par raie

| Réglage | Rôle |
|---|---|
| **Cible** | Teinte visée en degrés : 0 rouge, 30 orange, 50 or, 60 jaune, 120 vert, 180 cyan, 240 bleu, 300 magenta. La pastille montre la couleur. La laisser sur la couleur actuelle ne change rien. |
| **Force** | 0 = raie inactive, 1 = les zones de cette raie vont jusqu'à la cible, entre les deux = en partie. Avec la proposition, un pixel ne dépasse jamais sa cible ; avec une palette, la famille se répartit des deux côtés de la cible. |
| **Tolérance** | Quelles couleurs actuelles ont le droit de bouger, en degrés autour de la couleur actuelle de la raie (180 = sans limite, utilisé par les palettes). C'est ce qui protège les zones d'une autre couleur (par exemple une nébuleuse OIII bleue pendant qu'on règle SII et Ha). |
| **Saturation** | Intensité de la couleur dans les zones de cette raie : 1 = inchangée, 1,3 = 30 % plus franche, 0,8 = plus douce. La luminosité ne change pas. |

Sous chaque curseur, un curseur *fin ±* fait un zoom autour de la valeur actuelle pour un réglage
précis (±15° pour les cibles, ±0,1 pour la force, ±10° pour la tolérance, ±0,2 pour la saturation).

Une raie dont la couleur actuelle ne peut pas être mesurée (concentration de teinte inférieure à
0,35, typiquement un cœur blanc ou gris) est signalée *indéterminée* et laissée inactive par la
proposition et les préréglages.

### Préréglages

| Préréglage | SII | Ha | OIII | Saturation |
|---|---|---|---|---|
| SII rouge, Ha or, OIII bleu | 5° | 45° | 225° | 1 |
| Ha rouge, SII or, OIII bleu | 45° | 0° | 225° | 1 |
| Vraies couleurs (longueurs d'onde) | 355° | 355° | 160° | 1 |
| Naturel rouge / turquoise | 345° | 355° | 185° | 0,85 |
| Minéral (doux) | 20° | 38° | 205° | 0,55 |
| Cuivre et sarcelle | 12° | 32° | 185° | 0,85 |

Les *Vraies couleurs* sont calculées depuis les longueurs d'onde des raies (fonctions colorimétriques
CIE 1931, converties en sRGB) : SII 672,4 nm et Ha 656,3 nm donnent tous les deux un rouge vers 355°,
OIII 500,7 nm un vert-turquoise vers 160°. Comme SII et Ha partagent alors le même rouge, ce
préréglage abandonne volontairement la séparation SII/Ha : il montre ce que verrait l'œil, pas où
chaque élément émet.

### Réglages avancés

*Image finale montée en* (SHO par défaut : quelle raie est dans le rouge, le vert, le bleu ; sert à
la proposition pour le sens d'une séparation), *écart proposé* (25° de part et d'autre de la couleur
commune ; le Ha n'est pas poussé au-delà de 48°, qui vire au jaune-vert à l'écran), *contraste de
séparation*, *netteté des familles*, *resserrement* (réduit les variations de teinte à l'intérieur
d'une famille, utile surtout avec une palette sur une famille large), lissages, seuil de signal,
fonds de ciel et poids SII/OIII. Tous sont calculés automatiquement ou ont des valeurs par défaut
validées ; la console indique `(auto)` ou `(manuel)` après les fonds et les poids.

### Conseils tirés des essais de l'auteur

* Une cible Ha au-delà d'environ 50° tire vers le jaune-vert à l'écran. Entre 40 et 48°, les cœurs
  sont dorés.
* Un SII vers 5° donne des filaments franchement rouges à côté du Ha doré.
* Avec la proposition, le script ne fait jamais dépasser sa cible à un pixel : c'est la cible qui
  fixe la limite, pas la force. Avec une palette, la famille est centrée sur la cible et garde la
  moitié de ses écarts des deux côtés (resserrement 0,5).
* Les étoiles ne sont pas traitées. Pour des couleurs d'étoiles tirées des données bande étroite,
  voir [PSCM (Planck Star Color Mapping)](https://github.com/drraupach/PSCM) du Dr Rainer Raupach, à
  appliquer sur l'image des étoiles avant la recombinaison.

## Le principe, en bref

Chaque pixel appartient aux trois familles de couleur (une par raie) selon les proportions des raies
mises à niveau ; une paire confondue ou en partie séparée est partagée entre ses deux raies là où
l'une est plus forte que d'habitude (cartes « caractère »). Les couleurs sont traitées dans l'espace
YCbCr Rec. 709 : le vecteur de chrominance (Cb, Cr) de chaque famille tourne de son centre mesuré
vers sa cible, pondéré par l'appartenance, la force, le signal et la proximité de la couleur lissée
avec la couleur de la famille (tolérance). Si la nouvelle couleur sort des couleurs affichables, sa
saturation est réduite juste assez pour qu'aucun canal ne dépasse max(0,99 ; sa valeur d'origine).

La luminance est Y = 0,2126 R + 0,7152 V + 0,0722 B (coefficients Rec. 709, fixés dans le code) et
elle est conservée exactement. La luminance de PixInsight utilise les coefficients de l'espace de
travail RVB de l'image (0,222491 ; 0,716888 ; 0,060621 par défaut), sa mesure peut donc différer très
légèrement : sur l'image de l'auteur, l'écart de L* CIE était de 0,08 en moyenne, 0,6 au 99e centile
et 3,5 au maximum.

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

*Code écrit par Claude (Anthropic),
sous la direction de Jacques Pouyaud, qui a défini le besoin, testé sur ses propres données et validé
les résultats.*
