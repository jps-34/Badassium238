# Badassium238

**A PixInsight script that gives each emission line its own colour in SHO images.**
SII red, Ha gold, OIII blue, instead of the usual orange and blue. Only the hue moves:
luminance, detail and noise are left exactly as they were. Palette presets can also recolour the
separated lines (true wavelength colours, red and teal, soft mineral tones, copper and teal...).

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

1. **Analysis.** Reads the three linear starless masters (SII, Ha, OIII) and measures, area by area,
   how much each line contributes and where one line is stronger than usual compared with its
   partner. It then checks which pairs of lines end up with the same hue in your final image (all
   three pairs are tested), measures the current colour of each line, and tells you when that colour
   is undefined (a white core, for instance).
2. **Proposal.** Suggests a target colour for each line: the current colour for lines that are fine,
   and a split for the pairs that are merged or only partly separated, for example SII toward red
   and Ha toward gold. Palette presets fill the targets differently.
3. **Colours.** For each line: target, strength, tolerance, saturation, with a live preview and fine
   sliders. One global control, *Mixed areas*, decides whether the areas where two lines are at their
   usual ratio keep their colour (subtle split) or follow the targets (palette).
4. **Apply.** Rotates the hue only, pixel by pixel, guided by smooth line maps. Luminance is kept
   exactly and a guard prevents any channel from clipping. With the proposal a pixel never goes past
   its target; with a palette each family is centred on its target and keeps half of its spread on
   both sides. The
   result is a new image `<id>_mix`; the original is never modified.

**The linear masters are only used for detection.** They tell the script where the lines overlap
and which one dominates. They are never modified, and their brightness does not end up in the
result: the colours are changed on the final stretched image only.

On the author's Cassiopeia field ([before](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=C), [after](https://app.astrobin.com/u/jpsc01?i=eb0nr1&r=F)): the SII/Ha hue difference went from about 8° (the same orange) to about 24°,
with a measured luminance change of 0 and no newly clipped pixel.

## Requirements

| File | PixInsight |
|---|---|
| `scripts/Badassium238.js` (1.2.2) | 1.9.4 and later (V8 JavaScript engine) |
| `scripts/legacy/Badassium238_PI193.js` (1.1.0, frozen) | 1.8.9-3 to 1.9.3 (legacy engine) |

PixInsight is retiring its legacy JavaScript engine (it is already absent on macOS Apple Silicon),
so from version 1.2 Badassium238 is developed for the V8 engine only. The 1.1.0 version stays
available for PixInsight 1.9.3 and earlier, through the same update repository.

Inputs, all pixel-aligned (no crop or rotation between them):

* the **three linear starless masters** SII, Ha and OIII (grayscale, not stretched, 32-bit float
  preferred), used only to locate each line;
* the **final stretched starless RGB image** whose colours you want to change.

## Language

