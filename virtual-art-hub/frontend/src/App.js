import React, { useContext, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Space, Select, Drawer, Avatar, Dropdown, Spin } from 'antd';
import { MenuOutlined, UserOutlined, ShoppingCartOutlined, UploadOutlined, HomeOutlined, DashboardOutlined, MessageOutlined, LogoutOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { apiUrl } from './apiBase';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import UploadArt from './pages/UploadArt';
import MyGalleries from './pages/MyGalleries';
import GalleryView from './pages/GalleryView';
import AdminDashboard from './pages/AdminDashboard';
import ArtMarket from './pages/ArtMarket';
import ChatRoom from './pages/ChatRoom';
import ArtPieceDetail from './pages/ArtPieceDetail';
import PublicGalleryView from './pages/PublicGalleryView';
import GalleriesHub from './pages/GalleriesHub';
import Profile from './pages/Profile';
import Logo from './components/Logo';
import './App.css';
import i18n from './i18n';
import { useTranslation, I18nextProvider } from 'react-i18next';
import { getStoredPublicVisitPath, setStoredPublicVisitPathFromCode, clearStoredPublicVisitPath } from './publicVisitSession';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) {
    return (
      <div className="app-route-loading">
        <Spin size="large" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) {
    return (
      <div className="app-route-loading">
        <Spin size="large" />
      </div>
    );
  }
  return user && user.role === 'admin' ? children : <Navigate to="/" />;
};

