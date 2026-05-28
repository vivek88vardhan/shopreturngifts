import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { clampCartQuantity, sanitizeCartQtyInput } from '@/lib/cartQuantity';

type CartLineQuantityInputProps = {
  quantity: number;
  stock: number;
  onCommit: (qty: number) => void;
  className?: string;
};

/**
 * Controlled qty text field: allows empty while editing, digits only, capped at store max per product,
 * commits clamped value on blur / Enter (also respects stock).
 */
export function CartLineQuantityInput({ quantity, stock, onCommit, className }: CartLineQuantityInputProps) {
  const [text, setText] = useState(String(quantity));

  useEffect(() => {
    setText(String(quantity));
  }, [quantity]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      const next = clampCartQuantity(1, stock);
      onCommit(next);
      setText(String(next));
      return;
    }
    const n = parseInt(trimmed, 10);
    if (Number.isNaN(n)) {
      setText(String(quantity));
      return;
    }
    const next = clampCartQuantity(n, stock);
    onCommit(next);
    setText(String(next));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label="Quantity"
      value={text}
      onChange={(e) => setText(sanitizeCartQtyInput(e.target.value, stock))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}
