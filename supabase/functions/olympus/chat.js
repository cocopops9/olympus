// Copied from api/chat.js by scripts/supabase-bundle.mjs. Edit that file, then run the script.
// Olympus: messages between two profiles. A conversation is one document of its own (the last
// messages of two people), and each profile has an inbox document that lists its conversations
// with the latest line and how many messages wait unread, so the list never opens a conversation.
//
//   chat:<a>|<b>   { n, msgs: [{ i, f, t, at, a? }], read: { <uid>: i } }   a < b; f is who wrote it
//   chats:<uid>    { <peer>: { at, text, from, unread, k? } }
//
// A message may carry one attachment, `a`: { k: 'image' | 'video' | 'audio' | 'file', id, y: its
// type, s: bytes, n: a file's name, d: a voice message's or a video's seconds, o: 1 when it may be
// opened once, v: when it was opened }. Its bytes are kept by `files` ({ put(name, bytes, type),
// get(name), del(name) }) under 'chat-' + id, and only the two people of the conversation can
// fetch them (media). The inbox line of an attachment carries its kind, `k`, and `o` for a
// view-once one, so the app says "Photo" or "View-once video" in the reader's language.
//
// View once: a photo or a video sent so may be fetched one time, by the one it was sent to. That
// fetch marks it opened under the conversation's lock (two taps at once cannot both win) and
// removes its bytes from the server before they are sent, so nothing is left to fetch again;
// the sender never gets them back either. The message stays, saying it was opened.
//
// The documents live in whatever keeps documents for the server: `kv` is { read(key),
// update(keys, fn({ get, set })) }, where update holds every key it names until fn is done, so a
// message, the two inboxes and the counter move together. Who may write to whom is not decided
// here: the caller passes the other profile as the social layer shows it (someone who blocked
// you is not there at all), so a block stops messages both ways.
//
// Messages are private to the two people. Nothing here is offered to the owner's dashboard but
// counts. Shared by api/server.js and the Supabase function (a test keeps the copies identical).

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export const CHAT = Object.freeze({
  text: 2000,      // characters in one message
  keep: 400,       // messages kept in a conversation: the oldest make room
  page: 50,        // messages sent to the app at a time
  preview: 90,     // characters of the latest line shown in the list
  perHour: 240,    // messages one profile may send in an hour
  // Attachments. A request carries 5 MB at most and the bytes come as base64, so a file is
  // 3.5 MB at most; a photo is shrunk by the app first, a voice message is compressed speech.
  imageBytes: 2.5 * 1024 * 1024,
  audioBytes: 2 * 1024 * 1024,
  fileBytes: 3.5 * 1024 * 1024,
  // A video is cut and shrunk by the app first (frontend lib/video.js): 30 s in 3 MB at most.
  videoBytes: 3 * 1024 * 1024,
  videoSeconds: 30,
  audioSeconds: 300,
  filesPerHour: 40,
  fileName: 120,
});

