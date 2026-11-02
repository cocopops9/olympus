// Olympus: the coaches' ears and voice, on the server.
//
// Ears: what the phone recorded (a short clip, webm/opus or mp4/aac) is written out by Whisper on
// Groq, the provider the coaches already use (HERCULES_API_KEY or GROQ_API_KEY): accurate in every
// language and the same on every phone. Android's own recogniser, asked from the app, failed on
// many phones with a bare "client side error".
//
// Voice: Chiron speaks with a deep, gravelly man's voice, Hercules a firm man's, Athena a woman's,
// in the language of the app. Two sources, the first the server has a key for:
//   Google Cloud Text-to-Speech, Chirp 3 HD voices (GOOGLE_TTS_API_KEY, needs a billing account);
//   Gemini speech generation, the same voices (GEMINI_API_KEY, a free key from Google AI Studio,
//   no card, within the free quota).
// With neither, or when they fail, the phone reads with its own voices (lib/voice.js).
//
// Shared by api/server.js and the Supabase function.

export class VoiceError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export const VOICE_LIMITS = Object.freeze({ clipBytes: 1_500_000, textChars: 900 });

const MIME = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', mpeg: 'audio/mpeg' };
const extOf = type => {
  const t = String(type || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'mp4';
  if (t.includes('wav')) return 'wav';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mpeg';
  return null;
};
const langOf = v => (/^[a-z]{2}/i.test(String(v || '')) ? String(v).slice(0, 2).toLowerCase() : null);

function bytesOf(data) {
  const b64 = String(data || '').replace(/^data:[^,]*,/, '');
  if (!b64 || b64.length > VOICE_LIMITS.clipBytes * 1.4) throw new VoiceError(413, 'the recording is too long', 'clip-large');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (out.length < 600) throw new VoiceError(400, 'the recording is empty', 'clip-empty');
  return out;
}

// A sentence of what is said between sets, in each language Whisper is asked in.
const HINT = {
  en: 'Chiron, how long should I rest? Bench press, 80 kilos for 6 reps, 3 sets. Squat, deadlift, pull-ups.',
  it: 'Chirone, quanto devo recuperare? Panca piana, 80 chili per 6 ripetizioni, 3 serie. Squat, stacco, trazioni.',
  es: 'Quirón, ¿cuánto debo descansar? Press de banca, 80 kilos por 6 repeticiones, 3 series. Sentadilla, peso muerto, dominadas.',
  fr: 'Chiron, combien de repos ? Développé couché, 80 kilos pour 6 répétitions, 3 séries. Squat, soulevé de terre, tractions.',
  de: 'Chiron, wie lange Pause? Bankdrücken, 80 Kilo für 6 Wiederholungen, 3 Sätze. Kniebeugen, Kreuzheben, Klimmzüge.',
  pt: 'Quíron, quanto devo descansar? Supino, 80 quilos para 6 repetições, 3 séries. Agachamento, levantamento terra, barra fixa.',
};

/** The words in a recorded clip ({ data: base64, type, lang }), or '' when nothing was said. */
export async function transcribe({ data, type, lang } = {}, { key, baseUrl = 'https://api.groq.com/openai/v1', model = 'whisper-large-v3', fetchImpl = globalThis.fetch } = {}) {
  if (!key) throw new VoiceError(503, 'voice is not set up on this server', 'voice-off');
  const ext = extOf(type);
  if (!ext) throw new VoiceError(400, 'unknown recording format', 'clip-format');
  const bytes = bytesOf(data);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: MIME[ext] }), 'clip.' + ext);
  form.append('model', model);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  // The person speaks the app's language: Whisper is told which, and given a sentence of gym talk in
  // it, so the words it expects (sets, reps, rest, the lifts) are the ones it hears.
  const l = langOf(lang);
  if (l) form.append('language', l);
  if (HINT[l]) form.append('prompt', HINT[l]);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetchImpl(baseUrl.replace(/\/+$/, '') + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form, signal: ctl.signal });
    if (!r.ok) {
      const why = await r.text().catch(() => '');
      console.error('transcribe', r.status, why.slice(0, 300));
      throw new VoiceError(502, 'the transcription service did not answer', 'stt-failed');
    }
    const j = await r.json();
    const text = String(j?.text || '').trim();
    // Whisper's well-known inventions over silence or noise.
    if (/^(\[.*\]|\(.*\)|thank you\.?|thanks for watching!?|grazie(?: a tutti)?\.?|sottotitoli .*|gracias\.?|merci\.?|you)$/i.test(text)) return '';
    return text.slice(0, 600);
  } finally { clearTimeout(timer); }
}

// Chirp 3 HD speakers: Algenib is a gravelly, deep man's voice; Orus a firm one; Kore a woman's.
const SPEAKER = { chiron: 'Algenib', hercules: 'Orus', athena: 'Kore' };
// The locales Chirp 3 HD speaks, by the app's language.
const LOCALE = {
  en: 'en-US', it: 'it-IT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', ru: 'ru-RU', uk: 'uk-UA', pl: 'pl-PL',
  tr: 'tr-TR', hu: 'hu-HU', ar: 'ar-XA', hi: 'hi-IN', bn: 'bn-IN', ko: 'ko-KR', th: 'th-TH', zh: 'cmn-CN',
};
export const canSynthesize = env => !!(String(env?.GOOGLE_TTS_API_KEY || '').trim() || String(env?.GEMINI_API_KEY || '').trim());

