import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Typography, Button, Rate, Spin, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Keyboard, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import '../styles/swiper-custom.css';

/** 公开接口用 fetch，不附带 axios 全局的 x-auth-token，避免过期 token 导致列表 401 */
async function fetchPublicJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const { Title, Paragraph } = Typography;

const Home = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [galleries, setGalleries] = useState([]);
  const [loadingGalleries, setLoadingGalleries] = useState(true);
  const swiperRef = useRef(null);
  const rotateTimerRef = useRef(null);
  const rotateArtTimerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [settledSlideIndex, setSettledSlideIndex] = useState(0);
  const [carouselVisible, setCarouselVisible] = useState(false);
  const [galleryArtMap, setGalleryArtMap] = useState({});
  const [rotatingArtIndex, setRotatingArtIndex] = useState(0);
  const preloadedArtIdsRef = useRef(new Set());
  const fetchedGalleryIdsRef = useRef(new Set());
  const repeatCount = 9;
  const baseCount = galleries.length;
  const totalCount = baseCount > 1 ? baseCount * repeatCount : baseCount;
  const initialSlideIndex = baseCount > 1 ? baseCount * 2 : 0;

  const repeated = useMemo(() => {
    if (baseCount <= 1) {
      return galleries.map((gallery, index) => ({ gallery, slideIndex: index }));
    }
    const slides = [];
    for (let r = 0; r < repeatCount; r += 1) {
      for (let i = 0; i < baseCount; i += 1) {
        const slideIndex = r * baseCount + i;
        slides.push({ gallery: galleries[i], slideIndex });
      }
    }
    return slides;
  }, [baseCount, galleries]);

  useEffect(() => {
    const fetchGalleries = async () => {
      try {
        const data = await fetchPublicJson(apiUrl('/galleries'));
        const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setGalleries(list);
        const count = list.length;
        const start = count > 1 ? count * 2 : 0;
        setSettledSlideIndex(start);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingGalleries(false);
      }
    };
    fetchGalleries();
  }, []);

  useEffect(() => {
    if (!Array.isArray(galleries) || galleries.length === 0) return;
    galleries.forEach((g) => {
      const gid = Number(g.id);
      if (!Number.isFinite(gid)) return;
      if (!(Number(g.artPiecesCount) > 1)) return;
      if (fetchedGalleryIdsRef.current.has(gid)) return;
      const url = `${apiUrl(`/galleries/${gid}/artpieces`)}?page=1&pageSize=100`;
      fetchPublicJson(url)
        .then((data) => {
          const arts = Array.isArray(data?.items) ? data.items : [];
          if (arts.length === 0) return;
          fetchedGalleryIdsRef.current.add(gid);
          setGalleryArtMap((prev) => ({ ...prev, [gid]: arts }));
        })
        .catch(() => {});
    });
  }, [galleries]);

  useEffect(() => {
    if (galleries.length <= 1) return undefined;

    const clear = () => {
      if (rotateTimerRef.current) {
        clearTimeout(rotateTimerRef.current);
        rotateTimerRef.current = null;
      }
    };

    const tick = () => {
      const swiper = swiperRef.current;
      if (swiper && !swiper.destroyed) {
        if (!swiper.animating && !swiper.isTouched && !isDraggingRef.current) {
          swiper.slideNext();
        }
      }
      rotateTimerRef.current = setTimeout(tick, 5000);
    };

    clear();
    rotateTimerRef.current = setTimeout(tick, 5000);

    return clear;
  }, [galleries.length]);

  useEffect(() => {
    if (baseCount <= 1) return;
    const active = galleries[settledSlideIndex % baseCount];
    if (!active) return;

    const galleryId = Number(active.id);
    const needsFetch =
      Number.isFinite(galleryId) &&
      !fetchedGalleryIdsRef.current.has(galleryId) &&
      (!Array.isArray(active.artPieces) || active.artPieces.length < 2) &&
      Number(active.artPiecesCount) > 1;

    if (needsFetch) {
      axios
        .get(apiUrl(`/galleries/${galleryId}`))
        .then((res) => {
          let arts = Array.isArray(res.data?.artPieces) ? res.data.artPieces : [];
          if (arts.length === 0 && Number(active.artPiecesCount) > 0) {
            return axios
              .get(apiUrl(`/galleries/${galleryId}/artpieces`), { params: { page: 1, pageSize: 100 } })
              .then((r2) => (Array.isArray(r2.data?.items) ? r2.data.items : []));
          }
          return arts;
        })
        .then((arts) => {
          if (!Array.isArray(arts) || arts.length === 0) return;
          fetchedGalleryIdsRef.current.add(galleryId);
          setGalleryArtMap((prev) => ({ ...prev, [galleryId]: arts }));
        })
        .catch(() => {});
    }

    const candidates = [];
    if (active.coverArtId) candidates.push(active.coverArtId);
    const resolvedArts = Array.isArray(active.artPieces)
      ? active.artPieces
      : galleryArtMap[galleryId] || galleryArtMap[active.id];
    if (Array.isArray(resolvedArts)) {
      resolvedArts.forEach((a) => {
        if (a?.id) candidates.push(a.id);
      });
    }
    candidates.forEach((id) => {
      if (!id) return;
      if (preloadedArtIdsRef.current.has(id)) return;
      preloadedArtIdsRef.current.add(id);
      const img = new Image();
      img.decoding = 'async';
      img.src = apiUrl(`/artpieces/preview/${id}`) + '?wm=0';
    });
  }, [baseCount, galleries, settledSlideIndex, galleryArtMap]);

  useEffect(() => {
    if (rotateArtTimerRef.current) {
      clearInterval(rotateArtTimerRef.current);
      rotateArtTimerRef.current = null;
    }
    if (baseCount <= 0) return undefined;
    const active = galleries[settledSlideIndex % baseCount];
    if (!active) return undefined;
    const resolvedArts = Array.isArray(active.artPieces)
      ? active.artPieces
      : galleryArtMap[Number(active.id)] || galleryArtMap[active.id];
    if (!Array.isArray(resolvedArts) || resolvedArts.length <= 1) {
      setRotatingArtIndex(0);
      return undefined;
    }
    setRotatingArtIndex(0);
    rotateArtTimerRef.current = setInterval(() => {
      setRotatingArtIndex((prev) => (prev + 1) % resolvedArts.length);
    }, 2200);
    return () => {
      if (rotateArtTimerRef.current) {
        clearInterval(rotateArtTimerRef.current);
        rotateArtTimerRef.current = null;
      }
    };
  }, [baseCount, galleries, settledSlideIndex, galleryArtMap]);

  useEffect(() => {
    if (baseCount <= 1) return undefined;
    setCarouselVisible(false);
    const id = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setCarouselVisible(true));
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id);
  }, [baseCount, settledSlideIndex]);

  const handleGalleryClick = (galleryId) => {
    const target = `/gallery/${galleryId}`;
    if (!user) {
      message.info(t('login_to_explore_gallery'));
      localStorage.setItem('postLoginRedirect', target);
      navigate('/login', { state: { from: target } });
      return;
    }
    navigate(target);
  };

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-deco" aria-hidden />
        <div className="home-hero-inner">
          <Title level={2} className="home-hero-title">
            {t('welcome_to_art_hub')}
          </Title>
          <Paragraph className="home-hero-subtitle">
            {t('slogan_discover_art')}
          </Paragraph>
        </div>
      </section>

      <section className="home-featured-gallery">
        {loadingGalleries ? (
          <div className="home-featured-loading">
            <Spin size="large" />
          </div>
        ) : galleries.length > 0 ? (
          <div className="swiper-container-wrapper">
            <Swiper
              className="mySwiper"
              modules={[EffectCoverflow, Keyboard, Mousewheel]}
              effect="coverflow"
              centeredSlides
              slidesPerView="auto"
              speed={800}
              grabCursor
              initialSlide={initialSlideIndex}
              resistanceRatio={0.85}
              threshold={10}
              preventClicks
              preventClicksPropagation
              keyboard={{ enabled: true }}
              mousewheel={{ forceToAxis: true }}
              coverflowEffect={{
                rotate: 38,
                stretch: 0,
                depth: 220,
                modifier: 1.15,
                slideShadows: false,
              }}
              onTouchStart={() => {
                isDraggingRef.current = true;
              }}
              onTouchEnd={() => {
                isDraggingRef.current = false;
              }}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
              onSlideChangeTransitionEnd={(swiper) => {
                if (baseCount <= 1) return;

                const min = baseCount;
                const max = totalCount - baseCount - 1;
                const offset = baseCount * (repeatCount - 4);

                let idx = swiper.activeIndex;
                if (idx < min) idx += offset;
                if (idx > max) idx -= offset;

                if (idx !== swiper.activeIndex) {
                  swiper.slideTo(idx, 0, false);
                }

                setSettledSlideIndex(idx);
              }}
            >
              {repeated.map(({ gallery, slideIndex }) => {
                const isActive = slideIndex === settledSlideIndex;
                const averageRatingRaw = Number(gallery.averageRating);
                const averageRating = Number.isFinite(averageRatingRaw) ? Math.max(0, Math.min(5, averageRatingRaw)) : 0;
                const resolvedArts = Array.isArray(gallery.artPieces)
                  ? gallery.artPieces
                  : galleryArtMap[Number(gallery.id)] || galleryArtMap[gallery.id];
                const coverArtId = gallery.coverArtId || (Array.isArray(resolvedArts) && resolvedArts[0]?.id ? resolvedArts[0].id : null);
                const hasArt = Boolean(coverArtId);
                const showRotator = carouselVisible && isActive && Array.isArray(resolvedArts) && resolvedArts.length > 1;
                const rotatingArtId = showRotator ? resolvedArts[rotatingArtIndex % resolvedArts.length]?.id : null;
                const rotatingArtTitle = showRotator ? resolvedArts[rotatingArtIndex % resolvedArts.length]?.title : '';

                return (
                  <SwiperSlide key={`${gallery.id}-${slideIndex}`}>
                    <div
                      className="gallery-ring-card"
                      onClick={() => handleGalleryClick(gallery.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="gallery-ring-meta">
                        <div className="gallery-ring-kicker">
                          {t('curated_by')} {gallery.user?.username || 'ANONYMOUS'}
                        </div>
                        <div className="gallery-ring-title">{gallery.name}</div>
                        <div className="gallery-ring-desc">{gallery.description || ''}</div>
                      </div>

                      <div className="gallery-ring-rating">
                        <Rate allowHalf disabled value={averageRating} />
                        <div className="gallery-ring-rating-value">
                          {averageRating ? averageRating.toFixed(1) : '—'}
                        </div>
                      </div>

                      <div className="gallery-ring-media">
                        {hasArt ? (
                          <div className="gallery-ring-media-inner">
                            <div className="gallery-ring-static-layer">
                              <div className="gallery-ring-slide">
                                <img
                                  className="gallery-ring-img"
                                  src={apiUrl(`/artpieces/preview/${coverArtId}`) + '?wm=0'}
                                  alt={gallery.name}
                                  draggable={false}
                                  onContextMenu={(e) => e.preventDefault()}
                                  onDragStart={(e) => e.preventDefault()}
                                />
                              </div>
                            </div>

                            {showRotator && rotatingArtId ? (
                              <div className={`gallery-ring-carousel-layer ${carouselVisible ? 'is-visible' : ''}`}>
                                <div key={rotatingArtId} className="gallery-ring-slide">
                                  <img
                                    className="gallery-ring-img gallery-ring-rotating-img"
                                    src={apiUrl(`/artpieces/preview/${rotatingArtId}`) + '?wm=0'}
                                    alt={rotatingArtTitle || gallery.name}
                                    draggable={false}
                                    onContextMenu={(e) => e.preventDefault()}
                                    onDragStart={(e) => e.preventDefault()}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="gallery-ring-empty">{t('gallery_in_preparation')}</div>
                        )}
                      </div>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          </div>
        ) : (
          <div className="home-featured-loading">{t('no_galleries_yet_prompt')}</div>
        )}
      </section>

      <section className="home-intro">
        <Title level={2} style={{ fontSize: '36px', marginBottom: '40px' }}>{t('art_slogan_title')}</Title>
        <Paragraph style={{ maxWidth: '800px', margin: '0 auto 40px', fontSize: '18px' }}>
          {t('art_slogan_description')}
        </Paragraph>
        {!user && (
          <Button type="primary" size="large" className="elegant-btn" onClick={() => navigate('/register')}>
            {t('join_us')}
          </Button>
        )}
      </section>
    </div>
  );
};

export default Home;
