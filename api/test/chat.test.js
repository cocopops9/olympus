// Messages between two profiles (chat.js): a conversation, the two lists of conversations, what
// is unread, and the same over the Supabase function's routes, where a block stops them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChat, memoryKv, chatKey, inboxKey, CHAT, ChatError } from '../chat.js';
import { createApp, memoryStore, memoryPhotos } from '../../supabase/functions/olympus/core.js';

const clock = () => { let t = 1_800_000_000_000; return () => (t += 1000); };

test('a message lands in the conversation and in both lists, unread for the other only', async () => {
  const kv = memoryKv();
  const chat = createChat({ kv, now: clock() });
  const m = await chat.send('ada', 'bea', '  Ciao!\r\nCome va?  ');
  assert.deepEqual({ id: m.id, mine: m.mine, text: m.text }, { id: 1, mine: true, text: 'Ciao!\nCome va?' });
  assert.equal(chatKey('bea', 'ada'), chatKey('ada', 'bea'));
  assert.equal(await chat.unread('ada'), 0);
  assert.equal(await chat.unread('bea'), 1);
  const [mine] = await chat.list('ada');
  assert.deepEqual({ id: mine.id, mine: mine.mine, unread: mine.unread, text: mine.text }, { id: 'bea', mine: true, unread: 0, text: 'Ciao!\nCome va?' });
  const [theirs] = await chat.list('bea');
  assert.deepEqual({ id: theirs.id, mine: theirs.mine, unread: theirs.unread }, { id: 'ada', mine: false, unread: 1 });
  const seenByBea = await chat.thread('bea', 'ada');
  assert.deepEqual(seenByBea.messages.map(x => [x.id, x.mine, x.text]), [[1, false, 'Ciao!\nCome va?']]);
});

test('reading clears the count and tells the sender how far it was read', async () => {
  const chat = createChat({ kv: memoryKv(), now: clock() });
  await chat.send('ada', 'bea', 'one');
  await chat.send('ada', 'bea', 'two');
  assert.equal((await chat.thread('ada', 'bea')).seen, 0);
  await chat.read('bea', 'ada');
  assert.equal(await chat.unread('bea'), 0);
  assert.equal((await chat.thread('ada', 'bea')).seen, 2);
  await chat.send('bea', 'ada', 'three');
  assert.equal(await chat.unread('ada'), 1);
  // Reading a conversation that does not exist is not an error and makes nothing.
  await chat.read('ada', 'zed');
  assert.deepEqual(await chat.list('zed'), []);
});

test('lists are sorted by the latest message; a long one is cut in the list only', async () => {
  const chat = createChat({ kv: memoryKv(), now: clock() });
  await chat.send('ada', 'bea', 'first');
  await chat.send('ada', 'cal', 'x'.repeat(300));
  await chat.send('bea', 'ada', 'latest');
  const list = await chat.list('ada');
  assert.deepEqual(list.map(c => c.id), ['bea', 'cal']);
  assert.equal(list[1].text.length, CHAT.preview);
  assert.equal((await chat.thread('ada', 'cal')).messages[0].text.length, 300);
});

test('what cannot be sent: nothing, too much, to oneself, too often', async () => {
  const chat = createChat({ kv: memoryKv(), now: () => 5 });
  await assert.rejects(chat.send('ada', 'bea', '   '), e => e instanceof ChatError && e.code === 'empty');
  await assert.rejects(chat.send('ada', 'bea', 'x'.repeat(CHAT.text + 1)), e => e.code === 'too-long' && e.status === 413);
  await assert.rejects(chat.send('ada', 'ada', 'hi'), e => e.code === 'chat-self');
  for (let i = 0; i < CHAT.perHour; i++) await chat.send('ada', 'bea', 'm' + i);
  await assert.rejects(chat.send('ada', 'bea', 'one more'), e => e.code === 'chat-limit' && e.status === 429);
});

