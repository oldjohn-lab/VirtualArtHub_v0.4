import React, { useState, useContext } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const Register = () => {
  const [loading, setLoading] = useState(false);
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await register(values.username, values.email, values.password);
      message.success(t('register_success'));
      navigate('/');
    } catch (err) {
      message.error(err.response?.data?.msg || t('register_failed'));
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh', padding: '24px 0' }}>
      <Card style={{ width: '100%', maxWidth: 500, padding: '30px', margin: '0 16px' }} className="auth-card">
        <Title level={1} style={{ textAlign: 'center', marginBottom: '48px', letterSpacing: '4px' }}>{t('register')}</Title>
        <Form name="register_form" onFinish={onFinish} layout="vertical">
          <Form.Item name="username" label={<Text strong>{t('artist_name')}</Text>} rules={[{ required: true, message: t('username_required') }]}>
            <Input placeholder={t('enter_your_username')} size="large" />
          </Form.Item>
          <Form.Item name="email" label={<Text strong>{t('email_address')}</Text>} rules={[{ required: true, message: t('email_required'), type: 'email' }]}>
            <Input placeholder={t('your_primary_contact_email')} size="large" />
          </Form.Item>
          <Form.Item name="password" label={<Text strong>{t('password')}</Text>} rules={[{ required: true, message: t('password_required') }, { min: 6, message: t('min_6_characters') }]}>
            <Input.Password placeholder={t('enter_your_password')} size="large" />
          </Form.Item>
          <Form.Item name="confirm" label={<Text strong>{t('confirm_password')}</Text>} dependencies={['password']} hasFeedback rules={[
            { required: true, message: t('confirm_password_required') },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error(t('passwords_do_not_match')));
              },
            }),
          ]}>
            <Input.Password placeholder={t('re_enter_password')} size="large" />
          </Form.Item>
          <Form.Item style={{ marginTop: '40px' }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: '50px', letterSpacing: '2px' }}>
              {t('create_account')}
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <Text type="secondary">{t('already_an_artist')}</Text>
            <Link to="/login" style={{ color: '#c5a059', fontWeight: 'bold' }}>{t('sign_in')}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default Register;
