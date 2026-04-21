import React, { useState, useContext } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      message.success(t('login_success'));
      const redirectFromState = location.state && location.state.from;
      const redirectFromStorage = localStorage.getItem('postLoginRedirect');
      const redirectTo = redirectFromState || redirectFromStorage || '/';
      if (redirectFromStorage) localStorage.removeItem('postLoginRedirect');
      navigate(redirectTo);
    } catch (err) {
      message.error(err.response?.data?.msg || t('login_failed_check_credentials'));
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh', padding: '24px 0' }}>
      <Card style={{ width: '100%', maxWidth: 450, padding: '30px', margin: '0 16px' }} className="auth-card">
        <Title level={1} style={{ textAlign: 'center', marginBottom: '48px', letterSpacing: '4px' }}>{t('login')}</Title>
        <Form name="login_form" onFinish={onFinish} layout="vertical">
          <Form.Item name="email" label={<Text strong>{t('email_address')}</Text>} rules={[{ required: true, message: t('email_required'), type: 'email' }]}>
            <Input placeholder={t('enter_your_email')} size="large" />
          </Form.Item>
          <Form.Item name="password" label={<Text strong>{t('password')}</Text>} rules={[{ required: true, message: t('password_required') }]}>
            <Input.Password placeholder={t('enter_your_password')} size="large" />
          </Form.Item>
          <Form.Item style={{ marginTop: '40px' }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: '50px', letterSpacing: '2px' }}>
              {t('sign_in')}
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <Text type="secondary">{t('new_to_the_hub')}</Text>
            <Link to="/register" style={{ color: '#c5a059', fontWeight: 'bold' }}>{t('create_account')}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
