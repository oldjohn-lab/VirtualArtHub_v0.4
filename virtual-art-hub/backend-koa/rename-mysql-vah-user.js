/**
 * Rename MySQL app user vah_curosr -> vah_cursor (keeps password and grants).
 *
 * Requires a MySQL account with user-admin privileges (usually root).
 * Set MYSQL_ADMIN_USER / MYSQL_ADMIN_PASSWORD, or create file mysql-admin.env next to this script:
 *   MYSQL_ADMIN_USER=root
 *   MYSQL_ADMIN_PASSWORD=...
 *
 * mysql-admin.env is gitignored; see mysql-admin.env.example.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'mysql-admin.env'), override: true });
const mysql = require('mysql2/promise');

const oldName = 'vah_curosr';
const newName = 'vah_cursor';

const adminUser = process.env.MYSQL_ADMIN_USER || 'root';
const adminPass = process.env.MYSQL_ADMIN_PASSWORD ?? '';

function qh(part) {
  return `'${String(part).replace(/'/g, "''")}'`;
}

function userAtHost(user, h) {
  return `${qh(user)}@${qh(h)}`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: adminUser,
    password: adminPass,
    multipleStatements: true,
  });

  for (const h of ['localhost', '%']) {
    const [[row]] = await conn.query(`SELECT COUNT(*) AS c FROM mysql.user WHERE User = ? AND Host = ?`, [oldName, h]);
    if (!row || Number(row.c) === 0) {
      console.log(`Skip ${oldName}@${h} (not found)`);
      continue;
    }
    await conn.query(`DROP USER IF EXISTS ${userAtHost(newName, h)}`);
    await conn.query(`RENAME USER ${userAtHost(oldName, h)} TO ${userAtHost(newName, h)}`);
    console.log(`Renamed ${oldName}@${h} -> ${newName}@${h}`);
  }

  await conn.query('FLUSH PRIVILEGES');
  await conn.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