The interface is available in **English and French**. PixInsight itself is not localised
([PixInsight FAQ](https://pixinsight.com/faq/): "We currently have no plans to publish localized
versions of PixInsight"), so the script cannot follow a PixInsight language setting. On first run it
uses the language of the system, and English otherwise. The **Langue / Language** menu at the top of
the dialog switches at any time: the dialog reopens at once, keeping the analysis and all settings,
and the choice is remembered.

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

1. **Images**: select the SII, Ha and OIII masters and the final image.
2. **Analyse**: reads the images, shows the diagnosis table and a one-line summary, and applies
   the proposal. The console gives the details.
3. **Colours**: adjust while watching the preview, tick **Before** to compare, or pick a palette in
   the *Preset* menu. *Families* shows which line each area belongs to.
4. **Apply**: creates `<id>_mix` at full resolution. The console reports the settings, the share of
   pixels changed, the maximum luminance difference and the number of newly clipped pixels.

Dragging the *New Instance* triangle to the workspace saves all settings in a process icon.
**Reset** puts every setting back to its default, keeping the images.

The script remembers its settings from one session to the next. When settings that are not the
defaults are restored (advanced settings, manual backgrounds or weights, custom targets), a notice
says so at the top of the dialog until you click *Reset*.

## Settings

### Colours

| Setting | Meaning |
|---|---|
| **Preset** | *Proposal* (default): targets on the current colours, split of the merged or partly separated pairs. The other presets fill the targets with a palette. *Custom*: your own targets (automatic as soon as you edit one). |
| **Mixed areas** | Areas where both lines of a pair are at their usual ratio. 0 = they keep their colour, only the areas where one line is stronger than usual move toward its target (subtle split, as in the proposal). 1 = they take the colour halfway between the two targets (the whole pair is recoloured, as with a palette). |

### Per line

| Setting | Meaning |
|---|---|
| **Target** | Target hue in degrees: 0 red, 30 orange, 50 gold, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta. The swatch shows the colour. Leaving it on the current colour changes nothing. |
| **Strength** | 0 = line inactive, 1 = the areas of this line go all the way to the target, in between = part of the way. With the proposal a pixel never goes past its target; with a palette the family spreads on both sides of the target. |
| **Tolerance** | Which current colours are allowed to move, in degrees around the line's current colour (180 = no limit, used by the palettes). This is what protects areas of another colour (e.g. a blue OIII nebula while you work on SII and Ha). |
| **Saturation** | Colour intensity in the areas of this line: 1 = unchanged, 1.3 = 30 % stronger, 0.8 = softer. Luminance does not change. |

Under each slider, a *fine ±* slider zooms around the current value for precise adjustment
(±15° for targets, ±0.1 for strength, ±10° for tolerance, ±0.2 for saturation).

A line whose current colour cannot be measured (hue concentration below 0.35, typically a white
or grey core) is reported as *undefined* and left inactive by the proposal and the presets.

### Presets

| Preset | SII | Ha | OIII | Saturation |
|---|---|---|---|---|
| SII red, Ha gold, OIII blue | 5° | 45° | 225° | 1 |
| Ha red, SII gold, OIII blue | 45° | 0° | 225° | 1 |
| True colours (wavelengths) | 355° | 355° | 160° | 1 |
| Natural red / teal | 345° | 355° | 185° | 0.85 |
| Mineral (soft) | 20° | 38° | 205° | 0.55 |
| Copper and teal | 12° | 32° | 185° | 0.85 |

*True colours* are computed from the emission wavelengths (CIE 1931 colour matching functions,
converted to sRGB): SII 672.4 nm and Ha 656.3 nm both give a red at about 355°, OIII 500.7 nm a
green-teal at about 160°. Since SII and Ha then share the same red, this preset gives up the SII/Ha
separation on purpose: it shows what the eye would see, not where each element glows.

### Advanced settings

*Final image built as* (SHO by default: which line is in red, green and blue; used by the proposal
for the direction of a split), *proposed split* (25° on either side of the common colour; Ha is not
pushed beyond 48°, which turns yellow-green on screen), *split contrast*, *family sharpness*,
*tightening* (reduces the hue variations inside a family, mostly useful with a palette on a wide
family), smoothing, signal threshold, sky backgrounds and SII/OIII weights. All are computed
automatically or have validated defaults; the console says `(auto)` or `(manual)` after the
backgrounds and weights.

### Tips from the author's tests

* Ha targets above about 50° drift toward yellow-green on screen. Around 40 to 48° gives gold cores.
* SII around 5° gives clearly red filaments next to the gold Ha.
* With the proposal, the script never moves a pixel past its target, so the target is the limit to
  set, not the strength. With a palette, the family is centred on the target and keeps half of its
  spread on both sides (tightening 0.5).
* Stars are not handled. For star colours derived from the narrowband data, see
  [PSCM (Planck Star Color Mapping)](https://github.com/drraupach/PSCM) by Dr. Rainer Raupach,
  applied to the star image before recombining.

## How it works, in short

Each pixel belongs to the three colour families (one per line) according to the levelled line
proportions; a merged or partly separated pair is shared between its two lines where one is
stronger than usual (character maps). Colours are handled in the Rec. 709 YCbCr space: the chroma
vector (Cb, Cr) of each family is rotated from its measured centre toward its target, weighted by
the family membership, the strength, the signal and the closeness of the smoothed colour to the
family's colour (tolerance). If the new colour falls outside the displayable range, its saturation
is reduced just enough so that no channel exceeds max(0.99, its original value).

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

*Code written by Claude (Anthropic), under
the direction of Jacques Pouyaud, who defined the need, tested it on his own data and validated
the results.*
