import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { Command, ArrowRight, ShieldCheck, BarChart3, Package } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../app/providers';
import { Field, LoadingSkeleton } from '../components/ui';
import { errorMessage } from '../lib/api';
const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export function Login() {
  const { user, loading, signIn } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (loading) return <LoadingSkeleton />;
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Command />
          </span>
          StorePilot<span className="brand-dot">.</span>
        </div>
        <div className="login-message">
          <span className="eyebrow">A LITTLE CLARITY. A LOT OF POSSIBILITY.</span>
          <h1>
            Your business.
            <br />
            All in one place.
          </h1>
          <p>
            Less time managing the details.
            <br />
            More time growing what matters.
          </p>
          <div className="login-features">
            <span>
              <BarChart3 />
              Know your numbers
            </span>
            <span>
              <Package />
              Stay on top of inventory
            </span>
            <span>
              <ShieldCheck />
              Keep your team connected
            </span>
          </div>
        </div>
        <small>Your everyday retail workspace.</small>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <div className="eyebrow">WELCOME TO STOREPILOT</div>
          <h1>Good to see you again.</h1>
          <p>Sign in to your workspace to get started.</p>
          <form
            onSubmit={handleSubmit(async (values) => {
              setError('');
              try {
                await signIn(values.email, values.password);
                nav('/dashboard');
              } catch (e) {
                setError(errorMessage(e));
              }
            })}
            noValidate
          >
            <Field
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              registration={register('email')}
              error={errors.email?.message}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              registration={register('password')}
              error={errors.password?.message}
            />
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in to workspace'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-hint">
            <ShieldCheck size={17} />
            <span>
              Secure access for your team.
              <br />
              <small>Use an account created by your workspace administrator.</small>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
