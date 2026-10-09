# Badassium238

**A PixInsight script that gives each emission line its own colour in SHO images.**
SII red, Ha gold, OIII blue, instead of the usual orange and blue. Only the hue moves:
luminance, detail and noise are left exactly as they were. An optional palette pass can then
recolour the separated lines (true wavelength colours, red and teal, soft mineral tones...).

*Version française : [README.fr.md](README.fr.md)*

**See it on AstroBin**, Cassiopeia / Cepheus wide field (NGC 7380 Wizard, NGC 7635 Bubble), SHO,
SQA55 + QHY600M: [before](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C) and [after Badassium238](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F).

## Why

In SHO (Hubble palette) images, lines that come from the same gas clouds often end up with the
same colour after the usual channel mapping. Most of the time it is SII and Ha, which both land on
the same orange: the image becomes two-coloured, orange and blue, and the information about where
each element actually glows is lost.

The usual tools (ColorMask, hue curves, colour masks) work on the colour you *see*. When SII-rich and
Ha-rich areas are both orange, a hue mask cannot tell them apart. Badassium238 goes back to the
narrowband data to find out which line dominates where, then separates them.

## What it does

1. **Pass 1, diagnosis.** Reads the three linear starless masters (SII, Ha, OIII) and measures, area
   by area, how much each line contributes. It then checks which pairs of lines end up with the same
   hue in your final image. All three pairs are tested (SII/Ha, SII/OIII, Ha/OIII), not just SII/Ha.
2. **Pass 2, separation.** Proposes a target colour for each line, for example SII toward red and Ha
   toward gold. Strength, tolerance and saturation can be adjusted per line, with a live preview.
3. **Pass 3, palette (cosmetic, optional).** Once the lines are separated, each colour family can be
   moved as a whole to the hue of a palette: presets or your own hues.
4. **Apply.** Rotates the hue only, pixel by pixel, guided by smooth line maps (no hard edges).
   Luminance is kept exactly, and a guard prevents any channel from clipping. The result is a new
   image `<id>_mix`; the original is never modified.

**The linear masters are only used for detection.** They tell the script where the lines overlap
and which one dominates. They are never modified, and their brightness does not end up in the
result: the colours are changed on the final stretched image only.

On the author's Cassiopeia field ([before](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C), [after](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F)): the SII/Ha hue difference went from about 8° (the same orange) to about 24°,
with a measured luminance change of 0 and no newly clipped pixel.

## Requirements

| File | PixInsight |
|---|---|
| `scripts/Badassium238.js` | 1.9.4 and later (V8 JavaScript engine) |
| `scripts/legacy/Badassium238_PI193.js` | 1.8.9-3 to 1.9.3 (legacy engine, less field-tested) |

Inputs, all pixel-aligned (no crop or rotation between them):

* the **three linear starless masters** SII, Ha and OIII (grayscale, not stretched), used only to
  locate each line;
* the **final stretched starless RGB image** whose colours you want to change.

## Language

