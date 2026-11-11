import { createStore } from './store.js';
import { WHO } from './who.js';
import { PERSONAS, planSlots, planStatus, describePlan, planIcs, parseHoras, COMIDAS, HORAS_COMIDAS, horasDeComidas, comidaDe } from './meds.js';
import { askGemini, listModels, testConnection } from './ai.js';
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
  store: null, user: undefined, baby: null, active: {}, events: [], measures: [], plans: [], agenda: [], temas: [], notas: [], agendaSeg: 'proximo', config: {}, chat: null, aiBusy: false, saludTab: 'medicinas', temaOpen: {},
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
    S.baby = null; S.active = {}; S.events = []; S.measures = []; S.plans = []; S.agenda = []; S.temas = []; S.notas = []; S.loaded = false;
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
  unsubs.push(S.store.watchCol('agenda', (x) => { S.agenda = x; render(); checkAgendaAlerts(); }, err));
  unsubs.push(S.store.watchCol('temas', (x) => { S.temas = x; S.temasLoaded = true; render(); }, err));
  unsubs.push(S.store.watchCol('notas', (x) => { S.notas = x; render(); }, err));
  unsubs.push(S.store.watchCol('config', (x) => { S.config = Object.fromEntries(x.map((d) => [d.id, d])); render(); }, err));
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
  const keepNote = ae && ae.closest && ae.closest('.add-note') ? { tema: ae.closest('.add-note').dataset.tema, value: ae.value } : null;
  if (!keepNote && ae && ae.closest && ae.closest('main') && ae.matches('input,select,textarea')) { dirty = true; return; }
  dirty = false;
  charts.forEach((c) => c.destroy());
  charts = [];
  const views = { inicio: viewHome, historial: viewHistory, resumen: viewSummary, crecimiento: () => saludSeg() + viewGrowth(), medicinas: () => saludSeg() + viewMeds(), agenda: viewAgenda, asistente: viewAI, ajustes: viewSettings };
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
  if (keepNote) { const i = document.querySelector(`.add-note[data-tema="${keepNote.tema}"] input`); if (i) { i.value = keepNote.value; i.focus({ preventScroll: true }); } }
  afterRender();
  tick();
}
document.addEventListener('focusout', () => setTimeout(() => { if (dirty) render(); }, 50));

function header() {
  const nombre = S.baby?.nombre || 'Mi bebé';
  return `<header class="top">
    <div class="avatar">${S.baby?.sexo === 'nino' ? '👶🏻' : S.baby?.sexo === 'nina' ? '👶🏻' : '👶🏻'}</div>
    <div class="grow"><h1>${esc(nombre)}</h1><div class="age">${esc(babyAge(S.baby?.nacimiento)) || 'Configura los datos en Ajustes'}</div></div>
    <button class="mic ai-btn ${S.tab === 'asistente' ? 'on' : ''}" data-action="tab" data-tab="asistente" title="Asistente IA">✨</button>
    ${voiceSupported ? `<button class="mic vmic ${S.voice.enabled ? 'on' : ''}" data-action="voice-toggle" title="Escucha por palabra clave">🎙️</button>` : ''}
    <button class="mic" style="filter:none;opacity:${S.tab === 'ajustes' ? 1 : .75}" data-action="tab" data-tab="ajustes" title="Ajustes">⚙️</button>
    <span class="${syncClass()}" title="Sincronización"></span>
  </header>`;
}

