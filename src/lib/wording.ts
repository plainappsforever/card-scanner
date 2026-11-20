// Honest-result wording (SPEC §2, L26): the UI never claims accuracy, never shows a percentage, never says "AI" and
// never promises a perfect or guaranteed result — in any of the 15 UI languages. Checked over every UI string by
// src/i18n/i18n.test.ts. Lower-case substring match unless the entry is a RegExp (short words need word boundaries).
export const BANNED: readonly (string | RegExp)[] = [
  // "AI" and its translations
  /(?<![\p{L}\p{N}])(AI|KI|IA|ИИ|YZ)(?![\p{L}\p{N}])/u,
  'artificial intelligence', 'künstliche intelligenz', 'inteligencia artificial', 'inteligência artificial', 'intelligence artificielle',
  'intelligenza artificiale', 'yapay zeka', 'искусственн', 'kecerdasan buatan', 'एआई', 'कृत्रिम बुद्धि', '人工知能', '人工智能', '인공지능',
  'trí tuệ nhân tạo', 'الذكاء الاصطناعي',
  // percentages (an accuracy figure belongs in the docs, never in the UI)
  '%', '٪', '％',
  // accuracy claims
  'accura', 'genauigkeit', 'präzis', 'exakt', 'precisión', 'precisão', 'précision', 'precisione', 'doğruluk', 'точност', 'akurasi', 'सटीक', '精度', '正確', '准确', '정확도', 'chính xác', 'دقة',
  // guarantees and perfection
  'guarantee', 'garant', 'гарант', 'jaminan', 'dijamin', 'गारंटी', '保証', '保证', '보장', 'đảm bảo', 'ضمان',
  'perfect', 'perfekt', 'perfeito', 'parfait', 'perfetto', 'mükemmel', 'идеальн', 'sempurna', '完璧', '完美', '완벽', 'hoàn hảo', 'مثالي',
];

/** The banned words/patterns contained in `text`. */
export function bannedIn(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED.filter((b) => (typeof b === 'string' ? lower.includes(b) : b.test(text))).map(String);
}
