// Type in (SPEC §7 "+" menu): an empty draft opens in Review, where name, company, title, phone and e-mail are shown
// ready to type (D26: the template's "New item" screen, repurposed).
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createCard } from '@/db/cards';
import { getCurrentEvent } from '@/db/events';
import { useSQLiteContext } from '@/db/provider';
import { newCardId } from '@/lib/app-files';
import { localDay } from '@/lib/capture';

export default function TypeInScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const event = await getCurrentEvent(db);
      const id = await createCard(db, { id: newCardId(), source: 'manual', status: 'draft', eventId: event?.id ?? null, metOn: localDay(Date.now()) });
      router.replace({ pathname: '/review/[id]', params: { id } });
    })();
  }, [db, router]);
  return <ActivityIndicator testID="new-screen" style={{ marginTop: Spacing.six }} />;
}
