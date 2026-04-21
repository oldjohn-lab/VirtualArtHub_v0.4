import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Col, Empty, Input, Rate, Row, Space, Spin, Typography, Pagination } from 'antd';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Brush, Camera, Clapperboard, Music2, PenLine, Shapes } from 'lucide-react';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { apiUrl } from '../apiBase';

const { Title, Text } = Typography;
const { Search } = Input;

const categoryDefs = [
  {
    key: 'photography',
    titleKey: 'category_photography',
    Icon: Camera,
    patterns: [/摄影/i, /photo/i, /photograph/i, /camera/i, /拍摄/i],
  },
  {
    key: 'painting',
    titleKey: 'category_painting',
    Icon: Brush,
    patterns: [/绘画/i, /画展/i, /painting/i, /oil/i, /watercolor/i, /素描/i],
  },
  {
    key: 'calligraphy',
    titleKey: 'category_calligraphy',
    Icon: PenLine,
    patterns: [/书法/i, /法书/i, /calligraphy/i],
  },
  {
    key: 'music',
    titleKey: 'category_music',
    Icon: Music2,
    patterns: [/音乐/i, /music/i, /sound/i, /作曲/i, /演奏/i],
  },
  {
    key: 'film',
    titleKey: 'category_film',
    Icon: Clapperboard,
    patterns: [/影视/i, /电影/i, /film/i, /movie/i, /video/i, /纪录片/i],
  },
  {
    key: 'literature',
    titleKey: 'category_literature',
    Icon: BookOpen,
    patterns: [/文学/i, /书/i, /book/i, /novel/i, /poem/i, /诗/i, /散文/i],
  },
  {
    key: 'other',
    titleKey: 'category_other',
    Icon: Shapes,
    patterns: [],
  },
];

