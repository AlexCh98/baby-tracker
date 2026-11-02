// Capa de datos: Firebase (compartido entre móviles) o demo local (solo este dispositivo).
import { firebaseConfig } from './config.js';

export async function createStore() {
  if (firebaseConfig && firebaseConfig.apiKey) return createFirebaseStore(firebaseConfig);
  return createDemoStore();
}

async function createFirebaseStore(cfg) {
  const { initializeApp } = await import('./lib/firebase-app.js');
  const A = await import('./lib/firebase-auth.js');
  const F = await import('./lib/firebase-firestore.js');

  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch (e) {
    db = F.getFirestore(app);
  }

  const BABY = 'principal';
  const babyRef = F.doc(db, 'bebes', BABY);
  const stateRef = F.doc(db, 'bebes', BABY, 'estado', 'activo');
  const evCol = F.collection(db, 'bebes', BABY, 'eventos');
  const planCol = F.collection(db, 'bebes', BABY, 'planes');

  let pending = false;
  const syncCbs = new Set();
  const emitSync = () => syncCbs.forEach((cb) => cb({ pending, online: navigator.onLine }));
  window.addEventListener('online', emitSync);
  window.addEventListener('offline', emitSync);
  const docs = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    mode: 'firebase',
    onUser(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(u ? { email: (u.email || '').toLowerCase(), uid: u.uid } : null));
    },
    login: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    register: (e, p) => A.createUserWithEmailAndPassword(auth, e, p),
    reset: (e) => A.sendPasswordResetEmail(auth, e),
    logout: () => A.signOut(auth),

    watchBaby: (cb, err) => F.onSnapshot(babyRef, { includeMetadataChanges: true }, (s) => cb(s.exists() ? s.data() : null, s.metadata.fromCache), err),
    saveBaby: (d) => F.setDoc(babyRef, d, { merge: true }),

    watchState: (cb, err) => F.onSnapshot(stateRef, (s) => cb(s.exists() ? s.data() : {}), err),
    saveState: (p) => F.setDoc(stateRef, p, { merge: true }),

    watchEvents(since, cb, err) {
      const q = F.query(evCol, F.where('t', '>=', since), F.orderBy('t', 'desc'));
      return F.onSnapshot(q, { includeMetadataChanges: true }, (s) => {
        pending = s.metadata.hasPendingWrites;
        emitSync();
        cb(docs(s));
      }, err);
    },
    watchMeasures(cb, err) {
      const q = F.query(evCol, F.where('tipo', '==', 'medida'));
      return F.onSnapshot(q, (s) => cb(docs(s).sort((a, b) => a.t - b.t)), err);
    },
    addEvent(ev) {
      // Se devuelve el id al instante (también sin conexión); el guardado se sincroniza después.
      const ref = F.doc(evCol);
      F.setDoc(ref, { ...ev, creado: F.serverTimestamp() })
        .catch((e) => window.dispatchEvent(new CustomEvent('store-error', { detail: e })));
      return Promise.resolve({ id: ref.id });
    },
    updateEvent: (id, p) => F.updateDoc(F.doc(evCol, id), p),
    deleteEvent: (id) => F.deleteDoc(F.doc(evCol, id)),
    watchPlans: (cb, err) => F.onSnapshot(planCol, (s) => cb(docs(s)), err),
    savePlan(plan) {
      const { id, ...data } = plan;
      const ref = id ? F.doc(planCol, id) : F.doc(planCol);
      F.setDoc(ref, data).catch((e) => window.dispatchEvent(new CustomEvent('store-error', { detail: e })));
      return Promise.resolve({ id: ref.id });
    },
    deletePlan: (id) => F.deleteDoc(F.doc(planCol, id)),
    async allEvents() {
      return docs(await F.getDocs(F.query(evCol, F.orderBy('t', 'asc'))));
    },
    onSync(cb) { syncCbs.add(cb); cb({ pending, online: navigator.onLine }); },
  };
}

function createDemoStore() {
  const KEY = 'monitor-bebe-demo';
  const fresh = () => ({ baby: null, state: {}, events: [], plans: [] });
  const load = () => {
    try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return fresh(); }
  };
  let data = load();
  const subs = new Set();
  const notify = () => subs.forEach((f) => f());
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    notify();
  };
  window.addEventListener('storage', (e) => { if (e.key === KEY) { data = load(); notify(); } });
  const sub = (fn) => { subs.add(fn); fn(); return () => subs.delete(fn); };
  const copy = (x) => JSON.parse(JSON.stringify(x));

  return {
    mode: 'demo',
    onUser(cb) { cb({ email: 'demo' }); return () => {}; },
    login: async () => {}, register: async () => {}, reset: async () => {}, logout: async () => {},
    watchBaby: (cb) => sub(() => cb(data.baby ? copy(data.baby) : null, false)),
    saveBaby: async (d) => { data.baby = { ...(data.baby || {}), ...d }; save(); },
    watchState: (cb) => sub(() => cb(copy(data.state))),
    saveState: async (p) => { data.state = { ...data.state, ...p }; save(); },
    watchEvents: (since, cb) => sub(() => cb(copy(data.events.filter((e) => e.t >= since).sort((a, b) => b.t - a.t)))),
    watchMeasures: (cb) => sub(() => cb(copy(data.events.filter((e) => e.tipo === 'medida').sort((a, b) => a.t - b.t)))),
    addEvent: async (ev) => { const id = Math.random().toString(36).slice(2, 11); data.events.push({ id, ...ev }); save(); return { id }; },
    updateEvent: async (id, p) => { const e = data.events.find((x) => x.id === id); if (e) Object.assign(e, p); save(); },
    deleteEvent: async (id) => { data.events = data.events.filter((x) => x.id !== id); save(); },
    allEvents: async () => copy(data.events).sort((a, b) => a.t - b.t),
    watchPlans: (cb) => sub(() => cb(copy(data.plans || []))),
    savePlan: async (plan) => {
      data.plans = data.plans || [];
      const id = plan.id || Math.random().toString(36).slice(2, 11);
      data.plans = data.plans.filter((x) => x.id !== id).concat([{ ...plan, id }]);
      save(); return { id };
    },
    deletePlan: async (id) => { data.plans = (data.plans || []).filter((x) => x.id !== id); save(); },
    onSync(cb) { cb({ pending: false, online: true }); },
  };
}
