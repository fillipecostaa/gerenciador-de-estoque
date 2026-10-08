import { useEffect, useState } from 'react';
import { api, queryString } from '../api.js';
import { Field, Notice } from '../components.jsx';
import { useDebounce, useResource } from '../hooks.js';
import { Modal, Pagination, ResourceState } from '../inventory-ui.jsx';

const roleLabel = role => role === 'ADMIN' ? 'Administrador' : 'Usuário';

export default function Users({ user, onUserChange }) {
  if (user?.role !== 'ADMIN') return <Notice>Você não tem permissão para gerenciar usuários.</Notice>;
  return <UsersAdmin user={user} onUserChange={onUserChange} />;
}

function UsersAdmin({ user, onUserChange }) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'USER', active: true });
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const query = useDebounce(search.trim());
  const resource = useResource(`/usuarios?${queryString({ q: query, role, active, page, limit: 20 })}`);
  const users = resource.data?.data || [];
  const total = resource.data?.total || 0;

  useEffect(() => {
    if (resource.data && page > Math.max(1, Math.ceil(resource.data.total / 20))) {
      setPage(Math.max(1, Math.ceil(resource.data.total / 20)));
    }
  }, [resource.data, page]);

  function openEdit(target) {
    setEditing(target);
    setForm({ name: target.name, role: target.role, active: target.active });
    setConfirmation(null);
    setError('');
    setSuccess('');
  }

  function closeDialog() {
    if (busy) return;
    setEditing(null);
    setConfirmation(null);
    setError('');
  }

  function reviewEdit(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || name.length > 120) {
      setError('Informe um nome com até 120 caracteres.');
      return;
    }
    const changes = {};
    if (name !== editing.name) changes.name = name;
    if (editing.id !== user.id) {
      if (form.role !== editing.role) changes.role = form.role;
      if (form.active !== editing.active) changes.active = form.active;
    }
    if (!Object.keys(changes).length) {
      setError('Altere pelo menos um campo antes de continuar.');
      return;
    }
    setError('');
    setConfirmation({ target: editing, changes });
  }

  function reviewStatus(target) {
    if (target.id === user.id) return;
    setEditing(null);
    setConfirmation({ target, changes: { active: !target.active } });
    setError('');
    setSuccess('');
  }

  async function confirmChange() {
    if (busy || !confirmation) return;
    setBusy(true);
    setError('');
    try {
      // Only explicit editable fields are sent; list records include identity
      // fields that must never be copied wholesale into an update request.
      const body = {};
      for (const field of ['name', 'role', 'active']) {
        if (Object.hasOwn(confirmation.changes, field)) body[field] = confirmation.changes[field];
      }
      const updated = await api(`/usuarios/${confirmation.target.id}`, { method: 'PATCH', body });
      if (updated.id === user.id) onUserChange?.(updated);
      setEditing(null);
      setConfirmation(null);
      setSuccess('Usuário atualizado com sucesso.');
      resource.reload();
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível atualizar o usuário. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  const permissionsChanged = confirmation && (Object.hasOwn(confirmation.changes, 'role') || Object.hasOwn(confirmation.changes, 'active'));
  const deactivating = confirmation?.changes.active === false;

  return <>
    <header className="page-heading">
      <div><h1>Usuários</h1><p>Gerencie os perfis e o acesso da sua equipe.</p></div>
    </header>
    <Notice success>{success}</Notice>
    <section className="panel" aria-label="Usuários cadastrados">
      <div className="toolbar">
        <Field id="users-search" label="Buscar usuários" type="search" placeholder="Nome ou e-mail" maxLength={120} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        <div className="field">
          <label htmlFor="users-role">Perfil</label>
          <select id="users-role" value={role} onChange={event => { setRole(event.target.value); setPage(1); }}>
            <option value="">Todos os perfis</option><option value="ADMIN">Administrador</option><option value="USER">Usuário</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="users-active">Status</label>
          <select id="users-active" value={active} onChange={event => { setActive(event.target.value); setPage(1); }}>
            <option value="">Todos os status</option><option value="true">Ativos</option><option value="false">Inativos</option>
          </select>
        </div>
      </div>
      <ResourceState loading={resource.loading} error={resource.error} onRetry={resource.reload} empty={!users.length}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead>
            <tbody>{users.map(target => <tr key={target.id}>
              <td>{target.name}{target.id === user.id && <span className="badge muted">Você</span>}</td>
              <td>{target.email}</td>
              <td><span className={`badge ${target.role === 'ADMIN' ? 'warning' : 'muted'}`}>{roleLabel(target.role)}</span></td>
              <td><span className={`badge ${target.active ? 'success' : 'muted'}`}>{target.active ? 'Ativo' : 'Inativo'}</span></td>
              <td><div className="actions">
                <button type="button" className="button" onClick={() => openEdit(target)} aria-label={`Editar ${target.name}`}>Editar</button>
                <button type="button" className={`button ${target.active ? 'danger' : ''}`} disabled={target.id === user.id} title={target.id === user.id ? 'Você não pode desativar sua própria conta.' : undefined} onClick={() => reviewStatus(target)} aria-label={`${target.active ? 'Desativar' : 'Ativar'} ${target.name}`}>{target.active ? 'Desativar' : 'Ativar'}</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </ResourceState>
    </section>

    {(editing || confirmation) && <Modal title={confirmation ? 'Confirmar alteração' : 'Editar usuário'} onClose={closeDialog} busy={busy}>
      <Notice>{error}</Notice>
      {confirmation ? <>
        <p>Revise as alterações de <strong>{confirmation.target.name}</strong> ({confirmation.target.email}).</p>
        <dl>
          {Object.hasOwn(confirmation.changes, 'name') && <><dt>Nome</dt><dd>{confirmation.changes.name}</dd></>}
          {Object.hasOwn(confirmation.changes, 'role') && <><dt>Perfil</dt><dd>{roleLabel(confirmation.changes.role)}</dd></>}
          {Object.hasOwn(confirmation.changes, 'active') && <><dt>Status</dt><dd>{confirmation.changes.active ? 'Ativo' : 'Inativo'}</dd></>}
        </dl>
        {permissionsChanged && <p className="helper-text">A mudança de perfil ou status encerra as sessões atuais deste usuário.{deactivating ? ' Ele não poderá entrar enquanto a conta estiver inativa.' : ''}</p>}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={() => { if (editing) { setConfirmation(null); setError(''); } else closeDialog(); }}>{editing ? 'Voltar' : 'Cancelar'}</button>
          <button type="button" className={`button ${deactivating ? 'danger' : 'primary'}`} disabled={busy} onClick={confirmChange}>{busy ? 'Salvando…' : 'Confirmar alteração'}</button>
        </div>
      </> : <form onSubmit={reviewEdit}>
        <div className="form-grid">
          <Field id="edit-user-name" label="Nome" value={form.name} required maxLength={120} autoComplete="off" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
          <div className="field">
            <label htmlFor="edit-user-role">Perfil</label>
            <select id="edit-user-role" value={form.role} disabled={editing.id === user.id} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>
              <option value="USER">Usuário</option><option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-user-active">Status</label>
            <select id="edit-user-active" value={String(form.active)} disabled={editing.id === user.id} onChange={event => setForm(current => ({ ...current, active: event.target.value === 'true' }))}>
              <option value="true">Ativo</option><option value="false">Inativo</option>
            </select>
          </div>
        </div>
        <p className="helper-text">E-mail: {editing.email}</p>
        {editing.id === user.id && <p className="helper-text">Você pode alterar seu nome. Seu próprio perfil de administrador e status ficam protegidos.</p>}
        <div className="dialog-actions"><button type="button" className="button" onClick={closeDialog}>Cancelar</button><button type="submit" className="button primary">Revisar alteração</button></div>
      </form>}
    </Modal>}
  </>;
}