test('a conversation keeps its latest messages and pages back through them', async () => {
  const kv = memoryKv();
  const chat = createChat({ kv, now: clock() });
  for (let i = 1; i <= CHAT.page + 5; i++) await chat.send(i % 2 ? 'ada' : 'bea', i % 2 ? 'bea' : 'ada', 'm' + i);
  const latest = await chat.thread('ada', 'bea');
  assert.equal(latest.messages.length, CHAT.page);
  assert.equal(latest.more, true);
  assert.equal(latest.messages.at(-1).text, 'm' + (CHAT.page + 5));
  const older = await chat.thread('ada', 'bea', { before: latest.messages[0].id });
  assert.deepEqual(older.messages.map(m => m.text), ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.equal(older.more, false);
});

test('a message can be taken back by who wrote it, and the lists follow', async () => {
  const chat = createChat({ kv: memoryKv(), now: clock() });
  await chat.send('ada', 'bea', 'keep');
  const m = await chat.send('ada', 'bea', 'oops');
  await assert.rejects(chat.remove('bea', 'ada', m.id), e => e.code === 'no-message');
  await chat.remove('ada', 'bea', m.id);
  assert.deepEqual((await chat.thread('bea', 'ada')).messages.map(x => x.text), ['keep']);
  const [theirs] = await chat.list('bea');
  assert.equal(theirs.text, 'keep');
  assert.equal(theirs.unread, 1);
});

test('a message can be edited by who wrote it for 5 hours, and is marked as edited', async () => {
  let t = 1_800_000_000_000;
  const chat = createChat({ kv: memoryKv(), now: () => t });
  const first = await chat.send('ada', 'bea', 'gym at 6');
  t += 1000;
  const m = await chat.send('ada', 'bea', 'gym at 7?');
  assert.equal(m.edited, undefined);
  // Not by the other person, and not a message that is not there.
  await assert.rejects(chat.edit('bea', 'ada', m.id, 'hacked'), e => e.code === 'no-message');
  await assert.rejects(chat.edit('ada', 'bea', 99, 'x'), e => e.code === 'no-message');
  // Words are still needed on a message without an attachment, and the usual length holds.
  await assert.rejects(chat.edit('ada', 'bea', m.id, '   '), e => e.code === 'empty');
  await assert.rejects(chat.edit('ada', 'bea', m.id, 'x'.repeat(CHAT.text + 1)), e => e.code === 'too-long');
  // The same words change nothing and leave no mark.
  assert.equal((await chat.edit('ada', 'bea', m.id, ' gym at 7? ')).edited, undefined);
  t += 60000;
  const e = await chat.edit('ada', 'bea', m.id, 'gym at 7:30?');
  assert.deepEqual([e.id, e.text, e.edited, e.at], [m.id, 'gym at 7:30?', t, m.at]);
  const seen = (await chat.thread('bea', 'ada')).messages;
  assert.deepEqual(seen.map(x => [x.text, x.edited || 0]), [['gym at 6', 0], ['gym at 7:30?', t]]);
  // The lists show the new words of the latest message, and it is not unread a second time.
  const [theirs] = await chat.list('bea');
  assert.deepEqual([theirs.text, theirs.unread, theirs.at], ['gym at 7:30?', 2, m.at]);
  assert.equal((await chat.list('ada'))[0].text, 'gym at 7:30?');
  // An older message changes, the lists keep the latest line.
  await chat.edit('ada', 'bea', first.id, 'gym at 6 tomorrow');
  assert.equal((await chat.list('bea'))[0].text, 'gym at 7:30?');
  // Exactly 5 hours after sending it may still be edited; a moment later it may not, and an
  // edit does not move the window.
  t = m.at + CHAT.editHours * 3600000;
  assert.equal((await chat.edit('ada', 'bea', m.id, 'last call')).text, 'last call');
  t += 1;
  await assert.rejects(chat.edit('ada', 'bea', m.id, 'too late'), e => e.code === 'edit-expired' && e.status === 403);
  assert.equal((await chat.thread('bea', 'ada')).messages[1].text, 'last call');
});

test('an account that is deleted leaves no conversation behind', async () => {
  const kv = memoryKv();
  const chat = createChat({ kv, now: clock() });
  await chat.send('ada', 'bea', 'hi');
  await chat.send('cal', 'ada', 'hey');
  await chat.removeUser('ada');
  assert.deepEqual(await chat.list('bea'), []);
  assert.deepEqual(await chat.list('cal'), []);
  assert.equal(kv.docs.has(chatKey('ada', 'bea')), false);
  assert.equal(kv.docs.has(inboxKey('ada')), false);
});

test('over the server: only signed in, never to someone who blocked you, and the list carries the other profile', async () => {
  const app = createApp({ store: memoryStore(), photos: memoryPhotos(), env: {} });
  const call = async (method, path, body, token) => {
    const res = await app.handle(new Request('https://x.test/functions/v1/olympus' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const sign = async name => (await call('POST', '/api/app/signup', { name, email: name + '@example.com', password: 'correct horse battery staple' })).body;
  const ada = await sign('ada_lifts'); const bea = await sign('bea_runs'); const cal = await sign('cal_rows');
  assert.equal((await call('GET', '/api/chat')).status, 401);
  assert.equal((await call('POST', '/api/chat/send', { id: bea.user.id, text: 'Ciao Bea' }, ada.token)).body.message.text, 'Ciao Bea');
  assert.equal((await call('GET', '/api/chat/unread', null, bea.token)).body.unread, 1);
  const list = (await call('GET', '/api/chat', null, bea.token)).body.chats;
  assert.equal(list.length, 1);
  assert.equal(list[0].user.name, 'ada_lifts');
  assert.equal(list[0].unread, 1);
  const thread = (await call('GET', '/api/chat/thread?id=' + ada.user.id, null, bea.token)).body;
  assert.equal(thread.user.name, 'ada_lifts');
  assert.deepEqual(thread.messages.map(m => [m.mine, m.text]), [[false, 'Ciao Bea']]);
  assert.equal((await call('POST', '/api/chat/read', { id: ada.user.id }, bea.token)).status, 200);
  assert.equal((await call('GET', '/api/chat/unread', null, bea.token)).body.unread, 0);
  // Nobody else can read it.
  assert.deepEqual((await call('GET', '/api/chat/thread?id=' + ada.user.id, null, cal.token)).body.messages, []);
  assert.equal((await call('POST', '/api/chat/send', { id: 'nobody', text: 'x' }, ada.token)).status, 404);
  assert.equal((await call('POST', '/api/chat/send', { id: ada.user.id, text: 'me' }, ada.token)).status, 400);
  // Ada edits her message over the server; Bea cannot, and neither can anyone after 5 hours.
  const sentId = thread.messages[0].id;
  const edited = (await call('POST', '/api/chat/edit', { id: bea.user.id, message: sentId, text: 'Ciao Bea!' }, ada.token)).body.message;
  assert.equal(edited.text, 'Ciao Bea!');
  assert.ok(edited.edited > 0);
  assert.equal((await call('GET', '/api/chat/thread?id=' + ada.user.id, null, bea.token)).body.messages[0].edited, edited.edited);
  assert.equal((await call('POST', '/api/chat/edit', { id: ada.user.id, message: sentId, text: 'nope' }, bea.token)).body.code, 'no-message');
  assert.equal((await call('POST', '/api/chat/edit', { id: bea.user.id, message: sentId, text: 'x' })).status, 401);
  // Bea blocks Ada: Ada cannot write to her any more, and the conversation leaves both lists.
  assert.equal((await call('POST', '/api/social/block', { id: ada.user.id }, bea.token)).status, 200);
  assert.equal((await call('POST', '/api/chat/send', { id: bea.user.id, text: 'still there?' }, ada.token)).status, 404);
  assert.equal((await call('POST', '/api/chat/send', { id: ada.user.id, text: 'no' }, bea.token)).status, 403);
  assert.equal((await call('POST', '/api/chat/edit', { id: bea.user.id, message: sentId, text: 'after the block' }, ada.token)).status, 404);
  assert.deepEqual((await call('GET', '/api/chat', null, ada.token)).body.chats, []);
  assert.deepEqual((await call('GET', '/api/chat', null, bea.token)).body.chats, []);
});

// A tiny JPEG, PNG and WebM by their first bytes: enough for the checks, which read the header.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 3)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(60, 1)]);
const memFiles = () => { const m = new Map(); return { m, put: async (k, b, y) => { m.set(k, { b, y }); }, get: async k => m.get(k)?.b || null, del: async k => { m.delete(k); } }; };

test('a message can carry a photo, a voice message or a file, checked by what its bytes are', async () => {
  const files = memFiles();
  const chat = createChat({ kv: memoryKv(), now: clock(), files });
  const photo = await chat.send('ada', 'bea', '', { kind: 'image', data: 'data:image/jpeg;base64,' + jpeg.toString('base64') });
  assert.deepEqual(photo.attachment, { kind: 'image', type: 'image/jpeg', size: jpeg.length });
  assert.equal(photo.text, '');
  const voice = await chat.send('ada', 'bea', '', { kind: 'audio', data: webm.toString('base64'), secs: 12.4 });
  assert.deepEqual(voice.attachment, { kind: 'audio', type: 'audio/webm', size: webm.length, secs: 12 });
  const doc = await chat.send('bea', 'ada', 'the plan', { kind: 'file', data: pdf.toString('base64'), name: '../../My plan?.pdf' });
  assert.equal(doc.attachment.name, '.._.._My plan_.pdf');
  assert.equal(doc.attachment.type, 'application/pdf');
  assert.equal(files.m.size, 3);
  // the list says what the latest is, for the app to word it
  assert.equal((await chat.list('ada'))[0].kind, 'file');
  // both of them get the bytes; the store holds them under the message's own id
  const got = await chat.media('bea', 'ada', photo.id);
  assert.deepEqual([Buffer.from(got.bytes).equals(jpeg), got.type, got.kind], [true, 'image/jpeg', 'image']);
  assert.equal((await chat.media('ada', 'bea', voice.id)).type, 'audio/webm');
  // someone else's conversation with Ada has no such message
  await assert.rejects(chat.media('cal', 'ada', photo.id), e => e.code === 'no-file');
  // what is not what it says is refused
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'image', data: webm.toString('base64') }), e => e.code === 'bad-type');
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'audio', data: pdf.toString('base64') }), e => e.code === 'bad-type');
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'sticker', data: jpeg.toString('base64') }), e => e.code === 'bad-attachment');
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'image', data: Buffer.concat([jpeg, Buffer.alloc(CHAT.imageBytes)]).toString('base64') }), e => e.code === 'file-too-large');
  // taken back: the file goes with the message
  await chat.remove('ada', 'bea', photo.id);
  assert.equal(files.m.size, 2);
  // an account deleted: its conversations' files go too
  await chat.removeUser('ada');
  assert.equal(files.m.size, 0);
});

