// jest stand-in for "firebase/auth" (package.json "jest.moduleNameMapper"): the real Node build
// drags in undici, which jsdom cannot load, and no unit test signs anybody in.
module.exports = {
  initializeAuth: () => ({ currentUser: null }),
  getAuth: () => ({ currentUser: null }),
  indexedDBLocalPersistence: {},
  browserLocalPersistence: {},
  browserPopupRedirectResolver: {},
  onAuthStateChanged: (auth, cb) => { cb(null); return () => {}; },
  signInWithPopup: async () => { throw new Error('not in tests'); },
  signOut: async () => {},
  GoogleAuthProvider: function GoogleAuthProvider() { this.setCustomParameters = () => {}; },
};
