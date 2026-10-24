/* Olympus social layer: follows, posts with photos, likes, comments, notifications, private
 * profiles and blocking between the profiles of one instance.
 *
 * Everything lives in one document, DATA_DIR/social.json, written the same durable way as
 * db.json (write a temporary file, then rename). Photos are files under DATA_DIR/social-photos,
 * named by a random id, with their owner and post recorded in the document. The accounts
 * themselves stay in db.json; this file only refers to them by id, so a profile removed from
 * db.json simply stops appearing (and removeUser() takes everything of it out for good).
 *
 * The store is a plain object with no knowledge of HTTP. server.js owns sessions and turns
 * each route into one call here, which keeps the rules (limits, who may see or delete what, what
 * a post may carry) testable without a server.
 *
 * Who sees what:
 *   - A public profile's posts are seen by every signed-in profile on the server.
 *   - A private profile's posts are seen by itself and by the profiles it has accepted as
 *     followers. Following it sends a request instead, which it accepts or declines. Its name,
 *     bio and counts stay findable, so people can ask.
 *   - A block works both ways and is silent: neither side sees the other's posts or comments,
 *     follows between them are removed, and the blocked profile can no longer find, follow or
 *     reach the one that blocked it. The blocker can still open the blocked profile, to unblock.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export const LIMITS = Object.freeze({
  postText: 1000,
  commentText: 500,
  bio: 160,
  pageSize: 20,
  maxPage: 50,
  maxPosts: 20000,          // the whole instance; past it the oldest posts go
  commentsPerPost: 200,
  postsPerHour: 30,
  commentsPerHour: 120,
  workoutExercises: 20,
  searchResults: 30,
  photosPerPost: 4,
  photoBytes: 2 * 1024 * 1024,
  photosPerHour: 60,
  photosPerUser: 500,
  photoOrphanMs: 24 * 3600 * 1000,   // uploaded but never posted: gone after a day
  notesPerUser: 200,
});

const EMPTY = () => ({ v: 2, follows: {}, posts: [], profiles: {}, requests: {}, blocks: {}, notes: {}, photos: {} });

const str = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const num = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
};
const int = (v, min, max) => Math.round(num(v, min, max));
const rid = n => crypto.randomBytes(n).toString('base64url');
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;

export class SocialError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

/**
 * A workout summary as a post may carry it. Built on the client from a logged workout; the
 * server keeps only these fields, each bounded, so a post can never become a copy of someone's
 * whole training document.
 */
export function cleanWorkout(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
  const d = typeof w.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.d) ? w.d : null;
  const exercises = Array.isArray(w.exercises) ? w.exercises.slice(0, LIMITS.workoutExercises)
    .map(e => (e && typeof e === 'object' ? { n: str(e.n, 80), sets: int(e.sets, 0, 99), best: str(e.best, 40) } : null))
    .filter(e => e && e.n) : [];
  const out = {
    name: str(w.name, 80),
    d,
    durMs: int(w.durMs, 0, 24 * 3600 * 1000),
    vol: num(w.vol, 0, 1e7),
    unit: w.unit === 'lb' ? 'lb' : 'kg',
    sets: int(w.sets, 0, 999),
    prs: int(w.prs, 0, 99),
    exercises,
  };
  if (!out.name && !exercises.length && !out.sets) return null;
  return out;
}

/* ---------------- photos ---------------- */

/** 'jpg' or 'png' from the first bytes, or null: nothing else is stored. */
export function photoType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/**
 * A JPEG without its metadata: every APPn segment but the JFIF header (APP0), and comments,
 * are dropped, which is where EXIF (GPS position, camera serial, time) lives. The app already
 * re-encodes photos on the phone, which drops them too; this holds for any other client.
 * Returns null for a file that does not parse as a JPEG.
 */
export function stripJpeg(buf) {
  if (photoType(buf) !== 'jpg') return null;
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; }                    // fill byte
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); }   // start of scan: the rest is image data
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); return Buffer.concat(out); }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