function normalizeText(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[，。！？、；：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategoryKey(gallery) {
  const text = `${gallery?.name || ''} ${gallery?.description || ''}`.toLowerCase();
  for (const def of categoryDefs) {
    if (def.key === 'other') continue;
    if (def.patterns.some((p) => p.test(text))) return def.key;
  }
  return 'other';
}

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

export default function GalleriesHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [galleries, setGalleries] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const sectionScrollElsRef = useRef({});

  useEffect(() => {
    const fetchGalleries = async () => {
      try {
        const res = await axios.get(apiUrl('/galleries'), {
          params: { page, pageSize, q: query || undefined },
        });
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
        setGalleries(list);
        setTotal(Number(res.data?.total) || list.length);
      } catch (e) {
        setGalleries([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };
    fetchGalleries();
  }, [page, pageSize, query]);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return galleries;
    const tokens = q.split(' ').filter(Boolean);
    return galleries.filter((g) => {
      const curator = g?.user?.username || g?.username || '';
      const hay = normalizeText(`${g?.name || ''} ${g?.description || ''} ${curator}`);
      return tokens.every((token) => hay.includes(token));
    });
  }, [galleries, query]);

  const grouped = useMemo(() => {
    const map = new Map(categoryDefs.map((d) => [d.key, []]));
    filtered.forEach((g) => {
      const key = inferCategoryKey(g);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(g);
    });
    return map;
  }, [filtered]);

  const scrollSection = (key, delta) => {
    const el = sectionScrollElsRef.current[key];
    if (!el) return;
    el.scrollBy({ top: delta, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div style={{ padding: '70px 0', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="galleries-hub">
      <header className="galleries-hub-header">
        <div className="galleries-hub-header-inner">
          <div className="galleries-hub-titleblock">
            <Title level={2} className="galleries-hub-title">{t('galleries_hub_title')}</Title>
            <Text type="secondary" className="galleries-hub-subtitle">{t('galleries_hub_subtitle')}</Text>
          </div>
          <div className="galleries-hub-search">
            <Search
              size="large"
              placeholder={t('galleries_search_placeholder')}
              allowClear
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </header>

      {filtered.length === 0 ? (
        <Empty description={t('no_galleries_match')} style={{ padding: '80px 0' }} />
      ) : (
        <>
          <Space direction="vertical" size={28} style={{ width: '100%' }}>
            {categoryDefs.map(({ key, titleKey, Icon }) => {
              const items = grouped.get(key) || [];
              if (items.length === 0) return null;

              return (
                <section key={key} className="galleries-section">
                  <div className="galleries-section-head">
                    <div className="galleries-section-icon" aria-hidden="true">
                      <Icon size={20} color="rgba(43, 42, 40, 0.92)" />
                    </div>
                    <div className="galleries-section-meta">
                      <Title level={4} className="galleries-section-title">{t(titleKey)}</Title>
                      <Text type="secondary" className="galleries-section-count">{t('galleries_section_count', { count: items.length })}</Text>
                    </div>
                  </div>

                  <div className="galleries-section-scrollwrap">
                    <div
                      className="galleries-section-scroll"
                      ref={(el) => {
                        if (el) sectionScrollElsRef.current[key] = el;
                      }}
                    >
                      <Row gutter={[18, 18]}>
                        {items.map((g) => {
                          const coverArtId = g.coverArtId || (Array.isArray(g.artPieces) && g.artPieces[0]?.id ? g.artPieces[0].id : null);
                          const customCover = g.coverMode === 'custom' && g.coverImage ? apiUrl(`/galleries/${g.id}/cover-image`) : null;
                          const averageRating = clampRating(g.averageRating);
                          const artPiecesCount = Number(g.artPiecesCount) || (Array.isArray(g.artPieces) ? g.artPieces.length : 0);

                          return (
                            <Col xs={24} sm={12} md={8} key={g.id}>
                              <div
                                className="featured-gallery-frame"
                                onClick={() => navigate(`/gallery/${g.id}`)}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="featured-gallery-meta">
                                  <div className="featured-gallery-kicker">
                                    {t('curated_by')} {g.user?.username || 'ANONYMOUS'}
                                  </div>
                                  {g.showTitle !== false ? (
                                    <div
                                      className="featured-gallery-title"
                                      style={{
                                        color: g.titleColor || undefined,
                                        fontFamily: g.titleFontFamily || undefined,
                                        fontWeight: g.titleFontBold !== false ? 700 : 400,
                                      }}
                                    >
                                      {g.name}
                                    </div>
                                  ) : null}
                                  {g.showDescription !== false ? (
                                    <div
                                      className="featured-gallery-desc"
                                      style={{
                                        color: g.descriptionColor || undefined,
                                        fontFamily: g.descriptionFontFamily || undefined,
                                        fontWeight: g.descriptionFontBold === true ? 700 : 400,
                                      }}
                                    >
                                      {g.description || ' '}
                                    </div>
                                  ) : null}
                                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Rate allowHalf disabled value={averageRating} />
                                    <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                      {averageRating ? averageRating.toFixed(1) : '—'}
                                    </Text>
                                    <Text type="secondary">
                                      · {t('art_pieces_count', { count: artPiecesCount })}
                                    </Text>
                                  </div>
                                </div>

                                <div className="featured-gallery-carousel">
                                  {customCover || coverArtId ? (
                                    <div className="featured-gallery-slide">
                                      <img
                                        className="featured-gallery-img"
                                        src={customCover || (apiUrl(`/artpieces/preview/${coverArtId}`) + '?wm=0')}
                                        alt={g.name}
                                        style={
                                          customCover
                                            ? {
                                                opacity: Number(g.coverOpacity ?? 0.92),
                                                filter: `blur(${Number(g.coverBlur ?? 6)}px)`,
                                              }
                                            : undefined
                                        }
                                        draggable={false}
                                        onContextMenu={(e) => e.preventDefault()}
                                        onDragStart={(e) => e.preventDefault()}
                                      />
                                    </div>
                                  ) : (
                                    <div className="featured-gallery-empty">{t('gallery_in_preparation')}</div>
                                  )}
                                </div>
                              </div>
                            </Col>
                          );
                        })}
                      </Row>
                    </div>

                    <div className="galleries-section-scrollbar" aria-hidden="true">
                      <Button
                        size="small"
                        type="text"
                        className="galleries-section-scrollbtn"
                        icon={<UpOutlined />}
                        onClick={() => scrollSection(key, -420)}
                      />
                      <div className="galleries-section-scrollrail" />
                      <Button
                        size="small"
                        type="text"
                        className="galleries-section-scrollbtn"
                        icon={<DownOutlined />}
                        onClick={() => scrollSection(key, 420)}
                      />
                    </div>
                  </div>
                </section>
              );
            })}
          </Space>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={[6, 12, 24, 48]}
              onChange={(p, ps) => {
                setLoading(true);
                setPage(p);
                setPageSize(ps);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
