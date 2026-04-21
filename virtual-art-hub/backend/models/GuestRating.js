const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GuestRating = sequelize.define('GuestRating', {
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
    guestId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
  }, {
    indexes: [
      { unique: true, fields: ['artPieceId', 'guestId'] },
      { fields: ['artPieceId'] },
    ],
  });

  GuestRating.associate = (models) => {
    GuestRating.belongsTo(models.ArtPiece, { foreignKey: 'artPieceId', as: 'artPiece' });
  };

  return GuestRating;
};

