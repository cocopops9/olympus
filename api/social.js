/* Olympus social layer: follows, posts, likes and comments between the profiles of one instance.
 *
 * Everything lives in one document, DATA_DIR/social.json, written the same durable way as
 * db.json (write a temporary file, then rename). The accounts themselves stay in db.json; this
 * file only refers to them by id, so a profile removed from db.json simply stops appearing
 * (and removeUser() takes its posts, likes, comments and follows out for good).
 *
 * The store is a plain object with no knowledge of HTTP. server.js owns sessions and turns
 * each route into one call here, which keeps the rules (limits, who may delete what, what a
 * post may carry) testable without a server.
 *
 * Visibility model: an instance is one community. Every signed-in profile can find every other
 * enabled profile, read its posts on its profile page and in Discover, and follow it. The
 * Following feed is the caller's own posts plus those of the profiles they follow.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
});

const EMPTY = () => ({ v: 1, follows: {}, posts: [], profiles: {} });

const str = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const num = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
};
const int = (v, min, max) => Math.round(num(v, min, max));

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

export function createSocial({ dataDir, write, users, now = () => Date.now() }) {
  const file = path.join(dataDir, 'social.json');
  let doc = load();
  // Per-profile counters for the hourly limits. In memory on purpose: a restart forgives them,
  // and they exist to stop a runaway client, not to meter anyone.
  const recent = new Map();

  function load() {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
      if (e.code === 'ENOENT') return EMPTY();
      throw e;
    }
    try {
      const v = JSON.parse(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      return { ...EMPTY(), ...v, follows: v.follows || {}, posts: Array.isArray(v.posts) ? v.posts : [], profiles: v.profiles || {} };
    } catch (err) {
      // Kept aside, never overwritten: the next save would otherwise replace every post.
      const aside = `${file}.unreadable-${Date.now()}`;
      try { fs.copyFileSync(file, aside); } catch { /* the original stays where it is */ }
      console.error(`social.json cannot be read (${err.message}); kept a copy as ${path.basename(aside)}, starting empty`);
      return EMPTY();
    }
  }
  const save = () => write(file, JSON.stringify(doc));

  const userById = id => users().find(u => u.id === id && !u.disabled) || null;
  const followsOf = uid => doc.follows[uid] || [];
  const followersOf = uid => Object.keys(doc.follows).filter(k => doc.follows[k].includes(uid) && userById(k));
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
    return u ? { id: u.id, name: u.name } : null;
  };

  function publicUser(u, viewer) {
    return {
      id: u.id,
      name: u.name,
      bio: (doc.profiles[u.id] || {}).bio || '',
      followers: followersOf(u.id).length,
      following: followsOf(u.id).filter(userById).length,
      posts: postCount(u.id),
      isFollowing: !!viewer && followsOf(viewer.id).includes(u.id),
      me: !!viewer && viewer.id === u.id,
    };
  }

  // A post as a client sees it: the author resolved, likes counted, comments by live profiles.
  function view(p, viewer) {
    const author = authorOf(p.uid);
    if (!author) return null;
    const comments = (p.comments || [])
      .map(c => ({ id: c.id, ts: c.ts, text: c.text, author: authorOf(c.uid), mine: c.uid === viewer.id }))
      .filter(c => c.author);
    const likes = (p.likes || []).filter(userById);
    return {
      id: p.id, ts: p.ts, text: p.text || '', workout: p.workout || null, author,
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

  const findPost = id => {
    const p = typeof id === 'string' ? doc.posts.find(x => x.id === id) : null;
    if (!p || !authorOf(p.uid)) throw new SocialError(404, 'post not found', 'no-post');
    return p;
  };

  return {
    file,

    search(viewer, q) {
      const needle = str(q, 40).toLowerCase();
      const all = users().filter(u => !u.disabled && u.id !== viewer.id);
      const hits = needle ? all.filter(u => String(u.name || '').toLowerCase().includes(needle)) : all;
      // With no query, the people most followed come first: a useful "who is here" list.
      const ranked = hits.map(u => publicUser(u, viewer))
        .sort((a, b) => (needle ? 0 : b.followers - a.followers) || a.name.localeCompare(b.name));
      return ranked.slice(0, LIMITS.searchResults);
    },

    profile(viewer, id, opts) {
      const u = userById(typeof id === 'string' && id ? id : viewer.id);
      if (!u) throw new SocialError(404, 'profile not found', 'no-profile');
      return { user: publicUser(u, viewer), ...page(p => p.uid === u.id, viewer, opts) };
    },

    setBio(viewer, bio) {
      doc.profiles[viewer.id] = { ...(doc.profiles[viewer.id] || {}), bio: str(bio, LIMITS.bio) };
      save();
      return publicUser(viewer, viewer);
    },

    follow(viewer, id, on = true) {
      if (id === viewer.id) throw new SocialError(400, 'you cannot follow yourself', 'self');
      const u = userById(id);
      if (!u) throw new SocialError(404, 'profile not found', 'no-profile');
      const list = new Set(followsOf(viewer.id));
      if (on) list.add(u.id); else list.delete(u.id);
      if (list.size) doc.follows[viewer.id] = [...list]; else delete doc.follows[viewer.id];
      save();
      return publicUser(u, viewer);
    },

    connections(viewer, id, kind) {
      const u = userById(typeof id === 'string' && id ? id : viewer.id);
      if (!u) throw new SocialError(404, 'profile not found', 'no-profile');
      const ids = kind === 'following' ? followsOf(u.id) : followersOf(u.id);
      return ids.map(userById).filter(Boolean).map(x => publicUser(x, viewer));
    },

    feed(viewer, opts) {
      const mine = new Set([viewer.id, ...followsOf(viewer.id)]);
      return page(p => mine.has(p.uid), viewer, opts);
    },

    discover(viewer, opts) {
      return page(() => true, viewer, opts);
    },

    createPost(viewer, body) {
      const text = str(body?.text, LIMITS.postText);
      const workout = cleanWorkout(body?.workout);
      if (!text && !workout) throw new SocialError(400, 'a post needs text or a workout', 'empty');
      budget(viewer.id, 'post', LIMITS.postsPerHour);
      // Strictly increasing timestamps: the feed pages by timestamp, and two posts in the same
      // millisecond would otherwise let one fall between two pages.
      const last = doc.posts.length ? doc.posts[doc.posts.length - 1].ts : 0;
      const p = {
        id: crypto.randomBytes(9).toString('base64url'),
        uid: viewer.id, ts: Math.max(now(), last + 1), text,
        ...(workout ? { workout } : {}), likes: [], comments: [],
      };
      doc.posts.push(p);
      if (doc.posts.length > LIMITS.maxPosts) doc.posts.splice(0, doc.posts.length - LIMITS.maxPosts);
      save();
      return view(p, viewer);
    },

    deletePost(viewer, id, { asAdmin = false } = {}) {
      const p = findPost(id);
      if (p.uid !== viewer.id && !asAdmin) throw new SocialError(403, 'only the author can delete a post', 'forbidden');
      doc.posts = doc.posts.filter(x => x !== p);
      save();
      return { ok: true };
    },

    like(viewer, id, on = true) {
      const p = findPost(id);
      const set = new Set(p.likes || []);
      if (on) set.add(viewer.id); else set.delete(viewer.id);
      p.likes = [...set];
      save();
      return view(p, viewer);
    },

    comment(viewer, id, text) {
      const p = findPost(id);
      const body = str(text, LIMITS.commentText);
      if (!body) throw new SocialError(400, 'a comment needs text', 'empty');
      if ((p.comments || []).length >= LIMITS.commentsPerPost) throw new SocialError(409, 'this post has too many comments', 'full');
      budget(viewer.id, 'comment', LIMITS.commentsPerHour);
      p.comments = [...(p.comments || []), { id: crypto.randomBytes(6).toString('base64url'), uid: viewer.id, ts: now(), text: body }];
      save();
      return view(p, viewer);
    },

    deleteComment(viewer, postId, commentId) {
      const p = findPost(postId);
      const c = (p.comments || []).find(x => x.id === commentId);
      if (!c) throw new SocialError(404, 'comment not found', 'no-comment');
      // The commenter, or the author of the post it is under.
      if (c.uid !== viewer.id && p.uid !== viewer.id) throw new SocialError(403, 'not your comment', 'forbidden');
      p.comments = p.comments.filter(x => x !== c);
      save();
      return view(p, viewer);
    },

    // An account deleted from the instance (admin dashboard): nothing of it stays behind.
    removeUser(uid) {
      delete doc.follows[uid];
      for (const k of Object.keys(doc.follows)) {
        doc.follows[k] = doc.follows[k].filter(x => x !== uid);
        if (!doc.follows[k].length) delete doc.follows[k];
      }
      delete doc.profiles[uid];
      doc.posts = doc.posts.filter(p => p.uid !== uid);
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
