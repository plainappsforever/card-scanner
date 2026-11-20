import { fieldsFromExtracted, parseName } from '@/db/fields';
import { extractText } from '@/engine/extract/index';

import { addField, confirmedFields, needsCheck, setNamePart, setValue, lineAsField, withCoreFields } from './review-model';

const fields = fieldsFromExtracted(extractText('Anna Weber\nVertriebsleiterin\nACME GmbH\nTel. 030 1234567\nanna.weber@acme-de.example', { region: 'DE' }));

describe('review model (SPEC §7 screen 2, L26)', () => {
  it('an edit marks the field edited and recomputes its matcher key; reverting to the read value clears it', () => {
    const i = fields.findIndex((f) => f.kind === 'email');
    const edited = setValue(fields, i, 'Anna@acme-de.example');
    expect(edited[i]).toMatchObject({ value: 'Anna@acme-de.example', edited: true, normalized: 'anna@acme-de.example' });
    expect(setValue(edited, i, fields[i].raw as string)[i].edited).toBe(false);
  });

  it('confirming drops empty fields and stores edited values as the user\'s', () => {
    const core = withCoreFields([]);
    expect(core.map((f) => f.kind)).toEqual(['name', 'company', 'title', 'phone', 'email']);
    const typed = setNamePart(core, 0, 'family', 'Weber');
    const out = confirmedFields(typed);
    expect(out).toHaveLength(1);
    expect(parseName(out[0].value)).toMatchObject({ family: 'Weber', full: 'Weber' });
    expect(out[0].confidence).toBe('user');
  });

  it('a leftover line fills an empty field of that kind or adds one; nothing is lost', () => {
    const core = withCoreFields([]);
    const withCompany = lineAsField(core, 'company', 'Huber & Söhne KG', 'f3');
    expect(withCompany.filter((f) => f.kind === 'company')).toEqual([expect.objectContaining({ value: 'Huber & Söhne KG', sourceLines: ['f3'], confidence: 'user' })]);
    const withPhone = lineAsField(core, 'phone', '0171 2345678', 'f4', 'DE');
    expect(withPhone.find((f) => f.kind === 'phone')).toMatchObject({ label: 'mobile', normalized: '+491712345678' });
    expect(addField(core, 'url').at(-1)).toMatchObject({ kind: 'url', value: '' });
  });

  it('"Check" marks show only for unedited medium/low values', () => {
    expect(needsCheck({ ...fields[0], confidence: 'medium', edited: false })).toBe(true);
    expect(needsCheck({ ...fields[0], confidence: 'medium', edited: true })).toBe(false);
    expect(needsCheck({ ...fields[0], confidence: 'high', edited: false })).toBe(false);
  });
});