test('the words under a photo may be removed by an edit; the photo stays', async () => {
  const files = memFiles();
  const chat = createChat({ kv: memoryKv(), now: clock(), files });
  const m = await chat.send('ada', 'bea', 'look', { kind: 'image', data: jpeg.toString('base64') });
  const e = await chat.edit('ada', 'bea', m.id, '');
  assert.deepEqual([e.text, e.attachment.kind, e.edited > 0], ['', 'image', true]);
  assert.equal(files.m.size, 1);
});

test('a server without a place for files says so, and texts still work', async () => {
  const chat = createChat({ kv: memoryKv(), now: clock() });
  await assert.rejects(chat.send('ada', 'bea', 'hi', { kind: 'image', data: jpeg.toString('base64') }), e => e.code === 'no-files');
  assert.equal((await chat.send('ada', 'bea', 'hi')).text, 'hi');
});

test('over the server: a photo is fetched by the two people only', async () => {
  const app = createApp({ store: memoryStore(), photos: memoryPhotos(), env: {} });
  const call = async (method, path, body, token) => {
    const res = await app.handle(new Request('https://x.test/functions/v1/olympus' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) };
  };
  const sign = async name => JSON.parse((await call('POST', '/api/app/signup', { name, email: name + '@example.com', password: 'correct horse battery staple' })).bytes);
  const ada = await sign('ada_lifts'); const bea = await sign('bea_runs'); const cal = await sign('cal_rows');
  const sent = JSON.parse((await call('POST', '/api/chat/send', { id: bea.user.id, attachment: { kind: 'image', data: jpeg.toString('base64') } }, ada.token)).bytes).message;
  const got = await call('GET', `/api/chat/media?id=${ada.user.id}&m=${sent.id}`, null, bea.token);
  assert.equal(got.status, 200);
  assert.equal(got.type, 'image/jpeg');
  assert.ok(got.bytes.equals(jpeg));
  assert.equal((await call('GET', `/api/chat/media?id=${ada.user.id}&m=${sent.id}`, null, cal.token)).status, 404);
  assert.equal((await call('GET', `/api/chat/media?id=${ada.user.id}&m=${sent.id}`)).status, 401);
  const file = JSON.parse((await call('POST', '/api/chat/send', { id: bea.user.id, attachment: { kind: 'file', data: Buffer.from('plain words here').toString('base64'), name: 'notes.txt' } }, ada.token)).bytes).message;
  const res = await app.handle(new Request(`https://x.test/functions/v1/olympus/api/chat/media?id=${ada.user.id}&m=${file.id}`, { headers: { Authorization: 'Bearer ' + bea.token } }));
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''notes\.txt$/);
});

