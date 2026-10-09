# Badassium238

**Un script PixInsight qui donne à chaque raie d'émission sa propre couleur dans les images SHO.**
SII rouge, Ha doré, OIII bleu, au lieu de l'habituel orange et bleu. Seule la teinte bouge :
la luminance, les détails et le bruit restent exactement tels quels. Une passe de palette
facultative peut ensuite recolorer les raies séparées (vraies couleurs des longueurs d'onde, rouge
et turquoise, tons minéraux doux...).

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

1. **Passe 1, diagnostic.** Il lit les trois masters linéaires sans étoiles (SII, Ha, OIII) et
   mesure, zone par zone, la part de chaque raie. Il repère ensuite quelles paires de raies finissent
   avec la même teinte dans l'image finale. Les trois paires sont testées (SII/Ha, SII/OIII,
   Ha/OIII), pas seulement SII/Ha.
2. **Passe 2, séparation.** Il propose une couleur cible pour chaque raie, par exemple le SII vers
   le rouge et le Ha vers l'or. Force, tolérance et saturation se règlent raie par raie, avec un
   aperçu en direct.
3. **Passe 3, palette (cosmétique, facultative).** Une fois les raies séparées, chaque famille de
   couleur peut être déplacée en bloc vers la teinte d'une palette : préréglages ou teintes au choix.
4. **Application.** Il fait tourner uniquement la teinte, pixel par pixel, guidé par des cartes de
   raies adoucies (sans bords durs). La luminance est conservée exactement et un garde-fou empêche
   tout canal d'écrêter. Le résultat est une nouvelle image `<id>_mix` ; l'original n'est jamais
   modifié.

**Les masters linéaires ne servent qu'à la détection.** Ils indiquent au script où les raies se
recouvrent et laquelle domine. Ils ne sont jamais modifiés et leur luminosité ne se retrouve pas dans
le résultat : les couleurs sont changées uniquement sur l'image finale étirée.

Sur le champ Cassiopée de l'auteur ([avant](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C), [après](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F)) : l'écart de teinte entre SII et Ha est passé d'environ 8° (le même orange) à
environ 24°, avec un écart de luminance mesuré nul et aucun nouveau pixel écrêté.

## Prérequis

| Fichier | PixInsight |
|---|---|
| `scripts/Badassium238.js` | 1.9.4 et suivants (moteur JavaScript V8) |
| `scripts/legacy/Badassium238_PI193.js` | 1.8.9-3 à 1.9.3 (moteur historique, moins éprouvé sur le terrain) |

Les images, toutes alignées pixel à pixel (pas de recadrage ni de rotation entre elles) :

* les **trois masters linéaires sans étoiles** SII, Ha et OIII (niveaux de gris, non étirés), qui
  servent seulement à localiser chaque raie ;
* l'**image finale étirée, sans étoiles, en RVB**, dont on veut changer les couleurs.

## Langue

