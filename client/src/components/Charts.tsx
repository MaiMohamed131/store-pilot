import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { money } from '../lib/api';
import type { Analytics } from '../types';
const colors: Record<string, string> = {
  Delivered: '#4f46e5',
  Processing: '#a5b4fc',
  Shipped: '#818cf8',
  Pending: '#fbbf24',
  Cancelled: '#e2e8f0',
};
export function RevenueChart({
  data,
  currency,
  orders = false,
}: {
  data: Analytics['series'];
  currency: string;
  orders?: boolean;
}) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8edf4" />
          <XAxis
            dataKey="date"
            tickFormatter={(s) =>
              new Date(s).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickFormatter={(n) => (orders ? String(n) : money(n, currency).replace(/\.00$/, ''))}
            width={65}
          />
          <Tooltip
            labelFormatter={(s) =>
              new Date(String(s)).toLocaleDateString('en-US', { timeZone: 'UTC' })
            }
            formatter={(value) =>
              orders ? [value, 'Orders'] : [money(Number(value), currency), 'Revenue']
            }
            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey={orders ? 'orders' : 'revenue'}
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#revenueFill)"
            activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function OrderStatusChart({ data }: { data: Analytics['statuses'] }) {
  const total = data.reduce((n, s) => n + s.count, 0);
  return (
    <div className="status-chart">
      <div className="donut-wrap">
        <ResponsiveContainer width="100%" height={185}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="_id"
              innerRadius={62}
              outerRadius={81}
              paddingAngle={3}
              cornerRadius={4}
              stroke="none"
            >
              {data.map((s) => (
                <Cell key={s._id} fill={colors[s._id]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{total.toLocaleString()}</strong>
          <span>Total orders</span>
        </div>
      </div>
      <div className="chart-legend">
        {['Delivered', 'Shipped', 'Processing', 'Pending', 'Cancelled'].map((status) => {
          const value = data.find((s) => s._id === status)?.count ?? 0;
          return (
            <div key={status}>
              <span>
                <i style={{ background: colors[status] }} />
                {status}
              </span>
              <strong>
                {value}
                <small>{total ? Math.round((value / total) * 100) : 0}%</small>
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function CategoryChart({
  data,
  currency,
}: {
  data: Analytics['categories'];
  currency: string;
}) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 5" />
          <XAxis type="number" tickFormatter={(n) => money(n, currency)} tick={{ fontSize: 10 }} />
          <YAxis
            dataKey="_id"
            type="category"
            width={100}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(v) => money(Number(v), currency)} />
          <Bar dataKey="revenue" fill="#818cf8" radius={[0, 5, 5, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
