/**
 * 删除遗留的拍卖表 Bids、Auctions（先删子表）。使用 backend-koa 的 .env 数据库配置。
 * 运行：node drop-legacy-auction-tables.js
 */
require('dotenv').config();
const Sequelize = require('sequelize');

async function main() {
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'virtual_art_hub_cursor',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      dialect: 'mysql',
      logging: console.log,
    }
  );
  await sequelize.authenticate();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    await sequelize.query('DROP TABLE IF EXISTS `Bids`');
    await sequelize.query('DROP TABLE IF EXISTS `Auctions`');
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  await sequelize.close();
  console.log('Dropped legacy tables: Bids, Auctions (if they existed).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
