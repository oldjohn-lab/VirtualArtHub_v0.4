const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ArtPiece = sequelize.define('ArtPiece', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    artType: {
      type: DataTypes.ENUM('photography', 'painting', 'calligraphy', 'video', 'literature', 'object'),
      allowNull: false,
      defaultValue: 'photography',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    extraFilePaths: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    textContent: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    seriesTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    episodeNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    episodeTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    watermarkedFilePath: {
      type: DataTypes.STRING,
      allowNull: true, // Can be null if allowDownload is true
    },
    allowDownload: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users', // This is a reference to the Users table
        key: 'id',
      },
      allowNull: false,
    },
    galleryId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Galleries',
        key: 'id',
      },
      allowNull: true,
    },
  });

  ArtPiece.associate = (models) => {
    ArtPiece.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    ArtPiece.belongsTo(models.Gallery, { foreignKey: 'galleryId', as: 'gallery' });
    ArtPiece.hasMany(models.Comment, { foreignKey: 'artPieceId', as: 'comments' });
    ArtPiece.hasMany(models.Rating, { foreignKey: 'artPieceId', as: 'ratings' });
  };

  return ArtPiece;
};
