// Seeds three generations of mock relatives into an existing tree, so the
// radial graph and list view have something realistic to render.
//
// Usage:
//   node scripts/seed-mock.mjs [share-token]
//
// Reads SUPABASE_DB_URL from .env (direct Postgres connection, bypasses RLS
// like scripts/seed.sql does). Targets the tree with the given share token,
// or the most recently created tree when no token is passed. Skips seeding
// if the mock family is already present in that tree.

import { readFileSync } from "node:fs";
import pg from "pg";

function envVar(name) {
  const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in .env`);
  // Strip optional surrounding quotes, the same way dotenv does.
  return line.slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}

// [name, chineseName, gender, birthDate, generation, listOrder]
const PEOPLE = [
  // Generation 1 — the founding couple, center of the radial graph.
  ["Wong Ah Kow", "黃亞九", "male", "1938-02-11", 1, 0],
  ["Tan Mei Lin", "陳美蓮", "female", "1942-08-30", 1, 1],
  // Generation 2 — their three children plus two spouses who married in.
  ["Wong Jia Wei", "黃家偉", "male", "1965-04-02", 2, 0],
  ["Lim Su Ling", "林淑玲", "female", "1968-12-19", 2, 1],
  ["Wong Jia Hui", "黃家慧", "female", "1967-06-25", 2, 2],
  ["Wong Jia Ming", "黃家明", "male", "1970-01-07", 2, 3],
  ["Chen Xiu Ying", "陳秀英", "female", "1972-09-14", 2, 4],
  // Generation 3 — five grandchildren.
  ["Wong Kai Xin", "黃凱欣", "female", "1995-03-21", 3, 0],
  ["Wong Kai Le", "黃凱樂", "male", "1998-07-04", 3, 1],
  ["Wong Zi Han", "黃子涵", "male", "1999-11-02", 3, 2],
  ["Wong Zi Yu", "黃子瑜", "female", "2001-05-16", 3, 3],
  ["Wong Zi Xuan", "黃子萱", "female", "2003-10-28", 3, 4],
];

// [personName, relatedName, type] — a 'parent' row means relatedName is a
// parent of personName (same convention as the relationships table).
const EDGES = [
  ["Wong Ah Kow", "Tan Mei Lin", "spouse"],
  ["Wong Jia Wei", "Lim Su Ling", "spouse"],
  ["Wong Jia Ming", "Chen Xiu Ying", "spouse"],

  ["Wong Jia Wei", "Wong Ah Kow", "parent"],
  ["Wong Jia Wei", "Tan Mei Lin", "parent"],
  ["Wong Jia Hui", "Wong Ah Kow", "parent"],
  ["Wong Jia Hui", "Tan Mei Lin", "parent"],
  ["Wong Jia Ming", "Wong Ah Kow", "parent"],
  ["Wong Jia Ming", "Tan Mei Lin", "parent"],

  ["Wong Kai Xin", "Wong Jia Wei", "parent"],
  ["Wong Kai Xin", "Lim Su Ling", "parent"],
  ["Wong Kai Le", "Wong Jia Wei", "parent"],
  ["Wong Kai Le", "Lim Su Ling", "parent"],
  ["Wong Zi Han", "Wong Jia Ming", "parent"],
  ["Wong Zi Han", "Chen Xiu Ying", "parent"],
  ["Wong Zi Yu", "Wong Jia Ming", "parent"],
  ["Wong Zi Yu", "Chen Xiu Ying", "parent"],
  ["Wong Zi Xuan", "Wong Jia Ming", "parent"],
  ["Wong Zi Xuan", "Chen Xiu Ying", "parent"],
];

const client = new pg.Client({
  connectionString: envVar("SUPABASE_DB_URL"),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const token = process.argv[2];
  const treeResult = token
    ? await client.query(
        "select id, name, share_token, owner_id from trees where share_token = $1",
        [token],
      )
    : await client.query(
        "select id, name, share_token, owner_id from trees order by created_at desc limit 1",
      );
  const tree = treeResult.rows[0];
  if (!tree) {
    throw new Error(
      token ? `No tree with share token "${token}".` : "No trees exist yet — create one in the app first.",
    );
  }

  const existing = await client.query(
    "select 1 from persons where tree_id = $1 and full_name = $2 limit 1",
    [tree.id, PEOPLE[0][0]],
  );
  if (existing.rows.length > 0) {
    console.log(`Mock family already present in "${tree.name}" (/t/${tree.share_token}); nothing to do.`);
    process.exit(0);
  }

  await client.query("begin");
  const idByName = new Map();
  for (const [name, chineseName, gender, birthDate, , listOrder] of PEOPLE) {
    const { rows } = await client.query(
      `insert into persons (tree_id, full_name, chinese_name, gender, birth_date, list_order, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [tree.id, name, chineseName, gender, birthDate, listOrder, tree.owner_id],
    );
    idByName.set(name, rows[0].id);
  }
  for (const [personName, relatedName, type] of EDGES) {
    await client.query(
      `insert into relationships (tree_id, person_id, related_person_id, type, created_by)
       values ($1, $2, $3, $4, $5)`,
      [tree.id, idByName.get(personName), idByName.get(relatedName), type, tree.owner_id],
    );
  }
  await client.query("commit");
  console.log(
    `Seeded ${PEOPLE.length} people / ${EDGES.length} relationships (3 generations) into "${tree.name}" — /t/${tree.share_token}`,
  );
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
