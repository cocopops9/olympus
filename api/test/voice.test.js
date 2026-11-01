import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, synthesize, VoiceError } from '../voice.js';

const clip = Buffer.alloc(2000, 7).toString('base64');

test('a recorded clip goes to Whisper, which hears the language itself, and silence inventions read as nothing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ text: calls.length === 1 ? ' Quanto riposo? ' : 'Grazie.' }) }; };
  assert.equal(await transcribe({ data: clip, type: 'audio/webm;codecs=opus', lang: 'it-IT' }, { key: 'k', fetchImpl }), 'Quanto riposo?');
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  const form = calls[0].init.body;
  assert.equal(form.get('model'), 'whisper-large-v3-turbo');
  assert.equal(form.get('language'), null);
  assert.equal(form.get('file').name, 'clip.webm');
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'it' }, { key: 'k', fetchImpl }), '');
});

test('a clip that is empty, too big, of an unknown kind, or with no key is refused', async () => {
  await assert.rejects(transcribe({ data: clip, type: 'audio/webm' }, { key: '' }), e => e instanceof VoiceError && e.code === 'voice-off');
  await assert.rejects(transcribe({ data: 'AAAA', type: 'audio/webm' }, { key: 'k' }), e => e.code === 'clip-empty');
  await assert.rejects(transcribe({ data: clip, type: 'video/x-flv' }, { key: 'k' }), e => e.code === 'clip-format');
  await assert.rejects(transcribe({ data: 'A'.repeat(2_200_000), type: 'audio/webm' }, { key: 'k' }), e => e.code === 'clip-large');
});

test('each coach has a voice of his own, in the language asked', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ audioContent: 'QUJD' }) }; };
  assert.deepEqual(await synthesize({ text: 'Riposa due minuti.', lang: 'it-IT', who: 'chiron' }, { key: 'g', fetchImpl }), { audio: 'QUJD', type: 'audio/mpeg' });
  assert.equal(bodies[0].voice.name, 'it-IT-Chirp3-HD-Algenib');
  await synthesize({ text: 'Hola', lang: 'es-ES', who: 'athena' }, { key: 'g', fetchImpl });
  assert.equal(bodies[1].voice.name, 'es-ES-Chirp3-HD-Kore');
  await assert.rejects(synthesize({ text: 'x', lang: 'it' }, { key: '' }), e => e.code === 'tts-off');
});

test('with a Gemini key the voice is Gemini\'s, wrapped as WAV, and a retired model falls to the next', async () => {
  const pcm = Buffer.alloc(480, 1).toString('base64');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), key: init.headers['x-goog-api-key'] });
    if (calls.length === 1) return { ok: false, status: 404, text: async () => 'gone' };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] }) };
  };
  const out = await synthesize({ text: 'Riposa due minuti.', lang: 'it-IT', who: 'chiron' }, { geminiKey: 'AIza', fetchImpl });
  assert.equal(out.type, 'audio/wav');
  const bytes = Buffer.from(out.audio, 'base64');
  assert.equal(bytes.length, 44 + 480);
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.readUInt32LE(24), 24000);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /gemini-2\.5-flash-preview-tts:generateContent$/);
  assert.equal(calls[1].key, 'AIza');
  assert.equal(calls[1].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Algenib');
  assert.match(calls[1].body.contents[0].parts[0].text, /gravelly.*: Riposa due minuti\.$/);
});
