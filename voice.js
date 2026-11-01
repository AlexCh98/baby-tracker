// Control por voz con palabra clave (Web Speech API).
// Funciona con la app abierta y la pantalla encendida; el reconocimiento lo hace el navegador.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- números hablados
const UNI = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, trescientos: 300 };
export function findNumber(text) {
  const d = text.match(/\d+([.,]\d+)?/);
  if (d) return parseFloat(d[0].replace(',', '.'));
  const words = text.split(' ');
  let total = null;
  for (const w of words) {
    if (w in UNI) { total = (total || 0) + UNI[w]; }
    else if (w === 'y' && total !== null) continue;
    else if (total !== null) break;
  }
  return total;
}

// ---------------------------------------------------------------- intérprete de órdenes
const has = (t, ...words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));
const lado = (t) => (has(t, 'izquierd[oa]', 'izquierda') ? 'izq' : has(t, 'derech[oa]') ? 'der' : null);

export function parseCommand(raw) {
  const t = norm(raw);
  if (!t) return null;

  // Deshacer
  if (has(t, 'deshaz', 'deshacer', 'anula', 'borra (lo|el) ultimo', 'me he equivocado')) return { type: 'deshacer' };

  // Preguntas
  if (has(t, 'que pecho', 'cual (le )?toca', 'que lado')) return { type: 'q-pecho' };
  if (has(t, 'cuanto lleva', 'cuanto tiempo lleva')) return { type: 'q-duracion' };
  if (has(t, 'cuando', 'hace cuanto', 'ultima', 'ultimo')) {
    if (has(t, 'pañal', 'panal', 'cambi\\w*', 'pis', 'caca')) return { type: 'q-panal' };
    if (has(t, 'dormi\\w*', 'despert\\w*', 'sueño', 'sueno')) return { type: 'q-sueno' };
    if (has(t, 'regurgit\\w*', 'vomit\\w*', 'echado')) return { type: 'q-regurgitacion' };
    return { type: 'q-toma' };
  }
  if (has(t, 'resumen', 'como va el dia', 'como vamos', 'cuantas tomas')) return { type: 'q-resumen' };

  // Regurgitación
  if (has(t, 'regurgit\\w*', 'vomit\\w*', 'ha echado', 'echado leche', 'bocanada', 'ha devuelto')) {
    const cantidad = has(t, 'mucho', 'mucha', 'bastante', 'todo') ? 'mucha' : has(t, 'poco', 'poca', 'poquito', 'un poco') ? 'poca' : 'media';
    return { type: 'regurgitacion', cantidad, proyectil: has(t, 'proyectil', 'chorro') };
  }

  // Pañal
  if (has(t, 'pañal', 'panal', 'pis', 'caca', 'cagado', 'meado', 'pipi')) {
    const pis = has(t, 'pis', 'pipi', 'meado', 'mojado', 'ambos', 'las dos', 'los dos', 'de todo');
    const caca = has(t, 'caca', 'cagado', 'sucio', 'ambos', 'las dos', 'los dos', 'de todo');
    if (!pis && !caca) return { type: 'panal-pregunta' };
    return { type: 'panal', pis, caca };
  }

  // Biberón
  if (has(t, 'biberon', 'bibe')) {
    const ml = findNumber(t);
    const leche = has(t, 'materna', 'de mama', 'extraida') ? 'materna' : 'formula';
    if (!ml) return { type: 'biberon-pregunta', leche };
    return { type: 'biberon', ml, leche };
  }

  // Sueño
  if (has(t, 'se ha despertado', 'despert\\w*', 'despierto', 'despierta')) return { type: 'sueno-fin' };
  if (has(t, 'se ha dormido', 'dormid[oa]', 'a dormir', 'duerme', 'dormir', 'siesta')) return { type: 'sueno-inicio' };

  // Medicación diaria
  if (has(t, 'vitamina')) return { type: 'vitamina' };

  // Toma de pecho
  if (has(t, 'cambia', 'cambio', 'otro pecho', 'otro lado')) return { type: 'pecho-cambiar', lado: lado(t) };
  if (has(t, 'pausa', 'para la toma', 'parar')) return { type: 'pecho-pausa' };
  if (has(t, 'sigue', 'continua', 'reanuda', 'seguir')) return { type: 'pecho-seguir' };
  if (has(t, 'termin\\w*', 'acab\\w*', 'fin de', 'finaliza', 'ya esta', 'ha comido')) return { type: 'pecho-terminar' };
  if (has(t, 'pecho', 'teta', 'toma', 'empieza', 'inicia', 'comienza', 'a comer')) return { type: 'pecho-inicio', lado: lado(t) };

  return { type: 'desconocido', texto: raw };
}

