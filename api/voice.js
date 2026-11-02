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

export const VOICE_LIMITS = Object.freeze({ clipBytes: 2_000_000, textChars: 900 });

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


/**
 * The text of a verbose Whisper answer without the stretches it made up: Whisper's own signs of an
 * invention are a stretch that is mostly silence yet worded with low confidence, and one whose text
 * compresses far too well (the same words over and over). These are the thresholds Whisper itself
 * uses to decide that a stretch failed (no_speech 0.6 with logprob under -1; compression over 2.4).
 */
export function believable(j) {
  const segs = Array.isArray(j?.segments) ? j.segments : null;
  if (!segs) return String(j?.text || '').trim();
  return segs.filter(s => {
    const silent = Number(s?.no_speech_prob) > 0.6 && Number(s?.avg_logprob) < -1;
    const repeats = Number(s?.compression_ratio) > 2.4;
    const unsure = Number(s?.avg_logprob) < -1.2;
    return !silent && !repeats && !unsure;
  }).map(s => String(s?.text || '').trim()).filter(Boolean).join(' ').trim();
}

/** A transcript that is a loop: one word making up much of a long text ("barbell, barbell, ..."). */
export function looping(text) {
  const w = String(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  if (w.length < 8) return false;
  const n = {};
  for (const x of w) n[x] = (n[x] || 0) + 1;
  const top = Math.max(...Object.values(n));
  return top >= 4 && top / w.length > 0.2 || (String(text).match(/,/g) || []).length >= 6;
}

/** The words in a recorded clip ({ data: base64, type, lang }), or '' when nothing was said. */
export async function transcribe({ data, type, lang, hint } = {}, { key, baseUrl = 'https://api.groq.com/openai/v1', model = 'whisper-large-v3', fixModel = 'llama-3.3-70b-versatile', geminiKey = '', geminiModel = '', fetchImpl = globalThis.fetch } = {}) {
  if (!key) throw new VoiceError(503, 'voice is not set up on this server', 'voice-off');
  const ext = extOf(type);
  if (!ext) throw new VoiceError(400, 'unknown recording format', 'clip-format');
  const bytes = bytesOf(data);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: MIME[ext] }), 'clip.' + ext);
  form.append('model', model);
  // verbose_json: each stretch of the clip comes with how sure Whisper was of it.
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  // The person speaks the app's language, and Whisper is told which. No prompt: given a list of
  // words, Whisper fills an unclear clip with that list ("barbell bench press, barbell squat, ..."),
  // so the person's exercises go to the correction below, never to the recogniser.
  const l = langOf(lang);
  if (l) form.append('language', l);
  const words = String(hint || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
  // Gemini hears the same clip at the same time (it can use what a gym talk is about, which Whisper
  // cannot); its answer is the one used when it comes, Whisper's (corrected) when it does not.
  const heard = geminiKey && GEMINI_HEARS.includes(ext) ? geminiHear({ data: String(data || '').replace(/^data:[^,]*,/, ''), mime: MIME[ext], lang: l, words }, { key: geminiKey, model: geminiModel, fetchImpl }).catch(() => null) : Promise.resolve(null);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetchImpl(baseUrl.replace(/\/+$/, '') + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form, signal: ctl.signal });
    if (!r.ok) {
      const why = await r.text().catch(() => '');
      console.error('transcribe', r.status, why.slice(0, 300));
      const g = await heard;
      if (g) return g;
      throw new VoiceError(502, 'the transcription service did not answer', 'stt-failed');
    }
    const j = await r.json();
    const text = believable(j);
    // Whisper's well-known inventions over silence or noise.
    if (/^(\[.*\]|\(.*\)|thank you\.?|thanks for watching!?|grazie(?: a tutti)?\.?|sottotitoli .*|gracias\.?|merci\.?|you)$/i.test(text)) return '';
    if (looping(text)) { console.error('transcribe: a loop of words dropped', text.slice(0, 120)); return ''; }
    const g = await heard;
    if (g) return g;
    return await mended(text.slice(0, 600), { lang: l, words }, { key, baseUrl, model: fixModel, fetchImpl });
  } finally { clearTimeout(timer); }
}

