// Sonidos generados en el propio móvil (Web Audio): nanas tipo caja de música y ruidos relajantes.
// Melodías de dominio público: Brahms (1868), "Estrellita" (s. XVIII) y "Martinillo" (tradicional).

const MELODIAS = {
  brahms: { titulo: 'Canción de cuna (Brahms)', bpm: 84, notas: [
    [64, .5], [64, .5], [67, 2], [64, .5], [64, .5], [67, 2], [64, .5], [67, .5], [72, 1], [71, 1.5], [69, .5],
    [69, 1], [67, 1], [62, .5], [64, .5], [65, 1], [62, 1], [62, .5], [64, .5], [65, 2], [62, .5], [65, .5],
    [71, .5], [69, .5], [67, 1], [71, 1], [72, 2], [60, .5], [60, .5], [72, 2], [69, .5], [65, .5], [67, 2], [64, .5], [60, .5],
    [65, 1], [67, 1], [69, 1], [67, 2], [60, .5], [60, .5], [72, 2], [69, .5], [65, .5], [67, 2], [64, .5], [60, .5],
    [65, 1], [64, 1], [62, 1], [60, 3]] },
  estrellita: { titulo: 'Estrellita, ¿dónde estás?', bpm: 92, notas: [
    [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
    [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2], [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
    [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 3]] },
  martinillo: { titulo: 'Martinillo', bpm: 88, notas: [
    [60, 1], [62, 1], [64, 1], [60, 1], [60, 1], [62, 1], [64, 1], [60, 1], [64, 1], [65, 1], [67, 2], [64, 1], [65, 1], [67, 2],
    [67, .5], [69, .5], [67, .5], [65, .5], [64, 1], [60, 1], [67, .5], [69, .5], [67, .5], [65, .5], [64, 1], [60, 1],
    [60, 1], [55, 1], [60, 2], [60, 1], [55, 1], [60, 3]] },
};

export const SONIDOS = [
  { id: 'brahms', tipo: 'melodia', icon: '🎼', titulo: MELODIAS.brahms.titulo },
  { id: 'estrellita', tipo: 'melodia', icon: '⭐', titulo: MELODIAS.estrellita.titulo },
  { id: 'martinillo', tipo: 'melodia', icon: '🔔', titulo: MELODIAS.martinillo.titulo },
  { id: 'blanco', tipo: 'ruido', icon: '🌫️', titulo: 'Ruido blanco' },
  { id: 'rosa', tipo: 'ruido', icon: '🌸', titulo: 'Ruido rosa (más suave)' },
  { id: 'marron', tipo: 'ruido', icon: '🌧️', titulo: 'Lluvia (ruido marrón)' },
  { id: 'olas', tipo: 'ruido', icon: '🌊', titulo: 'Olas del mar' },
  { id: 'latido', tipo: 'latido', icon: '💓', titulo: 'Latido (como en la tripa)' },
];

let ctx = null, master = null, nodes = [], timers = [], playing = null, endAt = null, volumen = 0.5;
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f({ playing, endAt }));

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volumen; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function nota(t, midi, dur) {
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o1.type = 'sine'; o2.type = 'triangle';
  o1.frequency.value = hz(midi + 12); o2.frequency.value = hz(midi + 24);
  const g2 = ctx.createGain(); g2.gain.value = 0.15;
  o1.connect(g); o2.connect(g2).connect(g); g.connect(master);
  const len = Math.max(1.2, dur * 1.6);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o1.start(t); o2.start(t); o1.stop(t + len + 0.05); o2.stop(t + len + 0.05);
}

function tocarMelodia(id) {
  const m = MELODIAS[id];
  const beat = 60 / m.bpm;
  const ciclo = () => {
    let t = ctx.currentTime + 0.1;
    for (const [n, b] of m.notas) { nota(t, n, b * beat); t += b * beat; }
    const total = m.notas.reduce((s, [, b]) => s + b, 0) * beat + 1.5;
    timers.push(setTimeout(() => { if (playing === id) ciclo(); }, total * 1000));
  };
  ciclo();
}

function bufferRuido(tipo) {
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (tipo === 'blanco') d[i] = w * 0.25;
    else if (tipo === 'rosa') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.06; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 2.5; }
  }
  return buf;
}

function tocarRuido(id) {
  const src = ctx.createBufferSource();
  src.buffer = bufferRuido(id === 'olas' ? 'marron' : id); src.loop = true;
  const g = ctx.createGain(); g.gain.value = 0.9;
  src.connect(g).connect(master);
  if (id === 'olas') {
    g.gain.value = 0.55;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 0.45;
    lfo.connect(lg).connect(g.gain); lfo.start(); nodes.push(lfo);
  }
  src.start(); nodes.push(src);
}

