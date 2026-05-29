import { Link, useNavigate } from 'react-router-dom';
import type { Product } from '@/types';
import { ProductPriceDisplay } from '@/components/store/ProductPriceDisplay';
import { useCartStore } from '@/stores/cartStore';
import { ShoppingCart, Package, Sparkles } from 'lucide-react';
import { toast } from '@/lib/inboxToast';
import { isCustomProduct } from '@/lib/customProduct';

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const navigate = useNavigate();
  const custom = isCustomProduct(product);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stock <= 0) {
      toast.error('This product is out of stock');
      return;
    }
    // Custom-category items require engraving details collected on the detail page.
    if (custom) {
      navigate(`/products/${encodeURIComponent(product.productId)}`);
      return;
    }
    addItem(product, 1);
    toast.success(`${product.name} added to cart`);
  };

  return (
    <Link to={`/products/${encodeURIComponent(product.productId)}`} className="group sf-card-hover flex flex-col overflow-hidden p-0">
      <div className="relative aspect-square overflow-hidden bg-secondary">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleAdd}
            disabled={product.stock <= 0}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
            aria-label={custom ? 'Personalize and add to cart' : 'Add to cart'}
            title={custom ? 'Personalize' : 'Add to cart'}
          >
            {custom ? <Sparkles className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span className="text-xs font-medium text-muted-foreground">{product.category}</span>
        <h3 className="mt-1 text-sm font-semibold text-foreground line-clamp-2">{product.name}</h3>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-base font-bold text-foreground">
            <ProductPriceDisplay product={product} />
          </span>
          {product.stock <= 5 && product.stock > 0 && (
            <span className="text-xs text-destructive">Only {product.stock} left</span>
          )}
          {product.stock === 0 && (
            <span className="text-xs text-destructive">Out of stock</span>
          )}
        </div>
      </div>
    </Link>
  );
}
