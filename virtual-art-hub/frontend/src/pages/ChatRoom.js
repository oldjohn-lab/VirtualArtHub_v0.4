import React, { useState, useEffect, useContext, useMemo, useRef, useLayoutEffect } from 'react';
import { Card, Input, Button, List, Typography, Space, message, Badge, Pagination, Empty, Spin, Popover, Rate, Dropdown, Modal, Avatar } from 'antd';
import { ArrowLeftOutlined, SendOutlined, MessageOutlined, SmileOutlined, LoadingOutlined, ExclamationCircleFilled, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { apiUrl, socketOrigin } from '../apiBase';
import '../styles/chat-wechat.css';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

const ChatRoom = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [roomJoined, setRoomJoined] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);

  const [galleryQuery, setGalleryQuery] = useState('');
  const [galleriesLoading, setGalleriesLoading] = useState(true);
  const [galleries, setGalleries] = useState([]);
  const [galleriesTotal, setGalleriesTotal] = useState(0);
  const [galleriesPage, setGalleriesPage] = useState(1);
  const [galleriesPageSize, setGalleriesPageSize] = useState(10);

  const [activeGallery, setActiveGallery] = useState(null);
  const activeRoom = useMemo(() => (activeGallery?.id ? `gallery_${activeGallery.id}` : null), [activeGallery]);
  const activeRoomRef = useRef(null);

  const [activeGalleryInfo, setActiveGalleryInfo] = useState(null);
  const [artItems, setArtItems] = useState([]);
  const [artTotal, setArtTotal] = useState(0);
  const [artPage, setArtPage] = useState(1);
  const [artPageSize] = useState(10);
  const [artLoading, setArtLoading] = useState(false);
  const [artLoadingMore, setArtLoadingMore] = useState(false);
  const [artHasMore, setArtHasMore] = useState(true);
  const sideScrollRef = useRef(null);

  const [roomUsers, setRoomUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArt, setPreviewArt] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesWrapRef = useRef(null);
  const inputRef = useRef(null);
  const longPressRef = useRef({ timer: null, text: '' });
  const seenClientIdsRef = useRef(new Set());
  const seenMessageIdsRef = useRef(new Set());
  const ackTimersRef = useRef(new Map());
  const outboxRef = useRef(new Map());
  const historyCursorRef = useRef(null);
  const historyLoadedForGalleryRef = useRef(null);
  const historyLoadingRef = useRef(false);
  const historyHasMoreRef = useRef(true);
  const isPrependingRef = useRef(false);
  const pendingScrollAdjustRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(true);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    historyLoadingRef.current = historyLoading;
  }, [historyLoading]);

  useEffect(() => {
    historyHasMoreRef.current = historyHasMore;
  }, [historyHasMore]);

  useEffect(() => {
    if (!activeGallery?.id) return;
    setActiveGalleryInfo(null);
    axios
      .get(apiUrl(`/galleries/${activeGallery.id}`), { params: { includeArtPieces: 0 } })
      .then((res) => setActiveGalleryInfo(res.data))
      .catch(() => setActiveGalleryInfo(null));
  }, [activeGallery?.id]);

  const fetchArtPage = async ({ page, append }) => {
    if (!activeGallery?.id) return;
    if (artLoading || artLoadingMore) return;

    if (!append) setArtLoading(true);
    else setArtLoadingMore(true);
    try {
      const res = await axios.get(apiUrl(`/galleries/${activeGallery.id}/artpieces`), {
        params: { page, pageSize: artPageSize },
      });
      const list = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
      const total = Number(res.data?.total) || 0;
      setArtTotal(total);
      setArtItems((prev) => {
        const next = append ? [...prev, ...list] : list;
        const loaded = next.length;
        setArtHasMore(total ? loaded < total : list.length >= artPageSize);
        setArtPage(page + 1);
        return next;
      });
    } catch {
      setArtHasMore(false);
    } finally {
      setArtLoading(false);
      setArtLoadingMore(false);
    }
  };

  const fetchMoreArt = async () => {
    if (!activeGallery?.id) return;
    if (!artHasMore) return;
    await fetchArtPage({ page: artPage, append: artPage > 1 });
  };

  useEffect(() => {
    if (!activeGallery?.id) return;
    setArtItems([]);
    setArtTotal(0);
    setArtPage(1);
    setArtHasMore(true);
    setArtLoading(false);
    setArtLoadingMore(false);
    requestAnimationFrame(() => fetchArtPage({ page: 1, append: false }));
  }, [activeGallery?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when gallery changes

  useEffect(() => {
    if (!user) {
      message.info('请先登录后加入交流中心');
      return;
    }

    const newSocket = io(socketOrigin());
    setSocket(newSocket);
    setSocketConnected(Boolean(newSocket.connected));

    newSocket.on('connect', () => setSocketConnected(true));
    newSocket.on('disconnect', () => {
      setSocketConnected(false);
      setRoomJoined(false);
      setJoinFailed(false);
    });

    newSocket.on('receive_gallery_message', (data) => {
      if (!data?.room) return;
      if (activeRoomRef.current && data.room !== activeRoomRef.current) return;
      const clientId = data?.clientId ? String(data.clientId) : '';
      const messageId = data?.messageId != null ? Number(data.messageId) : null;
      const createdAt = data?.createdAt ? String(data.createdAt) : null;
      if (clientId) {
        const timer = ackTimersRef.current.get(clientId);
        if (timer) {
          clearTimeout(timer);
          ackTimersRef.current.delete(clientId);
        }
      }
      setMessages((prev) => {
        if (Number.isFinite(messageId) && seenMessageIdsRef.current.has(String(messageId))) return prev;
        if (clientId) {
          const idx = prev.findIndex((m) => String(m.clientId || '') === clientId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              room: data.room,
              clientId,
              message: data?.message ? String(data.message) : '',
              sender: data?.sender ? String(data.sender) : next[idx].sender,
              senderId: data?.senderId ?? next[idx].senderId,
              time: data?.time ?? next[idx].time,
              messageId: Number.isFinite(messageId) ? messageId : next[idx].messageId,
              createdAt: createdAt || next[idx].createdAt,
              status: 'sent',
            };
            if (Number.isFinite(messageId)) seenMessageIdsRef.current.add(String(messageId));
            return next;
          }
          if (seenClientIdsRef.current.has(clientId)) return prev;
          seenClientIdsRef.current.add(clientId);
        }
        if (Number.isFinite(messageId)) seenMessageIdsRef.current.add(String(messageId));
        return [
          ...prev,
          {
            room: data.room,
            clientId: clientId || undefined,
            messageId: Number.isFinite(messageId) ? messageId : undefined,
            createdAt: createdAt || undefined,
            message: data?.message ? String(data.message) : '',
            sender: data?.sender ? String(data.sender) : 'Anonymous',
            senderId: data?.senderId,
            time: data?.time,
            status: 'sent',
          },
        ];
      });
    });

    newSocket.on('receive_message', (data) => {
      const room = data?.room ? String(data.room) : '';
      if (!room) return;
      if (activeRoomRef.current && room !== activeRoomRef.current) return;
      const clientId = data?.clientId ? String(data.clientId) : '';
      if (clientId) {
        const timer = ackTimersRef.current.get(clientId);
        if (timer) {
          clearTimeout(timer);
          ackTimersRef.current.delete(clientId);
        }
      }
      setMessages((prev) => {
        if (clientId) {
          const idx = prev.findIndex((m) => String(m.clientId || '') === clientId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              room,
              clientId,
              message: data?.message ? String(data.message) : next[idx].message,
              sender: data?.sender ? String(data.sender) : next[idx].sender,
              senderId: data?.senderId ?? next[idx].senderId,
              time: data?.time ?? next[idx].time,
              status: 'sent',
            };
            return next;
          }
          if (seenClientIdsRef.current.has(clientId)) return prev;
          seenClientIdsRef.current.add(clientId);
        }
        return [
          ...prev,
          {
            room,
            clientId: clientId || undefined,
            message: data?.message ? String(data.message) : '',
            sender: data?.sender ? String(data.sender) : 'Anonymous',
            senderId: data?.senderId,
            time: data?.time,
            status: 'sent',
          },
        ];
      });
    });

    newSocket.on('room_users', (payload) => {
      if (!payload?.room) return;
      if (activeRoomRef.current && payload.room !== activeRoomRef.current) return;
      setRoomUsers(Array.isArray(payload.users) ? payload.users : []);
      setRoomJoined(true);
      setJoinFailed(false);
    });

    const timers = ackTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      newSocket.close();
    };
  }, [user]);

  useEffect(() => {
    if (!socket || !socketConnected) return undefined;
    if (!user || !activeGallery) return undefined;
    if (roomJoined) return undefined;

    const room = `gallery_${activeGallery.id}`;
    let tries = 0;
    setJoinFailed(false);

    const attemptJoin = () => {
      if (!socketConnected) return;
      if (activeRoomRef.current !== room) return;
      if (roomJoined) return;
      tries += 1;
      socket.emit('join_gallery', { galleryId: activeGallery.id, userId: user.id, username: user.username });
      socket.emit('join_chat', room);
    };

    attemptJoin();
    const intervalId = setInterval(() => {
      if (roomJoined) return;
      if (tries >= 5) return;
      attemptJoin();
    }, 1600);

    const timeoutId = setTimeout(() => {
      if (!roomJoined && activeRoomRef.current === room) {
        setJoinFailed(true);
      }
    }, 9000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [socket, socketConnected, user, activeGallery, roomJoined]);

  useEffect(() => {
    if (!socketConnected || !roomJoined) return;
    setMessages((prev) => {
      const mineQueued = prev.filter((m) => m.senderId === user?.id && (m.status === 'queued' || m.status === 'failed'));
      mineQueued.forEach((m) => {
        const cid = String(m.clientId || '');
        const text = m.message ? String(m.message) : '';
        if (cid && text.trim()) {
          outboxRef.current.set(cid, text);
        }
      });
      return prev;
    });

    const queued = Array.from(outboxRef.current.entries());
    queued.forEach(([clientId, text]) => {
      updateMessageByClientId(clientId, (m) => (m.status === 'sent' ? m : { ...m, status: 'sending' }));
      const t = setTimeout(() => {
        ackTimersRef.current.delete(clientId);
        updateMessageByClientId(clientId, (m) => (m.status === 'sending' ? { ...m, status: 'failed' } : m));
      }, 6500);
      ackTimersRef.current.set(clientId, t);
      sendWithAck({ clientId, messageText: text });
    });
  }, [socketConnected, roomJoined]); // eslint-disable-line react-hooks/exhaustive-deps -- flush when socket/room ready

  useEffect(() => {
    if (!user) return;
    const fetchGalleries = async () => {
      setGalleriesLoading(true);
      try {
        const res = await axios.get(apiUrl('/galleries'), {
          params: { page: galleriesPage, pageSize: galleriesPageSize, q: galleryQuery || undefined, forChat: 1 },
        });
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
        setGalleries(list);
        setGalleriesTotal(Number(res.data?.total) || list.length);
      } catch (e) {
        setGalleries([]);
        setGalleriesTotal(0);
      } finally {
        setGalleriesLoading(false);
      }
    };
    if (!activeGallery) fetchGalleries();
  }, [user, activeGallery, galleriesPage, galleriesPageSize, galleryQuery]);

  useEffect(() => {
    if (isPrependingRef.current) return;
    if (messages.length > prevMessageCountRef.current) scrollToBottom();
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useLayoutEffect(() => {
    const pending = pendingScrollAdjustRef.current;
    const el = messagesWrapRef.current;
    if (!pending || !el) return;
    const newHeight = el.scrollHeight;
    const delta = newHeight - pending.prevScrollHeight;
    el.scrollTop = pending.prevScrollTop + delta;
    pendingScrollAdjustRef.current = null;
    isPrependingRef.current = false;
  }, [messages.length]);

  const joinGalleryChat = (gallery) => {
    if (!user) return;
    setActiveGallery(gallery);
    setMessages([]);
    setRoomUsers([]);
    setRoomJoined(false);
    setJoinFailed(false);
    setHistoryLoading(false);
    setHistoryHasMore(true);
    historyCursorRef.current = null;
    historyLoadedForGalleryRef.current = null;
    seenMessageIdsRef.current.clear();
    prevMessageCountRef.current = 0;
    ackTimersRef.current.forEach((t) => clearTimeout(t));
    ackTimersRef.current.clear();
    seenClientIdsRef.current.clear();
    outboxRef.current.clear();
    if (!socket || !socketConnected) {
      message.info('正在连接聊天室…');
      return;
    }
    socket.emit('join_gallery', { galleryId: gallery.id, userId: user.id, username: user.username });
    socket.emit('join_chat', `gallery_${gallery.id}`);
  };

  const leaveGalleryChat = () => {
    if (socket) socket.emit('leave_gallery');
    setActiveGallery(null);
    setMessages([]);
    setRoomUsers([]);
    setInputValue('');
    setRoomJoined(false);
    setJoinFailed(false);
    setHistoryLoading(false);
    setHistoryHasMore(true);
    historyCursorRef.current = null;
    historyLoadedForGalleryRef.current = null;
    seenMessageIdsRef.current.clear();
    prevMessageCountRef.current = 0;
    ackTimersRef.current.forEach((t) => clearTimeout(t));
    ackTimersRef.current.clear();
    seenClientIdsRef.current.clear();
    outboxRef.current.clear();
  };

  const retryJoin = () => {
    if (!socket || !socketConnected || !user || !activeGallery) return;
    setJoinFailed(false);
    setRoomJoined(false);
    socket.emit('join_gallery', { galleryId: activeGallery.id, userId: user.id, username: user.username });
    socket.emit('join_chat', `gallery_${activeGallery.id}`);
  };

  const updateMessageByClientId = (clientId, updater) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => String(m.clientId || '') === String(clientId));
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = updater(next[idx]);
      return next;
    });
  };

  const artworkPreviewUrl = (artId) => apiUrl(`/artpieces/preview/${artId}`) + '?wm=0';

  const openArtPreview = (art) => {
    if (!art?.id && !art?.url) return;
    setPreviewArt({
      id: art?.id,
      title: art?.title || '',
      url: art?.url || (art?.id ? artworkPreviewUrl(art.id) : ''),
    });
    setPreviewOpen(true);
  };

  const closeArtPreview = () => {
    setPreviewOpen(false);
    setPreviewArt(null);
  };

  const parseArtworkMessage = (raw) => {
    const text = raw ? String(raw) : '';
    if (!text) return null;
    if (!text.startsWith('【作品】')) return null;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^【作品】\s*/, '') || '';
    const url = lines[1] || '';
    if (!url.includes('/artpieces/preview/')) return null;
    return { title, url };
  };

  const sendWithAck = ({ clientId, messageText }) => {
    if (!socket || !activeRoom) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    socket
      .timeout(5000)
      .emit('send_gallery_message', { clientId, galleryId: activeGallery?.id, message: messageText, time }, (err, resp) => {
        const timer = ackTimersRef.current.get(clientId);
        if (timer) {
          clearTimeout(timer);
          ackTimersRef.current.delete(clientId);
        }
        if (err || !resp?.ok) {
          updateMessageByClientId(clientId, (m) => ({ ...m, status: 'failed' }));
          return;
        }
        updateMessageByClientId(clientId, (m) => ({
          ...m,
          status: 'sent',
          time: m.time || time,
          messageId: resp?.messageId ?? m.messageId,
          createdAt: resp?.createdAt ?? m.createdAt,
        }));
        if (resp?.messageId != null) seenMessageIdsRef.current.add(String(resp.messageId));
        outboxRef.current.delete(clientId);
      });

    socket.emit('send_message', {
      room: activeRoom,
      clientId,
      message: messageText,
      sender: user?.username,
      senderId: user?.id,
      time,
    });
  };

  const sendTextMessage = (text, { clearDraft } = {}) => {
    const msgText = text ? String(text) : '';
    if (!msgText.trim()) return;
    if (!user) return message.error('请登录后发送消息');
    if (!socket || !activeRoom) return;

    const clientId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const localMsg = {
      room: activeRoom,
      clientId,
      message: msgText,
      sender: user.username,
      senderId: user.id,
      time,
      createdAt: new Date().toISOString(),
      status: socketConnected ? 'sending' : 'queued',
    };
    seenClientIdsRef.current.add(clientId);
    outboxRef.current.set(clientId, msgText);
    setMessages((prev) => [...prev, localMsg]);

    if (socketConnected) {
      const t = setTimeout(() => {
        ackTimersRef.current.delete(clientId);
        updateMessageByClientId(clientId, (m) => (m.status === 'sending' ? { ...m, status: 'failed' } : m));
      }, 6500);
      ackTimersRef.current.set(clientId, t);
      socket.emit('send_message', {
        room: activeRoom,
        clientId,
        message: msgText,
        sender: user?.username,
        senderId: user?.id,
        time,
      });
      if (roomJoined) {
        socket.timeout(5000).emit('send_gallery_message', { clientId, galleryId: activeGallery?.id, message: msgText, time }, () => {});
      }
    } else {
      message.info('网络已断开，消息已加入待发送');
    }
    if (clearDraft) {
      setInputValue('');
      setEmojiOpen(false);
    }
  };

  const sendArtworkToChat = (art) => {
    if (!art?.id) return;
    const title = art.title ? String(art.title) : '';
    const url = artworkPreviewUrl(art.id);
    const payload = `【作品】${title}\n${url}`;
    sendTextMessage(payload, { clearDraft: false });
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendTextMessage(inputValue, { clearDraft: true });
  };

  const backToChatSelector = () => {
    leaveGalleryChat();
    navigate('/chat');
  };

  const onChatStageDoubleClickCapture = (e) => {
    if (!activeGallery) return;
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    if (
      target.closest(
        [
          '.wechat-chat-topbar',
          '.wechat-chat-header',
          '.wechat-chat-item',
          '.wechat-chat-bubble',
          '.wechat-chat-inputbar',
          '.wechat-chat-arttag',
          '.wechat-chat-usersbox',
          '.wechat-chat-side-head',
          '.wechat-chat-side-section',
          '.ant-modal',
          '.ant-popover',
          '.ant-dropdown',
          'button',
          'input',
          'textarea',
        ].join(', ')
      )
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    backToChatSelector();
  };

  const formatTime = (dt) => {
    if (!dt) return '';
    const d = dt instanceof Date ? dt : new Date(dt);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const mapHistoryToMessage = (row) => ({
    room: activeRoomRef.current,
    messageId: row.id,
    createdAt: row.createdAt,
    clientId: row.clientId || undefined,
    message: row.message || '',
    sender: row.sender || 'Anonymous',
    senderId: row.senderId,
    time: formatTime(row.createdAt),
    status: 'sent',
  });

  const fetchTodayHistory = async () => {
    if (!activeGallery?.id) return;
    if (historyLoadingRef.current) return;
    const token = localStorage.getItem('token');
    setHistoryLoading(true);
    try {
      const res = await axios.get(apiUrl(`/galleries/${activeGallery.id}/chat-messages`), {
        params: { scope: 'today', limit: 50 },
        headers: { 'x-auth-token': token, Authorization: token ? `Bearer ${token}` : undefined },
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      const mapped = items.map(mapHistoryToMessage);
      mapped.forEach((m) => {
        if (m.messageId != null) seenMessageIdsRef.current.add(String(m.messageId));
      });
      setMessages(mapped);
      const oldest = items[0];
      historyCursorRef.current = oldest ? { beforeId: oldest.id, beforeCreatedAt: oldest.createdAt } : null;
      setHistoryHasMore(true);
    } catch {
      setHistoryHasMore(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchOlderHistory = async () => {
    if (!activeGallery?.id) return;
    if (historyLoadingRef.current) return;
    if (!historyHasMoreRef.current) return;
    const el = messagesWrapRef.current;
    if (!el) return;
    const first = messages[0];
    const beforeId = first?.messageId;
    const beforeCreatedAt = first?.createdAt;
    if (!beforeId || !beforeCreatedAt) {
      setHistoryHasMore(false);
      return;
    }

    const token = localStorage.getItem('token');
    setHistoryLoading(true);
    isPrependingRef.current = true;
    pendingScrollAdjustRef.current = { prevScrollTop: el.scrollTop, prevScrollHeight: el.scrollHeight };
    try {
      const res = await axios.get(apiUrl(`/galleries/${activeGallery.id}/chat-messages`), {
        params: { limit: 30, beforeId, beforeCreatedAt },
        headers: { 'x-auth-token': token, Authorization: token ? `Bearer ${token}` : undefined },
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      if (items.length === 0) {
        setHistoryHasMore(false);
        pendingScrollAdjustRef.current = null;
        isPrependingRef.current = false;
        return;
      }
      const mapped = items.map(mapHistoryToMessage).filter((m) => {
        if (m.messageId == null) return false;
        const key = String(m.messageId);
        if (seenMessageIdsRef.current.has(key)) return false;
        seenMessageIdsRef.current.add(key);
        return true;
      });
      setMessages((prev) => [...mapped, ...prev]);
      setHistoryHasMore(Boolean(res.data?.hasMore) || items.length > 0);
    } catch {
      setHistoryHasMore(false);
      pendingScrollAdjustRef.current = null;
      isPrependingRef.current = false;
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!roomJoined || !activeGallery?.id) return;
    if (historyLoadedForGalleryRef.current === activeGallery.id) return;
    historyLoadedForGalleryRef.current = activeGallery.id;
    fetchTodayHistory();
  }, [roomJoined, activeGallery?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per join+gallery

  const lastHistoryTriggerRef = useRef(0);
  const onMessagesScroll = (e) => {
    const el = e.currentTarget;
    if (!el) return;
    if (el.scrollTop > 60) return;
    const now = Date.now();
    if (now - lastHistoryTriggerRef.current < 350) return;
    lastHistoryTriggerRef.current = now;
    fetchOlderHistory();
  };

  const resendMessage = (msg) => {
    if (!socket || !activeRoom) return;
    if (!socketConnected || !roomJoined) {
      message.error(socketConnected ? '尚未进入房间，无法重发' : '连接已断开，无法重发');
      return;
    }
    const text = msg?.message ? String(msg.message) : '';
    if (!text.trim()) return;

    const nextClientId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    updateMessageByClientId(msg.clientId, (m) => ({
      ...m,
      clientId: nextClientId,
      time,
      status: 'sending',
    }));
    seenClientIdsRef.current.add(nextClientId);
    outboxRef.current.set(nextClientId, text);

    const t = setTimeout(() => {
      ackTimersRef.current.delete(nextClientId);
      updateMessageByClientId(nextClientId, (m) => (m.status === 'sending' ? { ...m, status: 'failed' } : m));
    }, 6500);
    ackTimersRef.current.set(nextClientId, t);
    sendWithAck({ clientId: nextClientId, messageText: text });
  };

  const onInputKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    e.preventDefault();
    handleSend();
  };

  const getTextAreaEl = () => {
    const node = inputRef.current;
    return node?.resizableTextArea?.textArea || node?.textArea || null;
  };

  const insertTextAtCursor = (text) => {
    const el = getTextAreaEl();
    if (!el) {
      setInputValue((prev) => `${prev}${text}`);
      return;
    }
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : inputValue.length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : inputValue.length;
    const next = `${inputValue.slice(0, start)}${text}${inputValue.slice(end)}`;
    setInputValue(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const cursor = start + text.length;
        el.setSelectionRange(cursor, cursor);
      } catch {
        // ignore
      }
    });
  };

  const emojiGroups = useMemo(() => ([
    { key: 'face', label: '😀', items: ['😀', '😄', '😁', '😆', '🤣', '😊', '🙂', '😉', '😍', '😘', '😋', '😜', '🤔', '😴', '😅', '😢', '😭', '😡', '👍', '👎', '🙏', '👏', '💪', '🎉', '❤️', '💔', '🔥', '✨'] },
    { key: 'food', label: '🍉', items: ['🍎', '🍊', '🍉', '🍓', '🍒', '🍍', '🥝', '🍰', '🍫', '🍵', '☕️'] },
    { key: 'art', label: '🎨', items: ['🎨', '🖼️', '🎭', '🎬', '🎼', '📷', '📝', '📚'] },
  ]), []);

  const copyText = async (text) => {
    const v = text ? String(text) : '';
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      message.success('已复制');
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = v;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        message.success('已复制');
      } catch {
        message.error('复制失败');
      }
    }
  };

  const startLongPress = (text) => {
    if (longPressRef.current.timer) clearTimeout(longPressRef.current.timer);
    longPressRef.current.text = text;
    longPressRef.current.timer = setTimeout(() => {
      copyText(longPressRef.current.text);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressRef.current.timer) clearTimeout(longPressRef.current.timer);
    longPressRef.current.timer = null;
    longPressRef.current.text = '';
  };

  const initials = (name) => {
    if (!name) return '?';
    const s = String(name).trim();
    if (!s) return '?';
    return s.slice(0, 1).toUpperCase();
  };

  const roomUserById = useMemo(() => {
    const m = new Map();
    roomUsers.forEach((u) => {
      if (u?.userId == null) return;
      m.set(String(u.userId), u);
    });
    return m;
  }, [roomUsers]);

  const messageAvatarUrl = (m, mine) => {
    const id = mine ? user?.id : m?.senderId;
    if (!id) return '';
    const ts = mine ? user?.avatarUpdatedAt : roomUserById.get(String(id))?.avatarUpdatedAt;
    const v = ts ? new Date(ts).getTime() : 0;
    return `${apiUrl(`/users/${id}/avatar`)}?v=${v}`;
  };

  const userAvatarUrl = (u) => {
    const ts = u?.avatarUpdatedAt ? new Date(u.avatarUpdatedAt).getTime() : 0;
    const id = u?.userId;
    return id ? `${apiUrl(`/users/${id}/avatar`)}?v=${ts}` : '';
  };

  const clampFontSize = (v) => Math.max(12, Math.min(20, Number(v) || 14));
  const increaseFontSize = () => setFontSize((v) => clampFontSize(v + 1));
  const decreaseFontSize = () => setFontSize((v) => clampFontSize(v - 1));

  const onSideScroll = (e) => {
    const el = e?.currentTarget;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 220) fetchMoreArt();
  };

  if (!user) return (
    <div style={{ textAlign: 'center', padding: '100px' }}>
      <MessageOutlined style={{ fontSize: '64px', color: '#ccc', marginBottom: '24px' }} />
      <Title level={3}>实时交流中心</Title>
      <Paragraph>请登录后与来自全球的艺术家们进行实时探讨、分享心得。</Paragraph>
    </div>
  );

  if (!activeGallery) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
        <Card
          title={
            <Space>
              <Badge status="processing" />
              <Text strong>选择展厅进入实时交流</Text>
            </Space>
          }
          style={{ width: '100%', maxWidth: 900, margin: '0 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Search
              allowClear
              placeholder="搜索展厅名称/简介"
              value={galleryQuery}
              onChange={(e) => {
                setGalleryQuery(e.target.value);
                setGalleriesPage(1);
              }}
              onSearch={() => setGalleriesPage(1)}
              style={{ flex: 1, minWidth: 240 }}
            />
          </div>

          {galleriesLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
            </div>
          ) : galleries.length === 0 ? (
            <Empty description="未找到相关展厅" style={{ padding: '40px 0' }} />
          ) : (
            <>
              <List
                dataSource={galleries}
                renderItem={(g) => {
                  const artCount = Number(g.artPiecesCount) || 0;
                  return (
                    <List.Item
                      actions={[
                        <Button type="primary" onClick={() => joinGalleryChat(g)}>
                          进入交流
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={<Text strong>{g.name}</Text>}
                        description={
                          <div>
                            <Space wrap size={10}>
                              <Text type="secondary">策展人：{g.user?.username || 'ANONYMOUS'}</Text>
                              <Text type="secondary">作品：{artCount}</Text>
                            </Space>
                            <div style={{ marginTop: 6 }}>
                              <Text type="secondary" style={{ display: 'block' }} ellipsis>
                                {g.description || ' '}
                              </Text>
                            </div>
                          </div>
                        }
                      />
                    </List.Item>
                  );
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <Pagination
                  current={galleriesPage}
                  pageSize={galleriesPageSize}
                  total={galleriesTotal}
                  showSizeChanger
                  pageSizeOptions={[5, 10, 20, 30]}
                  onChange={(p, ps) => {
                    setGalleriesPage(p);
                    setGalleriesPageSize(ps);
                  }}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div
      className="wechat-chat-stage"
      onDoubleClickCapture={onChatStageDoubleClickCapture}
    >
      <div className="wechat-chat-topbar">
        <Button icon={<ArrowLeftOutlined />} onClick={backToChatSelector}>
          返回选择展厅进入实时交流
        </Button>
      </div>

      <div className="wechat-chat-page">
        <div className="wechat-chat-gallerypanel" ref={sideScrollRef} onScroll={onSideScroll}>
        <div className="wechat-chat-gallery">
          <div className="wechat-chat-side-head">
            <Text strong className="wechat-chat-side-title">{activeGalleryInfo?.name || activeGallery.name}</Text>
            <Text type="secondary" className="wechat-chat-side-sub">
              策展人：{activeGalleryInfo?.user?.username || activeGallery.user?.username || 'ANONYMOUS'}
            </Text>
            <Text type="secondary" className="wechat-chat-side-desc">
              {activeGalleryInfo?.description || activeGallery.description || ' '}
            </Text>
          </div>
        </div>

        <div className="wechat-chat-artworks">
          <div className="wechat-chat-side-section">
            <div className="wechat-chat-side-section-head">
              <Text strong>作品</Text>
              <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{artTotal ? `${artTotal}` : ''}</Text>
            </div>

            {artLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <Spin />
              </div>
            ) : artItems.length === 0 ? (
              <Empty description="暂无作品" style={{ padding: '18px 0' }} />
            ) : (
              <div className="wechat-chat-artgrid">
                {artItems.map((art) => {
                  const avgRaw = Number(art.averageRating);
                  const avg = Number.isFinite(avgRaw) ? Math.max(0, Math.min(5, avgRaw)) : 0;
                  const cntRaw = Number(art.ratingCount);
                  const cnt = Number.isFinite(cntRaw) ? cntRaw : 0;

                  return (
                    <Dropdown
                      key={art.id}
                      trigger={['contextMenu']}
                      menu={{
                        items: [{ key: 'send', label: '发送作品至聊天室' }],
                        onClick: ({ key }) => {
                          if (key === 'send') sendArtworkToChat(art);
                        },
                      }}
                    >
                      <div className="wechat-chat-arttag" aria-label={art.title || 'art'}>
                        <div
                          className="wechat-chat-arttag-thumbwrap"
                          onClick={() => openArtPreview(art)}
                          role="button"
                          tabIndex={0}
                        >
                          <img
                            className="wechat-chat-arttag-thumb"
                            src={artworkPreviewUrl(art.id)}
                            alt={art.title}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                          />
                        </div>
                        <div className="wechat-chat-arttag-body">
                          <div className="wechat-chat-arttag-title">{art.title}</div>
                          <div className="wechat-chat-arttag-rating">
                            <Rate allowHalf disabled value={avg} />
                            <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {avg ? avg.toFixed(1) : '—'}
                            </Text>
                            <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {cnt ? `(${cnt})` : ''}
                            </Text>
                          </div>
                        </div>
                      </div>
                    </Dropdown>
                  );
                })}
              </div>
            )}

            {artHasMore ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 14px' }}>
                <Button loading={artLoadingMore} onClick={fetchMoreArt}>
                  加载更多
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

        <div className="wechat-chat-chatwrap">
        <div className="wechat-chat-shell" style={{ '--wechat-chat-font-size': `${fontSize}px` }}>
          <div className="wechat-chat-header">
            <div className="wechat-chat-title">
              <Badge status="processing" />
              <Text strong className="wechat-chat-title-text">
                {activeGallery.name}
              </Text>
            </div>
            <Space size={6}>
              <Button icon={<MinusOutlined />} onClick={decreaseFontSize} />
              <Text style={{ width: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fontSize}px</Text>
              <Button icon={<PlusOutlined />} onClick={increaseFontSize} />
            </Space>
            <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              在线：{roomUsers.length}
            </Text>
          </div>

          <div className="wechat-chat-main">
            <div className="wechat-chat-messages" ref={messagesWrapRef} onScroll={onMessagesScroll}>
              {!socketConnected ? (
                <div className="wechat-chat-conn-banner">网络已断开，正在尝试重连…</div>
              ) : joinFailed ? (
                <div className="wechat-chat-conn-banner wechat-chat-conn-banner-failed">
                  <span>进入展厅聊天室失败</span>
                  <button type="button" className="wechat-chat-conn-retry" onClick={retryJoin}>重试</button>
                </div>
              ) : !roomJoined ? (
                <div className="wechat-chat-conn-banner">正在进入展厅聊天室…</div>
              ) : historyLoading ? (
                <div className="wechat-chat-conn-banner">正在加载聊天记录…</div>
              ) : null}
              {messages.length === 0 ? (
                <div className="wechat-chat-empty">暂无消息，开始交流吧</div>
              ) : (
                messages.map((m, idx) => {
                  const mine = m.senderId === user.id;
                  const name = mine ? '我' : (m.sender || '匿名');
                  const artMsg = parseArtworkMessage(m.message);
                  const displayTime = m.time || (m.createdAt ? formatTime(m.createdAt) : '');
                  const key = m.messageId != null ? `m_${m.messageId}` : m.clientId ? `c_${m.clientId}` : `i_${idx}`;
                  return (
                    <div key={key} className="wechat-chat-item">
                      <div className="wechat-chat-time">
                        <div className="wechat-chat-time-pill">
                          {displayTime}
                        </div>
                      </div>
                      <div className={`wechat-chat-row ${mine ? 'is-mine' : 'is-other'}`}>
                        <div className={`wechat-chat-avatar ${mine ? 'is-mine' : 'is-other'}`}>
                          <Avatar
                            size={36}
                            src={messageAvatarUrl(m, mine)}
                            style={{ background: 'transparent' }}
                          >
                            {initials(name)}
                          </Avatar>
                        </div>
                        <div className={`wechat-chat-bubble-wrap ${mine ? 'is-mine' : 'is-other'}`}>
                          {!mine ? <Text type="secondary" className="wechat-chat-nickname">{name}</Text> : null}
                          <div className={`wechat-chat-bubbleline ${mine ? 'is-mine' : 'is-other'}`}>
                            <div
                              className={`wechat-chat-bubble ${mine ? 'is-mine' : 'is-other'}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                copyText(m.message);
                              }}
                              onTouchStart={() => startLongPress(m.message)}
                              onTouchEnd={cancelLongPress}
                              onTouchCancel={cancelLongPress}
                            >
                              {artMsg ? (
                                <div
                                  className="wechat-chat-artmsg"
                                  onClick={() => openArtPreview({ title: artMsg.title, url: artMsg.url })}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="wechat-chat-artmsg-thumbwrap">
                                    <img className="wechat-chat-artmsg-thumb" src={artMsg.url} alt={artMsg.title} draggable={false} />
                                  </div>
                                  <div className="wechat-chat-artmsg-title">{artMsg.title}</div>
                                </div>
                              ) : (
                                m.message
                              )}
                            </div>
                            {mine ? (
                              <div className="wechat-chat-sendstate">
                                {m.status === 'sending' || m.status === 'queued' ? (
                                  <LoadingOutlined className="wechat-chat-sendstate-sending" />
                                ) : m.status === 'failed' ? (
                                  <ExclamationCircleFilled
                                    className="wechat-chat-sendstate-failed"
                                    onClick={() => resendMessage(m)}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="wechat-chat-inputbar">
              <Popover
                open={emojiOpen}
                onOpenChange={setEmojiOpen}
                trigger="click"
                placement="topLeft"
                content={
                  <div className="wechat-emoji-panel">
                    <div className="wechat-emoji-tabs">
                      {emojiGroups.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          className="wechat-emoji-tab"
                          onClick={() => {
                            const el = document.getElementById(`emoji-group-${g.key}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <div className="wechat-emoji-scroll">
                      {emojiGroups.map((g) => (
                        <div key={g.key} id={`emoji-group-${g.key}`} className="wechat-emoji-group">
                          <div className="wechat-emoji-grid">
                            {g.items.map((em) => (
                              <button
                                key={`${g.key}-${em}`}
                                type="button"
                                className="wechat-emoji-btn"
                                onClick={() => insertTextAtCursor(em)}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                }
              >
                <Button icon={<SmileOutlined />} className="wechat-chat-toolbtn" />
              </Popover>

              <Input.TextArea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                autoSize={{ minRows: 1, maxRows: 4 }}
                className="wechat-chat-textarea"
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSend} disabled={!inputValue.trim()} className="wechat-chat-sendbtn">
                发送
              </Button>
            </div>
          </div>
        </div>
        </div>

        <div className="wechat-chat-userspanel">
        <div className="wechat-chat-usersbox">
          <div className="wechat-chat-users-head">
            <Text strong>聊天室成员</Text>
            <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{roomUsers.length}</Text>
          </div>
          <List
            size="small"
            dataSource={roomUsers}
            locale={{ emptyText: '暂无在线用户' }}
            renderItem={(u) => (
              <List.Item className="wechat-chat-users-item">
                <Space size={10}>
                  <Badge status="success" />
                  <Avatar size={28} src={userAvatarUrl(u)}>
                    {initials(u?.username)}
                  </Avatar>
                  <Text className="wechat-chat-users-name">{u.username}</Text>
                </Space>
              </List.Item>
            )}
          />
        </div>
      </div>
      </div>

      <Modal
        open={previewOpen}
        onCancel={closeArtPreview}
        footer={null}
        title={previewArt?.title || '作品预览'}
        width={820}
        centered
        destroyOnClose
      >
        <div className="wechat-chat-preview">
          {previewArt?.url ? (
            <img className="wechat-chat-preview-img" src={previewArt.url} alt={previewArt.title || 'art'} draggable={false} />
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

export default ChatRoom;