The interface is available in **English and French**. PixInsight itself is not localised
([PixInsight FAQ](https://pixinsight.com/faq/): "We currently have no plans to publish localized
versions of PixInsight"), so the script cannot follow a PixInsight language setting. On first run it
uses the language of the system (environment variables `LANGUAGE`, `LC_ALL`, `LC_MESSAGES`, `LANG`,
then the system locale), and English otherwise.

To switch, use the **Langue / Language** menu at the top of the dialog. The dialog reopens at once
in the chosen language, keeping the analysis and all settings, and the choice is remembered.

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

1. Select the SII, Ha and OIII masters and the final image, check the R, G, B order (SHO by default).
2. **Analyse**: reads the images and shows the diagnosis table. A pair marked *merged* is causing
   the two-colour look.
3. **Proposal**: sets proposed targets, strengths and tolerances.
4. Adjust while watching the preview; tick **Before** to compare.
5. Optionally, pick a palette in **Pass 3**.
6. **Apply**: creates `<id>_mix` at full resolution. The console reports the settings, the share of
   pixels changed, the maximum luminance difference and the number of newly clipped pixels.

Dragging the *New Instance* triangle to the workspace saves all settings in a process icon.

## Settings

### Pass 2, per line

| Setting | Meaning |
|---|---|
| **Target** | Target hue in degrees: 0 red, 30 orange, 50 gold, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta. Leaving it on the current colour changes nothing. |
| **Strength** | How far the areas of this line move toward the target. 0 = line inactive, 1 = part of the way, 2 to 3 = nearly all the way. |
| **Tolerance** | Which current colours are allowed to move, in degrees around the line's current colour. This is what protects areas of another colour (e.g. a blue OIII nebula while you work on SII and Ha). |
| **Saturation** | Colour intensity in the areas of this line: 1 = unchanged, 1.3 = 30 % stronger, 0.8 = softer. Luminance does not change. |
| **Line map** | Opens the maps used: red = where SII is stronger than usual, green = Ha, blue = OIII, black = nothing will move. |

**Fine sliders.** Under each main slider, a second slider marked *fine ±* zooms around the current
value for precise adjustment: ±15° for targets and palette hues, ±0.3 for strength, ±10° for
tolerance, ±0.2 for saturation. It re-centres when you release the mouse. Values can also be typed
in the boxes.

Advanced settings (line smoothing, map smoothing, colour smoothing, signal threshold, sky
backgrounds, SII/OIII weights) are computed automatically and rarely need changing. Every control
has a tooltip.

### Pass 3, palette

| Setting | Meaning |
|---|---|
| **Preset** | *None* (pass 3 off, the default), a preset palette, or *Custom*. Editing a hue switches to Custom. |
| **SII, Ha, OIII** | Palette hue for the colour family of each line, in degrees, with a colour swatch. |
| **Saturation** | Saturation of the palette in the signal areas: below 1 softer, above 1 stronger. |
| **Intensity** | 1 = families moved onto the palette hues, 0.5 = halfway, 0 = no effect. |

| Preset | SII | Ha | OIII | Saturation |
|---|---|---|---|---|
| SII red, Ha gold, OIII blue | 5° | 45° | 225° | 1 |
| Ha red, SII gold, OIII blue | 45° | 0° | 225° | 1 |
| True colours (wavelengths) | 355° | 355° | 160° | 1 |
| Natural red / teal | 345° | 355° | 185° | 0.85 |
| Mineral (soft) | 20° | 38° | 205° | 0.55 |

*True colours* are computed from the emission wavelengths (CIE 1931 colour matching functions,
converted to sRGB): SII 672.4 nm and Ha 656.3 nm both give a red at about 355°, OIII 500.7 nm a
green-teal at about 160°. Since SII and Ha then share the same red, this preset gives up the SII/Ha
separation on purpose: it shows what the eye would see, not where each element glows.

How pass 3 works: the colour of each family after pass 2 is measured (circular mean, weighted by
signal), then the whole family is rotated so that its centre lands on the palette hue. Half of the
colour variations inside a family are kept, so the image does not turn flat. A pixel belongs to a
family according to the line proportions; for a merged pair, the pair's share is split between its
two lines with the same line maps as pass 2. Pixels whose colour is far from their family's colour
(more than 120°) are moved progressively less, so no isolated pixel can jump to the opposite colour.
Nothing moves in the sky background.

Limits: pass 3 can only recolour what pass 2 has separated. With *Ha red, SII gold*, the swap is
clear where one line strongly dominates; in mixed areas the result stays close to orange.

### Tips from the author's tests

* Ha targets above about 50° drift toward yellow-green on screen. Around 40 to 48° gives gold cores.
* SII around 5° gives clearly red filaments next to the gold Ha.
* The script never moves a pixel past its target, so the target is the limit to set, not the
  strength.
* Stars are not handled. For star colours derived from the narrowband data, see
  [PSCM (Planck Star Color Mapping)](https://github.com/drraupach/PSCM) by Dr. Rainer Raupach,
  applied to the star image before recombining.

## How it works, in short

Colours are handled in the Rec. 709 YCbCr space. For each pixel, the chroma vector (Cb, Cr) is
rotated toward the target of each line, weighted by the line map, the strength and the closeness of
the current colour to that line's colour family. If the new colour falls outside the displayable
range, its saturation is reduced just enough so that no channel exceeds max(0.99, its original
value).

Luminance is Y = 0.2126 R + 0.7152 G + 0.0722 B (Rec. 709 coefficients, fixed in the code) and is
kept exactly. PixInsight's own luminance uses the coefficients of the image's RGB working space
(0.222491, 0.716888, 0.060621 by default), so its measure can differ very slightly: on the author's
image, the CIE L* difference was 0.08 on average, 0.6 at the 99th percentile and 3.5 at most.

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
