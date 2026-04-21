const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const db = {};

const sequelize = new Sequelize(
  process.env.DB_NAME || 'virtual_art_hub_cursor',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: false,
    timezone: '+00:00',
  }
);

const modelsDir = path.resolve(__dirname, '..', 'backend', 'models');
const basename = 'index.js';

fs.readdirSync(modelsDir)
  .filter((file) => file.endsWith('.js') && file !== basename)
  .forEach((file) => {
    const modelFactory = require(path.join(modelsDir, file));
    const model = modelFactory(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName] && typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
