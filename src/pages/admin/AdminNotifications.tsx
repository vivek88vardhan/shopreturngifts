import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertTriangle, UserCheck, UserX, Package, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdminProducts, useAdminUsers, useAdminConfig, useUpdateConfig } from '@/hooks/useApi';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/inboxToast';

export default function AdminNotifications() {
  const { data: productsData, isLoading: loadingProducts } = useAdminProducts();
  const { data: usersData, isLoading: loadingUsers } = useAdminUsers();
  const { data: configData, isLoading: loadingConfig } = useAdminConfig();
  const updateConfig = useUpdateConfig();

  const [alertEmails, setAlertEmails] = useState('');
  const [contactFromEmail, setContactFromEmail] = useState('');
  const [contactToEmail, setContactToEmail] = useState('');

  useEffect(() => {
    if (!configData) return;
    setAlertEmails(configData.lowStockAlertEmails ?? '');
    setContactFromEmail(configData.contactFromEmail ?? '');
    setContactToEmail(configData.contactToEmail ?? '');
  }, [configData]);

  const sendAlert = useMutation({
    mutationFn: () => adminApi.sendLowStockAlertEmail(),
    onSuccess: (data) => {
      toast.success(`Sent low-stock digest to ${data.sent} address(es) (${data.products} products in list).`);
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to send email');
    },
  });

  const isLoading = loadingProducts || loadingUsers || loadingConfig;
  const products = productsData?.items || [];
  const users = usersData?.items || [];
  const threshold = configData?.lowStockThreshold ?? 10;

  const lowStockProducts = products.filter(p => p.stock <= threshold && p.isActive);
  const activeUsers = users.filter(u => u.isActive);
  const inactiveUsers = users.filter(u => !u.isActive);

  const saveMailSettings = async () => {
    try {
      await updateConfig.mutateAsync({
        lowStockAlertEmails: alertEmails.trim(),
        contactFromEmail: contactFromEmail.trim(),
        contactToEmail: contactToEmail.trim(),
      });
      toast.success('Mail settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">Alerts and system notifications</p>

      <div className="mt-8 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Email for contact form &amp; alerts</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>Visitors</strong> can use any personal email (Gmail, Yahoo, Outlook, etc.) on the public Contact page — that only sets Reply-To.
          Below, <strong>Store inbox</strong> is <em>your</em> address where those messages are delivered. <strong>From</strong> must be verified in Amazon SES.
          If you leave these blank, the deployment variables <code className="text-xs">CONTACT_TO_EMAIL</code> and{' '}
          <code className="text-xs">CONTACT_FROM_EMAIL</code> are used instead.
        </p>
        <p className="mt-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>AWS SES (same region as your API, e.g. us-east-1):</strong> the SES home page often only shows marketing copy and a yellow{' '}
          <strong>Get started</strong> button — use that to verify an email identity, or open{' '}
          <a
            className="font-medium underline underline-offset-2"
            href="https://us-east-1.console.aws.amazon.com/ses/home?region=us-east-1#/identities"
            target="_blank"
            rel="noopener noreferrer"
          >
            Identities in us-east-1
          </a>{' '}
          (change the region in the URL if your API is not in N. Virginia). Create an identity for your <strong>From</strong> address and click the link AWS emails you.
          A deploy with this repo&apos;s SAM template can also create the From identity automatically when <code className="rounded bg-background/60 px-1">ContactFromEmail</code> is set — you still must verify in Gmail.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="contact-to-email">Store inbox — contact form deliveries (To)</Label>
            <Input
              id="contact-to-email"
              className="mt-1 font-mono text-sm"
              placeholder="support@yourstore.com"
              value={contactToEmail}
              onChange={e => setContactToEmail(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">One address. This is not the customer&apos;s email — it is who receives every inquiry.</p>
          </div>
          <div>
            <Label htmlFor="contact-from-email">Verified sender (From)</Label>
            <Input
              id="contact-from-email"
              className="mt-1 font-mono text-sm"
              placeholder="noreply@yourdomain.com"
              value={contactFromEmail}
              onChange={e => setContactFromEmail(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Used for contact mail and low-stock digests.</p>
          </div>
          <div>
            <Label htmlFor="stock-alert-emails">Low-stock digest recipients (comma-separated)</Label>
            <Textarea
              id="stock-alert-emails"
              className="mt-1 min-h-[88px] font-mono text-sm"
              placeholder="ops@example.com, buyer@example.com"
              value={alertEmails}
              onChange={e => setAlertEmails(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={saveMailSettings} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? 'Saving…' : 'Save mail settings'}
          </Button>
          <Button
            type="button"
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={() => sendAlert.mutate()}
            disabled={sendAlert.isPending || !alertEmails.trim()}
          >
            {sendAlert.isPending ? 'Sending…' : 'Send low-stock alert now'}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Low Stock Products</span>
            <AlertTriangle className={`h-4 w-4 ${lowStockProducts.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{lowStockProducts.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Threshold: ≤ {threshold} units</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Package Products</span>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{products.filter(p => (p.productType || 'product') === 'package').length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Bundle/package SKUs in catalog</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Users</span>
            <UserCheck className="h-4 w-4 text-sf-success" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{activeUsers.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Inactive / Unvalidated Users</span>
            <UserX className="h-4 w-4 text-sf-warning" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{inactiveUsers.length}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Low Stock Alerts</h2>
        {lowStockProducts.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">All products are well-stocked. No alerts at this time.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-background-subtle">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Current Stock</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lowStockProducts.map(p => (
                  <tr key={p.productId} className="hover:bg-background-subtle/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-3 font-medium text-destructive">{p.stock}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.stock === 0 ? 'bg-red-100 text-red-800' : p.stock <= 5 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {p.stock === 0 ? 'Out of Stock' : p.stock <= 5 ? 'Critical' : 'Low'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/products">Manage products</Link>
        </Button>
      </div>

      {inactiveUsers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Inactive / Unvalidated Users</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-background-subtle">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inactiveUsers.map(u => (
                  <tr key={u.userId} className="hover:bg-background-subtle/50">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-muted-foreground">{u.userType || 'B2C'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-800">Inactive</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
