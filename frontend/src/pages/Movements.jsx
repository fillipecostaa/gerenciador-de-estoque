import { useState } from 'react';
import { api, queryString } from '../api.js';
import { Field, Notice } from '../components.jsx';
import { useDebounce, useResource } from '../hooks.js';
import { Modal, MovementTable, Pagination, ResourceState } from '../inventory-ui.jsx';

function NewMovement({ onClose, onSaved }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const query = useDebounce(search.trim());
  const products = useResource(`/produtos?${queryString({ q: query, active: 'true', page, limit: 10 })}`);

  function review(event) {
    event.preventDefault();
    setError('');
    if (!selected) { setError('Selecione um produto.'); return; }
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get('quantity'));
    const reason = form.get('reason').trim();
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000000) { setError('Informe uma quantidade inteira válida.'); return; }
    if (reason.length < 3) { setError('Informe um motivo com pelo menos 3 caracteres.'); return; }
    setDraft({ productId: selected.id, type: form.get('type'), quantity, reason });
  }

  async function submit() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await api('/movimentacoes', { method: 'POST', body: draft });
      onSaved();
    } catch (err) { setError(err.message); setPending(false); }
  }

  return <Modal title="Registrar movimentação" onClose={onClose} busy={pending}>
    <Notice>{error}</Notice>
    {draft ? <>
      <p>Confirmar {draft.type === 'IN' ? 'entrada' : 'saída'} de <strong>{draft.quantity} unidade(s)</strong> de <strong>{selected.name}</strong>?</p>
      <p className="helper-text">Motivo: {draft.reason}</p><p className="helper-text">Esta movimentação fará parte do histórico e não poderá ser editada ou excluída.</p>
      <div className="dialog-actions"><button type="button" className="button" disabled={pending} onClick={() => { setDraft(null); setError(''); }}>Voltar</button><button type="button" className="button primary" disabled={pending} onClick={submit}>{pending ? 'Registrando…' : 'Confirmar movimentação'}</button></div>
    </> : <form onSubmit={review}>
      <Field id="product-search" label="Buscar produto" placeholder="Nome ou categoria" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <ResourceState {...products} onRetry={products.reload} empty={products.data?.data.length === 0}>
        <div className="product-options" role="group" aria-label="Selecione um produto">{products.data?.data.map(product => <button key={product.id} type="button" className={`product-option ${selected?.id === product.id ? 'selected' : ''}`} aria-pressed={selected?.id === product.id} onClick={() => setSelected(product)}><span>{product.name}</span><small>Estoque: {product.stock}</small></button>)}</div>
      </ResourceState>
      {products.data && <Pagination page={page} total={products.data.total} limit={10} onChange={setPage} />}
      {selected && <p className="helper-text">Selecionado: <strong>{selected.name}</strong> · saldo exibido: {selected.stock}</p>}
      <div className="form-grid"><div className="field"><label htmlFor="movement-type">Tipo</label><select id="movement-type" name="type"><option value="IN">Entrada</option><option value="OUT">Saída</option></select></div>
        <Field id="quantity" label="Quantidade" type="number" min="1" max="1000000000" step="1" required />
      </div>
      <Field id="reason" label="Motivo" required minLength={3} maxLength={500} placeholder="Descreva o motivo da movimentação" />
      <div className="dialog-actions"><button type="button" className="button" onClick={onClose}>Cancelar</button><button className="button primary" type="submit" disabled={!selected}>Revisar movimentação</button></div>
    </form>}
  </Modal>;
}

export default function Movements({ user }) {
  const [filters, setFilters] = useState({ q: '', type: '', dateFrom: '', dateTo: '' });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState('');
  const q = useDebounce(filters.q.trim());
  const params = { ...filters, q, page };
  if (filters.dateFrom) params.dateFrom = new Date(`${filters.dateFrom}T00:00:00`).toISOString();
  if (filters.dateTo) params.dateTo = new Date(`${filters.dateTo}T23:59:59.999`).toISOString();
  const resource = useResource(`/movimentacoes?${queryString(params)}`);
  const change = event => { setFilters(current => ({ ...current, [event.target.name]: event.target.value })); setPage(1); };
  return <section>
    <div className="page-heading"><div><h1>Movimentações</h1><p>{user.role === 'ADMIN' ? 'Consulte o histórico de toda a equipe.' : 'Consulte as movimentações registradas por você.'}</p></div><button className="button primary" onClick={() => { setCreating(true); setSuccess(''); }}>Registrar movimentação</button></div>
    <Notice success>{success}</Notice>
    <div className="toolbar"><div className="field"><label htmlFor="movement-search">Buscar no histórico</label><input id="movement-search" name="q" placeholder="Produto, responsável ou motivo" maxLength={120} value={filters.q} onChange={change} /></div>
      <div className="field"><label htmlFor="type-filter">Tipo</label><select id="type-filter" name="type" value={filters.type} onChange={change}><option value="">Todos</option><option value="IN">Entrada</option><option value="OUT">Saída</option><option value="ADJUSTMENT">Correção</option></select></div>
      <div className="field"><label htmlFor="date-from">De</label><input id="date-from" name="dateFrom" type="date" max="9999-12-31" value={filters.dateFrom} onChange={change} /></div><div className="field"><label htmlFor="date-to">Até</label><input id="date-to" name="dateTo" type="date" max="9999-12-31" value={filters.dateTo} onChange={change} /></div>
    </div>
    <div className="panel"><ResourceState {...resource} onRetry={resource.reload} empty={resource.data?.data.length === 0}>
      {resource.data && <MovementTable movements={resource.data.data} />}
    </ResourceState>{resource.data && <Pagination page={page} total={resource.data.total} limit={resource.data.limit} onChange={setPage} />}</div>
    <p className="helper-text">O histórico é permanente. Correções de saldo são registradas pelo administrador como novas movimentações.</p>
    {creating && <NewMovement onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setSuccess('Movimentação registrada com sucesso.'); resource.reload(); }} />}
  </section>;
}
