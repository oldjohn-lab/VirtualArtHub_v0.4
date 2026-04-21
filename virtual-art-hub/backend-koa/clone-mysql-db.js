/**
 * Clone MySQL schema virtual_art_hub -> virtual_art_hub_cursor (tables + data).
 * Uses mysql2 + same env as backend-koa (.env optional).
 *
 * Optional env:
 *   SOURCE_DB (default virtual_art_hub)
 *   TARGET_DB (default virtual_art_hub_cursor)
 *   ALLOW_REPLACE=1  drop target DB if it already exists
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD ?? '';
const sourceDb = process.env.SOURCE_DB || 'virtual_art_hub';
const targetDb = process.env.TARGET_DB || 'virtual_art_hub_cursor';
const allowReplace = process.env.ALLOW_REPLACE === '1' || process.env.ALLOW_REPLACE === 'true';

function qIdent(name) {
  return `\`${String(name).replace(/`/g, '')}\``;
}

async function main() {
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });

  const [[sourceMeta]] = await conn.query(
    `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [sourceDb]
  );
  if (!sourceMeta) {
    console.error(`Source database "${sourceDb}" does not exist.`);
    process.exitCode = 1;
    await conn.end();
    return;
  }

  const [[targetMeta]] = await conn.query(
    `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [targetDb]
  );
  if (targetMeta) {
    if (!allowReplace) {
      console.error(
        `Target database "${targetDb}" already exists. Set ALLOW_REPLACE=1 to drop and recreate, or drop it manually.`
      );
      process.exitCode = 1;
      await conn.end();
      return;
    }
    await conn.query(`DROP DATABASE ${qIdent(targetDb)}`);
    console.log(`Dropped existing database ${targetDb}`);
  }

  const [[charsetRow]] = await conn.query(
    `SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS coll
     FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [sourceDb]
  );
  const cs = String(charsetRow.cs || 'utf8mb4').replace(/[^a-zA-Z0-9_-]/g, '');
  const coll = String(charsetRow.coll || 'utf8mb4_unicode_ci').replace(/[^a-zA-Z0-9_-]/g, '');

  await conn.query(
    `CREATE DATABASE ${qIdent(targetDb)} CHARACTER SET ${qIdent(cs)} COLLATE ${qIdent(coll)}`
  );
  console.log(`Created database ${targetDb} (${cs} / ${coll})`);

  const [tables] = await conn.query(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
    [sourceDb]
  );

  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const row of tables) {
    const t = row.t;
    await conn.query(`CREATE TABLE ${qIdent(targetDb)}.${qIdent(t)} LIKE ${qIdent(sourceDb)}.${qIdent(t)}`);
    await conn.query(`INSERT INTO ${qIdent(targetDb)}.${qIdent(t)} SELECT * FROM ${qIdent(sourceDb)}.${qIdent(t)}`);
    const [[cnt]] = await conn.query(`SELECT COUNT(*) AS c FROM ${qIdent(targetDb)}.${qIdent(t)}`);
    console.log(`  table ${t}: ${cnt.c} rows`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  const [views] = await conn.query(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'`,
    [sourceDb]
  );
  if (views.length) {
    console.warn(`Skipped ${views.length} view(s); clone those manually if needed.`);
  }

  await conn.end();
  console.log(`Clone completed: ${sourceDb} -> ${targetDb}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
