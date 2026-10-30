import "server-only";

function crc32(bytes: Buffer): number {
  let result = 0xFFFFFFFF;
  for (const byte of bytes) {
    result ^= byte;
    for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ ((result & 1) ? 0xEDB88320 : 0);
  }
  return (result ^ 0xFFFFFFFF) >>> 0;
}

/** Standards-compliant UTF-8 ZIP with STORE entries; no external dependency. */
export function zipMediaFiles(files: readonly Readonly<{ name: string; data: Uint8Array | string }>[]): Uint8Array {
  if (!files.length || files.length > 40) throw new Error("PRESS_KIT_ZIP_ENTRY_COUNT_INVALID");
  const chunks: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    if (!/^[A-Za-z0-9_.-]{1,140}$/.test(name)) throw new Error("PRESS_KIT_ZIP_FILENAME_INVALID");
    const filename = Buffer.from(name, "utf8");
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    if (bytes.length > 8_000_000) throw new Error("PRESS_KIT_ZIP_SIZE_LIMIT");
    const checksum = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(bytes.length, 20);
    record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    chunks.push(header, filename, bytes);
    central.push(record, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, cd, end]));
}
