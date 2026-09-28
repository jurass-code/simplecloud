"use strict";

// Small extension -> MIME map for inline preview. Deliberately conservative:
// only media we are willing to serve with `Content-Disposition: inline` from
// the app origin is listed. Everything else falls back to an attachment +
// application/octet-stream, which keeps stored HTML/SVG from becoming
// same-origin stored XSS through /api/files/raw.
const MIME_BY_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  txt: "text/plain",
  log: "text/plain",
  md: "text/plain",
  csv: "text/plain",
  json: "text/plain",
};

// MIME types safe to render inline (no script execution in the app origin).
const INLINE_SAFE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/opus",
  "audio/aac",
  "audio/flac",
  "text/plain",
]);

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
};

function extensionOf(filename) {
  const name = String(filename || "");
  const dot = name.lastIndexOf(".");
  if (dot < 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

function mimeFor(filename) {
  return MIME_BY_EXT[extensionOf(filename)] || null;
}

function isInlineSafe(mime) {
  return !!mime && INLINE_SAFE.has(mime);
}

function isPreviewable(filename) {
  return isInlineSafe(mimeFor(filename));
}

module.exports = {
  mimeFor,
  isInlineSafe,
  isPreviewable,
  extensionOf,
  EXT_BY_MIME,
};
