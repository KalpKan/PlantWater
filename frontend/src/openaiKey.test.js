import { STORAGE_KEY, HEADER_NAME, getOpenAiKey, setOpenAiKey, clearOpenAiKey, looksLikeOpenAiKey, openAiKeyHeaders, maskKey } from './openaiKey';

beforeEach(() => localStorage.clear());

describe('openaiKey (bring-your-own key, browser-only storage)', () => {
  test('no key saved: no header is sent', () => {
    expect(getOpenAiKey()).toBe('');
    expect(openAiKeyHeaders()).toEqual({});
  });

  test('a saved key is kept only in localStorage and sent as the X-OpenAI-Key header', () => {
    expect(setOpenAiKey('  sk-visitor-abcdefghijklmnop  ')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-visitor-abcdefghijklmnop');
    expect(getOpenAiKey()).toBe('sk-visitor-abcdefghijklmnop');
    expect(openAiKeyHeaders()).toEqual({ [HEADER_NAME]: 'sk-visitor-abcdefghijklmnop' });
    expect(HEADER_NAME).toBe('X-OpenAI-Key');
  });

  test('removing the key stops the header; logout-style localStorage.clear() also removes it', () => {
    setOpenAiKey('sk-visitor-abcdefghijklmnop');
    clearOpenAiKey();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(openAiKeyHeaders()).toEqual({});
    setOpenAiKey('sk-visitor-abcdefghijklmnop');
    localStorage.clear();
    expect(getOpenAiKey()).toBe('');
  });

  test('shape check and masking', () => {
    expect(looksLikeOpenAiKey('sk-proj-abcdefghijklmnop1234')).toBe(true);
    expect(looksLikeOpenAiKey('someone@example.com')).toBe(false);
    expect(looksLikeOpenAiKey('sk-short')).toBe(false);
    expect(maskKey('sk-visitor-abcdefghijklmnop')).toBe('…mnop');
    expect(maskKey('sk')).toBe('…');
  });
});