function tocarLatido() {
  const golpe = (t, f, v) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.15);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.3);
  };
  const ciclo = () => {
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < 8; i++) { golpe(t, 62, 0.9); golpe(t + 0.28, 55, 0.6); t += 60 / 72; }
    timers.push(setTimeout(() => { if (playing === 'latido') ciclo(); }, 8 * (60 / 72) * 1000 - 100));
  };
  ciclo();
}

export function play(id, minutos) {
  stop(false);
  ac();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(volumen, ctx.currentTime);
  playing = id;
  const s = SONIDOS.find((x) => x.id === id);
  if (s.tipo === 'melodia') tocarMelodia(id); else if (s.tipo === 'ruido') tocarRuido(id); else tocarLatido();
  endAt = minutos ? Date.now() + minutos * 60000 : null;
  if (minutos) timers.push(setTimeout(() => stop(true), minutos * 60000));
  emit();
}

export function stop(fade = true) {
  timers.forEach(clearTimeout); timers = [];
  const ns = nodes; nodes = [];
  if (ctx && fade && playing) {
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 3);
    setTimeout(() => ns.forEach((n) => { try { n.stop(); } catch {} }), 3100);
  } else ns.forEach((n) => { try { n.stop(); } catch {} });
  const was = playing; playing = null; endAt = null;
  if (was) emit();
}

export function setVolumen(v) { volumen = v; if (ctx && playing) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }
export const estado = () => ({ playing, endAt, volumen });

// ---- Tarjetas de alto contraste (SVG)
const B = '#111', W = '#fff', R = '#d62828';
export const TARJETAS = [
  { id: 'diana', titulo: 'Diana', svg: () => [140, 112, 84, 56, 28].map((r, i) => `<circle cx="150" cy="150" r="${r}" fill="${i % 2 ? W : B}"/>`).join('') },
  { id: 'damero', titulo: 'Damero', svg: () => { let s = ''; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) s += `<rect x="${i * 75}" y="${j * 75}" width="75" height="75" fill="${B}"/>`; return s; } },
  { id: 'rayas', titulo: 'Rayas', svg: () => [0, 1, 2, 3, 4].map((i) => `<rect x="${i * 60}" y="0" width="30" height="300" fill="${B}"/>`).join('') },
  { id: 'cara', titulo: 'Cara', svg: () => `<circle cx="150" cy="150" r="120" fill="none" stroke="${B}" stroke-width="16"/><circle cx="108" cy="125" r="20" fill="${B}"/><circle cx="192" cy="125" r="20" fill="${B}"/><path d="M95 190 Q150 240 205 190" fill="none" stroke="${B}" stroke-width="16" stroke-linecap="round"/>` },
  { id: 'zigzag', titulo: 'Zigzag', svg: () => [40, 110, 180, 250].map((y) => `<polyline points="0,${y} 50,${y - 35} 100,${y} 150,${y - 35} 200,${y} 250,${y - 35} 300,${y}" fill="none" stroke="${B}" stroke-width="18"/>`).join('') },
  { id: 'puntos', titulo: 'Lunares', svg: () => { let s = ''; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += `<circle cx="${60 + i * 90}" cy="${60 + j * 90}" r="30" fill="${B}"/>`; return s; } },
  { id: 'espiral', titulo: 'Espiral', svg: () => { let d = 'M150 150'; for (let a = 0; a < Math.PI * 10; a += 0.15) { const r = 4 + a * 4.2; d += ` L${(150 + r * Math.cos(a)).toFixed(1)} ${(150 + r * Math.sin(a)).toFixed(1)}`; } return `<path d="${d}" fill="none" stroke="${B}" stroke-width="12" stroke-linecap="round"/>`; } },
  { id: 'estrella', titulo: 'Estrella', svg: () => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 55 : 130; p.push(`${(150 + r * Math.cos(a)).toFixed(1)},${(150 + r * Math.sin(a)).toFixed(1)}`); } return `<polygon points="${p.join(' ')}" fill="${B}"/>`; } },
  { id: 'roja', titulo: 'Diana roja (2-4 meses)', svg: () => [140, 105, 70, 35].map((r, i) => `<circle cx="150" cy="150" r="${r}" fill="${[R, W, B, R][i]}"/>`).join('') },
  { id: 'cuadros-rojos', titulo: 'Cuadros rojos (2-4 meses)', svg: () => { let s = ''; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += `<rect x="${i * 100 + 10}" y="${j * 100 + 10}" width="80" height="80" fill="${(i + j) % 2 ? R : B}"/>`; return s; } },
];
export const tarjetaSvg = (t, size = '100%') => `<svg viewBox="0 0 300 300" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#fff"/>${t.svg()}</svg>`;
