# Badassium238

**A PixInsight script that gives each emission line its own colour in SHO images.**
SII red, Ha gold, OIII blue, instead of the usual orange and blue. Only the hue moves:
luminance, detail and noise are left exactly as they were.

*Version française : [README.fr.md](README.fr.md)*

**See it on AstroBin**, Cassiopeia / Cepheus wide field (NGC 7380 Wizard, NGC 7635 Bubble), SHO,
SQA55 + QHY600M: [before](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C) and [after Badassium238](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F).

## Why

In SHO (Hubble palette) images, SII and Ha often come from the same gas clouds. After the usual
channel mapping both lines land on the same orange, and the image ends up two-coloured: orange and
blue. The third colour is lost, and with it the information about where each element actually glows.

The usual tools (ColorMask, hue curves, colour masks) work on the colour you *see*. When SII-rich and
Ha-rich areas are both orange, a hue mask cannot tell them apart. Badassium238 goes back to the
narrowband data to find out which line dominates where, then separates them.

## What it does

1. **Diagnosis.** Reads the three linear starless masters (SII, Ha, OIII) and measures, area by area,
   how much each line contributes. It then checks which pairs of lines end up with the same hue in
   your final image. All three pairs are tested, not just SII/Ha.
2. **Proposal.** Suggests a target colour for each line, for example SII toward red and Ha toward
   gold. Strength, tolerance and saturation can be adjusted per line, with a live preview.
3. **Apply.** Rotates the hue only, pixel by pixel, guided by smooth line maps (no hard edges).
   Luminance is kept exactly, and a guard prevents any channel from clipping. The result is a new
   image `<id>_mix`; the original is never modified.

On the author's Cassiopeia field ([before](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C), [after](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F)): the SII/Ha hue difference went from about 8° (the same orange) to about 24°,
with a measured luminance change of 0 and no newly clipped pixel.

## Requirements

| File | PixInsight |
|---|---|
| `scripts/Badassium238.js` | 1.9.4 and later (V8 JavaScript engine) |
| `scripts/legacy/Badassium238_PI193.js` | 1.8.9-3 to 1.9.3 (legacy engine, less field-tested) |

Inputs, all pixel-aligned (no crop or rotation between them):

* the **three linear starless masters** SII, Ha and OIII (grayscale, not stretched); they are only
  read to locate each line;
* the **final stretched starless RGB image** whose colours you want to change.

The interface is in French for now (see the label table below).

## Installation

### From the PixInsight update repository (recommended)

1. *Resources > Updates > Manage Repositories*, add
   `https://jps-34.github.io/Badassium238/`
2. *Resources > Updates > Check for Updates*, then restart PixInsight.
3. The script appears under *Script > Utilities > Badassium238*.

Until the repository is code-signed, PixInsight only accepts it with the
*Allow unsigned update repositories* security preference enabled.

### Manual

Download the `.js` file matching your PixInsight version, then either run it with
*Script > Execute Script File*, or add its folder with *Script > Feature Scripts > Add* so it shows
up in the *Script > Utilities* menu.

## Quick start

Badassium238 is the **last colour step**: finish the stretch, curves and colour balance of the
starless image first, run Badassium238, then put the stars back. Curves applied afterwards would
move the hues again.

1. Select the SII, Ha and OIII masters and the final image, check the palette (SHO by default).
2. **Analyser** (Analyse): reads the images and shows the diagnosis table. A pair marked
   *confondues* (merged) is causing the two-colour look.
3. **Proposition**: sets proposed targets, strengths and tolerances.
4. Adjust while watching the preview; tick **Avant** (Before) to compare.
5. **Appliquer** (Apply): creates `<id>_mix` at full resolution. The console reports the settings,
   the share of pixels changed, the maximum luminance difference and the number of newly clipped
   pixels.

Dragging the *New Instance* triangle to the workspace saves all settings in a process icon.

## Settings

| Label (French) | Meaning |
|---|---|
| **Cible** (target) | Target hue in degrees: 0 red, 30 orange, 50 gold, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta. Leaving it on the current colour changes nothing. |
| **Force** (strength) | How far the areas of this line move toward the target. 0 = line inactive, 1 = part of the way, 2 to 3 = nearly all the way. |
| **Tolérance** (tolerance) | Which current colours are allowed to move, in degrees around the line's current colour. This is what protects areas of another colour (e.g. a blue OIII nebula while you work on SII and Ha). |
| **Saturation** | Colour intensity in the areas of this line: 1 = unchanged, 1.3 = 30 % stronger, 0.8 = softer. Luminance does not change. |
| **Carte des raies** (line map) | Opens the maps used: red = where SII is stronger than usual, green = Ha, blue = OIII, black = nothing will move. |

Advanced settings (line smoothing, map smoothing, colour smoothing, signal threshold, sky
backgrounds, SII/OIII weights) are computed automatically and rarely need changing. Every control
has a tooltip.

### Tips from the author's tests

* Ha targets above about 50° drift toward yellow-green on screen. Around 40 to 48° gives gold cores.
* SII around 5° gives clearly red filaments next to the gold Ha.
* The script never moves a pixel past its target, so the target is the limit to set, not the
  strength.

## How it works, in short

Colours are handled in the Rec. 709 YCbCr space. For each pixel, the chroma vector (Cb, Cr) is
rotated toward the target of each line, weighted by the line map, the strength and the closeness of
the current colour to that line's colour family. Y = 0.2126 R + 0.7152 G + 0.0722 B is kept exactly.
If the new colour falls outside the displayable range, its saturation is reduced just enough so that
no channel exceeds max(0.99, its original value).

## License

Copyright (c) 2026 Jacques Pouyaud. Released under the [MIT License](LICENSE).

If you build on it, a mention and a link back to this repository are appreciated.
Bug reports and suggestions are welcome as GitHub issues.

## Credits

* PJSR coding patterns from PixInsight scripts: PhotometricContinuumSubtraction and ApplySTF
  (Charles Hagen), VeraLux HyperMetric Stretch and GAME V8 ports (salvolm84), VeraLux Suite 2.1.0
  legacy port (killerciao, lucasssvaz).
* The name is a nod to the element Tony Stark synthesises in *Iron Man 2*, nicknamed "Badassium".

*Code written by Claude (Anthropic), under the direction of Jacques Pouyaud, who defined
the need, tested it on his own data and validated the results.*
