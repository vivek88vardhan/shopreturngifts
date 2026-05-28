import { X, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { formatPrice } from '@/lib/formatters';
import { ProductPriceDisplay } from '@/components/store/ProductPriceDisplay';
import { CartLineQuantityInput } from '@/components/store/CartLineQuantityInput';
import { RemoveCartLineDialog } from '@/components/store/RemoveCartLineDialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { maxQtyForStock } from '@/lib/cartQuantity';
import { useThemeConfig } from '@/hooks/useApi';
import FreeShippingMessage from '@/components/store/FreeShippingMessage';
import { computeShippingFee } from '@/lib/shipping';
import { useSyncFreebie } from '@/hooks/useSyncFreebie';
import FreebiePromoBanner from '@/components/store/FreebiePromoBanner';
import { isFreebieCartItem } from '@/lib/freebie';

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal } = useCartStore();
  const navigate = useNavigate();
  const { data: themeConfig } = useThemeConfig();
  useSyncFreebie();
  const offer = themeConfig?.freebieOffer;
  const merchandiseSubtotal = subtotal(offer);
  const shippingFee = computeShippingFee(merchandiseSubtotal, themeConfig);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm" onClick={closeCart} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-xl animate-slide-in-right">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Shopping Cart</h2>
          <button onClick={closeCart} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">Your cart is empty</p>
            <Button variant="outline" onClick={() => { closeCart(); navigate('/products'); }}>
              Browse Products
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <FreebiePromoBanner items={items} offer={offer} config={themeConfig} className="mb-4" />
              <div className="flex flex-col gap-4">
                {items.map((item) => {
                  const freeLine = isFreebieCartItem(item, offer);
                  return (
                  <div
                    key={`${item.product.productId}-${freeLine ? 'free' : 'paid'}`}
                    className={`flex gap-4 rounded-lg border p-3 ${freeLine ? 'border-emerald-200 bg-emerald-50/40' : ''}`}
                  >
                    {item.product.images?.[0] ? (
                      <img src={item.product.images[0]} alt={item.product.name} className="h-16 w-16 flex-shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-16 w-16 flex-shrink-0 rounded-md bg-secondary" />
                    )}
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium leading-tight">
                          {item.product.name}
                          {freeLine && (
                            <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              FREE GIFT
                            </span>
                          )}
                        </p>
                        <RemoveCartLineDialog
                          productId={item.product.productId}
                          productName={item.product.name}
                          onRemove={removeItem}
                          beforeNavigate={closeCart}
                        >
                          <button
                            type="button"
                            className="ml-2 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${item.product.name} from cart`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </RemoveCartLineDialog>
                      </div>
                      <div className="mt-1">
                        <ProductPriceDisplay
                          product={item.product}
                          compareClassName="text-xs text-muted-foreground line-through"
                          saleClassName="text-sm font-semibold text-accent"
                        />
                      </div>
                      {freeLine ? (
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Qty: 1</span>
                          <span className="text-sm font-semibold text-emerald-700">{formatPrice(0)}</span>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.productId, item.quantity - 1)}
                            className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-secondary"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <CartLineQuantityInput
                            quantity={item.quantity}
                            stock={item.product.stock}
                            onCommit={(q) => updateQuantity(item.product.productId, q)}
                            className="h-6 w-11 min-w-0 border-0 p-0 text-center text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.productId, item.quantity + 1)}
                            disabled={item.quantity >= maxQtyForStock(item.product.stock)}
                            className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-secondary disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <span className="ml-auto text-sm font-medium">
                            <ProductPriceDisplay product={item.product} quantity={item.quantity} saleClassName="text-sm font-medium text-foreground" />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t p-6">
              <FreeShippingMessage merchandiseSubtotal={merchandiseSubtotal} config={themeConfig} className="mb-4" />
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(merchandiseSubtotal)}</span>
              </div>
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">{shippingFee > 0 ? formatPrice(shippingFee) : 'Free'}</span>
              </div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Est. total</span>
                <span className="text-lg font-semibold">{formatPrice(merchandiseSubtotal + shippingFee)}</span>
              </div>
              <Button
                className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
                onClick={() => { closeCart(); navigate('/checkout'); }}
              >
                Proceed to Checkout
              </Button>
              <Button variant="outline" className="mt-2 w-full" onClick={() => { closeCart(); navigate('/cart'); }}>
                View Full Cart
              </Button>
              <Button variant="outline" className="mt-2 w-full" onClick={() => { closeCart(); navigate('/products'); }}>
                Continue shopping
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
