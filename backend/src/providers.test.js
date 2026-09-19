const { careGuide, identify, redactSecret, classifyOpenAIError } = require("./providers");

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

describe('identify: Pl@ntNet "Species not found" is a not-a-plant answer, not an outage', () => {
  const guard = { tryAcquire: async () => ({ allowed: true, count: 1, limit: 50, day: '2026-09-19' }) };
  const httpError = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

  test('a 404 from Pl@ntNet returns notAPlant with no candidates and no demo fallback', async () => {
    const client = { post: async () => { throw httpError(404, { statusCode: 404, error: 'Not Found', message: 'Species not found' }); } };
    const res = await identify({ buffer: Buffer.alloc(20000, 3), guard, apiKey: 'k', log, client });
    expect(res).toMatchObject({ candidates: [], notAPlant: true, demo: false, reason: 'plantnet_species_not_found' });
  });

  test('an empty results array is also notAPlant', async () => {
    const client = { post: async () => ({ data: { results: [] } }) };
    const res = await identify({ buffer: Buffer.alloc(20000, 3), guard, apiKey: 'k', log, client });
    expect(res).toMatchObject({ candidates: [], notAPlant: true, demo: false });
  });

  test('a 5xx / network failure still falls back to the demo list (that is an outage)', async () => {
    const client = { post: async () => { throw httpError(503, { message: 'Service Unavailable' }); } };
    const res = await identify({ buffer: Buffer.alloc(20000, 3), guard, apiKey: 'k', log, client });
    expect(res).toMatchObject({ demo: true, reason: 'plantnet_error' });
    expect(res.candidates).toHaveLength(1);
  });

  test('a real answer flags lowConfidence when the top score is under 0.3 and keeps up to five candidates', async () => {
    const species = (name, score) => ({ score, species: { scientificNameWithoutAuthor: name, genus: { scientificNameWithoutAuthor: name.split(' ')[0] }, family: { scientificNameWithoutAuthor: 'Araceae' }, commonNames: [] } });
    const client = { post: async () => ({ data: { results: [species('Livistona chinensis', 0.104), species('Monstera deliciosa', 0.09), species('Philodendron pastazanum', 0.05), species('A b', 0.01), species('C d', 0.01), species('E f', 0.005)] } }) };
    const res = await identify({ buffer: Buffer.alloc(20000, 3), guard, apiKey: 'k', log, client });
    expect(res.demo).toBe(false);
    expect(res.lowConfidence).toBe(true);
    expect(res.candidates).toHaveLength(5);
    const sure = { post: async () => ({ data: { results: [species('Ficus lyrata', 0.86)] } }) };
    expect((await identify({ buffer: Buffer.alloc(20000, 3), guard, apiKey: 'k', log, client: sure })).lowConfidence).toBe(false);
  });
});

describe('visitor OpenAI key never reaches the log, even inside OpenAI\'s own masked error message', () => {
  test('OpenAI\'s 401 text carries the first 8 and last 4 key characters; neither is logged', async () => {
    const key = 'sk-invalidkeyabcdefghijklmnop';
    const logged = [];
    const spy = { warn() {}, error: (...a) => logged.push(a.join(' ')) };
    // Exactly what the OpenAI SDK puts in error.message for a bad key (seen in Vercel logs, TEST round 1, D5).
    const err = Object.assign(new Error('401 Incorrect API key provided: sk-inval*****************mnop. You can find your API key at https://platform.openai.com/account/api-keys.'), { status: 401 });
    const openai = jest.fn(async () => { throw err; });
    const res = await careGuide({ species: 'Ficus lyrata', visitorKey: key, log: spy, openai });
    expect(res.openaiError).toBe('invalid_key');
    expect(logged.length).toBe(1);
    expect(logged[0]).not.toContain('sk-inval');
    expect(logged[0]).not.toContain('mnop');
    expect(logged[0]).not.toContain('Incorrect API key');
    expect(logged[0]).toContain('invalid_key');
    expect(logged[0]).toContain('401');
  });

  test('redactSecret scrubs starred and short key fragments too', () => {
    expect(redactSecret('Incorrect API key provided: sk-inval*****************mnop. You can', 'sk-invalidkeyabcdefghijklmnop')).not.toMatch(/sk-inval|mnop/);
    expect(redactSecret('sk-proj-abc', '')).toBe('sk-[redacted]');
    expect(redactSecret('a desk-lamp is fine', '')).toBe('a desk-lamp is fine');
  });
});

describe('genericCare drought rule (D2)', () => {
  test('Zamioculcas and Dracaena trifasciata fall in the dry-out group even without a bundled entry', () => {
    const { genericCare } = require('./providers');
    for (const name of ['Zamioculcas zamiifolia', 'Dracaena trifasciata', 'Sansevieria cylindrica', 'Kalanchoe blossfeldiana']) {
      expect(genericCare(name).soilMoisture.wateringThreshold).toBeLessThanOrEqual(12);
      expect(genericCare(name).watering).toMatch(/completely dry/i);
    }
    expect(genericCare('Dracaena marginata').soilMoisture.wateringThreshold).toBe(20);
    expect(genericCare('Spathiphyllum blandum').soilMoisture.wateringThreshold).toBe(20);
  });
});
