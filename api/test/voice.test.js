import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, synthesize, VoiceError, _clearResting, _clearHearResting } from '../voice.js';

const clip = Buffer.alloc(2000, 7).toString('base64');

test('a recorded clip goes to Whisper in the app language with no prompt to echo, and silence inventions read as nothing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ text: calls.length === 1 ? ' Quanto riposo? ' : 'Grazie.' }) }; };
  assert.equal(await transcribe({ data: clip, type: 'audio/webm;codecs=opus', lang: 'it-IT' }, { key: 'k', fetchImpl }), 'Quanto riposo?');
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
  const form = calls[0].init.body;
  assert.equal(form.get('model'), 'whisper-large-v3');
  assert.equal(form.get('language'), 'it');
  assert.equal(form.get('prompt'), null);
  assert.equal(form.get('response_format'), 'verbose_json');
  assert.equal(form.get('file').name, 'clip.webm');
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'it' }, { key: 'k', fetchImpl }), '');
});

test('a clip that is empty, too big, of an unknown kind, or with no key is refused', async () => {
  await assert.rejects(transcribe({ data: clip, type: 'audio/webm' }, { key: '' }), e => e instanceof VoiceError && e.code === 'voice-off');
  await assert.rejects(transcribe({ data: 'AAAA', type: 'audio/webm' }, { key: 'k' }), e => e.code === 'clip-empty');
  await assert.rejects(transcribe({ data: clip, type: 'video/x-flv' }, { key: 'k' }), e => e.code === 'clip-format');
  await assert.rejects(transcribe({ data: 'A'.repeat(2_900_000), type: 'audio/webm' }, { key: 'k' }), e => e.code === 'clip-large');
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

test('a model out of quota rests, the next one speaks, and with every quota gone the answer is 429', async () => {
  _clearResting();
  const pcm = Buffer.alloc(240, 1).toString('base64');
  const urls = [];
  const sse = 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm } }] } }] }) + '\n';
  const fetchImpl = async url => {
    urls.push(url);
    if (/3\.8-flash-lite/.test(url)) return { ok: false, status: 429, text: async () => 'quota' };
    return { ok: true, status: 200, text: async () => sse };
  };
  const out = await synthesize({ text: 'Via.', lang: 'it', who: 'hercules' }, { geminiKey: 'k', fetchImpl });
  assert.equal(out.type, 'audio/wav');
  assert.equal(urls.length, 2);
  urls.length = 0;
  await synthesize({ text: 'Ancora.', lang: 'it', who: 'hercules' }, { geminiKey: 'k', fetchImpl });
  assert.equal(urls.length, 1);   // the resting model is not asked again
  assert.match(urls[0], /3\.8-flash-tts/);
  _clearResting();
  const none = async () => ({ ok: false, status: 429, text: async () => 'quota' });
  await assert.rejects(synthesize({ text: 'Via.', who: 'chiron' }, { geminiKey: 'k', fetchImpl: none }), e => e.status === 429 && e.code === 'tts-quota');
  _clearResting();
});

test('what Whisper heard is mended by what makes sense in a gym, with the person\'s exercises as the hint', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (/transcriptions$/.test(url)) return { ok: true, json: async () => ({ text: 'I want to do pull up squats' }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: ' I want to do full squats ' } }] }) };
  };
  const text = await transcribe({ data: clip, type: 'audio/webm', lang: 'en-US', hint: 'Barbell Back Squat, Bench Press' }, { key: 'k', fetchImpl });
  assert.equal(text, 'I want to do full squats');
  assert.equal(calls[0].init.body.get('prompt'), null);
  const chat = JSON.parse(calls[1].init.body);
  assert.equal(chat.model, 'llama-3.3-70b-versatile');
  assert.match(chat.messages[1].content, /Barbell Back Squat/);
  assert.match(chat.messages[1].content, /pull up squats/);
  // A correction that is not one (an answer, a different length), a failure, or no model: as heard.
  const wrong = answer => async url => (/transcriptions$/.test(url) ? { ok: true, json: async () => ({ text: 'Quanto devo riposare?' }) } : { ok: true, json: async () => ({ choices: [{ message: { content: answer } }] }) });
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'it' }, { key: 'k', fetchImpl: wrong('Riposa tre minuti, poi riprova con più carico, senza fretta e con calma.') }), 'Quanto devo riposare?');
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'it' }, { key: 'k', fetchImpl: wrong('') }), 'Quanto devo riposare?');
  const down = async url => (/transcriptions$/.test(url) ? { ok: true, json: async () => ({ text: 'Quanto devo riposare?' }) } : { ok: false, status: 429 });
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'it' }, { key: 'k', fetchImpl: down }), 'Quanto devo riposare?');
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'it' }, { key: 'k', fixModel: '', fetchImpl: wrong('x') }), 'Quanto devo riposare?');
});

