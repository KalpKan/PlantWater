/**
 * SpendGuard: a per-day counter in Firestore that caps how many times a paid
 * API (OpenAI, Pl@ntNet) may be called. One document per service per UTC day:
 *   spend/{service}_{YYYY-MM-DD}  ->  { service, day, count, limit, updatedAt }
 *
 * The increment runs inside a Firestore transaction so concurrent serverless
 * invocations cannot both see "49" and both spend. If Firestore cannot be
 * reached the guard FAILS CLOSED (allowed: false): the demo path still serves a
 * visitor, and nothing is ever spent without a counter behind it.
 */
const DEFAULT_DAILY_LIMIT = 50;

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

class SpendGuard {
  constructor({ db, service, limit, now }) {
    if (!db) throw new Error('SpendGuard needs a Firestore db');
    if (!service) throw new Error('SpendGuard needs a service name');
    this.db = db;
    this.service = service;
    this.limit = Number.isFinite(Number(limit)) && limit !== undefined && limit !== null && limit !== ''
      ? Math.max(0, Number(limit))
      : DEFAULT_DAILY_LIMIT;
    this.now = now || (() => new Date());
  }

  docRef(day) {
    return this.db.collection('spend').doc(`${this.service}_${day}`);
  }

  /** Reserve one call. Resolves { allowed, count, limit, day, error? }. */
  async tryAcquire() {
    const today = this.now();
    const day = utcDay(today);
    const ref = this.docRef(day);
    try {
      return await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const count = snap.exists && snap.data() && Number(snap.data().count) ? Number(snap.data().count) : 0;
        if (count >= this.limit) {
          return { allowed: false, count, limit: this.limit, day };
        }
        tx.set(ref, {
          service: this.service,
          day,
          count: count + 1,
          limit: this.limit,
          updatedAt: today.toISOString(),
        }, { merge: true });
        return { allowed: true, count: count + 1, limit: this.limit, day };
      });
    } catch (error) {
      return { allowed: false, count: null, limit: this.limit, day, error: String(error && error.message || error) };
    }
  }

  /** Read-only view for /api/health and the README's "how much was used today". */
  async status() {
    const day = utcDay(this.now());
    try {
      const snap = await this.docRef(day).get();
      const count = snap.exists && snap.data() ? Number(snap.data().count) || 0 : 0;
      return { service: this.service, day, count, limit: this.limit };
    } catch (error) {
      return { service: this.service, day, count: null, limit: this.limit, error: String(error && error.message || error) };
    }
  }
}

/**
 * Tiny in-memory stand-in for the subset of the Firestore API the guard uses
 * (collection().doc().get(), runTransaction with tx.get/tx.set). Used by the
 * tests and by local development without Firebase credentials.
 */
function createMemoryDb() {
  const docs = new Map();
  const makeDoc = (path) => ({
    path,
    async get() {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => (data === undefined ? undefined : { ...data }) };
    },
  });
  const db = {
    docs,
    collection: (name) => ({ doc: (id) => makeDoc(`${name}/${id}`) }),
    async runTransaction(fn) {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, opts) => {
          const prev = opts && opts.merge ? docs.get(ref.path) || {} : {};
          docs.set(ref.path, { ...prev, ...data });
        },
      };
      return fn(tx);
    },
  };
  return db;
}

module.exports = { SpendGuard, createMemoryDb, DEFAULT_DAILY_LIMIT, utcDay };
