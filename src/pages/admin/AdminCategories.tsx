import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Upload, ImageIcon, X, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/inboxToast';
import type { Category } from '@/types';
import { useAdminCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useApi';
import { adminApi, ApiError } from '@/lib/api';

const ITEMS_PER_PAGE = 15;

export default function AdminCategories() {
  const { data: categories, isLoading } = useAdminCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [editing, setEditing] = useState<Partial<Category> & { categoryId?: string } | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cats = categories || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        c.categoryId.toLowerCase().includes(q)
    );
  }, [cats, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleImageUpload = async (file: File, categoryId: string) => {
    setUploading(true);
    try {
      const { uploadUrl, imageUrl } = await adminApi.getCategoryImageUploadUrl(categoryId);
      const ext = file.name.split('.').pop()?.toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      await updateCategory.mutateAsync({ categoryId, data: { imageUrl } });
      setEditing(prev => prev ? { ...prev, imageUrl } : prev);
      toast.success('Image uploaded');
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    e.target.value = '';
    if (isNew) {
      const reader = new FileReader();
      reader.onload = () => setEditing(prev => prev ? { ...prev, _previewUrl: reader.result as string, _pendingFile: file } as typeof prev : prev);
      reader.readAsDataURL(file);
    } else if (editing.categoryId) {
      await handleImageUpload(file, editing.categoryId);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const sortOrder = editing.sortOrder ?? 1;
    if (!Number.isFinite(sortOrder) || sortOrder < 1) {
      toast.error('Sort order must be a whole number of at least 1.');
      return;
    }
    const takenByOther = cats.some(
      c => c.sortOrder === sortOrder && (isNew || c.categoryId !== editing.categoryId),
    );
    if (takenByOther) {
      toast.error('Another category already uses this sort order. Choose a different number.');
      return;
    }
    const payload = { ...editing, sortOrder };
    try {
      if (isNew) {
        const created = await createCategory.mutateAsync(payload);
        const pendingFile = (editing as Record<string, unknown>)._pendingFile as File | undefined;
        if (pendingFile && created.categoryId) {
          await handleImageUpload(pendingFile, created.categoryId);
        }
        toast.success('Category created');
      } else if (editing.categoryId) {
        await updateCategory.mutateAsync({ categoryId: editing.categoryId, data: payload });
        toast.success('Category updated');
      }
      setEditing(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to save category';
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id);
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category');
    }
  };

  const handleToggle = async (cat: Category) => {
    try {
      await updateCategory.mutateAsync({ categoryId: cat.categoryId, data: { isActive: !cat.isActive } });
    } catch {
      toast.error('Failed to update category');
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cats.length} categor{cats.length === 1 ? 'y' : 'ies'}
            {search.trim() ? ` · ${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : ''}
          </p>
        </div>
        <Button className="w-full shrink-0 bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto" onClick={() => { setEditing({ name: '', description: '', imageUrl: '', sortOrder: cats.length + 1, isActive: true }); setIsNew(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </div>

      <div className="mt-6 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, description, or ID…"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b bg-background-subtle">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Image</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sort Order</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Active</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map(c => (
              <tr key={c.categoryId} className="hover:bg-background-subtle/50">
                <td className="px-4 py-3">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-secondary"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.description}</td>
                <td className="px-4 py-3">{c.sortOrder}</td>
                <td className="px-4 py-3"><Switch checked={c.isActive} onCheckedChange={() => handleToggle(c)} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setEditing(c); setIsNew(false); }} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(c.categoryId)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {cats.length === 0 ? 'No categories yet.' : 'No categories match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
          </p>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
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
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isNew ? 'Add Category' : 'Edit Category'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Category Image</Label>
                <div className="mt-2">
                  {(editing as Record<string, unknown>)._previewUrl || editing.imageUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={((editing as Record<string, unknown>)._previewUrl as string) || editing.imageUrl}
                        alt="Category"
                        className="h-32 w-full rounded-md object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...editing, imageUrl: '' };
                          delete (updated as Record<string, unknown>)._previewUrl;
                          delete (updated as Record<string, unknown>)._pendingFile;
                          setEditing(updated);
                        }}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                        <p className="mt-1 text-xs text-muted-foreground">No image</p>
                      </div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Uploading...</> : <><Upload className="mr-2 h-3 w-3" />{editing.imageUrl ? 'Change Image' : 'Upload Image'}</>}
                  </Button>
                </div>
              </div>
              <div><Label>Name</Label><Input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="mt-1" /></div>
              <div><Label>Description</Label><Input value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category-sort-order">Sort order</Label>
                  <Input
                    id="category-sort-order"
                    type="number"
                    min={1}
                    step={1}
                    value={editing.sortOrder ?? 1}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10);
                      setEditing({ ...editing, sortOrder: Number.isNaN(n) ? 1 : Math.max(1, n) });
                    }}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Whole number ≥ 1; must be unique (no two categories share the same order).</p>
                </div>
                <div className="flex items-end gap-2 pb-1"><Switch checked={editing.isActive ?? true} onCheckedChange={v => setEditing({ ...editing, isActive: v })} /><Label>Active</Label></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button className="bg-accent text-accent-foreground hover:bg-accent-hover" onClick={handleSave} disabled={createCategory.isPending || updateCategory.isPending || uploading}>
                  {(createCategory.isPending || updateCategory.isPending) ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
