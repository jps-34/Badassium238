# Changelog

## 1.2.0 (2026-10-11)
* **Rewritten on a single colour engine.** The pass 2 / pass 3 split is gone: per line, Target,
  Strength (0 to 1), Tolerance and Saturation, plus one global control, *Mixed areas* (0 = areas at
  the usual line ratio keep their colour, subtle split; 1 = they follow the targets, palette). Palette
  presets simply fill the targets. A pixel still never goes past its target.
* **Proposal acts on partly separated pairs too**, not only on merged ones; Ha is never pushed
  beyond 48° (gold). For such pairs the split follows the character maps (where one line is stronger
  than usual), as for merged pairs.
* **Undefined colours detected**: a line whose hue concentration is below 0.35 (white or grey core)
  is reported as undefined and left inactive instead of getting a meaningless target.
* One-line summary under the diagnosis table; signal level of each master and its sample format in
  the console; `(auto)` or `(manual)` after backgrounds and weights.
* A notice at the top of the dialog when settings restored from the last session are not the
  defaults; custom targets are kept only on the same images. Visible **Reset** button. The R, G, B
  order menu is now *Final image built as* in the advanced settings. New advanced settings: split
  contrast, family sharpness, tightening.
* **PixInsight 1.9.4 and later only (V8)** from this version. Version 1.1.0 stays available for
  PixInsight 1.8.9-3 to 1.9.3 through the same repository. New settings key: 1.0/1.1 settings are
  not carried over.
* Validated in simulation against 1.1.0: identical proposal on the author's Cassiopeia field
  (mean difference 0.0006), luminance unchanged, no clipping.

## 1.1.0 (2026-10-09)
* **English and French interface.** PixInsight is not localised, so the script follows the system
  language on first run (English otherwise); a *Langue / Language* menu switches at any time and
  reopens the dialog with the analysis and settings kept.
* **Fine sliders**: under each main slider, a zoom slider around the current value (targets and
  palette hues ±15°, strength ±0.3, tolerance ±10°, saturation ±0.2).
* **Pass 3, palette (cosmetic, optional)**: moves each separated colour family to the hue of a
  palette. Presets: SII red / Ha gold / OIII blue, Ha red / SII gold / OIII blue, true colours
  (from the emission wavelengths), natural red / teal, mineral (soft), or custom hues, with palette
  saturation and intensity. Off by default: with pass 3 off, results are identical to 1.0.3.
* Documentation: the linear masters are only used for detection (where lines overlap and which one
  dominates); luminance coefficients (Rec. 709) stated; PSCM suggested for star colours.

## 1.0.3 (2026-10-05)
* Renamed from TrichromieSHO to **Badassium238**. Settings saved under the old name are picked up
  automatically. Results are identical to 1.0.2.
* First public release, under the MIT License.

## 1.0.2 (2026-10-04)
* Touching the target or tolerance of an inactive line now sets its strength to 1 automatically.
* Proposed tolerance adapts to the spread of each line's current colour.
* Each line shows the share of the image it acts on.
* Version for PixInsight 1.9.3 and earlier (legacy JavaScript engine).

## 1.0.1 (2026-10-04)
* Proposition, Line map and Preview run the analysis first when needed.
* Clear error messages, status line, Refresh button.

## 1.0.0 (2026-10-04)
* First version: diagnosis of merged line pairs, proposal, live preview, full-resolution apply
  at constant luminance.
