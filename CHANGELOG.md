# Changelog

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
