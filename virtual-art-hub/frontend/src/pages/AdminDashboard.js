import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Row, Col, Card, Empty, Spin, Tag, Typography, Button, Space, message, Tabs, Divider, Table, Input, Select, Popconfirm, Modal, Form } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../apiBase';

const { Meta } = Card;
const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

const AdminDashboard = () => {
  const { user } = useContext(AuthContext);
  const [pendingArt, setPendingArt] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersData, setUsersData] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(20);
  const [usersQuery, setUsersQuery] = useState('');
  const [usersRole, setUsersRole] = useState('all');
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdTargetUser, setPwdTargetUser] = useState(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdForm] = Form.useForm();
  const { t } = useTranslation();

  const fetchPendingArt = useCallback(async () => {
    try {
      const res = await axios.get(apiUrl('/admin/artpieces/pending'), {
        headers: { 'x-auth-token': localStorage.getItem('token') }
      });
      setPendingArt(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      message.error(t('cannot_get_pending_artworks'));
      setLoading(false);
    }
  }, [t]);

  const fetchUsers = async ({ page = usersPage, pageSize = usersPageSize, q = usersQuery, role = usersRole } = {}) => {
    setUsersLoading(true);
    try {
      const res = await axios.get(apiUrl('/admin/users'), {
        headers: { 'x-auth-token': localStorage.getItem('token') },
        params: {
          page,
          pageSize,
          q: q || undefined,
          role: role === 'all' ? undefined : role,
        },
      });
      setUsersData(Array.isArray(res.data?.items) ? res.data.items : []);
      setUsersTotal(Number(res.data?.total) || 0);
      setUsersPage(Number(res.data?.page) || page);
      setUsersPageSize(Number(res.data?.pageSize) || pageSize);
    } catch (err) {
      message.error(t('cannot_get_users'));
      setUsersData([]);
      setUsersTotal(0);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') fetchPendingArt();
  }, [user, fetchPendingArt]);

  useEffect(() => {
    if (user && user.role === 'admin') fetchUsers({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load when admin session appears
  }, [user]);

  const handleApprove = async (id) => {
    try {
      await axios.put(apiUrl(`/admin/artpieces/${id}/approve`), {}, {
        headers: { 'x-auth-token': localStorage.getItem('token') }
      });
      message.success(t('artwork_approved_success'));
      fetchPendingArt();
    } catch (err) {
      message.error(t('artwork_approve_failed'));
    }
  };

  const handleReject = async (id) => {
    try {
      await axios.put(apiUrl(`/admin/artpieces/${id}/reject`), {}, {
        headers: { 'x-auth-token': localStorage.getItem('token') }
      });
      message.success(t('artwork_rejected_success'));
      fetchPendingArt();
    } catch (err) {
      message.error(t('artwork_reject_failed'));
    }
  };

  const handleSetRole = async (targetUserId, nextRole) => {
    try {
      await axios.put(
        apiUrl(`/admin/users/${targetUserId}/role`),
        { role: nextRole },
        { headers: { 'x-auth-token': localStorage.getItem('token') } }
      );
      message.success(t('user_role_updated_success'));
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.msg || t('user_role_update_failed'));
    }
  };

  const handleDeleteUser = async (targetUserId) => {
    try {
      await axios.delete(apiUrl(`/admin/users/${targetUserId}`), {
        headers: { 'x-auth-token': localStorage.getItem('token') },
      });
      message.success(t('user_deleted_success'));
      fetchUsers({ page: 1 });
    } catch (err) {
      message.error(err.response?.data?.msg || t('user_delete_failed'));
    }
  };

  const openResetPassword = (record) => {
    setPwdTargetUser(record);
    pwdForm.resetFields();
    setPwdModalOpen(true);
  };

  const closeResetPassword = () => {
    setPwdModalOpen(false);
    setPwdTargetUser(null);
    pwdForm.resetFields();
  };

  const submitResetPassword = async (values) => {
    if (!pwdTargetUser) return;
    setPwdSaving(true);
    try {
      await axios.put(
        apiUrl(`/admin/users/${pwdTargetUser.id}/password`),
        { password: values.password },
        { headers: { 'x-auth-token': localStorage.getItem('token') } }
      );
      message.success(t('password_reset_success'));
      closeResetPassword();
    } catch (err) {
      message.error(err.response?.data?.msg || t('password_reset_failed'));
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: '20px 0' }}>
      <Title level={2}>{t('admin_dashboard_title')}</Title>
      <Paragraph type="secondary">{t('admin_dashboard_description')}</Paragraph>
      <Divider />

      <Tabs defaultActiveKey="1" items={[
        {
          key: '1',
          label: t('artwork_review'),
          children: (
            <div style={{ marginTop: '24px' }}>
              <Title level={4}>{t('pending_artworks', { count: pendingArt.length })}</Title>
              {pendingArt.length === 0 ? (
                <Empty description={t('no_pending_artworks')} />
              ) : (
                <Row gutter={[24, 24]}>
                  {pendingArt.map(art => (
                    <Col xs={24} sm={12} md={8} key={art.id}>
                      <Card
                        hoverable
                        cover={
                          <div style={{ height: '200px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9f9f9' }}>
                            <img
                              alt={art.title}
                              src={apiUrl(`/artpieces/preview/${art.id}`)}
                              onContextMenu={(e) => e.preventDefault()}
                              onDragStart={(e) => e.preventDefault()}
                              draggable={false}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            />
                          </div>
                        }
                        actions={[
                          <Button type="primary" success icon={<CheckOutlined />} onClick={() => handleApprove(art.id)}>{t('approve_button')}</Button>,
                          <Button danger icon={<CloseOutlined />} onClick={() => handleReject(art.id)}>{t('reject_button')}</Button>,
                          <Link to={`/artpiece/${art.id}`}><Button icon={<EyeOutlined />}>{t('view_button')}</Button></Link>
                        ]}
                      >
                        <Meta
                          title={<Text strong>{art.title}</Text>}
                          description={
                            <div>
                              <div>{t('author')}: {art.user?.username}</div>
                              <div style={{ marginTop: '8px', fontSize: '12px' }}>{art.description?.substring(0, 50)}...</div>
                            </div>
                          }
                        />
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </div>
          )
        },
        {
          key: '2',
          label: t('user_management_tab'),
          children: (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <Title level={4} style={{ marginBottom: 6 }}>{t('user_management_title')}</Title>
                  <Text type="secondary">{t('user_management_subtitle')}</Text>
                </div>
                <Space wrap>
                  <Search
                    allowClear
                    placeholder={t('search_users_placeholder')}
                    style={{ width: 260 }}
                    value={usersQuery}
                    onChange={(e) => setUsersQuery(e.target.value)}
                    onSearch={(v) => {
                      setUsersQuery(v);
                      fetchUsers({ page: 1, q: v });
                    }}
                  />
                  <Select
                    value={usersRole}
                    onChange={(v) => {
                      setUsersRole(v);
                      fetchUsers({ page: 1, role: v });
                    }}
                    style={{ width: 160 }}
                  >
                    <Select.Option value="all">{t('all_roles')}</Select.Option>
                    <Select.Option value="user">{t('role_user')}</Select.Option>
                    <Select.Option value="admin">{t('role_admin')}</Select.Option>
                  </Select>
                  <Button icon={<ReloadOutlined />} onClick={() => fetchUsers({ page: 1 })}>
                    {t('refresh')}
                  </Button>
                </Space>
              </div>

              <Divider />

              <Table
                rowKey="id"
                loading={usersLoading}
                dataSource={usersData}
                pagination={{
                  current: usersPage,
                  pageSize: usersPageSize,
                  total: usersTotal,
                  showSizeChanger: true,
                  pageSizeOptions: [10, 20, 50, 100],
                  onChange: (page, pageSize) => fetchUsers({ page, pageSize }),
                }}
                columns={[
                  { title: 'ID', dataIndex: 'id', width: 80 },
                  { title: t('username'), dataIndex: 'username', render: (v) => <Text strong>{v}</Text> },
                  { title: t('email'), dataIndex: 'email' },
                  {
                    title: t('role'),
                    dataIndex: 'role',
                    width: 110,
                    render: (v) => (v === 'admin' ? <Tag color="red">{t('role_admin')}</Tag> : <Tag>{t('role_user')}</Tag>),
                  },
                  {
                    title: t('artworks_count'),
                    dataIndex: 'artworksCount',
                    width: 120,
                    render: (v) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v) || 0}</Text>,
                  },
                  {
                    title: t('galleries_count'),
                    dataIndex: 'galleriesCount',
                    width: 120,
                    render: (v) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v) || 0}</Text>,
                  },
                  {
                    title: t('created_at'),
                    dataIndex: 'createdAt',
                    width: 190,
                    render: (v) => <Text type="secondary">{v ? new Date(v).toLocaleString() : ''}</Text>,
                  },
                  {
                    title: t('actions'),
                    key: 'actions',
                    width: 330,
                    render: (_, record) => {
                      const isSelf = user?.id === record.id;
                      const canDemote = record.role === 'admin' && !isSelf;
                      const canPromote = record.role !== 'admin';
                      return (
                        <Space wrap>
                          {canPromote ? (
                            <Button size="small" onClick={() => handleSetRole(record.id, 'admin')}>
                              {t('set_admin')}
                            </Button>
                          ) : (
                            <Button size="small" disabled={!canDemote} onClick={() => handleSetRole(record.id, 'user')}>
                              {t('set_user')}
                            </Button>
                          )}
                          <Button size="small" onClick={() => openResetPassword(record)}>
                            {t('reset_password')}
                          </Button>
                          <Popconfirm
                            title={t('confirm_delete_user')}
                            onConfirm={() => handleDeleteUser(record.id)}
                            okText={t('confirm')}
                            cancelText={t('cancel')}
                            disabled={isSelf}
                          >
                            <Button size="small" danger disabled={isSelf}>
                              {t('delete_user')}
                            </Button>
                          </Popconfirm>
                        </Space>
                      );
                    }
                  }
                ]}
              />

              <Modal
                title={t('reset_password')}
                open={pwdModalOpen}
                onCancel={closeResetPassword}
                okText={t('confirm')}
                cancelText={t('cancel')}
                okButtonProps={{ loading: pwdSaving }}
                onOk={() => pwdForm.submit()}
                destroyOnClose
              >
                <Form form={pwdForm} layout="vertical" onFinish={submitResetPassword}>
                  <Form.Item
                    label={t('target_user')}
                  >
                    <Text strong>{pwdTargetUser?.username || ''}</Text>
                    <Text type="secondary" style={{ marginLeft: 10 }}>{pwdTargetUser?.email || ''}</Text>
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label={t('new_password')}
                    rules={[
                      { required: true, message: t('password_required') },
                      { min: 6, message: t('password_min_length') }
                    ]}
                  >
                    <Input.Password />
                  </Form.Item>
                  <Form.Item
                    name="passwordConfirm"
                    label={t('confirm_password')}
                    dependencies={['password']}
                    rules={[
                      { required: true, message: t('password_required') },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) return Promise.resolve();
                          return Promise.reject(new Error(t('password_mismatch')));
                        },
                      }),
                    ]}
                  >
                    <Input.Password />
                  </Form.Item>
                </Form>
              </Modal>
            </div>
          )
        }
      ]} />
    </div>
  );
};

export default AdminDashboard;
