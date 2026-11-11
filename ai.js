// Llamadas a la API de Gemini desde el navegador.
// La clave se guarda en Firestore (solo accesible para vuestras cuentas), nunca en el código.
const API = 'https://generativelanguage.googleapis.com/v1beta';

export class AiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function post(model, key, body) {
  const r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || `Error ${r.status}`;
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
    throw new AiError(`Gemini no ha devuelto respuesta (${why}).`, 'empty');
  }
  return text;
}

// Si el modelo configurado no existe, busca el Flash más reciente disponible para la clave.
export async function pickModel(key) {
  const r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AiError(j.error?.message || 'No se pudo consultar los modelos', 'key');
  const ok = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && !/(lite|image|tts|live|audio|embed|thinking|exp|preview)/.test(n));
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  ok.sort((a, b) => ver(b) - ver(a) || a.length - b.length);
  if (!ok.length) throw new AiError('No hay ningún modelo Flash disponible para esta clave.', 'model');
  return ok[0];
}

export async function askGemini({ key, model, system, history, parts, onModel }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...history, { role: 'user', parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
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
