import { createStore } from './store.js';
import { WHO } from './who.js';
import { PERSONAS, planSlots, planStatus, describePlan, planIcs, parseHoras } from './meds.js';
import { createVoice, voiceSupported, parseCommand, findNumber, norm } from './voice.js';

// ---------------------------------------------------------------- utilidades
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const nf = (n, d = 0) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtTime = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
};
const fmtDur = (ms) => {
  const m = Math.round(Math.max(0, ms) / MIN);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};
const fmtAgo = (t) => {
  const d = Date.now() - t;
  if (d < MIN) return 'ahora mismo';
  return 'hace ' + fmtDur(d).replace(' min', '′').replace(' h ', ' h ');
};
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dayLabel = (t) => {
  const d0 = dayStart(Date.now()), d = dayStart(t);
  if (d === d0) return 'Hoy';
  if (d === d0 - DAY || (d0 - d > 20 * HOUR && d0 - d < 26 * HOUR)) return 'Ayer';
  const x = new Date(t);
  return `${DIAS[x.getDay()]} ${x.getDate()} ${MESES[x.getMonth()]}`;
};
const shortDay = (t) => { const x = new Date(t); return `${DIAS[x.getDay()].slice(0, 3)} ${x.getDate()}`; };
const toLocalInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v).getTime() : NaN);
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
const pl = (n, a, b) => `${n} ${Number(String(n).replace(',', '.')) === 1 ? a : b}`;
const vibrate = () => { try { navigator.vibrate && navigator.vibrate(12); } catch {} };