/** A PNG without its text, time and EXIF chunks. Null for a file that does not parse. */
export function stripPng(buf) {
  if (photoType(buf) !== 'png') return null;
  const DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return null;
    if (!DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  return null;
}

/* ---------------- the store ---------------- */

// `io` (optional) replaces the files: { read() -> text or null, save(text), writePhoto(id, type,
// bytes), deletePhoto(id, type) }. Olympus on Supabase keeps the document in Postgres and the
// photos in Storage this way (supabase/functions/olympus). Without it, everything is files in
// `dataDir`, as on the Node server.
export function createSocial({ dataDir = '.', write, users, now = () => Date.now(), onNotify = () => {}, io = null }) {
  const file = path.join(dataDir, 'social.json');
  const photoDir = path.join(dataDir, 'social-photos');
  let doc = load();
  // Per-profile counters for the hourly limits. In memory on purpose: a restart forgives them,
  // and they exist to stop a runaway client, not to meter anyone.
  const recent = new Map();

  function load() {
    let raw;
    if (io) {
      raw = io.read();
      if (raw == null) return EMPTY();
    } else {
      try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
        if (e.code === 'ENOENT') return EMPTY();
        throw e;
      }
    }
    try {
      const v = JSON.parse(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      const base = EMPTY();
      // Version 1 documents had only follows, posts and profiles: the rest starts empty.
      for (const k of ['follows', 'profiles', 'requests', 'blocks', 'notes', 'photos']) {
        base[k] = v[k] && typeof v[k] === 'object' && !Array.isArray(v[k]) ? v[k] : {};
      }
      base.posts = Array.isArray(v.posts) ? v.posts : [];
      return base;
    } catch (err) {
      // Kept aside, never overwritten: the next save would otherwise replace every post.
      const aside = `${file}.unreadable-${Date.now()}`;
      if (io) throw err;   // a database copy is never replaced by an empty one: the request fails instead
      try { fs.copyFileSync(file, aside); } catch { /* the original stays where it is */ }
      console.error(`social.json cannot be read (${err.message}); kept a copy as ${path.basename(aside)}, starting empty`);
      return EMPTY();
    }
  }
  const save = () => (io ? io.save(JSON.stringify(doc)) : write(file, JSON.stringify(doc)));

  const userById = id => users().find(u => u.id === id && !u.disabled) || null;
  const followsOf = uid => doc.follows[uid] || [];
  const followersOf = uid => Object.keys(doc.follows).filter(k => doc.follows[k].includes(uid) && userById(k));
  const prof = uid => doc.profiles[uid] || {};
  const isPrivate = uid => prof(uid).private === true;
  const blocked = (a, b) => (doc.blocks[a] || []).includes(b);
  const blockedEither = (a, b) => blocked(a, b) || blocked(b, a);
  const requested = (from, to) => (doc.requests[to] || []).includes(from);
  const follows = (a, b) => followsOf(a).includes(b);
  // Whether `viewer` may read `author`'s posts.
  const canSee = (viewerId, authorId) => viewerId === authorId
    || (!blockedEither(viewerId, authorId) && (!isPrivate(authorId) || follows(viewerId, authorId)));
  const postCount = uid => doc.posts.reduce((n, p) => n + (p.uid === uid ? 1 : 0), 0);

  function budget(uid, kind, perHour) {
    const key = kind + '|' + uid;
    const cutoff = now() - 3600000;
    const list = (recent.get(key) || []).filter(t => t > cutoff);
    if (list.length >= perHour) throw new SocialError(429, 'too many in the last hour, try again later', 'rate-limit');
    list.push(now());
    recent.set(key, list);
  }

  const authorOf = uid => {
    const u = userById(uid);
    if (!u) return null;
    const avatar = prof(uid).avatar;
    return avatar ? { id: u.id, name: u.name, avatar } : { id: u.id, name: u.name };
  };

  // A profile as `viewer` sees it. Null when the viewer may not know it exists: it blocked them.
  function publicUser(u, viewer) {
    if (!u || (viewer && viewer.id !== u.id && blocked(u.id, viewer.id))) return null;
    const me = !!viewer && viewer.id === u.id;
    return {
      id: u.id,
      name: u.name,
      bio: prof(u.id).bio || '',
      avatar: prof(u.id).avatar || null,
      private: isPrivate(u.id),
      followers: followersOf(u.id).filter(id => !blockedEither(id, u.id)).length,
      following: followsOf(u.id).filter(userById).length,
      posts: postCount(u.id),
      isFollowing: !!viewer && follows(viewer.id, u.id),
      requested: !!viewer && requested(viewer.id, u.id),
      followsMe: !!viewer && follows(u.id, viewer.id),
      blockedByMe: !!viewer && blocked(viewer.id, u.id),
      canSeePosts: !!viewer && canSee(viewer.id, u.id),
      me,
      ...(me ? { pushSocial: prof(u.id).pushSocial !== false } : {}),
    };
  }

  // A post as a client sees it: the author resolved, likes counted, and only the comments of
  // people the viewer is not in a block with.
  function view(p, viewer) {
    const author = authorOf(p.uid);
    if (!author || !canSee(viewer.id, p.uid)) return null;
    const comments = (p.comments || [])
      .filter(c => !blockedEither(viewer.id, c.uid))
      .map(c => ({ id: c.id, ts: c.ts, text: c.text, author: authorOf(c.uid), mine: c.uid === viewer.id }))
      .filter(c => c.author);
    const likes = (p.likes || []).filter(userById);
    return {
      id: p.id, ts: p.ts, text: p.text || '', workout: p.workout || null, photos: p.photos || [], author,
      likes: likes.length, liked: likes.includes(viewer.id), comments, mine: p.uid === viewer.id,
    };
  }

  // Newest first, `limit` of them, starting strictly before `before` (a post timestamp).
  function page(filter, viewer, { before, limit } = {}) {
    const n = int(limit || LIMITS.pageSize, 1, LIMITS.maxPage);
    const cut = Number(before) > 0 ? Number(before) : Infinity;
    const out = [];
    for (let i = doc.posts.length - 1; i >= 0 && out.length < n; i--) {
      const p = doc.posts[i];
      if (p.ts >= cut || !filter(p)) continue;
      const v = view(p, viewer);
      if (v) out.push(v);
    }
    return { posts: out, next: out.length === n ? out[out.length - 1].ts : null };
  }

  // A post the viewer may act on, or a 404 that does not say whether it exists.
  const findPost = (viewer, id) => {
    const p = typeof id === 'string' ? doc.posts.find(x => x.id === id) : null;
    if (!p || !authorOf(p.uid) || (viewer && !canSee(viewer.id, p.uid))) throw new SocialError(404, 'post not found', 'no-post');
    return p;
  };
  // A profile the viewer may know about. The one that blocked them reads as not there at all.
  const findUser = (viewer, id) => {
    const u = userById(id);
    if (!u || (u.id !== viewer.id && blocked(u.id, viewer.id))) throw new SocialError(404, 'profile not found', 'no-profile');
    return u;
  };

  /* ---------- notifications ---------- */

  function notify(to, kind, from, extra = {}) {
    if (!to || to === from || !userById(to) || blockedEither(to, from)) return;
    const list = doc.notes[to] || (doc.notes[to] = []);
    // A like that comes back after an unlike, or a second follow, is the same news: refreshed,
    // not repeated.
    const same = list.findIndex(n => n.kind === kind && n.from === from && (n.postId || null) === (extra.postId || null) && (kind === 'like' || kind === 'follow' || kind === 'request'));
    const note = { id: rid(6), kind, from, ts: now(), read: false, ...extra };
    if (same >= 0) list.splice(same, 1);
    list.push(note);
    if (list.length > LIMITS.notesPerUser) list.splice(0, list.length - LIMITS.notesPerUser);
    // Push is best-effort and never holds up the action that caused it.
    if (prof(to).pushSocial !== false) {
      try { onNotify(to, { kind, fromName: authorOf(from)?.name || '', text: extra.text || '' }); } catch { /* push is optional */ }
    }
  }
  const unnotify = (to, kind, from, postId) => {
    const list = doc.notes[to];
    if (!list) return;
    doc.notes[to] = list.filter(n => !(n.kind === kind && n.from === from && (n.postId || null) === (postId || null) && !n.read));
  };

  /* ---------- photos ---------- */

  const photoPath = (id, type) => path.join(photoDir, `${id}.${type}`);
  function dropPhotos(ids) {
    for (const id of ids || []) {
      const meta = doc.photos[id];
      if (!meta) continue;
      if (io) io.deletePhoto(id, meta.type);
      else try { fs.unlinkSync(photoPath(id, meta.type)); } catch { /* already gone */ }
      delete doc.photos[id];
    }
  }
  function sweepOrphans() {
    const cutoff = now() - LIMITS.photoOrphanMs;
    const stale = Object.keys(doc.photos).filter(id => !doc.photos[id].postId && !doc.photos[id].avatar && doc.photos[id].ts < cutoff);
    if (stale.length) { dropPhotos(stale); save(); }
    return stale.length;
  }

  function attachable(viewer, list) {
    if (list == null) return [];
    if (!Array.isArray(list)) throw new SocialError(400, 'photos must be a list', 'bad-photos');
    const ids = [...new Set(list.filter(x => typeof x === 'string'))];
    if (ids.length > LIMITS.photosPerPost) throw new SocialError(400, `at most ${LIMITS.photosPerPost} photos per post`, 'too-many-photos');
    for (const id of ids) {
      const meta = doc.photos[id];
      if (!meta || meta.uid !== viewer.id || meta.postId || meta.avatar) throw new SocialError(400, 'unknown photo', 'bad-photos');
    }
    return ids;
  }

  return {
    file,
    photoDir,

    search(viewer, q) {
      const needle = str(q, 40).toLowerCase();
      const all = users().filter(u => !u.disabled && u.id !== viewer.id && !blocked(u.id, viewer.id) && !blocked(viewer.id, u.id));
      const hits = needle ? all.filter(u => String(u.name || '').toLowerCase().includes(needle)) : all;
      // With no query, the people most followed come first: a useful "who is here" list.
      const ranked = hits.map(u => publicUser(u, viewer)).filter(Boolean)
        .sort((a, b) => (needle ? 0 : b.followers - a.followers) || a.name.localeCompare(b.name));
      return ranked.slice(0, LIMITS.searchResults);
    },

    profile(viewer, id, opts) {
      const u = findUser(viewer, typeof id === 'string' && id ? id : viewer.id);
      const user = publicUser(u, viewer);
      return { user, ...(user.canSeePosts ? page(p => p.uid === u.id, viewer, opts) : { posts: [], next: null }) };
    },

    // Bio, private switch and whether likes, comments and follows send a push.
    setProfile(viewer, body = {}) {
      const cur = { ...prof(viewer.id) };
      if (body.bio !== undefined) cur.bio = str(body.bio, LIMITS.bio);
      if (body.pushSocial !== undefined) cur.pushSocial = body.pushSocial !== false;
      // The profile picture: a photo this profile uploaded and has not posted, or null to remove
      // it. The picture it replaces is deleted.
      if (body.avatar !== undefined && (body.avatar || null) !== (cur.avatar || null)) {
        const id = body.avatar || null;
        if (id !== null) {
          const meta = typeof id === 'string' && ID_RE.test(id) ? doc.photos[id] : null;
          if (!meta || meta.uid !== viewer.id || meta.postId || meta.avatar) throw new SocialError(400, 'unknown photo', 'bad-photos');
          meta.avatar = true;
        }
        if (cur.avatar) dropPhotos([cur.avatar]);
        if (id) cur.avatar = id; else delete cur.avatar;
      }
      if (body.private !== undefined) {
        const was = cur.private === true;
        cur.private = body.private === true;
        // Going public lets everyone in who was waiting, the way it reads to them.
        if (was && !cur.private) {
          for (const from of doc.requests[viewer.id] || []) {
            if (!userById(from)) continue;
            doc.follows[from] = [...new Set([...followsOf(from), viewer.id])];
            notify(from, 'accepted', viewer.id);
          }
          delete doc.requests[viewer.id];
        }
      }
      doc.profiles[viewer.id] = cur;
      save();
      return publicUser(viewer, viewer);
    },
    setBio(viewer, bio) { return this.setProfile(viewer, { bio }); },

    follow(viewer, id, on = true) {
      if (id === viewer.id) throw new SocialError(400, 'you cannot follow yourself', 'self');
      const u = findUser(viewer, id);
      if (on && blocked(viewer.id, u.id)) throw new SocialError(409, 'unblock this profile first', 'blocked');
      const list = new Set(followsOf(viewer.id));
      if (on) {
        if (!list.has(u.id)) {
          if (isPrivate(u.id)) {
            if (!requested(viewer.id, u.id)) {
              doc.requests[u.id] = [...(doc.requests[u.id] || []), viewer.id];
              notify(u.id, 'request', viewer.id);
            }
          } else {
            list.add(u.id);
            notify(u.id, 'follow', viewer.id);
          }
        }
      } else {
        list.delete(u.id);
        if (doc.requests[u.id]) {
          doc.requests[u.id] = doc.requests[u.id].filter(x => x !== viewer.id);
          if (!doc.requests[u.id].length) delete doc.requests[u.id];
        }
        unnotify(u.id, 'request', viewer.id);
      }
      if (list.size) doc.follows[viewer.id] = [...list]; else delete doc.follows[viewer.id];
      save();
      return publicUser(u, viewer);
    },

    // Remove someone from your followers (a private profile's way of taking access back).
    removeFollower(viewer, id) {
      const u = userById(id);
      if (!u) throw new SocialError(404, 'profile not found', 'no-profile');
      if (doc.follows[u.id]) {
        doc.follows[u.id] = doc.follows[u.id].filter(x => x !== viewer.id);
        if (!doc.follows[u.id].length) delete doc.follows[u.id];
      }
      save();
      return publicUser(u, viewer);
    },

    requests(viewer) {
      return (doc.requests[viewer.id] || []).map(userById).filter(Boolean).map(u => publicUser(u, viewer)).filter(Boolean);
    },

    answerRequest(viewer, id, accept) {
      const pending = doc.requests[viewer.id] || [];
      if (!pending.includes(id)) throw new SocialError(404, 'no such request', 'no-request');
      doc.requests[viewer.id] = pending.filter(x => x !== id);
      if (!doc.requests[viewer.id].length) delete doc.requests[viewer.id];
      unnotify(viewer.id, 'request', id);
      if (accept && userById(id)) {
        doc.follows[id] = [...new Set([...followsOf(id), viewer.id])];
        notify(id, 'accepted', viewer.id);
      }
      save();
      return this.requests(viewer);
    },

    block(viewer, id, on = true) {
      if (id === viewer.id) throw new SocialError(400, 'you cannot block yourself', 'self');
      const u = userById(id);
      if (!u) throw new SocialError(404, 'profile not found', 'no-profile');
      const list = new Set(doc.blocks[viewer.id] || []);
      if (on) {
        list.add(u.id);
        // Nothing stays connected: follows and requests both ways, and what they sent you.
        for (const [a, b] of [[viewer.id, u.id], [u.id, viewer.id]]) {
          if (doc.follows[a]) { doc.follows[a] = doc.follows[a].filter(x => x !== b); if (!doc.follows[a].length) delete doc.follows[a]; }
          if (doc.requests[b]) { doc.requests[b] = doc.requests[b].filter(x => x !== a); if (!doc.requests[b].length) delete doc.requests[b]; }
          if (doc.notes[a]) doc.notes[a] = doc.notes[a].filter(n => n.from !== b);
        }
      } else {
        list.delete(u.id);
      }
      if (list.size) doc.blocks[viewer.id] = [...list]; else delete doc.blocks[viewer.id];
      save();
      return publicUser(u, viewer);
    },

    blockedList(viewer) {
      return (doc.blocks[viewer.id] || []).map(userById).filter(Boolean).map(u => ({ id: u.id, name: u.name }));
    },

    connections(viewer, id, kind) {
      const u = findUser(viewer, typeof id === 'string' && id ? id : viewer.id);
      // A private profile's lists are as private as its posts.
      if (!canSee(viewer.id, u.id)) throw new SocialError(403, 'this profile is private', 'private');
      const ids = kind === 'following' ? followsOf(u.id) : followersOf(u.id);
      return ids.map(userById).filter(Boolean).map(x => publicUser(x, viewer)).filter(Boolean);
    },

    feed(viewer, opts) {
      const mine = new Set([viewer.id, ...followsOf(viewer.id)]);
      return page(p => mine.has(p.uid), viewer, opts);
    },

    discover(viewer, opts) {
      return page(() => true, viewer, opts);
    },

    post(viewer, id) {
      return view(findPost(viewer, id), viewer);
    },

    createPost(viewer, body) {
      const text = str(body?.text, LIMITS.postText);
      const workout = cleanWorkout(body?.workout);
      const photos = attachable(viewer, body?.photos);
      if (!text && !workout && !photos.length) throw new SocialError(400, 'a post needs text, a workout or a photo', 'empty');
      budget(viewer.id, 'post', LIMITS.postsPerHour);
      // Strictly increasing timestamps: the feed pages by timestamp, and two posts in the same
      // millisecond would otherwise let one fall between two pages.
      const last = doc.posts.length ? doc.posts[doc.posts.length - 1].ts : 0;
      const p = {
        id: rid(9), uid: viewer.id, ts: Math.max(now(), last + 1), text,
        ...(workout ? { workout } : {}), ...(photos.length ? { photos } : {}), likes: [], comments: [],
      };
      for (const id of photos) doc.photos[id].postId = p.id;
      doc.posts.push(p);
      if (doc.posts.length > LIMITS.maxPosts) {
        const gone = doc.posts.splice(0, doc.posts.length - LIMITS.maxPosts);
        dropPhotos(gone.flatMap(x => x.photos || []));
      }
      save();
      return view(p, viewer);
    },

    deletePost(viewer, id, { asAdmin = false } = {}) {
      const p = findPost(asAdmin ? null : viewer, id);
      if (p.uid !== viewer.id && !asAdmin) throw new SocialError(403, 'only the author can delete a post', 'forbidden');
      doc.posts = doc.posts.filter(x => x !== p);
      dropPhotos(p.photos);
      for (const uid of Object.keys(doc.notes)) doc.notes[uid] = doc.notes[uid].filter(n => n.postId !== p.id);
      save();
      return { ok: true };
    },

    like(viewer, id, on = true) {
      const p = findPost(viewer, id);
      const set = new Set(p.likes || []);
      if (on && !set.has(viewer.id)) { set.add(viewer.id); notify(p.uid, 'like', viewer.id, { postId: p.id }); }
      if (!on && set.has(viewer.id)) { set.delete(viewer.id); unnotify(p.uid, 'like', viewer.id, p.id); }
      p.likes = [...set];
      save();
      return view(p, viewer);
    },

    comment(viewer, id, text) {
      const p = findPost(viewer, id);
      const body = str(text, LIMITS.commentText);
      if (!body) throw new SocialError(400, 'a comment needs text', 'empty');
      if ((p.comments || []).length >= LIMITS.commentsPerPost) throw new SocialError(409, 'this post has too many comments', 'full');
      budget(viewer.id, 'comment', LIMITS.commentsPerHour);
      p.comments = [...(p.comments || []), { id: rid(6), uid: viewer.id, ts: now(), text: body }];
      notify(p.uid, 'comment', viewer.id, { postId: p.id, text: body.slice(0, 120) });
      save();
      return view(p, viewer);
    },

    deleteComment(viewer, postId, commentId) {
      const p = findPost(viewer, postId);
      const c = (p.comments || []).find(x => x.id === commentId);
      if (!c) throw new SocialError(404, 'comment not found', 'no-comment');
      // The commenter, or the author of the post it is under.
      if (c.uid !== viewer.id && p.uid !== viewer.id) throw new SocialError(403, 'not your comment', 'forbidden');
      p.comments = p.comments.filter(x => x !== c);
      save();
      return view(p, viewer);
    },

    notifications(viewer) {
      const list = (doc.notes[viewer.id] || []).slice().reverse()
        .map(n => ({ id: n.id, kind: n.kind, ts: n.ts, read: !!n.read, postId: n.postId || null, text: n.text || '', from: authorOf(n.from) }))
        .filter(n => n.from && !blockedEither(viewer.id, n.from.id));
      return { items: list, unread: list.filter(n => !n.read).length, requests: (doc.requests[viewer.id] || []).filter(userById).length };
    },

    markRead(viewer) {
      for (const n of doc.notes[viewer.id] || []) n.read = true;
      save();
      return this.notifications(viewer);
    },

    // A photo before it is posted: decoded, checked, stripped of metadata, stored.
    uploadPhoto(viewer, data) {
      const b64 = typeof data === 'string' ? data.replace(/^data:image\/[a-z]+;base64,/, '') : '';
      if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new SocialError(400, 'send the photo as base64', 'bad-photo');
      let buf = Buffer.from(b64, 'base64');
      if (buf.length > LIMITS.photoBytes) throw new SocialError(413, 'photo too large', 'photo-too-large');
      const type = photoType(buf);
      if (!type) throw new SocialError(415, 'only JPEG and PNG photos are accepted', 'photo-type');
      buf = type === 'jpg' ? stripJpeg(buf) : stripPng(buf);
      if (!buf) throw new SocialError(400, 'that file is not a readable image', 'bad-photo');
      const mine = Object.values(doc.photos).filter(m => m.uid === viewer.id).length;
      if (mine >= LIMITS.photosPerUser) throw new SocialError(409, 'photo storage for this profile is full', 'photos-full');
      budget(viewer.id, 'photo', LIMITS.photosPerHour);
      const id = rid(12);
      if (io) io.writePhoto(id, type, buf);
      else {
        fs.mkdirSync(photoDir, { recursive: true, mode: 0o700 });
        write(photoPath(id, type), buf);
      }
      doc.photos[id] = { uid: viewer.id, ts: now(), type, size: buf.length, postId: null };
      save();
      return { id };
    },

    // Where a photo's bytes are, if `viewer` may see it: its owner, anyone who can see its post,
    // or, for a profile picture, anyone the profile has not blocked (it shows in search too).
    photo(viewer, id) {
      const meta = typeof id === 'string' && ID_RE.test(id) ? doc.photos[id] : null;
      if (!meta) throw new SocialError(404, 'photo not found', 'no-photo');
      if (meta.uid !== viewer.id && meta.avatar) {
        if (blocked(meta.uid, viewer.id) || !userById(meta.uid)) throw new SocialError(404, 'photo not found', 'no-photo');
      } else if (meta.uid !== viewer.id) {
        const p = meta.postId ? doc.posts.find(x => x.id === meta.postId) : null;
        if (!p || !canSee(viewer.id, p.uid)) throw new SocialError(404, 'photo not found', 'no-photo');
      }
      return { file: photoPath(id, meta.type), name: `${id}.${meta.type}`, type: meta.type === 'png' ? 'image/png' : 'image/jpeg', size: meta.size };
    },

    sweepOrphans,

    // An account deleted from the instance (admin dashboard): nothing of it stays behind.
    removeUser(uid) {
      delete doc.follows[uid];
      for (const k of Object.keys(doc.follows)) {
        doc.follows[k] = doc.follows[k].filter(x => x !== uid);
        if (!doc.follows[k].length) delete doc.follows[k];
      }
      for (const map of [doc.requests, doc.blocks]) {
        delete map[uid];
        for (const k of Object.keys(map)) { map[k] = map[k].filter(x => x !== uid); if (!map[k].length) delete map[k]; }
      }
      delete doc.notes[uid];
      for (const k of Object.keys(doc.notes)) doc.notes[k] = doc.notes[k].filter(n => n.from !== uid);
      delete doc.profiles[uid];
      const theirs = doc.posts.filter(p => p.uid === uid);
      doc.posts = doc.posts.filter(p => p.uid !== uid);
      dropPhotos([...theirs.flatMap(p => p.photos || []), ...Object.keys(doc.photos).filter(id => doc.photos[id].uid === uid)]);
      for (const p of doc.posts) {
        p.likes = (p.likes || []).filter(x => x !== uid);
        p.comments = (p.comments || []).filter(c => c.uid !== uid);
      }
      save();
    },

    // For tests: the document as stored.
    _doc: () => doc,
  };
}