function nav() {
  const items = [['inicio', '🏠', 'Inicio'], ['historial', '🗒️', 'Registro'], ['resumen', '📊', 'Resumen'], ['salud', '💊', 'Salud'], ['agenda', '📅', 'Agenda']];
  const on = (k) => S.tab === k || (k === 'salud' && (S.tab === 'medicinas' || S.tab === 'crecimiento'));
  return `<nav class="nav">${items.map(([k, i, l]) => `<button data-action="tab" data-tab="${k}" class="${on(k) ? 'on' : ''}"><span class="i">${i}</span>${l}</button>`).join('')}</nav>`;
}
function saludSeg() {
  return `<div class="seg">${[['medicinas', 'Medicinas'], ['crecimiento', 'Peso y medidas']].map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
}

function evRow(e) {
  const t = T[e.tipo] || T.nota;
  const who = e.autor && e.autor !== me() ? `<div class="who" title="${esc(e.autor)}">${esc(e.autor[0])}</div>` : '';
  return `<button class="ev" data-action="edit" data-id="${esc(e.id)}" style="--c:${t.c}">
    <span class="ic">${t.icon}</span>
    <span class="tx"><div class="t1">${esc(evTitle(e))}${e.foto ? ' <span title="Con foto">📷</span>' : ''}</div><div class="t2">${esc(describe(e))}</div></span>
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
    ${!p && lastFeed ? nextFeedCard() : ''}
    ${lastPecho && !p ? `<div class="stat wide" style="min-height:0;flex-direction:row;align-items:center;justify-content:space-between">
      <span><span class="k"><span class="dot" style="background:var(--c-pecho)"></span>Siguiente pecho</span><span class="d">La última empezó por el ${LADO[lastPecho.primero || lastPecho.lado]?.toLowerCase() || '—'}</span></span>
      <span class="v" style="font-size:18px;color:var(--c-pecho)">${LADO[sugerido]}</span></div>` : ''}
    ${!sl && lastSueno ? `<div class="stat wide" style="min-height:0;flex-direction:row;align-items:center;justify-content:space-between">
      <span><span class="k"><span class="dot" style="background:var(--c-sueno)"></span>Despierto</span><span class="d">Último sueño ${fmtDur(lastSueno.fin - lastSueno.t)}</span></span>
      <span class="v" style="font-size:18px" data-ago="${lastSueno.fin}">${fmtAgo(lastSueno.fin)}</span></div>` : ''}
  </div>`;

  h += homeAgenda();
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
  if (now % 15000 < 1000) { checkMedAlerts(); checkAgendaAlerts(); }
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
  const filtros = [['fotos', '📷 Fotos'], ['todo', 'Todo'], ['tomas', '🤱 Tomas'], ['panales', '🧷 Pañales'], ['sueno', '🌙 Sueño'], ['salud', '💊 Salud'], ['otros', '📝 Otros']];
  if (S.filtro === 'fotos') return viewFotosHeader(filtros) + viewFotos();
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
  h += feedSection(from, to, nd);
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
    <div class="field"><label>Máximo de horas entre tomas (desde el inicio de una al de la siguiente)</label><input class="input" id="s-maxh" inputmode="decimal" value="${String(b.maxEntreTomas ?? 3).replace('.', ',')}">
      <div class="faint" style="font-size:12px;margin-top:6px">La AEP recomienda que el recién nacido no pase más de 3 h sin comer, también de noche. Ajústalo si el pediatra os indica otra cosa.</div></div>
    <div class="field"><label>Avisar si se pasa ese tiempo sin comer</label>${pickPlain2('s-avisotoma', b.avisoTomas ? '1' : '0', [['1', 'Sí'], ['0', 'No']])}</div>
    <div class="field"><label>Horario de comidas (para medicamentos “con las comidas”)</label>
      <div class="grid3">${Object.entries(COMIDAS).map(([k, l]) => `<div><div class="faint" style="font-size:12px;margin-bottom:4px">${l}</div><input class="input" type="time" id="s-hc-${k}" value="${horaComida(k)}" style="padding:10px 8px"></div>`).join('')}</div></div>
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

  <div class="section-title">Asistente IA</div>
  <div class="card">${aiSettings()}</div>

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
  if ($('#ch-intervalos')) {
    const now = Date.now();
    const ranges = { hoy: dayStart(now), '24h': now - DAY, '7d': dayStart(now) - 6 * DAY };
    const fs = feedStats(ranges[S.rango], now);
    const maxH = S.baby?.maxEntreTomas || 3;
    charts.push(new Chart($('#ch-intervalos'), {
      type: 'bar',
      data: { labels: fs.pairs.map((x) => (S.rango === '7d' ? `${shortDay(x.t)} ${fmtTime(x.t)}` : fmtTime(x.t))), datasets: [
        { label: 'Horas desde la toma anterior', data: fs.pairs.map((x) => +(x.gap / HOUR).toFixed(2)), backgroundColor: fs.pairs.map((x) => (x.gap > maxH * HOUR ? css('--warn') : css('--c-pecho'))), borderRadius: 4 },
      ] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtDur(c.parsed.y * HOUR) } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'horas' } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } } } },
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
        ${fotoField()}
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

  const foto = { data: null, changed: false };
  const form = openSheet(ev ? `Editar · ${t.label}` : t.label, body, {
    icon: `<span class="qbtn" style="--c:${t.c};all:unset"><span style="display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:color-mix(in srgb, ${t.c} 20%, transparent)">${t.icon}</span></span>`,
    onSave: (f) => {
      const data = read(f);
      if (data === false) return false;
      if (!data.t || isNaN(data.t)) { toast('Revisa la fecha y hora', true); return false; }
      vibrate();
      if (foto.changed) data.foto = !!foto.data;
      const saveFoto = (id) => {
        if (!foto.changed || !id) return;
        S.fotos = null;
        if (foto.data) run(S.store.saveIn('fotos', { id, data: foto.data, t: data.t, tipo, color: data.color || '', desc: describe({ tipo, ...data }) }));
        else run(S.store.deleteIn('fotos', id));
      };
      if (ev) { run(S.store.updateEvent(ev.id, data)).then(() => toast('Guardado')); saveFoto(ev.id); }
      else { addEv(({ tipo, autor: me(), ...data })).then((r) => saveFoto(r && r.id)); toast(`${t.label} registrado`); }
    },
    onDelete: ev ? () => { run(S.store.deleteEvent(ev.id)); if (ev.foto) run(S.store.deleteIn('fotos', ev.id)); toast('Eliminado'); } : null,
  });

  if (tipo === 'panal') bindFoto(form, foto, ev);

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
  tab: (b) => { let t = b.dataset.tab; if (t === 'salud') t = S.saludTab; if (t === 'medicinas' || t === 'crecimiento') S.saludTab = t; S.tab = t; window.scrollTo(0, 0); render(); },
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
    const data = { nombre, medDiaria: $('#s-med').value.trim(), maxEntreTomas: num($('#s-maxh').value) || 3, avisoTomas: $('[data-action="pick-generic"][data-group="s-avisotoma"].on')?.dataset.v === '1' };
    if (!isNaN(nac)) data.nacimiento = nac;
    const sexo = S._sexo || S.baby?.sexo;
    if (sexo) data.sexo = sexo;
    const hc = {};
    for (const k of Object.keys(COMIDAS)) { const v = $(`#s-hc-${k}`)?.value; if (v) hc[k] = v; }
    data.horasComidas = { ...HORAS_COMIDAS, ...hc };
    for (const pl of S.plans.filter((x) => x.modo === 'comidas')) {
      const horas = horasDeComidas(pl.comidas, data.horasComidas);
      if (horas.join() !== (pl.horas || []).join()) S.store.savePlan({ ...pl, horas });
    }
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
  if (it.type === 'nota') {
    const temas = temasOrdenados();
    const t = norm(it.texto);
    const tema = /pediatra|medico/.test(t) ? 'pediatra' : /matrona/.test(t) ? 'matrona' : /compra|comprar/.test(t) ? 'compras'
      : (temas.find((x) => norm(x.nombre).split(' ').some((w) => w.length > 3 && t.includes(w)))?.id || 'otros');
    const texto = it.texto.replace(/^\s*(apunta|anota|apuntar|anotar|toma nota|añade|agrega)\b\s*(de\s+)?(que\s+)?(en|para|a)?\s*(la\s+lista\s+de\s+|las?\s+preguntas?\s+(del?|al|para el|a la)\s+|el|la|los)?\s*(pediatra|matrona|compras?|otras notas)?\s*[:,]?\s*(que\s+)?/i, '').trim();
    if (!texto) return v.ask('¿Qué apunto?', (txt) => handleIntent({ type: 'nota', texto: `apunta ${txt}` }, v));
    seedTemas();
    run(S.store.saveIn('notas', { temaId: tema, texto: texto.charAt(0).toUpperCase() + texto.slice(1), hecho: false, t: Date.now(), autor: me() }));
    return say(`Apuntado en ${(temas.find((x) => x.id === tema) || TEMAS_BASE.find((x) => x.id === tema))?.nombre.toLowerCase() || 'notas'}`);
  }
  if (it.type === 'q-cita') {
    const c = agendaUpcoming().find((a) => a.tipo === 'cita');
    if (!c) return say('No hay citas apuntadas');
    const preg = c.temaId ? pendientes(c.temaId).length : 0;
    return say(`La próxima cita es ${c.titulo}, ${dayLabel(c.cuando).toLowerCase()} a las ${fmtTime(c.cuando)}${preg ? `. Tenéis ${preg} ${preg === 1 ? 'pregunta apuntada' : 'preguntas apuntadas'}` : ''}`);
  }
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
    const m = $('.vmic');
    if (m) m.className = 'mic vmic' + (st.enabled ? ' on' : '') + (st.state === 'escuchando' ? ' hot' : '');
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
    <div class="field"><label>Frecuencia</label>${pick('modo', modo, [['intervalo', 'Cada X h'], ['horas', 'Horas fijas'], ['comidas', 'Comidas']])}</div>
    <div id="f-intervalo" class="${modo !== 'intervalo' ? 'hidden' : ''}">
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
    <div id="f-comidas" class="${modo === 'comidas' ? '' : 'hidden'}">
      <div class="field"><label>¿Con qué comidas?</label><input type="hidden" name="comidas" value="${esc((e.comidas || ['desayuno', 'comida', 'cena']).join(','))}">
        <div class="grid3">${Object.entries(COMIDAS).map(([k, l]) => `<button type="button" class="opt ${(e.comidas || ['desayuno', 'comida', 'cena']).includes(k) ? 'on' : ''}" data-comida="${k}"><span class="i">${{ desayuno: '☕', comida: '🍽️', cena: '🌙' }[k]}</span>${l}<div class="faint" style="font-size:12px;font-weight:400">${horaComida(k)}</div></button>`).join('')}</div>
        <div class="faint" style="font-size:12px;margin-top:6px">Las horas de cada comida se cambian en ⚙️ Ajustes.</div></div>
      <div class="field"><label>Empieza</label><input class="input" type="date" name="desdeC" value="${toLocalInput(e.inicio || now).slice(0, 10)}"></div>
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
      if (plan.modo === 'comidas') {
        plan.comidas = f.comidas.value.split(',').filter(Boolean);
        if (!plan.comidas.length) return toast('Elige al menos una comida', true), false;
        plan.horas = horasDeComidas(plan.comidas, S.baby?.horasComidas);
        const d = f.desdeC.value ? new Date(f.desdeC.value + 'T00:00') : new Date();
        d.setHours(0, 0, 0, 0); plan.inicio = d.getTime();
        plan.cadaH = null; plan.desdeToma = false;
      } else if (plan.modo === 'horas') {
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
    const m = form.modo.value;
    $('#f-intervalo', form).classList.toggle('hidden', m !== 'intervalo');
    $('#f-horas', form).classList.toggle('hidden', m !== 'horas');
    $('#f-comidas', form).classList.toggle('hidden', m !== 'comidas');
  });
  form.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-comida]'); if (!b) return;
    b.classList.toggle('on');
    form.comidas.value = [...form.querySelectorAll('[data-comida].on')].map((x) => x.dataset.comida).join(',');
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
    const cm = comidaDe(pl, st.proxima);
    notify(`💊 ${pl.nombre}${pl.dosis ? ' · ' + pl.dosis : ''}`, `${quien}: ${cm ? `con ${cm === 'comida' ? 'la comida' : cm === 'cena' ? 'la cena' : 'el desayuno'} (${fmtTime(st.proxima)})` : `tocaba a las ${fmtTime(st.proxima)}`}`, `med-${pl.id}`);
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
      <div class="muted" style="margin-top:2px">${comidaDe(pl, st.proxima) ? `Con ${{ desayuno: 'el desayuno', comida: 'la comida', cena: 'la cena' }[comidaDe(pl, st.proxima)]} · ` : ''}Tocaba a las ${fmtTime(st.proxima)} (${enTiempo(st.proxima)})</div>
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

// ---------------------------------------------------------------- análisis de tomas
// El intervalo entre tomas se cuenta desde el INICIO de una toma hasta el INICIO de la siguiente.
function pickPlain2(group, value, opts) {
  return `<div class="grid${opts.length}">${opts.map(([v, l]) => `<button type="button" class="opt ${String(value) === v ? 'on' : ''}" data-action="pick-generic" data-group="${group}" data-v="${v}">${l}</button>`).join('')}</div>`;
}
actions['pick-generic'] = (b) => { document.querySelectorAll(`[data-action="pick-generic"][data-group="${b.dataset.group}"]`).forEach((x) => x.classList.toggle('on', x === b)); };

const isFeed = (e) => e.tipo === 'pecho' || e.tipo === 'biberon';
function feedStats(from, to) {
  const feeds = S.events.filter((e) => isFeed(e) && e.t >= from - 8 * HOUR && e.t < to).sort((a, b) => a.t - b.t);
  const pairs = [];
  for (let i = 1; i < feeds.length; i++) {
    const gap = feeds[i].t - feeds[i - 1].t;
    if (feeds[i].t >= from && gap > 0 && gap < 8 * HOUR) pairs.push({ t: feeds[i].t, gap });
  }
  const inWin = feeds.filter((e) => e.t >= from);
  const pecho = inWin.filter((e) => e.tipo === 'pecho');
  const dur = pecho.map((e) => (e.segIzq || 0) + (e.segDer || 0)).filter((x) => x > 0);
  const izq = pecho.map((e) => e.segIzq || 0).filter((x) => x > 0);
  const der = pecho.map((e) => e.segDer || 0).filter((x) => x > 0);
  const bib = inWin.filter((e) => e.tipo === 'biberon').map((e) => +e.ml || 0).filter((x) => x > 0);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const gaps = pairs.map((x) => x.gap);
  return {
    pairs, n: inWin.length,
    intervalo: avg(gaps), minI: gaps.length ? Math.min(...gaps) : 0, maxI: gaps.length ? Math.max(...gaps) : 0,
    durMedia: avg(dur), izqMedia: avg(izq), derMedia: avg(der), izqN: izq.length, derN: der.length,
    ambos: pecho.filter((e) => e.segIzq > 0 && e.segDer > 0).length, pechoN: pecho.length,
    mlMedio: avg(bib), bibN: bib.length,
  };
}

function nextFeedInfo(now = Date.now()) {
  const last = S.events.find(isFeed);
  if (!last) return null;
  const maxH = S.baby?.maxEntreTomas || 3;
  const limite = last.t + maxH * HOUR;
  const fs = feedStats(now - DAY, now);
  const estimada = fs.pairs.length >= 3 ? last.t + fs.intervalo : null;
  return { last, limite, estimada, ritmo: fs.pairs.length >= 3 ? fs.intervalo : null, maxH };
}

