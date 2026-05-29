import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, EngravingDetails, FreebieOffer, Product } from '@/types';
import { clampCartQuantity, maxQtyForStock } from '@/lib/cartQuantity';
import { isFreebieCartItem, toFreebieCartProduct } from '@/lib/freebie';

const lineKey = (item: CartItem) => item.lineId ?? item.product.productId;

const newLineId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  /** quantity is ignored for engraving items (always 1; each is a unique line). */
  addItem: (product: Product, quantity?: number, engraving?: EngravingDetails) => void;
  /** key is the cart line key (lineId for custom items, otherwise productId). */
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
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
      addItem: (product, quantity = 1, engraving) => {
        const max = maxQtyForStock(product.stock);
        if (max <= 0) return;
        // Personalized (engraving) items are unique per customization — they
        // never merge with other lines and are always added as qty 1.
        if (engraving) {
          set((state) => ({
            items: [...state.items, { product, quantity: 1, engraving, lineId: newLineId() }],
          }));
          return;
        }
        const addQty = clampCartQuantity(quantity, product.stock);
        set((state) => {
          const existing = state.items.find(
            i => i.product.productId === product.productId && !i.isFreebie && !i.engraving
          );
          if (existing) {
            const merged = clampCartQuantity(existing.quantity + addQty, product.stock);
            return {
              items: state.items.map(i =>
                i === existing
                  ? { ...i, quantity: merged, product: { ...i.product, ...product, stock: product.stock } }
                  : i
              ),
            };
          }
          return { items: [...state.items, { product, quantity: addQty }] };
        });
      },
      removeItem: (key) => {
        set((state) => ({ items: state.items.filter(i => lineKey(i) !== key) }));
      },
      updateQuantity: (key, quantity) => {
        const item = get().items.find(i => lineKey(i) === key);
        if (!item) return;
        // Freebie and engraving lines have a fixed quantity of 1.
        if (item.isFreebie || item.engraving) return;
        const max = maxQtyForStock(item.product.stock);
        if (quantity <= 0 || max <= 0) {
          get().removeItem(key);
          return;
        }
        const capped = clampCartQuantity(quantity, item.product.stock);
        set((state) => ({
          items: state.items.map(i =>
            lineKey(i) === key ? { ...i, quantity: capped } : i
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
