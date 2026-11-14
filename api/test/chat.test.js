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
  // Bea blocks Ada: Ada cannot write to her any more, and the conversation leaves both lists.
  assert.equal((await call('POST', '/api/social/block', { id: ada.user.id }, bea.token)).status, 200);
  assert.equal((await call('POST', '/api/chat/send', { id: bea.user.id, text: 'still there?' }, ada.token)).status, 404);
  assert.equal((await call('POST', '/api/chat/send', { id: ada.user.id, text: 'no' }, bea.token)).status, 403);
  assert.deepEqual((await call('GET', '/api/chat', null, ada.token)).body.chats, []);
  assert.deepEqual((await call('GET', '/api/chat', null, bea.token)).body.chats, []);
});
