const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
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
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.ArtPiece, { foreignKey: 'artPieceId', as: 'artPiece' });
    Comment.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Comment;
};
