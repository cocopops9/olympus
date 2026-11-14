// Olympus: what the owner's dashboard is told about one profile and about the community
// (insights.js trainingActivity, socialSummary, communityTotals, moderationPosts), and what it is
// not told: the training itself, and what a private profile posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingActivity, socialSummary, communityTotals, moderationPosts } from '../insights.js';

const DAY = 86400000;
const NOW = Date.parse('2026-11-14T12:00:00Z');
const iso = ts => new Date(ts).toISOString().slice(0, 10);

const tel = () => ({ days: {
  [iso(NOW - DAY)]: { s: 2, sec: 3000, ev: { 'workout.start': 2, 'workout.finish': 1, 'workout.discard': 1, 'routine.start': 1 } },
  [iso(NOW - 9 * DAY)]: { s: 1, sec: 2500, ev: { 'workout.start': 2, 'workout.finish': 2, 'routine.create': 1 } },
  [iso(NOW - 40 * DAY)]: { s: 1, sec: 2000, ev: { 'workout.start': 1, 'workout.finish': 1, 'exercise.create': 3 } },
  [iso(NOW - 2 * DAY)]: { s: 1, sec: 60, ev: { 'post.like': 4 } },
} });

test('how often someone trains is read from the usage statistics, the oldest week first', () => {
  const t = trainingActivity(tel(), { now: NOW });
  assert.equal(t.finished, 4);
  assert.equal(t.started, 5);
  assert.equal(t.discarded, 1);
  assert.equal(t.fromRoutine, 1);
  assert.equal(t.routines, 1);
  assert.equal(t.exercises, 3);
  assert.equal(t.first, iso(NOW - 40 * DAY));
  assert.equal(t.last, iso(NOW - DAY));
  assert.equal(t.weeks.length, 8);
  assert.equal(t.weeks[7], 1, 'one workout finished in the last seven days');
  assert.equal(t.weeks[6], 2, 'two in the week before');
  assert.equal(t.weeks.reduce((a, b) => a + b, 0), 4);
  // The days someone trained, the latest first: a day without a finished workout is not one.
  assert.deepEqual(t.days, [{ day: iso(NOW - DAY), finished: 1 }, { day: iso(NOW - 9 * DAY), finished: 2 }, { day: iso(NOW - 40 * DAY), finished: 1 }]);
  // Nothing but counts and days: no name of a workout, no exercise, no weight could be in it.
  assert.deepEqual(Object.keys(t).sort(), ['days', 'discarded', 'exercises', 'finished', 'first', 'fromRoutine', 'last', 'routines', 'started', 'weeks']);
});

test('no statistics, no training activity', () => {
  for (const doc of [null, {}, { days: {} }]) {
    const t = trainingActivity(doc, { now: NOW });
    assert.equal(t.finished, 0);
    assert.equal(t.last, null);
    assert.deepEqual(t.days, []);
  }
});

const social = () => ({
  follows: { ann: ['bob'], bob: ['ann', 'cat'], cat: ['bob'] },
  profiles: { bob: { private: true, bio: 'Lifter' } },
  blocks: { bob: ['dan'] },
  posts: [
    { id: 'p1', uid: 'bob', ts: NOW - 2 * DAY, text: 'First', likes: ['ann', 'cat'], comments: [{ id: 'c1', uid: 'ann', ts: NOW - DAY, text: 'nice' }] },
    { id: 'p2', uid: 'bob', ts: NOW - DAY, text: 'x'.repeat(400), photos: ['a', 'b'], workout: { name: 'Push' }, likes: [], comments: [] },
    { id: 'p3', uid: 'ann', ts: NOW - 50 * DAY, text: 'Old', likes: ['bob'], comments: [{ id: 'c2', uid: 'bob', ts: NOW - 49 * DAY, text: 'hi' }], song: { title: 'Song' } },
    { id: 'p4', uid: 'gone', ts: NOW - 3 * DAY, text: 'From a deleted profile', likes: [], comments: [] },
  ],
});

test('a profile in the community: its counts and its latest posts, the newest first', () => {
  const s = socialSummary(social(), 'ann');
  assert.equal(s.posts, 1);
  assert.equal(s.followers, 1);
  assert.equal(s.following, 1);
  assert.equal(s.private, false);
  assert.equal(s.commentsWritten, 1);
  assert.equal(s.likesGiven, 1);
  assert.deepEqual(s.latest.map(p => p.id), ['p3']);
  assert.equal(s.latest[0].song, 'Song');
  assert.equal(s.latest[0].likes, 1);
  assert.equal(s.latest[0].comments, 1);
  const long = social();
  long.posts.push({ id: 'p5', uid: 'ann', ts: NOW, text: 'x'.repeat(400), photos: ['a', 'b'], workout: { name: 'Push' }, likes: [], comments: [] });
  const latest = socialSummary(long, 'ann').latest[0];
  assert.equal(latest.id, 'p5');
  assert.equal(latest.text.length, 280);
  assert.equal(latest.photos, 2);
  assert.equal(latest.workout, 'Push');
});

test('a private profile is counted, and what it posts is not shown', () => {
  const s = socialSummary(social(), 'bob');
  assert.equal(s.posts, 2);
  assert.equal(s.followers, 2);
  assert.equal(s.following, 2);
  assert.equal(s.private, true);
  assert.equal(s.bio, 'Lifter');
  assert.equal(s.blocked, 1);
  assert.deepEqual(s.latest, []);
});

test('the community in numbers, over everything and over the period', () => {
  const c = communityTotals(social(), { now: NOW, days: 30 });
  assert.equal(c.posts, 4);
  assert.equal(c.postsPeriod, 3);
  assert.equal(c.workoutPosts, 1);
  assert.equal(c.comments, 2);
  assert.equal(c.commentsPeriod, 1);
  assert.equal(c.likes, 3);
  assert.equal(c.follows, 4);
  assert.equal(c.posters, 2);
  assert.equal(c.privateProfiles, 1);
  assert.equal(communityTotals(null).posts, 0);
});

test('the posts to look over: of public profiles that still exist, in pages, with the author named', () => {
  const users = [{ id: 'ann', name: 'Ann' }, { id: 'bob', name: 'Bob' }, { id: 'cat', name: 'Cat' }];
  const doc = social();
  doc.posts.push({ id: 'p6', uid: 'cat', ts: NOW - 4 * DAY, text: 'Hello', likes: [], comments: [] }, { id: 'p7', uid: 'cat', ts: NOW - 5 * DAY, text: 'Again', likes: [], comments: [] });
  const all = moderationPosts(doc, users);
  // Bob is private (p1, p2) and the author of p4 is gone: neither is listed.
  assert.deepEqual(all.posts.map(p => p.id), ['p6', 'p7', 'p3']);
  assert.equal(all.posts[0].name, 'Cat');
  assert.equal(all.posts[2].song, 'Song');
  assert.equal(all.more, false);
  assert.equal(all.hidden, 2);
  const page = moderationPosts(doc, users, { limit: 2 });
  assert.equal(page.posts.length, 2);
  assert.equal(page.more, true);
  const next = moderationPosts(doc, users, { limit: 2, before: page.posts[1].ts });
  assert.deepEqual(next.posts.map(p => p.id), ['p3']);
});
