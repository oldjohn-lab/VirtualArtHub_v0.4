const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Rating = sequelize.define('Rating', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    artPieceId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'ArtPieces',
        key: 'id',
      },
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users',
        key: 'id',
      },
      allowNull: false,
    },
  }, {
    // A user can only rate an art piece once
    uniqueKeys: {
      unique_rating: {
        fields: ['userId', 'artPieceId']
      }
    }
  });

  Rating.associate = (models) => {
    Rating.belongsTo(models.ArtPiece, { foreignKey: 'artPieceId', as: 'artPiece' });
    Rating.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Rating;
};
