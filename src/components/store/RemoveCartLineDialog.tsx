import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/inboxToast';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type RemoveCartLineDialogProps = {
  productId: string;
  productName: string;
  onRemove: (productId: string) => void;
  /** e.g. close cart drawer before navigating */
  beforeNavigate?: () => void;
  children: React.ReactNode;
};

export function RemoveCartLineDialog({ productId, productName, onRemove, beforeNavigate, children }: RemoveCartLineDialogProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const goBrowse = () => {
    setOpen(false);
    beforeNavigate?.();
    navigate('/products');
  };

  const confirmRemove = () => {
    onRemove(productId);
    setOpen(false);
    toast.success('Removed from cart', { description: productName });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from cart?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{productName}</span> will be removed from your cart. You can add it again from the product page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" className="mt-0">
            Keep in cart
          </AlertDialogCancel>
          <Button type="button" variant="outline" onClick={goBrowse}>
            Continue shopping
          </Button>
          <Button type="button" variant="destructive" onClick={confirmRemove}>
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
