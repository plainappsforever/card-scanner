// QR code drawn with react-native-svg from qrcode-generator's module matrix (error correction M, UTF-8 bytes — the
// library's default byte conversion keeps only the low 8 bits of each UTF-16 unit, which breaks ä/é/CJK).
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { utf8Bytes } from '@/engine/vcard/text';

qrcode.stringToBytes = (s: string) => utf8Bytes(s);

export function QrCode({ text, size, testID }: { text: string; size: number; testID?: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, count: n + 8 };
  }, [text]);
  return (
    <Svg testID={testID} width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel="QR code">
      <Rect x={0} y={0} width={count} height={count} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
}