function nextFeedCard() {
  const now = Date.now();
  const nf2 = nextFeedInfo(now);
  if (!nf2) return '';
  const { limite, estimada, ritmo, maxH, last } = nf2;
  const pasado = now > limite;
  const objetivo = estimada && estimada < limite ? estimada : limite;
  const v = pasado ? `+${fmtDur(now - limite)}` : objetivo > now ? `en ${fmtDur(objetivo - now)}` : 'ya';
  const sub = pasado
    ? `Han pasado más de ${String(maxH).replace('.', ',')} h desde el inicio de la última toma (${fmtTime(last.t)})`
    : `${estimada && estimada < limite ? `Por su ritmo ≈ ${fmtTime(estimada)} (cada ${fmtDur(ritmo)})` : `Desde el inicio de la última (${fmtTime(last.t)})`} · máx. ${fmtTime(limite)}`;
  return `<button class="stat wide" data-action="tab" data-tab="resumen" style="min-height:0;flex-direction:row;align-items:center;justify-content:space-between;gap:10px">
    <span style="min-width:0"><span class="k"><span class="dot" style="background:${pasado ? 'var(--warn)' : 'var(--c-pecho)'}"></span>Siguiente toma</span><span class="d">${sub}</span></span>
    <span class="v" style="font-size:18px;white-space:nowrap;color:${pasado ? 'var(--warn)' : 'var(--text)'}">${v}</span></button>`;
}

