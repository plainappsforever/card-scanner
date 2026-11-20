// The home signature (sheet 7, Wallet): the latest cards lie as a pile of business cards (85 by 55) with their front
// photos, each turned a fixed few degrees and shifted so the next one shows an edge. Cards still "To check" carry a
// folded corner at the top right. Tapping the pile reports the pile's ids (the list filters to them).
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Card } from '@/db/cards';
import { useT } from '@/hooks/use-t';
import { useTheme } from '@/hooks/use-theme';
import { uriOf } from '@/lib/app-files';

export const PILE_HEIGHT = 220;
export const PILE_SIZE = 12;
const RATIO = 85 / 55;
// fixed, never random: the pile looks the same on every visit
const TURNS = [-3, 2, -1.5, 3, -2, 1, -3, 1.5, -1, 2.5, -2.5, 0];

/** Where card i of n sits: it moves right and down in equal steps; the step shows about a third of the card under it when there is room. */
export function pileLayout(n: number, width: number, height: number) {
  const cardW = Math.min(width * 0.58, (height - 24) * RATIO);
  const cardH = cardW / RATIO;
  const free = n > 1 ? n - 1 : 1;
  const stepX = Math.min(cardW / 3, (width - cardW) / free);
  const stepY = Math.min(cardH / 3, (height - cardH) / free);
  const usedW = cardW + stepX * (n - 1);
  const usedH = cardH + stepY * (n - 1);
  const left = (width - usedW) / 2;
  const top = (height - usedH) / 2;
  return Array.from({ length: n }, (_, i) => ({ left: left + stepX * i, top: top + stepY * i, width: cardW, height: cardH, turn: TURNS[i % TURNS.length] }));
}

export function CardPile({ cards, total, draftTotal, onPress }: { cards: Card[]; total: number; draftTotal: number; onPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  const [width, setWidth] = useState(0);
  const shown = cards.slice(0, PILE_SIZE);
  // oldest first so that the newest card is drawn last, on top
  const ordered = [...shown].reverse();
  const places = width > 0 ? pileLayout(ordered.length, width, PILE_HEIGHT) : [];
  const caption = `${t('home.count', { n: total })} · ${t('home.pileToCheck', { n: draftTotal })}`;
  return (
    <Pressable testID="card-pile" accessibilityRole="button" accessibilityLabel={caption} onPress={onPress} style={styles.wrap}>
      <View style={styles.stage} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {ordered.map((c, i) => {
          const p = places[i];
          if (!p) return null;
          const front = c.sides.find((s) => s.side === 'front');
          return (
            <View
              key={c.id}
              style={[styles.card, { left: p.left, top: p.top, width: p.width, height: p.height, backgroundColor: theme.cardFace, transform: [{ rotate: `${p.turn}deg` }] }]}>
              {front ? <Image source={{ uri: uriOf(front.imageFile.replace(/\.jpg$/, '.thumb.jpg')) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              {c.status === 'draft' ? <View style={[styles.fold, { borderTopColor: theme.tint }]} /> : null}
            </View>
          );
        })}
      </View>
      <ThemedText testID="pile-caption" type="small" numeric style={styles.caption}>
        {caption}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  stage: { height: PILE_HEIGHT },
  card: { position: 'absolute', borderRadius: Radius.card, overflow: 'hidden', boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12)' },
  // the folded corner: a navy triangle at the top right
  fold: { position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 20, borderLeftWidth: 20, borderLeftColor: 'transparent' },
  caption: { textAlign: 'center', fontSize: 15 },
});
