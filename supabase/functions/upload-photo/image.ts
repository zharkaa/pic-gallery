// Server-side image inspection for the `upload-photo` Edge Function.
//
// The browser already re-encodes images (which drops EXIF), but the client is
// not trusted: the upload could come from a modified app, curl, or a stolen
// session. This module reads the container headers only, so it is cheap and
// cannot be fooled by a spoofed Content-Type. It:
//
//   * confirms the real format from the magic bytes,
//   * reads the pixel dimensions (used to reject decompression bombs),
//   * reports whether privacy-sensitive metadata (EXIF/XMP/IPTC/comments) is
//     still present, so the caller can reject the file instead of publishing
//     GPS coordinates and device serial numbers.

export type ImageFormat = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: "jpg" | "png" | "webp" | "gif";
};

export type InspectedImage = ImageFormat & {
  width: number;
  height: number;
};

export type ImageErrorCode =
  | "unsupported_type"
  | "invalid_image"
  | "metadata_not_allowed";

export class ImageValidationError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

function invalid(message = "The image file is malformed."): never {
  throw new ImageValidationError("invalid_image", message);
}

function ensure(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) invalid();
}

function u16be(bytes: Uint8Array, offset: number) {
  ensure(bytes, offset, 2);
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number) {
  ensure(bytes, offset, 4);
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function u16le(bytes: Uint8Array, offset: number) {
  ensure(bytes, offset, 2);
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number) {
  ensure(bytes, offset, 3);
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32le(bytes: Uint8Array, offset: number) {
  ensure(bytes, offset, 4);
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  ensure(bytes, offset, length);
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index]);
  }
  return text;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function inspectJpeg(bytes: Uint8Array): InspectedImage {
  let offset = 2;
  let width = 0;
  let height = 0;
  let hasMetadata = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) invalid();

    ensure(bytes, offset, 2);
    offset += 1;
    let marker = bytes[offset];
    // A marker can be preceded by any number of 0xFF fill bytes.
    while (marker === 0xff) {
      offset += 1;
      ensure(bytes, offset, 1);
      marker = bytes[offset];
    }
    offset += 1;

    // Standalone markers carry no payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8) continue;
    if (marker === 0xd9) break;
    if (marker === 0xda) break; // start of scan: headers are done

    const length = u16be(bytes, offset);
    if (length < 2) invalid();
    ensure(bytes, offset, length);

    // APP1 = Exif/XMP, APP13 = IPTC/Photoshop, COM = free-text comment.
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) hasMetadata = true;

    if (JPEG_START_OF_FRAME.has(marker) && width === 0) {
      if (length < 7) invalid();
      height = u16be(bytes, offset + 3);
      width = u16be(bytes, offset + 5);
    }

    offset += length;
  }

  return finish({ mime: "image/jpeg", extension: "jpg" }, width, height, hasMetadata);
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function inspectPng(bytes: Uint8Array): InspectedImage {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) invalid();

  let offset = 8;
  let width = 0;
  let height = 0;
  let hasMetadata = false;
  let sawHeader = false;

  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (offset + 12 + length > bytes.length) invalid();

    if (type === "IHDR") {
      if (length < 8) invalid();
      width = u32be(bytes, offset + 8);
      height = u32be(bytes, offset + 12);
      sawHeader = true;
    } else if (PNG_METADATA_CHUNKS.has(type)) {
      hasMetadata = true;
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (!sawHeader) invalid();
  return finish({ mime: "image/png", extension: "png" }, width, height, hasMetadata);
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

function inspectWebp(bytes: Uint8Array): InspectedImage {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") invalid();

  let offset = 12;
  let width = 0;
  let height = 0;
  let hasMetadata = false;

  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const dataStart = offset + 8;
    if (dataStart + size > bytes.length) invalid();

    if (fourcc === "VP8X" && size >= 10) {
      width = 1 + u24le(bytes, dataStart + 4);
      height = 1 + u24le(bytes, dataStart + 7);
    } else if (fourcc === "VP8 " && size >= 10) {
      if (bytes[dataStart + 3] === 0x9d && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2a) {
        width = u16le(bytes, dataStart + 6) & 0x3fff;
        height = u16le(bytes, dataStart + 8) & 0x3fff;
      }
    } else if (fourcc === "VP8L" && size >= 5 && bytes[dataStart] === 0x2f) {
      const bits = u32le(bytes, dataStart + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (fourcc === "EXIF" || fourcc === "XMP ") {
      hasMetadata = true;
    }

    // RIFF chunks are padded to an even number of bytes.
    offset = dataStart + size + (size & 1);
  }

  return finish({ mime: "image/webp", extension: "webp" }, width, height, hasMetadata);
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

function skipGifSubBlocks(bytes: Uint8Array, offset: number) {
  let cursor = offset;

  while (true) {
    ensure(bytes, cursor, 1);
    const size = bytes[cursor];
    cursor += 1;
    if (size === 0) return cursor;
    ensure(bytes, cursor, size);
    cursor += size;
  }
}

function inspectGif(bytes: Uint8Array): InspectedImage {
  const header = ascii(bytes, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") invalid();

  ensure(bytes, 6, 7);
  const width = u16le(bytes, 6);
  const height = u16le(bytes, 8);
  const packed = bytes[10];

  let offset = 13;
  if (packed & 0x80) {
    offset += 3 * 2 ** ((packed & 0x07) + 1);
  }

  let hasMetadata = false;

  while (offset < bytes.length) {
    const block = bytes[offset];

    if (block === 0x3b) break; // trailer

    if (block === 0x2c) {
      // Image descriptor: 1 byte block + 9 bytes descriptor.
      ensure(bytes, offset, 10);
      const flags = bytes[offset + 9];
      offset += 10;
      if (flags & 0x80) offset += 3 * 2 ** ((flags & 0x07) + 1);
      ensure(bytes, offset, 1);
      offset += 1; // LZW minimum code size
      offset = skipGifSubBlocks(bytes, offset);
      continue;
    }

    if (block === 0x21) {
      ensure(bytes, offset, 2);
      const label = bytes[offset + 1];
      offset += 2;

      // 0xFE = comment; 0xFF = application extension (XMP lives here).
      if (label === 0xfe) hasMetadata = true;

      if (label === 0xff) {
        ensure(bytes, offset, 1);
        const identifierSize = bytes[offset];
        if (identifierSize === 11) {
          const identifier = ascii(bytes, offset + 1, 11);
          if (identifier.startsWith("XMP Data")) hasMetadata = true;
        }
      }

      offset = skipGifSubBlocks(bytes, offset);
      continue;
    }

    invalid();
  }

  return finish({ mime: "image/gif", extension: "gif" }, width, height, hasMetadata);
}

// ---------------------------------------------------------------------------

function finish(format: ImageFormat, width: number, height: number, hasMetadata: boolean): InspectedImage {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    invalid();
  }

  if (hasMetadata) {
    throw new ImageValidationError(
      "metadata_not_allowed",
      "The image still contains EXIF/XMP metadata. Re-save it and try again.",
    );
  }

  return { ...format, width, height };
}

/** Inspect an image buffer, throwing `ImageValidationError` when it is not an accepted, metadata-free image. */
export function inspectImage(bytes: Uint8Array): InspectedImage {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return inspectJpeg(bytes);
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return inspectPng(bytes);
  }

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return inspectWebp(bytes);
  }

  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return inspectGif(bytes);
  }

  throw new ImageValidationError(
    "unsupported_type",
    "Only JPEG, PNG, WebP, and GIF images are supported.",
  );
}
