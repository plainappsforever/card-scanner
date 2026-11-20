// The extractor's input for a stored card (SPEC §5.0/§5.1): normalised OCR lines of front ("f…") and back ("b…") and
// the decoded codes of both sides. Pure; used by the OCR queue (first extraction) and Review (leftovers, source lines).
import type { Card } from '@/db/cards';
import type { CardOcr } from '@/engine/ocr';
import type { ExtractInput, Line, ParsedCode } from '@/engine/extract/types';

export function sideLines(json: string | null): Line[] {
  if (!json) return [];
  try {
    return (JSON.parse(json) as CardOcr).lines ?? [];
  } catch {
    return [];
  }
}

export function sideCodes(json: string | null): ParsedCode[] {
  if (!json) return [];
  try {
    return (JSON.parse(json) as { format: string; text: string }[]).filter((c) => c.text).map((c) => ({ format: c.format, text: c.text }));
  } catch {
    return [];
  }
}

export function cardInput(card: Card, region: string | undefined, uiLang: string): ExtractInput {
  const front = card.sides.find((s) => s.side === 'front');
  const back = card.sides.find((s) => s.side === 'back');
  const qr = [...sideCodes(front?.qrJson ?? null), ...sideCodes(back?.qrJson ?? null)];
  const input: ExtractInput = { front: sideLines(front?.ocrJson ?? null), region, uiLang };
  if (back) input.back = sideLines(back.ocrJson);
  if (qr.length) input.qr = qr;
  return input;
}