function AppShell() {
  const { user, logout } = useContext(AuthContext);
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const isDirectGalleryAccess = /^\/visit\//.test(location.pathname || '');
  if (location.pathname === '/') {
    clearStoredPublicVisitPath();
  }
  const directVisitMatch = /^\/visit\/([^/]+)/.exec(location.pathname || '');
  if (directVisitMatch && directVisitMatch[1]) {
    setStoredPublicVisitPathFromCode(directVisitMatch[1]);
  }
  const publicVisitPath = getStoredPublicVisitPath();
  const isPublicVisitGuestMode = !user && Boolean(publicVisitPath);
  const homePath = isPublicVisitGuestMode ? publicVisitPath : '/';

  const postLoginFromPath = React.useMemo(() => {
    const p = location.pathname;
    if (p === '/login' || p === '/register') return '/';
    return `${location.pathname}${location.search || ''}`;
  }, [location.pathname, location.search]);

  const savePostLoginRedirect = React.useCallback(() => {
    try {
      if (location.pathname === '/login' || location.pathname === '/register') return;
      localStorage.setItem('postLoginRedirect', `${location.pathname}${location.search || ''}`);
    } catch {
      /* ignore */
    }
  }, [location.pathname, location.search]);

  const avatarUrl = useMemo(() => {
    if (!user) return null;
    const ts = user.avatarUpdatedAt ? new Date(user.avatarUpdatedAt).getTime() : 0;
    return `${apiUrl(`/users/${user.id}/avatar`)}?v=${ts}`;
  }, [user]);

  React.useEffect(() => {
    const prevent = (e) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('dragstart', prevent);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('dragstart', prevent);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(Boolean(mql.matches));
    onChange();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  React.useEffect(() => {
    const isInteractiveTarget = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (el.closest('.ant-modal')) return true;
      if (el.closest('.ant-drawer')) return true;
      if (el.closest('.ant-layout-header,.ant-layout-footer')) return true;
      if (el.closest('a,button,input,textarea,select,option,label,[role="button"],[role="link"]')) return true;
      if (el.closest('.ant-btn,.ant-input,.ant-select,.ant-dropdown,.ant-menu,.ant-pagination')) return true;
      if (el.closest('img,svg,canvas,video')) return true;
      if (el.closest('p,span,h1,h2,h3,h4,h5,h6,li,pre,code,blockquote')) return true;
      return false;
    };

    const isContentElement = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const tag = el.tagName?.toLowerCase();
      if (!tag) return false;
      if (['img', 'svg', 'canvas', 'video', 'audio', 'button', 'input', 'textarea', 'select', 'option'].includes(tag)) return true;
      if (tag === 'a' && el.getAttribute('href')) return true;
      const role = el.getAttribute('role');
      if (role === 'button' || role === 'link') return true;
      return false;
    };

    const hasTextAtPoint = (x, y) => {
      const doc = document;
      const caretPos = typeof doc.caretPositionFromPoint === 'function' ? doc.caretPositionFromPoint(x, y) : null;
      const caretRange = !caretPos && typeof doc.caretRangeFromPoint === 'function' ? doc.caretRangeFromPoint(x, y) : null;
      const node = caretPos?.offsetNode || caretRange?.startContainer;
      if (!node) return false;
      const text = node.nodeType === Node.TEXT_NODE ? String(node.nodeValue || '') : '';
      return text.trim().length > 0;
    };

    const hasContentAtPoint = (root, x, y) => {
      if (!root || !(root instanceof Element)) return false;
      if (isContentElement(root)) return true;
      if (hasTextAtPoint(x, y)) return true;

      const candidates = root.querySelectorAll('img,svg,canvas,video,a[href],button,input,textarea,select,[role="button"],[role="link"]');
      for (let i = 0; i < candidates.length; i += 1) {
        const el = candidates[i];
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return true;
        }
      }
      return false;
    };

    const onDblClick = (e) => {
      if (/^\/visit\//.test(window.location.pathname)) return;
      if (!e || e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const target = e.target;
      if (!(target instanceof Element)) return;
      if (isInteractiveTarget(target)) return;

      const x = e.clientX;
      const y = e.clientY;
      const scope = target.closest('.site-layout-content') || document.body;
      if (hasContentAtPoint(scope, x, y)) return;

      if (window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    };

    document.addEventListener('dblclick', onDblClick, true);
    return () => document.removeEventListener('dblclick', onDblClick, true);
  }, []);

  const handleLanguageChange = (lng) => {
    i18n.changeLanguage(lng);
  };

  const menuItems = [
    { key: 'home', icon: <HomeOutlined />, label: <Link to={homePath}>{t('home')}</Link> },
  ];
  if (!isPublicVisitGuestMode) {
    const showExploreRow = !isDirectGalleryAccess || user;
    if (showExploreRow) {
      menuItems.push(
        { key: '/market', icon: <ShoppingCartOutlined />, label: <Link to="/market">{t('nav_art_market')}</Link> },
        { key: '/chat', icon: <MessageOutlined />, label: <Link to="/chat">{t('realtime_chat')}</Link> }
      );
    }
    if (user) {
      menuItems.push(
        { key: '/my-gallery', icon: <DashboardOutlined />, label: <Link to="/my-gallery">{t('my_galleries')}</Link> },
        { key: '/upload', icon: <UploadOutlined />, label: <Link to="/upload">{t('upload_artwork')}</Link> },
        { key: '/profile', icon: <UserOutlined />, label: <Link to="/profile">{t('profile')}</Link> }
      );
      menuItems.splice(1, 0, { key: '/galleries', icon: <AppstoreOutlined />, label: <Link to="/galleries">{t('explore_galleries')}</Link> });
      if (user.role === 'admin') {
        menuItems.push({ key: '/admin', icon: <DashboardOutlined />, label: <Link to="/admin">{t('admin_panel')}</Link> });
      }
    }
  }

  return (
    <Layout className="layout app-root-layout">
        <Header className="app-header" style={{ display: 'flex', alignItems: 'center', zIndex: 10 }}>
          <Link to={homePath} className="app-logo app-brand-link" aria-label={t('home')}>
            <Logo compact={isMobile} />
          </Link>
          {!isMobile ? (
            <>
              <div className="app-menu">
                <Menu mode="horizontal" items={menuItems} />
              </div>
              <div className="auth-buttons app-auth">
                <Space size="large">
                  <Select defaultValue={i18n.language} style={{ width: 120 }} onChange={handleLanguageChange}>
                    <Select.Option value="en">English</Select.Option>
                    <Select.Option value="zh">中文</Select.Option>
                  </Select>
                  {user ? (
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: 'settings',
                            icon: <SettingOutlined />,
                            label: <Link to="/profile">{t('settings')}</Link>,
                          },
                          {
                            key: 'logout',
                            icon: <LogoutOutlined />,
                            label: <span onClick={logout}>{t('logout')}</span>,
                          }
                        ]
                      }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <Space style={{ cursor: 'pointer', padding: '0 8px' }}>
                        <Avatar src={avatarUrl} icon={!avatarUrl && <UserOutlined />} />
                        <Text style={{ fontFamily: 'Playfair Display', fontStyle: 'italic', fontSize: '16px' }}>{user.username}</Text>
                      </Space>
                    </Dropdown>
                  ) : (
                    <>
                      <Link to="/login" state={{ from: postLoginFromPath }} onClick={savePostLoginRedirect}>
                        <Button type="text" style={{ fontFamily: 'Playfair Display', fontSize: '16px' }}>{t('login')}</Button>
                      </Link>
                      <Link to="/register"><Button type="primary" className="elegant-btn" style={{ height: '40px' }}>{t('register')}</Button></Link>
                    </>
                  )}
                </Space>
              </div>
            </>
          ) : (
            <div className="app-mobile-actions">
              <Button
                type="text"
                className="app-mobile-menu-btn"
                icon={<MenuOutlined style={{ fontSize: 22 }} />}
                onClick={() => setMobileMenuOpen(true)}
              />
              <Drawer
                title={<Logo compact />}
                placement="right"
                open={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                bodyStyle={{ padding: 0 }}
              >
                <div style={{ padding: 12 }}>
                  <Select value={i18n.language} style={{ width: '100%' }} onChange={handleLanguageChange}>
                    <Select.Option value="en">English</Select.Option>
                    <Select.Option value="zh">中文</Select.Option>
                  </Select>
                </div>
                <Menu
                  mode="inline"
                  items={menuItems}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ borderRight: 0 }}
                />
                <div style={{ padding: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  {user ? (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Space>
                        <Avatar src={avatarUrl} icon={!avatarUrl && <UserOutlined />} />
                        <Text style={{ fontFamily: 'Playfair Display', fontStyle: 'italic', fontSize: 16 }}>{user.username}</Text>
                      </Space>
                      <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
                        <Button block>{t('settings')}</Button>
                      </Link>
                      <Button onClick={() => { setMobileMenuOpen(false); logout(); }} block className="elegant-btn">
                        {t('logout')}
                      </Button>
                    </Space>
                  ) : (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Link to="/login" state={{ from: postLoginFromPath }} onClick={() => { savePostLoginRedirect(); setMobileMenuOpen(false); }}>
                        <Button block>{t('login')}</Button>
                      </Link>
                      <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                        <Button type="primary" block className="elegant-btn">{t('register')}</Button>
                      </Link>
                    </Space>
                  )}
                </div>
              </Drawer>
            </div>
          )}
        </Header>
        <div className="app-scroll-region">
          <Content className="app-content">
            <div className="site-layout-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/market" element={<ArtMarket />} />
                <Route path="/chat" element={<ChatRoom />} />
                <Route path="/artpiece/:id" element={<ArtPieceDetail />} />
                <Route path="/gallery/:id" element={<PublicGalleryView />} />
                <Route path="/visit/:code" element={<PublicGalleryView />} />
                <Route path="/galleries" element={<PrivateRoute><GalleriesHub /></PrivateRoute>} />
                <Route path="/my-gallery" element={<PrivateRoute><MyGalleries /></PrivateRoute>} />
                <Route path="/my-gallery/:id" element={<PrivateRoute><GalleryView /></PrivateRoute>} />
                <Route path="/upload" element={<PrivateRoute><UploadArt /></PrivateRoute>} />
                <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              </Routes>
            </div>
          </Content>
          <Footer className="app-footer">
            <div className="app-footer-inner">
              <div className="app-footer-copy">© 2026 Virtual Art Hub · {t('slogan_discover_art')}</div>
            </div>
          </Footer>
        </div>
    </Layout>
  );
}

const AppWrapper = () => (
  <AuthProvider>
    <I18nextProvider i18n={i18n}>
      <Router>
        <AppShell />
      </Router>
    </I18nextProvider>
  </AuthProvider>
);

export default AppWrapper;
