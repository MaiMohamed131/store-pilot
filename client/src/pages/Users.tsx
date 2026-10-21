import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage, date } from '../lib/api';
import type { List, User } from '../types';
import {
  PageHeader,
  Modal,
  Field,
  DataTable,
  StatusBadge,
  ErrorState,
  LoadingSkeleton,
  Pagination,
  SearchInput,
  FilterBar,
  EmptyState,
} from '../components/ui';
const base = z.object({
  name: z.string().min(2),
  email: z.email(),
  role: z.enum(['ADMIN', 'STAFF']),
  isActive: z.boolean(),
  password: z.string(),
});
type Values = z.infer<typeof base>;
function UserForm({
  user,
  onSave,
  pending,
}: {
  user: User | null;
  onSave: (v: Values) => void;
  pending: boolean;
}) {
  const schema = base.refine((v) => !!user || v.password.length >= 12, {
    path: ['password'],
    message: 'Use at least 12 characters.',
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: user
      ? { ...user, isActive: user.isActive ?? true, password: '' }
      : { name: '', email: '', role: 'STAFF', password: '', isActive: true },
  });
  return (
    <form onSubmit={handleSubmit(onSave)} noValidate>
      <Field label="Full name" registration={register('name')} error={errors.name?.message} />
      <Field
        label="Email address"
        type="email"
        registration={register('email')}
        error={errors.email?.message}
      />
      {!user && (
        <Field
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          registration={register('password')}
          error={errors.password?.message}
        />
      )}
      <label className="field">
        <span>Role</span>
        <select {...register('role')}>
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Administrator</option>
        </select>
      </label>
      {user && (
        <label className="checkbox-label">
          <input type="checkbox" {...register('isActive')} />
          Account active
        </label>
      )}
      <p className="form-help">
        Staff can view products and move orders through fulfillment. Administrators can manage all
        store resources.
      </p>
      <div className="form-actions">
        <button className="button primary" disabled={pending}>
          {pending ? 'Saving…' : user ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </form>
  );
}
export function Users() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const cache = useQueryClient();
  const q = useQuery<List<User>>({
    queryKey: ['users', page, search],
    queryFn: async () => (await api.get('/users', { params: { page, search } })).data,
  });
  const mutation = useMutation({
    mutationFn: async (v: Values) =>
      editing
        ? api.patch(`/users/${editing.id}`, {
            name: v.name,
            email: v.email,
            role: v.role,
            isActive: v.isActive,
          })
        : api.post('/users', { name: v.name, email: v.email, role: v.role, password: v.password }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['users'] });
      toast.success('Team member saved.');
      setEditing(undefined);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader
        title="Team members"
        description="Great stores are built by great teams."
        actions={
          <button className="button primary" onClick={() => setEditing(null)}>
            <Plus size={17} />
            Add team member
          </button>
        }
      />
      <section className="card">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(s) => {
              setSearch(s);
              setPage(1);
            }}
            placeholder="Search team members…"
          />
        </FilterBar>
        {q.isPending ? (
          <LoadingSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} />
        ) : q.data.data.length ? (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <small>{u.email}</small>
                    </td>
                    <td>{u.role === 'ADMIN' ? 'Administrator' : 'Staff'}</td>
                    <td>
                      <StatusBadge status={u.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="muted">{u.createdAt && date(u.createdAt)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${u.name}`}
                        onClick={() => setEditing(u)}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={page} total={q.data.meta.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="No team members found" />
        )}
      </section>
      {editing !== undefined && (
        <Modal
          title={editing ? 'Edit team member' : 'Add team member'}
          onClose={() => setEditing(undefined)}
        >
          <UserForm
            user={editing}
            onSave={(v) => mutation.mutate(v)}
            pending={mutation.isPending}
          />
        </Modal>
      )}
    </>
  );
}
