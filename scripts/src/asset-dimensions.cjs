"use strict";

const fs = require("node:fs");
const probe = require("probe-image-size/sync");

const MAX_HEADER_BYTES = 512 * 1024;

function readImageHeader(filename) {
  // Metro's getAssetData uses paths; getAssetSize and zip assets use bytes.
  // Read headers only, and never block on a FIFO/device masquerading as an asset.
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile()) {
      throw new Error("Image asset must be a regular file");
    }
    if (info.size === 0) {
      throw new Error("Cannot determine dimensions of an empty image");
    }
    const bytes = Buffer.alloc(Math.min(info.size, MAX_HEADER_BYTES));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    return bytes.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}

const KTX1_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const KTX2_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JXL_CONTAINER_SIGNATURE = Buffer.from([
  0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
]);

function hasIdentifier(input, identifier) {
  return (
    input.length >= identifier.length &&
    input.subarray(0, identifier.length).equals(identifier)
  );
}

function validDimension(value) {
  return Number.isFinite(value) && value > 0;
}

function readKtx(input) {
  if (hasIdentifier(input, KTX1_IDENTIFIER)) {
    // A KTX 1 header consists of its 12-byte identifier and thirteen uint32s.
    if (input.length < 64) {
      throw new Error("Invalid KTX 1 image: truncated 64-byte header");
    }

    const marker = input.subarray(12, 16);
    let read;
    if (marker.equals(Buffer.from([1, 2, 3, 4]))) {
      read = (offset) => input.readUInt32LE(offset);
    } else if (marker.equals(Buffer.from([4, 3, 2, 1]))) {
      read = (offset) => input.readUInt32BE(offset);
    } else {
      throw new Error("Invalid KTX 1 image: invalid endianness marker");
    }

    const width = read(36);
    const height = read(40);
    if (!validDimension(width) || !validDimension(height)) {
      throw new Error("Invalid KTX 1 image dimensions");
    }
    return { width, height };
  }

  if (hasIdentifier(input, KTX2_IDENTIFIER)) {
    // KTX 2 has a fixed 80-byte header and all of its integers are little-endian.
    if (input.length < 80) {
      throw new Error("Invalid KTX 2 image: truncated 80-byte header");
    }
    const width = input.readUInt32LE(20);
    const height = input.readUInt32LE(24);
    if (!validDimension(width) || !validDimension(height)) {
      throw new Error("Invalid KTX 2 image dimensions");
    }
    return { width, height };
  }

  return null;
}

function rejectKnownUnsupported(input) {
  if (input.length >= 4 && input.subarray(0, 4).toString("ascii") === "icns") {
    throw new Error("Unsupported image format: ICNS");
  }
  if (
    hasIdentifier(input, JXL_CONTAINER_SIGNATURE) ||
    (input.length >= 2 && input[0] === 0xff && input[1] === 0x0a)
  ) {
    throw new Error("Unsupported image format: JPEG XL");
  }
}

module.exports = function assetDimensions(content) {
  if (typeof content === "string") {
    content = readImageHeader(content);
  }
  if (!Buffer.isBuffer(content) && !(content instanceof Uint8Array)) {
    throw new TypeError("Image content must be a filename, Buffer or Uint8Array");
  }

  const input = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  if (input.length === 0) {
    throw new Error("Cannot determine dimensions of an empty image");
  }

  rejectKnownUnsupported(input);
  const ktx = readKtx(input);
  if (ktx !== null) {
    return ktx;
  }

  let dimensions;
  try {
    dimensions = probe(input);
  } catch (error) {
    throw new Error(
      `Unable to determine valid image dimensions: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  if (
    dimensions === null ||
    typeof dimensions !== "object" ||
    !validDimension(dimensions.width) ||
    !validDimension(dimensions.height)
  ) {
    throw new Error("Unable to determine valid image dimensions");
  }

  return { width: dimensions.width, height: dimensions.height };
};