function babyAge(nac) {
  if (!nac) return '';
  const d = Date.now() - nac;
  if (d < 0) return '';
  if (d < DAY) return `${Math.floor(d / HOUR)} h de vida`;
  const days = Math.floor(d / DAY);
  if (days < 14) return `${days} ${days === 1 ? 'día' : 'días'}`;
  if (days < 60) { const w = Math.floor(days / 7), r = days % 7; return `${w} semanas${r ? ` y ${r} d` : ''}`; }
  const a = new Date(nac), n = new Date();
  let months = (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth();
  if (n.getDate() < a.getDate()) months--;
  const ref = new Date(a); ref.setMonth(a.getMonth() + months);
  const rd = Math.floor((n - ref) / DAY);
  return `${months} ${months === 1 ? 'mes' : 'meses'}${rd ? ` y ${rd} d` : ''}`;
}

// ---------------------------------------------------------------- tipos
const T = {
  pecho: { icon: '🤱', label: 'Pecho', c: 'var(--c-pecho)', g: 'tomas' },
  biberon: { icon: '🍼', label: 'Biberón', c: 'var(--c-biberon)', g: 'tomas' },
  extraccion: { icon: '🥛', label: 'Extracción', c: 'var(--c-extraccion)', g: 'tomas' },
  regurgitacion: { icon: '💦', label: 'Regurgitación', c: 'var(--c-regurg)', g: 'tomas' },
  panal: { icon: '🧷', label: 'Pañal', c: 'var(--c-panal)', g: 'panales' },
  sueno: { icon: '🌙', label: 'Sueño', c: 'var(--c-sueno)', g: 'sueno' },
  medida: { icon: '📏', label: 'Medidas', c: 'var(--c-medida)', g: 'salud' },
  medicacion: { icon: '💊', label: 'Medicación', c: 'var(--c-medicacion)', g: 'salud' },
  temperatura: { icon: '🌡️', label: 'Temperatura', c: 'var(--c-temperatura)', g: 'salud' },
  bano: { icon: '🛁', label: 'Baño', c: 'var(--c-bano)', g: 'otros' },
  nota: { icon: '📝', label: 'Nota', c: 'var(--c-nota)', g: 'otros' },
};
const LADO = { izq: 'Izquierdo', der: 'Derecho', ambos: 'Ambos' };
const COLORES = [
  ['meconio', 'Meconio', '#2b2a1e'], ['verde', 'Verde', '#5d7a2e'], ['amarilla', 'Amarilla', '#e0b43a'],
  ['marron', 'Marrón', '#7a4b26'], ['blanca', 'Blanca/gris', '#d9d9d2'], ['roja', 'Con sangre', '#b0303a'],
];

function describe(e) {
  let s = '';
  switch (e.tipo) {
    case 'pecho': {
      const p = [];
      if (e.segIzq) p.push(`Izq ${fmtDur(e.segIzq)}`);
      if (e.segDer) p.push(`Der ${fmtDur(e.segDer)}`);
      s = p.join(' · ') || '—';
      break;
    }
    case 'biberon': s = `${nf(e.ml || 0)} ml · ${e.leche === 'formula' ? 'fórmula' : 'materna'}`; break;
    case 'regurgitacion': {
      s = { poca: 'Poca cantidad', media: 'Cantidad media', mucha: 'Mucha cantidad' }[e.cantidad] || 'Regurgitación';
      if (e.proyectil) s += ' · en proyectil';
      const g = trasToma(e.t);
      if (g != null) s += ` · ${fmtDur(g)} tras la toma`;
      break;
    }
    case 'extraccion': s = `${nf(e.ml || 0)} ml${e.lado ? ' · ' + LADO[e.lado].toLowerCase() : ''}`; break;
    case 'panal': {
      s = e.pis && e.caca ? 'Pis + caca' : e.caca ? 'Caca' : e.pis ? 'Pis' : 'Seco';
      const c = COLORES.find((x) => x[0] === e.color);
      if (c && e.caca) s += ` · ${c[1].toLowerCase()}`;
      break;
    }
    case 'sueno': s = e.fin ? `${fmtTime(e.t)}–${fmtTime(e.fin)} · ${fmtDur(e.fin - e.t)}` : 'en curso'; break;
    case 'medida': {
      const p = [];
      if (e.pesoG) p.push(`${nf(e.pesoG)} g`);
      if (e.talla) p.push(`${nf(e.talla, 1)} cm`);
      if (e.cabeza) p.push(`PC ${nf(e.cabeza, 1)} cm`);
      s = p.join(' · ');
      break;
    }
    case 'medicacion': s = [e.nombre, e.dosis, e.persona === 'mama' ? 'mamá' : ''].filter(Boolean).join(' · '); break;
    case 'temperatura': s = `${nf(e.grados, 1)} ºC`; break;
    case 'nota': s = e.texto || ''; break;
    case 'bano': s = ''; break;
  }
  if (e.nota && e.tipo !== 'nota') s += (s ? ' · ' : '') + e.nota;
  return s;
}
function trasToma(t) {
  const f = S.events.find((x) => (x.tipo === 'pecho' || x.tipo === 'biberon') && (x.fin || x.t) <= t);
  if (!f) return null;
  const g = t - (f.fin || f.t);
  return g < 6 * HOUR ? g : null;
}
const evTitle = (e) => (e.tipo === 'pecho' && e.lado ? `Pecho · terminó ${LADO[e.lado].toLowerCase()}` : e.tipo === 'medicacion' && e.estado === 'saltada' ? 'Medicación · saltada' : T[e.tipo]?.label || e.tipo);

// ---------------------------------------------------------------- estado
const S = {
  store: null, user: undefined, baby: null, active: {}, events: [], measures: [], plans: [],
  tab: 'inicio', filtro: 'todo', rango: 'hoy', medida: 'peso',
  sync: { pending: false, online: true }, error: null, loaded: false, lastAdded: null,
  voice: { enabled: false, state: 'apagado' },
};
let unsubs = [];
let charts = [];
let dirty = false;

// ---------------------------------------------------------------- arranque
start();
async function start() {
  try {
    S.store = await createStore();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="login"><div class="banner err">No se pudo iniciar: ${esc(e.message)}</div></div>`;
    return;
  }
  S.store.onSync((s) => { S.sync = s; const d = $('.sync'); if (d) d.className = syncClass(); });
  S.store.onUser((u) => {
    unsubs.forEach((f) => f && f());
    unsubs = [];
    S.user = u;
    S.error = null;
    S.baby = null; S.active = {}; S.events = []; S.measures = []; S.plans = []; S.loaded = false;
    S.access = !u ? null : S.store.mode === 'demo' || wasVerified(u.email) ? 'ok' : 'checking';
    if (u) subscribe();
    render();
  });
  setInterval(tick, 1000);
  setInterval(() => { if (S.user && !$('.sheet')) render(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function subscribe() {
  const err = (e) => {
    if (e && e.code === 'permission-denied') return denyAccess();
    S.error = e && e.code === 'permission-denied'
      ? `Tu cuenta (${S.user?.email}) no tiene acceso. Añade este email en las reglas de Firestore.`
      : `Error de sincronización: ${e?.message || e}`;
    render();
  };
  const since = dayStart(Date.now()) - 45 * DAY;
  unsubs.push(S.store.watchBaby((b, fromCache) => {
    S.baby = b;
    if (!fromCache && S.access !== 'ok') { S.access = 'ok'; markVerified(S.user.email); }
    render();
  }, err));
  unsubs.push(S.store.watchState((a) => { S.active = a || {}; render(); }, err));
  unsubs.push(S.store.watchEvents(since, (ev) => { S.events = ev; S.loaded = true; render(); }, err));
  unsubs.push(S.store.watchMeasures((m) => { S.measures = m; render(); }, err));
  unsubs.push(S.store.watchPlans((pl) => { S.plans = pl; render(); checkMedAlerts(); }, err));
}

// Acceso: solo las cuentas permitidas por las reglas de Firestore pueden ver la app.
const VKEY = 'monitor-bebe-verificado';
function wasVerified(email) { try { return localStorage.getItem(VKEY) === email; } catch { return false; } }
function markVerified(email) { try { localStorage.setItem(VKEY, email); } catch {} }
function denyAccess() {
  const email = S.user?.email || '';
  try { if (localStorage.getItem(VKEY) === email) localStorage.removeItem(VKEY); } catch {}
  unsubs.forEach((f) => f && f());
  unsubs = [];
  S.loginMsg = `La cuenta ${email} no tiene acceso a esta app.`;
  S.store.logout().catch(() => {});
  S.user = null; S.access = null;
  render();
}

const syncClass = () => 'sync' + (!S.sync.online ? ' off' : S.sync.pending ? ' pending' : '');
const fail = (e) => toast('No se pudo guardar: ' + (e?.message || e), true);
const run = (p) => Promise.resolve(p).catch(fail);
const me = () => S.user?.email || '';
const addEv = (ev) => run(S.store.addEvent(ev)).then((r) => { if (r && r.id) S.lastAdded = { id: r.id, tipo: ev.tipo }; return r; });

// ---------------------------------------------------------------- render
function render() {
  const app = document.getElementById('app');
  if (S.user === undefined) { app.innerHTML = ''; return; }
  if (!S.user) { app.innerHTML = viewLogin(); if (S.loginMsg) showLoginErr(S.loginMsg); return; }
  if (S.access !== 'ok') {
    app.innerHTML = `<div class="login"><img class="logo" src="icons/icon-192.png" alt=""><p>${navigator.onLine ? 'Comprobando acceso…' : 'Necesitas conexión para entrar la primera vez.'}</p></div>`;
    return;
  }
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest('main') && ae.matches('input,select,textarea')) { dirty = true; return; }
  dirty = false;
  charts.forEach((c) => c.destroy());
  charts = [];
  const views = { inicio: viewHome, historial: viewHistory, resumen: viewSummary, crecimiento: viewGrowth, medicinas: viewMeds, ajustes: viewSettings };
  const scroll = window.scrollY;
  app.innerHTML = `
    ${header()}
    <main>
      ${S.store.mode === 'demo' ? '<div class="banner info">Modo demo: los datos se guardan solo en este móvil. Pega la configuración de Firebase en <b>config.js</b> para compartirlos.</div>' : ''}
      ${S.error ? `<div class="banner err">${esc(S.error)}</div>` : ''}
      ${views[S.tab]()}
    </main>
    ${nav()}`;
  window.scrollTo(0, scroll);
  afterRender();
  tick();
}
document.addEventListener('focusout', () => setTimeout(() => { if (dirty) render(); }, 50));

function header() {
  const nombre = S.baby?.nombre || 'Mi bebé';
  return `<header class="top">
    <div class="avatar">${S.baby?.sexo === 'nino' ? '👶🏻' : S.baby?.sexo === 'nina' ? '👶🏻' : '👶🏻'}</div>
    <div class="grow"><h1>${esc(nombre)}</h1><div class="age">${esc(babyAge(S.baby?.nacimiento)) || 'Configura los datos en Ajustes'}</div></div>
    ${voiceSupported ? `<button class="mic ${S.voice.enabled ? 'on' : ''}" data-action="voice-toggle" title="Escucha por palabra clave">🎙️</button>` : ''}
    <span class="${syncClass()}" title="Sincronización"></span>
  </header>`;
}

function nav() {
  const items = [['inicio', '🏠', 'Inicio'], ['historial', '🗒️', 'Historial'], ['resumen', '📊', 'Resumen'], ['crecimiento', '📈', 'Peso'], ['medicinas', '💊', 'Medicinas'], ['ajustes', '⚙️', 'Ajustes']];
  return `<nav class="nav">${items.map(([k, i, l]) => `<button data-action="tab" data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><span class="i">${i}</span>${l}</button>`).join('')}</nav>`;
}

function evRow(e) {
  const t = T[e.tipo] || T.nota;
  const who = e.autor && e.autor !== me() ? `<div class="who" title="${esc(e.autor)}">${esc(e.autor[0])}</div>` : '';
  return `<button class="ev" data-action="edit" data-id="${esc(e.id)}" style="--c:${t.c}">
    <span class="ic">${t.icon}</span>
    <span class="tx"><div class="t1">${esc(evTitle(e))}</div><div class="t2">${esc(describe(e))}</div></span>
    <span class="tm">${fmtTime(e.t)}${who}</span>
  </button>`;
}

// ---------------------------------------------------------------- Inicio
function pechoTimes(p, now = Date.now()) {
  const run = p.desde ? now - p.desde : 0;
  const izq = (p.acumIzq || 0) + (p.lado === 'izq' ? run : 0);
  const der = (p.acumDer || 0) + (p.lado === 'der' ? run : 0);
  return { izq, der, total: izq + der };
}

function viewHome() {
  const p = S.active.pecho, sl = S.active.sueno;
  let h = '';

  if (p) {
    const running = !!p.desde;
    h += `<div class="card live" style="--c:var(--c-pecho)">
      <div class="head"><span><span class="pulse ${running ? '' : 'paused'}"></span>${running ? 'Toma en curso' : 'Toma en pausa'}</span><span class="muted">desde ${fmtTime(p.inicio)}</span></div>
      <div class="big-timer" data-timer="pecho-total">00:00</div>
      <div class="sides">
        <button class="side ${running && p.lado === 'izq' ? 'on' : ''}" data-action="pecho-side" data-lado="izq"><span>Izquierdo</span><b data-timer="pecho-izq">00:00</b></button>
        <button class="side ${running && p.lado === 'der' ? 'on' : ''}" data-action="pecho-side" data-lado="der"><span>Derecho</span><b data-timer="pecho-der">00:00</b></button>
      </div>
      <div class="row-btns">
        <button class="btn" data-action="pecho-pause">${running ? '⏸  Pausa' : '▶  Seguir'}</button>
        <button class="btn c" data-action="pecho-finish">✓  Terminar toma</button>
      </div>
      <button class="link danger" data-action="pecho-cancel">Descartar</button>
    </div>`;
  }
  if (sl) {
    h += `<div class="card live" style="--c:var(--c-sueno)">
      <div class="head"><span><span class="pulse"></span>Durmiendo</span><span class="muted">desde ${fmtTime(sl.inicio)}</span></div>
      <div class="big-timer" data-timer="sueno">00:00</div>
      <div class="row-btns"><button class="btn" data-action="sueno-cancel">Descartar</button><button class="btn c" data-action="sueno-finish">☀️  Se despertó</button></div>
    </div>`;
  }

  // Estado
  const lastFeed = S.events.find((e) => e.tipo === 'pecho' || e.tipo === 'biberon');
  const lastPecho = S.events.find((e) => e.tipo === 'pecho');
  const lastPanal = S.events.find((e) => e.tipo === 'panal');
  const lastSueno = S.events.find((e) => e.tipo === 'sueno' && e.fin);
  const sugerido = lastPecho ? (lastPecho.primero === 'izq' ? 'der' : lastPecho.primero === 'der' ? 'izq' : lastPecho.lado === 'izq' ? 'der' : 'izq') : null;

  h += `<div class="status">
    <button class="stat" data-action="${lastFeed ? 'edit' : 'noop'}" data-id="${esc(lastFeed?.id || '')}">
      <span class="k"><span class="dot" style="background:var(--c-pecho)"></span>Última toma</span>
      ${p ? '<span class="v">En curso</span>' : lastFeed ? `<span class="v" data-ago="${lastFeed.t}">${fmtAgo(lastFeed.t)}</span><span class="d">${fmtTime(lastFeed.t)} · ${esc(lastFeed.tipo === 'pecho' ? describe(lastFeed) : describe(lastFeed))}</span>` : '<span class="v">—</span><span class="d">Sin registros</span>'}
    </button>
    <button class="stat" data-action="${lastPanal ? 'edit' : 'noop'}" data-id="${esc(lastPanal?.id || '')}">
      <span class="k"><span class="dot" style="background:var(--c-panal)"></span>Último pañal</span>
      ${lastPanal ? `<span class="v" data-ago="${lastPanal.t}">${fmtAgo(lastPanal.t)}</span><span class="d">${fmtTime(lastPanal.t)} · ${esc(describe(lastPanal))}</span>` : '<span class="v">—</span><span class="d">Sin registros</span>'}
    </button>
    ${lastPecho && !p ? `<div class="stat wide" style="min-height:0;flex-direction:row;align-items:center;justify-content:space-between">
      <span><span class="k"><span class="dot" style="background:var(--c-pecho)"></span>Siguiente pecho</span><span class="d">La última empezó por el ${LADO[lastPecho.primero || lastPecho.lado]?.toLowerCase() || '—'}</span></span>
      <span class="v" style="font-size:18px;color:var(--c-pecho)">${LADO[sugerido]}</span></div>` : ''}
    ${!sl && lastSueno ? `<div class="stat wide" style="min-height:0;flex-direction:row;align-items:center;justify-content:space-between">
      <span><span class="k"><span class="dot" style="background:var(--c-sueno)"></span>Despierto</span><span class="d">Último sueño ${fmtDur(lastSueno.fin - lastSueno.t)}</span></span>
      <span class="v" style="font-size:18px" data-ago="${lastSueno.fin}">${fmtAgo(lastSueno.fin)}</span></div>` : ''}
  </div>`;

  h += homeMeds();

  // Medicación diaria
  const med = (S.baby?.medDiaria ?? 'Vitamina D').trim();
  if (med && !S.plans.some((pl) => norm(pl.nombre) === norm(med))) {
    const d0 = dayStart(Date.now());
    const dada = S.events.find((e) => e.tipo === 'medicacion' && e.t >= d0 && (e.nombre || '').toLowerCase() === med.toLowerCase());
    h += `<button class="daily ${dada ? 'done' : ''}" data-action="${dada ? 'edit' : 'daily-med'}" data-id="${esc(dada?.id || '')}">
      <span class="check">${dada ? '✓' : ''}</span>
      <span style="flex:1"><b>${esc(med)}</b><div class="muted" style="font-size:13px">${dada ? `Dada hoy a las ${fmtTime(dada.t)}` : 'Pendiente hoy · toca para marcar'}</div></span>
      <span>💊</span></button>`;
  }

  // Acciones rápidas
  h += `<div class="quick">
    ${p ? '' : `<button class="qbtn" style="--c:var(--c-pecho)" data-action="pecho-start" data-lado="izq">${sugerido === 'izq' ? '<span class="badge">toca</span>' : ''}<span class="i">🤱</span>Pecho izq.</button>
    <button class="qbtn" style="--c:var(--c-pecho)" data-action="pecho-start" data-lado="der">${sugerido === 'der' ? '<span class="badge">toca</span>' : ''}<span class="i">🤱</span>Pecho der.</button>`}
    <button class="qbtn" style="--c:var(--c-biberon)" data-action="new" data-tipo="biberon"><span class="i">🍼</span>Biberón</button>
    <button class="qbtn" style="--c:var(--c-panal)" data-action="new" data-tipo="panal"><span class="i">🧷</span>Pañal</button>
    <button class="qbtn" style="--c:var(--c-regurg)" data-action="regurg-quick"><span class="i">💦</span>Regurgitó</button>
    ${sl ? '' : '<button class="qbtn" style="--c:var(--c-sueno)" data-action="sueno-start"><span class="i">🌙</span>Dormir</button>'}
    ${voiceSupported ? '<button class="qbtn" style="--c:var(--accent)" data-action="voice-once"><span class="i">🎙️</span>Voz</button>' : ''}
    <button class="qbtn" style="--c:var(--accent)" data-action="more"><span class="i">＋</span>Más</button>
  </div>`;

  // Hoy
  const st = stats(dayStart(Date.now()), Date.now());
  h += `<div class="section-title">Hoy</div>
  <div class="card today">
    <div><div class="n">${st.tomas}</div><div class="l">tomas</div></div>
    <div><div class="n">${st.pis}</div><div class="l">pis</div></div>
    <div><div class="n">${st.caca}</div><div class="l">cacas</div></div>
    <div><div class="n">${st.regurg}</div><div class="l">regurg.</div></div>
    <div><div class="n">${st.sueno ? (st.sueno / HOUR).toFixed(1).replace('.', ',') : 0}</div><div class="l">h sueño</div></div>
  </div>`;

  const recent = S.events.slice(0, 6);
  h += `<div class="section-title">Últimos registros ${S.events.length > 6 ? '<button data-action="tab" data-tab="historial">Ver todo</button>' : ''}</div>
    <div class="card" style="padding:4px 12px">${recent.length ? recent.map(evRow).join('') : `<div class="empty">${S.loaded ? 'Aún no hay registros. ¡Empieza con la primera toma!' : 'Cargando…'}</div>`}</div>`;
  return h;
}

function tick() {
  const now = Date.now();
  if (now % 15000 < 1000) checkMedAlerts();
  const p = S.active.pecho;
  if (p) {
    const t = pechoTimes(p, now);
    const set = (k, v) => { const el = document.querySelector(`[data-timer="${k}"]`); if (el) el.textContent = fmtClock(v); };
    set('pecho-total', t.total); set('pecho-izq', t.izq); set('pecho-der', t.der);
  }
  if (S.active.sueno) { const el = $('[data-timer="sueno"]'); if (el) el.textContent = fmtClock(now - S.active.sueno.inicio); }
  if (now % 15000 < 1000) document.querySelectorAll('[data-ago]').forEach((el) => { el.textContent = fmtAgo(+el.dataset.ago); });
}

// ---------------------------------------------------------------- estadísticas
function stats(from, to) {
  const evs = S.events.filter((e) => e.t >= from - DAY && e.t < to);
  const r = { regurg: 0, regurgTras: [], tomas: 0, pechoMs: 0, izq: 0, der: 0, biberones: 0, ml: 0, extraccionMl: 0, pis: 0, caca: 0, panales: 0, sueno: 0, suenos: 0, starts: [] };
  for (const e of evs) {
    const inWin = e.t >= from && e.t < to;
    if (e.tipo === 'sueno') {
      const ov = overlap(e.t, e.fin || to, from, to);
      if (ov > 0) { r.sueno += ov; if (inWin) r.suenos++; }
      continue;
    }
    if (!inWin) continue;
    if (e.tipo === 'pecho') { r.tomas++; r.izq += e.segIzq || 0; r.der += e.segDer || 0; r.pechoMs += (e.segIzq || 0) + (e.segDer || 0); r.starts.push(e.t); }
    if (e.tipo === 'biberon') { r.tomas++; r.biberones++; r.ml += +e.ml || 0; r.starts.push(e.t); }
    if (e.tipo === 'extraccion') r.extraccionMl += +e.ml || 0;
    if (e.tipo === 'regurgitacion') { r.regurg++; const g = trasToma(e.t); if (g != null) r.regurgTras.push(g); }
    if (e.tipo === 'panal') { r.panales++; if (e.pis) r.pis++; if (e.caca) r.caca++; }
  }
  if (S.active.sueno) r.sueno += overlap(S.active.sueno.inicio, Date.now(), from, to);
  r.starts.sort((a, b) => a - b);
  const gaps = r.starts.slice(1).map((t, i) => t - r.starts[i]);
  r.intervalo = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  return r;
}

// ---------------------------------------------------------------- Historial
function viewHistory() {
  const filtros = [['todo', 'Todo'], ['tomas', '🤱 Tomas'], ['panales', '🧷 Pañales'], ['sueno', '🌙 Sueño'], ['salud', '💊 Salud'], ['otros', '📝 Otros']];
  const list = S.events.filter((e) => S.filtro === 'todo' || T[e.tipo]?.g === S.filtro);
  let h = `<div class="chips-scroll">${filtros.map(([k, l]) => `<button class="chip ${S.filtro === k ? 'on' : ''}" data-action="filtro" data-f="${k}">${l}</button>`).join('')}</div>`;
  if (!list.length) return h + `<div class="card empty">No hay registros${S.filtro !== 'todo' ? ' de este tipo' : ''} en los últimos 45 días.</div>`;
  const groups = new Map();
  for (const e of list) { const k = dayStart(e.t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  for (const [k, evs] of groups) {
    const st = stats(k, k + DAY);
    h += `<div class="day-h"><span>${dayLabel(k)}</span><span>${pl(st.tomas, 'toma', 'tomas')} · ${pl(st.panales, 'pañal', 'pañales')}</span></div>
      <div class="card" style="padding:4px 12px">${evs.map(evRow).join('')}</div>`;
  }
  return h + `<p class="faint" style="text-align:center;font-size:13px">Se muestran los últimos 45 días. El historial completo está en Ajustes → Exportar.</p>`;
}

// ---------------------------------------------------------------- Resumen
function viewSummary() {
  const now = Date.now();
  const ranges = { hoy: [dayStart(now), now, 1], '24h': [now - DAY, now, 1], '7d': [dayStart(now) - 6 * DAY, now, 7] };
  const [from, to, nd] = ranges[S.rango];
  const st = stats(from, to);
  const per = (v) => (nd > 1 ? v / nd : v);
  const pm = (v, d = 0) => nf(per(v), d);
  let h = `<div class="seg">${[['hoy', 'Hoy'], ['24h', 'Últimas 24 h'], ['7d', '7 días']].map(([k, l]) => `<button class="${S.rango === k ? 'on' : ''}" data-action="rango" data-r="${k}">${l}</button>`).join('')}</div>`;
  if (nd > 1) h += `<p class="muted" style="margin:-4px 4px 12px;font-size:13px">Medias por día de los últimos 7 días</p>`;
  const m = (c, k, v, d) => `<div class="metric"><div class="k"><span class="dot" style="background:${c}"></span>${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  h += `<div class="metrics">
    ${m('var(--c-pecho)', 'Tomas', pm(st.tomas, nd > 1 ? 1 : 0), st.intervalo ? `cada ${fmtDur(st.intervalo)} de media` : '&nbsp;')}
    ${m('var(--c-pecho)', 'Pecho', fmtDur(per(st.pechoMs)), `izq ${fmtDur(per(st.izq))} · der ${fmtDur(per(st.der))}`)}
    ${m('var(--c-biberon)', 'Biberón', `${pm(st.ml)} ml`, pl(pm(st.biberones, nd > 1 ? 1 : 0), 'biberón', 'biberones'))}
    ${m('var(--c-panal)', 'Pañales', pm(st.panales, nd > 1 ? 1 : 0), `${pm(st.pis, nd > 1 ? 1 : 0)} pis · ${pl(pm(st.caca, nd > 1 ? 1 : 0), 'caca', 'cacas')}`)}
    ${m('var(--c-sueno)', 'Sueño', fmtDur(per(st.sueno)), pl(pm(st.suenos, nd > 1 ? 1 : 0), 'periodo', 'periodos'))}
    ${m('var(--c-regurg)', 'Regurgitaciones', pm(st.regurg, nd > 1 ? 1 : 0), st.regurgTras.length ? `${fmtDur(st.regurgTras.reduce((a, b) => a + b, 0) / st.regurgTras.length)} tras la toma de media` : '&nbsp;')}
    ${m('var(--c-extraccion)', 'Extracción', `${pm(st.extraccionMl)} ml`, '&nbsp;')}
  </div>`;

  // Línea de tiempo 7 días
  const d0 = dayStart(now);
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const ds = d0 - i * DAY, de = ds + DAY;
    const pos = (t) => ((Math.max(t, ds) - ds) / DAY) * 100;
    let bars = [6, 12, 18].map((hh) => `<span class="hr" style="left:${(hh / 24) * 100}%"></span>`).join('');
    const sleeps = S.events.filter((e) => e.tipo === 'sueno').map((e) => [e.t, e.fin || now]);
    if (S.active.sueno) sleeps.push([S.active.sueno.inicio, now]);
    for (const [a, b] of sleeps) if (overlap(a, b, ds, de) > 0) bars += `<i class="sl" style="left:${pos(a)}%;width:${pos(Math.min(b, de)) - pos(a)}%"></i>`;
    for (const e of S.events) {
      if (e.t < ds || e.t >= de) continue;
      if (e.tipo === 'pecho') bars += `<i class="fd" style="left:${pos(e.t)}%;width:${Math.max(0.6, pos(Math.min(e.fin || e.t, de)) - pos(e.t))}%"></i>`;
      if (e.tipo === 'biberon') bars += `<i class="bb" style="left:${pos(e.t)}%"></i>`;
      if (e.tipo === 'panal') bars += `<i class="dp" style="left:${pos(e.t)}%"></i>`;
      if (e.tipo === 'regurgitacion') bars += `<i class="rg" style="left:${pos(e.t)}%"></i>`;
    }
    if (i === 0) bars += `<span class="hr" style="left:${pos(now)}%;background:#ffffff55"></span>`;
    rows += `<div class="tl-row"><div class="lb">${i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : shortDay(ds)}</div><div class="tl-bar">${bars}</div></div>`;
  }
  h += `<div class="section-title">Últimos 7 días</div><div class="card tl">${rows}
    <div class="tl-axis"><div></div><div><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div></div>
    <div class="legend"><span><span class="dot" style="background:var(--c-sueno)"></span>Sueño</span><span><span class="dot" style="background:var(--c-pecho)"></span>Pecho</span><span><span class="dot" style="background:var(--c-biberon)"></span>Biberón</span><span><span class="dot" style="background:var(--c-panal)"></span>Pañal</span><span><span class="dot" style="background:var(--c-regurg)"></span>Regurgitación</span></div>
  </div>`;

  h += `<div class="section-title">Tomas y pañales por día</div><div class="card"><div class="chart-box"><canvas id="ch-tomas"></canvas></div></div>
        <div class="section-title">Horas de sueño por día</div><div class="card"><div class="chart-box"><canvas id="ch-sueno"></canvas></div></div>`;
  return h;
}

function dailySeries(n = 7) {
  const d0 = dayStart(Date.now());
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const ds = d0 - i * DAY; out.push({ label: i === 0 ? 'Hoy' : shortDay(ds), ...stats(ds, Math.min(ds + DAY, Date.now())) }); }
  return out;
}

// ---------------------------------------------------------------- Crecimiento
const ZS = [[-1.881, 'P3'], [-1.036, 'P15'], [0, 'P50'], [1.036, 'P85'], [1.881, 'P97']];
function lmsAt(tab, days) {
  if (days <= tab[0][0]) return tab[0];
  for (let i = 1; i < tab.length; i++) {
    if (days <= tab[i][0]) {
      const [d0, l0, m0, s0] = tab[i - 1], [d1, l1, m1, s1] = tab[i];
      const f = (days - d0) / (d1 - d0);
      return [days, l0 + (l1 - l0) * f, m0 + (m1 - m0) * f, s0 + (s1 - s0) * f];
    }
  }
  return tab[tab.length - 1];
}
const lmsValue = ([, L, M, S2], z) => (L ? M * Math.pow(1 + L * S2 * z, 1 / L) : M * Math.exp(S2 * z));
const lmsZ = ([, L, M, S2], x) => (L ? (Math.pow(x / M, L) - 1) / (L * S2) : Math.log(x / M) / S2);
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const MED = {
  peso: { k: 'pesoG', label: 'Peso', unit: 'kg', conv: (v) => v / 1000, fmt: (v) => `${nf(v)} g` },
  talla: { k: 'talla', label: 'Longitud', unit: 'cm', conv: (v) => v, fmt: (v) => `${nf(v, 1)} cm` },
  cabeza: { k: 'cabeza', label: 'Perímetro cefálico', unit: 'cm', conv: (v) => v, fmt: (v) => `${nf(v, 1)} cm` },
};

function viewGrowth() {
  const cfg = MED[S.medida];
  let h = `<div class="seg">${Object.entries(MED).map(([k, v]) => `<button class="${S.medida === k ? 'on' : ''}" data-action="medida" data-m="${k}">${k === 'cabeza' ? 'Perímetro' : v.label}</button>`).join('')}</div>`;
  const pts = S.measures.filter((e) => e[cfg.k]);
  const nac = S.baby?.nacimiento, sexo = S.baby?.sexo;
  const tab = sexo ? WHO[`${S.medida}_${sexo}`] : null;

  if (!nac || !sexo) h += `<div class="banner warn">Indica la fecha de nacimiento y si es niño o niña en <b>Ajustes</b> para ver las curvas de la OMS y los percentiles.</div>`;

  if (pts.length) {
    const last = pts[pts.length - 1], prev = pts[pts.length - 2], first = pts[0];
    const v = last[cfg.k];
    let pct = '';
    if (tab && nac) {
      const days = (last.t - nac) / DAY;
      if (days >= 0) {
        const p = normCdf(lmsZ(lmsAt(tab, days), cfg.conv(v))) * 100;
        pct = p < 1 ? '< P1' : p > 99 ? '> P99' : `P${Math.round(p)}`;
      }
    }
    let delta = '';
    if (prev) {
      const dv = v - prev[cfg.k], dd = Math.max(1, Math.round((last.t - prev.t) / DAY));
      delta = S.medida === 'peso'
        ? `${dv >= 0 ? '+' : ''}${nf(dv)} g en ${dd} ${dd === 1 ? 'día' : 'días'} (${dv >= 0 ? '+' : ''}${nf(dv / dd)} g/día)`
        : `${dv >= 0 ? '+' : ''}${nf(dv, 1)} cm en ${dd} ${dd === 1 ? 'día' : 'días'}`;
    }
    let vsFirst = '';
    if (S.medida === 'peso' && first !== last) {
      const pc = ((v - first.pesoG) / first.pesoG) * 100;
      vsFirst = `${pc >= 0 ? '+' : ''}${nf(pc, 1)} % respecto al primer peso (${nf(first.pesoG)} g)`;
    }
    h += `<div class="card"><div class="gr-head"><div><div class="muted" style="font-size:13px">Último · ${dayLabel(last.t)} ${fmtTime(last.t)}</div><div class="v">${cfg.fmt(v)}</div></div>${pct ? `<span class="pct">${pct}</span>` : ''}</div>
      ${delta ? `<div class="muted" style="margin-top:6px;font-size:14px">${delta}</div>` : ''}${vsFirst ? `<div class="muted" style="font-size:14px">${vsFirst}</div>` : ''}</div>`;
  }

  h += `<div class="card"><div class="chart-box tall"><canvas id="ch-growth"></canvas></div>
    ${tab ? '<div class="legend"><span>Líneas: percentiles OMS 3, 15, 50, 85 y 97</span></div>' : ''}</div>`;
  h += `<button class="btn primary block" data-action="new" data-tipo="medida">＋ Añadir medida</button>`;
  h += `<div class="section-title">Registros</div><div class="card" style="padding:4px 12px">${S.measures.length ? [...S.measures].reverse().map((e) => evRow(e).replace(fmtTime(e.t) + '<', `${shortDay(e.t)}<br><span class="faint">${fmtTime(e.t)}</span><`)).join('') : '<div class="empty">Aún no hay medidas. Apunta el peso al nacer y los de las revisiones.</div>'}</div>`;
  return h;
}

// ---------------------------------------------------------------- Ajustes
function viewSettings() {
  const b = S.baby || {};
  return `<div class="section-title">Bebé</div>
  <div class="card">
    <div class="field"><label>Nombre</label><input class="input" id="s-nombre" value="${esc(b.nombre || '')}" placeholder="Nombre del bebé"></div>
    <div class="field"><label>Fecha y hora de nacimiento</label><input class="input" id="s-nac" type="datetime-local" value="${b.nacimiento ? toLocalInput(b.nacimiento) : ''}"></div>
    <div class="field"><label>Sexo (para las curvas de la OMS)</label>
      <div class="grid2"><button class="opt ${b.sexo === 'nino' ? 'on' : ''}" data-action="pick-sexo" data-v="nino">Niño</button><button class="opt ${b.sexo === 'nina' ? 'on' : ''}" data-action="pick-sexo" data-v="nina">Niña</button></div></div>
    <div class="field"><label>Medicación diaria a recordar (vacío para ocultar)</label><input class="input" id="s-med" value="${esc(b.medDiaria ?? 'Vitamina D')}"></div>
    <button class="btn primary block" data-action="save-baby">Guardar</button>
  </div>

  <div class="section-title">Voz</div>
  <div class="card">
    ${voiceSupported ? `
    <div class="field"><label>Palabra clave</label><input class="input" id="s-wake" value="${esc(voicePrefs().wake)}" placeholder="oye monitor">
      <div class="faint" style="font-size:13px;margin-top:6px">Mejor dos palabras poco habituales en una conversación normal.</div></div>
    <div class="field"><label>Activar la escucha al abrir la app</label>${pickPlain('s-auto', voicePrefs().auto ? '1' : '0', [['1', 'Sí'], ['0', 'No']])}</div>
    <div class="grid2"><button class="btn" data-action="voice-help">Ver órdenes</button><button class="btn primary" data-action="save-voice">Guardar</button></div>
    <p class="muted" style="font-size:13px;margin:12px 0 0">Con 🎙️ arriba activas la escucha: dices la palabra clave y luego la orden. Solo funciona con la app abierta (la pantalla se queda encendida). En iPhone, la voz funciona en Safari, no desde el icono de inicio.</p>`
    : '<div class="muted" style="font-size:14px">Este navegador no admite reconocimiento de voz. Usa Chrome en Android o Safari en iPhone.</div>'}
  </div>

  <div class="section-title">Datos</div>
  <div class="card">
    <button class="btn block" data-action="export">⬇️  Exportar todo a CSV (para el pediatra o Excel)</button>
  </div>

  <div class="section-title">Instalar en el móvil</div>
  <div class="card"><ol class="steps">
    <li><b>iPhone:</b> abre la web en Safari → botón Compartir → <i>Añadir a pantalla de inicio</i>.</li>
    <li><b>Android:</b> en Chrome → menú ⋮ → <i>Instalar aplicación</i>.</li>
    <li>Funciona sin conexión: lo que apuntes se sincroniza al recuperar la red.</li>
  </ol></div>

  <div class="section-title">Cuenta</div>
  <div class="card">
    <div class="kv"><span class="muted">Sesión</span><span>${esc(S.store.mode === 'demo' ? 'Modo demo' : me())}</span></div>
    <div class="kv"><span class="muted">Estado</span><span>${!S.sync.online ? 'Sin conexión' : S.sync.pending ? 'Sincronizando…' : 'Sincronizado'}</span></div>
    ${S.store.mode === 'demo' ? '' : '<button class="btn danger block" style="margin-top:10px" data-action="logout">Cerrar sesión</button>'}
  </div>
  <p class="faint" style="text-align:center;font-size:12px">Monitor Bebé · v1.0</p>`;
}

// ---------------------------------------------------------------- Login
function viewLogin() {
  return `<div class="login">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>Monitor Bebé</h1>
    <p>Entra con vuestra cuenta para compartir los registros.</p>
    <form id="login-form">
      <div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label>Contraseña</label><input class="input" name="pass" type="password" autocomplete="current-password" minlength="6" required></div>
      <div id="login-err"></div>
      <button class="btn primary block" type="submit" data-mode="login">Entrar</button>
      <button class="btn block" type="submit" data-mode="register" style="margin-top:10px">Crear cuenta</button>
      <button class="link" type="button" data-action="reset-pass">He olvidado la contraseña</button>
    </form>
  </div>`;
}
const AUTH_ERR = {
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe esa cuenta. Pulsa “Crear cuenta”.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Pulsa “Entrar”.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El email no es válido.',
  'auth/network-request-failed': 'Sin conexión. Inténtalo de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un poco.',
  'auth/operation-not-allowed': 'Activa “Correo electrónico/contraseña” en Firebase → Authentication.',
};

// ---------------------------------------------------------------- gráficas
function afterRender() {
  if (!window.Chart) return;
  Chart.defaults.color = '#9aa1c4';
  Chart.defaults.borderColor = '#2a3158';
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  if ($('#ch-tomas')) {
    const s = dailySeries();
    charts.push(new Chart($('#ch-tomas'), {
      type: 'bar',
      data: { labels: s.map((x) => x.label), datasets: [
        { label: 'Tomas', data: s.map((x) => x.tomas), backgroundColor: css('--c-pecho'), borderRadius: 6 },
        { label: 'Pis', data: s.map((x) => x.pis), backgroundColor: css('--c-panal'), borderRadius: 6 },
        { label: 'Cacas', data: s.map((x) => x.caca), backgroundColor: '#c99a5b', borderRadius: 6 },
      ] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } },
    }));
  }
  if ($('#ch-sueno')) {
    const s = dailySeries();
    charts.push(new Chart($('#ch-sueno'), {
      type: 'bar',
      data: { labels: s.map((x) => x.label), datasets: [{ label: 'Horas', data: s.map((x) => +(x.sueno / HOUR).toFixed(1)), backgroundColor: css('--c-sueno'), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } },
    }));
  }
  if ($('#ch-growth')) {
    const cfg = MED[S.medida];
    const nac = S.baby?.nacimiento, sexo = S.baby?.sexo;
    const tab = sexo ? WHO[`${S.medida}_${sexo}`] : null;
    const pts = S.measures.filter((e) => e[cfg.k]);
    const datasets = [];
    let xmax = 90;
    if (nac) for (const p of pts) xmax = Math.max(xmax, (p.t - nac) / DAY + 21);
    xmax = Math.min(730, Math.max(xmax, (Date.now() - (nac || Date.now())) / DAY + 14));
    if (tab) {
      const xs = [];
      for (let d = 0; d <= xmax; d += xmax <= 120 ? 3 : 10) xs.push(d);
      xs.push(xmax);
      for (const [z, name] of ZS) {
        datasets.push({
          label: name, data: xs.map((d) => ({ x: d, y: +lmsValue(lmsAt(tab, d), z).toFixed(3) })),
          borderColor: z === 0 ? '#9aa1c4' : '#4a5282', borderWidth: z === 0 ? 2 : 1, borderDash: z === 0 ? [] : [4, 4],
          pointRadius: 0, tension: 0.3, fill: false,
        });
      }
    }
    const data = pts.map((p) => ({ x: nac ? (p.t - nac) / DAY : 0, y: cfg.conv(p[cfg.k]) }));
    datasets.push({ label: S.baby?.nombre || 'Bebé', data, borderColor: css('--c-medida'), backgroundColor: css('--c-medida'), pointRadius: 5, borderWidth: 2.5, tension: 0.2 });
    const weeks = xmax <= 120;
    charts.push(new Chart($('#ch-growth'), {
      type: 'line', data: { datasets },
      options: {
        maintainAspectRatio: false, parsing: false,
        plugins: { legend: { display: false }, tooltip: { filter: (i) => i.datasetIndex === datasets.length - 1 || i.dataIndex % 5 === 0,
          callbacks: { title: (it) => (it[0] ? `${Math.round(it[0].parsed.x)} días` : ''), label: (c) => `${c.dataset.label}: ${nf(c.parsed.y, cfg.unit === 'kg' ? 2 : 1)} ${cfg.unit}` } } },
        scales: {
          x: { type: 'linear', min: 0, max: Math.round(xmax), ticks: { stepSize: weeks ? 14 : 30.4375 * 2, callback: (v) => (weeks ? `${Math.round(v / 7)} sem` : `${Math.round(v / 30.4375)} m`) } },
          y: { title: { display: true, text: cfg.unit } },
        },
      },
    }));
  }
}

// ---------------------------------------------------------------- hojas (formularios)
function openSheet(title, body, { onSave, onDelete, saveLabel = 'Guardar', icon = '' } = {}) {
  closeSheet();
  const root = document.createElement('div');
  root.id = 'sheet-root';
  root.innerHTML = `<div class="sheet-bg" data-action="close-sheet"></div>
    <form class="sheet" id="sheet-form" novalidate>
      <div class="grab"></div>
      <h3>${icon}<span>${title}</span></h3>
      ${body}
      ${onSave ? `<div class="actions ${onDelete ? '' : 'one'}">${onDelete ? '<button type="button" class="btn danger" data-action="sheet-delete">Eliminar</button>' : ''}<button type="submit" class="btn primary">${saveLabel}</button></div>` : ''}
    </form>`;
  document.body.appendChild(root);
  const form = $('#sheet-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const ok = onSave(form);
    if (ok !== false) closeSheet();
  });
  if (onDelete) root.querySelector('[data-action="sheet-delete"]').addEventListener('click', () => {
    if (confirm('¿Eliminar este registro?')) { onDelete(); closeSheet(); }
  });
  form.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pick]');
    if (b) {
      const name = b.dataset.pick;
      form.querySelectorAll(`[data-pick="${name}"]`).forEach((x) => x.classList.toggle('on', x === b));
      form.elements[name].value = b.dataset.v;
      form.dispatchEvent(new Event('change'));
    }
    const ch = ev.target.closest('[data-ago-min]');
    if (ch) { form.elements[ch.dataset.field || 't'].value = toLocalInput(Date.now() - ch.dataset.agoMin * MIN); }
    const fill = ev.target.closest('[data-fill]');
    if (fill) { form.elements[fill.dataset.fill].value = fill.dataset.v; form.dispatchEvent(new Event('input')); }
  });
  return form;
}
function closeSheet() { const r = $('#sheet-root'); if (r) r.remove(); if (dirty) render(); }

