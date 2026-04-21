import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Upload, Switch, Space, Select, Divider, InputNumber, Row, Col, ColorPicker } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

function isRichTextEmpty(html) {
  if (!html) return true;
  const text = String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '')
    .trim();
  return text.length === 0;
}

const RichTextEditor = ({ value, onChange, placeholder }) => {
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [managePalette, setManagePalette] = useState(false);
  const [newColor, setNewColor] = useState('');

  const saveSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range) return;
    const container = range.commonAncestorContainer;
    if (!container) return;
    if (el.contains(container)) selectionRef.current = range;
  }, []);

  const restoreSelection = useCallback(() => {
    const range = selectionRef.current;
    const sel = window.getSelection ? window.getSelection() : null;
    if (!range || !sel) return;
    try {
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    const next = value || '';
    if (!focused && editorRef.current.innerHTML !== next) {
      editorRef.current.innerHTML = next;
    }
  }, [value, focused]);

  useEffect(() => {
    const handler = () => saveSelection();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [saveSelection]);

  const emit = useCallback(() => {
    if (!editorRef.current) return;
    onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const exec = useCallback(
    (command, arg) => {
      restoreSelection();
      focusEditor();
      const ok = document.execCommand(command, false, arg);
      if (!ok && command === 'hiliteColor') {
        document.execCommand('backColor', false, arg);
      }
      saveSelection();
      emit();
    },
    [emit, focusEditor, restoreSelection, saveSelection]
  );

  const insertLink = useCallback(() => {
    const url = window.prompt('URL');
    if (!url) return;
    exec('createLink', url);
  }, [exec]);

  const currentHtml = value || '';
  const defaultPalette = useMemo(
    () => [
      '#1C1C1C',
      '#2C2C2C',
      '#595959',
      '#8B0000',
      '#722ED1',
      '#1677FF',
      '#13C2C2',
      '#52C41A',
      '#FAAD14',
      '#FA541C',
      '#FFFFFF',
    ],
    []
  );

  const paletteStorageKey = 'vah_richtext_palette_v1';

  const normalizeHex = useCallback((input) => {
    const raw = String(input || '').trim().toUpperCase();
    if (!raw) return null;
    const hex = raw.startsWith('#') ? raw.slice(1) : raw;
    if (/^[0-9A-F]{3}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    if (/^[0-9A-F]{6}$/.test(hex)) return `#${hex}`;
    return null;
  }, []);

  const loadPalette = useCallback(() => {
    try {
      const raw = localStorage.getItem(paletteStorageKey);
      if (!raw) return defaultPalette;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return defaultPalette;
      const cleaned = Array.from(
        new Set(
          arr
            .map((c) => normalizeHex(c))
            .filter(Boolean)
        )
      );
      return cleaned.length ? cleaned : defaultPalette;
    } catch {
      return defaultPalette;
    }
  }, [defaultPalette, normalizeHex]);

  const [palette, setPalette] = useState(() => loadPalette());

  useEffect(() => {
    try {
      localStorage.setItem(paletteStorageKey, JSON.stringify(palette));
    } catch {
      // ignore
    }
  }, [palette]);

  const addSwatch = useCallback(() => {
    const normalized = normalizeHex(newColor);
    if (!normalized) return;
    setPalette((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setNewColor('');
  }, [newColor, normalizeHex]);

  const removeSwatch = useCallback((color) => {
    setPalette((prev) => {
      const next = prev.filter((c) => c !== color);
      return next.length ? next : defaultPalette;
    });
  }, [defaultPalette]);

  const resetPalette = useCallback(() => {
    setPalette(defaultPalette);
    setNewColor('');
  }, [defaultPalette]);

  const SwatchRow = ({ onPick }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button
          size="small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setManagePalette((v) => !v)}
        >
          {managePalette ? '完成' : '管理色块'}
        </Button>
        <ColorPicker
          size="small"
          value={normalizeHex(newColor) || '#1677FF'}
          onChangeComplete={(c) => {
            const hex = typeof c?.toHexString === 'function' ? c.toHexString().toUpperCase() : '';
            setNewColor(hex);
          }}
          showText={false}
        />
        <Input
          size="small"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          placeholder="#RRGGBB"
          style={{ width: 120 }}
          onPressEnter={addSwatch}
        />
        <Button size="small" onClick={addSwatch} disabled={!normalizeHex(newColor)}>
          添加
        </Button>
        <Button size="small" onClick={resetPalette}>
          恢复默认
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 10, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, background: 'rgba(255,255,255,0.8)' }}>
        {palette.map((c) => (
          <div key={c} style={{ position: 'relative' }}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                restoreSelection();
              }}
              onClick={() => onPick(c)}
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                border: c === '#FFFFFF' ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(0,0,0,0.06)',
                background: c,
                cursor: 'pointer',
                boxShadow: '0 8px 18px rgba(58, 78, 102, 0.10)',
                padding: 0,
              }}
            />
            {managePalette ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeSwatch(c);
                }}
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: 'rgba(255,255,255,0.92)',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: '16px',
                  padding: 0,
                }}
                aria-label="remove"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.10)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.75)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><b>B</b></Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><u>U</u></Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')}><span style={{ textDecoration: 'line-through' }}>S</span></Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>•</Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>1.</Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')}>左</Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')}>中</Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')}>右</Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>链接</Button>
        <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>清除</Button>

        <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            e.target.value = '';
            if (v) exec('fontName', v);
          }}
          style={{ height: 28, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', padding: '0 8px', background: 'rgba(255,255,255,0.85)' }}
        >
          <option value="">字体</option>
          <option value="Serif">Serif</option>
          <option value="Sans-Serif">Sans</option>
          <option value="Monospace">Mono</option>
          <option value="Lora">Lora</option>
          <option value="Playfair Display">Playfair</option>
        </select>

        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            e.target.value = '';
            if (v) exec('fontSize', v);
          }}
          style={{ height: 28, borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', padding: '0 8px', background: 'rgba(255,255,255,0.85)' }}
        >
          <option value="">字号</option>
          <option value="2">小</option>
          <option value="3">中</option>
          <option value="5">大</option>
          <option value="6">特大</option>
        </select>

        <Button
          size="small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setColorOpen((v) => !v);
            setBgOpen(false);
          }}
        >
          字色
        </Button>
        <Button
          size="small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setBgOpen((v) => !v);
            setColorOpen(false);
          }}
        >
          底色
        </Button>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(43,42,40,0.52)' }}>
          {(currentHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length || 0).toString()}
        </div>
      </div>

      {colorOpen ? (
        <div style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <SwatchRow
            onPick={(c) => {
              exec('foreColor', c);
              setColorOpen(false);
            }}
          />
        </div>
      ) : null}

      {bgOpen ? (
        <div style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <SwatchRow
            onPick={(c) => {
              exec('hiliteColor', c);
              setBgOpen(false);
            }}
          />
        </div>
      ) : null}

      <div style={{ position: 'relative' }}>
        {isRichTextEmpty(currentHtml) ? (
          <div style={{ position: 'absolute', inset: 0, padding: 16, color: 'rgba(43,42,40,0.42)', pointerEvents: 'none' }}>
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onFocus={() => {
            setFocused(true);
            saveSelection();
          }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={() => {
            setFocused(false);
            saveSelection();
            emit();
          }}
          style={{ minHeight: 260, padding: 16, outline: 'none', lineHeight: 1.9 }}
        />
      </div>
    </div>
  );
};

const UploadArt = () => {
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [galleries, setGalleries] = useState([]);
  const [artType, setArtType] = useState('photography');
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialGalleryId = queryParams.get('galleryId');
  const { t } = useTranslation();

  useEffect(() => {
    const fetchGalleries = async () => {
      try {
        const res = await axios.get(apiUrl('/galleries/my-galleries'), {
          headers: { 'x-auth-token': localStorage.getItem('token') }
        });
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
        setGalleries(list);
      } catch (err) {
        console.error(err);
      }
    };
    fetchGalleries();
  }, []);

  const requiresFile = artType !== 'literature';
  const allowsMulti = artType === 'object';

  const onFinish = async (values) => {
    if (requiresFile && fileList.length === 0) {
      return message.error(t('select_art_file_required'));
    }
    if (artType === 'literature' && isRichTextEmpty(values.textContent)) {
      return message.error(t('text_content_required'));
    }

    const formData = new FormData();
    if (requiresFile) {
      if (allowsMulti) {
        fileList.forEach((f) => formData.append('artPiece', f));
      } else {
        formData.append('artPiece', fileList[0]);
      }
    }
    formData.append('title', values.title);
    formData.append('description', values.description || '');
    formData.append('allowDownload', values.allowDownload || false);
    formData.append('artType', artType);
    if (artType === 'literature') {
      formData.append('textContent', values.textContent || '');
      formData.append('seriesTitle', values.seriesTitle || '');
      formData.append('episodeTitle', values.episodeTitle || '');
      if (values.episodeNumber !== undefined && values.episodeNumber !== null && values.episodeNumber !== '') {
        formData.append('episodeNumber', String(values.episodeNumber));
      }
    }
    if (values.galleryId) {
      formData.append('galleryId', values.galleryId);
    }

    setLoading(true);
    try {
      const res = await axios.post(apiUrl('/artpieces'), formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'x-auth-token': localStorage.getItem('token') }
      });
      message.success(t('upload_success_admin_review'));
      const targetGalleryId = res.data?.galleryId || values.galleryId;
      if (targetGalleryId) {
        navigate(`/my-gallery/${targetGalleryId}`);
      } else {
        navigate('/my-gallery');
      }
    } catch (err) {
      message.error(err.response?.data?.msg || t('upload_failed_retry'));
    }
    setLoading(false);
  };

  const uploadAccept = useMemo(() => {
    if (artType === 'video') return 'video/*';
    if (artType === 'object') return 'image/*';
    if (artType === 'painting') return 'image/*';
    if (artType === 'calligraphy') return 'image/*';
    if (artType === 'photography') return 'image/*';
    return '*';
  }, [artType]);

  const uploadProps = {
    onRemove: (file) => {
      setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
    },
    beforeUpload: (file) => {
      if (allowsMulti) {
        setFileList((prev) => [...prev, file]);
      } else {
        setFileList([file]);
      }
      return false; // Prevent auto upload
    },
    fileList,
    multiple: allowsMulti,
    accept: uploadAccept
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0' }}>
      <Card style={{ width: '100%', maxWidth: 700, padding: '20px', margin: '0 16px' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: '8px', color: '#1c1c1c' }}>{t('upload_art_title')}</Title>
        <Paragraph style={{ textAlign: 'center', color: '#595959', marginBottom: '48px', fontStyle: 'italic' }}>
          {t('art_quote')}
        </Paragraph>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ allowDownload: false, galleryId: initialGalleryId }}>
          <Form.Item
            name="artType"
            label={<Text strong>{t('artwork_type')}</Text>}
            rules={[{ required: true, message: t('select_artwork_type_required') }]}
            initialValue="photography"
          >
            <Select
              size="large"
              value={artType}
              onChange={(v) => {
                setArtType(v);
                setFileList([]);
              }}
            >
              <Option value="photography">{t('artwork_type_photography')}</Option>
              <Option value="painting">{t('artwork_type_painting')}</Option>
              <Option value="calligraphy">{t('artwork_type_calligraphy')}</Option>
              <Option value="video">{t('artwork_type_video')}</Option>
              <Option value="literature">{t('artwork_type_literature')}</Option>
              <Option value="object">{t('artwork_type_object')}</Option>
            </Select>
          </Form.Item>

          {artType !== 'literature' ? (
            <Form.Item
              label={<Text strong>{t('select_art_file')}</Text>}
              required
              extra={artType === 'object' ? t('multi_images_hint') : undefined}
            >
              <Upload {...uploadProps} listType={artType === 'video' ? 'text' : 'picture'}>
                <Button icon={<UploadOutlined />} size="large" style={{ width: '100%', height: '100px', borderStyle: 'dashed' }}>
                  {t('click_or_drag_to_upload')}
                </Button>
              </Upload>
            </Form.Item>
          ) : (
            <>
              <Divider />
              <Form.Item
                name="textContent"
                label={<Text strong>{t('literature_content')}</Text>}
                valuePropName="value"
                getValueFromEvent={(v) => v}
                rules={[
                  {
                    validator: async (_, v) => {
                      if (isRichTextEmpty(v)) throw new Error(t('text_content_required'));
                    }
                  }
                ]}
              >
                <RichTextEditor placeholder={t('literature_content_placeholder')} />
              </Form.Item>
              <Divider />
              <Form.Item
                name="seriesTitle"
                label={<Text strong>{t('series_title')}</Text>}
                rules={[
                  { required: true, message: t('series_title_required') },
                  { max: 20, message: t('series_title_max') },
                ]}
              >
                <Input size="large" maxLength={20} showCount placeholder={t('series_title_placeholder')} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="episodeNumber" label={<Text strong>{t('episode_number')}</Text>}>
                    <InputNumber min={1} style={{ width: '100%' }} size="large" placeholder="1" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="episodeTitle" label={<Text strong>{t('episode_title')}</Text>}>
                    <Input size="large" placeholder={t('episode_title_placeholder')} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {artType !== 'literature' ? (
            <Form.Item name="galleryId" label={<Text strong>{t('belonging_gallery')}</Text>} rules={[{ required: true, message: t('select_gallery_required') }]}>
              <Select size="large" placeholder={t('select_art_space_placeholder')}>
                {galleries.map(g => (
                  <Option key={g.id} value={g.id.toString()}>{g.name}</Option>
                ))}
              </Select>
            </Form.Item>
          ) : null}
          <Form.Item name="title" label={<Text strong>{t('art_title_label')}</Text>} rules={[{ required: true, message: t('art_title_required') }]}>
            <Input size="large" placeholder={t('enter_art_title_placeholder')} />
          </Form.Item>
          <Form.Item name="description" label={<Text strong>{t('art_description_label')}</Text>}>
            <TextArea rows={5} placeholder={t('describe_inspiration_placeholder')} />
          </Form.Item>
          <Form.Item name="allowDownload" label={<Text strong>{t('copyright_protection_options')}</Text>} valuePropName="checked">
            <div style={{ backgroundColor: '#fffdf9', padding: '20px', border: '1px solid #f0f0f0' }}>
              <Space direction="vertical" size="small">
                <Space>
                  <Switch />
                  <Text>{t('open_original_download')}</Text>
                </Space>
                <Paragraph type="secondary" style={{ fontSize: '13px', margin: 0 }}>
                  {t('watermark_note')}
                </Paragraph>
              </Space>
            </div>
          </Form.Item>
          <Form.Item style={{ marginTop: '40px' }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: '60px', fontSize: '18px', letterSpacing: '2px' }}>
              {t('submit_for_review')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default UploadArt;
