const { SpendGuard, createMemoryDb } = require('./spendGuard');

function guardAt({ limit, now }) {
  const db = createMemoryDb();
  const clock = { now };
  const guard = new SpendGuard({ db, service: 'openai', limit, now: () => clock.now });
  return { guard, db, clock };
}

describe('SpendGuard (per-day counter in Firestore)', () => {
  test('allows calls up to the daily limit and denies the next one', async () => {
    const { guard } = guardAt({ limit: 3, now: new Date('2026-09-18T12:00:00Z') });
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await guard.tryAcquire());
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2].count).toBe(3);
    expect(results[3]).toMatchObject({ allowed: false, count: 3, limit: 3, day: '2026-09-18' });
  });

  test('a new UTC day starts a fresh counter', async () => {
    const { guard, clock } = guardAt({ limit: 1, now: new Date('2026-09-18T23:59:00Z') });
    expect((await guard.tryAcquire()).allowed).toBe(true);
    expect((await guard.tryAcquire()).allowed).toBe(false);
    clock.now = new Date('2026-09-19T00:01:00Z');
    const next = await guard.tryAcquire();
    expect(next).toMatchObject({ allowed: true, count: 1, day: '2026-09-19' });
  });

  test('default limit is 50 per day', async () => {
    const db = createMemoryDb();
    const guard = new SpendGuard({ db, service: 'plantnet' });
    expect(guard.limit).toBe(50);
    expect((await guard.status()).limit).toBe(50);
  });

  test('counts are kept per service in separate documents', async () => {
    const db = createMemoryDb();
    const now = () => new Date('2026-09-18T12:00:00Z');
    const a = new SpendGuard({ db, service: 'openai', limit: 1, now });
    const b = new SpendGuard({ db, service: 'plantnet', limit: 1, now });
    expect((await a.tryAcquire()).allowed).toBe(true);
    expect((await a.tryAcquire()).allowed).toBe(false);
    expect((await b.tryAcquire()).allowed).toBe(true);
    expect(db.docs.get('spend/openai_2026-09-18').count).toBe(1);
    expect(db.docs.get('spend/plantnet_2026-09-18').count).toBe(1);
  });

  test('fails closed when Firestore is unreachable (never spends without a counter)', async () => {
    const db = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error('UNAVAILABLE'); } };
    const guard = new SpendGuard({ db, service: 'openai', limit: 5 });
    const r = await guard.tryAcquire();
    expect(r.allowed).toBe(false);
    expect(r.error).toMatch(/UNAVAILABLE/);
  });

  test('a limit of 0 disables the paid path entirely', async () => {
    const { guard } = guardAt({ limit: 0, now: new Date('2026-09-18T12:00:00Z') });
    expect((await guard.tryAcquire()).allowed).toBe(false);
  });
});
