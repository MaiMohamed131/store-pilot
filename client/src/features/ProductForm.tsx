import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Field } from '../components/ui';
import type { Product } from '../types';
export const productSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(120),
  sku: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens.'),
  description: z.string().max(2000),
  category: z.string().trim().min(2, 'Enter a category.').max(60),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a price with up to two decimal places.')
    .refine((s) => Number(s) <= 1000000, 'Price is too large.'),
  stockQuantity: z.number().int().min(0).max(1000000),
  lowStockThreshold: z.number().int().min(0).max(1000000),
  imageUrl: z.union([
    z.literal(''),
    z.url().refine((s) => s.startsWith('https://'), 'Use an HTTPS URL.'),
  ]),
  isActive: z.boolean(),
});
export type ProductValues = z.infer<typeof productSchema>;
export function ProductForm({
  product,
  onSave,
  pending,
}: {
  product?: Product;
  onSave: (data: Omit<ProductValues, 'price'> & { price: number }) => void;
  pending: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? { ...product, price: (product.price / 100).toFixed(2) }
      : {
          name: '',
          sku: '',
          category: '',
          description: '',
          price: '',
          stockQuantity: 0,
          lowStockThreshold: 10,
          imageUrl: '',
          isActive: true,
        },
  });
  return (
    <form
      className="card form-card"
      onSubmit={handleSubmit((data) =>
        onSave({ ...data, price: Math.round(Number(data.price) * 100) }),
      )}
      noValidate
    >
      <div className="section-heading">
        <h2>Product information</h2>
        <p>The details that help keep your catalog organized.</p>
      </div>
      <div className="form-grid">
        <Field label="Product name" registration={register('name')} error={errors.name?.message} />
        <Field label="SKU" registration={register('sku')} error={errors.sku?.message} />
        <Field
          label="Category"
          registration={register('category')}
          error={errors.category?.message}
          list="categories"
        />
        <datalist id="categories">
          {['Home & Living', 'Accessories', 'Stationery', 'Electronics', 'Wellness'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </datalist>
        <Field
          label="Price (major currency units)"
          inputMode="decimal"
          registration={register('price')}
          error={errors.price?.message}
        />
        <Field
          label="Stock quantity"
          type="number"
          min={0}
          registration={register('stockQuantity', { valueAsNumber: true })}
          error={errors.stockQuantity?.message}
        />
        <Field
          label="Low stock threshold"
          type="number"
          min={0}
          registration={register('lowStockThreshold', { valueAsNumber: true })}
          error={errors.lowStockThreshold?.message}
        />
        <label className="field span-2">
          <span>Description</span>
          <textarea rows={4} {...register('description')} />
          {errors.description && (
            <small className="field-error">{errors.description.message}</small>
          )}
        </label>
        <div className="span-2">
          <Field
            label="Image URL (optional)"
            type="url"
            placeholder="https://…"
            registration={register('imageUrl')}
            error={errors.imageUrl?.message}
          />
        </div>
        <label className="checkbox-label">
          <input type="checkbox" {...register('isActive')} />
          Active in catalog
        </label>
      </div>
      <div className="form-actions">
        <Link to="/products" className="button secondary">
          Cancel
        </Link>
        <button className="button primary" disabled={pending}>
          {pending ? 'Saving…' : product ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  );
}