// A tiny MP4 by its first bytes: a size, then 'ftyp'.
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(60, 5)]);

test('a video is an MP4 or a WebM, served as a video, with its seconds kept within limits', async () => {
  const files = memFiles();
  const chat = createChat({ kv: memoryKv(), now: clock(), files });
  const v = await chat.send('ada', 'bea', '', { kind: 'video', data: mp4.toString('base64'), secs: 12.4 });
  assert.deepEqual(v.attachment, { kind: 'video', type: 'video/mp4', size: mp4.length, secs: 12 });
  const w = await chat.send('ada', 'bea', '', { kind: 'video', data: webm.toString('base64'), secs: 999 });
  assert.equal(w.attachment.type, 'video/webm');
  assert.equal(w.attachment.secs, CHAT.videoSeconds);
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'video', data: jpeg.toString('base64') }), e => e.code === 'bad-type' && e.status === 415);
  const big = Buffer.concat([mp4, Buffer.alloc(CHAT.videoBytes)]);
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'video', data: big.toString('base64') }), e => e.code === 'file-too-large');
  // Watched again and again: a video not sent to view once stays.
  for (let i = 0; i < 3; i++) assert.equal((await chat.media('bea', 'ada', v.id)).type, 'video/mp4');
  assert.equal((await chat.list('bea'))[0].kind, 'video');
});