function feedSection(from, to, nd) {
  const fs = feedStats(from, to);
  if (!fs.n) return '';
  const m = (c, k, v, d) => `<div class="metric"><div class="k"><span class="dot" style="background:${c}"></span>${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const porDia = nd > 1 ? fs.n / nd : fs.n;
  const enRango = porDia >= 8 && porDia <= 12;
  let h = `<div class="section-title">Lactancia</div><div class="metrics">
    ${m('var(--c-pecho)', 'Pide cada', fs.intervalo ? fmtDur(fs.intervalo) : '—', fs.pairs.length > 1 ? `entre ${fmtDur(fs.minI)} y ${fmtDur(fs.maxI)}` : 'de inicio a inicio')}
    ${m('var(--c-pecho)', 'Tomas al día', nf(porDia, nd > 1 ? 1 : 0), nd > 1 || S.rango === '24h' ? (enRango ? 'dentro de 8–12 (AEP)' : '<span style="color:var(--warn)">recomendado 8–12</span>') : 'recomendado 8–12 al día')}
    ${m('var(--c-pecho)', 'Duración media', fs.durMedia ? fmtDur(fs.durMedia) : '—', fs.pechoN ? `${fs.ambos} de ${fs.pechoN} con los dos pechos` : 'sin tomas de pecho')}
    ${m('var(--c-pecho)', 'Por pecho', fs.izqN || fs.derN ? `${fmtDur(fs.izqMedia).replace(' min', '′')} · ${fmtDur(fs.derMedia).replace(' min', '′')}` : '—', `izq. (${fs.izqN}) · der. (${fs.derN})`)}
    ${fs.bibN ? m('var(--c-biberon)', 'Biberón medio', `${nf(fs.mlMedio)} ml`, pl(fs.bibN, 'biberón', 'biberones')) : ''}
  </div>`;
  if (fs.pairs.length) h += `<div class="card"><h2>Tiempo entre tomas</h2><div class="chart-box"><canvas id="ch-intervalos"></canvas></div>
    <div class="legend"><span><span class="dot" style="background:var(--warn)"></span>Más de ${String(S.baby?.maxEntreTomas || 3).replace('.', ',')} h</span><span>Se cuenta desde el inicio de cada toma</span></div></div>`;
  return h;
}

// Aviso si pasa el máximo sin comer (opcional, en Ajustes)
function checkFeedAlert() {
  if (!S.user || S.access !== 'ok' || !S.baby?.avisoTomas || S.active.pecho) return;
  const nf2 = nextFeedInfo();
  if (!nf2 || Date.now() < nf2.limite) return;
  const key = `toma:${nf2.last.id}`;
  const alerted = loadJson(ALERT_KEY, []);
  if (alerted.includes(key)) return;
  saveJson(ALERT_KEY, alerted.concat([key]).slice(-300));
  notify('🍼 Hora de la toma', `Han pasado ${String(nf2.maxH).replace('.', ',')} h desde el inicio de la última toma (${fmtTime(nf2.last.t)})`, 'toma');
  alarmSound();
  toast(`Han pasado ${String(nf2.maxH).replace('.', ',')} h desde la última toma`);
}
setInterval(checkFeedAlert, 30000);

// ---------------------------------------------------------------- agenda: notas por temas, citas y recordatorios
const TEMAS_BASE = [
  { id: 'pediatra', nombre: 'Preguntas al pediatra', icono: '🩺', orden: 1 },
  { id: 'matrona', nombre: 'Preguntas a la matrona', icono: '🤱', orden: 2 },
  { id: 'compras', nombre: 'Compras', icono: '🛒', orden: 3 },
  { id: 'otros', nombre: 'Otras notas', icono: '📝', orden: 9 },
];
const CATS = { pediatra: ['🩺', 'Pediatra'], matrona: ['🤱', 'Matrona'], vacunas: ['💉', 'Vacunas'], gine: ['👩‍⚕️', 'Ginecología'], otra: ['📅', 'Otra'] };
const AVISOS = [['0', 'No'], ['30', '30 min'], ['60', '1 h'], ['120', '2 h'], ['1440', '1 día']];

function temasOrdenados() {
  const list = S.temas.length ? S.temas : TEMAS_BASE;
  return [...list].sort((a, b) => (a.orden ?? 5) - (b.orden ?? 5) || a.nombre.localeCompare(b.nombre));
}
function seedTemas() {
  if (S.store.mode !== 'demo' && !S.temasLoaded) return;
  if (S.temas.length || S._seeded) return;
  S._seeded = true;
  TEMAS_BASE.forEach((t) => S.store.saveIn('temas', t));
}
const notasDe = (temaId) => S.notas.filter((n) => n.temaId === temaId);
const pendientes = (temaId) => notasDe(temaId).filter((n) => !n.hecho);

function agendaUpcoming(now = Date.now()) {
  return S.agenda.filter((a) => !a.hecho && a.cuando >= now - (a.tipo === 'cita' ? 2 * HOUR : 12 * HOUR)).sort((a, b) => a.cuando - b.cuando);
}

function agendaRow(a) {
  const now = Date.now();
  const cat = a.tipo === 'cita' ? CATS[a.categoria] || CATS.otra : ['🔔', 'Recordatorio'];
  const late = a.tipo === 'recordatorio' && a.cuando <= now;
  const preg = a.tipo === 'cita' && a.temaId ? pendientes(a.temaId).length : 0;
  const quien = a.persona ? `<span class="who-tag ${a.persona}">${a.persona === 'mama' ? 'Mamá' : 'Bebé'}</span> ` : '';
  return `<div class="ag ${late ? 'due' : ''} ${a.hecho ? 'done' : ''}">
    <button class="ag-main" data-action="ag-edit" data-id="${esc(a.id)}">
      <span class="ic" style="--c:${a.tipo === 'cita' ? 'var(--accent)' : 'var(--warn)'}">${cat[0]}</span>
      <span class="tx">
        <div class="t1">${quien}${esc(a.titulo)}</div>
        <div class="t2">${late ? '<span style="color:var(--warn)">⏰ ' : ''}${dayLabel(a.cuando)} · ${fmtTime(a.cuando)}${late ? '</span>' : ''}${a.lugar ? ` · ${esc(a.lugar)}` : ''}${a.repetir ? ` · 🔁 ${a.repetir === 'dia' ? 'cada día' : 'cada semana'}` : ''}</div>
        ${preg ? `<div class="t2" style="color:var(--accent)">❓ ${pl(preg, 'pregunta pendiente', 'preguntas pendientes')}</div>` : ''}
      </span>
    </button>
    ${a.tipo === 'recordatorio' && !a.hecho ? `<button class="ag-check" data-action="ag-done" data-id="${esc(a.id)}" title="Hecho">✓</button>` : ''}
  </div>`;
}

function homeAgenda() {
  const now = Date.now();
  const list = agendaUpcoming(now).filter((a) => (a.tipo === 'cita' ? a.cuando - now < 7 * DAY : a.cuando - now < 24 * HOUR)).slice(0, 3);
  if (!list.length) return '';
  return `<div class="section-title">Próximamente <button data-action="tab" data-tab="agenda">Agenda</button></div>
    <div class="card" style="padding:4px 12px">${list.map(agendaRow).join('')}</div>`;
}

function viewAgenda() {
  seedTemas();
  let h = `<div class="seg">${[['proximo', '📅 Citas y avisos'], ['notas', '📝 Notas']].map(([k, l]) => `<button class="${S.agendaSeg === k ? 'on' : ''}" data-action="ag-seg" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (S.agendaSeg === 'notas') return h + viewNotas();

  h += `<div class="grid2" style="margin-bottom:14px"><button class="btn primary" data-action="ag-new" data-tipo="cita">＋ Cita</button><button class="btn" data-action="ag-new" data-tipo="recordatorio">＋ Recordatorio</button></div>`;
  const up = agendaUpcoming();
  if (!up.length) h += `<div class="card empty">No hay nada pendiente.<br>Añade la próxima revisión del pediatra o un recordatorio.</div>`;
  else {
    const groups = new Map();
    for (const a of up) { const k = dayStart(a.cuando); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    for (const [k, list] of groups) h += `<div class="day-h"><span>${dayLabel(k)}</span></div><div class="card" style="padding:4px 12px">${list.map(agendaRow).join('')}</div>`;
  }
  const past = S.agenda.filter((a) => !up.includes(a)).sort((a, b) => b.cuando - a.cuando).slice(0, 15);
  if (past.length) {
    h += `<div class="section-title">Pasado <button data-action="ag-togglepast">${S.showPast ? 'Ocultar' : 'Ver'}</button></div>`;
    if (S.showPast) h += `<div class="card" style="padding:4px 12px;opacity:.75">${past.map(agendaRow).join('')}</div>`;
  }
  return h;
}

function viewNotas() {
  let h = '';
  for (const t of temasOrdenados()) {
    const all = notasDe(t.id).sort((a, b) => (a.hecho - b.hecho) || (a.hecho ? b.hechoT - a.hechoT : a.t - b.t));
    const pend = all.filter((n) => !n.hecho), done = all.filter((n) => n.hecho);
    const open = S.temaOpen[t.id] ?? true;
    const cita = S.agenda.filter((a) => a.tipo === 'cita' && !a.hecho && a.temaId === t.id && a.cuando > Date.now() - 2 * HOUR).sort((a, b) => a.cuando - b.cuando)[0];
    h += `<div class="card tema">
      <div class="tema-h">
        <button class="tema-t" data-action="tema-toggle" data-id="${esc(t.id)}"><span>${esc(t.icono || '📝')}</span><b>${esc(t.nombre)}</b>${pend.length ? `<span class="cnt">${pend.length}</span>` : ''}<span class="faint" style="margin-left:auto">${open ? '▾' : '▸'}</span></button>
        <button class="tema-edit" data-action="tema-edit" data-id="${esc(t.id)}" title="Editar tema">⋯</button>
      </div>
      ${cita ? `<div class="faint" style="font-size:13px;margin:-4px 0 8px">📅 Próxima cita: ${dayLabel(cita.cuando).toLowerCase()} ${fmtTime(cita.cuando)}</div>` : ''}
      ${open ? `
        <form class="add-note" data-tema="${esc(t.id)}"><input class="input" name="texto" placeholder="Añadir…" autocomplete="off"><button class="btn primary" type="submit">＋</button></form>
        ${pend.map(noteRow).join('')}
        ${done.length ? `<button class="link" style="margin:2px 0 0;padding:6px 0" data-action="tema-done" data-id="${esc(t.id)}">${S.showDone?.[t.id] ? 'Ocultar' : 'Ver'} ${pl(done.length, 'hecha', 'hechas')}</button>${S.showDone?.[t.id] ? done.map(noteRow).join('') : ''}` : ''}
        ${!all.length ? '<div class="faint" style="font-size:14px;padding:6px 2px">Nada apuntado</div>' : ''}` : ''}
    </div>`;
  }
  h += `<button class="btn block" data-action="tema-new">＋ Nuevo tema</button>`;
  return h;
}

function noteRow(n) {
  const who = n.autor && n.autor !== me() ? ` · ${esc(n.autor.split('@')[0])}` : '';
  return `<div class="note ${n.hecho ? 'done' : ''}">
    <button class="note-chk" data-action="note-toggle" data-id="${esc(n.id)}">${n.hecho ? '✓' : ''}</button>
    <button class="note-tx" data-action="note-edit" data-id="${esc(n.id)}"><div>${esc(n.texto)}</div>${n.respuesta ? `<div class="note-ans">↳ ${esc(n.respuesta)}</div>` : ''}<div class="faint" style="font-size:12px">${shortDay(n.t)}${who}</div></button>
  </div>`;
}

document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('.add-note');
  if (!f) return;
  ev.preventDefault();
  const texto = f.texto.value.trim();
  if (!texto) return;
  run(S.store.saveIn('notas', { temaId: f.dataset.tema, texto, hecho: false, t: Date.now(), autor: me() }));
  f.texto.value = '';
  vibrate();
  setTimeout(() => f.texto.focus(), 50);
});

function openAgendaForm(tipo, a) {
  const e = a || {};
  const now = Date.now();
  const def = new Date(now + DAY); def.setHours(10, 0, 0, 0);
  const temaOpts = temasOrdenados().map((t) => `<option value="${esc(t.id)}" ${(e.temaId ?? (e.categoria === 'matrona' ? 'matrona' : 'pediatra')) === t.id ? 'selected' : ''}>${esc(t.icono || '')} ${esc(t.nombre)}</option>`).join('');
  let body;
  if (tipo === 'cita') {
    const cat = e.categoria || 'pediatra';
    body = `<div class="field"><label>Tipo</label><input type="hidden" name="categoria" value="${cat}">
        <div class="chip-row">${Object.entries(CATS).map(([k, [i, l]]) => `<button type="button" class="chip ${cat === k ? 'on' : ''}" data-pick="categoria" data-v="${k}">${i} ${l}</button>`).join('')}</div></div>
      <div class="field"><label>Para</label>${pick('persona', e.persona || 'bebe', [['bebe', 'Bebé', '👶'], ['mama', 'Mamá', '👩']])}</div>
      <div class="field"><label>Título</label><input class="input" name="titulo" value="${esc(e.titulo || '')}" placeholder="p. ej. Revisión de los 15 días"></div>
      ${timeField(e.cuando || def.getTime(), 'Fecha y hora', 'cuando', false)}
      <div class="field"><label>Lugar (opcional)</label><input class="input" name="lugar" value="${esc(e.lugar || '')}" placeholder="Centro de salud, consulta…"></div>
      <div class="field"><label>Avisar antes</label>${pick('aviso', String(e.avisoMin ?? 120), AVISOS, 5)}</div>
      <div class="field"><label>Preguntas que llevar</label><select class="input" name="temaId"><option value="">Ninguna</option>${temaOpts}</select></div>
      <div class="field"><label>Notas (opcional)</label><textarea class="input" name="notas" placeholder="Llevar cartilla, informe…">${esc(e.notas || '')}</textarea></div>
      ${a && a.temaId && pendientes(a.temaId).length ? `<div class="lbl">Preguntas pendientes</div><div class="card" style="padding:4px 12px">${pendientes(a.temaId).map(noteRow).join('')}</div>` : ''}
      ${a ? `<button type="button" class="btn block" style="margin-bottom:10px" data-action="ag-ics" data-id="${esc(a.id)}">📅 Añadir al calendario del móvil</button>
        <button type="button" class="btn block" style="margin-bottom:12px" data-action="ag-done" data-id="${esc(a.id)}">${a.hecho ? '↺ Marcar como pendiente' : '✓ Marcar como hecha'}</button>` : ''}`;
  } else {
    const inOneHour = new Date(now + HOUR); inOneHour.setMinutes(0, 0, 0);
    body = `<div class="field"><label>¿Qué hay que recordar?</label><input class="input" name="titulo" value="${esc(e.titulo || '')}" placeholder="p. ej. Pedir cita para las vacunas"></div>
      ${timeField(e.cuando || inOneHour.getTime(), 'Cuándo', 'cuando', false)}
      <div class="chip-row" style="margin:-6px 0 14px">${[[60, '+1 h'], [180, '+3 h'], ['m9', 'Mañana 9:00'], ['m20', 'Hoy 20:00']].map(([v, l]) => `<button type="button" class="chip" data-when="${v}">${l}</button>`).join('')}</div>
      <div class="field"><label>Repetir</label>${pick('repetir', e.repetir || '', [['', 'No'], ['dia', 'Cada día'], ['semana', 'Cada semana']])}</div>
      <div class="field"><label>Para (opcional)</label>${pick('persona', e.persona || '', [['', 'Todos'], ['bebe', 'Bebé'], ['mama', 'Mamá']])}</div>
      ${a ? `<button type="button" class="btn block" style="margin-bottom:12px" data-action="ag-done" data-id="${esc(a.id)}">${a.hecho ? '↺ Marcar como pendiente' : '✓ Hecho'}</button>` : ''}`;
  }
  const form = openSheet(a ? (tipo === 'cita' ? 'Editar cita' : 'Editar recordatorio') : tipo === 'cita' ? 'Nueva cita' : 'Nuevo recordatorio', body, {
    icon: `<span style="font-size:24px">${tipo === 'cita' ? '📅' : '🔔'}</span>`,
    onSave: (f) => {
      const cuando = fromLocalInput(f.cuando.value);
      if (isNaN(cuando)) return toast('Revisa la fecha y hora', true), false;
      const d = { tipo, cuando, persona: f.persona.value, actualizado: Date.now() };
      if (tipo === 'cita') {
        d.categoria = f.categoria.value;
        d.titulo = f.titulo.value.trim() || `${CATS[d.categoria][1]}${d.persona === 'mama' ? ' (mamá)' : ''}`;
        d.lugar = f.lugar.value.trim(); d.avisoMin = +f.aviso.value; d.temaId = f.temaId.value; d.notas = f.notas.value.trim();
      } else {
        d.titulo = f.titulo.value.trim();
        if (!d.titulo) return toast('Escribe qué hay que recordar', true), false;
        d.repetir = f.repetir.value;
      }
      if (a) d.id = a.id; else { d.hecho = false; d.autor = me(); }
      if (cuando !== e.cuando) d.avisado = null;
      run(S.store.saveIn('agenda', d)).then(() => toast(a ? 'Guardado' : tipo === 'cita' ? 'Cita guardada' : 'Recordatorio guardado'));
      if (notifState() === 'default') setTimeout(() => actions['notif-enable'](), 600);
    },
    onDelete: a ? () => { run(S.store.deleteIn('agenda', a.id)); toast('Eliminado'); } : null,
  });
  form.addEventListener('click', (ev) => {
    const w = ev.target.closest('[data-when]'); if (!w) return;
    const v = w.dataset.when; const d = new Date();
    if (v === 'm9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else if (v === 'm20') d.setHours(20, 0, 0, 0);
    else d.setTime(Date.now() + v * MIN);
    form.cuando.value = toLocalInput(d.getTime());
  });
  if (tipo === 'cita') {
    let lastCat = form.categoria.value;
    form.addEventListener('change', () => {
      const c = form.categoria.value;
      if (c !== lastCat) { lastCat = c; if (c === 'pediatra' || c === 'matrona') form.temaId.value = c; }
    });
  }
}

function openNoteForm(n) {
  const opts = temasOrdenados().map((t) => `<option value="${esc(t.id)}" ${n.temaId === t.id ? 'selected' : ''}>${esc(t.icono || '')} ${esc(t.nombre)}</option>`).join('');
  openSheet('Nota', `
    <div class="field"><label>Nota</label><textarea class="input" name="texto">${esc(n.texto)}</textarea></div>
    <div class="field"><label>Respuesta / lo que nos dijeron (opcional)</label><textarea class="input" name="respuesta" placeholder="Apunta aquí lo que os contesten">${esc(n.respuesta || '')}</textarea></div>
    <div class="field"><label>Tema</label><select class="input" name="temaId">${opts}</select></div>`, {
    icon: '<span style="font-size:24px">📝</span>',
    onSave: (f) => {
      const texto = f.texto.value.trim();
      if (!texto) return toast('La nota está vacía', true), false;
      const respuesta = f.respuesta.value.trim();
      run(S.store.saveIn('notas', { id: n.id, texto, respuesta, temaId: f.temaId.value, ...(respuesta && !n.hecho ? { hecho: true, hechoT: Date.now() } : {}) }));
    },
    onDelete: () => run(S.store.deleteIn('notas', n.id)),
  });
}

function openTemaForm(t) {
  const iconos = ['📝', '🩺', '🤱', '🛒', '💉', '🏠', '👶', '👩', '📄', '🚗', '🎁', '💡'];
  openSheet(t ? 'Editar tema' : 'Nuevo tema', `
    <div class="field"><label>Nombre</label><input class="input" name="nombre" value="${esc(t?.nombre || '')}" placeholder="p. ej. Papeleo, Visitas, Ideas"></div>
    <div class="field"><label>Icono</label><input type="hidden" name="icono" value="${esc(t?.icono || '📝')}"><div class="chip-row">${iconos.map((i) => `<button type="button" class="chip ${(t?.icono || '📝') === i ? 'on' : ''}" data-pick="icono" data-v="${i}">${i}</button>`).join('')}</div></div>`, {
    icon: '<span style="font-size:24px">🗂️</span>',
    onSave: (f) => {
      const nombre = f.nombre.value.trim();
      if (!nombre) return toast('Ponle un nombre', true), false;
      run(S.store.saveIn('temas', { ...(t ? { id: t.id } : { orden: 5 }), nombre, icono: f.icono.value }));
    },
    onDelete: t ? () => {
      if (notasDe(t.id).length && !confirm(`Se borrarán también sus ${notasDe(t.id).length} notas. ¿Seguro?`)) return;
      notasDe(t.id).forEach((n) => S.store.deleteIn('notas', n.id));
      run(S.store.deleteIn('temas', t.id));
    } : null,
  });
}

function nextRepeat(a) {
  const step = a.repetir === 'semana' ? 7 * DAY : DAY;
  let c = a.cuando;
  do c += step; while (c <= Date.now());
  return c;
}

Object.assign(actions, {
  'ag-seg': (b) => { S.agendaSeg = b.dataset.v; render(); },
  'ag-new': (b) => openAgendaForm(b.dataset.tipo),
  'ag-edit': (b) => { const a = S.agenda.find((x) => x.id === b.dataset.id); if (a) openAgendaForm(a.tipo, a); },
  'ag-togglepast': () => { S.showPast = !S.showPast; render(); },
  'ag-done': (b) => {
    const a = S.agenda.find((x) => x.id === b.dataset.id); if (!a) return;
    vibrate();
    if (!a.hecho && a.repetir) { run(S.store.saveIn('agenda', { id: a.id, cuando: nextRepeat(a), avisado: null })); toast('Hecho · se repetirá'); }
    else { run(S.store.saveIn('agenda', { id: a.id, hecho: !a.hecho })); toast(a.hecho ? 'Pendiente otra vez' : 'Hecho'); }
    closeSheet();
  },
  'ag-snooze': (b) => {
    const a = S.agenda.find((x) => x.id === b.dataset.id); if (!a) return;
    run(S.store.saveIn('agenda', { id: a.id, cuando: Date.now() + (+b.dataset.min) * MIN, avisado: null }));
    toast('Pospuesto'); closeSheet();
  },
  'ag-ics': (b) => {
    const a = S.agenda.find((x) => x.id === b.dataset.id); if (!a) return;
    const z = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e2 = (x) => String(x || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const preg = a.temaId ? pendientes(a.temaId).map((n) => '- ' + n.texto).join('\n') : '';
    const desc = [a.notas, preg && 'Preguntas:\n' + preg].filter(Boolean).join('\n\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Monitor Bebe//ES', 'BEGIN:VEVENT', `UID:${a.id}@monitor-bebe`, `DTSTAMP:${z(Date.now())}`,
      `DTSTART:${z(a.cuando)}`, `DTEND:${z(a.cuando + HOUR)}`, `SUMMARY:${e2(a.titulo)}`, a.lugar ? `LOCATION:${e2(a.lugar)}` : '', desc ? `DESCRIPTION:${e2(desc)}` : '',
      ...(a.avisoMin ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e2(a.titulo)}`, `TRIGGER:-PT${a.avisoMin}M`, 'END:VALARM'] : []), 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
    const file = new File([lines.join('\r\n')], 'cita.ics', { type: 'text/calendar' });
    if (/iPhone|iPad/.test(navigator.userAgent)) { location.href = URL.createObjectURL(file); return; }
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return; }
    const l = document.createElement('a'); l.href = URL.createObjectURL(file); l.download = 'cita.ics'; l.click();
  },
  'note-toggle': (b) => {
    const n = S.notas.find((x) => x.id === b.dataset.id); if (!n) return;
    vibrate();
    run(S.store.saveIn('notas', { id: n.id, hecho: !n.hecho, hechoT: Date.now() }));
  },
  'note-edit': (b) => { const n = S.notas.find((x) => x.id === b.dataset.id); if (n) openNoteForm(n); },
  'tema-toggle': (b) => { S.temaOpen[b.dataset.id] = !(S.temaOpen[b.dataset.id] ?? true); render(); },
  'tema-done': (b) => { S.showDone = { ...(S.showDone || {}), [b.dataset.id]: !S.showDone?.[b.dataset.id] }; render(); },
  'tema-new': () => openTemaForm(),
  'tema-edit': (b) => { const t = S.temas.find((x) => x.id === b.dataset.id); if (t) openTemaForm(t); },
});