L'interface existe en **anglais et en français**. PixInsight lui-même n'est pas traduit
([FAQ PixInsight](https://pixinsight.com/faq/) : « We currently have no plans to publish localized
versions of PixInsight »), le script ne peut donc pas suivre un réglage de langue de PixInsight. Au
premier lancement, il prend la langue du système (variables d'environnement `LANGUAGE`, `LC_ALL`,
`LC_MESSAGES`, `LANG`, puis la locale du système), et l'anglais sinon.

Pour changer, utiliser le menu **Langue / Language** en haut du dialogue. Le dialogue se rouvre
aussitôt dans la langue choisie, en gardant l'analyse et tous les réglages, et le choix est mémorisé.

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

1. Choisir les masters SII, Ha et OIII et l'image finale, vérifier l'ordre R, V, B (SHO par défaut).
2. **Analyser** : lit les images et affiche le tableau de diagnostic. Une paire marquée
   *confondues* est celle qui provoque la bichromie.
3. **Proposition** : met les cibles, forces et tolérances proposées.
4. Ajuster en regardant l'aperçu ; cocher **Avant** pour comparer.
5. Si tu veux, choisir une palette dans la **Passe 3**.
6. **Appliquer** : crée `<id>_mix` en pleine résolution. La console donne les réglages, la part de
   pixels modifiés, l'écart de luminance maximal et le nombre de nouveaux pixels écrêtés.

Glisser le triangle *Nouvelle instance* sur le bureau enregistre tous les réglages dans une icône.

## Réglages

### Passe 2, raie par raie

| Réglage | Rôle |
|---|---|
| **Cible** | Teinte visée en degrés : 0 rouge, 30 orange, 50 or, 60 jaune, 120 vert, 180 cyan, 240 bleu, 300 magenta. La laisser sur la couleur actuelle ne change rien. |
| **Force** | Jusqu'où les zones de cette raie vont vers la cible. 0 = raie inactive, 1 = en partie, 2 à 3 = presque jusqu'à la cible. |
| **Tolérance** | Quelles couleurs actuelles ont le droit de bouger, en degrés autour de la couleur actuelle de la raie. C'est ce qui protège les zones d'une autre couleur (par exemple une nébuleuse OIII bleue pendant qu'on règle SII et Ha). |
| **Saturation** | Intensité de la couleur dans les zones de cette raie : 1 = inchangée, 1,3 = 30 % plus franche, 0,8 = plus douce. La luminosité ne change pas. |
| **Carte des raies** | Ouvre les cartes utilisées : rouge = où le SII est plus fort que d'habitude, vert = Ha, bleu = OIII, noir = rien ne bougera. |

**Curseurs fins.** Sous chaque curseur principal, un second curseur marqué *fin ±* fait un zoom
autour de la valeur actuelle pour un réglage précis : ±15° pour les cibles et les teintes de
palette, ±0,3 pour la force, ±10° pour la tolérance, ±0,2 pour la saturation. Il se recentre quand on
relâche la souris. On peut aussi taper les valeurs dans les cases.

Les réglages avancés (lissage des raies, des cartes et de la couleur, seuil de signal, fonds de
ciel, poids SII et OIII) sont calculés automatiquement et changent rarement. Chaque réglage a une
infobulle.

### Passe 3, palette

| Réglage | Rôle |
|---|---|
| **Préréglage** | *Aucune* (passe 3 désactivée, par défaut), une palette prédéfinie, ou *Personnalisée*. Modifier une teinte bascule sur Personnalisée. |
| **SII, Ha, OIII** | Teinte de palette pour la famille de couleur de chaque raie, en degrés, avec une pastille de couleur. |
| **Saturation** | Saturation de la palette dans les zones de signal : moins de 1 plus douce, plus de 1 plus franche. |
| **Intensité** | 1 = familles amenées sur les teintes de la palette, 0,5 = à mi-chemin, 0 = sans effet. |

| Préréglage | SII | Ha | OIII | Saturation |
|---|---|---|---|---|
| SII rouge, Ha or, OIII bleu | 5° | 45° | 225° | 1 |
| Ha rouge, SII or, OIII bleu | 45° | 0° | 225° | 1 |
| Vraies couleurs (longueurs d'onde) | 355° | 355° | 160° | 1 |
| Naturel rouge / turquoise | 345° | 355° | 185° | 0,85 |
| Minéral (doux) | 20° | 38° | 205° | 0,55 |

Les *Vraies couleurs* sont calculées depuis les longueurs d'onde des raies (fonctions colorimétriques
CIE 1931, converties en sRGB) : SII 672,4 nm et Ha 656,3 nm donnent tous les deux un rouge vers 355°,
OIII 500,7 nm un vert-turquoise vers 160°. Comme SII et Ha partagent alors le même rouge, ce
préréglage abandonne volontairement la séparation SII/Ha : il montre ce que verrait l'œil, pas où
chaque élément émet.

Le principe de la passe 3 : la couleur de chaque famille après la passe 2 est mesurée (moyenne
circulaire pondérée par le signal), puis toute la famille tourne pour que son centre tombe sur la
teinte de la palette. La moitié des variations de couleur à l'intérieur d'une famille est gardée,
pour que l'image ne devienne pas plate. Un pixel appartient à une famille selon les proportions des
raies ; pour une paire confondue, la part de la paire est partagée entre ses deux raies avec les
mêmes cartes de raies que la passe 2. Les pixels dont la couleur est loin de celle de leur famille
(plus de 120°) bougent de moins en moins, pour qu'aucun pixel isolé ne bascule vers la couleur
opposée. Rien ne bouge sur le fond de ciel.

Limites : la passe 3 ne peut recolorer que ce que la passe 2 a séparé. Avec *Ha rouge, SII or*,
l'inversion est nette là où une raie domine franchement ; dans les zones mélangées, le résultat reste
proche de l'orange.

### Conseils tirés des essais de l'auteur

* Une cible Ha au-delà d'environ 50° tire vers le jaune-vert à l'écran. Entre 40 et 48°, les cœurs
  sont dorés.
* Un SII vers 5° donne des filaments franchement rouges à côté du Ha doré.
* Le script ne fait jamais dépasser sa cible à un pixel : c'est la cible qui fixe la limite, pas la
  force.
* Les étoiles ne sont pas traitées. Pour des couleurs d'étoiles tirées des données bande étroite,
  voir [PSCM (Planck Star Color Mapping)](https://github.com/drraupach/PSCM) du Dr Rainer Raupach, à
  appliquer sur l'image des étoiles avant la recombinaison.

## Le principe, en bref

Les couleurs sont traitées dans l'espace YCbCr Rec. 709. Pour chaque pixel, le vecteur de
chrominance (Cb, Cr) tourne vers la cible de chaque raie, pondéré par la carte de la raie, la force
et la proximité de la couleur actuelle avec la famille de couleur de cette raie. Si la nouvelle
couleur sort des couleurs affichables, sa saturation est réduite juste assez pour qu'aucun canal ne
dépasse max(0,99 ; sa valeur d'origine).

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

*Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud, qui a défini le
besoin, testé sur ses propres données et validé les résultats.*
