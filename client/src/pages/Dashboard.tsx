import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  DollarSign,
  ShoppingBag,
  Package,
  ShoppingCart,
  CalendarDays,
  TriangleAlert,
} from 'lucide-react';
import { useAuth, useShop } from '../app/providers';
import { api, money, date } from '../lib/api';
import type { Analytics } from '../types';
import {
  PageHeader,
  LoadingSkeleton,
  ErrorState,
  StatusBadge,
  DataTable,
  EmptyState,
  ProductAvatar,
} from '../components/ui';
import { RevenueChart, OrderStatusChart, CategoryChart } from '../components/Charts';
export function StatCard({
  title,
  value,
  icon: Icon,
  note,
}: {
  title: string;
  value: string;
  icon: typeof Package;
  note: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-label">
        {title}
        <span className="stat-icon">
          <Icon size={17} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">
        <span className="tiny-dot" />
        {note}
      </div>
    </section>
  );
}
export function Dashboard({ analytics = false }: { analytics?: boolean }) {
  const { user } = useAuth();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'USD';
  const [days, setDays] = useState('30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [group, setGroup] = useState('daily');
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - ((days === 'custom' ? 30 : Number(days)) - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const params = {
    from: days === 'custom' ? custom.from || today : start,
    to: days === 'custom' ? custom.to || today : today,
    group,
  };
  const q = useQuery<Analytics>({
    queryKey: ['analytics', params],
    queryFn: async () => (await api.get('/analytics/overview', { params })).data.data,
  });
  const d = q.data;
  return (
    <>
      <PageHeader
        title={analytics ? 'Analytics' : `Business overview`}
        description={
          analytics
            ? 'A closer look at your store’s performance.'
            : `Welcome back, ${user?.name.split(' ')[0]}. Here’s how your store is doing.`
        }
        actions={
          <div className="range-selector">
            <CalendarDays size={16} />
            <select aria-label="Date range" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
        }
      />
      {days === 'custom' && (
        <div className="custom-range">
          <label>
            From
            <input
              type="date"
              value={custom.from}
              max={custom.to || today}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              max={today}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </label>
        </div>
      )}
      {q.isPending ? (
        <LoadingSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        d && (
          <>
            <div className="stats-grid">
              <StatCard
                title="Total revenue"
                value={money(d.metrics.revenue, currency)}
                icon={DollarSign}
                note="Paid, non-cancelled orders"
              />
              <StatCard
                title="Total orders"
                value={d.metrics.orders.toLocaleString()}
                icon={ShoppingBag}
                note="Orders in selected period"
              />
              <StatCard
                title="Active products"
                value={d.metrics.products.toLocaleString()}
                icon={Package}
                note="Currently in your catalog"
              />
              <StatCard
                title="Average order value"
                value={money(d.metrics.averageOrderValue, currency)}
                icon={ShoppingCart}
                note={`${d.metrics.paidOrders} revenue-eligible orders`}
              />
            </div>
            <div className="chart-grid">
              <section className="card revenue-card">
                <div className="card-heading">
                  <div>
                    <h2>Revenue overview</h2>
                    <p>Your sales performance over time</p>
                  </div>
                  <div className="segmented">
                    {['daily', 'weekly', 'monthly'].map((g) => (
                      <button
                        key={g}
                        onClick={() => setGroup(g)}
                        className={g === group ? 'selected' : ''}
                      >
                        {g[0].toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-metric">
                  {money(d.metrics.revenue, currency)}
                  <span>
                    <i />
                    Revenue
                  </span>
                </div>
                <RevenueChart data={d.series} currency={currency} />
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Orders by status</h2>
                    <p>A snapshot of your order pipeline</p>
                  </div>
                </div>
                <OrderStatusChart data={d.statuses} />
              </section>
            </div>
            {analytics ? (
              <>
                <div className="chart-grid equal">
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h2>Orders over time</h2>
                        <p>All orders in the selected period</p>
                      </div>
                    </div>
                    <RevenueChart data={d.series} currency={currency} orders />
                  </section>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h2>Revenue by category</h2>
                        <p>Item revenue, excluding shipping</p>
                      </div>
                    </div>
                    {d.categories.length ? (
                      <CategoryChart data={d.categories} currency={currency} />
                    ) : (
                      <EmptyState title="No category sales yet" />
                    )}
                  </section>
                </div>
              </>
            ) : (
              <section className="card recent-orders">
                <div className="card-heading">
                  <div>
                    <h2>
                      Recent orders <span className="count-pill">{d.metrics.orders}</span>
                    </h2>
                    <p>Keep an eye on your latest activity</p>
                  </div>
                  <Link className="text-link" to="/orders">
                    View all orders
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
                {d.recentOrders.length ? (
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th className="text-right">Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentOrders.map((o) => (
                        <tr key={o._id}>
                          <td>
                            <Link className="order-link" to={`/orders/${o._id}`}>
                              #{o.orderNumber}
                            </Link>
                          </td>
                          <td>
                            <div className="customer-cell">
                              <span className="customer-avatar">
                                {o.customerName
                                  .split(' ')
                                  .map((s) => s[0])
                                  .join('')}
                              </span>
                              <div>
                                <strong>{o.customerName}</strong>
                                <small>{o.customerEmail}</small>
                              </div>
                            </div>
                          </td>
                          <td className="muted">{date(o.createdAt)}</td>
                          <td>
                            <StatusBadge status={o.orderStatus} />
                          </td>
                          <td className="text-right amount">{money(o.totalAmount, currency)}</td>
                          <td>
                            <Link
                              className="row-arrow"
                              aria-label={`View order ${o.orderNumber}`}
                              to={`/orders/${o._id}`}
                            >
                              <ArrowUpRight size={16} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : (
                  <EmptyState title="No orders in this period" />
                )}
              </section>
            )}
            <div className="bottom-grid">
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Top selling products</h2>
                    <p>Your customers’ favorites this period</p>
                  </div>
                  <Link className="icon-button" to="/products" aria-label="View products">
                    <ArrowUpRight size={18} />
                  </Link>
                </div>
                {d.topProducts.length ? (
                  <div className="top-products">
                    {d.topProducts.map((p, i) => (
                      <div className="top-product" key={p._id}>
                        <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                        <ProductAvatar name={p.name} />
                        <div className="grow">
                          <strong>{p.name}</strong>
                          <small>{p.units} units sold</small>
                        </div>
                        <strong>{money(p.revenue, currency)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No sales in this period" />
                )}
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>
                      <TriangleAlert size={17} className="amber" />
                      Low stock alerts{' '}
                      <span className="count-pill warning">{d.lowStock.length}</span>
                    </h2>
                    <p>A little attention goes a long way</p>
                  </div>
                  <Link className="text-link" to="/products?stock=low">
                    View inventory
                    <ArrowRight size={15} />
                  </Link>
                </div>
                {d.lowStock.length ? (
                  <div className="low-products">
                    {d.lowStock.map((p) => (
                      <div key={p._id}>
                        <ProductAvatar name={p.name} category={p.category} imageUrl={p.imageUrl} />
                        <div className="grow">
                          <strong>{p.name}</strong>
                          <small>{p.sku}</small>
                        </div>
                        <span className="stock-alert">{p.stockQuantity} left</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Inventory looks healthy"
                    description="Your active products are above their stock thresholds."
                  />
                )}
              </section>
            </div>
            <p className="metric-note">
              All amounts are shown in {currency}. Revenue includes shipping on paid, non-cancelled
              orders. Dates use UTC. Currency preference changes formatting, not conversion.
            </p>
          </>
        )
      )}
    </>
  );
}