// Avisos de agenda (citas con antelación y recordatorios a su hora)
function checkAgendaAlerts() {
  if (!S.user || S.access !== 'ok' || !S.agenda.length) return;
  const now = Date.now();
  const alerted = loadJson(ALERT_KEY, []);
  const fire = [];
  for (const a of S.agenda) {
    if (a.hecho) continue;
    const at = a.tipo === 'cita' ? (a.avisoMin ? a.cuando - a.avisoMin * MIN : null) : a.cuando;
    if (at == null || now < at || now - at > 12 * HOUR || (a.tipo === 'cita' && now > a.cuando)) continue;
    const key = `ag:${a.id}:${a.cuando}`;
    if (alerted.includes(key)) continue;
    alerted.push(key); fire.push(a);
  }
  if (!fire.length) return;
  saveJson(ALERT_KEY, alerted.slice(-300));
  for (const a of fire) {
    if (a.tipo === 'cita') {
      const preg = a.temaId ? pendientes(a.temaId).length : 0;
      notify(`📅 ${a.titulo}`, `${dayLabel(a.cuando)} a las ${fmtTime(a.cuando)}${a.lugar ? ' · ' + a.lugar : ''}${preg ? ` · ${preg} preguntas apuntadas` : ''}`, `ag-${a.id}`);
    } else notify(`🔔 ${a.titulo}`, `Recordatorio de las ${fmtTime(a.cuando)}`, `ag-${a.id}`);
  }
  alarmSound();
  const rec = fire.find((a) => a.tipo === 'recordatorio');
  const cur = $('#sheet-root');
  if (document.hidden || (cur && cur.dataset.kind !== 'ag-alert')) { toast(fire[0].titulo); return; }
  const a = rec || fire[0];
  openSheet(a.tipo === 'cita' ? 'Cita próxima' : 'Recordatorio', `
    <div class="card" style="text-align:center"><div style="font-size:40px">${a.tipo === 'cita' ? (CATS[a.categoria] || CATS.otra)[0] : '🔔'}</div>
      <div style="font-size:19px;font-weight:700;margin-top:6px">${esc(a.titulo)}</div>
      <div class="muted" style="margin-top:4px">${dayLabel(a.cuando)} · ${fmtTime(a.cuando)}${a.lugar ? ` · ${esc(a.lugar)}` : ''}</div></div>
    ${a.tipo === 'cita' && a.temaId && pendientes(a.temaId).length ? `<div class="lbl">Preguntas para llevar</div><div class="card" style="padding:4px 12px">${pendientes(a.temaId).map(noteRow).join('')}</div>` : ''}
    ${a.tipo === 'recordatorio' ? `<button type="button" class="btn c block" style="--c:var(--ok);padding:15px" data-action="ag-done" data-id="${esc(a.id)}">✓ Hecho</button>
      <div class="grid2" style="margin-top:10px"><button type="button" class="btn" data-action="ag-snooze" data-id="${esc(a.id)}" data-min="15">+15 min</button><button type="button" class="btn" data-action="ag-snooze" data-id="${esc(a.id)}" data-min="60">+1 h</button></div>`
      : `<button type="button" class="btn primary block" data-action="close-sheet">Entendido</button>`}`, { icon: '<span style="font-size:24px">⏰</span>' });
  const r = $('#sheet-root'); if (r) r.dataset.kind = 'ag-alert';
}