const timeField = (t, label = 'Hora', name = 't', chips = true) => `<div class="field"><label>${label}</label>
  <input class="input" type="datetime-local" name="${name}" value="${toLocalInput(t)}">
  ${chips ? `<div class="chip-row" style="margin-top:8px">${[[0, 'Ahora'], [5, '−5′'], [15, '−15′'], [30, '−30′'], [60, '−1 h']].map(([m, l]) => `<button type="button" class="chip" data-ago-min="${m}" data-field="${name}">${l}</button>`).join('')}</div>` : ''}</div>`;
const pick = (name, value, opts, cols = opts.length) => `<input type="hidden" name="${name}" value="${esc(value ?? '')}">
  <div class="grid${cols}" style="${cols > 3 ? 'display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:10px' : ''}">${opts.map(([v, l, i]) => `<button type="button" class="opt ${String(value) === String(v) ? 'on' : ''}" data-pick="${name}" data-v="${v}">${i ? `<span class="i">${i}</span>` : ''}${l}</button>`).join('')}</div>`;
const notaField = (v) => `<div class="field"><label>Nota (opcional)</label><input class="input" name="nota" value="${esc(v || '')}" placeholder="Algo a destacar"></div>`;
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

function openEventForm(tipo, ev) {
  const e = ev || {};
  const t = T[tipo];
  const now = Date.now();
  let body = '', read;

  switch (tipo) {
    case 'pecho': {
      const mi = e.segIzq ? Math.round(e.segIzq / MIN) : '', md = e.segDer ? Math.round(e.segDer / MIN) : '';
      body = `<div class="grid2"><div class="field"><label>Minutos izquierdo</label><input class="input" name="izq" inputmode="numeric" value="${mi}"></div>
        <div class="field"><label>Minutos derecho</label><input class="input" name="der" inputmode="numeric" value="${md}"></div></div>
        <div class="field"><label>Empezó por</label>${pick('primero', e.primero || 'izq', [['izq', 'Izquierdo'], ['der', 'Derecho']])}</div>
        ${timeField(e.t || now - 20 * MIN, 'Inicio')}${notaField(e.nota)}`;
      read = (f) => {
        const vi = num(f.izq.value) || 0, vd = num(f.der.value) || 0;
        if (!vi && !vd) return toast('Indica los minutos de al menos un pecho', true), false;
        const segIzq = e.segIzq && Math.round(e.segIzq / MIN) === vi ? e.segIzq : vi * MIN;
        const segDer = e.segDer && Math.round(e.segDer / MIN) === vd ? e.segDer : vd * MIN;
        const primero = f.primero.value;
        const lado = vi && vd ? (primero === 'izq' ? 'der' : 'izq') : vi ? 'izq' : 'der';
        const ts = fromLocalInput(f.t.value);
        return { segIzq, segDer, primero: vi && vd ? primero : lado, lado, t: ts, fin: ts + segIzq + segDer, nota: f.nota.value.trim() };
      };
      break;
    }
    case 'biberon':
      body = `<div class="field"><label>Cantidad (ml)</label><input class="input" name="ml" inputmode="numeric" value="${e.ml ?? ''}" placeholder="ml">
        <div class="chip-row" style="margin-top:8px">${[20, 30, 45, 60, 90, 120].map((v) => `<button type="button" class="chip" data-fill="ml" data-v="${v}">${v}</button>`).join('')}</div></div>
        <div class="field"><label>Leche</label>${pick('leche', e.leche || 'formula', [['formula', 'Fórmula'], ['materna', 'Materna']])}</div>
        ${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => { const ml = num(f.ml.value); if (!ml) return toast('Indica los ml', true), false; return { ml, leche: f.leche.value, t: fromLocalInput(f.t.value), nota: f.nota.value.trim() }; };
      break;
    case 'regurgitacion':
      body = `<div class="field"><label>Cantidad</label>${pick('cantidad', e.cantidad || 'poca', [['poca', 'Poca'], ['media', 'Media'], ['mucha', 'Mucha']])}</div>
        <div class="field"><label>¿En proyectil?</label>${pick('proyectil', e.proyectil ? '1' : '0', [['0', 'No'], ['1', 'Sí']])}
          <div class="hint hidden" id="rg-hint">Si los vómitos en proyectil se repiten, son verdes o con sangre, o no gana peso, consulta con el pediatra.</div></div>
        ${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => ({ cantidad: f.cantidad.value, proyectil: f.proyectil.value === '1', t: fromLocalInput(f.t.value), nota: f.nota.value.trim() });
      break;
    case 'extraccion':
      body = `<div class="field"><label>Cantidad (ml)</label><input class="input" name="ml" inputmode="numeric" value="${e.ml ?? ''}"></div>
        <div class="field"><label>Pecho</label>${pick('lado', e.lado || 'ambos', [['izq', 'Izq.'], ['der', 'Der.'], ['ambos', 'Ambos']])}</div>
        ${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => ({ ml: num(f.ml.value) || 0, lado: f.lado.value, t: fromLocalInput(f.t.value), nota: f.nota.value.trim() });
      break;
    case 'panal': {
      const kind = e.tipo ? (e.pis && e.caca ? 'ambos' : e.caca ? 'caca' : e.pis ? 'pis' : 'seco') : 'pis';
      body = `<div class="field">${pick('kind', kind, [['pis', 'Pis', '💧'], ['caca', 'Caca', '💩'], ['ambos', 'Ambos', '💧💩']])}
        <button type="button" class="link" data-pick="kind" data-v="seco" style="display:none"></button></div>
        <div class="field" id="color-f"><label>Color de la caca (opcional)</label><input type="hidden" name="color" value="${esc(e.color || '')}">
          <div class="chip-row">${COLORES.map(([v, l, c]) => `<button type="button" class="chip ${e.color === v ? 'on' : ''}" data-pick="color" data-v="${v}"><span class="swatch" style="background:${c}"></span>${l}</button>`).join('')}</div>
          <div class="hint hidden" id="color-hint">Caca blanca, gris o con sangre: coméntalo con el pediatra.</div></div>
        ${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => { const k = f.kind.value; const caca = k === 'caca' || k === 'ambos'; return { pis: k === 'pis' || k === 'ambos', caca, color: caca ? f.color.value : '', t: fromLocalInput(f.t.value), nota: f.nota.value.trim() }; };
      break;
    }
    case 'sueno':
      body = `${timeField(e.t || now - HOUR, 'Se durmió', 't', false)}${timeField(e.fin || now, 'Se despertó', 'fin', false)}${notaField(e.nota)}`;
      read = (f) => { const a = fromLocalInput(f.t.value), b = fromLocalInput(f.fin.value); if (!(b > a)) return toast('La hora de despertar debe ser posterior', true), false; return { t: a, fin: b, nota: f.nota.value.trim() }; };
      break;
    case 'medida':
      body = `<div class="field"><label>Peso (gramos)</label><input class="input" name="pesoG" inputmode="numeric" value="${e.pesoG ?? ''}" placeholder="p. ej. 3450"></div>
        <div class="grid2"><div class="field"><label>Longitud (cm)</label><input class="input" name="talla" inputmode="decimal" value="${e.talla ?? ''}"></div>
        <div class="field"><label>Perímetro cefálico (cm)</label><input class="input" name="cabeza" inputmode="decimal" value="${e.cabeza ?? ''}"></div></div>
        ${timeField(e.t || now, 'Fecha', 't', false)}${notaField(e.nota)}`;
      read = (f) => {
        let pesoG = num(f.pesoG.value);
        if (pesoG && pesoG < 30) pesoG = Math.round(pesoG * 1000); // si lo escriben en kg
        const r = { pesoG, talla: num(f.talla.value), cabeza: num(f.cabeza.value), t: fromLocalInput(f.t.value), nota: f.nota.value.trim() };
        if (!r.pesoG && !r.talla && !r.cabeza) return toast('Rellena al menos un dato', true), false;
        return r;
      };
      break;
    case 'medicacion': {
      const def = (S.baby?.medDiaria ?? 'Vitamina D') || '';
      body = `<div class="field"><label>Medicamento</label><input class="input" name="nombre" list="meds" value="${esc(e.nombre ?? def)}">
        <datalist id="meds"><option>Vitamina D</option><option>Paracetamol</option><option>Ibuprofeno</option><option>Suero fisiológico</option></datalist></div>
        <div class="field"><label>Dosis (opcional)</label><input class="input" name="dosis" value="${esc(e.dosis || '')}" placeholder="Según indicación del pediatra"></div>
        ${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => { if (!f.nombre.value.trim()) return toast('Indica el medicamento', true), false; return { nombre: f.nombre.value.trim(), dosis: f.dosis.value.trim(), t: fromLocalInput(f.t.value), nota: f.nota.value.trim() }; };
      break;
    }
    case 'temperatura':
      body = `<div class="field"><label>Temperatura (ºC)</label><input class="input" name="grados" inputmode="decimal" value="${e.grados ?? ''}" placeholder="36,8">
        <div class="hint hidden" id="temp-hint"></div></div>${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => { const g = num(f.grados.value); if (!g || g < 30 || g > 44) return toast('Temperatura no válida', true), false; return { grados: g, t: fromLocalInput(f.t.value), nota: f.nota.value.trim() }; };
      break;
    case 'nota':
      body = `<div class="field"><label>Nota</label><textarea class="input" name="texto" placeholder="Cualquier cosa que queráis recordar o comentar con el pediatra">${esc(e.texto || '')}</textarea></div>${timeField(e.t || now)}`;
      read = (f) => { if (!f.texto.value.trim()) return toast('Escribe algo', true), false; return { texto: f.texto.value.trim(), t: fromLocalInput(f.t.value) }; };
      break;
    case 'bano':
      body = `${timeField(e.t || now)}${notaField(e.nota)}`;
      read = (f) => ({ t: fromLocalInput(f.t.value), nota: f.nota.value.trim() });
      break;
  }

  const form = openSheet(ev ? `Editar · ${t.label}` : t.label, body, {
    icon: `<span class="qbtn" style="--c:${t.c};all:unset"><span style="display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:color-mix(in srgb, ${t.c} 20%, transparent)">${t.icon}</span></span>`,
    onSave: (f) => {
      const data = read(f);
      if (data === false) return false;
      if (!data.t || isNaN(data.t)) { toast('Revisa la fecha y hora', true); return false; }
      vibrate();
      if (ev) run(S.store.updateEvent(ev.id, data)).then(() => toast('Guardado'));
      else { addEv(({ tipo, autor: me(), ...data })); toast(`${t.label} registrado`); }
    },
    onDelete: ev ? () => { run(S.store.deleteEvent(ev.id)); toast('Eliminado'); } : null,
  });

  // Comportamiento dinámico
  const update = () => {
    if (tipo === 'panal') {
      const k = form.kind.value;
      $('#color-f', form).classList.toggle('hidden', !(k === 'caca' || k === 'ambos'));
      $('#color-hint', form).classList.toggle('hidden', !['blanca', 'roja'].includes(form.color.value));
    }
    if (tipo === 'regurgitacion') $('#rg-hint', form).classList.toggle('hidden', form.proyectil.value !== '1');
    if (tipo === 'temperatura') {
      const g = num(form.grados.value), hint = $('#temp-hint', form);
      const ageDays = S.baby?.nacimiento ? (Date.now() - S.baby.nacimiento) / DAY : 0;
      let msg = '';
      if (g >= 38 && ageDays < 90) msg = 'Fiebre (≥ 38 ºC) en un bebé de menos de 3 meses: llama al pediatra o acude a urgencias.';
      else if (g >= 38) msg = 'Tiene fiebre. Vigila su estado general y consulta con el pediatra si te preocupa.';
      else if (g && g < 36) msg = 'Temperatura baja: abrígale, vuelve a medir y consulta si se mantiene.';
      hint.textContent = msg;
      hint.classList.toggle('hidden', !msg);
    }
  };
  form.addEventListener('change', update);
  form.addEventListener('input', update);
  update();
}

function openMore() {
  const items = [['regurgitacion'], ['extraccion'], ['medida'], ['medicacion'], ['temperatura'], ['bano'], ['nota'], ['pecho', 'Pecho (a mano)'], ['sueno', 'Sueño (a mano)']];
  const body = `<div class="menu-list">${items.map(([k, l]) => `<button type="button" class="qbtn" style="--c:${T[k].c}" data-action="new" data-tipo="${k}"><span class="i">${T[k].icon}</span>${l || T[k].label}</button>`).join('')}</div>`;
  openSheet('Registrar', body);
}

// ---------------------------------------------------------------- acciones
const actions = {
  noop() {},
  tab: (b) => { S.tab = b.dataset.tab; window.scrollTo(0, 0); render(); },
  filtro: (b) => { S.filtro = b.dataset.f; render(); },
  rango: (b) => { S.rango = b.dataset.r; render(); },
  medida: (b) => { S.medida = b.dataset.m; render(); },
  more: () => openMore(),
  'close-sheet': () => closeSheet(),
  new: (b) => { closeSheet(); openEventForm(b.dataset.tipo); },
  edit: (b) => {
    const id = b.dataset.id;
    const ev = S.events.find((e) => e.id === id) || S.measures.find((e) => e.id === id);
    if (ev) openEventForm(ev.tipo, ev);
  },
  'daily-med': () => {
    const nombre = (S.baby?.medDiaria ?? 'Vitamina D').trim();
    vibrate();
    addEv(({ tipo: 'medicacion', nombre, dosis: '', t: Date.now(), autor: me() }));
    toast(`${nombre} marcada`);
  },

  'pecho-start': (b) => {
    vibrate();
    const now = Date.now();
    run(S.store.saveState({ pecho: { inicio: now, lado: b.dataset.lado, primero: b.dataset.lado, acumIzq: 0, acumDer: 0, desde: now, autor: me() } }));
  },
  'pecho-side': (b) => {
    const p = S.active.pecho; if (!p) return;
    const lado = b.dataset.lado;
    if (p.desde && p.lado === lado) return;
    vibrate();
    const now = Date.now(), t = pechoTimes(p, now);
    run(S.store.saveState({ pecho: { ...p, acumIzq: t.izq, acumDer: t.der, lado, desde: now } }));
  },
  'pecho-pause': () => {
    const p = S.active.pecho; if (!p) return;
    vibrate();
    const now = Date.now(), t = pechoTimes(p, now);
    run(S.store.saveState({ pecho: { ...p, acumIzq: t.izq, acumDer: t.der, desde: p.desde ? null : now } }));
  },
  'pecho-finish': () => {
    const p = S.active.pecho; if (!p) return;
    vibrate();
    const now = Date.now(), t = pechoTimes(p, now);
    if (t.total < 5000) { run(S.store.saveState({ pecho: null })); return; }
    const lado = t.izq && t.der ? p.lado : t.izq ? 'izq' : 'der';
    addEv(({ tipo: 'pecho', t: p.inicio, fin: now, segIzq: Math.round(t.izq), segDer: Math.round(t.der), lado, primero: p.primero || p.lado, autor: me() }));
    run(S.store.saveState({ pecho: null }));
    toast(`Toma guardada · ${fmtDur(t.total)}`);
  },
  'pecho-cancel': () => { if (confirm('¿Descartar esta toma sin guardarla?')) run(S.store.saveState({ pecho: null })); },
  'sueno-start': () => { vibrate(); run(S.store.saveState({ sueno: { inicio: Date.now(), autor: me() } })); },
  'sueno-finish': () => {
    const s = S.active.sueno; if (!s) return;
    vibrate();
    const now = Date.now();
    addEv(({ tipo: 'sueno', t: s.inicio, fin: now, autor: me() }));
    run(S.store.saveState({ sueno: null }));
    toast(`Sueño guardado · ${fmtDur(now - s.inicio)}`);
  },
  'sueno-cancel': () => { if (confirm('¿Descartar este sueño?')) run(S.store.saveState({ sueno: null })); },

  'pick-sexo': (b) => { document.querySelectorAll('[data-action="pick-sexo"]').forEach((x) => x.classList.toggle('on', x === b)); S._sexo = b.dataset.v; },
  'save-baby': () => {
    const nombre = $('#s-nombre').value.trim();
    const nac = fromLocalInput($('#s-nac').value);
    const data = { nombre, medDiaria: $('#s-med').value.trim() };
    if (!isNaN(nac)) data.nacimiento = nac;
    const sexo = S._sexo || S.baby?.sexo;
    if (sexo) data.sexo = sexo;
    document.activeElement?.blur();
    run(S.store.saveBaby(data)).then(() => toast('Guardado'));
    S._sexo = null;
  },
  export: () => exportCsv(),
  'regurg-quick': () => {
    vibrate();
    addEv({ tipo: 'regurgitacion', cantidad: 'poca', proyectil: false, t: Date.now(), autor: me() });
    toast('Regurgitación registrada · toca el registro para detallar');
  },
  'voice-toggle': () => {
    if (!voice) return;
    if (voice.enabled) { voice.disable(); toast('Escucha desactivada'); }
    else if (voice.enable()) toast(`Di “${voicePrefs().wake}” y la orden`);
  },
  'voice-once': () => { if (voice) voice.listenOnce(); },
  'voice-help': () => openSheet('Órdenes de voz', voiceHelp()),
  'pick-auto': (b) => { document.querySelectorAll('[data-action="pick-auto"]').forEach((x) => x.classList.toggle('on', x === b)); },
  'save-voice': () => {
    const wake = norm($('#s-wake').value) || 'oye monitor';
    const auto = $('[data-action="pick-auto"].on')?.dataset.v === '1';
    saveVoicePrefs({ wake, auto });
    document.activeElement?.blur();
    toast('Guardado');
  },
  logout: () => { if (confirm('¿Cerrar sesión en este móvil?')) S.store.logout(); },
  'reset-pass': async () => {
    const email = $('#login-form').email.value.trim();
    if (!email) return showLoginErr('Escribe tu email arriba y vuelve a pulsar.');
    try { await S.store.reset(email); showLoginErr('Te hemos enviado un email para cambiar la contraseña.', true); } catch (e) { showLoginErr(AUTH_ERR[e.code] || e.message); }
  },
};

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const fn = actions[b.dataset.action];
  if (fn) { ev.preventDefault(); fn(b); }
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });

document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'login-form') return;
  ev.preventDefault();
  const f = ev.target, mode = ev.submitter?.dataset.mode || 'login';
  const email = f.email.value.trim(), pass = f.pass.value;
  if (!email || pass.length < 6) return showLoginErr('Escribe tu email y una contraseña de al menos 6 caracteres.');
  S.loginMsg = null;
  f.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try { await (mode === 'register' ? S.store.register(email, pass) : S.store.login(email, pass)); }
  catch (e) { showLoginErr(AUTH_ERR[e.code] || e.message); f.querySelectorAll('button').forEach((b) => (b.disabled = false)); }
});
function showLoginErr(msg, ok) { const el = $('#login-err'); if (el) el.innerHTML = `<div class="banner ${ok ? 'info' : 'err'}">${esc(msg)}</div>`; }

