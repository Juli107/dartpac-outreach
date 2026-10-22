/** Tamaño en píxeles de un PNG, JPEG o GIF leyendo solo su cabecera. */
export function imageSize(buf: Uint8Array): { type: string; width: number; height: number } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { type: "image/gif", width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = view.getUint16(i + 2);
      // SOF0–SOF15 salvo DHT (C4), JPG (C8) y DAC (CC) llevan el tamaño.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: "image/jpeg", height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}
