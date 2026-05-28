import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/inboxToast';
import { adminApi } from '@/lib/api';
import type { Product } from '@/types';

interface BulkProductImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onComplete: () => void;
}

interface ParsedRow {
  rowNumber: number;
  data: Partial<Product>;
  errors: string[];
}

// Excel column headers for the template
const TEMPLATE_HEADERS = [
  'name',
  'description',
  'category',
  'price',
  'currency',
  'stock',
  'productType',
  'packageItems',
  'tags',
  'isActive',
  'isTaxable',
  'notes',
  'details',
  'purchasedFrom',
  'originalUnitPrice',
  'purchasePackQty',
  'purchasePackPrice',
];

/** Admin-only import; reject oversized uploads before parsing (mitigates ReDoS/memory issues). */
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

const SAMPLE_ROW = {
  name: 'Festive Gift Hamper',
  description: 'Premium festive hamper with curated gift items and keepsakes.',
  category: 'Gift Hampers',
  price: 49.99,
  currency: 'USD',
  stock: 25,
  productType: 'package',
  packageItems: 'product-ab-123456:2|product-cd-789012:1',
  tags: 'festival,premium,curated',
  isActive: 'true',
  isTaxable: 'true',
  notes: 'Limited-edition packaging for festive season.',
  details: 'Includes greeting card and reusable gift box.',
  purchasedFrom: 'Acme Wholesale Gifts',
  originalUnitPrice: 3.5,
  purchasePackQty: 12,
  purchasePackPrice: 42,
};

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

function parseBoolean(raw: unknown, defaultValue = true): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['true', 'yes', '1', 'y'].includes(v)) return true;
    if (['false', 'no', '0', 'n'].includes(v)) return false;
  }
  return defaultValue;
}

function parsePackageItems(raw: unknown): Product['packageItems'] {
  if (typeof raw !== 'string') return [];
  return raw
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [productId, qtyRaw] = entry.split(':').map((p) => p.trim());
      const qty = Number(qtyRaw);
      return { productId, qty };
    })
    .filter((item) => item.productId && Number.isInteger(item.qty) && item.qty > 0);
}

function generateProductId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const xy = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
  const num = String(Math.floor(100000 + Math.random() * 900000));
  return `product-${xy}-${num}`;
}

function validateRow(raw: Record<string, unknown>, rowNumber: number, validCategories: string[]): ParsedRow {
  const errors: string[] = [];
  const name = String(raw.name || '').trim();
  const description = String(raw.description || '').trim();
  const category = String(raw.category || '').trim();
  const priceNum = Number(raw.price);
  const stockNum = Number(raw.stock);
  const productType = String(raw.productType || 'product').trim().toLowerCase();

  if (!name) errors.push('name is required');
  if (!description) errors.push('description is required');
  if (!category) errors.push('category is required');
  else if (validCategories.length > 0 && !validCategories.some((c) => c.toLowerCase() === category.toLowerCase())) {
    errors.push(`category "${category}" does not exist (create it first or use one of: ${validCategories.slice(0, 3).join(', ')}${validCategories.length > 3 ? '…' : ''})`);
  }
  if (isNaN(priceNum) || priceNum < 0) errors.push('price must be a non-negative number');
  if (isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) errors.push('stock must be a non-negative integer');
  if (!['product', 'package'].includes(productType)) errors.push('productType must be "product" or "package"');
  const packageItems = parsePackageItems(raw.packageItems);
  if (productType === 'package' && packageItems.length === 0) {
    errors.push('package products require packageItems in "productId:qty|productId:qty" format');
  }
  const originalUnitPrice = Number(raw.originalUnitPrice);
  const purchasePackQty = Number(raw.purchasePackQty);
  const purchasePackPrice = Number(raw.purchasePackPrice);

  const data: Partial<Product> = {
    productId: generateProductId(),
    name,
    description,
    category,
    price: isNaN(priceNum) ? 0 : priceNum,
    currency: String(raw.currency || 'USD').trim().toUpperCase() || 'USD',
    stock: isNaN(stockNum) ? 0 : Math.floor(stockNum),
    productType: (productType === 'package' ? 'package' : 'product') as Product['productType'],
    packageItems,
    images: [],
    tags: parseTags(raw.tags),
    isActive: parseBoolean(raw.isActive, true),
    isTaxable: parseBoolean(raw.isTaxable, true),
    notes: String(raw.notes || '').trim() || undefined,
    details: String(raw.details || '').trim() || undefined,
    purchasedFrom: String(raw.purchasedFrom || '').trim() || undefined,
    originalUnitPrice: Number.isFinite(originalUnitPrice) && originalUnitPrice > 0 ? originalUnitPrice : undefined,
    purchasePackQty: Number.isFinite(purchasePackQty) && Number.isInteger(purchasePackQty) && purchasePackQty > 0 ? purchasePackQty : undefined,
    purchasePackPrice: Number.isFinite(purchasePackPrice) && purchasePackPrice > 0 ? purchasePackPrice : undefined,
  };

  return { rowNumber, data, errors };
}

