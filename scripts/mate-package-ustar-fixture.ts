export interface UstarFixtureEntry {
  readonly name: string;
  readonly contents?: Uint8Array | string;
  readonly type?: "0" | "1" | "2" | "L";
  readonly linkName?: string;
}

function writeText(
  header: Buffer,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = Buffer.from(value);
  if (bytes.byteLength > length) {
    throw new Error(`Ustar fixture field is oversized: ${value}`);
  }
  bytes.copy(header, offset);
}

function writeOctal(
  header: Buffer,
  offset: number,
  length: number,
  value: number,
): void {
  writeText(
    header,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, "0")}\0`,
  );
}

function ustarEntry(entry: UstarFixtureEntry): Buffer {
  const contents =
    typeof entry.contents === "string"
      ? Buffer.from(entry.contents)
      : Buffer.from(entry.contents ?? []);
  const header = Buffer.alloc(512);
  writeText(header, 0, 100, entry.name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, contents.byteLength);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeText(header, 156, 1, entry.type ?? "0");
  writeText(header, 157, 100, entry.linkName ?? "");
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (contents.byteLength % 512)) % 512);
  return Buffer.concat([header, contents, padding]);
}

export function createCanonicalUstarFixture(
  entries: readonly UstarFixtureEntry[],
): Buffer {
  return Buffer.concat([...entries.map(ustarEntry), Buffer.alloc(1024)]);
}
