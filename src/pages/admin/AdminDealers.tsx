import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Truck, Users as UsersIcon, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAdminDealers,
  useCreateDealer,
  useUpdateDealer,
  useDeleteDealer,
  useAdminProducts,
} from '@/hooks/useApi';
import { toast } from '@/lib/inboxToast';
import { formatPrice } from '@/lib/formatters';
import type { Dealer, DealerContact, DealerProductPrice } from '@/types';

const emptyAddress = { line1: '', line2: '', city: '', state: '', zip: '', country: 'US' };
const emptyDealer = {
  name: '',
  companyName: '',
  email: '',
  phone: '',
  address: { ...emptyAddress },
  notes: '',
  isActive: true,
  contacts: [] as DealerContact[],
  productPrices: [] as DealerProductPrice[],
};

const ITEMS_PER_PAGE = 15;

export default function AdminDealers() {
  const { data, isLoading } = useAdminDealers();
  const { data: productsData } = useAdminProducts();
  const createDealer = useCreateDealer();
  const updateDealer = useUpdateDealer();
  const deleteDealer = useDeleteDealer();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [form, setForm] = useState(emptyDealer);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const dealers: Dealer[] = data?.items || [];
  const products = productsData?.items || [];

  const filteredDealers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dealers;
    return dealers.filter(d => {
      const hay = [
        d.name,
        d.companyName,
        d.email,
        d.phone,
        d.dealerId,
        d.notes,
        d.address?.line1,
        d.address?.city,
        d.address?.state,
        d.address?.zip,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [dealers, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDealers.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedDealers = filteredDealers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyDealer, address: { ...emptyAddress }, contacts: [], productPrices: [] });
    setDialogOpen(true);
  };

  const openEdit = (d: Dealer) => {
    setEditing(d);
    setForm({
      name: d.name || '',
      companyName: d.companyName || '',
      email: d.email || '',
      phone: d.phone || '',
      address: { ...emptyAddress, ...(d.address || {}) },
      notes: d.notes || '',
      isActive: d.isActive,
      contacts: d.contacts || [],
      productPrices: d.productPrices || [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Dealer name is required');
      return;
    }
    try {
      if (editing) {
        await updateDealer.mutateAsync({ dealerId: editing.dealerId, data: form });
        toast.success('Dealer updated');
      } else {
        await createDealer.mutateAsync(form);
        toast.success('Dealer created');
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save dealer');
    }
  };

  const handleDelete = async (dealerId: string) => {
    if (!confirm('Delete this dealer? This cannot be undone.')) return;
    try {
      await deleteDealer.mutateAsync(dealerId);
      toast.success('Dealer deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const addContact = () => {
    setForm({ ...form, contacts: [...form.contacts, { name: '', email: '', phone: '', role: '' }] });
  };
  const updateContact = (i: number, patch: Partial<DealerContact>) => {
    const next = [...form.contacts];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, contacts: next });
  };
  const removeContact = (i: number) => {
    setForm({ ...form, contacts: form.contacts.filter((_, idx) => idx !== i) });
  };

  const setProductPrice = (productId: string, price: number | null) => {
    const filtered = form.productPrices.filter(p => p.productId !== productId);
    if (price !== null && !Number.isNaN(price) && price >= 0) {
      filtered.push({ productId, price });
    }
    setForm({ ...form, productPrices: filtered });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Dealers</h1>
          <p className="text-sm text-muted-foreground">Manage dealer/distributor partners and per-product pricing</p>
        </div>
        <Button onClick={openNew} className="w-full shrink-0 bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Add Dealer
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 text-sm text-muted-foreground">Loading...</div>
      ) : dealers.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <Truck className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm text-muted-foreground">No dealers yet. Add one to get started.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, company, email, phone, ID, address…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Products Priced</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDealers.map(d => (
                  <tr key={d.dealerId} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.companyName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{d.email || '—'}</div>
                      {d.phone && <div className="text-xs">{d.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">{d.productPrices?.length || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${d.isActive ? 'bg-green-100 text-green-700' : 'bg-secondary text-muted-foreground'}`}>
                        {d.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(d.dealerId)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedDealers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No dealers match your search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredDealers.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filteredDealers.length)} of {filteredDealers.length}
                {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Dealer' : 'Create Dealer'}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="info" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">Basic Info</TabsTrigger>
              <TabsTrigger value="contacts">Contacts ({form.contacts.length})</TabsTrigger>
              <TabsTrigger value="pricing">Pricing ({form.productPrices.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Dealer Name *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Company Name</Label>
                  <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Address Line 1</Label>
                  <Input value={form.address.line1} onChange={e => setForm({ ...form, address: { ...form.address, line1: e.target.value } })} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Address Line 2</Label>
                  <Input value={form.address.line2 || ''} onChange={e => setForm({ ...form, address: { ...form.address, line2: e.target.value } })} className="mt-1" />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={form.address.city} onChange={e => setForm({ ...form, address: { ...form.address, city: e.target.value } })} className="mt-1" />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={form.address.state} onChange={e => setForm({ ...form, address: { ...form.address, state: e.target.value } })} className="mt-1" />
                </div>
                <div>
                  <Label>ZIP</Label>
                  <Input value={form.address.zip} onChange={e => setForm({ ...form, address: { ...form.address, zip: e.target.value } })} className="mt-1" />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={form.address.country} onChange={e => setForm({ ...form, address: { ...form.address, country: e.target.value } })} className="mt-1" />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
                <Label>Active</Label>
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="mt-4 space-y-3">
              {form.contacts.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <UsersIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-2">No contacts added yet.</p>
                </div>
              ) : (
                form.contacts.map((c, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Contact #{i + 1}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeContact(i)} className="h-7 w-7 text-destructive">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Name" value={c.name} onChange={e => updateContact(i, { name: e.target.value })} />
                      <Input placeholder="Role / Title" value={c.role || ''} onChange={e => updateContact(i, { role: e.target.value })} />
                      <Input placeholder="Email" type="email" value={c.email || ''} onChange={e => updateContact(i, { email: e.target.value })} />
                      <Input placeholder="Phone" value={c.phone || ''} onChange={e => updateContact(i, { phone: e.target.value })} />
                    </div>
                  </div>
                ))
              )}
              <Button variant="outline" size="sm" onClick={addContact}>
                <Plus className="mr-2 h-4 w-4" /> Add Contact
              </Button>
            </TabsContent>

            <TabsContent value="pricing" className="mt-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Set custom prices for this dealer. Leave blank to use the default product price.
              </p>
              {products.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No products available.
                </div>
              ) : (
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border p-2">
                  {products.map(p => {
                    const current = form.productPrices.find(pp => pp.productId === p.productId);
                    return (
                      <div key={p.productId} className="flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-secondary/50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">Default: {formatPrice(p.price)}</p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="—"
                          value={current?.price ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            setProductPrice(p.productId, v === '' ? null : Number(v));
                          }}
                          className="w-28"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              className="bg-accent text-accent-foreground hover:bg-accent-hover"
              disabled={createDealer.isPending || updateDealer.isPending}
            >
              {editing ? 'Update Dealer' : 'Create Dealer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
