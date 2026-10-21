import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProductForm } from '../features/ProductForm';
import { OrderStatusControl } from '../features/OrderStatusControl';
import { Login } from '../pages/Login';
import { ProtectedRoute } from '../app/App';
const auth = vi.hoisted(() => ({ user: null as any, loading: false, signIn: vi.fn() }));
vi.mock('../app/providers', () => ({
  useAuth: () => auth,
  useShop: () => ({ data: { currency: 'USD' } }),
}));
describe('Critical user flows', () => {
  it('validates the login form before sending credentials', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /sign in to workspace/i }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });
  it('redirects unauthenticated visitors to login', () => {
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<div>Private content</div>} />
          </Route>
          <Route path="/login" element={<div>Sign-in destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Sign-in destination')).toBeInTheDocument();
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
  });
  it('validates product fields and converts money to minor units', async () => {
    const save = vi.fn();
    render(
      <MemoryRouter>
        <ProductForm onSave={save} pending={false} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));
    expect(save).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Product name'), 'Ceramic Cup');
    await userEvent.type(screen.getByLabelText('SKU'), 'CUP-01');
    await userEvent.type(screen.getByLabelText('Category'), 'Home');
    await userEvent.type(screen.getByLabelText('Price (major currency units)'), '19.95');
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ price: 1995, sku: 'CUP-01' })),
    );
  });
  it('exposes only permitted staff transitions and confirms updates', async () => {
    const update = vi.fn();
    render(<OrderStatusControl status="Pending" role="STAFF" onUpdate={update} pending={false} />);
    expect(screen.queryByRole('option', { name: 'Cancelled' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('New order status'), 'Processing');
    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    expect(update).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(update).toHaveBeenCalledWith('Processing');
  });
  it('offers no transitions for completed orders', () => {
    render(
      <OrderStatusControl status="Delivered" role="ADMIN" onUpdate={vi.fn()} pending={false} />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
