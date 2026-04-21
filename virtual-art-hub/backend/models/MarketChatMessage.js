const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MarketChatMessage = sequelize.define(
    'MarketChatMessage',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      listingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'MarketListings', key: 'id' },
      },
      fromUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
      },
      toUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
      },
      fromUsername: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      clientId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['listingId'] },
        { fields: ['listingId', 'id'] },
        { fields: ['fromUserId', 'toUserId'] },
      ],
    }
  );

  MarketChatMessage.associate = (models) => {
    MarketChatMessage.belongsTo(models.MarketListing, { foreignKey: 'listingId', as: 'listing' });
    MarketChatMessage.belongsTo(models.User, { foreignKey: 'fromUserId', as: 'fromUser' });
    MarketChatMessage.belongsTo(models.User, { foreignKey: 'toUserId', as: 'toUser' });
  };

  return MarketChatMessage;
};
