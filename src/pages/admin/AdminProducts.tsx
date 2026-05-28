import { useState, useEffect, useMemo } from 'react';
import { formatPrice } from '@/lib/formatters';
import { ProductPriceDisplay } from '@/components/store/ProductPriceDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, Pencil, Trash2, Loader2, Upload, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/inboxToast';
import type { Product } from '@/types';
import { useAdminProducts, useAdminCategories, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useApi';
import { adminApi } from '@/lib/api';
import BulkProductImport from '@/components/admin/BulkProductImport';
import { useQueryClient } from '@tanstack/react-query';

const ITEMS_PER_PAGE = 15;
const WIZARD_STEPS = ['Product Details', 'Images'] as const;

function formatPackageItemsText(items?: Product['packageItems']): string {
  if (!items || items.length === 0) return '';
  return items.map((item) => `${item.productId}:${item.qty}`).join('\n');
}

function parsePackageItemsText(raw: string): Product['packageItems'] {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const out: NonNullable<Product['packageItems']> = [];
  for (const line of lines) {
    const [productIdRaw, qtyRaw] = line.split(':').map((s) => s.trim());
    const qty = Number(qtyRaw);
    if (!productIdRaw || !Number.isInteger(qty) || qty <= 0) continue;
    out.push({ productId: productIdRaw, qty });
  }
  return out;
}

function parseNumberOrUndefined(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function generateProductId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const xy = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
  const num = String(Math.floor(100000 + Math.random() * 900000));
  return `product-${xy}-${num}`;
}

export default function AdminProducts() {
  const { data: productsData, isLoading } = useAdminProducts();
  const { data: categoriesData } = useAdminCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Product> & { productId?: string } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [wizardStep, setWizardStep] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [packageItemsText, setPackageItemsText] = useState('');
  const queryClient = useQueryClient();

  const products = productsData?.items || [];
  const categories = categoriesData || [];
  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
      p.productId.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const parsedPackageItems = useMemo(() => parsePackageItemsText(packageItemsText), [packageItemsText]);
  const hasPackInputs = (editing?.purchasePackQty || 0) > 0 && (editing?.purchasePackPrice || 0) > 0;
  const derivedUnitCost = useMemo(() => {
    if (!hasPackInputs || !editing?.purchasePackQty || !editing.purchasePackPrice) return undefined;
    return editing.purchasePackPrice / editing.purchasePackQty;
  }, [hasPackInputs, editing?.purchasePackQty, editing?.purchasePackPrice]);
  const estimatedPackageCost = useMemo(() => {
    let total = 0;
    for (const item of parsedPackageItems) {
      const base = productsById.get(item.productId);
      if (!base) continue;
      const unitCost = base.originalUnitPrice && base.originalUnitPrice > 0
        ? base.originalUnitPrice
        : (base.purchasePackQty && base.purchasePackQty > 0 && base.purchasePackPrice && base.purchasePackPrice > 0
          ? base.purchasePackPrice / base.purchasePackQty
          : 0);
      total += unitCost * item.qty;
    }
    return total > 0 ? total : 0;
  }, [parsedPackageItems, productsById]);

  useEffect(() => {
    if (!editing || !derivedUnitCost) return;
    if (editing.originalUnitPrice === derivedUnitCost) return;
    setEditing((prev) => prev ? { ...prev, originalUnitPrice: derivedUnitCost } : prev);
  }, [derivedUnitCost, editing]);

  const handleSave = async () => {
    if (!editing || isSaving) return;
    const cap = editing.compareAtPrice;
    const sale = editing.price;
    if (typeof cap === 'number' && cap > 0 && typeof sale === 'number' && cap <= sale) {
      toast.error('Compare-at (list) price must be higher than the sale price, or leave compare-at empty.');
      return;
    }
    const normalizedType = editing.productType === 'package' ? 'package' : 'product';
    if (normalizedType === 'package' && parsedPackageItems.length === 0) {
      toast.error('Package products need at least one line in "productId:qty" format.');
      return;
    }
    const hasPackQty = (editing.purchasePackQty || 0) > 0;
    const hasPackPrice = (editing.purchasePackPrice || 0) > 0;
    if (hasPackQty !== hasPackPrice) {
      toast.error('Purchase pack quantity and purchase pack price must both be filled together.');
      return;
    }
    if (!hasPackQty && !hasPackPrice && (editing.originalUnitPrice || 0) <= 0) {
      toast.error('Original unit cost is required when purchase pack fields are empty.');
      return;
    }
    setIsSaving(true);
    try {
      const existingImages = (editing.images || []).filter(img => !img.startsWith('blob:'));
      const dataToSend = {
        ...editing,
        images: existingImages,
        productType: normalizedType,
        packageItems: normalizedType === 'package' ? parsedPackageItems : [],
      };

      let productId = editing.productId;

      if (isNew) {
        const savedProduct = await createProduct.mutateAsync(dataToSend);
        productId = savedProduct?.productId;
        toast.success('Product created');
      } else if (productId) {
        await updateProduct.mutateAsync({ productId, data: dataToSend });
        toast.success('Product updated');
      }

      if (productId && pendingImages.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of pendingImages) {
          try {
            const { uploadUrl, imageUrl } = await adminApi.getProductImageUploadUrl(productId);
            await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
            uploadedUrls.push(imageUrl);
          } catch {
            toast.error(`Failed to upload image: ${file.name}`);
          }
        }
        if (uploadedUrls.length > 0) {
          await updateProduct.mutateAsync({
            productId,
            data: { images: [...existingImages, ...uploadedUrls] },
          });
        }
      }

      (editing.images || []).filter(img => img.startsWith('blob:')).forEach(URL.revokeObjectURL);
      setPendingImages([]);
      setEditing(null);
      setWizardStep(0);
      setPackageItemsText('');
    } catch {
      toast.error('Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteProduct.mutateAsync(id);
      toast.success('Product deleted');
    } catch {
      toast.error('Failed to delete product');
    }
  };

  const handleToggle = async (product: Product) => {
    try {
      await updateProduct.mutateAsync({
        productId: product.productId,
        data: { isActive: !product.isActive },
      });
    } catch {
      toast.error('Failed to update product');
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!editing?.productId || isNew) {
      const previewUrl = URL.createObjectURL(file);
      setPendingImages(prev => [...prev, file]);
      setEditing({ ...editing!, images: [...(editing!.images || []), previewUrl] });
      toast.success('Image added — it will be uploaded when you save');
      return;
    }
    setUploading(true);
    try {
      const { uploadUrl, imageUrl } = await adminApi.getProductImageUploadUrl(editing.productId);
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setEditing({ ...editing, images: [...(editing.images || []), imageUrl] });
      toast.success('Image uploaded');
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const openNewProduct = () => {
    setEditing({
      productId: generateProductId(),
      name: '',
      description: '',
      category: categories[0]?.name || '',
      price: undefined as unknown as number,
      currency: 'USD',
      stock: undefined as unknown as number,
      images: [],
      tags: [],
      productType: 'product',
      packageItems: [],
      purchasedFrom: '',
      originalUnitPrice: undefined,
      purchasePackQty: undefined,
      purchasePackPrice: undefined,
      isActive: true,
      isTaxable: true,
      notes: '',
      details: '',
    });
    setPendingImages([]);
    setWizardStep(0);
    setPackageItemsText('');
    setIsNew(true);
  };

  const openEditProduct = (p: Product) => {
    setEditing({ ...p });
    setPendingImages([]);
    setWizardStep(0);
    setPackageItemsText(formatPackageItemsText(p.packageItems));
    setIsNew(false);
  };

  const isPackage = (editing?.productType || 'product') === 'package';

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">{products.length} total products</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setBulkOpen(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Bulk Import
          </Button>
          <Button className="w-full bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto" onClick={openNewProduct}>
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <BulkProductImport
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        categories={categories.map((c) => c.name)}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })}
      />

      <div className="mt-6 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or product ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-background-subtle">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stock</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Active</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map(p => (
              <tr key={p.productId} className="hover:bg-background-subtle/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded bg-secondary overflow-hidden">
                      {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <span className="font-medium">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.productId}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                <td className="px-4 py-3"><ProductPriceDisplay product={p} /></td>
                <td className="px-4 py-3">
                  <span className={p.stock <= 10 ? 'text-destructive font-medium' : ''}>{p.stock}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap capitalize">{p.productType || 'product'}</td>
                <td className="px-4 py-3">
                  <Switch checked={p.isActive} onCheckedChange={() => handleToggle(p)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEditProduct(p)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(p.productId)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPage(p)}
                className={p === page ? 'bg-accent text-accent-foreground' : ''}
              >
                {p}
              </Button>
            ))}
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setPendingImages([]); setWizardStep(0); setPackageItemsText(''); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Add Product' : 'Edit Product'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-6">
              <div className="flex items-center gap-1">
                {WIZARD_STEPS.map((step, i) => (
                  <button
                    key={step}
                    onClick={() => setWizardStep(i)}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                      i === wizardStep
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {i + 1}. {step}
                  </button>
                ))}
              </div>

              {wizardStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <Label>Product ID</Label>
                    <Input value={editing.productId || ''} disabled className="mt-1 font-mono text-sm bg-secondary" />
                  </div>

                  <div><Label>Name</Label><Input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="mt-1" /></div>
                  <div><Label>Description</Label><Textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} className="mt-1" rows={3} /></div>
                  <div><Label>Product Details</Label><Textarea value={editing.details || ''} onChange={e => setEditing({ ...editing, details: e.target.value })} className="mt-1" rows={3} placeholder="Detailed product specs..." /></div>
                  <div><Label>Extra Notes</Label><Textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} className="mt-1" rows={2} placeholder="Internal notes..." /></div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Category</Label>
                      <select value={editing.category || ''} onChange={e => setEditing({ ...editing, category: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                        {categories.map(c => <option key={c.categoryId} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Type</Label>
                      <select
                        value={editing.productType || 'product'}
                        onChange={(e) => setEditing({ ...editing, productType: e.target.value as Product['productType'] })}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <option value="product">Product</option>
                        <option value="package">Package</option>
                      </select>
                    </div>
                  </div>

                  {isPackage && (
                    <div className="space-y-2 rounded-md border p-3">
                      <Label>Package items (one per line)</Label>
                      <Textarea
                        value={packageItemsText}
                        onChange={(e) => setPackageItemsText(e.target.value)}
                        className="mt-1 font-mono text-sm"
                        rows={4}
                        placeholder={'product-ab-123456:2\nproduct-cd-789012:1'}
                      />
                      <p className="text-xs text-muted-foreground">
                        Format each line as <code>productId:qty</code>. Example: <code>product-ab-123456:2</code>
                      </p>
                      <div className="flex items-center justify-between rounded bg-secondary/60 px-3 py-2">
                        <span className="text-xs text-muted-foreground">Estimated package cost from included products</span>
                        <strong className="text-sm">{formatPrice(estimatedPackageCost)}</strong>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing({ ...editing, originalUnitPrice: estimatedPackageCost || undefined })}
                        disabled={estimatedPackageCost <= 0}
                      >
                        Use estimated package cost
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>List price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Optional"
                        value={editing.compareAtPrice != null && editing.compareAtPrice > 0 ? editing.compareAtPrice : ''}
                        onChange={e => setEditing({ ...editing, compareAtPrice: parseNumberOrUndefined(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Sale price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={editing.price != null ? editing.price : ''}
                        onChange={e => setEditing({ ...editing, price: parseNumberOrUndefined(e.target.value) as unknown as number })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Original unit cost ($)</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder={hasPackInputs ? 'Auto from pack fields' : 'Your actual cost'}
                        value={editing.originalUnitPrice != null ? editing.originalUnitPrice : ''}
                        onChange={e => setEditing({ ...editing, originalUnitPrice: parseNumberOrUndefined(e.target.value) })}
                        disabled={hasPackInputs}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  {typeof editing.compareAtPrice === 'number' && editing.compareAtPrice > 0 && typeof editing.price === 'number' && editing.price > 0 && editing.compareAtPrice > editing.price && (
                    <p className="text-xs text-muted-foreground">
                      List vs sale difference: {formatPrice(editing.compareAtPrice - editing.price)}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Purchased from</Label>
                      <Input
                        value={editing.purchasedFrom || ''}
                        onChange={e => setEditing({ ...editing, purchasedFrom: e.target.value })}
                        className="mt-1"
                        placeholder="Supplier / source"
                      />
                    </div>
                    <div>
                      <Label>Purchase pack qty</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 12"
                        value={editing.purchasePackQty != null ? editing.purchasePackQty : ''}
                        onChange={e => setEditing({ ...editing, purchasePackQty: parseNumberOrUndefined(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Purchase pack price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 6.00"
                        value={editing.purchasePackPrice != null ? editing.purchasePackPrice : ''}
                        onChange={e => setEditing({ ...editing, purchasePackPrice: parseNumberOrUndefined(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  {(editing.purchasePackQty || 0) > 0 && (editing.purchasePackPrice || 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Derived unit cost from pack: {formatPrice((editing.purchasePackPrice as number) / (editing.purchasePackQty as number))}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Stock</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={editing.stock != null ? editing.stock : ''}
                        onChange={e => setEditing({ ...editing, stock: parseNumberOrUndefined(e.target.value) as unknown as number })}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <Switch checked={editing.isTaxable ?? true} onCheckedChange={(v) => setEditing({ ...editing, isTaxable: v })} />
                      <Label>Taxable</Label>
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <Switch checked={editing.isActive ?? true} onCheckedChange={(v) => setEditing({ ...editing, isActive: v })} />
                      <Label>Active</Label>
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 1 && (
                <div>
                  <Label>Images</Label>
                  {pendingImages.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pendingImages.length} image(s) will be uploaded when you save
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {(editing.images || []).map((img, i) => (
                      <div key={i} className="relative h-24 w-24 rounded border overflow-hidden group">
                        <img src={img} alt="" className="h-full w-full object-cover" />
                        <button
                          onClick={() => {
                            const newImages = editing.images?.filter((_, idx) => idx !== i) || [];
                            if (img.startsWith('blob:')) {
                              URL.revokeObjectURL(img);
                              setPendingImages(prev => {
                                const blobIndex = (editing.images || []).slice(0, i).filter(x => x.startsWith('blob:')).length;
                                return prev.filter((_, idx) => idx !== blobIndex);
                              });
                            }
                            setEditing({ ...editing, images: newImages });
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded border-2 border-dashed bg-background-subtle text-muted-foreground hover:bg-secondary">
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }} />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t">
                <Button variant="outline" onClick={() => {
                  if (wizardStep > 0) setWizardStep(wizardStep - 1);
                  else { setEditing(null); setPendingImages([]); setWizardStep(0); setPackageItemsText(''); }
                }} disabled={isSaving}>
                  {wizardStep === 0 ? 'Cancel' : 'Previous'}
                </Button>
                <div className="flex gap-2">
                  {wizardStep < WIZARD_STEPS.length - 1 ? (
                    <Button className="bg-accent text-accent-foreground hover:bg-accent-hover" onClick={() => setWizardStep(wizardStep + 1)}>
                      Next
                    </Button>
                  ) : (
                    <Button className="bg-accent text-accent-foreground hover:bg-accent-hover" onClick={handleSave} disabled={isSaving || createProduct.isPending || updateProduct.isPending}>
                      {(isSaving || createProduct.isPending || updateProduct.isPending) ? 'Saving...' : 'Save Product'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
