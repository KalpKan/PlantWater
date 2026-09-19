const { careGuide, redactSecret, classifyOpenAIError } = require('./providers');

const log = { warn() {}, error() {} };
const fakeCare = {
  watering: 'Water weekly.', light: 'Bright indirect.', temperature: '18-24 C (65-75 F).', humidity: '50 %.', soil: 'Loose mix.', fertilizer: 'Monthly.',
  soilMoisture: { minVWC: 15, maxVWC: 45, optimalVWC: 30, wateringThreshold: 20 },
};

describe('careGuide (bring-your-own OpenAI key)', () => {
  test('without a visitor key a bundled species answers from the library and anything else gets generic guidance', async () => {
    const openai = jest.fn();
    const bundled = await careGuide({ species: 'Monstera deliciosa', log, openai });
    expect(bundled.source).toBe('bundled');
    expect(bundled.care.watering).toMatch(/top 5 cm/);
    const generic = await careGuide({ species: 'Pilea peperomioides', log, openai });
    expect(generic).toMatchObject({ source: 'generic', reason: 'no_openai_key' });
    expect(generic.care.soilMoisture.wateringThreshold).toBe(20);
    expect(openai).not.toHaveBeenCalled();
  });

  test('with a visitor key OpenAI is asked on that key, for every species, with no server spend guard', async () => {
    const openai = jest.fn(async () => fakeCare);
    const res = await careGuide({ species: 'Monstera deliciosa', visitorKey: ' sk-visitor-abcdefghijklmnop ', log, openai });
    expect(openai).toHaveBeenCalledWith({ species: 'Monstera deliciosa', apiKey: 'sk-visitor-abcdefghijklmnop' });
    expect(res).toEqual({ care: fakeCare, source: 'openai', keySource: 'visitor' });
  });

  test('a rejected visitor key falls back to the built-in guide, says why, and never leaks the key into the log', async () => {
    const key = 'sk-visitor-badkey-0123456789';
    const logged = [];
    const spy = { warn() {}, error: (...a) => logged.push(a.join(' ')) };
    const err = Object.assign(new Error(`401 Incorrect API key provided: ${key}`), { status: 401 });
    const openai = jest.fn(async () => { throw err; });
    const res = await careGuide({ species: 'Ficus lyrata', visitorKey: key, log: spy, openai });
    expect(res).toMatchObject({ source: 'bundled', reason: 'openai_error', openaiError: 'invalid_key', keySource: 'visitor' });
    expect(res.care.watering).toMatch(/top 5 cm/);
    expect(logged.length).toBe(1);
    expect(logged[0]).not.toContain(key);
    expect(logged[0]).toContain('invalid_key');

    const unknown = await careGuide({ species: 'Pilea peperomioides', visitorKey: key, log: spy, openai });
    expect(unknown).toMatchObject({ source: 'generic', reason: 'openai_error' });
  });

  test('redactSecret and classifyOpenAIError', () => {
    expect(redactSecret('key sk-abcdefghij1234 failed', 'sk-abcdefghij1234')).toBe('key [redacted] failed');
    expect(redactSecret('other sk-zzzzzzzzzz key', 'nope')).toBe('other sk-[redacted] key');
    expect(classifyOpenAIError({ status: 429 })).toBe('rate_limited_or_no_credit');
    expect(classifyOpenAIError({ message: 'Request timed out' })).toBe('timeout');
    expect(classifyOpenAIError(new Error('boom'))).toBe('error');
  });
});
