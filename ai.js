// Llamadas a la API de Gemini desde el navegador.
// La clave se guarda en Firestore (solo accesible para vuestras cuentas), nunca en el código.
const API = 'https://generativelanguage.googleapis.com/v1beta';

export class AiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function post(model, key, body) {
  let r;
  try {
    r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError(`No se pudo conectar con Gemini (${e.message}). Revisa la conexión a internet.`, 'network');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = `${j.error?.message || 'Error'} (HTTP ${r.status}${j.error?.status ? ' ' + j.error.status : ''})`;
    if (r.status === 404) throw new AiError(msg, 'model');
    if (r.status === 400 && /api key/i.test(msg)) throw new AiError('La clave de Gemini no es válida.', 'key');
    if (r.status === 403) throw new AiError('La clave de Gemini no tiene permiso (revisa que la API esté activada).', 'key');
    if (r.status === 429) throw new AiError('Se ha superado el límite de uso de Gemini. Espera un poco y vuelve a intentarlo.', 'quota');
    throw new AiError(msg, 'other');
  }
  const cand = j.candidates && j.candidates[0];
  const text = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  if (!text) {
    const why = cand?.finishReason || j.promptFeedback?.blockReason || 'sin respuesta';
    throw new AiError(why === 'MAX_TOKENS' ? 'La respuesta se ha cortado por longitud. Prueba una pregunta más concreta u otro modelo.' : `Gemini no ha devuelto respuesta (${why}).`, 'empty');
  }
  return text;
}

// Modelos de texto+imagen disponibles para la clave, del más reciente al más antiguo.
export async function listModels(key) {
  let r;
  try { r = await fetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(key)}`); }
  catch (e) { throw new AiError(`No se pudo conectar con Gemini (${e.message}).`, 'network'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AiError(`${j.error?.message || 'No se pudo consultar los modelos'} (HTTP ${r.status})`, 'key');
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  const list = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), nombre: m.displayName || m.name }))
    .filter((m) => /gemini/.test(m.id) && !/(image|tts|live|audio|embed|robotics|computer|native)/.test(m.id));
  const rank = (id) => (/latest/.test(id) ? 3 : 0) + (/preview|exp/.test(id) ? -1 : 0) + (/lite/.test(id) ? -0.5 : 0) + (/pro/.test(id) ? 0.2 : 0);
  list.sort((a, b) => (/latest/.test(b.id) - /latest/.test(a.id)) || ver(b.id) - ver(a.id) || rank(b.id) - rank(a.id) || a.id.localeCompare(b.id));
  return list;
}

// Si el modelo configurado no existe, elige el Flash más reciente disponible (estable si lo hay).
export async function pickModel(key) {
  const ids = (await listModels(key)).map((m) => m.id);
  const flash = ids.filter((n) => /flash/.test(n) && !/lite/.test(n));
  const best = flash.find((n) => !/preview|exp/.test(n)) || flash[0] || ids[0];
  if (!best) throw new AiError('No hay ningún modelo de Gemini disponible para esta clave.', 'model');
  return best;
}

// Prueba rápida de conexión: pide una respuesta mínima y mide el tiempo.
export async function testConnection(key, model) {
  const t0 = performance.now();
  const text = await post(model, key, {
    contents: [{ role: 'user', parts: [{ text: 'Responde únicamente con la palabra: OK' }] }],
    generationConfig: { temperature: 0 },
  });
  return { text: text.trim(), ms: Math.round(performance.now() - t0) };
}

export async function askGemini({ key, model, system, history, parts, onModel }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...history, { role: 'user', parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
  };
  try {
    return await post(model, key, body);
  } catch (e) {
    if (e.code !== 'model') throw e;
    const m = await pickModel(key);
    onModel && onModel(m);
    return post(m, key, body);
  }
}
