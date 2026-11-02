import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, synthesize, VoiceError } from '../voice.js';

const clip = Buffer.alloc(2000, 7).toString('base64');

test('a recorded clip goes to Whisper in the app language with a hint of gym words, and silence inventions read as nothing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ text: calls.length === 1 ? ' Quanto riposo? ' : 'Grazie.' }) }; };
  assert.equal(await transcribe({ data: clip, type: 'audio/webm;codecs=opus', lang: 'it-IT' }, { key: 'k', fetchImpl }), 'Quanto riposo?');
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  const form = calls[0].init.body;
  assert.equal(form.get('model'), 'whisper-large-v3');
  assert.equal(form.get('language'), 'it');
  assert.match(form.get('prompt'), /Panca piana/);
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

test('with a Gemini key the voice is Gemini\'s, streamed, joined into one WAV, and a retired model falls to the next', async () => {
  const pcm = Buffer.alloc(240, 1).toString('base64');
  const wavPart = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0xc0, 0x5d, 0, 0, 0x80, 0xbb, 0, 0, 2, 0, 16, 0]), Buffer.from('data'), Buffer.from([240, 0, 0, 0]), Buffer.alloc(240, 2)]).toString('base64');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), key: init.headers['x-goog-api-key'] });
    if (calls.length === 1) return { ok: false, status: 404, text: async () => 'gone' };
    const sse = [
      'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] }),
      '',
      'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: wavPart } }] } }] }),
      '',
    ].join('\n');
    return { ok: true, status: 200, text: async () => sse };
  };
  const out = await synthesize({ text: 'Riposa due minuti.', lang: 'it-IT', who: 'chiron' }, { geminiKey: 'AQ.x', fetchImpl });
  assert.equal(out.type, 'audio/wav');
  const bytes = Buffer.from(out.audio, 'base64');
  assert.equal(bytes.length, 44 + 480);
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.readUInt32LE(24), 24000);
  assert.equal(bytes[44], 1);
  assert.equal(bytes[44 + 240], 2);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /gemini-3\.8-flash-lite-tts:streamGenerateContent\?alt=sse$/);
  assert.match(calls[1].url, /gemini-3\.8-flash-tts:streamGenerateContent/);
  assert.equal(calls[1].key, 'AQ.x');
  assert.equal(calls[1].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Algenib');
  assert.equal(calls[1].body.contents[0].parts[0].text, 'Riposa due minuti.');
});
