import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Col, Empty, Rate, Row, Space, Spin, Tag, Typography, message, Pagination } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';

const { Title, Paragraph, Text } = Typography;
const { Meta } = Card;

function isRequestCanceled(err) {
  return (
    axios.isCancel?.(err) === true ||
    err?.code === 'ERR_CANCELED' ||
    err?.name === 'CanceledError' ||
    String(err?.message || '').includes('canceled')
  );
}

const PublicGalleryView = () => {
  const { id, code } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [artPieces, setArtPieces] = useState([]);
  const [artTotal, setArtTotal] = useState(0);
  const [artPage, setArtPage] = useState(1);
  const [artPageSize, setArtPageSize] = useState(12);
  /** 直达访问加载失败原因（用于区分「展厅不存在」与「网络/API」） */
  const [directIssue, setDirectIssue] = useState(null);

  const isDirectAccess = Boolean(code && !id);
  const effectiveGalleryId = id || gallery?.id;

  const goArtDetail = (artId) => {
    const q = isDirectAccess
      ? `src=visit&galleryId=${effectiveGalleryId || ''}`
      : `src=public&galleryId=${effectiveGalleryId || ''}`;
    navigate(`/artpiece/${artId}?${q}`);
  };

  /** 探索展厅进入 /gallery/:id：先拉展厅再拉作品 */
  useEffect(() => {
    if (isDirectAccess) return undefined;
    const fetchGallery = async () => {
      try {
        const res = await axios.get(apiUrl(`/galleries/${id}`), { params: { includeArtPieces: 0 } });
        setGallery(res.data);
        setArtPage(1);
      } catch (err) {
        console.error(err);
        const serverMsg = err?.response?.data?.msg;
        message.error(
          typeof serverMsg === 'string' && serverMsg.trim() ? serverMsg : t('cannot_get_gallery_details')
        );
      } finally {
        setLoading(false);
      }
    };
    fetchGallery();
    return undefined;
  }, [id, isDirectAccess, t]);

  /** 公开直达 /visit/:code：合并接口 + 取消过时请求（避免 Strict Mode 竞态） */
  useEffect(() => {
    if (!isDirectAccess) return undefined;
    const trimmed = String(code || '').trim();
    if (!trimmed) {
      message.error(t('cannot_get_gallery_details'));
      setLoading(false);
      setGallery(null);
      setArtPieces([]);
      setArtTotal(0);
      setDirectIssue('notfound');
      return undefined;
    }

    const ac = new AbortController();
    const { signal } = ac;

    const applyArtList = (data) => {
      const list = Array.isArray(data?.items) ? data.items : [];
      setArtPieces(list);
      setArtTotal(Number(data?.total) || list.length);
    };

    /** 与 AuthContext 中 axios.defaults.baseURL（…/api）拼接，避免 apiUrl 绝对地址与代理不一致 */
    const loadFallback = async () => {
      const gRes = await axios.get(`/galleries/direct/${encodeURIComponent(trimmed)}`, {
        params: { includeArtPieces: 0 },
        signal,
      });
      const g = gRes.data;
      if (!g?.id) return false;
      setGallery(g);
      const aRes = await axios.get(`/galleries/${g.id}/artpieces`, {
        params: { page: artPage, pageSize: artPageSize },
        signal,
      });
      applyArtList(aRes.data);
      setDirectIssue(null);
      return true;
    };

    const load = async () => {
      setLoading(true);
      setDirectIssue(null);
      try {
        let combined;
        try {
          combined = await axios.get('/public/gallery-by-code', {
            params: { code: trimmed, page: artPage, pageSize: artPageSize },
            signal,
          });
        } catch (firstErr) {
          if (isRequestCanceled(firstErr)) return;
          combined = await axios.get(`/galleries/direct/${encodeURIComponent(trimmed)}/artpieces`, {
            params: { page: artPage, pageSize: artPageSize },
            signal,
          });
        }
        const g = combined.data?.gallery;
        if (g?.id) {
          setGallery(g);
          applyArtList(combined.data);
          setDirectIssue(null);
          return;
        }
        const ok = await loadFallback();
        if (!ok) {
          setGallery(null);
          setArtPieces([]);
          setArtTotal(0);
          setDirectIssue('notfound');
          message.error(t('cannot_get_gallery_details'));
        }
      } catch (err) {
        if (isRequestCanceled(err)) return;
        console.error(err);
        const status = err?.response?.status;
        const serverMsg = err?.response?.data?.msg;
        try {
          const ok = await loadFallback();
          if (ok) return;
        } catch (e2) {
          if (isRequestCanceled(e2)) return;
          console.error(e2);
        }
        setGallery(null);
        setArtPieces([]);
        setArtTotal(0);
        if (status === 404) {
          setDirectIssue('notfound');
        } else if (status === 403) {
          setDirectIssue('forbidden');
        } else {
          setDirectIssue('network');
        }
        message.error(
          typeof serverMsg === 'string' && serverMsg.trim() ? serverMsg : t('cannot_get_gallery_details')
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    load();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 避免 i18n 函数引用变化导致重复拉取
  }, [code, artPage, artPageSize, isDirectAccess]);

  useEffect(() => {
    if (isDirectAccess) return undefined;
    if (!effectiveGalleryId) return undefined;
    let cancelled = false;
    const fetchArtPieces = async () => {
      setLoading(true);
      try {
        const res = await axios.get(apiUrl(`/galleries/${effectiveGalleryId}/artpieces`), {
          params: { page: artPage, pageSize: artPageSize },
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
        setArtPieces(list);
        setArtTotal(Number(res.data?.total) || list.length);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setArtPieces([]);
          setArtTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchArtPieces();
    return () => {
      cancelled = true;
    };
  }, [effectiveGalleryId, artPage, artPageSize, isDirectAccess]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!gallery) {
    const emptyDesc =
      isDirectAccess && directIssue === 'network'
        ? t('public_visit_error_network')
        : isDirectAccess && directIssue === 'forbidden'
          ? t('public_visit_error_forbidden')
          : t('gallery_not_exist');
    return <Empty description={emptyDesc} style={{ padding: '80px 0' }} />;
  }

  const renderArtGrid = () =>
    artPieces.length > 0 ? (
      <>
        <Row gutter={[24, 24]} style={{ marginTop: isDirectAccess ? 8 : 18 }}>
          {artPieces.map((art) => {
            const avgRaw = Number(art.averageRating);
            const averageRating = Number.isFinite(avgRaw) ? Math.max(0, Math.min(5, avgRaw)) : 0;
            const cntRaw = Number(art.ratingCount);
            const ratingCount = Number.isFinite(cntRaw) ? cntRaw : 0;

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={art.id}>
                <Card
                  hoverable
                  cover={
                    <div
                      style={{
                        height: 220,
                        background: '#fff',
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => goArtDetail(art.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <img
                        alt={art.title}
                        src={apiUrl(`/artpieces/preview/${art.id}`) + '?wm=0'}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                      />
                    </div>
                  }
                  onClick={() => goArtDetail(art.id)}
                >
                  <Meta
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {art.artType === 'literature' && Number.isFinite(Number(art.episodeNumber)) ? `第 ${Number(art.episodeNumber)} 章：` : ''}
                            {art.title}
                          </div>
                        </div>
                        {art.artType === 'literature' ? <Tag color="purple">{t('literature_serial')}</Tag> : null}
                      </div>
                    }
                    description={art.description || ' '}
                  />
                  <div style={{ marginTop: 10 }}>
                    <Space size={8}>
                      <Rate allowHalf disabled value={averageRating} />
                      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {averageRating ? averageRating.toFixed(1) : '—'}
                      </Text>
                      <Text type="secondary">{t('people_rated', { count: ratingCount })}</Text>
                    </Space>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
          <Pagination
            current={artPage}
            pageSize={artPageSize}
            total={artTotal}
            showSizeChanger
            pageSizeOptions={[8, 12, 24, 48]}
            onChange={(p, ps) => {
              setArtPage(p);
              setArtPageSize(ps);
            }}
          />
        </div>
      </>
    ) : (
      <Empty description={t('public_visit_no_artworks')} style={{ padding: '60px 0' }} />
    );

  if (isDirectAccess) {
    return (
      <div className="public-direct-visit" style={{ padding: '16px 0 30px' }}>
        <Title level={3} style={{ marginBottom: 4, fontWeight: 600 }}>
          {t('public_visit_artworks_title')}
        </Title>
        {renderArtGrid()}
      </div>
    );
  }

  return (
    <div style={{ padding: '30px 0' }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/galleries')} style={{ marginBottom: 18 }}>
        {t('explore_galleries')}
      </Button>

      <Title level={2} style={{ marginBottom: 6 }}>
        {gallery.name}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
        {t('curated_by')} {gallery.user?.username || 'ANONYMOUS'}
      </Text>
      <Paragraph type="secondary" style={{ maxWidth: 900, fontSize: 16 }}>
        {gallery.description}
      </Paragraph>

      {renderArtGrid()}
    </div>
  );
};

export default PublicGalleryView;
