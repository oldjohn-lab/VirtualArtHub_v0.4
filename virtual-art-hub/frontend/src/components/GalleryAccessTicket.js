import React, { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import './GalleryAccessTicket.css';

function safeDownloadBaseName(raw) {
  const s = String(raw || '').trim() || 'gallery-access-ticket';
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80);
}

/**
 * 直达访问门票预览：顶部品牌、中部展厅海报、底部二维码与链接。
 * @param {string} accessUrl - 写入二维码的完整 URL
 * @param {React.CSSProperties | null} posterStyle - 海报区背景（与表单裁剪一致）；null 时使用高级渐变占位
 * @param {string} galleryTitle - 海报区底部叠字标题
 * @param {string} [galleryDescription] - 展厅描述（空字符串则不显示该区域）
 * @param {string} [titleColor] - 展厅名称颜色（与表单一致）
 * @param {string} [titleFontFamily] - 展厅名称字体
 * @param {boolean} [titleFontBold] - 展厅名称是否加粗
 * @param {string} [descriptionColor] - 描述文字颜色
 * @param {string} [descriptionFontFamily] - 描述字体
 * @param {boolean} [descriptionFontBold] - 展厅描述是否加粗
 * @param {string} stubText - 二维码上方短标签
 * @param {string} [hintText] - 底部说明
 * @param {string} [downloadName] - 下载 PNG 文件名（不含扩展名）建议用展厅名称
 */
const GalleryAccessTicket = ({
  accessUrl,
  posterStyle,
  galleryTitle,
  galleryDescription,
  titleColor,
  titleFontFamily,
  titleFontBold = true,
  descriptionColor,
  descriptionFontFamily,
  descriptionFontBold = false,
  stubText,
  hintText,
  downloadName,
}) => {
  const { t } = useTranslation();
  const captureRef = useRef(null);
  const [qrSrc, setQrSrc] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = String(accessUrl || '').trim();
    if (!url) {
      setQrSrc('');
      return undefined;
    }
    QRCode.toDataURL(url, {
      width: 112,
      margin: 1,
      color: { dark: '#1a1528', light: '#fffdf8' },
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [accessUrl]);

  const handleDownloadPng = useCallback(async () => {
    const el = captureRef.current;
    if (!el) {
      message.error(t('gallery_access_ticket_download_fail'));
      return;
    }
    setDownloading(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
      });
      const base = safeDownloadBaseName(downloadName || galleryTitle || 'gallery-access-ticket');
      const link = document.createElement('a');
      link.download = `${base}.png`;
      link.href = canvas.toDataURL('image/png');
      link.rel = 'noopener';
      link.click();
      message.success(t('gallery_access_ticket_download_ok'));
    } catch {
      message.error(t('gallery_access_ticket_download_fail'));
    } finally {
      setDownloading(false);
    }
  }, [downloadName, galleryTitle, t]);

  const hasPoster = Boolean(posterStyle && posterStyle.backgroundImage);
  const titleText = String(galleryTitle || '').trim();
  const descText = String(galleryDescription || '').trim();
  const hasCaption = Boolean(titleText || descText);

  return (
    <div className="gallery-access-ticket">
      <div ref={captureRef} className="gallery-access-ticket__inner">
        <header className="gallery-access-ticket__brand">
          <Logo compact />
        </header>
        <div
          className={`gallery-access-ticket__poster${hasPoster ? '' : ' gallery-access-ticket__poster--fallback'}`}
          style={hasPoster ? posterStyle : undefined}
          role="img"
          aria-label={titleText || descText || 'Gallery'}
        >
          <div className="gallery-access-ticket__poster-overlay" />
          {hasCaption ? (
            <div className="gallery-access-ticket__poster-caption">
              {titleText ? (
                <div
                  className="gallery-access-ticket__poster-title"
                  style={{
                    color: titleColor || undefined,
                    fontFamily: titleFontFamily ? `${titleFontFamily}, Georgia, serif` : undefined,
                    fontWeight: titleFontBold ? 700 : 400,
                  }}
                >
                  {titleText}
                </div>
              ) : null}
              {descText ? (
                <div
                  className="gallery-access-ticket__poster-desc"
                  style={{
                    color: descriptionColor || 'rgba(236, 232, 224, 0.94)',
                    fontFamily: descriptionFontFamily ? `${descriptionFontFamily}, Georgia, serif` : 'Lora, Georgia, serif',
                    fontWeight: descriptionFontBold ? 700 : 400,
                  }}
                >
                  {descText}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="gallery-access-ticket__tear" aria-hidden>
          <span className="gallery-access-ticket__tear-dot gallery-access-ticket__tear-dot--left" />
          <span className="gallery-access-ticket__tear-line" />
          <span className="gallery-access-ticket__tear-dot gallery-access-ticket__tear-dot--right" />
        </div>
        <div className="gallery-access-ticket__qr-wrap">
          {qrSrc ? (
            <img src={qrSrc} alt="" className="gallery-access-ticket__qr-img" width={112} height={112} />
          ) : (
            <div className="gallery-access-ticket__qr-skeleton" />
          )}
          {stubText ? <p className="gallery-access-ticket__stub">{stubText}</p> : null}
          <p className="gallery-access-ticket__url" title={accessUrl}>
            {accessUrl.length > 52 ? `${accessUrl.slice(0, 48)}…` : accessUrl}
          </p>
          {hintText ? <p className="gallery-access-ticket__hint">{hintText}</p> : null}
        </div>
      </div>
      <div className="gallery-access-ticket__download">
        <Button
          type="default"
          icon={<DownloadOutlined />}
          loading={downloading}
          onClick={handleDownloadPng}
          className="gallery-access-ticket__download-btn"
        >
          {t('gallery_access_ticket_download')}
        </Button>
      </div>
    </div>
  );
};

export default GalleryAccessTicket;
