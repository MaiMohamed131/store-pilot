import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth, useShop } from '../app/providers';
import { api, errorMessage } from '../lib/api';
import type { Shop } from '../types';
import { PageHeader, Field, LoadingSkeleton, ErrorState } from '../components/ui';
const profile = z.object({ name: z.string().min(2).max(100), email: z.email() });
const password = z.object({
  currentPassword: z.string().min(1),
  password: z.string().min(12).max(128),
});
const shopSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.union([z.email(), z.literal('')]),
  currency: z.enum(['USD', 'EUR', 'GBP', 'EGP']),
  address: z.string().max(300),
});
function ProfileForm() {
  const { user, reload, signOut } = useAuth();
  const p = useForm<z.infer<typeof profile>>({
    resolver: zodResolver(profile),
    defaultValues: { name: user?.name, email: user?.email },
  });
  const pw = useForm<z.infer<typeof password>>({ resolver: zodResolver(password) });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof profile>) => api.patch('/profile', v),
    onSuccess: () => {
      void reload();
      toast.success('Profile updated.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const change = useMutation({
    mutationFn: (v: z.infer<typeof password>) => api.post('/profile/password', v),
    onSuccess: () => {
      toast.success('Password changed. Please sign in again.');
      void signOut();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <form className="card form-card" onSubmit={p.handleSubmit((v) => save.mutate(v))} noValidate>
        <div className="section-heading">
          <h2>Your profile</h2>
          <p>The face behind the workspace.</p>
        </div>
        <div className="form-grid">
          <Field
            label="Full name"
            registration={p.register('name')}
            error={p.formState.errors.name?.message}
          />
          <Field
            label="Email address"
            type="email"
            registration={p.register('email')}
            error={p.formState.errors.email?.message}
          />
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={save.isPending}>
            Save profile
          </button>
        </div>
      </form>
      <form
        className="card form-card"
        onSubmit={pw.handleSubmit((v) => change.mutate(v))}
        noValidate
      >
        <div className="section-heading">
          <h2>Change password</h2>
          <p>Changing your password signs out all your sessions.</p>
        </div>
        <div className="form-grid">
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            registration={pw.register('currentPassword')}
            error={pw.formState.errors.currentPassword?.message}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            registration={pw.register('password')}
            error={pw.formState.errors.password?.message}
          />
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={change.isPending}>
            Update password
          </button>
        </div>
      </form>
    </>
  );
}
function ShopForm({ shop }: { shop: Shop }) {
  const cache = useQueryClient();
  const f = useForm<z.infer<typeof shopSchema>>({
    resolver: zodResolver(shopSchema),
    defaultValues: { ...shop, currency: shop.currency as 'USD' },
  });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof shopSchema>) => api.patch('/settings', v),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Shop settings saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form className="card form-card" onSubmit={f.handleSubmit((v) => save.mutate(v))} noValidate>
      <div className="section-heading">
        <h2>Shop information</h2>
        <p>Make this workspace your own.</p>
      </div>
      <div className="form-grid">
        <Field
          label="Shop name"
          registration={f.register('name')}
          error={f.formState.errors.name?.message}
        />
        <Field
          label="Shop email"
          type="email"
          registration={f.register('email')}
          error={f.formState.errors.email?.message}
        />
        <Field
          label="Address"
          registration={f.register('address')}
          error={f.formState.errors.address?.message}
        />
        <label className="field">
          <span>Currency display preference</span>
          <select {...f.register('currency')}>
            {['USD', 'EUR', 'GBP', 'EGP'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="form-help">
        Display preference only; changing currency does not convert stored amounts. Use a single
        accounting currency for your shop.
      </p>
      <div className="form-actions">
        <button className="button primary" disabled={save.isPending}>
          Save shop settings
        </button>
      </div>
    </form>
  );
}
export function Settings() {
  const { user } = useAuth();
  const q = useShop();
  return (
    <>
      <PageHeader title="Settings" description="Your profile, your store, your preferences." />
      <div className="settings-stack">
        <ProfileForm />
        {user?.role === 'ADMIN' &&
          (q.isPending ? (
            <LoadingSkeleton />
          ) : q.isError ? (
            <ErrorState error={q.error} />
          ) : (
            q.data && <ShopForm shop={q.data} />
          ))}
      </div>
    </>
  );
}
