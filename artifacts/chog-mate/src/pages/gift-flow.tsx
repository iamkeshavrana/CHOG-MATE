import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, ExternalLink, Gift, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetGiftHistoryQueryKey,
  getGetUserProfileQueryKey,
  useGetGiftHistory,
  useGetUserProfile,
  useSendGift,
  type GiftRecord,
  type Match,
} from "@workspace/api-client-react";
import { formatUnits, getAddress, isAddress, parseUnits, decodeEventLog, type Hex } from "viem";
import { useConnection, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { appConfig } from "@/lib/config";
import { monadNetwork } from "@/lib/appkit";

const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "event", name: "Transfer", anonymous: false, inputs: [{ indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "value", type: "uint256" }] },
] as const;

type Recovery = { amount: string; transactionHash: Hex | null; unknown: boolean; confirmedNoTransfer?: boolean };
const hashPattern = /^0x[a-fA-F0-9]{64}$/;

function exactAmount(value: string, decimals: number): bigint | null {
  const clean = value.trim();
  if (!clean || !/^\d+(?:\.\d*)?$/.test(clean)) return null;
  const fraction = clean.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  try { return parseUnits(clean, decimals); } catch { return null; }
}

function shortWallet(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function GiftFlowDialog({ match, senderWallet, open, onOpenChange }: {
  match: Match | null;
  senderWallet: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const connection = useConnection();
  const client = usePublicClient({ chainId: monadNetwork.id });
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const saveGift = useSendGift();
  const queryClient = useQueryClient();
  const [amountText, setAmountText] = useState("");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [knownHash, setKnownHash] = useState<Hex | null>(null);
  const [unknownSubmission, setUnknownSubmission] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [noTransferChecked, setNoTransferChecked] = useState(false);
  const [savedGift, setSavedGift] = useState<GiftRecord | null>(null);
  const [animationPlayed, setAnimationPlayed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const key = useMemo(() => match && senderWallet
    ? `chog-mate:gift-recovery:${senderWallet.toLowerCase()}:${match.id}` : null, [match?.id, senderWallet]);
  const freshProfile = useGetUserProfile(match?.profile.userId ?? "", {
    query: { queryKey: getGetUserProfileQueryKey(match?.profile.userId ?? ""), enabled: Boolean(open && match), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, retry: false },
  });
  const recipientWallet = freshProfile.data?.userId === match?.profile.userId && freshProfile.data.walletVerified && isAddress(freshProfile.data.walletAddress)
    ? getAddress(freshProfile.data.walletAddress) : null;
  const sessionMatches = Boolean(connection.isConnected && connection.address && senderWallet && connection.address.toLowerCase() === senderWallet.toLowerCase());
  const onMonad = connection.chainId === monadNetwork.id;
  const canRead = sessionMatches && onMonad;
  const decimals = useReadContract({ address: appConfig.chogTokenAddress, abi: tokenAbi, functionName: "decimals", chainId: monadNetwork.id, query: { enabled: canRead, staleTime: 3600000 } });
  const balance = useReadContract({ address: appConfig.chogTokenAddress, abi: tokenAbi, functionName: "balanceOf", args: connection.address ? [connection.address] : undefined, chainId: monadNetwork.id, query: { enabled: Boolean(canRead && connection.address), refetchOnWindowFocus: true } });
  const amount = decimals.data === undefined ? null : exactAmount(amountText, decimals.data);
  const balanceText = balance.data !== undefined && decimals.data !== undefined ? formatUnits(balance.data, decimals.data) : null;
  const precisionInvalid = Boolean(amountText && decimals.data !== undefined && /^\d+(?:\.\d*)?$/.test(amountText.trim()) && (amountText.trim().split(".")[1] ?? "").length > decimals.data);

  useEffect(() => {
    setAmountText("");
    setStage("");
    setError("");
    setKnownHash(null);
    setUnknownSubmission(false);
    setRecoveryHash("");
    setNoTransferChecked(false);
    setSavedGift(null);
    setAnimationPlayed(false);
    setAnimationFailed(false);
    if (!key || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw) as Recovery;
      if (typeof draft.amount !== "string" || (!draft.transactionHash && draft.unknown !== true)) return;
      setAmountText(draft.amount);
      setKnownHash(draft.transactionHash && hashPattern.test(draft.transactionHash) ? draft.transactionHash : null);
      setUnknownSubmission(draft.unknown === true && !draft.transactionHash);
      setError(draft.transactionHash
        ? "A confirmed transfer is waiting to be saved. Retry this same transaction only."
        : "A wallet submission may have succeeded. Recover its hash or confirm no transfer before sending again.");
    } catch { /* Keep the flow usable if local storage is unavailable. */ }
  }, [key]);

  function persist(next: Recovery) {
    if (!key) return;
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { setError("Recovery details could not be stored on this device. Keep this page open."); }
  }
  function clearRecovery() {
    if (key) { try { window.localStorage.removeItem(key); } catch { /* A stale draft can only retry its known hash. */ } }
    setKnownHash(null);
    setUnknownSubmission(false);
  }
  async function saveConfirmed(hash: Hex, amountValue: string) {
    setStage("Saving confirmed gift…");
    setError("");
    try {
      const record = await saveGift.mutateAsync({ matchId: match!.id, data: { amount: amountValue, transactionHash: hash } });
      setSavedGift(record);
      setStage("Gift confirmed and saved.");
      clearRecovery();
      void queryClient.invalidateQueries({ queryKey: getGetGiftHistoryQueryKey(match!.id) });
      const playedKey = `chog-mate:gift-animation:${senderWallet?.toLowerCase()}:${hash.toLowerCase()}`;
      try {
        if (!window.localStorage.getItem(playedKey)) {
          window.localStorage.setItem(playedKey, "played");
          setAnimationPlayed(true);
        }
      } catch { setAnimationPlayed(true); }
    } catch {
      setStage("");
      setError("The transfer is confirmed, but saving the gift failed. Retry with the same transaction; do not send again.");
      setKnownHash(hash);
      persist({ amount: amountValue, transactionHash: hash, unknown: false });
    }
  }
  async function retryKnown() {
    if (!knownHash || !client || !match) return;
    try {
      setStage("Checking the Monad receipt…");
      const receipt = await client.waitForTransactionReceipt({ hash: knownHash, confirmations: 1 });
      if (receipt.status !== "success") {
        setStage("");
        setError("This transaction did not succeed on Monad. No gift was saved.");
        return;
      }
      await saveConfirmed(knownHash, amountText);
    } catch {
      setStage("");
      setError("Receipt could not be checked. Keep this transaction hash and retry; no new transfer was sent.");
    }
  }
  async function recoverExisting() {
    const hash = recoveryHash.trim() as Hex;
    if (!hashPattern.test(hash) || !client || !recipientWallet || !connection.address || amount === null || amount <= 0n) {
      setError("Enter a valid transaction hash, amount, and freshly verified recipient before recovery.");
      return;
    }
    try {
      setStage("Verifying recovered transaction…");
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      const matchesTransfer = receipt.status === "success" && receipt.logs.some(log => {
        if (log.address.toLowerCase() !== appConfig.chogTokenAddress.toLowerCase()) return false;
        try {
          const event = decodeEventLog({ abi: tokenAbi, data: log.data, topics: log.topics });
          return event.eventName === "Transfer" &&
            event.args.from.toLowerCase() === connection.address!.toLowerCase() &&
            event.args.to.toLowerCase() === recipientWallet.toLowerCase() &&
            event.args.value === amount;
        } catch { return false; }
      });
      if (!matchesTransfer) {
        setStage("");
        setError("That confirmed transaction does not contain the matching $CHOG transfer. No gift was saved.");
        return;
      }
      setKnownHash(hash);
      persist({ amount: amountText, transactionHash: hash, unknown: false });
      await saveConfirmed(hash, amountText);
    } catch {
      setStage("");
      setError("The transaction could not be verified. No gift was saved.");
    }
  }
  async function sendGift() {
    setError("");
    if (!match || match.status !== "active") { setError("Gifts are available only for an active match."); return; }
    if (!sessionMatches) { setError("Connect the wallet verified for your CHOG MATE profile."); return; }
    if (!onMonad) { setError("Switch your wallet to Monad before sending."); return; }
    if (unknownSubmission && !noTransferChecked) { setError("Recover the pending transaction or confirm you checked wallet activity and no transfer was sent."); return; }
    if (!decimals.data || decimals.isError || balance.data === undefined || balance.isError) { setError("The live token precision or balance is unavailable. No transfer was sent."); return; }
    if (amount === null || amount <= 0n) { setError("Enter a nonzero amount using the token’s supported decimal precision."); return; }
    if (balance.data < amount) { setError("Your available $CHOG balance is lower than this amount."); return; }
    setStage("Verifying the match’s current wallet…");
    const refreshed = await freshProfile.refetch().catch(() => null);
    const recipient = refreshed && !refreshed.isError && refreshed.data?.userId === match.profile.userId && refreshed.data.walletVerified && isAddress(refreshed.data.walletAddress)
      ? getAddress(refreshed.data.walletAddress) : null;
    if (!recipient) { setStage(""); setError("The match’s current verified wallet could not be confirmed. No transfer was sent."); return; }
    let hash: Hex | null = null;
    try {
      setStage("Confirm the transfer in your wallet…");
      hash = await writeContractAsync({ address: appConfig.chogTokenAddress, abi: tokenAbi, functionName: "transfer", args: [recipient, amount], chainId: monadNetwork.id });
      setKnownHash(hash);
      persist({ amount: amountText, transactionHash: hash, unknown: false });
      setStage("Waiting for Monad confirmation…");
      if (!client) throw new Error("Receipt client unavailable");
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") {
        clearRecovery();
        setStage("");
        setKnownHash(null);
        setError("The $CHOG transfer failed on Monad. No gift was saved; you may start a new transfer.");
        return;
      }
      void balance.refetch().catch(() => undefined);
      await saveConfirmed(hash, amountText);
    } catch (cause) {
      setStage("");
      if (hash) {
        setKnownHash(hash);
        persist({ amount: amountText, transactionHash: hash, unknown: false });
        setError("Transfer submitted, but confirmation could not be checked. Retry this same hash; do not send again.");
      } else {
        const rejected = Boolean(cause && typeof cause === "object" && ("code" in cause && cause.code === 4001 || "name" in cause && cause.name === "UserRejectedRequestError"));
        if (rejected) setError("Wallet request rejected. No transfer was sent.");
        else {
          setUnknownSubmission(true);
          setNoTransferChecked(false);
          persist({ amount: amountText, transactionHash: null, unknown: true });
          setError("Wallet outcome is unknown. Check wallet activity and recover the hash, or explicitly confirm no transfer was sent before trying again.");
        }
      }
    }
  }

  const savedAnimationSrc = import.meta.env.VITE_GIFT_ANIMATION_URL?.trim() || "https://media1.tenor.com/m/ZsVXpYhoKiQAAAAd/waweonline-wawe.gif";
  return <Dialog open={open} onOpenChange={next => { if (!next && (knownHash || unknownSubmission) && !savedGift) { setError("Recovery is preserved. Close only if you can return to this match later."); } else onOpenChange(next); }}>
    <DialogContent className="surface max-h-[90dvh] max-w-md overflow-y-auto rounded-[28px] border-[#e8dfd5] bg-[#fffaf6]">
      <DialogHeader>
        <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-[#f3eaf6] text-[#70438d]"><Gift size={22}/></div>
        <DialogTitle className="display text-2xl font-extrabold text-[#39234f]">Send a little $CHOG</DialogTitle>
        <DialogDescription className="text-sm leading-6 text-[#82778c]">A direct token transfer to your mutual match. Verify the recipient and amount before approving in your wallet.</DialogDescription>
      </DialogHeader>
      {match && <div className="rounded-2xl border border-[#eadfe0] bg-white/75 p-4" data-testid="gift-recipient">
        <p className="font-semibold text-[#39284a]">{match.profile.displayName} <span className="font-normal text-[#887c90]">@{match.profile.username}</span></p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6a5679]"><BadgeCheck size={14}/> {freshProfile.isFetching ? "Checking verified wallet…" : recipientWallet ?? "Verified wallet unavailable"}</p>
      </div>}
      <div className="rounded-2xl border border-[#eadfe0] bg-white/75 p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-[#746779]"><span>Available balance</span><strong className="tabular-nums text-[#39284a]" data-testid="gift-balance">{balanceText === null ? balance.isLoading || decimals.isLoading ? "Reading Monad…" : "Unavailable" : `${balanceText} $CHOG`}</strong></div>
        <label htmlFor="gift-amount" className="mt-4 block text-xs font-bold text-[#594d64]">Amount to send</label>
        <div className="mt-2 flex items-center rounded-2xl border border-[#e4d8df] bg-[#fffdf9] px-4 focus-within:border-[#9870b3]">
          <input id="gift-amount" value={amountText} onChange={event => setAmountText(event.target.value)} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-3 text-xl font-semibold tabular-nums text-[#39284a] outline-none" aria-label="Gift amount in CHOG" data-testid="input-gift-amount"/>
          <span className="font-mono text-xs text-[#806b8d]">$CHOG</span>
        </div>
        {precisionInvalid && <p className="mt-2 text-xs text-[#a34646]" role="alert" data-testid="gift-precision-error">This token supports up to {decimals.data} decimal places.</p>}
      </div>
      {!sessionMatches && <p className="text-xs text-[#a34646]" role="status">Connect the wallet verified for this profile to continue.</p>}
      {sessionMatches && !onMonad && <p className="text-xs text-[#a34646]" role="alert">Switch to Monad before sending.</p>}
      {stage && <p className="rounded-xl bg-[#f3eaf6] px-3 py-2 text-xs font-semibold text-[#694480]" role="status" data-testid="gift-stage">{stage}</p>}
      {error && <p className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs leading-5 text-[#a34646]" role="alert" data-testid="gift-error">{error}</p>}
      {knownHash && <div className="rounded-xl border border-[#e7ddec] bg-white p-3 text-xs">
        <p className="font-semibold text-[#594d64]">Known transaction — retry saving only</p>
        <a className="mt-2 inline-flex items-center gap-1 break-all text-[#70438d] underline" href={`https://monadscan.com/tx/${knownHash}`} target="_blank" rel="noreferrer">View on MonadScan <ExternalLink size={12}/></a>
        <button type="button" onClick={() => void retryKnown()} disabled={saveGift.isPending || !client} className="button-soft mt-3 w-full rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50" data-testid="button-retry-gift-save">Check receipt and retry save</button>
      </div>}
      {unknownSubmission && <div className="space-y-3 rounded-xl border border-[#e7ddec] bg-white p-3">
        <p className="text-xs leading-5 text-[#594d64]">No new transfer is available until you recover the hash or confirm wallet activity shows no transfer.</p>
        <label htmlFor="gift-recovery-hash" className="block text-xs font-semibold text-[#594d64]">Recover transaction hash</label>
        <input id="gift-recovery-hash" value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} placeholder="0x…" autoCapitalize="none" spellCheck={false} className="field text-xs" data-testid="input-gift-recovery-hash"/>
        <button type="button" onClick={() => void recoverExisting()} disabled={!client || freshProfile.isFetching} className="button-soft w-full rounded-full px-4 py-2.5 text-xs font-bold" data-testid="button-recover-gift">Verify and save recovered gift</button>
        <label className="flex items-start gap-2 text-[11px] leading-5 text-[#746779]"><input type="checkbox" checked={noTransferChecked} onChange={event => { setNoTransferChecked(event.target.checked); persist({ amount: amountText, transactionHash: null, unknown: true, confirmedNoTransfer: event.target.checked }); }} className="mt-1 accent-[#70438d]"/> I checked my wallet and Monad activity; no transfer was sent.</label>
      </div>}
      {savedGift && <div className="rounded-2xl border border-[#d9e6d5] bg-[#f3f8f0] p-4 text-center" role="status" data-testid="gift-success">
        {animationPlayed && !animationFailed ? <img src={savedAnimationSrc} alt="" className="mx-auto mb-2 h-20 w-20 object-contain" onError={() => setAnimationFailed(true)}/> : <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-white text-[#547a54]"><Check size={20}/></div>}
        <p className="font-semibold text-[#47664a]">Gift confirmed and saved</p><p className="mt-1 text-xs text-[#718273]">{savedGift.amount} $CHOG to {savedGift.recipientName}</p>
      </div>}
      {!knownHash && !savedGift && <button type="button" onClick={() => void sendGift()} disabled={walletPending || saveGift.isPending || unknownSubmission && !noTransferChecked || !match || match.status !== "active"} className="button-primary w-full rounded-full px-5 py-3 text-sm font-bold disabled:opacity-50" data-testid="button-send-gift">
        {walletPending ? "Confirm in wallet…" : stage.includes("Waiting") ? "Waiting for Monad…" : "Send $CHOG"}
      </button>}
      <p className="flex items-center justify-center gap-1.5 text-[10px] text-[#8b8091]"><ShieldCheck size={13}/> Private between matches · confirmed on Monad</p>
    </DialogContent>
  </Dialog>;
}

export function GiftHistory({ matchId, currentUserId }: { matchId: string; currentUserId: string | undefined }) {
  const history = useGetGiftHistory(matchId, { query: { queryKey: getGetGiftHistoryQueryKey(matchId), enabled: Boolean(matchId), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true } });
  if (history.isLoading) return <div className="skeleton mx-auto my-2 h-16 w-64 rounded-2xl" aria-label="Loading gift history"/>;
  if (history.isError) return <div className="mx-auto my-2 max-w-sm rounded-xl border border-[#eadfe0] bg-white/80 px-3 py-2 text-center text-[11px] text-[#806b8d]" role="status">Gift history could not be loaded. <button type="button" className="font-bold underline" onClick={() => void history.refetch()}>Retry</button></div>;
  const confirmed = (history.data ?? []).filter(gift => gift.status === "confirmed");
  return <div className="mx-auto flex w-full max-w-md flex-col gap-2 py-1" data-testid="gift-history">
    {confirmed.map(gift => {
      const outgoing = gift.senderId === currentUserId;
      const from = outgoing ? gift.senderName : gift.recipientName;
      const to = outgoing ? gift.recipientName : gift.senderName;
      return <article key={gift.id} className={`rounded-2xl border px-4 py-3 ${outgoing ? "ml-auto border-[#e5d8eb] bg-[#f5edf7]" : "mr-auto border-[#eadfe0] bg-white/90"}`} data-testid={`gift-event-${gift.id}`}>
        <p className="flex items-center gap-2 text-xs font-semibold text-[#594d64]"><Gift size={14} className="shrink-0 text-[#70438d]"/>{outgoing ? `You sent ${to} a gift` : `${from} sent you a gift`}</p>
        <p className="mt-1 text-sm font-bold tabular-nums text-[#39284a]">{gift.amount} $CHOG <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium text-[#658166]"><Check size={12}/> Confirmed</span></p>
        <a href={`https://monadscan.com/tx/${gift.transactionHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#70438d] underline" data-testid={`link-gift-transaction-${gift.id}`}>View on Monad <ExternalLink size={11}/></a>
      </article>;
    })}
  </div>;
}
