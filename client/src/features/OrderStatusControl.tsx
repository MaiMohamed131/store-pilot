import { useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import type { Status } from '../types';
const transitions: Record<Status, Status[]> = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};
export function OrderStatusControl({
  status,
  role,
  onUpdate,
  pending,
}: {
  status: Status;
  role: string;
  onUpdate: (s: Status) => void;
  pending: boolean;
}) {
  const [next, setNext] = useState<Status | ''>('');
  const [confirm, setConfirm] = useState(false);
  const allowed = transitions[status].filter((s) => role === 'ADMIN' || s !== 'Cancelled');
  return allowed.length ? (
    <>
      <div className="status-control">
        <select
          aria-label="New order status"
          value={next}
          onChange={(e) => setNext(e.target.value as Status)}
        >
          <option value="">Update status…</option>
          {allowed.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          className="button primary"
          disabled={!next || pending}
          onClick={() => setConfirm(true)}
        >
          Update status
        </button>
      </div>
      {confirm && next && (
        <ConfirmDialog
          title={`Mark as ${next.toLowerCase()}?`}
          description={
            next === 'Cancelled'
              ? 'This restores reserved stock and marks paid orders as refunded. This action cannot be undone.'
              : `This moves the order from ${status} to ${next}. The change will be recorded in its history.`
          }
          pending={pending}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            onUpdate(next);
            setConfirm(false);
            setNext('');
          }}
        />
      )}
    </>
  ) : (
    <p className="muted">This order has reached its final status.</p>
  );
}
