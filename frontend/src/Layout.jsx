import { NavLink, useLocation } from 'react-router';
import { Icon } from './components.jsx';

const links = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/produtos', label: 'Produtos', icon: 'box' },
  { path: '/movimentacoes', label: 'Movimentações', icon: 'exchange' },
  { path: '/usuarios', label: 'Usuários', icon: 'users', admin: true },
];

export default function Layout({ user, onLogout, loggingOut, children }) {
  const { pathname } = useLocation();
  const current = links.find(link => link.path === pathname);
  return <div className="workspace">
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <aside className="sidebar">
      <NavLink className="brand" to="/dashboard" aria-label="Gerenciamento, início"><span className="brand-symbol"><Icon name="box" width="23" height="23" /></span><span>Gerenciamento<span className="brand-caption">CONTROLE DE ESTOQUE</span></span></NavLink>
      <div className="nav-label">ESPAÇO DE TRABALHO</div>
      <nav aria-label="Navegação principal">{links.filter(link => !link.admin || user.role === 'ADMIN').map(link => <NavLink key={link.path} to={link.path} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon name={link.icon} /><span>{link.label}</span><span className="nav-dot" /></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="workspace-note"><span className="live-dot" /><span>Estoque compartilhado<small>Uma visão para toda a equipe</small></span></div><div className="user-profile"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div className="user-detail"><strong title={user.name}>{user.name}</strong><small>{user.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</small></div><button type="button" className="icon-button" aria-label="Sair da conta" title="Sair da conta" onClick={onLogout} disabled={loggingOut}><Icon name="logout" /></button></div></div>
    </aside>
    <div className="workspace-main"><header className="topbar"><div className="breadcrumb"><span>Gerenciamento</span><span className="breadcrumb-slash">/</span><strong>{current?.label || 'Dashboard'}</strong></div><span className="role-badge"><Icon name={user.role === 'ADMIN' ? 'shield' : 'user'} width="14" height="14" />{user.role === 'ADMIN' ? 'ADMIN' : 'USER'}</span></header><main id="main-content" className="page-content" key={pathname}>{children}</main><footer className="app-footer"><span>Gerenciamento</span><span>Organização em cada movimento.</span></footer></div>
  </div>;
}
