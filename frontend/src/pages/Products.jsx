import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, queryString } from '../api.js';
import { useDebounce, useResource } from '../hooks.js';
import { Field, Notice } from '../components.jsx';
import { Modal, Pagination, ResourceState, money } from '../inventory-ui.jsx';

const PAGE_SIZE = 20;

function ProductForm({ product, busy, error, onSave, onClose }) {
  const [validationError, setValidationError] = useState('');

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const name = fields.get('name').trim();
    const category = fields.get('category').trim();
    const price = Number(fields.get('price'));
    const minStock = Number(fields.get('minStock'));
    setValidationError('');
    if (!name || !category) {
      setValidationError('Informe o nome e a categoria do produto.');
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000
        || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) {
      setValidationError('Informe um preço válido com até duas casas decimais.');
      return;
    }
    if (!Number.isSafeInteger(minStock) || minStock < 0 || minStock > 1_000_000_000) {
      setValidationError('O estoque mínimo deve ser um número inteiro entre 0 e 1.000.000.000.');
      return;
    }
    // O saldo é alterado exclusivamente por movimentações ou pelo ajuste auditado.
    onSave({ name, category, description: fields.get('description').trim(), price, minStock });
  }

  return <form onSubmit={submit} aria-busy={busy}>
    <Notice>{validationError || error}</Notice>
    <fieldset disabled={busy}>
      <div className="form-grid">
        <Field id="name" label="Nome do produto" name="name" defaultValue={product?.name || ''} required maxLength={120} autoFocus />
        <Field id="category" label="Categoria" name="category" defaultValue={product?.category || ''} required maxLength={80} />
        <Field id="price" label="Preço (R$)" name="price" type="number" defaultValue={product?.price ?? ''} required min={0} max={10_000_000} step="0.01" inputMode="decimal" />
        <Field id="minStock" label="Estoque mínimo" name="minStock" type="number" defaultValue={product?.minStock ?? 0} required min={0} max={1_000_000_000} step="1" inputMode="numeric" />
      </div>
      <div className="field">
        <label htmlFor="description">Descrição</label>
        <textarea id="description" name="description" rows={3} maxLength={1000} defaultValue={product?.description || ''} />
      </div>
      {!product && <p className="helper-text">O produto será criado ativo e com saldo zero. Registre uma entrada para adicionar unidades.</p>}
      <div className="dialog-actions">
        <button className="button" type="button" onClick={onClose}>Cancelar</button>
        <button className="button primary" type="submit">{busy ? 'Salvando…' : product ? 'Salvar alterações' : 'Cadastrar produto'}</button>
      </div>
    </fieldset>
  </form>;
}

function AdjustmentForm({ product, busy, error, onSave, onClose }) {
  const [validationError, setValidationError] = useState('');

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const stock = Number(fields.get('stock'));
    const reason = fields.get('reason').trim();
    setValidationError('');
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000_000) {
      setValidationError('Informe um saldo inteiro entre 0 e 1.000.000.000.');
      return;
    }
    if (stock === product.stock) {
      setValidationError('Informe um saldo diferente do atual.');
      return;
    }
    if (reason.length < 5) {
      setValidationError('Explique o ajuste com pelo menos 5 caracteres.');
      return;
    }
    onSave({ stock, reason });
  }

  return <form onSubmit={submit} aria-busy={busy}>
    <p><strong>{product.name}</strong> · Saldo atual: {product.stock}</p>
    <p className="helper-text">Use o ajuste para corrigir o saldo após uma conferência. A justificativa ficará no histórico.</p>
    <Notice>{validationError || error}</Notice>
    <fieldset disabled={busy}>
      <Field id="stock" name="stock" label="Novo saldo" type="number" defaultValue={product.stock} min={0} max={1_000_000_000} step="1" required autoFocus />
      <div className="field">
        <label htmlFor="reason">Justificativa do ajuste</label>
        <textarea id="reason" name="reason" required minLength={5} maxLength={500} rows={3} />
      </div>
      <div className="dialog-actions">
        <button className="button" type="button" onClick={onClose}>Cancelar</button>
        <button className="button primary" type="submit">{busy ? 'Ajustando…' : 'Confirmar ajuste'}</button>
      </div>
    </fieldset>
  </form>;
}