function horaComida(k) { return (S.baby?.horasComidas || {})[k] || HORAS_COMIDAS[k]; }

// ---------------------------------------------------------------- fotos de pañales
function fotoField() {
  return `<div class="field"><label>Foto (opcional)</label>
    <div class="foto-box">
      <img id="foto-prev" class="hidden" alt="Foto del pañal">
      <div class="foto-ph" id="foto-ph">Sin foto</div>
    </div>
    <div class="grid3" style="margin-top:8px">
      <label class="btn" style="text-align:center">📷 Cámara<input type="file" accept="image/*" capture="environment" id="foto-cam" hidden></label>
      <label class="btn" style="text-align:center">🖼️ Galería<input type="file" accept="image/*" id="foto-gal" hidden></label>
      <button type="button" class="btn danger" id="foto-del" disabled>Quitar</button>
    </div>
    <div class="faint" style="font-size:12px;margin-top:6px">Se guarda reducida y solo la veis vosotros dos.</div></div>`;
}

function bindFoto(form, foto, ev) {
  const prev = $('#foto-prev', form), ph = $('#foto-ph', form), del = $('#foto-del', form);
  const show = (data) => {
    prev.classList.toggle('hidden', !data); ph.classList.toggle('hidden', !!data);
    if (data) prev.src = data; else prev.removeAttribute('src');
    del.disabled = !data;
  };
  if (ev && ev.foto) {
    ph.textContent = 'Cargando foto…';
    S.store.getIn('fotos', ev.id).then((f) => { if (f && !foto.changed) { foto.data = f.data; show(f.data); } else if (!foto.changed) ph.textContent = 'Sin foto'; })
      .catch(() => { ph.textContent = 'No se pudo cargar la foto'; });
  }
  const onFile = async (input) => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    ph.textContent = 'Procesando…';
    try {
      foto.data = await compressImage(file, 900, 0.72);
      foto.changed = true; show(foto.data);
    } catch (e) { toast('No se pudo leer la foto', true); ph.textContent = 'Sin foto'; }
  };
  $('#foto-cam', form).addEventListener('change', (e) => onFile(e.target));
  $('#foto-gal', form).addEventListener('change', (e) => onFile(e.target));
  del.addEventListener('click', () => { foto.data = null; foto.changed = true; show(null); ph.textContent = 'Sin foto'; });
  prev.addEventListener('click', () => openFotoViewer(foto.data, ''));
}

// Reduce la foto (lado mayor maxSide px, JPEG) para guardarla en la base de datos.
async function compressImage(file, maxSide, quality) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const w0 = src.width, h0 = src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  let q = quality, out = c.toDataURL('image/jpeg', q);
  while (out.length > 700000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
  return out;
}

function openFotoViewer(data, caption) {
  if (!data) return;
  const d = document.createElement('div');
  d.className = 'viewer';
  d.innerHTML = `<img src="${data}" alt=""><div class="cap">${esc(caption || '')}</div><button class="viewer-x" aria-label="Cerrar">✕</button>`;
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
}

function viewFotosHeader(filtros) {
  return `<div class="chips-scroll">${filtros.map(([k, l]) => `<button class="chip ${S.filtro === k ? 'on' : ''}" data-action="filtro" data-f="${k}">${l}</button>`).join('')}</div>`;
}
function viewFotos() {
  if (!S.fotos) {
    S.fotos = 'loading';
    S.store.listIn('fotos', 60).then((f) => { S.fotos = f; render(); }).catch((e) => { S.fotos = []; toast('No se pudieron cargar las fotos: ' + e.message, true); render(); });
  }
  if (S.fotos === 'loading') return '<div class="card empty">Cargando fotos…</div>';
  if (!S.fotos.length) return '<div class="card empty">Aún no hay fotos.<br>Al registrar un pañal puedes añadir una foto para ir viendo la evolución.</div>';
  let h = '<p class="muted" style="margin:0 4px 12px;font-size:13px">Evolución de las cacas, de la más reciente a la más antigua. Toca una para verla grande.</p><div class="fotos">';
  for (const f of S.fotos) {
    const c = COLORES.find((x) => x[0] === f.color);
    h += `<button class="foto" data-action="foto-open" data-id="${esc(f.id)}"><img src="${f.data}" alt="" loading="lazy">
      <span class="fcap">${c ? `<span class="swatch" style="background:${c[2]}"></span>` : ''}${shortDay(f.t)} ${fmtTime(f.t)}</span></button>`;
  }
  return h + '</div><button class="link" data-action="fotos-reload">Actualizar</button>';
}
Object.assign(actions, {
  'foto-open': (b) => { const f = Array.isArray(S.fotos) && S.fotos.find((x) => x.id === b.dataset.id); if (f) openFotoViewer(f.data, `${dayLabel(f.t)} ${fmtTime(f.t)} · ${f.desc || ''}`); },
  'fotos-reload': () => { S.fotos = null; render(); },
});

// ---------------------------------------------------------------- asistente IA
const CHAT_KEY = 'monitor-bebe-chat';
const aiCfg = () => S.config?.ia || {};
const fechaLarga = (t) => { const d = new Date(t); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()} ${fmtTime(t)}`; };
const fecha = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${fmtTime(t)}`; };

function loadChat() { if (!S.chat) S.chat = loadJson(CHAT_KEY, []); return S.chat; }
function saveChat() { saveJson(CHAT_KEY, (S.chat || []).slice(-30)); }

const AI_SYSTEM = `Eres el asistente de "Monitor Bebé", una app que usan unos padres primerizos (mamá y papá) en España para registrar todo sobre su bebé recién nacido: tomas (pecho por lado y duración, biberón), pañales (pis, caca, color y fotos), regurgitaciones, sueño, peso y medidas con percentiles OMS, medicación del bebé y de la mamá, citas, recordatorios y notas.

Cómo responder:
- En español de España, cercano y tranquilo, conciso. Usa listas cortas y **negritas** para lo importante. Sin tablas.
- Básate SOLO en los datos que te paso. Cita cifras concretas (fechas, horas, números). Si faltan datos o hay pocos registros, dilo y no inventes.
- Compara con las pautas generales para recién nacidos (AEP/OMS): 8–12 tomas al día a demanda; no más de unas 3 h entre tomas (de inicio a inicio) las primeras semanas; pérdida de peso normal hasta ~7-10 % los primeros días y recuperar el peso de nacimiento hacia los 10–14 días; después ganancia aproximada de 150–250 g/semana; desde el día 5 aprox. al menos 6 pañales mojados al día y 3–4 cacas o más; cacas: meconio negro los primeros días, transición verdosa, y amarilla/mostaza "grumosa" hacia el día 4-5 en lactancia materna.
- Si ves señales de alarma, dilo claramente al principio y recomienda llamar al pediatra o ir a urgencias: fiebre ≥ 38 ºC en menores de 3 meses; caca blanca, gris o con sangre; muy pocos pañales mojados; rechazo de tomas o mucho adormilamiento; vómitos en proyectil repetidos o verdes; color amarillo de piel que aumenta; pérdida de peso > 10 %. Para la mamá: fiebre > 38 ºC, sangrado abundante o dolor intenso.
- No eres médico: no diagnostiques ni cambies dosis de medicación; puedes explicar lo general y sugerir qué preguntar al pediatra o matrona.
- Sobre las fotos de pañales: describe color y consistencia que se ve, la evolución en el tiempo y si encaja con lo esperado para la edad. Avisa si algo debe consultarse.
- Puedes proponer acciones útiles (máximo 3): notas para preguntar al pediatra/matrona, compras o recordatorios. Si propones alguna, añádelas AL FINAL en un bloque exactamente así:
\`\`\`acciones
[{"tipo":"nota","tema":"pediatra","texto":"..."},{"tipo":"recordatorio","titulo":"...","cuando":"2026-11-12T10:00"}]
\`\`\`
  tema puede ser: pediatra, matrona, compras, otros. "cuando" en hora local de España. No pongas el bloque si no hay nada útil que proponer.`;