test('stretches Whisper made up, and loops of words, are not taken for what was said', async () => {
  const { believable, looping } = await import('../voice.js');
  assert.equal(believable({ text: 'x', segments: [
    { text: ' What should I train tomorrow?', avg_logprob: -0.3, no_speech_prob: 0.01, compression_ratio: 1.2 },
    { text: ' barbell bench press, barbell squat, barbell bench press', avg_logprob: -0.4, no_speech_prob: 0.1, compression_ratio: 2.9 },
    { text: ' Thank you.', avg_logprob: -1.4, no_speech_prob: 0.9, compression_ratio: 0.8 },
  ] }), 'What should I train tomorrow?');
  assert.equal(believable({ text: ' plain ' }), 'plain');
  assert.equal(looping('barbell glute bridge, barbell bench press, barbell straddle barbell bench press, barbell heel push, barbell bench press'), true);
  assert.equal(looping('How was my workout of yesterday?'), false);
  assert.equal(looping('Quanto devo recuperare tra una serie e l\'altra di squat pesante oggi?'), false);
  const loop = 'barbell lunge, barbell lunge, full barbell counter barbell bench press barbell step, curl up, barbell lunge bench, biceps';
  const fetchImpl = async () => ({ ok: true, json: async () => ({ text: loop, segments: [{ text: loop, avg_logprob: -0.5, no_speech_prob: 0.1, compression_ratio: 1.9 }] }) });
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'en' }, { key: 'k', fetchImpl }), '');
});

test('Gemini hears a WAV clip beside Whisper and its words are the ones used; without it, or when it fails, Whisper\'s stand', async () => {
  _clearHearResting();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/audio/transcriptions')) return { ok: true, json: async () => ({ text: 'how do i bring in school' }) };
    if (url.includes('generativelanguage')) {
      const body = JSON.parse(init.body);
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'audio/wav');
      assert.match(body.contents[0].parts[0].text, /Barbell Squat/);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking' }, { text: ' "How do I train explosiveness in basketball?" ' }] } }] }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'unused' } }] }) };
  };
  const out = await transcribe({ data: clip, type: 'audio/wav', lang: 'en-US', hint: 'Barbell Squat' }, { key: 'k', geminiKey: 'g', fetchImpl });
  assert.equal(out, 'How do I train explosiveness in basketball?');
  assert.match(calls.find(c => c.url.includes('generativelanguage')).url, /gemini-3\.8-flash-lite:generateContent$/);
  assert.equal(calls.some(c => c.url.includes('/chat/completions')), false);

  // WebM is not a format Gemini takes: Whisper alone.
  calls.length = 0;
  assert.equal(await transcribe({ data: clip, type: 'audio/webm', lang: 'en' }, { key: 'k', geminiKey: 'g', fetchImpl }), 'how do i bring in school');
  assert.equal(calls.some(c => c.url.includes('generativelanguage')), false);
});

