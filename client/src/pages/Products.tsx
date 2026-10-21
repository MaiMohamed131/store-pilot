import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Archive, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useShop } from '../app/providers';
import { api, money, errorMessage } from '../lib/api';
import type { List, Product } from '../types';
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
  ConfirmDialog,
  ProductAvatar,
} from '../components/ui';
import { ProductForm, type ProductValues } from '../features/ProductForm';
export function Products() {
  const { user } = useAuth();
  const { data: shop } = useShop();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState(params.get('stock') ?? '');
  const [active, setActive] = useState('true');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Product | null>(null);
  const cache = useQueryClient();
  const q = useQuery<List<Product>>({
    queryKey: ['products', { search, category, stock, sort, page, active }],
    queryFn: async () =>
      (
        await api.get('/products', {
          params: {
            search,
            category: category || undefined,
            stock: stock || undefined,
            active,
            sort: sort.split(':')[0],
            direction: sort.split(':')[1],
            page,
          },
        })
      ).data,
  });
  const archive = useMutation({
    mutationFn: async () => api.delete(`/products/${target?._id}`),
    onSuccess: () => {
      setTarget(null);
      toast.success('Product archived. Order history is preserved.');
      void cache.invalidateQueries({ queryKey: ['products'] });
      void cache.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const filter = (setter: (v: string) => void, v: string) => {
    setter(v);
    setPage(1);
  };
  return (
    <>
      <PageHeader
        title="Products"
        description="A well-organized catalog. A smoother everyday."
        actions={
          user?.role === 'ADMIN' && (
            <Link className="button primary" to="/products/new">
              <Plus size={17} />
              Add product
            </Link>
          )
        }
      />
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>
              <Package size={18} />
              Your catalog <span className="count-pill">{q.data?.meta.total ?? '—'}</span>
            </h2>
            <p>Manage products, pricing, and inventory</p>
          </div>
        </div>
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(v) => filter(setSearch, v)}
            placeholder="Search name or SKU…"
          />
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => filter(setCategory, e.target.value)}
          >
            <option value="">All categories</option>
            {q.data?.meta.categories?.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Stock status"
            value={stock}
            onChange={(e) => filter(setStock, e.target.value)}
          >
            <option value="">All stock levels</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="healthy">Healthy stock</option>
          </select>
          <select
            aria-label="Catalog status"
            value={active}
            onChange={(e) => filter(setActive, e.target.value)}
          >
            <option value="true">Active products</option>
            <option value="false">Archived products</option>
            <option value="all">All products</option>
          </select>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => filter(setSort, e.target.value)}
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="name:asc">Name A–Z</option>
            <option value="price:asc">Price: low to high</option>
            <option value="price:desc">Price: high to low</option>
            <option value="stockQuantity:asc">Lowest stock</option>
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
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  {user?.role === 'ADMIN' && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <div className="product-cell">
                        <ProductAvatar name={p.name} category={p.category} imageUrl={p.imageUrl} />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.sku}</small>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{p.category}</td>
                    <td className="amount">{money(p.price, shop?.currency)}</td>
                    <td>
                      <span className={p.stockQuantity <= p.lowStockThreshold ? 'stock-low' : ''}>
                        {p.stockQuantity} <small>in stock</small>
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={p.isActive ? 'Active' : 'Archived'} />
                    </td>
                    {user?.role === 'ADMIN' && (
                      <td>
                        <div className="row-actions">
                          <Link
                            className="icon-button"
                            aria-label={`Edit ${p.name}`}
                            to={`/products/${p._id}/edit`}
                          >
                            <Pencil size={16} />
                          </Link>
                          {p.isActive && (
                            <button
                              className="icon-button"
                              aria-label={`Archive ${p.name}`}
                              onClick={() => setTarget(p)}
                            >
                              <Archive size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={page} total={q.data.meta.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="No products found" />
        )}
      </section>
      {target && (
        <ConfirmDialog
          title="Archive product?"
          description={`${target.name} will leave your active catalog. Its historical orders will remain available.`}
          onClose={() => setTarget(null)}
          onConfirm={() => archive.mutate()}
          pending={archive.isPending}
        />
      )}
    </>
  );
}
export function ProductEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const cache = useQueryClient();
  const q = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => (await api.get(`/products/${id}`)).data.data,
    enabled: !!id,
  });
  const mutation = useMutation({
    mutationFn: async (data: Omit<ProductValues, 'price'> & { price: number }) =>
      id ? api.patch(`/products/${id}`, data) : api.post('/products', data),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['products'] });
      void cache.invalidateQueries({ queryKey: ['product', id] });
      void cache.invalidateQueries({ queryKey: ['analytics'] });
      toast.success(id ? 'Product updated.' : 'Product created.');
      nav('/products');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader
        title={id ? 'Edit product' : 'Add a new product'}
        description="Thoughtful details make a great catalog."
      />
      {id && q.isPending ? (
        <LoadingSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <ProductForm
          key={id ?? 'new'}
          product={q.data}
          onSave={(data) => mutation.mutate(data)}
          pending={mutation.isPending}
        />
      )}
    </>
  );
}
