import React, { useMemo, useRef, useState, useContext, useEffect, useCallback } from 'react';
import { Card, Form, Input, Button, Typography, Space, message, Divider, Avatar, Statistic, Row, Col, Tag, Modal, Upload, Slider } from 'antd';
import { UserOutlined, MailOutlined, EditOutlined, SafetyOutlined, UploadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';

const { Title, Text, Paragraph } = Typography;

const Profile = () => {
  const { user, setUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [avatarPresetSaving, setAvatarPresetSaving] = useState(false);
  const [avatarUploadSaving, setAvatarUploadSaving] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropLoading, setCropLoading] = useState(false);
  const [cropImg, setCropImg] = useState(null);
  const [cropImgUrl, setCropImgUrl] = useState('');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [cropPreviewDataUrl, setCropPreviewDataUrl] = useState('');
  const cropZoomRef = useRef(1);
  const cropPosRef = useRef({ x: 0, y: 0 });
  const cropPadRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const cropDragRef = useRef({ dragging: false, pointerId: null, startX: 0, startY: 0, startPos: { x: 0, y: 0 } });
  const [form] = Form.useForm();
  const [stats, setStats] = useState({ artworks: 0, sales: 0, rating: 0 });
  const { t } = useTranslation();

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(apiUrl('/artpieces/my-art'), {
        headers: { 'x-auth-token': localStorage.getItem('token') }
      });
      setStats({
        artworks: res.data.length,
        sales: res.data.filter(a => a.status === 'approved').length, // Simple demo stats
        rating: 4.8 // Fixed demo rating
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        username: user.username,
        email: user.email
      });
      fetchStats();
    }
  }, [user, form, fetchStats]);

  useEffect(() => {
    setAvatarPresetSaving(false);
    setAvatarUploadSaving(false);
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (cropImgUrl) URL.revokeObjectURL(cropImgUrl);
    };
  }, [cropImgUrl]);

  const avatarUrl = useMemo(() => {
    if (!user?.id) return '';
    const ts = user.avatarUpdatedAt ? new Date(user.avatarUpdatedAt).getTime() : 0;
    return `${apiUrl(`/users/${user.id}/avatar`)}?v=${ts}`;
  }, [user?.id, user?.avatarUpdatedAt]);

  const initials = (name) => {
    const s = name ? String(name).trim() : '';
    if (!s) return 'U';
    const parts = s.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || s[0];
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
    return `${a || ''}${b || ''}`.toUpperCase().slice(0, 2) || 'U';
  };

  const presetDefs = useMemo(
    () => ([
      { key: 'gradient', label: '渐变字母' },
      { key: 'pixel', label: '像素风' },
      { key: 'blob', label: '潮流泡泡' },
      { key: 'ring', label: '渐变光环' },
      { key: 'mono', label: '极简黑白' },
    ]),
    []
  );

  const presetPreviewUrl = (presetKey) => {
    const seed = user?.id ? String(user.id) : '0';
    const name = user?.username ? String(user.username) : seed;
    return `${apiUrl('/avatars/preset')}?style=${encodeURIComponent(presetKey)}&seed=${encodeURIComponent(seed)}&name=${encodeURIComponent(name)}`;
  };

  const updateAvatarPreset = async (presetKey) => {
    if (!user) return;
    if (avatarPresetSaving) return;
    setAvatarPresetSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(
        apiUrl('/auth/avatar'),
        { avatarPreset: presetKey },
        {
          timeout: 12000,
          headers: { 'x-auth-token': token, Authorization: token ? `Bearer ${token}` : undefined },
        }
      );
      setUser({
        ...user,
        avatarUploadPath: null,
        avatarPreset: res.data?.avatarPreset || presetKey,
        avatarUpdatedAt: res.data?.avatarUpdatedAt || new Date().toISOString(),
      });
      message.success('头像已更新');
    } catch (err) {
      message.error(err.response?.data?.msg || '头像更新失败');
    } finally {
      setAvatarPresetSaving(false);
    }
  };

  const cropCanvasSize = 260;

  const drawCrop = (img, { zoom, pos }) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    ctx2d.clearRect(0, 0, cropCanvasSize, cropCanvasSize);
    ctx2d.fillStyle = 'rgba(0,0,0,0.04)';
    ctx2d.fillRect(0, 0, cropCanvasSize, cropCanvasSize);
    if (!img) return;

    const baseScale = Math.max(cropCanvasSize / img.width, cropCanvasSize / img.height);
    const scale = baseScale * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = 'high';
    ctx2d.drawImage(img, pos.x, pos.y, drawW, drawH);
  };

  const clampCropPos = (img, zoom, pos) => {
    if (!img) return pos;
    const baseScale = Math.max(cropCanvasSize / img.width, cropCanvasSize / img.height);
    const scale = baseScale * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const minX = cropCanvasSize - drawW;
    const minY = cropCanvasSize - drawH;
    const maxX = 0;
    const maxY = 0;
    const x = minX > maxX ? (cropCanvasSize - drawW) / 2 : Math.max(minX, Math.min(maxX, pos.x));
    const y = minY > maxY ? (cropCanvasSize - drawH) / 2 : Math.max(minY, Math.min(maxY, pos.y));
    return { x, y };
  };

  const clampZoom = (z) => Math.max(1, Math.min(3, Number(z) || 1));

  useEffect(() => {
    cropZoomRef.current = cropZoom;
  }, [cropZoom]);

  useEffect(() => {
    cropPosRef.current = cropPos;
  }, [cropPos]);

  useEffect(() => {
    if (!cropImg) return;
    const next = clampCropPos(cropImg, cropZoom, cropPos);
    if (next.x !== cropPos.x || next.y !== cropPos.y) {
      setCropPos(next);
      return;
    }
    drawCrop(cropImg, { zoom: cropZoom, pos: cropPos });
    const canvas = cropCanvasRef.current;
    if (canvas) setCropPreviewDataUrl(canvas.toDataURL('image/png'));
  }, [cropImg, cropZoom, cropPos]);

  const openCropModalWithFile = (file) => {
    if (!file) return;
    const name = file.name ? String(file.name) : '';
    const type = file.type ? String(file.type).toLowerCase() : '';
    const looksLikeImage = type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    if (!looksLikeImage) {
      message.error('请选择图片文件');
      return;
    }
    setCropLoading(true);
    setCropOpen(true);
    setCropImg(null);
    setCropZoom(1);
    setCropPos({ x: 0, y: 0 });
    setCropPreviewDataUrl('');
    if (cropImgUrl) URL.revokeObjectURL(cropImgUrl);
    const url = URL.createObjectURL(file);
    setCropImgUrl(url);
    setCropPreviewDataUrl('');
    const img = new Image();
    img.onload = () => {
      setCropImg(img);
      setCropZoom(1);
      const baseScale = Math.max(cropCanvasSize / img.width, cropCanvasSize / img.height);
      const drawW = img.width * baseScale;
      const drawH = img.height * baseScale;
      setCropPos({ x: (cropCanvasSize - drawW) / 2, y: (cropCanvasSize - drawH) / 2 });
      setCropLoading(false);
      requestAnimationFrame(() => {
        drawCrop(img, { zoom: 1, pos: { x: (cropCanvasSize - drawW) / 2, y: (cropCanvasSize - drawH) / 2 } });
        const canvas = cropCanvasRef.current;
        if (canvas) setCropPreviewDataUrl(canvas.toDataURL('image/png'));
      });
    };
    img.onerror = () => {
      setCropLoading(false);
      message.error('图片加载失败，请更换图片重试');
    };
    img.src = url;
  };

  const exportCroppedBlob = async () => {
    const outSize = 256;
    const srcCanvas = cropCanvasRef.current;
    if (!srcCanvas) return null;
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return null;
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = 'high';
    ctx2d.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, outSize, outSize);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.92));
  };

  const uploadCroppedAvatar = async () => {
    if (!user) return;
    if (avatarUploadSaving) return;
    const blob = await exportCroppedBlob();
    if (!blob) {
      message.error('头像裁剪失败');
      return;
    }
    setAvatarUploadSaving(true);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.png');
      const res = await axios.put(apiUrl('/auth/avatar'), fd, {
        timeout: 12000,
        headers: { 'x-auth-token': token, Authorization: token ? `Bearer ${token}` : undefined },
      });
      setUser({
        ...user,
        avatarPreset: null,
        avatarUploadPath: res.data?.avatarUploadPath || null,
        avatarUpdatedAt: res.data?.avatarUpdatedAt || new Date().toISOString(),
      });
      message.success('头像已更新');
      setCropOpen(false);
      setCropImg(null);
      setCropPreviewDataUrl('');
    } catch (err) {
      message.error(err.response?.data?.msg || '头像更新失败');
    } finally {
      setAvatarUploadSaving(false);
    }
  };

  const onCropPointerDown = (e) => {
    if (!cropImg) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cropDragRef.current = { dragging: true, pointerId: e.pointerId, startX: x, startY: y, startPos: { ...cropPos } };
  };

  const onCropPointerMove = (e) => {
    if (!cropDragRef.current.dragging || !cropImg) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - cropDragRef.current.startX;
    const dy = y - cropDragRef.current.startY;
    const next = clampCropPos(cropImg, cropZoom, { x: cropDragRef.current.startPos.x + dx, y: cropDragRef.current.startPos.y + dy });
    setCropPos(next);
  };

  const onCropPointerUp = (e) => {
    cropDragRef.current.dragging = false;
    try {
      const el = cropPadRef.current;
      const pid = cropDragRef.current.pointerId;
      if (el && el.releasePointerCapture && pid != null) el.releasePointerCapture(pid);
    } catch {}
    cropDragRef.current.pointerId = null;
  };

  useEffect(() => {
    if (!cropOpen) return undefined;
    const el = cropPadRef.current;
    if (!el) return undefined;

    const onWheel = (ev) => {
      if (!cropImg) return;
      ev.preventDefault();
      ev.stopPropagation();

      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const cx = Math.max(0, Math.min(cropCanvasSize, x));
      const cy = Math.max(0, Math.min(cropCanvasSize, y));

      const baseScale = Math.max(cropCanvasSize / cropImg.width, cropCanvasSize / cropImg.height);
      const currentZoom = cropZoomRef.current;
      const currentPos = cropPosRef.current;
      const currentScale = baseScale * currentZoom;
      const imgX = (cx - currentPos.x) / currentScale;
      const imgY = (cy - currentPos.y) / currentScale;

      const factor = Math.pow(1.0015, -ev.deltaY);
      const nextZoom = clampZoom(currentZoom * factor);
      const nextScale = baseScale * nextZoom;
      const nextPos = clampCropPos(cropImg, nextZoom, { x: cx - imgX * nextScale, y: cy - imgY * nextScale });

      cropZoomRef.current = nextZoom;
      cropPosRef.current = nextPos;
      setCropZoom(nextZoom);
      setCropPos(nextPos);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cropOpen, cropImg]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await axios.put(apiUrl('/auth/profile'), {
        username: values.username
      }, {
        headers: { 'x-auth-token': localStorage.getItem('token') }
      });
      setUser({ ...user, username: res.data.username });
      message.success(t('profile_updated_success'));
    } catch (err) {
      message.error(err.response?.data?.msg || t('profile_update_failed'));
    }
    setLoading(false);
  };

  if (!user) return <div style={{ textAlign: 'center', padding: '100px' }}>{t('login_first_message')}</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 0', paddingLeft: 16, paddingRight: 16 }}>
      <Card style={{ borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Avatar
            size={100}
            src={avatarUrl}
            icon={<UserOutlined />}
            style={{ background: 'transparent', marginBottom: '16px' }}
          />
          <Title level={2}>{user.username}</Title>
          <Text type="secondary">{user.email}</Text>
          <div style={{ marginTop: '12px' }}>
            <Tag color={user.role === 'admin' ? 'red' : 'blue'}>
              {user.role === 'admin' ? t('system_admin') : t('regular_artist')}
            </Tag>
          </div>
        </div>

        <Row gutter={16} justify="center" style={{ marginBottom: '40px' }}>
          <Col span={8}>
            <Statistic title={t('published_artworks')} value={stats.artworks} prefix={<EditOutlined />} style={{ textAlign: 'center' }} />
          </Col>
          <Col span={8}>
            <Statistic title={t('exhibited_artworks')} value={stats.sales} prefix={<SafetyOutlined />} style={{ textAlign: 'center' }} />
          </Col>
          <Col span={8}>
            <Statistic title={t('artist_rating')} value={stats.rating} precision={1} suffix="/ 5.0" style={{ textAlign: 'center' }} />
          </Col>
        </Row>

        <Divider orientation="center">{t('basic_profile_settings')}</Divider>

        <Divider orientation="center">头像设置</Divider>
        <div style={{ marginBottom: 22 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <Text strong>选择流行头像样式</Text>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {presetDefs.map((p) => {
                const active = String(user.avatarPreset || '') === p.key && !user.avatarUploadPath;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => updateAvatarPreset(p.key)}
                    disabled={avatarPresetSaving}
                    style={{
                      border: active ? '2px solid #1677ff' : '1px solid rgba(0,0,0,0.12)',
                      borderRadius: 12,
                      padding: 10,
                      background: '#fff',
                      cursor: 'pointer',
                      width: 120,
                      textAlign: 'center',
                    }}
                  >
                    <Avatar size={56} src={presetPreviewUrl(p.key)}>{initials(user.username)}</Avatar>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>{p.label}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <Text strong>上传自定义头像</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Upload
                key={uploadKey}
                accept="image/*"
                showUploadList={false}
                beforeUpload={() => false}
                onChange={(info) => {
                  const f = info?.file?.originFileObj || info?.file;
                  const asFile = f instanceof File ? f : f instanceof Blob ? new File([f], info?.file?.name || 'avatar.png', { type: f.type || 'image/png' }) : null;
                  if (asFile) {
                    openCropModalWithFile(asFile);
                    setUploadKey((k) => k + 1);
                    return;
                  }
                  message.error('无法读取图片文件，请重新选择');
                }}
              >
                <Button icon={<UploadOutlined />} loading={avatarUploadSaving}>上传并裁剪</Button>
              </Upload>
            </div>
            <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
              上传后可拖拽调整裁剪区域，缩放选择要显示的部分
            </Text>
          </Space>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          style={{ marginTop: '24px' }}
        >
          <Form.Item
            name="username"
            label={t('username_label')}
            rules={[{ required: true, message: t('username_required_message') }]}
          >
            <Input prefix={<UserOutlined />} size="large" placeholder={t('your_artistic_pseudonym_placeholder')} />
          </Form.Item>

          <Form.Item
            name="email"
            label={t('login_email_label')}
          >
            <Input prefix={<MailOutlined />} size="large" disabled />
          </Form.Item>

          <Paragraph type="secondary" style={{ fontSize: '12px' }}>
            {t('email_cannot_be_modified_note')}
          </Paragraph>

          <Form.Item style={{ marginTop: '32px' }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              {t('save_changes_button')}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title="裁剪头像"
        open={cropOpen}
        onCancel={() => {
          setCropOpen(false);
          setCropImg(null);
          setCropPreviewDataUrl('');
          setCropLoading(false);
        }}
        onOk={uploadCroppedAvatar}
        okText="保存头像"
        cancelText="取消"
        okButtonProps={{ loading: avatarUploadSaving, disabled: !cropImg }}
        destroyOnClose
      >
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                width: cropCanvasSize,
                height: cropCanvasSize,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(0,0,0,0.12)',
                touchAction: 'none',
                position: 'relative',
                overscrollBehavior: 'contain',
              }}
              data-crop-pad="1"
              ref={cropPadRef}
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
              onPointerLeave={onCropPointerUp}
              role="presentation"
            >
              <canvas ref={cropCanvasRef} width={cropCanvasSize} height={cropCanvasSize} style={{ display: 'block' }} />
              <div
                style={{
                  position: 'absolute',
                  inset: 10,
                  borderRadius: 9999,
                  border: '2px solid rgba(255,255,255,0.95)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.22)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Text strong>缩放</Text>
            <div style={{ padding: '6px 0 10px' }}>
              <Slider min={1} max={3} step={0.01} value={cropZoom} onChange={(v) => setCropZoom(Number(v))} />
            </div>
            <Divider style={{ margin: '10px 0' }} />
            <Text strong>预览</Text>
            <div style={{ marginTop: 10 }}>
              <Avatar size={96} src={cropPreviewDataUrl || undefined} icon={<UserOutlined />} />
            </div>
            {cropLoading ? (
              <Text type="secondary" style={{ display: 'block', marginTop: 10 }}>
                正在加载图片…
              </Text>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Profile;
