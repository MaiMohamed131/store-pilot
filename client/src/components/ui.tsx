import { useEffect, useRef, useId, type ReactNode, type TableHTMLAttributes } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Inbox, Search, X } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { errorMessage } from '../lib/api';
export function PageHeader({
  eyebrow = 'WORKSPACE',
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <i />
      {status}
    </span>
  );
}
export function EmptyState({
  title = 'Nothing here yet',
  description = 'Try adjusting your filters or adding a new record.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="skeleton-stack">
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle />
      <h3>We couldn’t load this</h3>
      <p>{errorMessage(error)}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}
export function DataTable({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-scroll">
      <table {...props}>{children}</table>
    </div>
  );
}
export function Pagination({
  page,
  total,
  limit = 10,
  onChange,
}: {
  page: number;
  total: number;
  limit?: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <span>
        {total === 0
          ? 'No results'
          : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total} results`}
      </span>
      <div>
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ArrowLeft size={15} />
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmDialog({
  title,
  description,
  onConfirm,
  onClose,
  pending,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{description}</p>
      <div className="form-actions">
        <button className="button secondary" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button className="button danger" onClick={onConfirm} disabled={pending}>
          {pending ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}
export function Field({
  label,
  error,
  type = 'text',
  registration,
  ...props
}: {
  label: string;
  error?: string;
  type?: string;
  registration: UseFormRegisterReturn;
  [key: string]: any;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      <input
        id={id}
        type={type}
        {...registration}
        {...props}
        aria-labelledby={`${id}-label`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </label>
  );
}
export function ProductAvatar({
  name,
  imageUrl,
  category,
}: {
  name: string;
  imageUrl?: string;
  category?: string;
}) {
  return (
    <div className={`product-avatar cat-${(category ?? '').split(' ')[0].toLowerCase()}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span>
          {name
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')}
        </span>
      )}
    </div>
  );
}
