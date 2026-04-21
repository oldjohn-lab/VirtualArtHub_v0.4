const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Gallery = sequelize.define('Gallery', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    coverImage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    coverMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'default',
    },
    showTitle: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    showDescription: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    titleColor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '#1c1c1c',
    },
    titleFontFamily: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Playfair Display',
    },
    titleFontBold: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    descriptionColor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '#3f3f3f',
    },
    descriptionFontFamily: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Lora',
    },
    descriptionFontBold: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    coverOpacity: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.92,
    },
    coverBlur: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 6,
    },
    allowChat: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    allowPublicAccess: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    publicAccessCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
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

  Gallery.associate = (models) => {
    Gallery.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Gallery.hasMany(models.ArtPiece, { foreignKey: 'galleryId', as: 'artPieces' });
  };

  return Gallery;
};
