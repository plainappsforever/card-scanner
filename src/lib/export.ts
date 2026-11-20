// Exports (SPEC §7 screen 5, U5, D19): vCard 3.0 (UTF-8) or the documented CSV of CHECKED cards only (A11), written to
// the app's cache and handed to the system share sheet (Files, Mail, AirDrop, Drive …). Nothing leaves the phone unless
// the user picks a target there.
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import CardKit from '../../modules/card-kit';
import type { Card } from '@/db/cards';
import { localDate, writeCsv } from '@/engine/csv';
import { exportFileName } from '@/engine/format';
import { writeVCard, type NoteLabels } from '@/engine/vcard/writer';

import { exportsDir } from './app-files';

export type ExportFormat = 'vcf' | 'csv';
export type ExportedFile = { uri: string; mime: string; name: string };

export function exportContent(cards: readonly Card[], format: ExportFormat, includeNotes: boolean, noteLabels: NoteLabels): string {
  if (format === 'vcf') return writeVCard(cards.map((c) => c.contact), { includeNotes, noteLabels });
  return writeCsv(
    cards.map((c) => ({
      contact: includeNotes ? c.contact : { ...c.contact, notes: undefined, event: undefined, metOn: undefined, metWhere: undefined, tags: [] },
      addedOn: localDate(c.createdAt),
      ...(c.followUpAt && includeNotes ? { followUpOn: localDate(c.followUpAt) } : {}),
    }))
  );
}

export function writeExport(baseName: string, format: ExportFormat, content: string): ExportedFile {
  const name = exportFileName(baseName, format);
  const file = new File(exportsDir(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  return { uri: file.uri, mime: format === 'vcf' ? 'text/vcard' : 'text/csv', name };
}

/** The share sheet. Android needs content:// URIs (FileProvider) with a read grant. */
export async function shareFiles(files: readonly ExportedFile[], title: string): Promise<boolean> {
  const uris = files.map((f) => (Platform.OS === 'android' ? (new File(f.uri).contentUri ?? f.uri) : f.uri));
  return CardKit.shareFiles(uris, files.map((f) => f.mime), title);
}
