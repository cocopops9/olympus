// Olympus: the coaches' ears and voice, on the server.
//
// Ears: what the phone recorded (a short clip, webm/opus or mp4/aac) is written out by Whisper on
// Groq, the provider the coaches already use (HERCULES_API_KEY or GROQ_API_KEY): accurate in every
// language and the same on every phone. Android's own recogniser, asked from the app, failed on
// many phones with a bare "client side error".
//
// Voice: Google Cloud Text-to-Speech, Chirp 3 HD voices, when the server has GOOGLE_TTS_API_KEY.
// Chiron speaks with a deep, gravelly man's voice, Hercules a firm man's, Athena a woman's, in the
// language of the app. Without the key the phone reads with its own voices (lib/voice.js).
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

/** The words in a recorded clip ({ data: base64, type, lang }), or '' when nothing was said. */
export async function transcribe({ data, type, lang } = {}, { key, baseUrl = 'https://api.groq.com/openai/v1', fetchImpl = globalThis.fetch } = {}) {
  if (!key) throw new VoiceError(503, 'voice is not set up on this server', 'voice-off');
  const ext = extOf(type);
  if (!ext) throw new VoiceError(400, 'unknown recording format', 'clip-format');
  const bytes = bytesOf(data);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: MIME[ext] }), 'clip.' + ext);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const l = langOf(lang);
  if (l) form.append('language', l);
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
export const canSynthesize = env => !!String(env?.GOOGLE_TTS_API_KEY || '').trim();

/** `text` read by `who` in `lang`: { audio: base64 mp3 }. */
export async function synthesize({ text, lang, who } = {}, { key, fetchImpl = globalThis.fetch } = {}) {
  if (!key) throw new VoiceError(501, 'no server voice', 'tts-off');
  const words = String(text || '').trim().slice(0, VOICE_LIMITS.textChars);
  if (!words) throw new VoiceError(400, 'nothing to say', 'tts-empty');
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
