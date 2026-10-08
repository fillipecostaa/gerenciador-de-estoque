import { Link } from 'react-router';
import { useResource } from '../hooks.js';
import { money, MovementTable, ResourceState } from '../inventory-ui.jsx';

export default function Dashboard({ user }) {
  const resource = useResource('/dashboard');
  const data = resource.data;
  return <section>
    <div className="page-heading"><div><h1>Dashboard</h1><p>Olá, {user.name}. Acompanhe o estoque da equipe.</p></div><Link className="button primary" to="/movimentacoes">Registrar movimentação</Link></div>
    <ResourceState {...resource} onRetry={resource.reload}>
      {data && <>
        <div className="stats-grid">{[
          ['Produtos ativos', data.summary.activeProducts],
          ['Unidades em estoque', data.summary.totalUnits],
          ['Valor do estoque', money(data.summary.totalValue)],
          ['Estoque baixo', data.summary.lowStockProducts],
          [user.role === 'ADMIN' ? 'Movimentações em 24h' : 'Suas movimentações em 24h', data.summary.movementsLast24h],
        ].map(([label, value]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <section className="panel"><div className="panel-heading"><h2>Alertas de estoque baixo</h2><Link to="/produtos?lowStock=true">Ver produtos</Link></div>
          {data.lowStockItems.length ? <ul className="stock-alerts">{data.lowStockItems.map(product => <li key={product.id}><div><strong>{product.name}</strong><small>{product.category}</small></div><span className="badge warning">{product.stock} em estoque · mínimo {product.minStock}</span></li>)}</ul> : <p className="empty-state">Nenhum produto com estoque baixo.</p>}
        </section>
        <section className="panel"><div className="panel-heading"><h2>{user.role === 'ADMIN' ? 'Movimentações recentes' : 'Suas movimentações recentes'}</h2><Link to="/movimentacoes">Ver histórico</Link></div>
          {data.recentMovements.length ? <MovementTable movements={data.recentMovements} /> : <p className="empty-state">Nenhuma movimentação registrada.</p>}
        </section>
      </>}
    </ResourceState>
  </section>;
}