// Formats Gemini takes as audio: WAV (what the app sends), MP3, Ogg. Not WebM.
const GEMINI_HEARS = ['wav', 'mpeg', 'ogg'];
const HEAR_MODELS = ['gemini-3.8-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const hearResting = new Map();   // model -> time it may be asked again (out of quota, or not there)
export const _clearHearResting = () => hearResting.clear();

/**
 * What a person said to their coach, heard by Gemini from the audio itself and the context: a gym,
 * training, their own exercises. Returns the text, '' when it heard nobody, or null when it could not
 * (no quota, no model, no answer): the caller then relies on Whisper.
 */
export async function geminiHear({ data, mime = 'audio/wav', lang, words }, { key, model, fetchImpl, now = Date.now() }) {
  const all = [model, ...HEAR_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const ready = all.filter(m => (hearResting.get(m) || 0) <= now);
  const prompt = [
    `A person is speaking to their strength and conditioning coach during a workout, most likely in ${LANG_NAME[lang] || 'their own language'} (they may have an accent, and the room may be noisy or echo). Write down exactly what they said, in the language they spoke, as one line, and nothing else.`,
    'Use what they are likely talking about to choose between words that sound alike: training, exercises, sets, reps, weights, rest, muscles, pain, goals, their past workouts and progress. A sensible question or remark to a coach is far more likely than a strange sentence. Do not answer them, translate, explain or add anything.',
    words ? `Their exercises and words: ${words}` : '',
    'If nobody is speaking, or it is only noise, answer with the single word NOTHING.',
  ].filter(Boolean).join('\n');
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 1024 },
  });
  for (const m of ready) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: ctl.signal,
      });
      if (!r.ok) {
        console.error('gemini hear', m, r.status, (await r.text().catch(() => '')).slice(0, 120));
        if (r.status === 429) hearResting.set(m, now + REST_MS);
        else if (r.status === 404 || r.status === 400) hearResting.set(m, now + 6 * 3600 * 1000);
        continue;
      }
      const j = await r.json();
      const parts = j?.candidates?.[0]?.content?.parts || [];
      let out = parts.filter(p => !p.thought).map(p => String(p.text || '')).join(' ').replace(/\s+/g, ' ').trim().replace(/^["“”']+|["“”']+$/g, '').trim();
      if (!out) continue;
      if (/^NOTHING\.?$/i.test(out)) return '';
      if (out.length > 600) out = out.slice(0, 600);
      return out;
    } catch (e) {
      console.error('gemini hear', m, e?.name || e);
    } finally { clearTimeout(timer); }
  }
  return null;
}

const LANG_NAME = { en: 'English', it: 'Italian', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', tr: 'Turkish', hu: 'Hungarian', ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', ko: 'Korean', th: 'Thai', zh: 'Chinese' };

/**
 * What was heard, corrected by what is likely to be said: a language model reads the transcript with
 * the person's exercises beside it and fixes the words the recogniser took for others ("pull up
 * squats" said by someone doing full squats). The sentence that makes sense in a gym wins over the
 * one that only sounds like the audio. Anything odd about its answer and the transcript stays as
 * heard.
 */
async function mended(text, { lang, words }, { key, baseUrl, model, fetchImpl }) {
  if (!text || !model || text.split(/\s+/).length < 2) return text;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetchImpl(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({
        model, temperature: 0, max_tokens: 300,
        messages: [
          { role: 'system', content: [
            `You fix speech-to-text errors. The text is what a person said to their strength and conditioning coach during a workout, in ${LANG_NAME[lang] || 'their language'}, written by a recogniser that sometimes hears a different word that sounds alike.`,
            'Replace a word or phrase only when the transcript does not make sense as said in a gym, and put what is most likely meant by the sound and by the context (exercises, sets, reps, weights, rest, muscles, pain, goals). Example: "I want to do pull up squats" becomes "I want to do full squats".',
            'The speaker usually asks about their own training: which exercises they are weak at given past workouts, what to train next, rest, weights, reps, technique, progress. Prefer the reading that is a sensible question or remark to a coach, even if it means changing several words that sound alike. Example (Italian): "i quali eserizio sono più carino i dati di unità di passi" becomes "in quali esercizi sono più carente, dati gli allenamenti passati".',
            'Keep the language, the meaning and the length. Do not answer, translate, add, explain or drop anything. If it already makes sense, return it exactly as it is.',
            'Reply with the corrected text only, on one line.',
          ].join(' ') },
          { role: 'user', content: (words ? `Exercises and words of this person: ${words}\n` : '') + `Transcript: ${text}` },
        ],
      }),
    });
    if (!r.ok) return text;
    const out = String((await r.json())?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim().replace(/^["“”']+|["“”']+$/g, '').replace(/^Transcript:\s*/i, '').trim();
    if (!out || /\n/.test(out) || out.length > text.length * 1.6 + 20 || out.length < text.length * 0.5) return text;
    return out;
  } catch { return text; } finally { clearTimeout(timer); }
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
// A model whose free quota is used up is left alone for a while: each model has a quota of its own,
// so the next one answers meanwhile.
const resting = new Map();
export const _clearResting = () => resting.clear();
const REST_MS = 5 * 60 * 1000;

async function geminiSpeak(words, who, { key, model, fetchImpl, now = Date.now() }) {
  const all = [model, ...GEMINI_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const ready = all.filter(m => (resting.get(m) || 0) <= now);
  const models = ready.length ? ready : all;   // all resting: try them anyway, the quota may be back
  const body = JSON.stringify({
    // Only the words: a style instruction put before them is read aloud as part of the speech.
    contents: [{ parts: [{ text: words }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEAKER[who] || SPEAKER.hercules } } } },
  });
  let quota = false;
  for (const m of models) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: ctl.signal,
      });
      if (!r.ok) {
        console.error('gemini voice', m, r.status, (await r.text().catch(() => '')).slice(0, 120));
        if (r.status === 429) { quota = true; resting.set(m, now + REST_MS); }
        continue;   // retired, out of quota or busy: the next model
      }
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
      console.error('gemini voice', m, e?.name || e);
    } finally { clearTimeout(timer); }
  }
  if (quota) throw new VoiceError(429, 'the voice has no quota left for now', 'tts-quota');
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