export default function BulkProductImport({ open, onOpenChange, categories, onComplete }: BulkProductImportProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: TEMPLATE_HEADERS });
    // Add an instructions row at top by building manually
    const instructions = [[
      'Fill rows below. packageItems format: "productId:qty|productId:qty". Include sourcing/cost fields for profit tracking. tags: comma-separated. isActive/isTaxable: true/false. Images upload separately after creation.',
    ]];
    const instructionsWs = XLSX.utils.aoa_to_sheet(instructions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
    XLSX.writeFile(wb, 'product-import-template.xlsx');
    toast.success('Template downloaded');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error('File is too large (max 2 MB). Split into smaller spreadsheets.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'products') || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (json.length === 0) {
          toast.error('Spreadsheet is empty');
          return;
        }
        if (json.length > 500) {
          toast.error('Maximum 500 rows per import');
          return;
        }

        const validCategoryNames = categories;
        const parsed = json.map((row, idx) => validateRow(row, idx + 2, validCategoryNames));
        setRows(parsed);
        toast.success(`Parsed ${parsed.length} rows (${parsed.filter((r) => r.errors.length === 0).length} valid)`);
      } catch (err) {
        toast.error('Failed to parse file. Use the template format.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    // reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: validRows.length, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        await adminApi.createProduct(row.data);
        done += 1;
      } catch (err) {
        failed += 1;
        console.error(`Row ${row.rowNumber} failed:`, err);
      }
      setProgress({ done: done + failed, total: validRows.length, failed });
    }
    setImporting(false);
    if (failed === 0) {
      toast.success(`Imported ${done} products`);
    } else {
      toast.warning(`Imported ${done} products. ${failed} failed — check console for details.`);
    }
    onComplete();
    handleClose();
  };

  const handleClose = () => {
    if (importing) return;
    setRows([]);
    setProgress({ done: 0, total: 0, failed: 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-accent" />
            Bulk Import Products
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to create multiple products at once. Images can be added per-product after import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Template */}
          <div className="rounded-lg border bg-secondary/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">1. Download the template</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fill in your products. The template includes productType and optional packageItems for bundle SKUs.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" /> Template
              </Button>
            </div>
          </div>

          {/* Step 2: Upload */}
          <div className="rounded-lg border bg-secondary/30 p-4">
            <p className="text-sm font-semibold">2. Upload your filled spreadsheet</p>
            <p className="mt-1 text-xs text-muted-foreground">Supports .xlsx and .xls files. Max 500 rows.</p>
            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="bulk-import-file"
                disabled={importing}
              />
              <label htmlFor="bulk-import-file">
                <Button asChild variant="outline" size="sm" disabled={importing}>
                  <span className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" /> Choose File
                  </span>
                </Button>
              </label>
            </div>
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-secondary/30 px-4 py-2">
                <p className="text-sm font-semibold">3. Review</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {validRows.length} valid
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" /> {invalidRows.length} with errors
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Price</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stock</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                        <td className="px-3 py-2 text-muted-foreground font-mono">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.data.name || <span className="text-muted-foreground italic">—</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.data.category || '—'}</td>
                        <td className="px-3 py-2">${row.data.price?.toFixed(2)}</td>
                        <td className="px-3 py-2">{row.data.stock}</td>
                        <td className="px-3 py-2">
                          {row.errors.length === 0 ? (
                            <span className="text-success">OK</span>
                          ) : (
                            <span className="text-destructive" title={row.errors.join('; ')}>
                              {row.errors[0]}{row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress */}
          {importing && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Importing {progress.done} of {progress.total}…
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={importing}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="bg-accent text-accent-foreground hover:bg-accent-hover"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Import {validRows.length} {validRows.length === 1 ? 'product' : 'products'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