function contextoDatos() {
  const now = Date.now();
  const b = S.baby || {};
  const L = [];
  L.push(`FECHA Y HORA ACTUAL: ${fechaLarga(now)}`);
  if (b.nacimiento) {
    const dias = Math.floor((now - b.nacimiento) / DAY);
    L.push(`BEBÉ: ${b.nombre || 'sin nombre'}, ${b.sexo === 'nino' ? 'niño' : b.sexo === 'nina' ? 'niña' : 'sexo no indicado'}. Nació el ${fechaLarga(b.nacimiento)}. Edad: ${dias} días${dias >= 14 ? ` (${babyAge(b.nacimiento)})` : ""}.`);
  } else L.push(`BEBÉ: ${b.nombre || 'sin nombre'} (fecha de nacimiento no indicada)`);
  L.push(`Máximo de horas entre tomas configurado: ${b.maxEntreTomas || 3} h.`);

  // Medidas
  const ms = S.measures;
  if (ms.length) {
    const first = ms.find((m) => m.pesoG);
    L.push('\nPESO Y MEDIDAS:');
    for (const m of ms) {
      const p = [];
      if (m.pesoG) {
        let pc = '';
        if (b.nacimiento && b.sexo) {
          const days = (m.t - b.nacimiento) / DAY;
          if (days >= 0) pc = ` (P${Math.round(normCdf(lmsZ(lmsAt(WHO[`peso_${b.sexo}`], days), m.pesoG / 1000)) * 100)})`;
        }
        const rel = first && first !== m ? `, ${((m.pesoG - first.pesoG) / first.pesoG * 100).toFixed(1)} % vs primer peso` : '';
        p.push(`peso ${m.pesoG} g${pc}${rel}`);
      }
      if (m.talla) p.push(`longitud ${m.talla} cm`);
      if (m.cabeza) p.push(`perímetro cefálico ${m.cabeza} cm`);
      L.push(`- ${fecha(m.t)}: ${p.join(', ')}${m.nota ? ` (${m.nota})` : ''}`);
    }
  } else L.push('\nPESO Y MEDIDAS: sin registros.');

  // Resumen diario 14 días
  L.push('\nRESUMEN POR DÍA (día natural, últimos 14 días; hoy está incompleto):');
  const d0 = dayStart(now);
  for (let i = 13; i >= 0; i--) {
    const ds = d0 - i * DAY, de = Math.min(ds + DAY, now);
    const st = stats(ds, de), fs = feedStats(ds, de);
    const ev = S.events.filter((e) => e.t >= ds && e.t < de);
    if (!ev.length && !st.sueno) continue;
    const colores = ev.filter((e) => e.tipo === 'panal' && e.caca && e.color).map((e) => e.color);
    const ccount = {}; colores.forEach((c) => (ccount[c] = (ccount[c] || 0) + 1));
    L.push(`- ${DIAS[new Date(ds).getDay()].slice(0, 3)} ${fecha(ds).slice(0, 5)}: tomas ${st.tomas} (pecho ${fs.pechoN}, biberones ${st.biberones}${st.ml ? ` = ${st.ml} ml` : ''}); pecho total ${Math.round(st.pechoMs / MIN)} min (izq ${Math.round(st.izq / MIN)}, der ${Math.round(st.der / MIN)}); intervalo medio ${fs.intervalo ? fmtDur(fs.intervalo) : '—'}, máx ${fs.maxI ? fmtDur(fs.maxI) : '—'}; pañales ${st.panales}: pis ${st.pis}, cacas ${st.caca}${Object.keys(ccount).length ? ` (colores: ${Object.entries(ccount).map(([c, n]) => `${c} ${n}`).join(', ')})` : ''}; regurgitaciones ${st.regurg}; sueño ${(st.sueno / HOUR).toFixed(1)} h${st.extraccionMl ? `; extracción ${st.extraccionMl} ml` : ''}`);
  }

  // Detalle 48 h
  L.push('\nREGISTROS DETALLADOS ÚLTIMAS 48 H (más antiguos primero):');
  const det = S.events.filter((e) => e.t >= now - 2 * DAY).sort((a, c) => a.t - c.t);
  if (!det.length) L.push('- (ninguno)');
  for (const e of det) L.push(`- ${fecha(e.t)} ${evTitle(e)}: ${describe(e)}${e.foto ? ' [con foto]' : ''}`);
  if (S.active.pecho) L.push(`EN CURSO: toma de pecho desde ${fmtTime(S.active.pecho.inicio)}, ahora en el ${LADO[S.active.pecho.lado]}.`);
  if (S.active.sueno) L.push(`EN CURSO: durmiendo desde ${fmtTime(S.active.sueno.inicio)}.`);

  // Medicación
  if (S.plans.length) {
    L.push('\nMEDICACIÓN (pautas):');
    for (const pl of S.plans) {
      const st = statusOf(pl, now);
      const logs = medLogs(pl).filter((e) => e.t >= now - 3 * DAY);
      L.push(`- ${pl.persona === 'mama' ? 'MAMÁ' : 'BEBÉ'}: ${pl.nombre}${pl.dosis ? ' ' + pl.dosis : ''} — ${describePlan(pl)}; estado: ${st.estado}${st.proxima ? ` (${st.estado === 'toca' ? 'tocaba' : 'próxima'} ${fecha(st.proxima)})` : ''}; últimos 3 días: ${logs.filter((x) => x.estado !== 'saltada').length} tomadas, ${logs.filter((x) => x.estado === 'saltada').length} saltadas${pl.notas ? `; nota: ${pl.notas}` : ''}`);
    }
  }
  // Agenda y notas
  const up = agendaUpcoming(now).slice(0, 8);
  if (up.length) {
    L.push('\nAGENDA PRÓXIMA:');
    for (const a of up) L.push(`- ${fecha(a.cuando)} ${a.tipo === 'cita' ? 'CITA' : 'RECORDATORIO'}: ${a.titulo}${a.lugar ? ' en ' + a.lugar : ''}`);
  }
  const temas = temasOrdenados().map((t) => ({ t, p: pendientes(t.id) })).filter((x) => x.p.length);
  if (temas.length) {
    L.push('\nNOTAS PENDIENTES:');
    for (const { t, p } of temas) L.push(`- ${t.nombre}: ${p.map((n) => n.texto).join(' | ')}`);
  }
  return L.join('\n');
}

const QUICK = [
  ['¿Cómo vamos? Hazme un resumen de las últimas 24 horas y dime si todo encaja con lo esperado para su edad.', '📋 ¿Cómo vamos?'],
  ['Analiza la evolución de esta semana: tomas, peso, pañales y sueño. ¿Qué tendencias ves?', '📈 Evolución semanal'],
  ['Analiza las fotos de los pañales: color, consistencia y evolución. ¿Es lo esperado para su edad?', '🧷 Analizar pañales'],
  ['Prepárame la lista de preguntas para la próxima visita al pediatra, a partir de los datos y las notas.', '🩺 Preguntas pediatra'],
  ['¿Qué me sugieres apuntar o recordar estos días?', '💡 Sugerencias'],
];

function mdLite(text) {
  const lines = esc(text).split('\n');
  let h = '', inList = false;
  for (let ln of lines) {
    ln = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, '$1<i>$2</i>');
    const li = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { if (!inList) { h += '<ul>'; inList = true; } h += `<li>${li[1]}</li>`; continue; }
    if (inList) { h += '</ul>'; inList = false; }
    const hd = ln.match(/^#{1,4}\s+(.*)/);
    if (hd) h += `<h4>${hd[1]}</h4>`;
    else if (ln.trim()) h += `<p>${ln}</p>`;
  }
  if (inList) h += '</ul>';
  return h;
}

function splitActions(text) {
  const m = text.match(/```acciones\s*([\s\S]*?)```/);
  let acc = [];
  if (m) { try { acc = JSON.parse(m[1]); } catch {} }
  return { texto: text.replace(/```acciones[\s\S]*?```/, '').trim(), acciones: Array.isArray(acc) ? acc.slice(0, 3) : [] };
}

