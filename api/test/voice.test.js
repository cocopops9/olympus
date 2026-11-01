import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, synthesize, VoiceError } from '../voice.js';

const clip = Buffer.alloc(2000, 7).toString('base64');

test('a recorded clip goes to Whisper with its language, and silence inventions read as nothing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ text: calls.length === 1 ? ' Quanto riposo? ' : 'Grazie.' }) }; };
  assert.equal(await transcribe({ data: clip, type: 'audio/webm;codecs=opus', lang: 'it-IT' }, { key: 'k', fetchImpl }), 'Quanto riposo?');
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  const form = calls[0].init.body;
  assert.equal(form.get('model'), 'whisper-large-v3-turbo');
  assert.equal(form.get('language'), 'it');
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
