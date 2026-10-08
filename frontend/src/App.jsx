import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { api, getToken, setToken } from './api.js';
import { Icon, Notice } from './components.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Movements from './pages/Movements.jsx';
import Products from './pages/Products.jsx';
import Users from './pages/Users.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [checkError, setCheckError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const titles = { '/login': 'Entrar', '/cadastro': 'Criar conta', '/dashboard': 'Dashboard', '/produtos': 'Produtos', '/movimentacoes': 'Movimentações', '/usuarios': 'Usuários' };
    document.title = `${titles[pathname] || 'Estoque'} · Gerenciamento`;
  }, [pathname]);

  useEffect(() => {
    const expired = () => {
      setToken(null);
      setUser(null);
      setChecking(false);
      navigate('/login', { replace: true, state: { message: 'Sua sessão expirou. Entre novamente.' } });
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [navigate]);

  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    const controller = new AbortController();
    setChecking(true);
    setCheckError('');
    api('/auth/me', { signal: controller.signal }).then(currentUser => {
      if (!controller.signal.aborted) setUser(currentUser);
    }).catch(error => {
      if (!controller.signal.aborted && error.status !== 401) setCheckError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setChecking(false);
    });
    return () => controller.abort();
  }, [attempt]);

  function handleLogin(session) {
    setToken(session.token);
    setUser(session.user);
    navigate('/dashboard', { replace: true });
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    let message = '';
    try { await api('/auth/logout', { method: 'POST' }); }
    catch (error) {
      if (error.status !== 401) message = 'Você saiu deste navegador. Não foi possível encerrar a sessão no servidor; ela continuará válida até expirar.';
    } finally {
      setToken(null);
      setUser(null);
      setCheckError('');
      setLoggingOut(false);
      navigate('/login', { replace: true, state: { message, loggedOut: !message } });
    }
  }

  if (checking) return <main className="auth-shell"><div className="loading-state" role="status"><span className="spinner" /> Verificando sua sessão…</div></main>;
  if (checkError) return <main className="auth-shell"><section className="auth-content"><div className="auth-brand"><Icon name="box" /> Gerenciamento</div><h1>Vamos reconectar</h1><Notice>{checkError}</Notice><button className="primary-button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button><button className="secondary-button top-gap" onClick={logout} disabled={loggingOut}>Sair da conta</button></section></main>;

  if (!user) return <main className="auth-shell"><Routes>
    <Route path="/login" element={<Login onLogin={handleLogin} />} />
    <Route path="/cadastro" element={<Register />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes></main>;

  return <Layout user={user} onLogout={logout} loggingOut={loggingOut}><Routes>
    <Route path="/dashboard" element={<Dashboard user={user} />} />
    <Route path="/produtos" element={<Products user={user} />} />
    <Route path="/movimentacoes" element={<Movements user={user} />} />
    <Route path="/usuarios" element={user.role === 'ADMIN' ? <Users user={user} onUserChange={setUser} /> : <Navigate to="/dashboard" replace />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></Layout>;
}