test('view once: the one it was sent to opens it one time, its bytes leave the server, the sender never gets them', async () => {
  const files = memFiles();
  const chat = createChat({ kv: memoryKv(), now: clock(), files });
  const m = await chat.send('ada', 'bea', '', { kind: 'image', data: jpeg.toString('base64'), once: true });
  assert.deepEqual({ once: m.attachment.once, opened: m.attachment.opened }, { once: true, opened: false });
  const [line] = await chat.list('bea');
  assert.deepEqual({ kind: line.kind, once: line.once }, { kind: 'image', once: true });
  assert.equal(files.m.size, 1);
  // The sender cannot fetch it back.
  await assert.rejects(chat.media('ada', 'bea', m.id), e => e.code === 'once-sender' && e.status === 403);
  const got = await chat.media('bea', 'ada', m.id);
  assert.ok(Buffer.from(got.bytes).equals(jpeg));
  assert.equal(got.once, true);
  assert.equal(files.m.size, 0, 'the bytes are gone from the server once given');
  await assert.rejects(chat.media('bea', 'ada', m.id), e => e.code === 'once-opened' && e.status === 410);
  // Both see it was opened; the message itself stays.
  assert.equal((await chat.thread('ada', 'bea')).messages[0].attachment.opened, true);
  assert.equal((await chat.thread('bea', 'ada')).messages[0].attachment.opened, true);
  // Taking back an opened one is fine: nothing is left to remove.
  await chat.remove('ada', 'bea', m.id);
  assert.deepEqual((await chat.thread('bea', 'ada')).messages, []);
});

test('view once: two fetches at the same moment give the photo to one of them only', async () => {
  const files = memFiles();
  const chat = createChat({ kv: memoryKv(), now: clock(), files });
  const m = await chat.send('ada', 'bea', '', { kind: 'video', data: mp4.toString('base64'), secs: 5, once: true });
  const results = await Promise.allSettled([chat.media('bea', 'ada', m.id), chat.media('bea', 'ada', m.id), chat.media('bea', 'ada', m.id)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'once-opened'));
  assert.equal(files.m.size, 0);
});

test('view once is for photos and videos only', async () => {
  const chat = createChat({ kv: memoryKv(), now: clock(), files: memFiles() });
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'audio', data: webm.toString('base64'), secs: 3, once: true }), e => e.code === 'bad-attachment');
  await assert.rejects(chat.send('ada', 'bea', '', { kind: 'file', data: pdf.toString('base64'), name: 'a.pdf', once: true }), e => e.code === 'bad-attachment');
});

test('over the server: a view-once photo is served once, never cached, then answers 410', async () => {
  const app = createApp({ store: memoryStore(), photos: memoryPhotos(), env: {} });
  const call = async (method, path, body, token) => {
    const res = await app.handle(new Request('https://x.test/functions/v1/olympus' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, cache: res.headers.get('cache-control'), bytes: Buffer.from(await res.arrayBuffer()) };
  };
  const sign = async name => JSON.parse((await call('POST', '/api/app/signup', { name, email: name + '@example.com', password: 'correct horse battery staple' })).bytes);
  const ada = await sign('ada_lifts'); const bea = await sign('bea_runs');
  const sent = JSON.parse((await call('POST', '/api/chat/send', { id: bea.user.id, attachment: { kind: 'image', data: jpeg.toString('base64'), once: true } }, ada.token)).bytes).message;
  assert.equal((await call('GET', `/api/chat/media?id=${bea.user.id}&m=${sent.id}`, null, ada.token)).status, 403);
  const first = await call('GET', `/api/chat/media?id=${ada.user.id}&m=${sent.id}`, null, bea.token);
  assert.equal(first.status, 200);
  assert.equal(first.cache, 'no-store');
  assert.ok(first.bytes.equals(jpeg));
  const again = await call('GET', `/api/chat/media?id=${ada.user.id}&m=${sent.id}`, null, bea.token);
  assert.equal(again.status, 410);
  assert.equal(JSON.parse(again.bytes).code, 'once-opened');
});