// ---------------------------------------------------------------- motor de escucha
export function createVoice({ onIntent, onState, getWakeWord }) {
  let rec = null;
  let enabled = false;      // modo palabra clave activo
  let armedUntil = 0;       // tras decir la palabra clave, escuchamos la orden
  let once = false;         // escucha puntual (botón micrófono)
  let speaking = false;
  let restartTimer = null;
  let failures = 0;
  let wakeLock = null;
  let pendingFollowUp = null;

  const state = (s, extra = {}) => onState && onState({ state: s, enabled, ...extra });

  function beep(f = 880, ms = 120) {
    try {
      const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + ms / 1000 + 0.02);
    } catch {}
  }

  function speak(text, then) {
    if (!('speechSynthesis' in window) || !text) { then && then(); return; }
    speaking = true;
    stopRec();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 1.05;
    const es = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('es-es')) || speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('es'));
    if (es) u.voice = es;
    const done = () => { speaking = false; then && then(); scheduleRestart(150); };
    u.onend = done; u.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setTimeout(() => { if (speaking) done(); }, 8000);
  }

  function stopRec() {
    clearTimeout(restartTimer);
    if (rec) { try { rec.onend = null; rec.abort(); } catch {} rec = null; }
  }

  function scheduleRestart(ms) {
    clearTimeout(restartTimer);
    if (!(enabled || once || pendingFollowUp) || speaking || document.hidden) return;
    restartTimer = setTimeout(startRec, ms);
  }

  function handleText(text, isFinal) {
    const t = norm(text);
    const wake = norm(getWakeWord());
    const now = Date.now();

    if (pendingFollowUp && isFinal) {
      const fn = pendingFollowUp; pendingFollowUp = null;
      fn(text);
      return;
    }

    let command = null;
    if (once) {
      if (!isFinal) { state('escuchando', { texto: text }); return; }
      once = false; command = text;
    } else if (armedUntil > now) {
      if (!isFinal) { state('escuchando', { texto: text }); return; }
      command = wake && t.includes(wake) ? t.slice(t.lastIndexOf(wake) + wake.length) : text;
      armedUntil = 0;
    } else if (wake && t.includes(wake)) {
      const after = t.slice(t.lastIndexOf(wake) + wake.length).trim();
      if (!isFinal) { state('escuchando', { texto: after }); return; }
      if (after.split(' ').length >= 1 && after.length > 1) command = after;
      else { armedUntil = now + 7000; beep(); state('escuchando', { texto: '' }); setTimeout(() => { if (armedUntil && Date.now() > armedUntil) { armedUntil = 0; state('esperando'); } }, 7200); return; }
    } else {
      return; // conversación normal: se ignora
    }

    beep(1200, 80);
    const intent = parseCommand(command);
    state('procesando', { texto: command });
    if (intent) onIntent(intent, api);
    if (!enabled) setTimeout(() => state('apagado'), 2500);
    else setTimeout(() => { if (!speaking && !armedUntil) state('esperando'); }, 2500);
  }

  function startRec() {
    if (!SR || rec || speaking) return;
    rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      failures = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        handleText(r[0].transcript, r.isFinal);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        enabled = false; once = false;
        state('error', { error: e.error === 'not-allowed'
          ? 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador.'
          : 'Este navegador no permite el reconocimiento de voz aquí. En iPhone, abre la app desde Safari (no desde el icono de inicio).' });
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        failures++;
      }
    };
    rec.onend = () => {
      rec = null;
      if (once && !pendingFollowUp) { once = false; state(enabled ? 'esperando' : 'apagado'); }
      scheduleRestart(Math.min(5000, 250 * Math.pow(2, failures)));
    };
    try { rec.start(); } catch { rec = null; scheduleRestart(1000); }
  }

  async function lockScreen() {
    try { if ('wakeLock' in navigator && !wakeLock && !document.hidden) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopRec(); }
    else if (enabled) { lockScreen(); scheduleRestart(300); }
  });

  const api = {
    get enabled() { return enabled; },
    speak,
    ask(question, handler) { pendingFollowUp = handler; speak(question, () => { beep(); state('escuchando', { texto: '' }); }); setTimeout(() => { if (pendingFollowUp === handler) { pendingFollowUp = null; state(enabled ? 'esperando' : 'apagado'); } }, 12000); },
    enable() {
      if (!SR) return false;
      enabled = true; failures = 0;
      lockScreen();
      state('esperando');
      startRec();
      return true;
    },
    disable() {
      enabled = false; armedUntil = 0; once = false; pendingFollowUp = null;
      stopRec();
      try { wakeLock && wakeLock.release(); } catch {}
      wakeLock = null;
      state('apagado');
    },
    listenOnce() {
      if (!SR) return false;
      once = true;
      beep();
      state('escuchando', { texto: '' });
      if (rec) { /* ya escuchando: la próxima frase se toma como orden */ } else startRec();
      setTimeout(() => { if (once) { once = false; state(enabled ? 'esperando' : 'apagado'); } }, 9000);
      return true;
    },
  };
  return api;
}
