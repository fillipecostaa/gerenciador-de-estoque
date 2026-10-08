import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { register } from '../api.js';
import { Field, Notice, SubmitButton } from '../components.jsx';

export default function Register() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const name = fields.get('name').trim();
    const email = fields.get('email').trim();
    const password = fields.get('password');
    const errors = {};
    setError('');
    if (!name) errors.name = 'Informe seu nome.';
    if (Array.from(password).length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres.';
    if (new TextEncoder().encode(password).length > 72) errors.password = 'Senha muito longa. Reduza a quantidade de caracteres.';
    if (password !== fields.get('confirmPassword')) errors.confirmPassword = 'As senhas precisam ser iguais.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      form.elements.namedItem(Object.keys(errors)[0]).focus();
      return;
    }
    setPending(true);
    try {
      await register({ name, email, password });
      if (!active.current) return;
      navigate('/login', { replace: true, state: { registered: true, email } });
    } catch (err) {
      if (active.current) setError(err.message);
    } finally {
      if (active.current) setPending(false);
    }
  }

  return <section className="auth-content register-content" aria-labelledby="register-title">
    <h1 id="register-title">Crie sua conta</h1>
    <p className="form-description">Preencha os dados abaixo.</p>
    <Notice>{error}</Notice>
    <form onSubmit={handleSubmit} aria-busy={pending} onChange={() => setFieldErrors({})}>
      <fieldset disabled={pending}>
        <Field id="name" label="Nome" autoComplete="name" placeholder="Como podemos chamar você?" required maxLength={120} error={fieldErrors.name} />
        <Field id="email" label="E-mail" type="email" autoComplete="email" placeholder="voce@exemplo.com" required maxLength={254} />
        <Field id="password" label="Senha" type="password" autoComplete="new-password" placeholder="Crie uma senha" hint="Use pelo menos 6 caracteres." required minLength={6} maxLength={72} error={fieldErrors.password} />
        <Field id="confirmPassword" label="Confirmar senha" type="password" autoComplete="new-password" placeholder="Repita sua senha" required minLength={6} maxLength={72} error={fieldErrors.confirmPassword} />
        <SubmitButton pending={pending}>Criar minha conta</SubmitButton>
      </fieldset>
    </form>
    <p className="form-switch">Já faz parte? <Link to="/login">Entre na sua conta</Link></p>
  </section>;
}