function viewAI() {
  const cfg = aiCfg();
  let h = `<div class="ai-head"><h2 style="margin:0;font-size:22px">✨ Asistente</h2>${loadChat().length ? '<button class="link" style="margin:0;padding:4px" data-action="ai-clear">Borrar conversación</button>' : ''}</div>`;
  if (!cfg.key) {
    return h + `<div class="card">
      <p style="margin-top:0">Para analizar los datos y las fotos con IA, pega aquí tu clave de <b>Google Gemini</b>. Se guarda en vuestra base de datos privada: solo vosotros dos podéis verla y usarla.</p>
      <ol class="steps"><li>Entra en <b>aistudio.google.com/apikey</b> con tu cuenta de Google.</li><li>Pulsa <i>Create API key</i> y cópiala.</li><li>Pégala aquí.</li></ol>
      <div class="field" style="margin-top:12px"><input class="input" id="ai-key" type="password" placeholder="AIza…" autocomplete="off"></div>
      <button class="btn primary block" data-action="ai-savekey">Guardar clave</button>
      <p class="faint" style="font-size:12px;margin-bottom:0">Los datos y fotos que analices se envían a Google. Con la clave gratuita, Google puede usarlos para mejorar sus productos y personas de Google pueden revisarlos. Si activas la facturación en esa clave (nivel de pago, céntimos al mes con este uso), dejan de usarlos.</p>
    </div>`;
  }
  const chat = loadChat();
  h += `<div class="chips-scroll">${QUICK.map(([q, l], i) => `<button class="chip" data-action="ai-quick" data-i="${i}" ${S.aiBusy ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
  if (!chat.length) h += `<div class="card muted" style="font-size:14px">Pregúntame lo que quieras sobre ${esc(S.baby?.nombre || 'el bebé')}: cómo van las tomas, si los pañales son normales para su edad, qué preguntar al pediatra… Veo todos los datos de la app y, si lo pides, las fotos de los pañales.<br><br><span class="faint">No sustituye al pediatra: ante cualquier duda importante, llamadle.</span></div>`;
  h += '<div class="chat">';
  chat.forEach((m, i) => {
    if (m.role === 'user') h += `<div class="msg user">${esc(m.text)}${m.fotos ? `<div class="faint" style="font-size:12px;margin-top:4px">📷 ${pl(m.fotos, "foto adjunta", "fotos adjuntas")}</div>` : ''}</div>`;
    else if (m.error) h += `<div class="msg err">⚠️ ${esc(m.text)}<div style="margin-top:6px;font-size:13px">Prueba la conexión en <button class="link" style="display:inline;margin:0;padding:0;color:inherit;text-decoration:underline" data-action="tab" data-tab="ajustes">⚙️ Ajustes → Asistente IA</button>.</div></div>`;
    else {
      const { texto, acciones } = splitActions(m.text);
      h += `<div class="msg ai">${mdLite(texto)}${acciones.map((a, j) => `<button class="act ${m.hechas?.includes(j) ? 'done' : ''}" data-action="ai-act" data-m="${i}" data-j="${j}" ${m.hechas?.includes(j) ? 'disabled' : ''}>${m.hechas?.includes(j) ? '✓ ' : '＋ '}${a.tipo === 'recordatorio' ? `🔔 ${esc(a.titulo || '')}${a.cuando ? ` · ${esc(String(a.cuando).replace('T', ' '))}` : ''}` : `📝 ${esc(a.texto || '')}`}</button>`).join('')}</div>`;
    }
  });
  if (S.aiBusy) h += `<div class="msg ai"><span class="dots"><i></i><i></i><i></i></span> Analizando…</div>`;
  h += '</div>';
  h += `<form id="ai-form" class="ai-form"><textarea class="input" name="q" rows="1" placeholder="Escribe una pregunta…" ${S.aiBusy ? 'disabled' : ''}></textarea>
    <button class="btn primary" type="submit" ${S.aiBusy ? 'disabled' : ''}>➤</button></form>
    <label class="ai-photos"><input type="checkbox" id="ai-fotos"> Incluir fotos de los últimos pañales</label>`;
  return h;
}

async function sendAI(q, conFotos) {
  const cfg = aiCfg();
  if (!cfg.key || S.aiBusy || !q.trim()) return;
  const chat = loadChat();
  const quiereFotos = conFotos || /foto|pa[ñn]al|caca|heces|deposici/i.test(q);
  let fotos = [];
  if (quiereFotos) { try { fotos = (await S.store.listIn('fotos', 6)).reverse(); } catch {} }
  chat.push({ role: 'user', text: q, fotos: fotos.length || undefined, t: Date.now() });
  S.aiBusy = true; saveChat(); document.activeElement?.blur(); render(); scrollChat();
  const history = chat.slice(-11, -1).filter((m) => !m.error).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  const parts = [{ text: `DATOS ACTUALES DE LA APP:\n${contextoDatos()}\n\n${fotos.length ? `Adjunto ${fotos.length} fotos de pañales (de la más antigua a la más reciente).` : quiereFotos ? 'No hay fotos de pañales guardadas.' : ''}\n\nPREGUNTA: ${q}` }];
  for (const f of fotos) {
    parts.push({ text: `Foto del pañal del ${fecha(f.t)}${f.desc ? ` (registrado como: ${f.desc})` : ''}:` });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: f.data.split(',')[1] } });
  }
  try {
    const text = await askGemini({ key: cfg.key, model: cfg.modelo || 'gemini-flash-latest', system: AI_SYSTEM, history, parts,
      onModel: (m) => S.store.saveIn('config', { id: 'ia', modelo: m }) });
    chat.push({ role: 'model', text, t: Date.now() });
  } catch (e) {
    chat.push({ role: 'model', error: true, text: e.message || String(e), t: Date.now() });
  }
  S.aiBusy = false; saveChat(); render(); scrollChat();
}
function scrollChat() { if (S.tab === 'asistente') setTimeout(() => { const c = document.querySelector('.chat'); if (c && c.lastElementChild) c.lastElementChild.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60); }

document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'ai-form') return;
  ev.preventDefault();
  const q = ev.target.q.value;
  const f = $('#ai-fotos')?.checked;
  ev.target.q.value = '';
  sendAI(q, f);
});
document.addEventListener('keydown', (ev) => {
  if (ev.target.name === 'q' && ev.target.closest('#ai-form') && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.target.form.requestSubmit(); }
});

Object.assign(actions, {
  'ai-quick': (b) => { const [q] = QUICK[+b.dataset.i]; sendAI(q, /pañales/.test(q)); },
  'ai-clear': () => { if (confirm('¿Borrar la conversación de este móvil?')) { S.chat = []; saveChat(); render(); } },
  'ai-savekey': () => {
    const key = $('#ai-key').value.trim();
    if (!/^AIza[\w-]{20,}$/.test(key)) return toast('Esa clave no parece válida (empieza por AIza…)', true);
    document.activeElement?.blur();
    S.aiEditKey = false; S.aiModels = undefined; S.aiTest = null;
    run(S.store.saveIn('config', { id: 'ia', key, modelo: aiCfg().modelo || 'gemini-flash-latest' })).then(() => toast('Clave guardada'));
  },
  'ai-delkey': () => { if (confirm('¿Quitar la clave de Gemini?')) run(S.store.deleteIn('config', 'ia')); },
  'ai-savemodel': () => { const m = $('#s-aimodel').value.trim(); if (m) run(S.store.saveIn('config', { id: 'ia', modelo: m })).then(() => toast('Guardado')); },
  'ai-act': (b) => {
    const m = loadChat()[+b.dataset.m]; if (!m) return;
    const a = splitActions(m.text).acciones[+b.dataset.j]; if (!a) return;
    if (a.tipo === 'recordatorio') {
      const cuando = new Date(a.cuando).getTime();
      run(S.store.saveIn('agenda', { tipo: 'recordatorio', titulo: a.titulo || 'Recordatorio', cuando: isNaN(cuando) ? Date.now() + DAY : cuando, hecho: false, autor: me(), persona: '' }));
      toast('Recordatorio añadido a la Agenda');
    } else {
      seedTemas();
      const tema = ['pediatra', 'matrona', 'compras', 'otros'].includes(a.tema) ? a.tema : 'otros';
      run(S.store.saveIn('notas', { temaId: tema, texto: a.texto || '', hecho: false, t: Date.now(), autor: me() }));
      toast('Nota añadida');
    }
    m.hechas = [...(m.hechas || []), +b.dataset.j]; saveChat(); render();
  },
});

// ---- ajustes del asistente: clave, desplegable de modelos y prueba de conexión
function aiSettings() {
  const cfg = aiCfg();
  const cur = cfg.modelo || 'gemini-flash-latest';
  const models = Array.isArray(S.aiModels) ? S.aiModels : [];
  const opts = [...models];
  if (!opts.some((m) => m.id === cur)) opts.unshift({ id: cur, nombre: cur });
  if (!opts.some((m) => m.id === 'gemini-flash-latest')) opts.unshift({ id: 'gemini-flash-latest', nombre: 'Flash más reciente (automático)' });
  if (cfg.key && S.aiModels === undefined) setTimeout(loadAiModels, 0);
  const t = S.aiTest;
  return `
    <div class="field"><label>Clave de Gemini</label>
      ${cfg.key ? `<div class="kv" style="padding-top:0"><span>••••••••${esc(cfg.key.slice(-4))}</span><button class="link" style="margin:0;padding:0" data-action="ai-changekey">Cambiar</button></div>` : ''}
      <div id="ai-keybox" class="${cfg.key && !S.aiEditKey ? 'hidden' : ''}">
        <input class="input" id="ai-key" type="password" placeholder="AIza…" autocomplete="off">
        <button class="btn primary block" style="margin-top:8px" data-action="ai-savekey">Guardar clave</button>
        <div class="faint" style="font-size:12px;margin-top:6px">Consíguela en aistudio.google.com/apikey → Create API key.</div>
      </div></div>
    ${cfg.key ? `
    <div class="field"><label>Modelo</label>
      <select class="input" id="s-aimodel">${opts.map((m) => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.id === 'gemini-flash-latest' ? 'Automático (Flash más reciente)' : m.nombre || m.id)}</option>`).join('')}</select>
      <div class="faint" style="font-size:12px;margin-top:6px">${S.aiModels === 'loading' ? 'Cargando modelos disponibles…' : models.length ? `${models.length} modelos disponibles para tu clave. Recomendado: un “Flash”.` : S.aiModelsErr ? `<span style="color:var(--danger)">No se pudieron cargar los modelos: ${esc(S.aiModelsErr)}</span>` : ''}</div></div>
    <div class="grid2">
      <button class="btn" data-action="ai-loadmodels">🔄 Recargar lista</button>
      <button class="btn primary" data-action="ai-test" ${t === 'loading' ? 'disabled' : ''}>${t === 'loading' ? 'Probando…' : '🧪 Probar conexión'}</button>
    </div>
    ${t && t !== 'loading' ? `<div class="banner ${t.ok ? 'info' : 'err'}" style="margin:12px 0 0">${t.ok ? `✅ Conectado con <b>${esc(t.model)}</b> en ${(t.ms / 1000).toFixed(1).replace('.', ',')} s. Respuesta: “${esc(t.text.slice(0, 60))}”` : `❌ ${esc(t.error)}`}</div>` : ''}
    <button class="link danger" data-action="ai-delkey">Quitar clave</button>` : ''}`;
}

async function loadAiModels() {
  const key = aiCfg().key; if (!key) return;
  S.aiModels = 'loading'; S.aiModelsErr = null; render();
  try { S.aiModels = await listModels(key); }
  catch (e) { S.aiModels = []; S.aiModelsErr = e.message; }
  render();
}

Object.assign(actions, {
  'ai-changekey': () => { S.aiEditKey = true; render(); setTimeout(() => $('#ai-key')?.focus(), 50); },
  'ai-loadmodels': () => loadAiModels(),
  'ai-test': async () => {
    const key = aiCfg().key; if (!key) return;
    const sel = $('#s-aimodel');
    const model = sel ? sel.value : aiCfg().modelo || 'gemini-flash-latest';
    if (sel && model !== (aiCfg().modelo || 'gemini-flash-latest')) S.store.saveIn('config', { id: 'ia', modelo: model });
    document.activeElement?.blur();
    S.aiTest = 'loading'; render();
    try { const r = await testConnection(key, model); S.aiTest = { ok: true, model, ...r }; }
    catch (e) { S.aiTest = { ok: false, error: e.message || String(e) }; }
    render();
  },
});
document.addEventListener('change', (ev) => {
  if (ev.target.id !== 's-aimodel') return;
  run(S.store.saveIn('config', { id: 'ia', modelo: ev.target.value })).then(() => toast('Modelo guardado'));
  S.aiTest = null;
});
