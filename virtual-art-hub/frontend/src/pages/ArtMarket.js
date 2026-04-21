import React, { useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import {
  Row,
  Col,
  Card,
  Empty,
  Spin,
  Typography,
  Button,
  Space,
  message,
  InputNumber,
  Modal,
  Form,
  List,
  Drawer,
  Badge,
  Input,
  Select,
  Pagination,
} from 'antd';
import { ShoppingCartOutlined, UserOutlined, PlusOutlined, MessageOutlined, DeleteOutlined, PayCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl, socketOrigin } from '../apiBase';

const { Title, Text } = Typography;
const { Search } = Input;

function useDebouncedValue(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { headers: { 'x-auth-token': token } } : {};
}

const ArtMarket = () => {
  const { user } = useContext(AuthContext);
  const [listings, setListings] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const debouncedQ = useDebouncedValue(searchInput.trim(), 400);
  const skipSearchPageReset = useRef(true);
  const [listRefreshNonce, setListRefreshNonce] = useState(0);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [imageModal, setImageModal] = useState({ open: false, src: '' });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [myArtPieces, setMyArtPieces] = useState([]);
  const [selectedArtId, setSelectedArtId] = useState(null);
  const [form] = Form.useForm();
  const { t } = useTranslation();

  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [cartLoading, setCartLoading] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatListing, setChatListing] = useState(null);
  const [chatPeerId, setChatPeerId] = useState(null);
  const [chatPeerOptions, setChatPeerOptions] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoadingHistory, setChatLoadingHistory] = useState(false);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [chatNextBeforeId, setChatNextBeforeId] = useState(null);
  const seenMsgIdsRef = useRef(new Set());
  const socketRef = useRef(null);
  const activeMarketRoomRef = useRef(null);

  const fetchListings = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await axios.get(apiUrl('/market/listings'), {
        params: {
          page,
          pageSize,
          ...(debouncedQ ? { q: debouncedQ } : {}),
        },
      });
      const d = res.data;
      let items = [];
      let tot = 0;
      if (Array.isArray(d)) {
        items = d;
        tot = d.length;
      } else if (d && Array.isArray(d.items)) {
        items = d.items;
        const n = Number(d.total);
        tot = Number.isFinite(n) ? n : items.length;
      }
      setListings(items);
      setTotal(tot);
    } catch (err) {
      console.error(err);
      message.error(t('market_listings_load_fail'));
      setListings([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [t, page, pageSize, debouncedQ, listRefreshNonce]);

  useEffect(() => {
    if (skipSearchPageReset.current) {
      skipSearchPageReset.current = false;
      return;
    }
    setPage(1);
  }, [debouncedQ]);

  const fetchCart = useCallback(async () => {
    if (!user) {
      setCartItems([]);
      return;
    }
    setCartLoading(true);
    try {
      const res = await axios.get(apiUrl('/market/cart'), authHeaders());
      setCartItems(res.data || []);
    } catch {
      setCartItems([]);
    } finally {
      setCartLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const cartCount = cartItems.length;

  const marketRoom = useMemo(() => {
    if (!chatListing || !user || !chatPeerId) return null;
    const a = user.id;
    const b = chatPeerId;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return `market_${chatListing.id}_${lo}_${hi}`;
  }, [chatListing, user, chatPeerId]);

  useEffect(() => {
    activeMarketRoomRef.current = marketRoom;
  }, [marketRoom]);

  useEffect(() => {
    if (!user || !chatOpen || !chatListing?.id || !chatPeerId) {
      if (socketRef.current) {
        socketRef.current.emit('leave_market_chat');
        socketRef.current.close();
        socketRef.current = null;
      }
      return undefined;
    }

    const s = io(socketOrigin());
    socketRef.current = s;

    s.on('connect', () => {
      s.emit(
        'join_market_chat',
        { listingId: chatListing.id, userId: user.id, peerId: chatPeerId, username: user.username },
        (ack) => {
          if (!ack?.ok) message.warning(t('market_chat_join_fail'));
        }
      );
    });

    s.on('receive_market_message', (data) => {
      const room = data?.room ? String(data.room) : '';
      if (!room || (activeMarketRoomRef.current && room !== activeMarketRoomRef.current)) return;
      const mid = data?.messageId != null ? Number(data.messageId) : null;
      if (Number.isFinite(mid) && seenMsgIdsRef.current.has(String(mid))) return;
      if (Number.isFinite(mid)) seenMsgIdsRef.current.add(String(mid));
      setChatMessages((prev) => [
        ...prev,
        {
          messageId: mid,
          message: String(data?.message || ''),
          sender: String(data?.sender || ''),
          senderId: data?.senderId,
          createdAt: data?.createdAt,
          time: data?.time,
        },
      ]);
    });

    return () => {
      s.emit('leave_market_chat');
      s.close();
      socketRef.current = null;
    };
  }, [user, chatOpen, chatListing?.id, chatPeerId, t]);

  const loadChatHistory = async ({ prepend, beforeOverride } = {}) => {
    if (!user || !chatListing || !chatPeerId) return;
    setChatLoadingHistory(true);
    try {
      const params = { limit: 40 };
      if (prepend) {
        const b = beforeOverride ?? chatNextBeforeId;
        if (b) params.beforeId = b;
      }
      const res = await axios.get(apiUrl(`/market/listings/${chatListing.id}/chat/${chatPeerId}/messages`), {
        ...authHeaders(),
        params,
      });
      const raw = res.data?.items || [];
      const items = raw.map((m) => ({
        messageId: m.id,
        message: m.message || '',
        sender: m.sender || '',
        senderId: m.senderId,
        createdAt: m.createdAt,
      }));
      items.forEach((m) => {
        if (m.messageId != null) seenMsgIdsRef.current.add(String(m.messageId));
      });
      if (prepend) {
        setChatMessages((prev) => [...items, ...prev]);
      } else {
        setChatMessages(items);
      }
      setChatHasMore(Boolean(res.data?.hasMore));
      setChatNextBeforeId(res.data?.nextCursor?.beforeId ?? null);
    } catch {
      message.error(t('market_chat_history_fail'));
    } finally {
      setChatLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!chatOpen || !chatListing || !chatPeerId) return;
    seenMsgIdsRef.current.clear();
    setChatMessages([]);
    setChatNextBeforeId(null);
    loadChatHistory({ prepend: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when thread changes
  }, [chatOpen, chatListing?.id, chatPeerId]);

  const openChatAsBuyer = (listing) => {
    if (!user) {
      message.warning(t('login_first'));
      return;
    }
    if (listing.sellerId === user.id) {
      message.info(t('market_chat_seller_hint'));
      return;
    }
    setChatListing(listing);
    setChatPeerId(listing.sellerId);
    setChatPeerOptions([]);
    setChatOpen(true);
  };

  const openChatAsSeller = async (listing) => {
    if (!user || listing.sellerId !== user.id) return;
    setChatListing(listing);
    try {
      const res = await axios.get(apiUrl(`/market/listings/${listing.id}/message-peers`), authHeaders());
      const opts = res.data || [];
      setChatPeerOptions(opts);
      if (opts.length === 1) setChatPeerId(opts[0].id);
      else setChatPeerId(null);
      setChatOpen(true);
    } catch {
      message.error(t('market_peers_load_fail'));
    }
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !socketRef.current || !user || !chatListing || !chatPeerId) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setChatMessages((prev) => [
      ...prev,
      { clientId, message: text, sender: user.username, senderId: user.id, time, status: 'pending' },
    ]);
    setChatInput('');
    socketRef.current.timeout(8000).emit(
      'send_market_message',
      { listingId: chatListing.id, peerId: chatPeerId, message: text, clientId, time },
      (err, resp) => {
        if (err || !resp?.ok) {
          message.error(t('market_chat_send_fail'));
          setChatMessages((prev) => prev.filter((m) => m.clientId !== clientId));
          return;
        }
        if (resp?.messageId != null) seenMsgIdsRef.current.add(String(resp.messageId));
        setChatMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId
              ? { ...m, status: 'sent', messageId: resp.messageId, createdAt: resp.createdAt }
              : m
          )
        );
      }
    );
  };

  const addToCart = async (listingId) => {
    if (!user) return message.warning(t('login_first'));
    try {
      await axios.post(apiUrl(`/market/cart/${listingId}`), {}, authHeaders());
      message.success(t('market_added_to_cart'));
      fetchCart();
    } catch (err) {
      message.error(err.response?.data?.msg || t('market_cart_add_fail'));
    }
  };

  const buyNow = async (listingId) => {
    if (!user) return message.warning(t('login_first'));
    try {
      await axios.post(apiUrl(`/market/listings/${listingId}/buy`), {}, authHeaders());
      message.success(t('market_buy_success'));
      fetchListings();
      fetchCart();
    } catch (err) {
      message.error(err.response?.data?.msg || t('market_buy_fail'));
    }
  };

  const checkoutCart = async () => {
    if (!user) return;
    try {
      await axios.post(apiUrl('/market/cart/checkout'), {}, authHeaders());
      message.success(t('market_checkout_success'));
      setCartOpen(false);
      fetchListings();
      fetchCart();
    } catch (err) {
      message.error(err.response?.data?.msg || t('market_checkout_fail'));
    }
  };

  const removeFromCart = async (listingId) => {
    try {
      await axios.delete(apiUrl(`/market/cart/${listingId}`), authHeaders());
      fetchCart();
    } catch {
      message.error(t('market_cart_remove_fail'));
    }
  };

  const publishListing = async (values) => {
    try {
      await axios.post(
        apiUrl('/market/listings'),
        { artPieceId: values.artPieceId, price: values.price },
        authHeaders()
      );
      message.success(t('market_listing_created'));
      setListModalOpen(false);
      form.resetFields();
      setSearchInput('');
      setPage(1);
      setListRefreshNonce((n) => n + 1);
    } catch (err) {
      message.error(err.response?.data?.msg || t('market_listing_create_fail'));
    }
  };

  const openListModal = async () => {
    if (!user) return message.warning(t('login_first'));
    try {
      const res = await axios.get(apiUrl('/artpieces/my-art'), authHeaders());
      setMyArtPieces((res.data || []).filter((a) => a.status === 'approved'));
      setListModalOpen(true);
    } catch {
      message.error(t('cannot_get_your_artworks'));
    }
  };

  return (
    <div className="art-market-page">
      <header className="galleries-hub-header">
        <div className="galleries-hub-header-inner">
          <div className="galleries-hub-titleblock">
            <Title level={2} className="galleries-hub-title">
              {t('art_market_title')}
            </Title>
            <Text type="secondary" className="galleries-hub-subtitle">
              {t('art_market_description')}
            </Text>
          </div>
          <div className="galleries-hub-search">
            <Search
              size="large"
              placeholder={t('market_search_placeholder')}
              allowClear
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      </header>

      <div className="art-market-toolbar">
        <Space wrap>
          <Badge count={cartCount} offset={[-4, 4]}>
            <Button
              size="large"
              className="elegant-btn art-market-cart-btn"
              icon={<ShoppingCartOutlined />}
              onClick={() => setCartOpen(true)}
              disabled={!user}
            >
              {t('market_cart')}
            </Button>
          </Badge>
          <Button type="primary" size="large" className="elegant-btn" icon={<PlusOutlined />} onClick={openListModal}>
            {t('market_publish_listing')}
          </Button>
        </Space>
      </div>

      {total > 0 ? (
        <div className="art-market-summary-bar">
          <Text type="secondary" className="art-market-summary-text">
            {t('market_listings_summary', { count: total })}
          </Text>
        </div>
      ) : null}

      <div className="art-market-list-wrap">
        <Spin spinning={listLoading}>
          {total === 0 && !listLoading ? (
            <Empty
              className="art-market-empty"
              description={debouncedQ ? t('market_no_match') : t('market_no_listings')}
            />
          ) : total > 0 ? (
            <Row gutter={[20, 20]} className="art-market-grid">
              {listings.map((listing) => (
                <Col xs={24} sm={12} md={12} lg={8} xl={6} key={listing.id}>
                  <Card
                    hoverable
                    className="art-market-card"
                    cover={
                      <div
                        className="art-market-card-cover"
                        onClick={() => {
                          setImageModal({ open: true, src: apiUrl(`/artpieces/preview/${listing.artPieceId}`) });
                          setZoomLevel(1);
                        }}
                      >
                        <img
                          alt={listing.artPiece?.title || ''}
                          src={apiUrl(`/artpieces/preview/${listing.artPieceId}`)}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          draggable={false}
                        />
                      </div>
                    }
                  >
                    <Title level={5} ellipsis={{ rows: 2 }} className="art-market-card-title">
                      {listing.artPiece?.title}
                    </Title>

                    <div className="art-market-card-meta">
                      <div className="art-market-card-meta-seller">
                        <div className="art-market-card-meta-label">{t('market_seller_label')}</div>
                        <Space size={6}>
                          <UserOutlined style={{ color: '#b8956a' }} />
                          <Text strong ellipsis style={{ maxWidth: '100%' }}>
                            {listing.seller?.username}
                          </Text>
                        </Space>
                      </div>
                      <div className="art-market-card-price">
                        <div className="art-market-card-meta-label art-market-card-meta-label--tight">
                          {t('market_price_label_short')}
                        </div>
                        <Text strong className="art-market-card-price-value">
                          ¥{Number(listing.price).toFixed(2)}
                        </Text>
                      </div>
                    </div>

                    {user && user.id === listing.sellerId ? (
                      <div className="art-market-card-actions">
                        <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.5 }}>
                          {t('market_your_listing_badge')}
                        </Text>
                        <Button block size="large" icon={<MessageOutlined />} className="elegant-btn" onClick={() => openChatAsSeller(listing)}>
                          {t('market_seller_messages')}
                        </Button>
                        <Link to={`/artpiece/${listing.artPieceId}?src=market`} className="art-market-card-link">
                          <Button block>{t('view_art_detail_button')}</Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="art-market-card-actions">
                        <Row gutter={[10, 10]}>
                          <Col xs={24} sm={12}>
                            <Button
                              block
                              size="large"
                              icon={<ShoppingCartOutlined />}
                              onClick={() => addToCart(listing.id)}
                              disabled={!user}
                            >
                              {t('market_add_cart')}
                            </Button>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Button
                              block
                              size="large"
                              type="primary"
                              className="elegant-btn"
                              icon={<PayCircleOutlined />}
                              onClick={() => buyNow(listing.id)}
                              disabled={!user}
                            >
                              {t('market_buy_now')}
                            </Button>
                          </Col>
                        </Row>
                        <Button block size="large" icon={<MessageOutlined />} onClick={() => openChatAsBuyer(listing)} disabled={!user}>
                          {t('market_contact_seller')}
                        </Button>
                        <Link to={`/artpiece/${listing.artPieceId}?src=market`} className="art-market-card-link">
                          <Button block type="default" className="elegant-btn">
                            {t('view_art_detail_button')}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <div className="art-market-spin-placeholder" aria-hidden />
          )}
        </Spin>
      </div>

      {total > 0 ? (
        <div className="art-market-pagination-wrap">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[12, 24, 48]}
            disabled={listLoading}
            showTotal={(n, range) => t('market_pagination_total', { from: range[0], to: range[1], total: n })}
            onChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
          />
        </div>
      ) : null}

      <Modal
        title={<Title level={3} className="art-market-modal-title">{t('market_publish_modal_title')}</Title>}
        open={listModalOpen}
        onCancel={() => setListModalOpen(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={publishListing} className="art-market-publish-form">
          <Form.Item name="artPieceId" label={<Text strong>{t('select_artwork_label')}</Text>} rules={[{ required: true, message: t('market_select_artwork') }]}>
            <div className="art-market-publish-art-list">
              <List
                dataSource={myArtPieces}
                renderItem={(item) => (
                  <List.Item
                    onClick={() => {
                      setSelectedArtId(item.id);
                      form.setFieldsValue({ artPieceId: item.id });
                    }}
                    style={{
                      cursor: 'pointer',
                      padding: '12px',
                      border: selectedArtId === item.id ? '2px solid #c5a059' : '1px solid transparent',
                      backgroundColor: selectedArtId === item.id ? '#fffdf9' : 'transparent',
                      marginBottom: '8px',
                      transition: 'all 0.3s',
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <img
                          src={apiUrl(`/artpieces/preview/${item.id}`)}
                          width={60}
                          height={60}
                          style={{ objectFit: 'cover', border: '1px solid #ddd' }}
                          alt={item.title}
                        />
                      }
                      title={<Text strong={selectedArtId === item.id}>{item.title}</Text>}
                    />
                  </List.Item>
                )}
              />
            </div>
          </Form.Item>
          <Form.Item name="price" label={<Text strong>{t('market_price_label')}</Text>} rules={[{ required: true, message: t('market_price_required') }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item className="art-market-publish-submit">
            <Button type="primary" htmlType="submit" block size="large">
              {t('market_submit_listing')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={t('market_cart')}
        placement="right"
        onClose={() => setCartOpen(false)}
        open={cartOpen}
        width={420}
        styles={{ body: { padding: '16px 20px 24px' } }}
      >
        {cartLoading ? (
          <Spin />
        ) : cartItems.length === 0 ? (
          <Empty description={t('market_cart_empty')} />
        ) : (
          <>
            <List
              dataSource={cartItems}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button type="link" danger icon={<DeleteOutlined />} onClick={() => removeFromCart(row.listingId)} key="del" />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <img
                        src={apiUrl(`/artpieces/preview/${row.listing?.artPieceId}`)}
                        width={56}
                        height={56}
                        style={{ objectFit: 'cover' }}
                        alt=""
                      />
                    }
                    title={row.listing?.artPiece?.title}
                    description={`¥${Number(row.listing?.price || 0).toFixed(2)} · ${row.listing?.seller?.username || ''}`}
                  />
                </List.Item>
              )}
            />
            <Button type="primary" block size="large" className="elegant-btn art-market-cart-checkout" icon={<PayCircleOutlined />} onClick={checkoutCart}>
              {t('market_checkout')}
            </Button>
          </>
        )}
      </Drawer>

      <Drawer
        title={t('market_chat_title')}
        placement="right"
        onClose={() => {
          setChatOpen(false);
          setChatListing(null);
          setChatPeerId(null);
        }}
        open={chatOpen}
        width={440}
        destroyOnClose
        styles={{ body: { padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', minHeight: '50vh' } }}
      >
        {chatListing && user?.id === chatListing.sellerId && chatPeerOptions.length > 1 && (
          <div className="art-market-chat-peer">
            <Text type="secondary">{t('market_select_peer')}：</Text>
            <Select
              className="art-market-chat-peer-select"
              placeholder={t('market_select_peer')}
              options={chatPeerOptions.map((p) => ({ value: p.id, label: p.username }))}
              value={chatPeerId}
              onChange={(v) => setChatPeerId(v)}
            />
          </div>
        )}
        {chatListing && user?.id === chatListing.sellerId && chatPeerOptions.length === 0 && (
          <Empty description={t('market_no_peer_messages')} className="art-market-chat-empty" />
        )}
        <div className="art-market-chat-log">
          {chatHasMore && (
            <Button
              type="link"
              size="small"
              loading={chatLoadingHistory}
              onClick={() => {
                const oldest = chatMessages[0];
                const beforeOverride = oldest?.messageId ?? oldest?.id;
                loadChatHistory({ prepend: true, beforeOverride });
              }}
              block
              style={{ marginBottom: 8 }}
            >
              {t('market_load_more_messages')}
            </Button>
          )}
          {chatMessages.map((m, idx) => (
            <div
              key={m.clientId || m.messageId || `${idx}`}
              style={{
                marginBottom: 10,
                textAlign: m.senderId === user?.id ? 'right' : 'left',
              }}
            >
              <div style={{ fontSize: 12, color: '#888' }}>{m.sender}</div>
              <div
                style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: m.senderId === user?.id ? '#c5a05922' : '#f0f0f0',
                  maxWidth: '90%',
                  wordBreak: 'break-word',
                }}
              >
                {m.message}
              </div>
            </div>
          ))}
        </div>
        <Space.Compact className="art-market-chat-compose">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onPressEnter={sendChat}
            placeholder={t('market_chat_placeholder')}
            disabled={!chatPeerId}
          />
          <Button type="primary" onClick={sendChat} disabled={!chatPeerId}>
            {t('market_chat_send')}
          </Button>
        </Space.Compact>
      </Drawer>

      <Modal
        open={imageModal.open}
        title={t('artwork_preview_title')}
        onCancel={() => setImageModal({ open: false, src: '' })}
        footer={null}
        width="80vw"
        centered
        bodyStyle={{ display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
      >
        <div
          onWheel={(e) => {
            e.preventDefault();
            const scaleAmount = 0.1;
            if (e.deltaY < 0) setZoomLevel((prev) => Math.min(prev + scaleAmount, 5));
            else setZoomLevel((prev) => Math.max(prev - scaleAmount, 0.5));
          }}
          style={{ overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}
        >
          <img
            alt=""
            src={imageModal.src}
            style={{
              transform: `scale(${zoomLevel})`,
              transition: 'transform 0.1s ease-out',
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ArtMarket;