let toastTimer;
function toast(msg, err) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

async function exportCsv() {
  toast('Preparando exportación…');
  try {
    const all = await S.store.allEvents();
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['fecha', 'hora', 'tipo', 'detalle', 'duracion_min', 'izq_min', 'der_min', 'ml', 'peso_g', 'longitud_cm', 'perimetro_cm', 'temperatura', 'nota', 'autor']];
    for (const e of all) {
      const d = new Date(e.t);
      const dur = e.fin ? Math.round((e.fin - e.t) / MIN) : '';
      rows.push([`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, fmtTime(e.t), T[e.tipo]?.label || e.tipo, describe(e), dur,
        e.segIzq ? Math.round(e.segIzq / MIN) : '', e.segDer ? Math.round(e.segDer / MIN) : '', e.ml ?? '', e.pesoG ?? '', e.talla ?? '', e.cabeza ?? '', e.grados ?? '', e.tipo === 'nota' ? e.texto : e.nota || '', e.autor || '']);
    }
    const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
    const name = `bebe-${new Date().toISOString().slice(0, 10)}.csv`;
    const file = new File([csv], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { if (e.name !== 'AbortError') toast('No se pudo exportar: ' + e.message, true); }
}

// ---------------------------------------------------------------- voz
function pickPlain(id, value, opts) {
  return `<div class="grid${opts.length}">${opts.map(([v, l]) => `<button type="button" class="opt ${String(value) === v ? 'on' : ''}" data-action="pick-auto" data-v="${v}">${l}</button>`).join('')}</div>`;
}
const VPREFS = 'monitor-bebe-voz';
function voicePrefs() {
  try { return { wake: 'oye monitor', auto: false, ...(JSON.parse(localStorage.getItem(VPREFS)) || {}) }; } catch { return { wake: 'oye monitor', auto: false }; }
}
function saveVoicePrefs(p) { try { localStorage.setItem(VPREFS, JSON.stringify(p)); } catch {} }

function voiceHelp() {
  const w = esc(voicePrefs().wake);
  const g = (title, items) => `<div class="lbl" style="margin-top:14px">${title}</div><div class="card" style="padding:6px 14px;margin:0">${items.map((x) => `<div class="kv"><span>“${x}”</span></div>`).join('')}</div>`;
  return `<p class="muted" style="margin-top:-6px">Di <b>“${w}”</b> seguido de la orden, o di “${w}”, espera el pitido y di la orden. Con el botón 🎙️ Voz no hace falta la palabra clave.</p>
    ${g('Tomas', ['empieza pecho izquierdo', 'cambia de pecho', 'pausa / sigue', 'termina la toma', 'biberón de 60', 'biberón de 90 de leche materna'])}
    ${g('Pañales y regurgitaciones', ['pañal de pis', 'pañal de caca', 'pañal de pis y caca', 'ha regurgitado un poco', 'ha vomitado mucho'])}
    ${g('Sueño y otros', ['se ha dormido', 'se ha despertado', 'vitamina D dada', 'deshaz (borra lo último)'])}
    ${g('Preguntas', ['¿cuándo comió?', '¿qué pecho le toca?', '¿cuánto lleva?', '¿cuándo fue el último pañal?', 'resumen del día'])}`;
}

const spokenDur = (ms) => {
  const m = Math.round(Math.max(0, ms) / MIN);
  if (m < 1) return 'menos de un minuto';
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} ${h === 1 ? 'hora' : 'horas'}${r ? ` y ${r} ${r === 1 ? 'minuto' : 'minutos'}` : ''}`;
};
function sugeridoPecho() {
  const lp = S.events.find((e) => e.tipo === 'pecho');
  if (!lp) return null;
  return lp.primero === 'izq' ? 'der' : lp.primero === 'der' ? 'izq' : lp.lado === 'izq' ? 'der' : 'izq';
}

function handleIntent(it, v) {
  const say = (t) => v.speak(t);
  if (it.type === 'med-tomada' || it.type === 'q-med') return handleMedIntent(it, v);
  const now = Date.now();
  const p = S.active.pecho, sl = S.active.sueno;
  const ladoTxt = (l) => LADO[l].toLowerCase();
  switch (it.type) {
    case 'pecho-inicio': {
      if (p) {
        if (it.lado && it.lado !== p.lado) { actions['pecho-side']({ dataset: { lado: it.lado } }); return say(`Cambio al ${ladoTxt(it.lado)}`); }
        return say('Ya hay una toma en curso');
      }
      const l = it.lado || sugeridoPecho() || 'izq';
      actions['pecho-start']({ dataset: { lado: l } });
      return say(`Toma empezada, pecho ${ladoTxt(l)}`);
    }
    case 'pecho-cambiar': {
      if (!p) return say('No hay ninguna toma en curso');
      const l = it.lado || (p.lado === 'izq' ? 'der' : 'izq');
      actions['pecho-side']({ dataset: { lado: l } });
      return say(`Cambio al ${ladoTxt(l)}`);
    }
    case 'pecho-pausa':
      if (!p || !p.desde) return say('No hay ninguna toma corriendo');
      actions['pecho-pause'](); return say('Toma en pausa');
    case 'pecho-seguir':
      if (!p) return say('No hay ninguna toma en curso');
      if (p.desde) return say('La toma ya está en marcha');
      actions['pecho-pause'](); return say('Sigo con la toma');
    case 'pecho-terminar': {
      if (!p) return say('No hay ninguna toma en curso');
      const t = pechoTimes(p);
      actions['pecho-finish']();
      return say(t.total < 5000 ? 'Toma descartada, duraba menos de cinco segundos' : `Toma guardada: ${spokenDur(t.total)}`);
    }
    case 'biberon':
      addEv({ tipo: 'biberon', ml: it.ml, leche: it.leche, t: now, autor: me() });
      return say(`Biberón de ${it.ml} mililitros apuntado`);
    case 'biberon-pregunta':
      return v.ask('¿Cuántos mililitros?', (txt) => {
        const ml = findNumber(norm(txt));
        if (ml) handleIntent({ type: 'biberon', ml, leche: it.leche }, v); else say('No te he entendido');
      });
    case 'panal':
      addEv({ tipo: 'panal', pis: it.pis, caca: it.caca, color: '', t: now, autor: me() });
      return say(`Pañal apuntado: ${it.pis && it.caca ? 'pis y caca' : it.caca ? 'caca' : 'pis'}`);
    case 'panal-pregunta':
      return v.ask('¿Pis, caca o las dos?', (txt) => {
        const r = parseCommand('pañal ' + txt);
        if (r && r.type === 'panal') handleIntent(r, v); else say('No te he entendido');
      });
    case 'regurgitacion': {
      const g = trasToma(now);
      addEv({ tipo: 'regurgitacion', cantidad: it.cantidad, proyectil: it.proyectil, t: now, autor: me() });
      return say(`Regurgitación apuntada${g != null ? `, ${spokenDur(g)} después de la toma` : ''}`);
    }
    case 'sueno-inicio':
      if (sl) return say('Ya consta que está durmiendo');
      actions['sueno-start'](); return say('Sueño empezado. Que descanse');
    case 'sueno-fin': {
      if (!sl) return say('No había ningún sueño en marcha');
      const d = now - sl.inicio;
      actions['sueno-finish'](); return say(`Ha dormido ${spokenDur(d)}`);
    }
    case 'vitamina': {
      const med = (S.baby?.medDiaria ?? 'Vitamina D').trim() || 'Vitamina D';
      const d0 = dayStart(now);
      if (S.events.find((e) => e.tipo === 'medicacion' && e.t >= d0 && (e.nombre || '').toLowerCase() === med.toLowerCase())) return say(`La ${med} ya estaba apuntada hoy`);
      actions['daily-med'](); return say(`${med} apuntada`);
    }
    case 'deshacer': {
      const la = S.lastAdded;
      if (!la) return say('No hay nada que deshacer');
      run(S.store.deleteEvent(la.id)); S.lastAdded = null;
      return say(`Borrado: ${T[la.tipo]?.label || 'registro'}`);
    }
    case 'q-toma': {
      if (p) return say(`Está comiendo ahora, lleva ${spokenDur(pechoTimes(p).total)}`);
      const f = S.events.find((e) => e.tipo === 'pecho' || e.tipo === 'biberon');
      if (!f) return say('Todavía no hay tomas apuntadas');
      return say(`La última toma fue hace ${spokenDur(now - f.t)}, a las ${fmtTime(f.t)}${f.tipo === 'biberon' ? `, biberón de ${f.ml} mililitros` : `, terminó en el ${ladoTxt(f.lado || 'izq')}`}`);
    }
    case 'q-pecho': {
      const sg = sugeridoPecho();
      return say(sg ? `Le toca el ${ladoTxt(sg)}` : 'Aún no hay tomas de pecho apuntadas');
    }
    case 'q-duracion':
      if (p) return say(`La toma lleva ${spokenDur(pechoTimes(p).total)}`);
      if (sl) return say(`Lleva dormido ${spokenDur(now - sl.inicio)}`);
      return say('Ahora mismo no hay nada en marcha');
    case 'q-panal': {
      const e = S.events.find((x) => x.tipo === 'panal');
      return say(e ? `El último pañal fue hace ${spokenDur(now - e.t)}: ${describe(e).toLowerCase()}` : 'Todavía no hay pañales apuntados');
    }
    case 'q-sueno': {
      if (sl) return say(`Lleva dormido ${spokenDur(now - sl.inicio)}`);
      const e = S.events.find((x) => x.tipo === 'sueno' && x.fin);
      return say(e ? `Se despertó hace ${spokenDur(now - e.fin)}, después de dormir ${spokenDur(e.fin - e.t)}` : 'Todavía no hay sueños apuntados');
    }
    case 'q-regurgitacion': {
      const e = S.events.find((x) => x.tipo === 'regurgitacion');
      return say(e ? `La última regurgitación fue hace ${spokenDur(now - e.t)}` : 'No hay regurgitaciones apuntadas');
    }
    case 'q-resumen': {
      const st = stats(dayStart(now), now);
      return say(`Hoy lleva ${st.tomas} ${st.tomas === 1 ? 'toma' : 'tomas'}, ${st.pis} pis, ${st.caca} ${st.caca === 1 ? 'caca' : 'cacas'}${st.regurg ? `, ${st.regurg} ${st.regurg === 1 ? 'regurgitación' : 'regurgitaciones'}` : ''} y ${spokenDur(st.sueno)} de sueño`);
    }
    default:
      return say('No te he entendido');
  }
}

const voiceOv = document.createElement('div');
voiceOv.className = 'voice-ov hidden';
document.body.appendChild(voiceOv);
let ovTimer;
const voice = voiceSupported ? createVoice({
  getWakeWord: () => voicePrefs().wake,
  onIntent: (it, v) => { if (!S.user || S.access !== 'ok') return v.speak('Primero inicia sesión'); handleIntent(it, v); },
  onState: (st) => {
    S.voice = st;
    const m = $('.mic');
    if (m) m.className = 'mic' + (st.enabled ? ' on' : '') + (st.state === 'escuchando' ? ' hot' : '');
    clearTimeout(ovTimer);
    if (st.state === 'escuchando' || st.state === 'procesando') {
      voiceOv.innerHTML = `<span class="pulse" style="--c:var(--accent)"></span><b>${st.state === 'escuchando' ? 'Te escucho…' : 'Entendido'}</b>${st.texto ? `<div class="vt">“${esc(st.texto)}”</div>` : ''}`;
      voiceOv.classList.remove('hidden');
      ovTimer = setTimeout(() => voiceOv.classList.add('hidden'), 9000);
    } else if (st.state === 'error') {
      voiceOv.innerHTML = `<b>🎙️ ${esc(st.error)}</b>`;
      voiceOv.classList.remove('hidden');
      ovTimer = setTimeout(() => voiceOv.classList.add('hidden'), 6000);
    } else voiceOv.classList.add('hidden');
  },
}) : null;
if (voice && voicePrefs().auto) setTimeout(() => { if (S.user) voice.enable(); }, 1500);
window.addEventListener('store-error', (e) => fail(e.detail));

// ---------------------------------------------------------------- medicación
const medLogs = (pl) => S.events.filter((e) => e.tipo === 'medicacion' && e.planId === pl.id);
const statusOf = (pl, now = Date.now()) => planStatus(pl, medLogs(pl), now);
const enTiempo = (t, now = Date.now()) => (t >= now ? `en ${fmtDur(t - now)}` : `hace ${fmtDur(now - t)}`);
const horaDia = (t) => (dayStart(t) === dayStart(Date.now()) ? `a las ${fmtTime(t)}` : `${dayLabel(t).toLowerCase()} a las ${fmtTime(t)}`);

function medStatusLine(st, now = Date.now()) {
  if (st.estado === 'toca') return `<span style="color:var(--warn)">⏰ Tocaba ${horaDia(st.proxima)} (${enTiempo(st.proxima, now)})</span>${st.perdidas ? ` <span class="faint">· ${st.perdidas} anterior${st.perdidas > 1 ? 'es' : ''} sin marcar</span>` : ''}`;
  if (st.estado === 'pendiente') return `Próxima: <b>${horaDia(st.proxima)}</b> <span class="faint">(${enTiempo(st.proxima, now)})</span>`;
  if (st.estado === 'pausada') return '<span class="faint">En pausa</span>';
  if (st.estado === 'terminada') return '<span class="faint">Tratamiento terminado</span>';
  return '<span class="faint">Sin dosis próximas</span>';
}

function medRow(pl, compact) {
  const st = statusOf(pl);
  const can = st.estado === 'toca' || st.estado === 'pendiente';
  return `<div class="med ${st.estado === 'toca' ? 'due' : ''}">
    <button class="med-main" data-action="med-edit" data-id="${esc(pl.id)}">
      <span class="who-tag ${pl.persona}">${PERSONAS[pl.persona] || ''}</span>
      <div class="t1">${esc(pl.nombre)}${pl.dosis ? ` <span class="muted" style="font-weight:400">· ${esc(pl.dosis)}</span>` : ''}</div>
      ${compact ? '' : `<div class="t2">${esc(describePlan(pl))}</div>`}
      <div class="t2">${medStatusLine(st)}</div>
    </button>
    ${can ? `<div class="med-btns">
      <button class="btn ${st.estado === 'toca' ? 'c' : ''}" style="--c:var(--ok)" data-action="med-take" data-id="${esc(pl.id)}">✓ Tomada</button>
      ${compact ? '' : `<button class="btn" data-action="med-skip" data-id="${esc(pl.id)}">Saltar</button>`}
    </div>` : ''}
  </div>`;
}

function homeMeds() {
  const now = Date.now();
  const rows = S.plans.filter((pl) => pl.activo !== false)
    .map((pl) => ({ pl, st: statusOf(pl, now) }))
    .filter(({ st }) => st.estado === 'toca' || (st.estado === 'pendiente' && st.proxima - now < 12 * HOUR))
    .sort((a, b) => a.st.proxima - b.st.proxima)
    .slice(0, 4);
  if (!rows.length) return '';
  return `<div class="section-title">Medicación <button data-action="tab" data-tab="medicinas">Ver todo</button></div>
    <div class="card" style="padding:4px 12px">${rows.map(({ pl }) => medRow(pl, true)).join('')}</div>`;
}

function notifState() {
  if (!('Notification' in window)) return 'no';
  return Notification.permission;
}

function viewMeds() {
  const ns = notifState();
  let h = '';
  if (ns === 'default') h += `<div class="banner info">Activa los avisos para que el móvil te avise cuando toque cada medicamento.<button class="btn primary block" style="margin-top:10px" data-action="notif-enable">🔔 Activar avisos</button></div>`;
  else if (ns === 'denied') h += `<div class="banner warn">Los avisos están bloqueados para esta web. Actívalos en los ajustes del navegador (permisos del sitio → Notificaciones).</div>`;
  else if (ns === 'no') h += `<div class="banner warn">Este navegador no permite notificaciones. En iPhone hay que instalar la app en la pantalla de inicio. Puedes usar “Añadir al calendario” en cada medicamento.</div>`;

  for (const who of ['mama', 'bebe']) {
    const list = S.plans.filter((pl) => pl.persona === who).sort((a, b) => (a.activo === false) - (b.activo === false) || a.nombre.localeCompare(b.nombre));
    h += `<div class="section-title">${who === 'mama' ? '👩 Mamá' : '👶 Bebé'}</div>`;
    h += list.length ? `<div class="card" style="padding:4px 12px">${list.map((pl) => medRow(pl)).join('')}</div>`
      : `<div class="card empty" style="padding:18px">Sin medicamentos</div>`;
  }
  h += `<button class="btn primary block" data-action="med-new">＋ Añadir medicamento</button>`;

  const recent = S.events.filter((e) => e.tipo === 'medicacion').slice(0, 10);
  if (recent.length) h += `<div class="section-title">Últimas tomas</div><div class="card" style="padding:4px 12px">${recent.map((e) => evRow(e).replace(fmtTime(e.t) + '<', `${shortDay(e.t)}<br><span class="faint">${fmtTime(e.t)}</span><`)).join('')}</div>`;

  h += `<p class="faint" style="font-size:13px;text-align:center;margin-top:16px">Los avisos saltan con la app abierta o recién usada. Para alarmas con el móvil bloqueado, usa “Añadir al calendario” en cada medicamento.</p>`;
  if (ns === 'granted') h += `<button class="link" data-action="notif-test">Probar aviso</button>`;
  return h;
}

function openPlanForm(pl) {
  const e = pl || {};
  const now = Date.now();
  const r = new Date(now); r.setMinutes(Math.round(r.getMinutes() / 5) * 5, 0, 0);
  const modo = e.modo || 'intervalo';
  const body = `
    <div class="field"><label>Para</label>${pick('persona', e.persona || 'mama', [['mama', 'Mamá', '👩'], ['bebe', 'Bebé', '👶']])}</div>
    <div class="field"><label>Medicamento</label><input class="input" name="nombre" list="meds-list" value="${esc(e.nombre || '')}" placeholder="p. ej. Paracetamol">
      <datalist id="meds-list">${['Paracetamol', 'Ibuprofeno', 'Hierro', 'Enoxaparina (Clexane)', 'Omeprazol', 'Vitamina D', 'Antibiótico', 'Metamizol (Nolotil)'].map((x) => `<option>${x}</option>`).join('')}</datalist></div>
    <div class="field"><label>Dosis (opcional)</label><input class="input" name="dosis" value="${esc(e.dosis || '')}" placeholder="p. ej. 1 g, 1 comprimido, 2 gotas"></div>
    <div class="field"><label>Frecuencia</label>${pick('modo', modo, [['intervalo', 'Cada X horas'], ['horas', 'A horas fijas']])}</div>
    <div id="f-intervalo" class="${modo === 'horas' ? 'hidden' : ''}">
      <div class="field"><label>Cada cuántas horas</label><input class="input" name="cadaH" inputmode="decimal" value="${e.cadaH ?? 8}">
        <div class="chip-row" style="margin-top:8px">${[4, 6, 8, 12, 24].map((v) => `<button type="button" class="chip" data-fill="cadaH" data-v="${v}">${v} h</button>`).join('')}</div></div>
      ${timeField(e.inicio || r.getTime(), 'Primera toma', 'inicio', false)}
      <div class="field"><label>Las siguientes se cuentan…</label>${pick('desdeToma', e.desdeToma ? '1' : '0', [['0', 'Horario fijo'], ['1', 'Desde la toma real']])}
        <div class="faint" style="font-size:12px;margin-top:6px">Horario fijo: como en el hospital (6, 14, 22 h). Desde la toma real: si se retrasa, la siguiente también.</div></div>
    </div>
    <div id="f-horas" class="${modo === 'horas' ? '' : 'hidden'}">
      <div class="field"><label>Horas (separadas por comas)</label><input class="input" name="horas" value="${esc((e.horas || ['09:00', '21:00']).join(', '))}" placeholder="9:00, 21:00"></div>
      <div class="field"><label>Empieza</label><input class="input" type="date" name="desde" value="${toLocalInput(e.inicio || now).slice(0, 10)}"></div>
    </div>
    <div class="field"><label>Duración en días (vacío = sin fin)</label><input class="input" name="dias" inputmode="numeric" value="${e.dias ?? ''}" placeholder="Sin fin">
      <div class="chip-row" style="margin-top:8px">${[3, 5, 7, 10, 14, 30].map((v) => `<button type="button" class="chip" data-fill="dias" data-v="${v}">${v} días</button>`).join('')}</div></div>
    <div class="field"><label>Notas (opcional)</label><input class="input" name="notas" value="${esc(e.notas || '')}" placeholder="p. ej. con comida, máximo 3 al día"></div>
    ${pl ? '' : `<div class="field"><label>Si la última dosis ya pasó, ¿ya se la ha tomado?</label>${pick('yaTomada', '1', [['1', 'Sí, ya tomada'], ['0', 'No, avísame']])}</div>`}
    ${pl ? `<div class="field"><label>Estado</label>${pick('activo', e.activo === false ? '0' : '1', [['1', 'Activo'], ['0', 'En pausa']])}</div>
      <button type="button" class="btn block" style="margin-bottom:12px" data-action="med-ics" data-id="${esc(pl.id)}">📅 Añadir alarmas al calendario</button>` : ''}`;

  const form = openSheet(pl ? 'Editar medicamento' : 'Nuevo medicamento', body, {
    icon: '<span style="font-size:26px">💊</span>',
    onSave: (f) => {
      const nombre = f.nombre.value.trim();
      if (!nombre) return toast('Indica el medicamento', true), false;
      const plan = { persona: f.persona.value, nombre, dosis: f.dosis.value.trim(), modo: f.modo.value, notas: f.notas.value.trim(),
        dias: num(f.dias.value) || null, activo: pl ? f.activo.value === '1' : true, actualizado: Date.now(), autor: me() };
      if (plan.modo === 'horas') {
        plan.horas = parseHoras(f.horas.value);
        if (!plan.horas.length) return toast('Escribe al menos una hora, p. ej. 9:00', true), false;
        const d = f.desde.value ? new Date(f.desde.value + 'T00:00') : new Date();
        d.setHours(0, 0, 0, 0); plan.inicio = d.getTime();
        plan.cadaH = null; plan.desdeToma = false;
      } else {
        plan.cadaH = num(f.cadaH.value);
        if (!plan.cadaH || plan.cadaH < 0.5 || plan.cadaH > 168) return toast('Indica cada cuántas horas', true), false;
        plan.inicio = fromLocalInput(f.inicio.value);
        if (isNaN(plan.inicio)) return toast('Revisa la hora de la primera toma', true), false;
        plan.desdeToma = f.desdeToma.value === '1';
        plan.horas = null;
      }
      if (pl) plan.id = pl.id;
      S.quietUntil = Date.now() + 4000;
      run(S.store.savePlan(plan)).then((res) => {
        toast(pl ? 'Guardado' : `${nombre} añadido`);
        if (!pl && res && res.id && f.yaTomada.value === '1') {
          const st = planStatus({ ...plan, id: res.id }, [], Date.now());
          if (st.estado === 'toca') addEv({ tipo: 'medicacion', planId: res.id, nombre, dosis: plan.dosis, persona: plan.persona, estado: 'tomada', programada: st.proxima, t: st.proxima, autor: me() });
        }
      });
      if (!pl && notifState() === 'default') setTimeout(() => actions['notif-enable'](), 600);
    },
    onDelete: pl ? () => { run(S.store.deletePlan(pl.id)); toast('Medicamento eliminado'); } : null,
  });
  form.addEventListener('change', () => {
    const h = form.modo.value === 'horas';
    $('#f-intervalo', form).classList.toggle('hidden', h);
    $('#f-horas', form).classList.toggle('hidden', !h);
  });
}

function logDose(pl, estado) {
  const st = statusOf(pl);
  const now = Date.now();
  const programada = st.proxima && (st.estado === 'toca' || st.proxima - now < 3 * HOUR) ? st.proxima : now;
  vibrate();
  addEv({ tipo: 'medicacion', planId: pl.id, nombre: pl.nombre, dosis: pl.dosis || '', persona: pl.persona, estado, programada, t: now, autor: me() });
  clearAlertFor(pl.id);
}

Object.assign(actions, {
  'med-new': () => openPlanForm(),
  'med-edit': (b) => { const pl = S.plans.find((x) => x.id === b.dataset.id); if (pl) openPlanForm(pl); },
  'med-take': (b) => {
    const pl = S.plans.find((x) => x.id === b.dataset.id); if (!pl) return;
    logDose(pl, 'tomada'); toast(`${pl.nombre} · tomada`); refreshMedAlert();
  },
  'med-skip': (b) => {
    const pl = S.plans.find((x) => x.id === b.dataset.id); if (!pl) return;
    if (!confirm(`¿Saltar esta dosis de ${pl.nombre}?`)) return;
    logDose(pl, 'saltada'); toast('Dosis saltada'); refreshMedAlert();
  },
  'med-snooze': (b) => {
    const key = b.dataset.key;
    const sn = loadJson(SNOOZE_KEY, {}); sn[key] = Date.now() + 15 * MIN; saveJson(SNOOZE_KEY, sn);
    const al = loadJson(ALERT_KEY, []); saveJson(ALERT_KEY, al.filter((k) => k !== key));
    toast('Te aviso en 15 minutos'); refreshMedAlert();
  },
  'med-ics': async (b) => {
    const pl = S.plans.find((x) => x.id === b.dataset.id); if (!pl) return;
    const { text, count, hasta } = planIcs(pl);
    if (!count) return toast('No hay dosis próximas que añadir', true);
    const name = `${norm(pl.nombre).replace(/\s+/g, '-') || 'medicamento'}.ics`;
    const file = new File([text], name, { type: 'text/calendar' });
    toast(`${count} alarmas hasta el ${new Date(hasta).getDate()}/${new Date(hasta).getMonth() + 1}`);
    try {
      if (/iPhone|iPad/.test(navigator.userAgent)) { location.href = URL.createObjectURL(file); return; }
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  },
  'notif-enable': async () => {
    if (!('Notification' in window)) return toast('Este navegador no admite avisos', true);
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Avisos activados' : 'No se han activado los avisos', r !== 'granted');
    render();
  },
  'notif-test': () => { notify('💊 Prueba de aviso', 'Así te avisaré cuando toque un medicamento.', 'test'); alarmSound(); },
});

function refreshMedAlert() { const r = $('#sheet-root'); if (r && r.dataset.kind === 'med-alert') setTimeout(showMedAlert, 150); }
function closeSheetIf(kind) { const r = $('#sheet-root'); if (r && r.dataset.kind === kind) closeSheet(); }

// ---- avisos
const ALERT_KEY = 'monitor-bebe-avisos', SNOOZE_KEY = 'monitor-bebe-pospuestos';
function loadJson(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function saveJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function clearAlertFor(planId) {
  const sn = loadJson(SNOOZE_KEY, {});
  for (const k of Object.keys(sn)) if (k.startsWith(planId + ':')) delete sn[k];
  saveJson(SNOOZE_KEY, sn);
}

async function notify(title, body, tag) {
  if (notifState() !== 'granted') return;
  const opts = { body, tag, renotify: true, requireInteraction: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [300, 150, 300, 150, 600] };
  try {
    const reg = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
    if (reg) return reg.showNotification(title, opts);
    new Notification(title, opts);
  } catch {}
}

function alarmSound() {
  try {
    const ctx = alarmSound.ctx || (alarmSound.ctx = new (window.AudioContext || window.webkitAudioContext)());
    [0, 0.35, 0.7].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 988; o.type = 'triangle';
      const t0 = ctx.currentTime + d;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.3);
    });
  } catch {}
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 600]); } catch {}
}

