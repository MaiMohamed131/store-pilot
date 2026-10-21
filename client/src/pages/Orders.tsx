import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, ArrowLeft, ShoppingBag, UserRound, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useShop } from '../app/providers';
import { api, money, date, errorMessage } from '../lib/api';
import type { List, Order, Status } from '../types';
import {
  PageHeader,
  SearchInput,
  FilterBar,
  DataTable,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  StatusBadge,
  Pagination,
} from '../components/ui';
import { OrderStatusControl } from '../features/OrderStatusControl';
export function Orders() {
  const { data: shop } = useShop();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const q = useQuery<List<Order>>({
    queryKey: ['orders', { search, status, page, from, to, sort }],
    queryFn: async () =>
      (
        await api.get('/orders', {
          params: {
            search,
            status: status || undefined,
            page,
            from: from || undefined,
            to: to || undefined,
            sort: sort.split(':')[0],
            direction: sort.split(':')[1],
          },
        })
      ).data,
  });
  const filter = (setter: (v: string) => void, v: string) => {
    setter(v);
    setPage(1);
  };
  return (
    <>
      <PageHeader
        title="Orders"
        description="From the first click to the doorstep. Keep things moving."
      />
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>
              <ShoppingBag size={18} />
              All orders <span className="count-pill">{q.data?.meta.total ?? '—'}</span>
            </h2>
            <p>Track and manage your customer orders</p>
          </div>
        </div>
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(v) => filter(setSearch, v)}
            placeholder="Search order or customer…"
          />
          <select
            aria-label="Order status"
            value={status}
            onChange={(e) => filter(setStatus, e.target.value)}
          >
            <option value="">All statuses</option>
            {['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            aria-label="Orders from date"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => filter(setFrom, e.target.value)}
          />
          <input
            aria-label="Orders to date"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => filter(setTo, e.target.value)}
          />
          <select
            aria-label="Sort orders"
            value={sort}
            onChange={(e) => filter(setSort, e.target.value)}
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="totalAmount:desc">Highest total</option>
            <option value="totalAmount:asc">Lowest total</option>
          </select>
        </FilterBar>
        {q.isPending ? (
          <LoadingSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : q.data.data.length ? (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((o) => (
                  <tr key={o._id}>
                    <td>
                      <Link className="order-link" to={`/orders/${o._id}`}>
                        #{o.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <strong>{o.customerName}</strong>
                      <small>{o.customerEmail}</small>
                    </td>
                    <td className="muted">{date(o.createdAt)}</td>
                    <td>
                      <StatusBadge status={o.orderStatus} />
                    </td>
                    <td>
                      <StatusBadge status={o.paymentStatus} />
                    </td>
                    <td className="text-right amount">{money(o.totalAmount, shop?.currency)}</td>
                    <td>
                      <Link
                        className="row-arrow"
                        aria-label={`View ${o.orderNumber}`}
                        to={`/orders/${o._id}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={page} total={q.data.meta.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="No matching orders" />
        )}
      </section>
    </>
  );
}
export function OrderDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: shop } = useShop();
  const cache = useQueryClient();
  const q = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data.data,
  });
  const mutation = useMutation({
    mutationFn: (status: Status) => api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      for (const key of ['order', 'orders', 'analytics', 'products'])
        void cache.invalidateQueries({ queryKey: [key] });
      toast.success('Order status updated.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isPending) return <LoadingSkeleton />;
  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const o = q.data;
  return (
    <>
      <Link className="text-link back-link" to="/orders">
        <ArrowLeft size={16} />
        Back to orders
      </Link>
      <PageHeader
        title={`Order #${o.orderNumber}`}
        description={`Placed on ${date(o.createdAt)}`}
        actions={<StatusBadge status={o.orderStatus} />}
      />
      <div className="detail-grid">
        <section className="card">
          <div className="card-heading">
            <h2>Order items</h2>
            <span className="count-pill">{o.items.length} items</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit price</th>
                <th>Quantity</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((i, k) => (
                <tr key={k}>
                  <td>
                    <strong>{i.name}</strong>
                    <small>{i.sku}</small>
                  </td>
                  <td>{money(i.unitPrice, shop?.currency)}</td>
                  <td>{i.quantity}</td>
                  <td className="text-right">{money(i.lineTotal, shop?.currency)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <div className="order-totals">
            <div>
              <span>Subtotal</span>
              <span>{money(o.subtotal, shop?.currency)}</span>
            </div>
            <div>
              <span>Shipping</span>
              <span>{money(o.shippingAmount, shop?.currency)}</span>
            </div>
            <div className="total">
              <strong>Total</strong>
              <strong>{money(o.totalAmount, shop?.currency)}</strong>
            </div>
          </div>
          <div className="card-pad">
            <h3>Manage order</h3>
            <OrderStatusControl
              status={o.orderStatus}
              role={user?.role ?? 'STAFF'}
              pending={mutation.isPending}
              onUpdate={(s) => mutation.mutate(s)}
            />
          </div>
        </section>
        <div className="detail-aside">
          <section className="card card-pad">
            <h2>
              <UserRound size={18} />
              Customer details
            </h2>
            <h3>{o.customerName}</h3>
            <a className="text-link" href={`mailto:${o.customerEmail}`}>
              {o.customerEmail}
            </a>
            <hr />
            <span className="muted">Payment status</span>
            <div className="mt">
              <StatusBadge status={o.paymentStatus} />
            </div>
          </section>
          <section className="card card-pad">
            <h2>
              <Clock size={18} />
              Status history
            </h2>
            <div className="timeline">
              <div>
                <strong>Order created</strong>
                <small>{date(o.createdAt)}</small>
              </div>
              {o.history.map((h, i) => (
                <div key={i}>
                  <strong>
                    {h.from} → {h.to}
                  </strong>
                  <small>
                    {h.actor?.name ?? 'Former team member'} · {new Date(h.at).toLocaleString()}
                  </small>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
