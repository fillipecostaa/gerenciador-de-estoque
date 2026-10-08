import { useState } from 'react';

export function Icon({ name, ...props }) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a21 21 0 0 1-3 3.8M6.1 6.1C3.4 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.3-.5 4.7-1.3M10 10a3 3 0 0 0 4 4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    box: <><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10 9-5M3 8l9 5v8M7.5 5.5l9 5" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    exchange: <path d="M3 7h17l-4-4m5 14H4l4 4M20 7l-4 4M4 17l4-4" />,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    logout: <path d="M10 4H4v16h6m4-12 4 4-4 4m-5-4h12" />,
    shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function Field({ label, id, hint, error, type = 'text', ...props }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} name={id} type={isPassword && visible ? 'text' : type} className={isPassword ? 'password-input' : ''} aria-invalid={!!error} aria-describedby={description} {...props} />
        {isPassword && <button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible}><Icon name={visible ? 'hidden' : 'eye'} /></button>}
      </div>
      {hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

export function Notice({ children, success = false }) {
  if (!children) return null;
  return <div className={`notice ${success ? 'notice-success' : ''}`} role={success ? 'status' : 'alert'}>{children}</div>;
}

export function SubmitButton({ pending, children }) {
  return <button className="primary-button" type="submit" disabled={pending}>{pending ? <><span className="spinner" /> Aguarde…</> : <>{children}<Icon name="arrow" /></>}</button>;
}
