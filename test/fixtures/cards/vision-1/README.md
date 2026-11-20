# O3 — real-OCR set "vision-1" (SPEC §13 O3, A6)

Made 2026-10-16 by the P6/P7 agent with `scripts/o3/` (see the header of `o3.mjs`):
- **Text and truth** from the blind sets B1–B3 (written by separate agents). Every non-paste fixture (219 of 226) is
  rendered as a card image: each line at its fixture box, documented OCR damage REVERSED to the printed string, stray
  icons drawn as real symbols (☎ ✉ ⌂), QR codes drawn from their payloads. 204 images (two-sided cards share images).
- **Style** per image from a hash of its name: 16 macOS fonts, 9 colour schemes (incl. light-on-dark, kraft), ±2°
  rotation, Gaussian-ish pixel noise 0–14, blur 0–1.4 px, ±5 % size jitter, 1600 × 1035 px (portrait 1035 × 1600),
  JPEG q 0.85 — as the app stores card images.
- **OCR** = macOS Vision `.accurate`, language correction on, the fixture's OCR languages mapped to Vision codes plus
  en-US (same request as card-kit `recognize`); QR = Vision `VNDetectBarcodesRequest`. `input` = the normalised result
  (`src/engine/ocr.ts`, unchanged). `truth`/`absent`/`accept`/`composed`/`traps` copied unchanged; `ocr_damage` removed
  (the damage is now Vision's own). Each fixture has an `o3` key: source fixture, image names, style, languages, Vision ms.
- Subfolders b1/b2/b3 keep the source ids (the adapter's judgement calls are keyed by id).
- Images and raw Vision JSON: `artifacts/o3/` (git-ignored, regenerable byte-for-byte from the scripts).

**What this set is and is not.** First real-OCR evidence for the extractor (Vision's real misreads, line splits,
reading order, confidence). NOT blind on content: B1–B3 were used for tuning (L27 rule 4), so the extractor has seen
these texts in their synthetic-damage form. Rendered cards are cleaner than photos (no perspective, glare, curvature,
paper texture, real printing). Mac Vision may differ from iOS Vision on a phone. Measured once on extractor snapshot
6f43064 (`docs/vision-1-first-run.txt`); any fix afterwards makes it a tuning set.