// Gemini speech generation. The voices carry the same names as Chirp 3 HD's; how to speak is said in
// words before the text. The audio comes back as raw 24 kHz 16-bit mono, wrapped here as WAV.
// Fastest first (measured: about 2 s for a sentence, streamed), the others if it is retired.
const GEMINI_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
export function wavOf(pcm, rate = 24000) {
  const head = new Uint8Array(44), v = new DataView(head.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) head[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(head); out.set(pcm, 44);
  return out;
}
const fromBase64 = b64 => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

// The PCM samples of one audio part, and their rate: raw L16, or a WAV whose header is taken off.
function pcmOf(part) {
  const bytes = fromBase64(part.data);
  let rate = Number(/rate=(\d+)/.exec(String(part.mimeType || ''))?.[1]) || 24000;
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF') {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let o = 12; o + 8 <= bytes.length;) {
      const id = String.fromCharCode(...bytes.subarray(o, o + 4)), size = v.getUint32(o + 4, true);
      if (id === 'fmt ') rate = v.getUint32(o + 12, true);
      if (id === 'data') return { pcm: bytes.subarray(o + 8, Math.min(bytes.length, o + 8 + size)), rate };
      o += 8 + size + (size & 1);
    }
    return { pcm: bytes.subarray(44), rate };
  }
  return { pcm: bytes, rate };
}

// Streamed: measured from the server, the whole sentence arrives in about 2 s instead of 3 to 5 s
// for the same request unstreamed.
async function geminiSpeak(words, who, { key, model, fetchImpl }) {
  const models = [model, ...GEMINI_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const body = JSON.stringify({
    // Only the words: a style instruction put before them is read aloud as part of the speech.
    contents: [{ parts: [{ text: words }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEAKER[who] || SPEAKER.hercules } } } },
  });
  for (const m of models) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: ctl.signal,
      });
      if (r.status === 404 || r.status === 400) { console.error('gemini voice', m, r.status, (await r.text().catch(() => '')).slice(0, 200)); continue; }
      if (!r.ok) { console.error('gemini voice', m, r.status, (await r.text().catch(() => '')).slice(0, 200)); throw new VoiceError(502, 'the voice service did not answer', 'tts-failed'); }
      const parts = [];
      let rate = 24000;
      for (const line of (await r.text()).split('\n')) {
        if (!line.startsWith('data:')) continue;
        let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
        for (const p of j?.candidates?.[0]?.content?.parts || []) {
          if (!p?.inlineData?.data) continue;
          const x = pcmOf(p.inlineData);
          rate = x.rate; parts.push(x.pcm);
        }
      }
      const size = parts.reduce((n, p) => n + p.length, 0);
      if (!size) { console.error('gemini voice', m, 'no audio'); continue; }
      const pcm = new Uint8Array(size); let at = 0;
      for (const p of parts) { pcm.set(p, at); at += p.length; }
      return { audio: toBase64(wavOf(pcm, rate)), type: 'audio/wav' };
    } catch (e) {
      if (e instanceof VoiceError) throw e;
      console.error('gemini voice', m, e?.name || e);
      throw new VoiceError(502, 'the voice service did not answer', 'tts-failed');
    } finally { clearTimeout(timer); }
  }
  throw new VoiceError(502, 'the voice service did not answer', 'tts-failed');
}

/** `text` read by `who` in `lang`: { audio: base64 mp3 }. */
export async function synthesize({ text, lang, who } = {}, { key, geminiKey, geminiModel, fetchImpl = globalThis.fetch } = {}) {
  if (!key && !geminiKey) throw new VoiceError(501, 'no server voice', 'tts-off');
  const words = String(text || '').trim().slice(0, VOICE_LIMITS.textChars);
  if (!words) throw new VoiceError(400, 'nothing to say', 'tts-empty');
  if (!key) return geminiSpeak(words, who, { key: geminiKey, model: geminiModel, fetchImpl });
  const tag = String(lang || 'en-US');
  const locale = (tag === 'pt-PT' ? 'pt-PT' : tag === 'zh-TW' ? 'cmn-TW' : null) || LOCALE[langOf(tag)] || 'en-US';
  const speaker = SPEAKER[who] || SPEAKER.hercules;
  const body = {
    input: { text: words },
    voice: { languageCode: locale, name: `${locale}-Chirp3-HD-${speaker}` },
    audioConfig: { audioEncoding: 'MP3', speakingRate: who === 'chiron' ? 0.95 : 1 },
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetchImpl('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal,
    });
    if (!r.ok) {
      const why = await r.text().catch(() => '');
      console.error('synthesize', r.status, why.slice(0, 300));
      throw new VoiceError(502, 'the voice service did not answer', 'tts-failed');
    }
    const j = await r.json();
    if (!j?.audioContent) throw new VoiceError(502, 'the voice service did not answer', 'tts-failed');
    return { audio: j.audioContent, type: 'audio/mpeg' };
  } finally { clearTimeout(timer); }
}
