import type { Translator } from '@/i18n';
import type { NoteLabels } from '@/engine/vcard/writer';

/** Labels of the contact note (other name, event, met on, where met) in the UI language. */
export function noteLabels(t: Translator): NoteLabels {
  return { otherName: t('field.otherName'), event: t('card.event'), metOn: t('card.metOn'), metWhere: t('card.metWhere') };
}
