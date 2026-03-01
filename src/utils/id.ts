/**
 * 実行環境に依存しないID生成ユーティリティ。
 * 非セキュアコンテキストで randomUUID が使えない場合もフォールバックする。
 */

const HEX_TABLE = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

export function createId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return (
    `${HEX_TABLE[bytes[0]]}${HEX_TABLE[bytes[1]]}${HEX_TABLE[bytes[2]]}${HEX_TABLE[bytes[3]]}` +
    `-${HEX_TABLE[bytes[4]]}${HEX_TABLE[bytes[5]]}` +
    `-${HEX_TABLE[bytes[6]]}${HEX_TABLE[bytes[7]]}` +
    `-${HEX_TABLE[bytes[8]]}${HEX_TABLE[bytes[9]]}` +
    `-${HEX_TABLE[bytes[10]]}${HEX_TABLE[bytes[11]]}${HEX_TABLE[bytes[12]]}${HEX_TABLE[bytes[13]]}${HEX_TABLE[bytes[14]]}${HEX_TABLE[bytes[15]]}`
  );
}
