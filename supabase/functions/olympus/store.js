// Olympus on Supabase: the documents (core.js) in Postgres, one row each, and the photos of posts
// in a table beside them. Both live in the `olympus` schema, which the Supabase REST API does not
// expose: only this function, through the database connection Supabase hands every function
// (SUPABASE_DB_URL), can read or write them.
import postgres from 'npm:postgres@3.4.5';

// The transaction pooler does not keep prepared statements between calls.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20 });

export const store = {
  async read(key) {
    const rows = await sql`select doc from olympus.docs where key = ${key}`;
    return rows[0]?.doc ?? null;
  },
  // Locks every row named in `keys` (made first if missing, so a first write is locked too), in
  // a fixed order so two requests can never wait on each other, runs fn, saves what it set.
  update(keys, fn) {
    const ks = [...new Set(keys)].sort();
    return sql.begin(async tx => {
      await tx`insert into olympus.docs (key, doc) select k, 'null'::jsonb from unnest(${ks}::text[]) as k on conflict (key) do nothing`;
      const rows = await tx`select key, doc from olympus.docs where key = any(${ks}::text[]) order by key for update`;
      const cur = new Map(rows.map(r => [r.key, r.doc]));
      const pending = new Map();
      const result = await fn({ get: k => (pending.has(k) ? pending.get(k) : (cur.get(k) ?? null)), set: (k, v) => pending.set(k, v) });
      // A document set to null is removed: a profile deleted takes its training document with it.
      for (const [k, v] of pending) {
        if (v == null) await tx`delete from olympus.docs where key = ${k}`;
        else await tx`update olympus.docs set doc = ${tx.json(v)}, updated_at = now() where key = ${k}`;
      }
      return result;
    });
  },
};

export const photos = {
  async put(name, bytes, type) {
    await sql`insert into olympus.photos (name, type, bytes) values (${name}, ${type}, ${bytes}) on conflict (name) do update set type = excluded.type, bytes = excluded.bytes`;
  },
  async get(name) {
    const rows = await sql`select bytes from olympus.photos where name = ${name}`;
    return rows[0] ? new Uint8Array(rows[0].bytes) : null;
  },
  async del(name) {
    await sql`delete from olympus.photos where name = ${name}`;
  },
};
