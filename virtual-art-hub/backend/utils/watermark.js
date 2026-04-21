const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const applyWatermark = async (imagePath, watermarkText, outputDir) => {
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Create SVG for watermark text
    const svgText = `
      <svg width="${width}" height="${height}">
        <text 
          x="50%" 
          y="50%" 
          font-family="Arial" 
          font-size="${Math.min(width, height) / 10}" 
          fill="rgba(255,255,255,0.5)" 
          text-anchor="middle" 
          dominant-baseline="middle" 
          transform="rotate(-45, ${width / 2}, ${height / 2})"
        >
          ${watermarkText}
        </text>
      </svg>
    `;

    const outputFileName = `watermarked-${path.basename(imagePath)}`;
    const outputPath = path.join(outputDir, outputFileName);

    await image
      .composite([{
        input: Buffer.from(svgText),
        gravity: 'center',
      }])
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error applying watermark:', error);
    throw error;
  }
};

module.exports = { applyWatermark };
