import { Link } from 'react-router-dom';
import { Minus, Plus, X, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { formatPrice } from '@/lib/formatters';
import { ProductPriceDisplay } from '@/components/store/ProductPriceDisplay';
import { CartLineQuantityInput } from '@/components/store/CartLineQuantityInput';
import { RemoveCartLineDialog } from '@/components/store/RemoveCartLineDialog';
import { Button } from '@/components/ui/button';
import { useSyncCartPrices } from '@/hooks/useSyncCartPrices';
import { useThemeConfig } from '@/hooks/useApi';
import FreeShippingMessage from '@/components/store/FreeShippingMessage';
import { computeShippingFee } from '@/lib/shipping';
import { maxQtyForStock } from '@/lib/cartQuantity';
import { useSyncFreebie } from '@/hooks/useSyncFreebie';
import FreebiePromoBanner from '@/components/store/FreebiePromoBanner';
import { isFreebieCartItem } from '@/lib/freebie';

export default function CartPage() {
  useSyncCartPrices();
  useSyncFreebie();
  const { items, removeItem, updateQuantity, subtotal } = useCartStore();
  const { data: themeConfig } = useThemeConfig();
  const offer = themeConfig?.freebieOffer;
  const merchandiseSubtotal = subtotal(offer);
  const shippingFee = computeShippingFee(merchandiseSubtotal, themeConfig);

  if (items.length === 0) {
    return (
      <div className="sf-container flex flex-col items-center py-20">
        <ShoppingBag className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">Your cart is empty</h2>
        <p className="mt-2 text-sm text-muted-foreground">Add some products to get started</p>
        <Button asChild className="mt-6 bg-accent text-accent-foreground hover:bg-accent-hover">
          <Link to="/products">Browse Products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="sf-container py-8">
      <h1 className="text-2xl font-bold text-foreground">Shopping Cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FreebiePromoBanner items={items} offer={offer} config={themeConfig} className="mb-4" />
          <div className="rounded-lg border">
            {items.map((item, idx) => {
              const max = maxQtyForStock(item.product.stock);
              const freeLine = isFreebieCartItem(item, offer);
              return (
                <div
                  key={`${item.product.productId}-${freeLine ? 'free' : 'paid'}`}
                  className={`flex gap-4 p-4 ${idx > 0 ? 'border-t' : ''} ${freeLine ? 'bg-emerald-50/40' : ''}`}
                >
                  {item.product.images?.[0] ? (
                    <img src={item.product.images[0]} alt={item.product.name} className="h-20 w-20 flex-shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-20 w-20 flex-shrink-0 rounded-md bg-secondary" />
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between">
                      <div>
                        <Link to={`/products/${encodeURIComponent(item.product.productId)}`} className="text-sm font-medium text-foreground hover:text-accent">
                          {item.product.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{item.product.category}</p>
                      </div>
                      <RemoveCartLineDialog productId={item.product.productId} productName={item.product.name} onRemove={removeItem}>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${item.product.name} from cart`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </RemoveCartLineDialog>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                      <div className="flex items-center rounded-md border">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.productId, item.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <CartLineQuantityInput
                          quantity={item.quantity}
                          stock={item.product.stock}
                          onCommit={(q) => updateQuantity(item.product.productId, q)}
                          className="h-8 w-12 min-w-0 border-0 p-0 text-center text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.productId, item.quantity + 1)}
                          disabled={item.quantity >= max}
                          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="font-semibold">
                        <ProductPriceDisplay product={item.product} quantity={item.quantity} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-foreground">Order Summary</h3>
            <FreeShippingMessage merchandiseSubtotal={merchandiseSubtotal} config={themeConfig} className="mt-4" />
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatPrice(merchandiseSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">{shippingFee > 0 ? formatPrice(shippingFee) : 'Free'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium text-muted-foreground">Calculated at checkout</span>
              </div>
              <div className="my-2 border-t" />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Est. total</span>
                <span className="font-bold">{formatPrice(merchandiseSubtotal + shippingFee)}</span>
              </div>
            </div>
            <Button asChild className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent-hover">
              <Link to="/checkout">Checkout <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button variant="outline" className="mt-3 w-full" asChild>
              <Link to="/products">Continue shopping</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
