// Olympus: messages between two profiles. A conversation is one document of its own (the last
// messages of two people), and each profile has an inbox document that lists its conversations
// with the latest line and how many messages wait unread, so the list never opens a conversation.
//
//   chat:<a>|<b>   { n, msgs: [{ i, f, t, at }], read: { <uid>: i } }   a < b; f is who wrote it
//   chats:<uid>    { <peer>: { at, text, from, unread } }
//
// The documents live in whatever keeps documents for the server: `kv` is { read(key),
// update(keys, fn({ get, set })) }, where update holds every key it names until fn is done, so a
// message, the two inboxes and the counter move together. Who may write to whom is not decided
// here: the caller passes the other profile as the social layer shows it (someone who blocked
// you is not there at all), so a block stops messages both ways.
//
// Messages are private to the two people. Nothing here is offered to the owner's dashboard but
// counts. Shared by api/server.js and the Supabase function (a test keeps the copies identical).

export const CHAT = Object.freeze({
  text: 2000,      // characters in one message
  keep: 400,       // messages kept in a conversation: the oldest make room
  page: 50,        // messages sent to the app at a time
  preview: 90,     // characters of the latest line shown in the list
  perHour: 240,    // messages one profile may send in an hour
});

export class ChatError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export const chatKey = (a, b) => 'chat:' + [String(a), String(b)].sort().join('|');
export const inboxKey = uid => 'chats:' + uid;

const clean = v => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
const shown = (m, me) => ({ id: m.i, mine: m.f === me, text: m.t, at: m.at });

/**
 * The conversations of a server. `kv` keeps the documents; `now` is the clock. Every method takes
 * the signed-in profile's id; a method about one conversation takes the other profile's id too,
 * already checked by the caller.
 */
export function createChat({ kv, now = () => Date.now() }) {
  // Messages sent lately, per profile: in memory on purpose, as the social limits are. It stops a
  // runaway client, and a restart forgives it.
  const sent = new Map();
  function allow(uid) {
    const t = now();
    const list = (sent.get(uid) || []).filter(x => t - x < 3600000);
    if (list.length >= CHAT.perHour) throw new ChatError(429, 'too many messages, try again later', 'chat-limit');
    list.push(t);
    sent.set(uid, list);
  }

  return {
    /** The inbox of `me`: [{ id (the other profile), at, text, mine, unread }], the latest first. */
    async list(me) {
      const inbox = (await kv.read(inboxKey(me))) || {};
      return Object.entries(inbox)
        .map(([id, c]) => ({ id, at: c.at, text: c.text, mine: c.from === me, unread: Math.max(0, c.unread | 0) }))
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

    /** Sends `text` from `me` to `peer`. Returns the message as the sender sees it. */
    async send(me, peer, text) {
      if (me === peer) throw new ChatError(400, 'that is you', 'chat-self');
      const t = clean(text);
      if (!t) throw new ChatError(400, 'the message is empty', 'empty');
      if (t.length > CHAT.text) throw new ChatError(413, 'the message is too long', 'too-long');
      allow(me);
      const key = chatKey(me, peer);
      let out = null;
      await kv.update([key, inboxKey(me), inboxKey(peer)], ({ get, set }) => {
        const doc = get(key) || { n: 0, msgs: [], read: {} };
        const at = now();
        const m = { i: (doc.n | 0) + 1, f: me, t, at };
        doc.n = m.i;
        doc.msgs = [...(doc.msgs || []), m].slice(-CHAT.keep);
        doc.read = { ...(doc.read || {}), [me]: m.i };
        set(key, doc);
        const line = t.length > CHAT.preview ? t.slice(0, CHAT.preview - 1) + '…' : t;
        const mine = { ...(get(inboxKey(me)) || {}) };
        mine[peer] = { at, text: line, from: me, unread: 0 };
        set(inboxKey(me), mine);
        const theirs = { ...(get(inboxKey(peer)) || {}) };
        theirs[me] = { at, text: line, from: me, unread: Math.max(0, theirs[me]?.unread | 0) + 1 };
        set(inboxKey(peer), theirs);
        out = shown(m, me);
      });
      return out;
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
      let found = false;
      await kv.update([key, inboxKey(me), inboxKey(peer)], ({ get, set }) => {
        const doc = get(key);
        const m = doc?.msgs?.find(x => x.i === Number(id));
        if (!m || m.f !== me) return;
        found = true;
        const msgs = doc.msgs.filter(x => x !== m);
        set(key, { ...doc, msgs });
        // The lists show the latest line that is still there.
        const last = msgs[msgs.length - 1];
        for (const [who, other] of [[me, peer], [peer, me]]) {
          const inbox = get(inboxKey(who));
          if (!inbox?.[other]) continue;
          const unread = who === peer && m.i > (doc.read?.[peer] | 0) ? Math.max(0, (inbox[other].unread | 0) - 1) : inbox[other].unread | 0;
          const line = last ? (last.t.length > CHAT.preview ? last.t.slice(0, CHAT.preview - 1) + '…' : last.t) : '';
          set(inboxKey(who), { ...inbox, [other]: { at: last ? last.at : inbox[other].at, text: line, from: last ? last.f : inbox[other].from, unread } });
        }
      });
      if (!found) throw new ChatError(404, 'message not found', 'no-message');
    },

    /** An account deleted from the server: its inbox goes, and it leaves the others' lists. */
    async removeUser(uid) {
      const inbox = (await kv.read(inboxKey(uid))) || {};
      for (const peer of Object.keys(inbox)) {
        const key = chatKey(uid, peer);
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