export default function Products({ user }) {
  const isAdmin = user?.role === 'ADMIN';
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ q: '', category: '', active: 'true', lowStock: searchParams.get('lowStock') === 'true' ? 'true' : '' });
  const [page, setPage] = useState(1);
  const search = useDebounce(filters.q);
  const products = useResource(`/produtos?${queryString({ ...filters, q: search.trim(), page, limit: PAGE_SIZE })}`);
  const categories = useResource('/produtos/categorias');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const items = products.data?.data || [];
  const total = products.data?.total || 0;

  useEffect(() => {
    if (!products.loading && products.data) {
      const lastPage = Math.max(1, Math.ceil(products.data.total / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
    }
  }, [products.loading, products.data, page]);

  function filterBy(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'active' && value === 'false' && { lowStock: '' }),
      ...(key === 'lowStock' && value === 'true' && { active: 'true' }),
    }));
    setPage(1);
  }

  function openDialog(type, product = null) {
    if (!isAdmin || busy) return;
    setActionError('');
    setMessage('');
    setDialog({ type, product });
  }

  function closeDialog() {
    if (!busy) setDialog(null);
  }

  async function save(body) {
    if (!isAdmin || !dialog || busy) return;
    setBusy(true);
    setActionError('');
    const { type, product } = dialog;
    const adjustment = type === 'adjust';
    const path = product ? `/produtos/${product.id}${adjustment ? '/ajuste' : ''}` : '/produtos';
    try {
      await api(path, { method: product && !adjustment ? 'PATCH' : 'POST', body });
      setMessage(adjustment ? 'Estoque ajustado com sucesso.' : type === 'status'
        ? `Produto ${body.active ? 'ativado' : 'desativado'} com sucesso.`
        : product ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.');
      setDialog(null);
      products.reload();
      if (type === 'edit') categories.reload();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="page-heading">
      <div><h1>Produtos</h1><p>Consulte o catálogo e acompanhe o saldo disponível.</p></div>
      {isAdmin && <button className="button primary" onClick={() => openDialog('edit')}>Cadastrar produto</button>}
    </header>
    <Notice success>{message}</Notice>

    <section className="panel" aria-label="Catálogo de produtos">
      <div className="toolbar">
        <Field id="product-search" label="Buscar produtos" type="search" placeholder="Nome, descrição ou categoria" maxLength={120} value={filters.q} onChange={(event) => filterBy('q', event.target.value)} />
        <div className="field">
          <label htmlFor="product-category">Categoria</label>
          <select id="product-category" value={filters.category} onChange={(event) => filterBy('category', event.target.value)}>
            <option value="">Todas as categorias</option>
            {(categories.data || []).map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="product-status">Status</label>
          <select id="product-status" value={filters.active} onChange={(event) => filterBy('active', event.target.value)}>
            <option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="product-stock-filter">Estoque</label>
          <select id="product-stock-filter" value={filters.lowStock} onChange={(event) => filterBy('lowStock', event.target.value)}>
            <option value="">Todos os saldos</option><option value="true">Estoque baixo</option><option value="false">Sem alerta</option>
          </select>
        </div>
      </div>
      {categories.error && <Notice>Não foi possível carregar as categorias. <button className="button" onClick={categories.reload}>Tentar novamente</button></Notice>}
      <ResourceState loading={products.loading} error={products.error} onRetry={products.reload} empty={!items.length}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Produto</th><th scope="col">Categoria</th><th scope="col">Preço</th><th scope="col">Saldo</th><th scope="col">Mínimo</th><th scope="col">Status</th>{isAdmin && <th scope="col">Ações</th>}</tr></thead>
            <tbody>{items.map((product) => <tr key={product.id}>
              <td><strong>{product.name}</strong>{product.description && <p className="helper-text">{product.description}</p>}</td>
              <td>{product.category}</td>
              <td>{money(product.price)}</td>
              <td>{product.stock}{product.lowStock && <span className="badge warning">Estoque baixo</span>}</td>
              <td>{product.minStock}</td>
              <td><span className={`badge ${product.active ? 'success' : 'muted'}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td>
              {isAdmin && <td><div className="actions">
                <button className="button" onClick={() => openDialog('edit', product)} aria-label={`Editar ${product.name}`}>Editar</button>
                {product.active && <button className="button" onClick={() => openDialog('adjust', product)} aria-label={`Ajustar estoque de ${product.name}`}>Ajustar estoque</button>}
                <button className={`button ${product.active ? 'danger' : ''}`} onClick={() => openDialog('status', product)} aria-label={`${product.active ? 'Desativar' : 'Ativar'} ${product.name}`}>{product.active ? 'Desativar' : 'Ativar'}</button>
              </div></td>}
            </tr>)}</tbody>
          </table>
        </div>
      </ResourceState>
      {!products.loading && !products.error && <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />}
    </section>

    {isAdmin && dialog && <Modal
      title={dialog.type === 'adjust' ? 'Ajustar estoque' : dialog.type === 'status'
        ? `${dialog.product.active ? 'Desativar' : 'Ativar'} produto`
        : dialog.product ? 'Editar produto' : 'Cadastrar produto'}
      busy={busy} onClose={closeDialog}
    >
      {dialog.type === 'edit' && <ProductForm product={dialog.product} busy={busy} error={actionError} onSave={save} onClose={closeDialog} />}
      {dialog.type === 'adjust' && <AdjustmentForm product={dialog.product} busy={busy} error={actionError} onSave={save} onClose={closeDialog} />}
      {dialog.type === 'status' && <>
        <p>Deseja {dialog.product.active ? 'desativar' : 'ativar'} <strong>{dialog.product.name}</strong>?</p>
        <p className="helper-text">{dialog.product.active ? 'Produtos inativos deixam de aceitar movimentações. O saldo e o histórico serão preservados.' : 'O produto voltará a aceitar movimentações de estoque.'}</p>
        <Notice>{actionError}</Notice>
        <div className="dialog-actions">
          <button className="button" onClick={closeDialog} disabled={busy}>Cancelar</button>
          <button className={`button ${dialog.product.active ? 'danger' : 'primary'}`} onClick={() => save({ active: !dialog.product.active })} disabled={busy}>{busy ? 'Salvando…' : `Confirmar ${dialog.product.active ? 'desativação' : 'ativação'}`}</button>
        </div>
      </>}
    </Modal>}
  </>;
}