function dueAlerts(now = Date.now()) {
  const sn = loadJson(SNOOZE_KEY, {});
  return S.plans.map((pl) => ({ pl, st: statusOf(pl, now) }))
    .filter(({ st }) => st.estado === 'toca' && now - st.proxima <= 6 * HOUR)
    .map((x) => ({ ...x, key: `${x.pl.id}:${x.st.proxima}` }))
    .filter((x) => !(sn[x.key] && sn[x.key] > now));
}

function checkMedAlerts() {
  if (!S.user || S.access !== 'ok' || !S.plans.length) return;
  if (S.quietUntil && Date.now() < S.quietUntil) { setTimeout(checkMedAlerts, S.quietUntil - Date.now() + 50); return; }
  const alerted = loadJson(ALERT_KEY, []);
  const due = dueAlerts();
  const fresh = due.filter((x) => !alerted.includes(x.key));
  if (!fresh.length) return;
  saveJson(ALERT_KEY, alerted.concat(fresh.map((x) => x.key)).slice(-300));
  for (const { pl, st } of fresh) {
    const quien = pl.persona === 'mama' ? 'Mamá' : S.baby?.nombre || 'Bebé';
    notify(`💊 ${pl.nombre}${pl.dosis ? ' · ' + pl.dosis : ''}`, `${quien}: tocaba a las ${fmtTime(st.proxima)}`, `med-${pl.id}`);
  }
  alarmSound();
  showMedAlert();
}

