const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MarketCartItem = sequelize.define(
    'MarketCartItem',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
      },
      listingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'MarketListings', key: 'id' },
      },
    },
    {
      indexes: [{ unique: true, fields: ['userId', 'listingId'] }],
    }
  );

  MarketCartItem.associate = (models) => {
    MarketCartItem.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    MarketCartItem.belongsTo(models.MarketListing, { foreignKey: 'listingId', as: 'listing' });
  };

  return MarketCartItem;
};
