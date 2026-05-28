import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ProductCard from '@/components/store/ProductCard';
import { useProducts, useCategories } from '@/hooks/useApi';

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category') || '';
  const [search, setSearch] = useState('');

  const { data: categoriesData, isLoading: loadingCats } = useCategories();
  const { data: productsData, isLoading: loadingProducts } = useProducts({
    category: categoryFilter || undefined,
    search: search || undefined,
  });

  const categories = (categoriesData || []).filter(c => c.isActive);
  const products = productsData?.items || [];

  // Client-side filtering for instant search feel (API also filters)
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!p.isActive) return false;
      return true;
    });
  }, [products]);

  return (
    <div className="sf-container py-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full flex-shrink-0 lg:w-56">
          <h2 className="text-sm font-semibold text-foreground">Categories</h2>
          <div className="mt-3 flex flex-row flex-wrap gap-2 lg:flex-col lg:gap-1">
            <button
              onClick={() => { searchParams.delete('category'); setSearchParams(searchParams); }}
              className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${!categoryFilter ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
            >
              All Products
            </button>
            {categories.map(cat => (
              <button
                key={cat.categoryId}
                onClick={() => { searchParams.set('category', cat.name); setSearchParams(searchParams); }}
                className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${categoryFilter === cat.name ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold text-foreground">
              {categoryFilter || 'All Products'}
            </h1>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</p>

          {loadingProducts ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(p => <ProductCard key={p.productId} product={p} />)}
            </div>
          )}

          {!loadingProducts && filtered.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-muted-foreground">No products found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