function showMedAlert() {
  if (document.hidden) return;
  const cur = $('#sheet-root');
  if (cur && cur.dataset.kind !== 'med-alert') return; // no interrumpir un formulario
  const due = dueAlerts();
  if (!due.length) { closeSheetIf('med-alert'); return; }
  const rows = due.map(({ pl, st, key }) => {
    const quien = pl.persona === 'mama' ? 'Mamá' : S.baby?.nombre || 'Bebé';
    return `<div class="card">
      <span class="who-tag ${pl.persona}">${esc(quien)}</span>
      <div style="font-size:19px;font-weight:700;margin-top:6px">${esc(pl.nombre)}${pl.dosis ? ` <span class="muted" style="font-weight:400">· ${esc(pl.dosis)}</span>` : ''}</div>
      <div class="muted" style="margin-top:2px">Tocaba a las ${fmtTime(st.proxima)} (${enTiempo(st.proxima)})</div>
      ${pl.notas ? `<div class="hint" style="margin-top:10px">${esc(pl.notas)}</div>` : ''}
      <button type="button" class="btn c block" style="--c:var(--ok);margin-top:12px;padding:15px;font-size:17px" data-action="med-take" data-id="${esc(pl.id)}">✓ Tomada</button>
      <div class="grid2" style="margin-top:8px"><button type="button" class="btn" data-action="med-snooze" data-key="${esc(key)}">⏰ +15 min</button><button type="button" class="btn" data-action="med-skip" data-id="${esc(pl.id)}">Saltar</button></div>
    </div>`;
  }).join('');
  openSheet(due.length > 1 ? `Tocan ${due.length} medicamentos` : 'Toca medicamento', rows, { icon: '<span style="font-size:24px">💊</span>' });
  const r = $('#sheet-root'); if (r) r.dataset.kind = 'med-alert';
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkMedAlerts(); });