// What an attachment's first bytes say it is. A photo or a voice message must be one of these;
// any other file is kept, and served as a download, never shown.
export function sniff(buf) {
  const b = buf, str = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { k: 'image', y: 'image/jpeg' };
  if (b[0] === 0x89 && str(1, 3) === 'PNG') return { k: 'image', y: 'image/png' };
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') return { k: 'image', y: 'image/webp' };
  if (str(0, 4) === 'GIF8') return { k: 'image', y: 'image/gif' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { k: 'audio', y: 'audio/webm' };
  if (str(0, 4) === 'OggS') return { k: 'audio', y: 'audio/ogg' };
  if (str(4, 4) === 'ftyp') return { k: 'audio', y: 'audio/mp4' };
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE') return { k: 'audio', y: 'audio/wav' };
  if (str(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { k: 'audio', y: 'audio/mpeg' };
  if (str(0, 5) === '%PDF-') return { k: 'file', y: 'application/pdf' };
  return null;
}

export class ChatError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export const chatKey = (a, b) => 'chat:' + [String(a), String(b)].sort().join('|');
export const inboxKey = uid => 'chats:' + uid;

const clean = v => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
const attachmentOut = a => (a ? { kind: a.k, type: a.y, size: a.s, ...(a.n ? { name: a.n } : {}), ...(a.d ? { secs: a.d } : {}), ...(a.o ? { once: true, opened: !!a.v } : {}) } : null);
// What a conversation's list says of a message's attachment.
const lineKind = a => (a ? { k: a.k, ...(a.o ? { o: 1 } : {}) } : {});
const shown = (m, me) => ({ id: m.i, mine: m.f === me, text: m.t, at: m.at, ...(m.a ? { attachment: attachmentOut(m.a) } : {}) });
const fileKey = id => 'chat-' + id;
const lineOf = t => (t.length > CHAT.preview ? t.slice(0, CHAT.preview - 1) + '…' : t);
// A file's name as it may be shown and saved: no folders, no control characters, not too long.
const safeName = v => clean(v).replace(/[\\/:*?"<>|]/g, '_').slice(0, CHAT.fileName) || 'file';

/**
 * The attachment of a message being sent, checked: { k, y, s, n?, d?, o?, bytes }. `att` is what
 * the app sends: { kind: 'image' | 'video' | 'audio' | 'file', data: base64, name?, secs?, once? }.
 */
export function readAttachment(att) {
  const kind = att?.kind;
  if (!['image', 'video', 'audio', 'file'].includes(kind)) throw new ChatError(400, 'unknown kind of attachment', 'bad-attachment');
  if (att.once && kind !== 'image' && kind !== 'video') throw new ChatError(400, 'only a photo or a video can be sent to view once', 'bad-attachment');
  const b64 = typeof att.data === 'string' ? att.data.replace(/^data:[^;,]*;base64,/, '') : '';
  if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new ChatError(400, 'send the file as base64', 'bad-attachment');
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  const max = kind === 'image' ? CHAT.imageBytes : kind === 'video' ? CHAT.videoBytes : kind === 'audio' ? CHAT.audioBytes : CHAT.fileBytes;
  if (!bytes.length) throw new ChatError(400, 'the file is empty', 'bad-attachment');
  if (bytes.length > max) throw new ChatError(413, 'the file is too large', 'file-too-large');
  const seen = sniff(bytes);
  // An MP4 or a WebM reads as a sound by its first bytes; sent as a video, it is served as one.
  const asVideo = { 'audio/mp4': 'video/mp4', 'audio/webm': 'video/webm' }[seen?.y];
  if (kind === 'video' && !asVideo) throw new ChatError(415, 'that is not a video this app can play', 'bad-type');
  if ((kind === 'image' || kind === 'audio') && seen?.k !== kind) throw new ChatError(415, `that is not ${kind === 'image' ? 'a photo' : 'a sound'} this app can show`, 'bad-type');
  const y = kind === 'file' ? (seen?.y === 'application/pdf' ? 'application/pdf' : 'application/octet-stream') : kind === 'video' ? asVideo : seen.y;
  const out = { k: kind, y, s: bytes.length, bytes };
  if (kind === 'file') out.n = safeName(att.name);
  const secs = limit => Math.max(1, Math.min(limit, Math.round(Number(att.secs) || 0) || 1));
  if (kind === 'audio') out.d = secs(CHAT.audioSeconds);
  if (kind === 'video') out.d = secs(CHAT.videoSeconds);
  if (att.once) out.o = 1;
  return out;
}

/**
 * The conversations of a server. `kv` keeps the documents; `now` is the clock. Every method takes
 * the signed-in profile's id; a method about one conversation takes the other profile's id too,
 * already checked by the caller.
 */
export function createChat({ kv, now = () => Date.now(), files = null }) {
  // Messages sent lately, per profile: in memory on purpose, as the social limits are. It stops a
  // runaway client, and a restart forgives it.
  const sent = new Map();
  function allow(uid, what = 'msg', max = CHAT.perHour) {
    const t = now();
    const key = what + ':' + uid;
    const list = (sent.get(key) || []).filter(x => t - x < 3600000);
    if (list.length >= max) throw new ChatError(429, 'too many messages, try again later', 'chat-limit');
    list.push(t);
    sent.set(key, list);
  }
  // A file whose message is gone: removed, best effort (a leftover costs space, not privacy, as
  // nothing points at it any more).
  const drop = async list => { for (const m of list) if (m?.a?.id && files) { try { await files.del(fileKey(m.a.id)); } catch { /* best effort */ } } };

  // A view-once attachment opened by `me`: marked under the lock first, so of two fetches at once
  // only one gets past it; then its bytes are read and removed. Should reading them fail after the
  // mark, the photo is lost rather than shown twice: that is the promise made to the sender.
  async function openOnce(me, key, i) {
    let a = null, why = null;
    await kv.update([key], ({ get, set }) => {
      const doc = get(key);
      const m = doc?.msgs?.find(x => x.i === i);
      if (!m?.a?.o) { why = ['no-file', 404, 'file not found']; return; }
      if (m.f === me) { why = ['once-sender', 403, 'a photo or video sent to view once is for the other person only']; return; }
      if (m.a.v) { why = ['once-opened', 410, 'already opened']; return; }
      m.a.v = now();
      a = { ...m.a };
      set(key, doc);
    });
    if (why) throw new ChatError(why[1], why[2], why[0]);
    let bytes = null;
    try { bytes = await files.get(fileKey(a.id)); } finally { await drop([{ a }]); }
    if (!bytes) throw new ChatError(410, 'already opened', 'once-opened');
    return { bytes, type: a.y, name: null, kind: a.k, once: true };
  }

  return {
    /** The inbox of `me`: [{ id (the other profile), at, text, mine, unread }], the latest first. */
    async list(me) {
      const inbox = (await kv.read(inboxKey(me))) || {};
      return Object.entries(inbox)
        .map(([id, c]) => ({ id, at: c.at, text: c.text, mine: c.from === me, unread: Math.max(0, c.unread | 0), ...(c.k ? { kind: c.k } : {}), ...(c.o ? { once: true } : {}) }))
        .sort((x, y) => y.at - x.at);
    },

    /** How many messages wait unread for `me`, over every conversation. */
    async unread(me) {
      const inbox = (await kv.read(inboxKey(me))) || {};
      return Object.values(inbox).reduce((n, c) => n + Math.max(0, c.unread | 0), 0);
    },

    /**
     * The conversation of `me` with `peer`: { messages, more, seen }. The latest CHAT.page
     * messages, or those before message `before`; `more` says older ones exist; `seen` is the
     * last message of `me` the other has read (0 when none).
     */
    async thread(me, peer, { before } = {}) {
      const doc = (await kv.read(chatKey(me, peer))) || { n: 0, msgs: [], read: {} };
      const upTo = Number(before) > 0 ? doc.msgs.filter(m => m.i < Number(before)) : doc.msgs;
      const page = upTo.slice(-CHAT.page);
      return { messages: page.map(m => shown(m, me)), more: upTo.length > page.length, seen: doc.read?.[peer] | 0 };
    },

    /**
     * Sends `text` from `me` to `peer`, with `attachment` ({ kind, data, name?, secs }) if any:
     * a message may be an attachment alone. Returns the message as the sender sees it.
     */
    async send(me, peer, text, attachment = null) {
      if (me === peer) throw new ChatError(400, 'that is you', 'chat-self');
      const t = clean(text);
      if (!t && !attachment) throw new ChatError(400, 'the message is empty', 'empty');
      if (t.length > CHAT.text) throw new ChatError(413, 'the message is too long', 'too-long');
      let att = null;
      if (attachment) {
        if (!files) throw new ChatError(501, 'this server keeps no files', 'no-files');
        att = readAttachment(attachment);
      }
      allow(me);
      if (att) allow(me, 'file', CHAT.filesPerHour);
      let a = null;
      if (att) {
        a = { k: att.k, id: crypto.randomBytes(12).toString('base64url'), y: att.y, s: att.s, ...(att.n ? { n: att.n } : {}), ...(att.d ? { d: att.d } : {}), ...(att.o ? { o: 1 } : {}) };
        // The bytes first: a message is never there without its file.
        await files.put(fileKey(a.id), att.bytes, a.y);
      }
      const key = chatKey(me, peer);
      let out = null, gone = [];
      try {
        await kv.update([key, inboxKey(me), inboxKey(peer)], ({ get, set }) => {
          const doc = get(key) || { n: 0, msgs: [], read: {} };
          const at = now();
          const m = { i: (doc.n | 0) + 1, f: me, t, at, ...(a ? { a } : {}) };
          doc.n = m.i;
          const all = [...(doc.msgs || []), m];
          gone = all.slice(0, Math.max(0, all.length - CHAT.keep));
          doc.msgs = all.slice(-CHAT.keep);
          doc.read = { ...(doc.read || {}), [me]: m.i };
          set(key, doc);
          const line = lineOf(t);
          const mine = { ...(get(inboxKey(me)) || {}) };
          mine[peer] = { at, text: line, from: me, unread: 0, ...lineKind(a) };
          set(inboxKey(me), mine);
          const theirs = { ...(get(inboxKey(peer)) || {}) };
          theirs[me] = { at, text: line, from: me, unread: Math.max(0, theirs[me]?.unread | 0) + 1, ...lineKind(a) };
          set(inboxKey(peer), theirs);
          out = shown(m, me);
        });
      } catch (e) {
        if (a) await drop([{ a }]);
        throw e;
      }
      await drop(gone);
      return out;
    },

    /**
     * The bytes of the attachment of message `id` in the conversation of `me` with `peer`:
     * { bytes, type, name, kind, once }. Nobody else's conversation can be reached: the key is
     * made of the two people. A view-once attachment is given to the one it was sent to, once:
     * it is marked opened and its bytes leave the server in the same call.
     */
    async media(me, peer, id) {
      const key = chatKey(me, peer);
      const doc = await kv.read(key);
      const m = doc?.msgs?.find(x => x.i === Number(id));
      if (!m?.a || !files) throw new ChatError(404, 'file not found', 'no-file');
      if (m.a.o) return openOnce(me, key, m.i);
      const bytes = await files.get(fileKey(m.a.id));
      if (!bytes) throw new ChatError(404, 'file not found', 'no-file');
      return { bytes, type: m.a.y, name: m.a.n || null, kind: m.a.k, once: false };
    },

    /** `me` has read the conversation with `peer` up to now. */
    async read(me, peer) {
      const key = chatKey(me, peer);
      await kv.update([key, inboxKey(me)], ({ get, set }) => {
        const doc = get(key);
        const inbox = get(inboxKey(me));
        if (doc && (doc.read?.[me] | 0) !== (doc.n | 0)) set(key, { ...doc, read: { ...(doc.read || {}), [me]: doc.n | 0 } });
        if (inbox?.[peer]?.unread) set(inboxKey(me), { ...inbox, [peer]: { ...inbox[peer], unread: 0 } });
      });
    },

    /** Takes back message `id`, which `me` wrote to `peer`. */
    async remove(me, peer, id) {
      const key = chatKey(me, peer);
      let found = null;
      await kv.update([key, inboxKey(me), inboxKey(peer)], ({ get, set }) => {
        const doc = get(key);
        const m = doc?.msgs?.find(x => x.i === Number(id));
        if (!m || m.f !== me) return;
        found = m;
        const msgs = doc.msgs.filter(x => x !== m);
        set(key, { ...doc, msgs });
        // The lists show the latest line that is still there.
        const last = msgs[msgs.length - 1];
        for (const [who, other] of [[me, peer], [peer, me]]) {
          const inbox = get(inboxKey(who));
          if (!inbox?.[other]) continue;
          const unread = who === peer && m.i > (doc.read?.[peer] | 0) ? Math.max(0, (inbox[other].unread | 0) - 1) : inbox[other].unread | 0;
          const line = last ? lineOf(last.t) : '';
          set(inboxKey(who), { ...inbox, [other]: { at: last ? last.at : inbox[other].at, text: line, from: last ? last.f : inbox[other].from, unread, ...lineKind(last?.a) } });
        }
      });
      if (!found) throw new ChatError(404, 'message not found', 'no-message');
      await drop([found]);
    },

    /** An account deleted from the server: its inbox goes, and it leaves the others' lists. */
    async removeUser(uid) {
      const inbox = (await kv.read(inboxKey(uid))) || {};
      for (const peer of Object.keys(inbox)) {
        const key = chatKey(uid, peer);
        await drop((await kv.read(key))?.msgs || []);
        await kv.update([key, inboxKey(peer)], ({ get, set }) => {
          set(key, null);
          const theirs = get(inboxKey(peer));
          if (theirs?.[uid]) { const next = { ...theirs }; delete next[uid]; set(inboxKey(peer), Object.keys(next).length ? next : null); }
        });
      }
      await kv.update([inboxKey(uid)], ({ set }) => { set(inboxKey(uid), null); });
    },

    /** For the owner's dashboard: how many conversations and messages, never what they say. */
    async countsOf(uid) {
      const inbox = (await kv.read(inboxKey(uid))) || {};
      return { conversations: Object.keys(inbox).length };
    },
  };
}

/**
 * Documents kept in memory behind one lock, for a server without a document store of its own
 * (api/server.js saves them to a file with `save`) and for tests. `docs` is a Map.
 */
export function memoryKv(docs = new Map(), save = () => {}) {
  let chain = Promise.resolve();
  return {
    docs,
    read: async key => (docs.has(key) ? JSON.parse(JSON.stringify(docs.get(key))) : null),
    update(keys, fn) {
      const run = chain.then(async () => {
        const pending = new Map();
        const result = await fn({
          get: k => (pending.has(k) ? pending.get(k) : docs.has(k) ? JSON.parse(JSON.stringify(docs.get(k))) : null),
          set: (k, v) => pending.set(k, v),
        });
        for (const [k, v] of pending) { if (v == null) docs.delete(k); else docs.set(k, v); }
        if (pending.size) await save(docs);
        return result;
      });
      chain = run.catch(() => {});
      return run;
    },
  };
}
