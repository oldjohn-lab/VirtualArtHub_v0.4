import React, { useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Typography, Button, Space, Divider, List, Input, Rate, message, Tag, Spin, Modal } from 'antd';
import { ArrowLeftOutlined, CompressOutlined, DownloadOutlined, ExpandOutlined, MessageOutlined, ZoomInOutlined, ZoomOutOutlined, UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';
import { getStoredPublicVisitPath } from '../publicVisitSession';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

function getOrCreateGuestId() {
  try {
    const key = 'vah_guest_id';
    const existing = localStorage.getItem(key);
    if (existing && String(existing).trim()) return String(existing).trim();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return '';
  }
}

const ArtPieceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [art, setArt] = useState(null);
  const [comments, setComments] = useState([]);
  const [rating, setRating] = useState({ averageRating: 0, ratingCount: 0 });
  const [userRating, setUserRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ pointerId: null, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const { t } = useTranslation();

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;
  const ZOOM_STEP = 0.2;

  const getPanBounds = useMemo(() => {
    return (zoom) => {
      const viewportEl = viewportRef.current;
      const imgEl = imgRef.current;
      if (!viewportEl || !imgEl) return { maxX: 0, maxY: 0 };
      const vw = viewportEl.clientWidth || 0;
      const vh = viewportEl.clientHeight || 0;
      const nw = imgEl.naturalWidth || 0;
      const nh = imgEl.naturalHeight || 0;
      if (!vw || !vh || !nw || !nh) return { maxX: 0, maxY: 0 };
      const fitScale = Math.min(vw / nw, vh / nh);
      const dispW = nw * fitScale * zoom;
      const dispH = nh * fitScale * zoom;
      return {
        maxX: Math.max(0, (dispW - vw) / 2),
        maxY: Math.max(0, (dispH - vh) / 2),
      };
    };
  }, []);

  const getFitScale = () => {
    const viewportEl = viewportRef.current;
    const imgEl = imgRef.current;
    if (!viewportEl || !imgEl) return null;
    const vw = viewportEl.clientWidth || 0;
    const vh = viewportEl.clientHeight || 0;
    const nw = imgEl.naturalWidth || 0;
    const nh = imgEl.naturalHeight || 0;
    if (!vw || !vh || !nw || !nh) return null;
    return Math.min(vw / nw, vh / nh);
  };

  const clampPan = (nextPan, zoom) => {
    const { maxX, maxY } = getPanBounds(zoom);
    const x = Math.max(-maxX, Math.min(maxX, nextPan.x));
    const y = Math.max(-maxY, Math.min(maxY, nextPan.y));
    return { x, y };
  };

  const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

  const setZoom = (nextZoom, { resetPan = false } = {}) => {
    const z = clampZoom(nextZoom);
    setZoomLevel(z);
    if (resetPan) {
      setPan({ x: 0, y: 0 });
    } else {
      setPan((prev) => clampPan(prev, z));
    }
  };

  const fetchData = async () => {
    try {
      let currentArt = null;
      const token = localStorage.getItem('token');
      // Try to load from my-art (if user is owner)
      try {
        const artRes = await axios.get(apiUrl('/artpieces/my-art'), token ? { headers: { 'x-auth-token': token } } : undefined);
        currentArt = artRes.data.find(a => a.id === parseInt(id));
      } catch (e) {
        // ignore; proceed to public
      }
      // Fallback to public endpoint (approved artworks)
      if (!currentArt) {
        const pubRes = await axios.get(apiUrl(`/artpieces/public/${id}`));
        currentArt = pubRes.data;
      }
      setArt(currentArt);
      const [commentsRes, ratingRes] = await Promise.all([
        axios.get(apiUrl(`/interactions/comments/${id}`)),
        axios.get(apiUrl(`/interactions/rating/${id}`))
      ]);
      setComments(commentsRes.data);
      setRating(ratingRes.data);

      // Fetch user's personal rating if logged in
      if (token) {
        try {
          const userRatingRes = await axios.get(apiUrl(`/interactions/rating/${id}/me`), { headers: { 'x-auth-token': token } });
          setUserRating(userRatingRes.data.score);
        } catch (e) {
          console.error('Error fetching user rating:', e);
        }
      } else {
        try {
          const guestId = getOrCreateGuestId();
          if (guestId) {
            const guestRatingRes = await axios.get(apiUrl(`/interactions/rating/${id}/guest/me`), { headers: { 'x-guest-id': guestId } });
            setUserRating(guestRatingRes.data.score);
          }
        } catch (e) {
          // ignore
        }
      }
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      message.error(t('art_piece_not_found_or_not_visible'));
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload when route id changes

  const handleDownload = () => {
    window.open(apiUrl(`/artpieces/download/${id}`), '_blank');
  };

  const handleAddComment = async () => {
    if (!user) {
      // 公开访问进入作品详情：发表评论要求登录；登录后回到当前作品页
      const redirectTo = `${location.pathname}${location.search || ''}`;
      localStorage.setItem('postLoginRedirect', redirectTo);
      Modal.confirm({
        title: t('login_required') || t('login'),
        content: t('login_to_comment'),
        okText: t('login') || '登录',
        cancelText: t('cancel') || '取消',
        onOk: () => navigate('/login', { state: { from: redirectTo } }),
      });
      return;
    }
    if (!newComment.trim()) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(apiUrl(`/interactions/comment/${id}`), { content: newComment }, { headers: { 'x-auth-token': token } });
      message.success(t('comment_success'));
      setNewComment('');
      fetchData();
    } catch (err) {
      message.error(t('comment_failed'));
    }
  };

  const handleRate = async (value) => {
    try {
      if (user) {
        const token = localStorage.getItem('token');
        await axios.post(apiUrl(`/interactions/rate/${id}`), { score: value }, { headers: { 'x-auth-token': token } });
      } else {
        const guestId = getOrCreateGuestId();
        if (!guestId) {
          message.warning(t('login_to_rate'));
          return;
        }
        await axios.post(apiUrl(`/interactions/rate/${id}/guest`), { score: value }, { headers: { 'x-guest-id': guestId } });
      }
      message.success(t('rating_success'));
      fetchData();
    } catch (err) {
      const serverMsg = err?.response?.data?.msg;
      message.error(typeof serverMsg === 'string' && serverMsg.trim() ? serverMsg : t('rating_failed'));
    }
  };

  const handleImageClick = () => {
    setIsModalVisible(true);
    setZoom(1, { resetPan: true });
    setIsDragging(false);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault(); // Prevent page scrolling
    setZoomLevel((prev) => {
      const next = e.deltaY < 0 ? prev + ZOOM_STEP : prev - ZOOM_STEP;
      return clampZoom(next);
    });
  };

  const handleZoomIn = () => setZoom(zoomLevel + ZOOM_STEP);
  const handleZoomOut = () => setZoom(zoomLevel - ZOOM_STEP);
  const handleFitToWindow = () => setZoom(1, { resetPan: true });
  const handleOriginalScale = () => {
    const fitScale = getFitScale();
    if (!fitScale) return;
    setZoom(1 / fitScale, { resetPan: true });
  };

  useEffect(() => {
    if (!isModalVisible) return;
    if (zoomLevel <= 1) {
      if (pan.x !== 0 || pan.y !== 0) setPan({ x: 0, y: 0 });
      return;
    }
    setPan((prev) => clampPan(prev, zoomLevel));
  }, [isModalVisible, zoomLevel]); // eslint-disable-line react-hooks/exhaustive-deps -- zoom/modal driven pan clamp only

  const handlePointerDown = (e) => {
    if (zoomLevel <= 1) return;
    const viewportEl = viewportRef.current;
    if (!viewportEl) return;

    viewportEl.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    if (dragRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = clampPan({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy }, zoomLevel);
    setPan(next);
  };

  const handlePointerUp = (e) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    setIsDragging(false);
    dragRef.current.pointerId = null;
  };

  const handlePointerCancel = (e) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    setIsDragging(false);
    dragRef.current.pointerId = null;
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}><Spin size="large" /></div>;
  if (!art) return <div style={{ textAlign: 'center', padding: '100px' }}><Text>{t('art_piece_not_found_or_not_visible')}</Text></div>;

  const searchParams = new URLSearchParams(location.search);
  const src = searchParams.get('src');
  const srcGalleryId = searchParams.get('galleryId');
  const storedVisitPath = getStoredPublicVisitPath();
  const backTarget =
    src === 'market'
      ? '/market'
      : src === 'visit'
        ? storedVisitPath || (srcGalleryId ? `/gallery/${srcGalleryId}` : null)
        : src === 'my' && srcGalleryId
          ? `/my-gallery/${srcGalleryId}`
          : src === 'public' && srcGalleryId
            ? `/gallery/${srcGalleryId}`
            : art.galleryId
              ? `/gallery/${art.galleryId}`
              : null;
  const backLabel =
    src === 'market' ? t('back_to_art_market') : src === 'my' ? t('back_to_my_gallery') : t('back_to_gallery');

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(backTarget || -1)}
          size="large"
          className="elegant-btn"
        >
          {backLabel}
        </Button>
      </div>
      <Row gutter={[32, 32]}>
        <Col xs={24} md={12}>
          <Card
            cover={
              <div style={{ backgroundColor: '#f5f5f5', textAlign: 'center', padding: '20px', cursor: 'zoom-in' }} onClick={handleImageClick}>
                <img
                  alt={art.title}
                  src={apiUrl(`/artpieces/preview/${art.id}`)}
                  style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                />
              </div>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <Space>
                <Rate disabled allowHalf value={parseFloat(rating.averageRating || 0)} />
                <Text type="secondary">{t('people_rated', { count: rating.ratingCount || 0 })}</Text>
              </Space>
              {art.allowDownload ? (
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownload}
                >
                  {t('download_original_image')}
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  disabled
                  title={t('author_has_disabled_download')}
                >
                  {t('download_disabled')}
                </Button>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Title level={2}>{art.title}</Title>
          <Space style={{ marginBottom: '16px' }}>
            <Tag color="gold" icon={<UserOutlined />}>{art.user?.username}</Tag>
            <Tag color="blue">{t('art_piece')}</Tag>
            {!art.allowDownload && <Tag color="red">{t('copyright_protected_tag')}</Tag>}
          </Space>

          <Divider orientation="left">{t('description')}</Divider>
          <Paragraph style={{ fontSize: '16px', lineHeight: '1.8', color: '#444' }}>
            {art.description || t('no_description_available')}
          </Paragraph>

          <Divider orientation="left">{t('rate_it')}</Divider>
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <Rate value={userRating} onChange={handleRate} />
            <div style={{ marginTop: '8px' }}>
              {user ? (
                <Text type="secondary">{t('rate_this_artwork')}</Text>
              ) : (
                <Text type="secondary">{t('rate_this_artwork')}</Text>
              )}
            </div>
          </div>

          <Divider orientation="left">{t('interaction_section')}</Divider>
          <div style={{ marginBottom: '24px' }}>
            <TextArea
              rows={3}
              placeholder={t('leave_your_thoughts')}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={!user}
            />
            <Button
              type="primary"
              style={{ marginTop: '12px' }}
              icon={<MessageOutlined />}
              onClick={handleAddComment}
              disabled={!user}
            >
              {t('post_comment_button')}
            </Button>
            {!user && <Text type="danger" style={{ marginLeft: '12px' }}>{t('login_to_participate_discussion')}</Text>}
          </div>

          <List
            header={t('comments_header', { count: comments.length })}
            itemLayout="horizontal"
            dataSource={comments}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  avatar={<UserOutlined style={{ fontSize: '24px', color: '#1890ff' }} />}
                  title={item.user?.username}
                  description={
                    <div>
                      <div>{item.content}</div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </Col>
      </Row>

      <Modal
        open={isModalVisible}
        title={t('artwork_preview_modal_title')}
        onCancel={handleModalClose}
        footer={
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Space size={10}>
              <Button icon={<ZoomInOutlined />} onClick={handleZoomIn}>
                {t('zoom_in')}
              </Button>
              <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut}>
                {t('zoom_out')}
              </Button>
              <Button icon={<ExpandOutlined />} onClick={handleOriginalScale}>
                {t('original_scale')}
              </Button>
              <Button icon={<CompressOutlined />} onClick={handleFitToWindow}>
                {t('fit_to_window')}
              </Button>
            </Space>
          </div>
        }
        width={1200}
        style={{ maxWidth: '96vw' }}
        centered
        bodyStyle={{ height: '86vh', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', padding: 0 }}
      >
        <div
          onWheel={handleWheel}
          style={{
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            touchAction: 'none',
            userSelect: 'none',
          }}
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <img
            alt={art.title}
            src={apiUrl(`/artpieces/preview/${art.id}`)}
            ref={imgRef}
            onLoad={() => {
              if (zoomLevel <= 1) return;
              setPan((prev) => clampPan(prev, zoomLevel));
            }}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ArtPieceDetail;
