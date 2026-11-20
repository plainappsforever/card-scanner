// UTF-8 helpers without TextEncoder/TextDecoder (not guaranteed on every Hermes build). Pure.

export function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

export function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Decodes UTF-8 bytes; invalid sequences become U+FFFD. */
export function decodeUtf8(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp = 0xfffd;
    let len = 1;
    if (b < 0x80) cp = b;
    else if (b >= 0xc2 && b < 0xe0) len = 2;
    else if (b >= 0xe0 && b < 0xf0) len = 3;
    else if (b >= 0xf0 && b < 0xf5) len = 4;
    if (len > 1) {
      const cont = bytes.slice(i + 1, i + len);
      if (cont.length === len - 1 && cont.every((c) => (c & 0xc0) === 0x80)) {
        cp = (b & (0xff >> (len + 1))) as number;
        for (const c of cont) cp = (cp << 6) | (c & 63);
      } else {
        cp = 0xfffd;
        len = 1;
      }
    }
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

export function decodeLatin1(bytes: readonly number[]): string {
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64Bytes(s: string): number[] {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const c of clean) {
    buf = (buf << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return out;
}
