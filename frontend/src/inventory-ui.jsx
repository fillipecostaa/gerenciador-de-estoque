import { useEffect, useId, useRef } from 'react';
import { Notice } from './components.jsx';

export const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
export const formatDate = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export const movementLabels = { IN: 'Entrada', OUT: 'Saída', ADJUSTMENT: 'Correção' };

export function Modal({ title, onClose, busy = false, children }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

export function Pagination({ page, total, limit = 20, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <nav className="pagination" aria-label="Paginação"><span>{total} registro{total === 1 ? '' : 's'} · Página {page} de {pages}</span><div className="actions"><button type="button" className="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button><button type="button" className="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</button></div></nav>;
}

export function ResourceState({ loading, error, onRetry, empty, children }) {
  if (loading) return <div className="loading-state" role="status"><span className="spinner" /> Carregando…</div>;
  if (error) return <div className="resource-error"><Notice>{error}</Notice>{onRetry && <button type="button" className="button" onClick={onRetry}>Tentar novamente</button>}</div>;
  if (empty) return <p className="empty-state">Nenhum registro encontrado.</p>;
  return children;
}

export function MovementTable({ movements }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Saldo</th><th>Motivo</th><th>Responsável</th><th>Data</th></tr></thead><tbody>{movements.map(item => <tr key={item.id}>
    <td>{item.productName}</td><td><span className={`badge ${item.type === 'IN' ? 'success' : item.type === 'OUT' ? 'warning' : 'muted'}`}>{movementLabels[item.type] || item.type}</span></td>
    <td>{item.delta > 0 ? '+' : ''}{item.delta}</td><td className="nowrap">{item.stockBefore} → {item.stockAfter}</td><td>{item.reason}</td><td>{item.userName}</td><td className="nowrap">{formatDate(item.createdAt)}</td>
  </tr>)}</tbody></table></div>;
}
