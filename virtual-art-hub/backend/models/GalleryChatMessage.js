const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GalleryChatMessage = sequelize.define(
    'GalleryChatMessage',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      galleryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Galleries',
          key: 'id',
        },
      },
      senderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
      senderName: {
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
        { fields: ['galleryId'] },
        { fields: ['galleryId', 'createdAt'] },
      ],
    }
  );

  GalleryChatMessage.associate = (models) => {
    GalleryChatMessage.belongsTo(models.Gallery, { foreignKey: 'galleryId', as: 'gallery' });
    GalleryChatMessage.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
  };

  return GalleryChatMessage;
};

