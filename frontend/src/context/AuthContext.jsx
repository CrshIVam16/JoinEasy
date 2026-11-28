import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios.js';

const AuthContext = createContext(null);

export function dashboardPathForRole(role) {
  if (role === 'student') return '/student';
  if (role === 'professor') return '/professor';
  if (role === 'admin') return '/admin';
  return '/login';
}

function isSupportedRole(role) {
  return ['student', 'professor', 'admin'].includes(role);
}

function readStoredUser() {
  try {
    const stored = localStorage.getItem('joineazy.user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    localStorage.removeItem('joineazy.user');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('joineazy.token'));
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback((session) => {
    if (!session?.token || !session.user?.id || !isSupportedRole(session.user.role)) {
      throw new Error('The server returned an invalid session.');
    }
    localStorage.setItem('joineazy.token', session.token);
    localStorage.setItem('joineazy.user', JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('joineazy.token');
    localStorage.removeItem('joineazy.user');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!token) {
        logout();
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/me');
        if (active) {
          setUser(data.user);
          localStorage.setItem('joineazy.user', JSON.stringify(data.user));
        }
      } catch (error) {
        if (active && error.response?.status === 401) logout();
      } finally {
        if (active) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, [token, logout]);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    persistSession(data);
    return data.user;
  }, [persistSession]);

  const register = useCallback(async (details) => {
    const { data } = await api.post('/auth/register', details);
    persistSession(data);
    return data.user;
  }, [persistSession]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
