// Pautas de medicación: cálculo de horarios, estado y exportación a calendario.
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const PERSONAS = { mama: 'Mamá', bebe: 'Bebé' };

export function planEnd(plan) {
  return plan.dias ? plan.inicio + plan.dias * DAY : null;
}

export function parseHoras(txt) {
  const out = [];
  for (const m of String(txt || '').matchAll(/(\d{1,2})(?:[:.h ](\d{2}))?/g)) {
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h < 24 && mi < 60) out.push(`${pad(h)}:${pad(mi)}`);
  }
  return [...new Set(out)].sort();
}

// Todas las dosis programadas entre from y to (incluidos).
export function planSlots(plan, from, to) {
  const out = [];
  const end = planEnd(plan);
  const lim = end ? Math.min(to, end - 1) : to;
  if (plan.modo === 'horas') {
    const horas = plan.horas || [];
    if (!horas.length) return out;
    const d = new Date(Math.max(from, plan.inicio)); d.setHours(0, 0, 0, 0);
    for (let day = d.getTime(), n = 0; day <= lim && n < 400; n++) {
      for (const h of horas) {
        const [hh, mm] = h.split(':').map(Number);
        const x = new Date(day); x.setHours(hh, mm, 0, 0);
        const t = x.getTime();
        if (t >= from && t <= lim && t >= plan.inicio - MIN) out.push(t);
      }
      const nx = new Date(day); nx.setDate(nx.getDate() + 1); day = nx.getTime();
    }
    return out;
  }
  const step = (plan.cadaH || 8) * HOUR;
  let k = Math.max(0, Math.ceil((from - plan.inicio) / step));
  for (let t = plan.inicio + k * step, n = 0; t <= lim && n < 1000; t += step, n++) out.push(t);
  return out;
}

// Estado actual de una pauta. logs: registros de esa pauta, del más reciente al más antiguo.
export function planStatus(plan, logs, now = Date.now()) {
  const end = planEnd(plan);
  if (plan.activo === false) return { estado: 'pausada' };
  const last = logs[0];
  if (plan.modo !== 'horas' && plan.desdeToma && last) {
    const next = last.t + (plan.cadaH || 8) * HOUR;
    if (end && next >= end) return { estado: 'terminada' };
    return { estado: next <= now ? 'toca' : 'pendiente', proxima: next };
  }
  const lastProg = last ? (last.programada ?? last.t) : -Infinity;
  const pasadas = planSlots(plan, Math.max(lastProg + MIN, now - 2 * DAY, plan.inicio - MIN), now);
  if (pasadas.length) return { estado: 'toca', proxima: pasadas[pasadas.length - 1], perdidas: pasadas.length - 1 };
  const next = planSlots(plan, Math.max(now + 1, lastProg + MIN), now + 10 * DAY)[0];
  if (!next) return { estado: end && now >= end ? 'terminada' : 'sin-dosis' };
  return { estado: 'pendiente', proxima: next };
}

function horasDelDia(plan) {
  const h = plan.cadaH;
  if (!h || 24 % h !== 0 || 24 / h > 6) return '';
  const d = new Date(plan.inicio);
  const base = d.getHours() * 60 + d.getMinutes();
  const list = [];
  for (let i = 0; i < 24 / h; i++) list.push((base + i * h * 60) % 1440);
  return 'a las ' + list.sort((a, b) => a - b).map((m) => `${Math.floor(m / 60)}:${pad(m % 60)}`).join(', ');
}

export function describePlan(plan) {
  const hora = (t) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}`; };
  let s = plan.modo === 'horas'
    ? `A las ${(plan.horas || []).map((h) => h.replace(/^0/, '')).join(', ')}`
    : `Cada ${String(plan.cadaH).replace('.', ',')} h${plan.desdeToma ? ' desde la última toma' : ` · ${horasDelDia(plan) || `desde las ${hora(plan.inicio)}`}`}`;
  const end = planEnd(plan);
  if (end) {
    const d = new Date(end - 1);
    s += ` · hasta el ${d.getDate()}/${d.getMonth() + 1}`;
  }
  return s;
}

// Fichero .ics con una alarma por dosis (para el calendario del móvil).
export function planIcs(plan, now = Date.now()) {
  const end = planEnd(plan);
  const to = end || now + 14 * DAY;
  const slots = planSlots(plan, now, to).slice(0, 200);
  const z = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const quien = PERSONAS[plan.persona] || '';
  const title = `💊 ${plan.nombre}${plan.dosis ? ' ' + plan.dosis : ''} (${quien.toLowerCase()})`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Monitor Bebe//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const t of slots) {
    lines.push('BEGIN:VEVENT', `UID:${plan.id}-${t}@monitor-bebe`, `DTSTAMP:${z(now)}`, `DTSTART:${z(t)}`, `DTEND:${z(t + 10 * MIN)}`,
      `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(plan.notas || 'Recordatorio de Monitor Bebé')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return { text: lines.join('\r\n'), count: slots.length, hasta: to };
}
