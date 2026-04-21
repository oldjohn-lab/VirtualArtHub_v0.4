import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Row, Col, Card, Empty, Spin, Tag, Typography, Button, Space, message, Popconfirm, Divider, Modal, Form, Input, Switch, Pagination } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';

const { Meta } = Card;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const GalleryView = () => {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [artPieces, setArtPieces] = useState([]);
  const [artTotal, setArtTotal] = useState(0);
  const [artPage, setArtPage] = useState(1);
  const [artPageSize, setArtPageSize] = useState(12);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingArt, setEditingArt] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchGalleryDetails = async ({ page = artPage, pageSize = artPageSize } = {}) => {
    try {
      const [galRes, artRes] = await Promise.all([
        axios.get(apiUrl(`/galleries/${id}`), { params: { includeArtPieces: 0, allowEmpty: 1 } }),
        axios.get(apiUrl(`/galleries/${id}/artpieces/owner`), { params: { page, pageSize } }),
      ]);

      setGallery(galRes.data);
      const list = Array.isArray(artRes.data?.items) ? artRes.data.items : Array.isArray(artRes.data) ? artRes.data : [];
      setArtPieces(list);
      setArtTotal(Number(artRes.data?.total) || list.length);
      setArtPage(Number(artRes.data?.page) || page);
      setArtPageSize(Number(artRes.data?.pageSize) || pageSize);
      setLoading(false);
    } catch (err) {
      console.error(err);
      message.error(t('cannot_get_gallery_details'));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchGalleryDetails({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when gallery id or session changes; pagination is explicit
  }, [user, id]);

  const handleDeleteArt = async (artId) => {
    try {
      await axios.delete(apiUrl(`/artpieces/${artId}`));
      message.success(t('artwork_deleted_success'));
      fetchGalleryDetails();
    } catch (err) {
      message.error(t('artwork_delete_failed'));
    }
  };

  const openEditArt = (art) => {
    setEditingArt(art);
    editForm.setFieldsValue({
      title: art.title || '',
      description: art.description || '',
      allowDownload: Boolean(art.allowDownload),
    });
    setEditModalOpen(true);
  };

  const closeEditArt = () => {
    setEditModalOpen(false);
    setEditingArt(null);
    editForm.resetFields();
  };

  const handleUpdateArt = async (values) => {
    if (!editingArt) return;
    setEditSaving(true);
    try {
      await axios.put(
        apiUrl(`/artpieces/${editingArt.id}`),
        {
          title: values.title,
          description: values.description,
          allowDownload: values.allowDownload ? 'true' : 'false',
        }
      );
      message.success(t('save_changes'));
      closeEditArt();
      fetchGalleryDetails();
    } catch (err) {
      message.error(t('update_failed_retry'));
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}><Spin size="large" /></div>;
  if (!gallery) return <Empty description={t('gallery_not_exist')} />;

  const statusColors = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red'
  };

  const statusTexts = {
    pending: t('pending_review'),
    approved: t('exhibited'),
    rejected: t('rejected_status')
  };

  const sortedArtPieces = Array.isArray(artPieces)
    ? [...artPieces].sort((a, b) => {
      const aIsLit = a?.artType === 'literature';
      const bIsLit = b?.artType === 'literature';
      if (aIsLit && bIsLit) {
        const an = Number(a.episodeNumber);
        const bn = Number(b.episodeNumber);
        const aHas = Number.isFinite(an);
        const bHas = Number.isFinite(bn);
        if (aHas && bHas && an !== bn) return an - bn;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return (a.id || 0) - (b.id || 0);
      }
      if (aIsLit !== bIsLit) return aIsLit ? -1 : 1;
      return (a.id || 0) - (b.id || 0);
    })
    : [];

  return (
    <div style={{ padding: '40px 0' }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/my-gallery')} style={{ marginBottom: '20px' }}>
        {t('back_to_my_galleries')}
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <Title level={2}>{gallery.name}</Title>
          <Paragraph type="secondary" style={{ fontSize: '16px' }}>{gallery.description}</Paragraph>
        </div>
        <Link to={`/upload?galleryId=${id}`}>
          <Button type="primary" size="large" className="elegant-btn" icon={<PlusOutlined />}>
            {t('upload_art_to_this_gallery')}
          </Button>
        </Link>
      </div>

      <Divider />

      {sortedArtPieces.length === 0 ? (
        <Empty
          description={t('no_artworks_in_this_gallery')}
          style={{ padding: '60px 0' }}
        >
          <Link to={`/upload?galleryId=${id}`}>
            <Button type="primary" className="elegant-btn">{t('upload_art_now')}</Button>
          </Link>
        </Empty>
      ) : (
        <>
          <Row gutter={[24, 24]}>
            {sortedArtPieces.map(art => (
            <Col xs={24} sm={12} md={8} lg={6} key={art.id}>
              <Card
                hoverable
                onClick={() => navigate(`/artpiece/${art.id}?src=my&galleryId=${id}`)}
                cover={
                  <div
                    style={{ height: '200px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9f9f9', cursor: 'pointer' }}
                    onClick={() => navigate(`/artpiece/${art.id}?src=my&galleryId=${id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <img
                      alt={art.title}
                      src={apiUrl(`/artpieces/preview/${art.id}`) + '?wm=0'}
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                      draggable={false}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                }
                actions={[
                  <Link to={`/artpiece/${art.id}?src=my&galleryId=${id}`} onClick={(e) => e.stopPropagation()}><EyeOutlined key="view" /></Link>,
                  <EditOutlined
                    key="edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditArt(art);
                    }}
                  />,
                  <Popconfirm
                    title={t('confirm_delete_this_artwork')}
                    onConfirm={() => handleDeleteArt(art.id)}
                    okText={t('confirm')}
                    cancelText={t('cancel')}
                  >
                    <DeleteOutlined
                      key="delete"
                      style={{ color: '#ff4d4f' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                ]}
              >
                <Meta
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Text strong ellipsis style={{ maxWidth: 180 }}>
                          {art.artType === 'literature' && Number.isFinite(Number(art.episodeNumber)) ? `第 ${Number(art.episodeNumber)} 章：` : ''}
                          {art.title}
                        </Text>
                      </div>
                      <Space size={6}>
                        {art.artType === 'literature' ? <Tag color="purple">{t('literature_serial')}</Tag> : null}
                        <Tag color={statusColors[art.status]}>{statusTexts[art.status]}</Tag>
                      </Space>
                    </div>
                  }
                  description={art.description?.substring(0, 30) + '...'}
                />
              </Card>
            </Col>
            ))}
          </Row>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
            <Pagination
              current={artPage}
              pageSize={artPageSize}
              total={artTotal}
              showSizeChanger
              pageSizeOptions={[8, 12, 24, 48]}
              onChange={(p, ps) => {
                setLoading(true);
                fetchGalleryDetails({ page: p, pageSize: ps });
              }}
            />
          </div>
        </>
      )}

      <Modal
        title={t('edit_artwork_title')}
        open={editModalOpen}
        onCancel={closeEditArt}
        okText={t('save_changes')}
        cancelText={t('cancel')}
        okButtonProps={{ loading: editSaving }}
        onOk={() => editForm.submit()}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateArt}
        >
          <Form.Item
            name="title"
            label={<Text strong>{t('art_title')}</Text>}
            rules={[{ required: true, message: t('art_title_required') }]}
          >
            <Input size="large" placeholder={t('enter_art_title_placeholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={<Text strong>{t('art_description')}</Text>}
            rules={[{ required: true, message: t('art_description_required') }]}
          >
            <TextArea rows={4} placeholder={t('describe_inspiration_placeholder')} />
          </Form.Item>

          <Form.Item
            name="allowDownload"
            label={<Text strong>{t('open_original_download')}</Text>}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GalleryView;
