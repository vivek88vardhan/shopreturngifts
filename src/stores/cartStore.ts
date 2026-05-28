import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, FreebieOffer, Product } from '@/types';
import { clampCartQuantity, maxQtyForStock } from '@/lib/cartQuantity';
import { isFreebieCartItem, toFreebieCartProduct } from '@/lib/freebie';

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  subtotal: (offer?: FreebieOffer | null) => number;
  itemCount: () => number;
  syncFreebie: (offer?: FreebieOffer | null) => void;
  removeFreebie: (offer?: FreebieOffer | null) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      addItem: (product, quantity = 1) => {
        const max = maxQtyForStock(product.stock);
        if (max <= 0) return;
        const addQty = clampCartQuantity(quantity, product.stock);
        set((state) => {
          const existing = state.items.find(
            i => i.product.productId === product.productId && !i.isFreebie
          );
          if (existing) {
            const merged = clampCartQuantity(existing.quantity + addQty, product.stock);
            return {
              items: state.items.map(i =>
                i.product.productId === product.productId
                  ? { ...i, quantity: merged, product: { ...i.product, ...product, stock: product.stock } }
                  : i
              ),
            };
          }
          return { items: [...state.items, { product, quantity: addQty }] };
        });
      },
      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter(i => i.product.productId !== productId) }));
      },
      updateQuantity: (productId, quantity) => {
        const item = get().items.find(i => i.product.productId === productId);
        if (!item) return;
        if (item.isFreebie) return;
        const max = maxQtyForStock(item.product.stock);
        if (quantity <= 0 || max <= 0) {
          get().removeItem(productId);
          return;
        }
        const capped = clampCartQuantity(quantity, item.product.stock);
        set((state) => ({
          items: state.items.map(i =>
            i.product.productId === productId ? { ...i, quantity: capped } : i
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      subtotal: (offer) =>
        get().items.reduce((sum, i) => {
          if (isFreebieCartItem(i, offer)) return sum;
          return sum + i.product.price * i.quantity;
        }, 0),
      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      syncFreebie: (offer) => {
        const pid = offer?.product?.productId;
        if (!pid) {
          get().removeFreebie(offer);
          return;
        }
        const { items } = get();
        const paid = items.reduce((sum, i) => {
          if (isFreebieCartItem(i, offer)) return sum;
          return sum + i.product.price * i.quantity;
        }, 0);
        const min = offer?.minOrderAmount ?? 50;
        const eligible = !!offer?.active && !!offer.product && paid >= min;
        const hasFreebie = items.some(i => i.product.productId === pid && (i.isFreebie || i.product.price === 0));

        if (!eligible) {
          if (hasFreebie) {
            set({
              items: items.filter(
                i => !(i.product.productId === pid && (i.isFreebie || i.product.price === 0))
              ),
            });
          }
          return;
        }

        if (hasFreebie) {
          set({
            items: items.map(i =>
              i.product.productId === pid
                ? {
                    ...i,
                    isFreebie: true,
                    quantity: 1,
                    product: toFreebieCartProduct(offer.product!),
                  }
                : i
            ),
          });
          return;
        }

        if (offer.product.stock < 1) return;
        set({
          items: [
            ...items,
            { product: toFreebieCartProduct(offer.product), quantity: 1, isFreebie: true },
          ],
        });
      },
      removeFreebie: (offer) => {
        const pid = offer?.product?.productId;
        if (!pid) return;
        set((state) => ({
          items: state.items.filter(
            i => !(i.product.productId === pid && (i.isFreebie || i.product.price === 0))
          ),
        }));
      },
    }),
    { name: 'shopreturngifts-cart', partialize: (state) => ({ items: state.items }) }
  )
);
