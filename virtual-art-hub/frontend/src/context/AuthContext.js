import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL, apiUrl, devApiProxyMode } from '../apiBase';
import { clearStoredPublicVisitPath } from '../publicVisitSession';

export const AuthContext = createContext();

axios.defaults.baseURL = devApiProxyMode() ? '' : API_BASE_URL;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['x-auth-token'] = token;
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      try {
        const res = await axios.get(apiUrl('/auth/user'));
        clearStoredPublicVisitPath();
        setUser(res.data);
      } catch (err) {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['x-auth-token'];
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUser();
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(apiUrl('/auth/login'), { email, password });
    localStorage.setItem('token', res.data.token);
    await loadUser();
  };

  const register = async (username, email, password) => {
    const res = await axios.post(apiUrl('/auth/register'), { username, email, password });
    localStorage.setItem('token', res.data.token);
    await loadUser();
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['x-auth-token'];
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};
