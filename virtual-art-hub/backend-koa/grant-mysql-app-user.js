/**
 * Create MySQL user and grant privileges on one database (admin via .env).
 *
 * Required env: VAH_MYSQL_PASSWORD
 * Optional: VAH_MYSQL_USER (default vah_cursor), VAH_MYSQL_DB (default virtual_art_hub_cursor)
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const adminUser = process.env.DB_USER || 'root';
const adminPass = process.env.DB_PASSWORD ?? '';

const appUser = process.env.VAH_MYSQL_USER || 'vah_cursor';
const appPass = process.env.VAH_MYSQL_PASSWORD;
const database = process.env.VAH_MYSQL_DB || 'virtual_art_hub_cursor';

function qh(part) {
  return `'${String(part).replace(/'/g, "''")}'`;
}

function userAtHost(h) {
  return `${qh(appUser)}@${qh(h)}`;
}

function qDb(db) {
  return `\`${String(db).replace(/`/g, '')}\``;
}

async function main() {
  if (!appPass) {
    console.error('Missing VAH_MYSQL_PASSWORD');
    process.exitCode = 1;
    return;
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user: adminUser,
    password: adminPass,
    multipleStatements: true,
  });

  const passLit = mysql.escape(appPass);

  for (const h of ['localhost', '%']) {
    await conn.query(`DROP USER IF EXISTS ${userAtHost(h)}`);
    await conn.query(`CREATE USER ${userAtHost(h)} IDENTIFIED BY ${passLit}`);
    await conn.query(`GRANT ALL PRIVILEGES ON ${qDb(database)}.* TO ${userAtHost(h)}`);
  }

  await conn.query('FLUSH PRIVILEGES');
  await conn.end();
  console.log(`User ${appUser}@localhost and ${appUser}@% created with ALL on ${database}.*`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
