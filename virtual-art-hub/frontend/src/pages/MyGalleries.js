import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { Row, Col, Card, Empty, Spin, Typography, Button, Space, message, Modal, Form, Input, Popconfirm, Pagination, Radio, Upload, Switch, Select, Slider, Divider } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';
import GalleryAccessTicket from '../components/GalleryAccessTicket';
import { galleryCoverFontOptions } from '../constants/galleryCoverFonts';

const { Meta } = Card;
const { Title, Paragraph, Text } = Typography;
const GALLERY_CARD_WIDTH = 320;

const MyGalleries = () => {
  const { user } = useContext(AuthContext);
  const [galleries, setGalleries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingGallery, setEditingGallery] = useState(null);
  const [posterMode, setPosterMode] = useState('default');
  const [posterFileList, setPosterFileList] = useState([]);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState('');
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropDraft, setCropDraft] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const cropDragRef = useRef({ dragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchMyGalleries = async ({ nextPage = page, nextPageSize = pageSize } = {}) => {
    try {
      const res = await axios.get(apiUrl('/galleries/my-galleries'), {
        params: { page: nextPage, pageSize: nextPageSize },
      });
      const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
      setGalleries(list);
      setTotal(Number(res.data?.total) || list.length);
      setPage(Number(res.data?.page) || nextPage);
      setPageSize(Number(res.data?.pageSize) || nextPageSize);
      setLoading(false);
    } catch (err) {
      console.error(err);
      message.error(t('cannot_get_galleries'));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchMyGalleries({ nextPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / user session only; pagination calls fetch explicitly
  }, [user]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingGallery(null);
    form.resetFields();
    setPosterMode('default');
    setPosterFileList([]);
    setPosterPreviewUrl('');
    setCropModalOpen(false);
    setCropDraft({ scale: 1, offsetX: 0, offsetY: 0 });
    form.setFieldsValue({
      coverMode: 'default',
      showTitle: true,
      showDescription: true,
      titleColor: '#1c1c1c',
      descriptionColor: '#3f3f3f',
      titleFontFamily: 'Playfair Display',
      titleFontBold: true,
      descriptionFontFamily: 'Lora',
      descriptionFontBold: false,
      coverOpacity: 0.92,
      coverBlur: 6,
      posterScale: 1,
      posterOffsetX: 0,
      posterOffsetY: 0,
      allowChat: true,
      allowPublicAccess: false,
    });
    setIsModalVisible(true);
  };

  const openEditModal = (gallery) => {
    setModalMode('edit');
    setEditingGallery(gallery);
    form.setFieldsValue({
      name: gallery.name,
      description: gallery.description,
      coverMode: gallery.coverMode || 'default',
      showTitle: gallery.showTitle !== false,
      showDescription: gallery.showDescription !== false,
      titleColor: gallery.titleColor || '#1c1c1c',
      descriptionColor: gallery.descriptionColor || '#3f3f3f',
      titleFontFamily: gallery.titleFontFamily || 'Playfair Display',
      titleFontBold: gallery.titleFontBold !== false,
      descriptionFontFamily: gallery.descriptionFontFamily || 'Lora',
      descriptionFontBold: gallery.descriptionFontBold === true,
      coverOpacity: Number(gallery.coverOpacity) || 0.92,
      coverBlur: Number(gallery.coverBlur) || 6,
      posterScale: 1,
      posterOffsetX: 0,
      posterOffsetY: 0,
      allowChat: gallery.allowChat !== false,
      allowPublicAccess: gallery.allowPublicAccess === true,
    });
    setPosterMode(gallery.coverMode || 'default');
    setPosterFileList([]);
    setPosterPreviewUrl('');
    setCropModalOpen(false);
    setCropDraft({ scale: 1, offsetX: 0, offsetY: 0 });
    setIsModalVisible(true);
  };

  const resetPosterTempState = () => {
    if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
    setPosterPreviewUrl('');
    setPosterFileList([]);
    setCropModalOpen(false);
    setCropDraft({ scale: 1, offsetX: 0, offsetY: 0 });
    form.setFieldsValue({ posterScale: 1, posterOffsetX: 0, posterOffsetY: 0 });
  };

  const handleModalClose = () => {
    resetPosterTempState();
    setIsModalVisible(false);
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const handleSubmitGallery = async (values) => {
    try {
      const data = new FormData();
      data.append('name', values.name || '');
      data.append('description', values.description || '');
      data.append('coverMode', values.coverMode || 'default');
      if (values.coverMode === 'custom') {
        data.append('showTitle', values.showTitle ? 'true' : 'false');
        data.append('showDescription', values.showDescription ? 'true' : 'false');
        data.append('titleColor', values.titleColor || '#1c1c1c');
        data.append('descriptionColor', values.descriptionColor || '#3f3f3f');
        data.append('titleFontFamily', values.titleFontFamily || 'Playfair Display');
        data.append('descriptionFontFamily', values.descriptionFontFamily || 'Lora');
        data.append('titleFontBold', values.titleFontBold !== false ? 'true' : 'false');
        data.append('descriptionFontBold', values.descriptionFontBold ? 'true' : 'false');
        data.append('coverOpacity', String(values.coverOpacity ?? 0.92));
        data.append('coverBlur', String(values.coverBlur ?? 6));
        data.append('posterScale', String(values.posterScale || 1));
        data.append('posterOffsetX', String(values.posterOffsetX || 0));
        data.append('posterOffsetY', String(values.posterOffsetY || 0));
        const rawPoster = posterFileList[0]?.originFileObj;
        if (rawPoster) data.append('poster', rawPoster);
      }
      data.append('allowChat', values.allowChat === false ? 'false' : 'true');
      data.append('allowPublicAccess', values.allowPublicAccess ? 'true' : 'false');
      if (modalMode === 'edit' && editingGallery) {
        await axios.put(apiUrl(`/galleries/${editingGallery.id}`), data);
        message.success(t('gallery_updated_success'));
      } else {
        await axios.post(apiUrl('/galleries'), data);
        message.success(t('gallery_created_success'));
      }
      handleModalClose();
      form.resetFields();
      fetchMyGalleries();
    } catch (err) {
      message.error(modalMode === 'edit' ? t('update_failed_retry') : t('create_failed_retry'));
    }
  };

  const handleDeleteGallery = async (id) => {
    try {
      await axios.delete(apiUrl(`/galleries/${id}`));
      message.success(t('gallery_removed_success'));
      fetchMyGalleries();
    } catch (err) {
      message.error(t('gallery_remove_failed'));
    }
  };

  const watchedPosterScale = Form.useWatch('posterScale', form);
  const watchedPosterOffsetX = Form.useWatch('posterOffsetX', form);
  const watchedPosterOffsetY = Form.useWatch('posterOffsetY', form);
  const watchedCoverOpacity = Form.useWatch('coverOpacity', form);
  const watchedCoverBlur = Form.useWatch('coverBlur', form);
  const watchedCoverMode = Form.useWatch('coverMode', form);
  const watchedName = Form.useWatch('name', form);
  const watchedDescription = Form.useWatch('description', form);
  const watchedShowTitle = Form.useWatch('showTitle', form);
  const watchedShowDescription = Form.useWatch('showDescription', form);
  const watchedAllowPublicAccess = Form.useWatch('allowPublicAccess', form);
  const watchedTitleFontFamily = Form.useWatch('titleFontFamily', form);
  const watchedTitleFontBold = Form.useWatch('titleFontBold', form);
  const watchedTitleColor = Form.useWatch('titleColor', form);
  const watchedDescriptionFontFamily = Form.useWatch('descriptionFontFamily', form);
  const watchedDescriptionFontBold = Form.useWatch('descriptionFontBold', form);
  const watchedDescriptionColor = Form.useWatch('descriptionColor', form);
  const cropScale = Number(watchedPosterScale) || 1;
  const cropOffsetX = Number(watchedPosterOffsetX) || 0;
  const cropOffsetY = Number(watchedPosterOffsetY) || 0;
  const coverOpacity = Number.isFinite(Number(watchedCoverOpacity)) ? Number(watchedCoverOpacity) : 0.92;
  const coverBlur = Number.isFinite(Number(watchedCoverBlur)) ? Number(watchedCoverBlur) : 6;

  /** 编辑自定义展厅且未重新上传时，用接口拉取当前已保存的海报作预览背景 */
  const editSavedCoverPreviewUrl = useMemo(() => {
    if (modalMode !== 'edit' || !editingGallery?.id) return '';
    if (editingGallery.coverMode !== 'custom' || !editingGallery.coverImage) return '';
    return apiUrl(`/galleries/${editingGallery.id}/cover-image`);
  }, [modalMode, editingGallery]);

  const effectivePosterPreviewUrl =
    watchedCoverMode === 'custom' ? posterPreviewUrl || editSavedCoverPreviewUrl : '';

  const cropBackgroundStyle = useMemo(() => {
    if (!posterPreviewUrl) return undefined;
    const bgSize = `${cropScale * 100}% auto`;
    const posX = `${50 + cropOffsetX * 35}%`;
    const posY = `${50 + cropOffsetY * 35}%`;
    return {
      backgroundImage: `url("${posterPreviewUrl}")`,
      backgroundSize: bgSize,
      backgroundPosition: `${posX} ${posY}`,
    };
  }, [posterPreviewUrl, cropScale, cropOffsetX, cropOffsetY]);
  const cropDisplayStyle = useMemo(() => {
    if (!cropBackgroundStyle) return undefined;
    return {
      ...cropBackgroundStyle,
      opacity: coverOpacity,
      filter: `blur(${coverBlur}px)`,
    };
  }, [cropBackgroundStyle, coverOpacity, coverBlur]);
  const livePreviewName = String(watchedName || '').trim() || t('gallery_name_placeholder');
  const livePreviewDescription = String(watchedDescription || '').trim() || t('gallery_description_placeholder');
  const previewIsCustom = watchedCoverMode === 'custom' && Boolean(effectivePosterPreviewUrl);
  const livePreviewCardStyle = useMemo(() => {
    const base = { width: GALLERY_CARD_WIDTH, maxWidth: '100%', margin: '0 auto', overflow: 'hidden' };
    if (!previewIsCustom) return base;
    return {
      ...base,
      '--custom-poster-url': `url("${effectivePosterPreviewUrl}")`,
      '--custom-poster-opacity': Number(coverOpacity ?? 0.92),
      '--custom-poster-blur': `${Number(coverBlur ?? 6)}px`,
    };
  }, [previewIsCustom, effectivePosterPreviewUrl, coverOpacity, coverBlur]);
  const livePreviewCoverStyle = useMemo(() => {
    if (previewIsCustom || !effectivePosterPreviewUrl) return undefined;
    return {
      '--cover-url': `url("${effectivePosterPreviewUrl}")`,
      '--cover-opacity': Number(coverOpacity ?? 0.92),
      '--cover-blur': `${Number(coverBlur ?? 6)}px`,
    };
  }, [previewIsCustom, effectivePosterPreviewUrl, coverOpacity, coverBlur]);

  const publicVisitUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const code = editingGallery?.publicAccessCode;
    if (code) return `${origin}/visit/${code}`;
    return `${origin}/visit/__draft__`;
  }, [editingGallery?.publicAccessCode]);

  const ticketPosterStyle = useMemo(() => {
    if (watchedCoverMode !== 'custom' || !effectivePosterPreviewUrl) return null;
    if (posterPreviewUrl) {
      return {
        backgroundImage: `url("${posterPreviewUrl}")`,
        backgroundSize: `${cropScale * 100}% auto`,
        backgroundPosition: `${50 + cropOffsetX * 35}% ${50 + cropOffsetY * 35}%`,
        backgroundRepeat: 'no-repeat',
      };
    }
    return {
      backgroundImage: `url("${effectivePosterPreviewUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }, [
    watchedCoverMode,
    effectivePosterPreviewUrl,
    posterPreviewUrl,
    cropScale,
    cropOffsetX,
    cropOffsetY,
  ]);

  const handlePosterWheelZoom = (e) => {
    e.preventDefault();
    if (!posterPreviewUrl) return;
    setCropDraft((prev) => ({
      ...prev,
      scale: Number(clamp(prev.scale + (e.deltaY < 0 ? 0.08 : -0.08), 1, 3).toFixed(2)),
    }));
  };

  const handlePosterMouseDown = (e) => {
    if (!posterPreviewUrl) return;
    cropDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: Number(cropDraft.offsetX) || 0,
      startOffsetY: Number(cropDraft.offsetY) || 0,
    };
  };

  const handlePosterMouseMove = (e) => {
    const drag = cropDragRef.current;
    if (!drag.dragging) return;
    const nextOffsetX = clamp(drag.startOffsetX - (e.clientX - drag.startX) / 180, -1, 1);
    const nextOffsetY = clamp(drag.startOffsetY - (e.clientY - drag.startY) / 180, -1, 1);
    setCropDraft((prev) => ({
      ...prev,
      offsetX: Number(nextOffsetX.toFixed(3)),
      offsetY: Number(nextOffsetY.toFixed(3)),
    }));
  };

  const handlePosterMouseUp = () => {
    cropDragRef.current.dragging = false;
  };

  const applyCropDraft = () => {
    form.setFieldsValue({
      posterScale: cropDraft.scale,
      posterOffsetX: cropDraft.offsetX,
      posterOffsetY: cropDraft.offsetY,
    });
    setCropModalOpen(false);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: '40px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <Title level={2}>{t('my_galleries_title')}</Title>
          <Paragraph type="secondary">{t('my_galleries_description_curator')}</Paragraph>
        </div>
        <Button
          type="primary"
          size="large"
          className="elegant-btn"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
        >
          {t('create_new_gallery_button')}
        </Button>
      </div>

      {galleries.length === 0 ? (
        <Empty
          description={t('no_galleries_created')}
          style={{ padding: '100px 0' }}
        >
          <Button type="primary" className="elegant-btn" onClick={openCreateModal}>
            {t('create_first_gallery_now')}
          </Button>
        </Empty>
      ) : (
        <>
          <Row gutter={[32, 32]} className="my-galleries-list">
            {galleries.map(gallery => (
            <Col xs={24} sm={12} md={8} key={gallery.id}>
              {(() => {
                const coverArtId = gallery.coverArtId || gallery.artPieces?.[0]?.id;
                const customCover = gallery.coverMode === 'custom' && gallery.coverImage ? apiUrl(`/galleries/${gallery.id}/cover-image`) : null;
                const coverUrl = customCover || (coverArtId ? apiUrl(`/artpieces/preview/${coverArtId}`) + '?wm=0' : null);
                const artPiecesCount = Number(gallery.artPiecesCount) || (Array.isArray(gallery.artPieces) ? gallery.artPieces.length : 0);
                const customPosterStyle = customCover
                  ? {
                      '--custom-poster-url': `url("${customCover}")`,
                      '--custom-poster-opacity': Number(gallery.coverOpacity ?? 0.92),
                      '--custom-poster-blur': `${Number(gallery.coverBlur ?? 6)}px`,
                    }
                  : undefined;

                return (
              <Card
                hoverable
                className={customCover ? 'my-gallery-card my-gallery-card--custom-poster' : 'my-gallery-card'}
                style={{ ...customPosterStyle, width: GALLERY_CARD_WIDTH, maxWidth: '100%', margin: '0 auto' }}
                cover={
                  <div
                    className="my-gallery-cover"
                    style={
                      coverUrl && !customCover
                        ? {
                            '--cover-url': `url("${coverUrl}")`,
                            '--cover-opacity': Number(gallery.coverOpacity ?? 0.92),
                            '--cover-blur': `${Number(gallery.coverBlur ?? 6)}px`,
                          }
                        : undefined
                    }
                    onClick={() => navigate(`/my-gallery/${gallery.id}`)}
                  >
                    <div className="my-gallery-cover-title">
                      {gallery.showTitle !== false ? (
                        <span
                          className="my-gallery-cover-title-text"
                          style={{
                            color: gallery.titleColor || undefined,
                            fontFamily: gallery.titleFontFamily || undefined,
                            fontWeight: gallery.titleFontBold !== false ? 700 : 400,
                          }}
                        >
                          {gallery.name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                }
                actions={[
                  <Link to={`/my-gallery/${gallery.id}`}><EyeOutlined key="view" /></Link>,
                  <EditOutlined key="edit" onClick={() => openEditModal(gallery)} />,
                  <Popconfirm
                    title={t('confirm_delete_this_gallery')}
                    onConfirm={() => handleDeleteGallery(gallery.id)}
                    okText={t('confirm')}
                    cancelText={t('cancel')}
                  >
                    <DeleteOutlined key="delete" style={{ color: '#ff4d4f' }} />
                  </Popconfirm>
                ]}
              >
                <Meta
                  title={
                    <Text
                      style={{
                        fontSize: '18px',
                        display: 'block',
                        minHeight: 27,
                        visibility: gallery.showTitle !== false ? 'visible' : 'hidden',
                        fontWeight: gallery.titleFontBold !== false ? 700 : 400,
                      }}
                    >
                      {gallery.name || ' '}
                    </Text>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary">{t('art_pieces_count', { count: artPiecesCount })}</Text>
                      <Text
                        type="secondary"
                        style={{
                          minHeight: 22,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: gallery.descriptionColor || undefined,
                          fontFamily: gallery.descriptionFontFamily || undefined,
                          fontWeight: gallery.descriptionFontBold === true ? 700 : 400,
                          visibility: gallery.showDescription !== false ? 'visible' : 'hidden',
                        }}
                      >
                        {gallery.description || ' '}
                      </Text>
                    </Space>
                  }
                />
              </Card>
                );
              })()}
            </Col>
            ))}
          </Row>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={[6, 12, 24, 48]}
              onChange={(p, ps) => {
                setLoading(true);
                fetchMyGalleries({ nextPage: p, nextPageSize: ps });
              }}
            />
          </div>
        </>
      )}

      <Modal
        title={
          <Title level={3} className="gallery-create-modal-title">
            {modalMode === 'edit' ? t('edit_gallery') : t('create_new_art_gallery')}
          </Title>
        }
        open={isModalVisible}
        onCancel={handleModalClose}
        footer={null}
        width={1180}
        centered
        classNames={{ body: 'gallery-create-modal-body' }}
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto', overflowX: 'hidden' } }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitGallery} className="gallery-create-modal-form">
          <Row gutter={[20, 24]} align="stretch">
            <Col xs={24} lg={14} className="gallery-create-modal-col gallery-create-modal-col--main">
              <div className="gallery-create-modal-main">
              <Form.Item
                name="coverMode"
                label={<Text strong>{t('gallery_cover_mode')}</Text>}
                rules={[{ required: true }]}
              >
                <Radio.Group
                  className="gallery-create-cover-radio"
                  onChange={(e) => {
                    const mode = e.target.value;
                    setPosterMode(mode);
                    if (mode !== 'custom') resetPosterTempState();
                  }}
                >
                  <Radio value="default">{t('gallery_cover_default')}</Radio>
                  <Radio value="custom">{t('gallery_cover_custom')}</Radio>
                </Radio.Group>
              </Form.Item>

              <Divider orientation="left" className="gallery-create-divider">
                {t('gallery_config_section') || '展厅配置'}
              </Divider>
              <div className="gallery-create-panel">
                <div className="gallery-create-switch-grid">
                  <Text type="secondary">{t('gallery_allow_chat')}</Text>
                  <Form.Item name="allowChat" valuePropName="checked" noStyle>
                    <Switch checkedChildren={null} unCheckedChildren={null} className="gallery-create-switch" />
                  </Form.Item>
                  <Text type="secondary">{t('gallery_allow_public_access')}</Text>
                  <Form.Item name="allowPublicAccess" valuePropName="checked" noStyle>
                    <Switch checkedChildren={null} unCheckedChildren={null} className="gallery-create-switch" />
                  </Form.Item>
                </div>
              </div>
              {watchedAllowPublicAccess ? (
                <Form.Item label={<Text strong>{t('gallery_public_access_url')}</Text>}>
                  <Input
                    readOnly
                    value={
                      editingGallery?.publicAccessCode
                        ? `${window.location.origin}/visit/${editingGallery.publicAccessCode}`
                        : t('gallery_public_access_url_after_save')
                    }
                  />
                </Form.Item>
              ) : null}
              <Form.Item
                name="name"
                label={<Text strong>{t('gallery_name')}</Text>}
                rules={[
                  { required: true, message: t('gallery_name_required') },
                  { max: 20, message: t('gallery_name_max') },
                ]}
              >
                <Input
                  size="large"
                  maxLength={20}
                  showCount
                  placeholder={t('gallery_name_placeholder')}
                  style={
                    posterMode === 'custom'
                      ? {
                          fontFamily: watchedTitleFontFamily || undefined,
                          color: watchedTitleColor || undefined,
                        }
                      : undefined
                  }
                />
              </Form.Item>
              {posterMode === 'custom' ? (
                <div className="gallery-create-custom-block">
                  <div className="gallery-create-custom-grid gallery-create-poster-custom-controls-grid gallery-create-poster-title-controls-grid">
                    <Text strong className="gallery-create-custom-label">{t('gallery_show_title')}</Text>
                    <Text strong className="gallery-create-custom-label">{t('gallery_title_font')}</Text>
                    <Text strong className="gallery-create-custom-label">{t('gallery_title_color')}</Text>
                    <Text strong className="gallery-create-custom-label">{t('gallery_title_font_bold')}</Text>
                    <Form.Item name="showTitle" valuePropName="checked" noStyle>
                      <Switch size="medium" className="gallery-create-poster-switch-control" />
                    </Form.Item>
                    <Form.Item name="titleFontFamily" noStyle>
                      <Select
                        size="medium"
                        className="gallery-create-font-select gallery-create-poster-font-select-control"
                        options={galleryCoverFontOptions}
                        popupMatchSelectWidth={false}
                      />
                    </Form.Item>
                    <Form.Item name="titleColor" noStyle>
                      <Input
                        type="color"
                        size="medium"
                        className="gallery-create-color-input gallery-create-poster-color-control gallery-create-poster-title-color-input"
                      />
                    </Form.Item>
                    <Form.Item name="titleFontBold" valuePropName="checked" noStyle>
                      <Switch size="medium" className="gallery-create-poster-switch-control" />
                    </Form.Item>
                  </div>
                </div>
              ) : null}
              <Form.Item
                name="description"
                label={<Text strong>{t('gallery_description')}</Text>}
                rules={[{ max: 200, message: t('gallery_description_max') }]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={200}
                  showCount
                  placeholder={t('gallery_description_placeholder')}
                  style={
                    posterMode === 'custom'
                      ? {
                          fontFamily: watchedDescriptionFontFamily || undefined,
                          color: watchedDescriptionColor || undefined,
                        }
                      : undefined
                  }
                />
              </Form.Item>
              {posterMode === 'custom' ? (
                <>
                  <div className="gallery-create-custom-block">
                    <div className="gallery-create-custom-grid gallery-create-poster-custom-controls-grid gallery-create-poster-description-controls-grid">
                      <Text strong className="gallery-create-custom-label">{t('gallery_show_description')}</Text>
                      <Text strong className="gallery-create-custom-label">{t('gallery_description_font')}</Text>
                      <Text strong className="gallery-create-custom-label">{t('gallery_description_color')}</Text>
                      <Text strong className="gallery-create-custom-label">{t('gallery_description_font_bold')}</Text>
                      <Form.Item name="showDescription" valuePropName="checked" noStyle>
                        <Switch size="medium" className="gallery-create-poster-switch-control" />
                      </Form.Item>
                      <Form.Item name="descriptionFontFamily" noStyle>
                        <Select
                          size="medium"
                          className="gallery-create-font-select gallery-create-poster-font-select-control"
                          options={galleryCoverFontOptions}
                          popupMatchSelectWidth={false}
                        />
                      </Form.Item>
                      <Form.Item name="descriptionColor" noStyle>
                        <Input
                          type="color"
                          size="medium"
                          className="gallery-create-color-input gallery-create-poster-color-control gallery-create-poster-description-color-input"
                        />
                      </Form.Item>
                      <Form.Item name="descriptionFontBold" valuePropName="checked" noStyle>
                        <Switch size="medium" className="gallery-create-poster-switch-control" />
                      </Form.Item>
                    </div>
                  </div>
                  <Form.Item
                    label={<Text strong>{t('gallery_cover_upload')}</Text>}
                    required
                    rules={[{ validator: async () => { if (!posterFileList.length && modalMode === 'create') throw new Error(t('gallery_cover_upload_required')); } }]}
                  >
                    <Upload
                      accept="image/*"
                      maxCount={1}
                      fileList={posterFileList}
                      beforeUpload={(file) => {
                        if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
                        setPosterFileList([{ uid: file.uid, name: file.name, status: 'done', originFileObj: file }]);
                        const nextUrl = URL.createObjectURL(file);
                        setPosterPreviewUrl(nextUrl);
                        const initialScale = Number(form.getFieldValue('posterScale')) || 1;
                        const initialOffsetX = Number(form.getFieldValue('posterOffsetX')) || 0;
                        const initialOffsetY = Number(form.getFieldValue('posterOffsetY')) || 0;
                        setCropDraft({ scale: initialScale, offsetX: initialOffsetX, offsetY: initialOffsetY });
                        setCropModalOpen(true);
                        return false;
                      }}
                      onRemove={() => {
                        resetPosterTempState();
                        return true;
                      }}
                    >
                      <Button>{t('gallery_cover_choose_image')}</Button>
                    </Upload>
                  </Form.Item>

                  {posterPreviewUrl ? (
                    <div className="gallery-create-poster-result">
                      <div
                        className="gallery-poster-crop-preview"
                        style={cropDisplayStyle}
                        role="presentation"
                        title={t('gallery_cover_result_hint')}
                      />
                      <Space className="gallery-create-poster-hint" wrap>
                        <Text type="secondary">{t('gallery_cover_result_hint')}</Text>
                        <Button
                          size="small"
                          onClick={() => {
                            setCropDraft({
                              scale: Number(form.getFieldValue('posterScale')) || 1,
                              offsetX: Number(form.getFieldValue('posterOffsetX')) || 0,
                              offsetY: Number(form.getFieldValue('posterOffsetY')) || 0,
                            });
                            setCropModalOpen(true);
                          }}
                        >
                          {t('gallery_cover_recrop')}
                        </Button>
                      </Space>
                      <Form.Item name="posterScale" hidden><Input /></Form.Item>
                      <Form.Item name="posterOffsetX" hidden><Input /></Form.Item>
                      <Form.Item name="posterOffsetY" hidden><Input /></Form.Item>
                      <Form.Item name="coverOpacity" label={<Text strong>{t('gallery_cover_opacity')}</Text>} className="gallery-create-slider-item">
                        <Slider min={0.2} max={1} step={0.01} />
                      </Form.Item>
                      <Form.Item name="coverBlur" label={<Text strong>{t('gallery_cover_blur')}</Text>} className="gallery-create-slider-item">
                        <Slider min={0} max={20} step={0.1} />
                      </Form.Item>
                    </div>
                  ) : null}
                </>
              ) : null}

              <Form.Item className="gallery-create-submit">
                <Button type="primary" htmlType="submit" block size="large">
                  {modalMode === 'edit' ? t('save_changes') : t('start_art_journey')}
                </Button>
              </Form.Item>
              </div>
            </Col>

            <Col xs={24} lg={10} className="gallery-create-modal-col gallery-create-modal-col--side">
              <div className="gallery-create-modal-preview">
                <Form.Item label={<Text strong>{t('gallery_live_preview_label')}</Text>}>
                    <Card
                      size="small"
                      className={[previewIsCustom ? 'my-gallery-card--custom-poster' : '', 'gallery-live-preview-card'].filter(Boolean).join(' ')}
                      style={livePreviewCardStyle}
                      cover={
                        <div className="my-gallery-cover" style={livePreviewCoverStyle}>
                          <div
                            className="my-gallery-cover-title"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                            }}
                          >
                            <span
                              className="my-gallery-cover-title-text"
                              style={{
                                color: watchedTitleColor || '#1c1c1c',
                                fontFamily: watchedTitleFontFamily
                                  ? `${watchedTitleFontFamily}, Georgia, serif`
                                  : "'Playfair Display', Georgia, serif",
                                fontWeight: watchedTitleFontBold !== false ? 700 : 400,
                                width: '100%',
                                display: 'block',
                                margin: '0 auto',
                                textAlign: 'center',
                                visibility: watchedShowTitle === false ? 'hidden' : 'visible',
                              }}
                            >
                              {livePreviewName}
                            </span>
                          </div>
                        </div>
                      }
                    >
                      <Meta
                        title={
                          <span
                            className="gallery-live-preview-title"
                            style={{
                              fontSize: '18px',
                              display: 'block',
                              minHeight: 27,
                              lineHeight: 1.35,
                              visibility: watchedShowTitle === false ? 'hidden' : 'visible',
                              color: watchedTitleColor || '#1c1c1c',
                              fontFamily: watchedTitleFontFamily
                                ? `${watchedTitleFontFamily}, Georgia, serif`
                                : "'Playfair Display', Georgia, serif",
                              fontWeight: watchedTitleFontBold !== false ? 700 : 400,
                            }}
                          >
                            {livePreviewName}
                          </span>
                        }
                        description={
                          <Space direction="vertical" size={0} className="gallery-live-preview-desc-block">
                            <span className="gallery-live-preview-works">{t('art_pieces_count', { count: 0 })}</span>
                            <span
                              className="gallery-live-preview-description"
                              style={{
                                display: 'block',
                                minHeight: 22,
                                lineHeight: 1.5,
                                visibility: watchedShowDescription === false ? 'hidden' : 'visible',
                                color: watchedDescriptionColor || '#3f3f3f',
                                fontFamily: watchedDescriptionFontFamily
                                  ? `${watchedDescriptionFontFamily}, Georgia, serif`
                                  : "'Lora', Georgia, serif",
                                fontWeight: watchedDescriptionFontBold === true ? 700 : 400,
                              }}
                            >
                              {livePreviewDescription}
                            </span>
                          </Space>
                        }
                      />
                    </Card>
                </Form.Item>
                {watchedAllowPublicAccess ? (
                  <div className="gallery-create-ticket-wrap">
                    <Text strong className="gallery-create-ticket-title">
                      {t('gallery_access_ticket_title')}
                    </Text>
                    <GalleryAccessTicket
                      accessUrl={publicVisitUrl}
                      posterStyle={ticketPosterStyle}
                      downloadName={String(watchedName || editingGallery?.name || '').trim() || undefined}
                      galleryTitle={watchedShowTitle === false ? '' : livePreviewName}
                      galleryDescription={watchedShowDescription === false ? '' : livePreviewDescription}
                      titleColor={watchedTitleColor || undefined}
                      titleFontFamily={watchedTitleFontFamily || undefined}
                      titleFontBold={watchedTitleFontBold !== false}
                      descriptionColor={watchedDescriptionColor || undefined}
                      descriptionFontFamily={watchedDescriptionFontFamily || undefined}
                      descriptionFontBold={watchedDescriptionFontBold === true}
                      stubText={t('gallery_access_ticket_stub')}
                      hintText={editingGallery?.publicAccessCode ? undefined : t('gallery_access_ticket_hint')}
                    />
                  </div>
                ) : null}
              </div>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={t('gallery_cover_crop_modal_title')}
        open={cropModalOpen}
        onCancel={() => setCropModalOpen(false)}
        onOk={applyCropDraft}
        okText={t('gallery_cover_crop_apply')}
        cancelText={t('cancel')}
        destroyOnClose={false}
      >
        <div
          className="gallery-poster-crop-preview"
          style={{
            ...(posterPreviewUrl
              ? {
                  backgroundImage: `url("${posterPreviewUrl}")`,
                  backgroundSize: `${(cropDraft.scale || 1) * 100}% auto`,
                  backgroundPosition: `${50 + (cropDraft.offsetX || 0) * 35}% ${50 + (cropDraft.offsetY || 0) * 35}%`,
                }
              : {}),
          }}
          onWheel={handlePosterWheelZoom}
          onMouseDown={handlePosterMouseDown}
          onMouseMove={handlePosterMouseMove}
          onMouseUp={handlePosterMouseUp}
          onMouseLeave={handlePosterMouseUp}
          role="presentation"
          title={t('gallery_cover_crop_hint')}
        />
        <Text type="secondary">{t('gallery_cover_crop_hint')}</Text>
      </Modal>
    </div>
  );
};

export default MyGalleries;