function handleMedIntent(it, v) {
  const say = (t) => v.speak(t);
  const now = Date.now();
  const activos = S.plans.filter((pl) => pl.activo !== false);
  if (it.type === 'q-med') {
    const rows = activos.map((pl) => ({ pl, st: statusOf(pl, now) })).filter((x) => x.st.proxima).sort((a, b) => a.st.proxima - b.st.proxima);
    if (!rows.length) return say('No hay medicamentos pendientes');
    const toca = rows.filter((x) => x.st.estado === 'toca');
    if (toca.length) return say(`Toca ahora: ${toca.map((x) => `${x.pl.nombre} para ${x.pl.persona === 'mama' ? 'mamá' : 'el bebé'}`).join(', ')}`);
    const n = rows[0];
    return say(`El siguiente es ${n.pl.nombre} para ${n.pl.persona === 'mama' ? 'mamá' : 'el bebé'}, a las ${fmtTime(n.st.proxima)}, dentro de ${spokenDur(n.st.proxima - now)}`);
  }
  const t = it.texto;
  const score = (pl) => norm(pl.nombre).split(' ').filter((w) => w.length > 2 && t.includes(w)).length;
  let cands = activos.map((pl) => ({ pl, s: score(pl) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!cands.length) {
    if (t.includes('vitamina')) return handleIntent({ type: 'vitamina' }, v);
    const due = activos.filter((pl) => statusOf(pl, now).estado === 'toca');
    if (due.length === 1) cands = [{ pl: due[0] }];
    else return say('No sé qué medicamento. Dime su nombre, por ejemplo: se ha tomado el paracetamol');
  }
  const pl = cands[0].pl;
  logDose(pl, 'tomada');
  const st = statusOf(pl, now + 1000);
  return say(`${pl.nombre} apuntado${st.proxima && st.estado === 'pendiente' ? `. La siguiente, a las ${fmtTime(st.proxima)}` : ''}`);
}
