import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { login } from '../api.js';
import { Field, Icon, Notice, SubmitButton } from '../components.jsx';

export default function Login({ session, onLogin, onLogout }) {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    setError('');
    if (new TextEncoder().encode(password).length > 72) {
      setError('A senha é muito longa. Reduza a quantidade de caracteres.');
      return;
    }
    setPending(true);
    try {
      const authenticatedSession = await login({ email: email.trim(), password });
      if (!active.current) return;
      onLogin(authenticatedSession);
      setPassword('');
    } catch (err) {
      if (active.current) setError(err.message);
    } finally {
      if (active.current) setPending(false);
    }
  }

  if (session) {
    return <section className="auth-content success-content" aria-labelledby="success-title" aria-live="polite">
      <div className="success-icon"><Icon name="check" width="30" height="30" /></div>
      <span className="eyebrow">TUDO CERTO</span>
      <h2 id="success-title">Você está dentro!</h2>
      <p className="form-description">Login realizado com sucesso para <strong className="session-email">{session.email}</strong>.</p>
      <button className="primary-button" onClick={onLogout}>Sair da conta <Icon name="arrow" /></button>
      <Link className="secondary-button" to="/cadastro">Cadastre-se</Link>
    </section>;
  }

  return <section className="auth-content" aria-labelledby="login-title">
    <h1 id="login-title">Entre na sua conta</h1>
    <p className="form-description">Entre com seus dados para continuar.</p>
    <Notice success>{location.state?.registered && 'Conta criada com sucesso! Agora é só entrar.'}</Notice>
    <Notice>{error}</Notice>
    <form onSubmit={handleSubmit} aria-busy={pending}>
      <fieldset disabled={pending}>
        <Field id="email" label="E-mail" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
        <Field id="password" label="Senha" type="password" autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={72} />
        <SubmitButton pending={pending}>Entrar na minha conta</SubmitButton>
      </fieldset>
    </form>
    <div className="signup-action">
      <p>Ainda não tem conta?</p>
      <Link className="secondary-button" to="/cadastro">Cadastre-se</Link>
    </div>
  </section>;
}
