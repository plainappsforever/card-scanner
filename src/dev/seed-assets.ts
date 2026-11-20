// Dev seed images (development variant only): real-OCR set O3 renders (test/fixtures/cards/vision-1, artifacts/o3),
// re-encoded at q 0.7. P9: keep them out of release bundles (Metro redirect) — V1_LOG L11.
export const SEED_IMAGES: Record<string, number> = {
  'b1-de-01': require('../../assets/dev-seed/b1-de-01.jpg'),
  'b1-us-01': require('../../assets/dev-seed/b1-us-01.jpg'),
  'b1-fr-01': require('../../assets/dev-seed/b1-fr-01.jpg'),
  'b1-de-11': require('../../assets/dev-seed/b1-de-11.jpg'),
  'b1-jp-01-front': require('../../assets/dev-seed/b1-jp-01-front.jpg'),
  'b1-jp-01-back': require('../../assets/dev-seed/b1-jp-01-back.jpg'),
  'b1-de-03': require('../../assets/dev-seed/b1-de-03.jpg'),
  'b1-it-01': require('../../assets/dev-seed/b1-it-01.jpg'),
  'b1-nl-01': require('../../assets/dev-seed/b1-nl-01.jpg'),
  'b1-es-01': require('../../assets/dev-seed/b1-es-01.jpg'),
  'b1-tr-01': require('../../assets/dev-seed/b1-tr-01.jpg'),
  'b1-uk-01': require('../../assets/dev-seed/b1-uk-01.jpg'),
};

/** Seed sets: image names in capture order, whether pages pair as front/back, and whether the cards end up checked. */
export const SEED_SETS: Record<string, { images: string[]; twoSided?: boolean; checked?: boolean }> = {
  empty: { images: [] },
  basic: { images: ['b1-de-01', 'b1-us-01', 'b1-fr-01'], checked: true },
  drafts: { images: ['b1-de-01', 'b1-us-01', 'b1-fr-01'] },
  batch: { images: ['b1-de-03', 'b1-it-01', 'b1-nl-01', 'b1-es-01', 'b1-tr-01', 'b1-uk-01'] },
  qr: { images: ['b1-de-11'] },
  twosided: { images: ['b1-jp-01-front', 'b1-jp-01-back'], twoSided: true },
  one: { images: ['b1-de-01'] },
  // A17 (P9): 50 cards through the real pipeline; the 12 images cycled.
  batch50: { images: Array.from({ length: 50 }, (_, i) => Object.keys(SEED_IMAGES)[i % 12]) },
};
