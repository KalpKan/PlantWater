// "Use your own OpenAI key" (optional). The key is kept ONLY in this browser's
// localStorage and sent once per identification request in the X-OpenAI-Key
// header so OpenAI can write a species-specific care guide on the visitor's
// own account. The server reads it for that one call and never stores, logs
// or configures it. Without a key the built-in care library answers.
// Logging out clears localStorage, so the key goes with it (shared computers).
export const STORAGE_KEY = 'plantit.openaiKey';
export const HEADER_NAME = 'X-OpenAI-Key';

function storage() {
  try { return window.localStorage; } catch (e) { return null; }
}

export function getOpenAiKey() {
  const s = storage();
  if (!s) return '';
  try { return String(s.getItem(STORAGE_KEY) || '').trim(); } catch (e) { return ''; }
}

export function setOpenAiKey(key) {
  const s = storage();
  const value = String(key || '').trim();
  if (!s) return false;
  try {
    if (value) s.setItem(STORAGE_KEY, value);
    else s.removeItem(STORAGE_KEY);
    return true;
  } catch (e) { return false; }
}

export function clearOpenAiKey() { return setOpenAiKey(''); }

/** Loose shape check so an obvious paste mistake (an email, a blank) is caught before it is saved. */
export function looksLikeOpenAiKey(key) {
  const k = String(key || '').trim();
  return /^sk-[A-Za-z0-9_-]{16,}$/.test(k) && k.length <= 512;
}

/** Headers to merge into an API request: the key header when one is saved, nothing otherwise. */
export function openAiKeyHeaders() {
  const key = getOpenAiKey();
  return key ? { [HEADER_NAME]: key } : {};
}

/** "…abcd" for the status line; never the whole key. */
export function maskKey(key) {
  const k = String(key || '');
  return k.length > 4 ? `…${k.slice(-4)}` : '…';
}
