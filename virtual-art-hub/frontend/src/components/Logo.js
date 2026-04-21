import React from 'react';

const LOGO_SRC = `${process.env.PUBLIC_URL || ''}/brand/vah-logo.png`;

/** 透明底 VAH 图形 + 右侧「Virtual Art Hub」字标 */
const Logo = ({ compact }) => (
  <div className={`brand-mark brand-mark--vah-image${compact ? ' brand-mark--compact' : ''}`}>
    <img
      className="brand-mark-vah-img"
      src={LOGO_SRC}
      alt=""
      width={360}
      height={197}
      decoding="async"
    />
    <div className="brand-mark-text">
      <div className="brand-mark-title">Virtual Art Hub</div>
    </div>
  </div>
);

export default Logo;
