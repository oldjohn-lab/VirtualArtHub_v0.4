const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MarketListing = sequelize.define(
    'MarketListing',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      artPieceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'ArtPieces', key: 'id' },
      },
      sellerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('active', 'sold', 'cancelled'),
        defaultValue: 'active',
      },
      buyerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
      },
    },
    {
      indexes: [{ fields: ['status'] }, { fields: ['sellerId'] }],
    }
  );

  MarketListing.associate = (models) => {
    MarketListing.belongsTo(models.ArtPiece, { foreignKey: 'artPieceId', as: 'artPiece' });
    MarketListing.belongsTo(models.User, { foreignKey: 'sellerId', as: 'seller' });
    MarketListing.belongsTo(models.User, { foreignKey: 'buyerId', as: 'buyer' });
  };

  return MarketListing;
};
