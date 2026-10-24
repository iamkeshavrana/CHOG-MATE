import { lazy, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const WalletAuthPanel = lazy(() => import('@/components/wallet-auth'));

export function WalletConnectionDialog({
  open,
  onOpenChange,
  returnTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="surface max-w-2xl rounded-[28px] border-[#e8dfd5] bg-[#fffaf6] p-6 sm:p-8">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="display text-2xl font-extrabold text-[#24133f]">
            Connect to make a connection.
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#82778c]">
            Connect your wallet to scan its Chog collection. Choose the NFT you
            want to represent you, then sign in and create your profile.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(78vh,820px)] overflow-y-auto pr-1">
        <Suspense
          fallback={
            <div className="skeleton h-14 w-52 rounded-full" role="status">
              Loading wallet options…
            </div>
          }
        >
          <WalletAuthPanel returnTo={returnTo} />
        </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
