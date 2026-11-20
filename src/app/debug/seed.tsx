// Dev seed route (development variant only): <scheme>://debug/seed?set=<name>[&keep=1][&event=<name>][&count=<n>]
// count=<n> (P9, A15): n pasted text cards with one unique leftover word each, then the library search is timed.
// Starts from a clean library (every live card soft-deleted, current event cleared) unless keep=1, then runs the REAL
// capture pipeline (normalise → files → draft rows → OCR queue → extraction) on bundled O3 images, waits until every
// side is read, optionally confirms the cards, and opens Cards. Maestro waits for `seed-done`.
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { confirmCard, createCard, deleteCards, getCard, listCards, pendingOcrSides } from '@/db/cards';
import { createEvent, setCurrentEvent } from '@/db/events';
import { useSQLiteContext } from '@/db/provider';
import { fieldsFromExtracted } from '@/db/fields';
import { setSetting } from '@/db/settings';
import { extractText } from '@/engine/extract/index';
import { getLanguage } from '@/i18n';
import { SEED_IMAGES, SEED_SETS } from '@/dev/seed-assets';
import { newCardId } from '@/lib/app-files';
import { addCards, localDay } from '@/lib/capture';
import { kickOcr, phoneRegion } from '@/lib/ocr-queue';

const GIVEN = ['Anna', 'Jonas', 'Mia', 'Lukas', 'Lea', 'Felix', 'Emma', 'Paul', 'Sofia', 'Noah', 'Clara', 'Ben', 'Lina', 'Elias', 'Nora', 'Tom'];
const FAMILY = ['Weber', 'Schmidt', 'Fischer', 'Becker', 'Hoffmann', 'Koch', 'Richter', 'Wolf', 'Neumann', 'Braun', 'Krüger', 'Lange', 'Vogel', 'Roth', 'Berg', 'Frank', 'Haas', 'Busch', 'Kuhn', 'Otto', 'Seidel', 'Arnold', 'Ernst'];

export default function SeedScreen() {
  const params = useLocalSearchParams<{ set?: string; keep?: string; event?: string; region?: string; count?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [log, setLog] = useState<string[]>([]);
  const started = useRef(false);
  const dev = Constants.expoConfig?.extra?.appVariant === 'development';

  useEffect(() => {
    if (!dev || started.current) return;
    started.current = true;
    const say = (s: string) => {
      console.log(`[seed] ${s}`); // also in logcat / the simulator log (P9 measurements)
      setLog((l) => [...l, s]);
    };
    (async () => {
      const set = SEED_SETS[params.set ?? 'basic'];
      if (!set) return say(`unknown set ${params.set}`);
      if (params.keep !== '1') {
        const live = await listCards(db);
        await deleteCards(db, live.map((c) => c.id));
        await setCurrentEvent(db, null);
        say(`cleared ${live.length}`);
      }
      if (params.region) await setSetting(db, 'phone_region', params.region);
      let eventId: string | null = null;
      if (params.event) {
        eventId = await createEvent(db, params.event);
        await setCurrentEvent(db, eventId);
      }
      const count = Number(params.count ?? 0);
      if (count > 0) {
        // A15: pasted cards (the Paste screen's path: extractText → createCard, leftovers in the note), one unique
        // leftover word per card ("Lagerhalle Kai<n>x"), then the search timed as the Cards screen runs it (listCards).
        const region = await phoneRegion(db);
        const t1 = Date.now();
        for (let i = 0; i < count; i++) {
          const text = `${GIVEN[i % GIVEN.length]} ${FAMILY[(i * 7) % FAMILY.length]}\nSales Manager\n${FAMILY[(i * 3) % FAMILY.length]} Systems GmbH\n${GIVEN[i % GIVEN.length].toLowerCase()}.${i}@example-${i % 97}.de\n+49 30 ${String(100000 + i)}\nLagerhalle Kai${i}x`;
          const x = extractText(text, { region, uiLang: getLanguage() });
          const rest = x.leftovers.map((id) => x.lines.find((l) => l.id === id)?.text).filter(Boolean);
          await createCard(db, { id: newCardId(), source: 'paste', status: 'checked', eventId: null, metOn: localDay(Date.now()), notes: rest.length ? `Text on the card\n${rest.join('\n')}` : null, extractorVersion: x.version, fields: fieldsFromExtracted(x) });
          if (i % 250 === 249) say(`created ${i + 1} cards`);
        }
        say(`created ${count} text cards in ${Date.now() - t1} ms`);
        for (const word of [`Kai${Math.floor(count / 2)}x`, `Kai${count - 1}x`, 'Lagerhalle']) {
          const t2 = Date.now();
          const hits = await listCards(db, { query: word });
          say(`search "${word}": ${hits.length} hits in ${Date.now() - t2} ms`);
        }
      }
      const images = [];
      for (const name of set.images) {
        const asset = Asset.fromModule(SEED_IMAGES[name]);
        await asset.downloadAsync();
        const copy = new File(Paths.cache, `seed-${name}-${Date.now()}.jpg`);
        new File(asset.localUri as string).copySync(copy);
        images.push({ uri: copy.uri, cropped: true });
      }
      const t0 = Date.now();
      const ids = await addCards(db, images, { source: 'photo', twoSided: !!set.twoSided, eventId });
      kickOcr();
      while ((await pendingOcrSides(db, 1)).length && Date.now() - t0 < 120_000 + 4_000 * set.images.length) await new Promise((r) => setTimeout(r, 300));
      // the queue extracts right after the last side; give it a moment to write the fields
      for (let i = 0; i < 20; i++) {
        const cards = await Promise.all(ids.map((id) => getCard(db, id)));
        if (cards.every((c) => c && c.extractorVersion)) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (set.checked) for (const id of ids) await confirmCard(db, id);
      say(`seeded ${ids.length} cards in ${Date.now() - t0} ms`);
      setLog((l) => [...l, 'seed-done']); // Maestro waits for it, then taps seed-home
    })().catch((e) => say(`seed failed: ${e instanceof Error ? e.message : String(e)}`));
  }, [db, dev, params.set, params.keep, params.event, params.region, params.count, router]);

  if (!dev) return null;
  return (
    <ScrollView testID="seed-screen" contentContainerStyle={{ padding: 16, gap: 8 }}>
      {log.includes('seed-done') ? <Button testID="seed-home" label="Cards" onPress={() => router.replace('/')} /> : null}
      {log.map((l, i) => (
        <ThemedText key={i} testID={l === 'seed-done' ? 'seed-done' : undefined}>
          {l}
        </ThemedText>
      ))}
    </ScrollView>
  );
}
