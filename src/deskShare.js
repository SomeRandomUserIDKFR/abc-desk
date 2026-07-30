/**
 * Share ABC via URL hash: #d=<base64url(utf8)>
 */

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @param {string} abc
 * @returns {string} full URL
 */
export function buildShareUrl(abc) {
  const bytes = new TextEncoder().encode(abc);
  const encoded = bytesToBase64Url(bytes);
  const url = new URL(window.location.href);
  url.hash = `d=${encoded}`;
  return url.toString();
}

/**
 * @returns {string | null}
 */
export function readShareFromLocation() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  // Support #d=... and legacy #abc=...
  let payload = null;
  if (hash.startsWith("d=")) payload = hash.slice(2);
  else if (hash.startsWith("abc=")) {
    try {
      return decodeURIComponent(hash.slice(4));
    } catch {
      return null;
    }
  } else return null;

  try {
    const bytes = base64UrlToBytes(payload);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export async function copyShareUrl(abc) {
  const url = buildShareUrl(abc);
  await navigator.clipboard.writeText(url);
  return url;
}