test('when Gemini is out of quota or retired its model rests and the next is tried, and with all failing Whisper\'s words stay', async () => {
  _clearHearResting();
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    if (url.includes('/audio/transcriptions')) return { ok: true, json: async () => ({ text: 'what exercises am i weaker' }) };
    if (url.includes('/chat/completions')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: false, status: url.includes('3.8-flash-lite') ? 429 : 404, text: async () => 'no' };
  };
  assert.equal(await transcribe({ data: clip, type: 'audio/wav', lang: 'en' }, { key: 'k', geminiKey: 'g', fetchImpl }), 'what exercises am i weaker');
  assert.equal(urls.filter(u => u.includes('generativelanguage')).length, 2);
  urls.length = 0;
  await transcribe({ data: clip, type: 'audio/wav', lang: 'en' }, { key: 'k', geminiKey: 'g', fetchImpl });
  assert.equal(urls.filter(u => u.includes('generativelanguage')).length, 0);   // all resting
});

test('Gemini saying NOTHING is silence, and a Whisper failure leaves Gemini\'s words', async () => {
  _clearHearResting();
  const fetchImpl = async url => {
    if (url.includes('/audio/transcriptions')) return { ok: false, status: 500, text: async () => 'down' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Quanto riposo?' }] } }] }) };
  };
  assert.equal(await transcribe({ data: clip, type: 'audio/wav', lang: 'it' }, { key: 'k', geminiKey: 'g', fetchImpl }), 'Quanto riposo?');
  _clearHearResting();
  const quiet = async url => (url.includes('/audio/transcriptions')
    ? { ok: true, json: async () => ({ text: '' }) }
    : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'NOTHING' }] } }] }) });
  assert.equal(await transcribe({ data: clip, type: 'audio/wav', lang: 'it' }, { key: 'k', geminiKey: 'g', fetchImpl: quiet }), '');
});

test('a slow Gemini does not hold the answer: after Whisper it has a short grace, then Whisper\'s corrected words are used and the slow model rests', async () => {
  _clearHearResting();
  let geminiCalls = 0;
  const fetchImpl = async url => {
    if (url.includes('/audio/transcriptions')) return { ok: true, json: async () => ({ text: 'quanto riposo devo prendere' }) };
    if (url.includes('/chat/completions')) return { ok: true, json: async () => ({ choices: [{ message: { content: 'Quanto riposo devo prendere?' } }] }) };
    geminiCalls++;
    await new Promise(r => setTimeout(r, 400));   // far slower than the grace
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'late words' }] } }] }) };
  };
  const t0 = Date.now();
  const out = await transcribe({ data: clip, type: 'audio/wav', lang: 'it' }, { key: 'k', geminiKey: 'g', hearGraceMs: 60, fetchImpl });
  assert.equal(out, 'Quanto riposo devo prendere?');
  assert.ok(Date.now() - t0 < 300, 'did not wait for the slow model');
  assert.ok(geminiCalls >= 1);
  // A fast Gemini within the grace still wins.
  _clearHearResting();
  const fast = async url => {
    if (url.includes('/audio/transcriptions')) return { ok: true, json: async () => ({ text: 'quanto riposo devo prendere' }) };
    if (url.includes('/chat/completions')) return { ok: true, json: async () => ({ choices: [{ message: { content: 'whisper fixed' } }] }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Quanto riposo devo prendere?' }] } }] }) };
  };
  assert.equal(await transcribe({ data: clip, type: 'audio/wav', lang: 'it' }, { key: 'k', geminiKey: 'g', fetchImpl: fast }), 'Quanto riposo devo prendere?');
});

test('a Gemini model that timed out or is overloaded rests, so the next clips do not ask it', async () => {
  _clearHearResting();
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    if (url.includes('/audio/transcriptions')) return { ok: true, json: async () => ({ text: 'hello there coach' }) };
    if (url.includes('/chat/completions')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: false, status: 503, text: async () => 'high demand' };
  };
  await transcribe({ data: clip, type: 'audio/wav', lang: 'en' }, { key: 'k', geminiKey: 'g', hearGraceMs: 200, fetchImpl });
  urls.length = 0;
  await transcribe({ data: clip, type: 'audio/wav', lang: 'en' }, { key: 'k', geminiKey: 'g', hearGraceMs: 200, fetchImpl });
  assert.equal(urls.filter(u => u.includes('generativelanguage')).length, 0);
});
