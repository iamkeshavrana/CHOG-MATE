import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BadgeCheck, FileText, Gift, Heart, Image as ImageIcon, MessageCircle, Mic, MoreHorizontal, Paperclip, Phone, Send, Sparkles, Undo2, Video, X } from 'lucide-react';
import { Link } from 'wouter';
import {
  getGetAuthSessionQueryKey,
  getDiscoverProfilesQueryKey, getGetConversationsQueryKey, getGetExMatchesQueryKey,
  getGetMatchesQueryKey, getGetMessagesQueryKey, getGetUserProfileQueryKey,
  getGetMeQueryKey, getGetLikeInboxQueryKey, getGetSentLikesQueryKey,
  getGetGiftHistoryQueryKey,
  useBlockProfile, useDiscoverProfiles, useGetConversations, useGetExMatches,
  useGetMatches, useGetMessages, useGetGiftHistory, useGetAuthSession, useGetLikeInbox, useGetMe, useGetUserProfile,
  useGetSentLikes, useRematchProfile, useReportProfile, useUnlikeProfile,
  useRequestMessageAttachmentUploadUrl, useSendMessage, useSwipeProfile, useUndoPass, useUnmatchProfile,
} from '@workspace/api-client-react';
import { type Conversation, type DiscoverProfilesParams, type GiftRecord, type LikeInboxItem, type Match, type Message, type Profile, ReportInputReason } from '@workspace/api-client-react';
import { formatUnits, getAddress, isAddress, type Hex } from 'viem';
import { useConnection, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { AppShell, ChogArtwork, EmptyState, Eyebrow, PageTitle, ProfileAvatar, ProfileOpenButton, QueryState } from '@/components/shared';
import { useProfileViewer } from '@/components/profile-viewer-context';
import { WalletConnectionDialog } from '@/components/wallet-connection-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { appConfig } from '@/lib/config';
import { monadNetwork } from '@/lib/appkit';
import { supabase } from '@/lib/supabase';
import { useCallControls } from '@/components/call-provider';
import { GiftChatEvent, GiftFlowDialog } from './gift-flow';
import { buildConversationTimeline } from '@/lib/conversation-timeline';

function ReportControl({
  profile,
  canInteract,
  onAuthRequired,
}: {
  profile: Profile;
  canInteract: boolean;
  onAuthRequired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<keyof typeof ReportInputReason>('other');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState('');
  const report = useReportProfile();
  const block = useBlockProfile();
  const qc = useQueryClient();
  async function submitReport() {
    try {
      await report.mutateAsync({ data: { targetUserId: profile.userId, reason: ReportInputReason[reason], details: details || undefined } });
      setNotice('Report sent to the safety team. Thank you.');
      setOpen(false);
    } catch { setNotice('We could not send that report. Please try again.'); }
  }
  async function blockProfile() {
    if (!window.confirm(`Block @${profile.username}? You will no longer see this profile.`)) return;
    try {
      await block.mutateAsync({ data: { targetUserId: profile.userId } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getDiscoverProfilesQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetExMatchesQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
      ]);
      setNotice('Profile blocked.');
    } catch { setNotice('We could not block this profile. Please try again.'); }
  }
  return <div className="relative">
    <button onClick={() => canInteract ? setOpen(!open) : onAuthRequired()} className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-[#64566f] transition hover:bg-white" aria-label="Safety options" data-testid={`button-safety-${profile.userId}`}><MoreHorizontal size={19} /></button>
    {open && <div className="glass-popover absolute right-0 top-12 z-20 w-64 rounded-2xl p-4">
      <label className="text-xs font-bold text-[#51445f]">Report this profile</label>
      <select value={reason} onChange={e => setReason(e.target.value as keyof typeof ReportInputReason)} className="field mt-2 text-sm" data-testid={`select-report-reason-${profile.userId}`}>
        {Object.entries(ReportInputReason).map(([key,value]) => <option value={key} key={key}>{value.replace('_',' ')}</option>)}
      </select>
      <textarea value={details} onChange={e => setDetails(e.target.value)} className="field mt-2 min-h-20 resize-y text-sm" placeholder="Details (optional)" data-testid={`input-report-details-${profile.userId}`} />
      <button onClick={submitReport} disabled={report.isPending} className="button-primary mt-2 w-full rounded-xl py-2 text-xs font-bold disabled:opacity-50" data-testid={`button-submit-report-${profile.userId}`}>{report.isPending ? 'Sending…' : 'Send report'}</button>
      <button onClick={blockProfile} disabled={block.isPending} className="mt-2 w-full rounded-xl border border-[#eedbd6] py-2 text-xs font-bold text-[#9c4c42] hover:bg-[#fff4f0]" data-testid={`button-block-${profile.userId}`}>{block.isPending ? 'Blocking…' : 'Block profile'}</button>
    </div>}
    {notice && <div role="status" className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-[#ded4f5] bg-white p-3 text-xs leading-5 text-[#554477]" data-testid={`status-safety-${profile.userId}`}>{notice}</div>}
  </div>;
}

function DiscoverCard({
  profile,
  onAction,
  onOpenProfile,
  onAuthRequired,
  canInteract,
}: {
  profile: Profile;
  onAction: (action: 'pass'|'like'|'super_like') => void;
  onOpenProfile: () => void;
  onAuthRequired: () => void;
  canInteract: boolean;
}) {
  const touchStart = useRef<number | null>(null);
  function finishTouch(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStart.current === null) return;
    const endX = event.changedTouches[0]?.clientX;
    const distance = endX === undefined ? 0 : endX - touchStart.current;
    touchStart.current = null;
    if (distance > 70) onAction('like');
    else if (distance < -70) onAction('pass');
  }
  return <article className="surface discover-profile-card mx-auto w-full min-w-0 overflow-hidden rounded-[28px]" data-testid={`card-profile-${profile.userId}`}>
    <div
      onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={finishTouch}
      onTouchCancel={() => { touchStart.current = null; }}
      className="discover-profile-art relative isolate w-full touch-pan-y"
      data-testid={`swipe-surface-${profile.userId}`}
      aria-label={`Verified Chog artwork and profile for ${profile.displayName}. Swipe right to like or left to pass.`}
    >
      <ChogArtwork chog={profile.chog} fit="contain" className="discover-profile-image" />
      <div className="discover-profile-topline" aria-hidden="true">
        <span className="discover-profile-verified"><BadgeCheck size={13} strokeWidth={2.2} /> Verified Chog</span>
        <span className="discover-profile-token">
          Chog #{profile.chog.tokenId}{profile.chog.tier ? <span> · {profile.chog.tier}</span> : null}
        </span>
      </div>
      <button
        type="button"
        onClick={event => { event.stopPropagation(); onOpenProfile(); }}
        className="discover-profile-details"
        aria-label={`View ${profile.displayName}${profile.age !== null ? `, ${profile.age}` : ''}'s full profile`}
        data-testid={`button-open-profile-${profile.userId}`}
      >
        <span className="discover-profile-name-line">
          <span className="display discover-profile-name" data-testid={`text-display-name-${profile.userId}`}>{profile.displayName}</span>
          {profile.age !== null && <span className="discover-profile-age">, {profile.age}</span>}
        </span>
        <span className="discover-profile-username">@{profile.username}</span>
        {profile.lookingFor[0] && <span className="discover-profile-secondary">
          {profile.lookingFor[0]}{profile.interests[0] ? ` · ${profile.interests[0]}` : ''}
        </span>}
      </button>
    </div>
  </article>;
}

const chogTokenAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type SuperLikeConfirmationResult = {
  matched: boolean;
  matchId: string | null;
};

function getSuperLikeSaveErrorDetail(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return '';
  const message = (data as { error?: unknown }).error;
  if (typeof message !== 'string') return '';
  const detail = message.trim().slice(0, 220);
  return detail ? ` ${detail}` : '';
}

function isWalletRequestRejected(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') return false;
    const details = current as {
      cause?: unknown;
      code?: unknown;
      message?: unknown;
      name?: unknown;
    };
    if (
      details.code === 4001 ||
      details.name === 'UserRejectedRequestError' ||
      (typeof details.message === 'string' &&
        /user (rejected|denied)|request rejected by user/i.test(details.message))
    ) {
      return true;
    }
    current = details.cause;
  }
  return false;
}

export function SuperLikeDialog({
  profile,
  walletAddress,
  onOpenChange,
  onConfirmed,
}: {
  profile: Profile | null;
  walletAddress: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (transactionHash: Hex) => Promise<SuperLikeConfirmationResult>;
}) {
  const connection = useConnection();
  const publicClient = usePublicClient({ chainId: monadNetwork.id });
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const recoveryStorageKey = useMemo(
    () =>
      profile && walletAddress
        ? `chog-mate:super-like-recovery:${walletAddress.toLowerCase()}:${profile.userId}`
        : null,
    [profile?.userId, walletAddress],
  );
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [superMatchId, setSuperMatchId] = useState<string | null>(null);
  const [submissionOutcomeUnknown, setSubmissionOutcomeUnknown] = useState(false);
  const [recoveryDraftSaved, setRecoveryDraftSaved] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState('');
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const recipientProfile = useGetUserProfile(profile?.userId ?? '', {
    query: {
      queryKey: getGetUserProfileQueryKey(profile?.userId ?? ''),
      enabled: Boolean(profile),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      retry: false,
    },
  });
  const recipientWallet =
    profile &&
    recipientProfile.data?.userId === profile.userId &&
    recipientProfile.data.walletVerified &&
    isAddress(recipientProfile.data.walletAddress)
      ? getAddress(recipientProfile.data.walletAddress)
      : null;
  const walletMatchesSession = Boolean(
    connection.address &&
    walletAddress &&
    connection.address.toLowerCase() === walletAddress.toLowerCase(),
  );
  const canUseWallet = Boolean(
    connection.isConnected &&
    connection.chainId === monadNetwork.id &&
    walletMatchesSession,
  );
  const decimals = useReadContract({
    address: appConfig.chogTokenAddress,
    abi: chogTokenAbi,
    functionName: 'decimals',
    chainId: monadNetwork.id,
    query: { enabled: canUseWallet, staleTime: 60 * 60 * 1000 },
  });
  const balance = useReadContract({
    address: appConfig.chogTokenAddress,
    abi: chogTokenAbi,
    functionName: 'balanceOf',
    args: connection.address ? [connection.address] : undefined,
    chainId: monadNetwork.id,
    query: { enabled: Boolean(canUseWallet && connection.address), refetchOnWindowFocus: true },
  });
  const amount = decimals.data === undefined
    ? null
    : 100n * (10n ** BigInt(decimals.data));
  const balanceText = balance.data !== undefined && decimals.data !== undefined
    ? formatTokenAmount(balance.data, decimals.data)
    : null;
  const insufficient = amount !== null && balance.data !== undefined && balance.data < amount;
  const shortfallText = insufficient && amount !== null && balance.data !== undefined && decimals.data !== undefined
    ? formatTokenAmountAtLeast(amount - balance.data, decimals.data)
    : null;

  useEffect(() => {
    setTransactionHash(null);
    setSuperMatchId(null);
    setSubmissionOutcomeUnknown(false);
    setRecoveryDraftSaved(false);
    setRecoveryHash('');
    setPhase('');
    setError('');
    setSaving(false);
    if (!recoveryStorageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(recoveryStorageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        transactionHash?: unknown;
        submissionOutcomeUnknown?: unknown;
      };
      const validHash =
        typeof draft.transactionHash === 'string' &&
        /^0x[a-fA-F0-9]{64}$/.test(draft.transactionHash);
      const outcomeUnknown = draft.submissionOutcomeUnknown === true;
      if (!validHash && !outcomeUnknown) {
        window.localStorage.removeItem(recoveryStorageKey);
        return;
      }
      if (validHash) setTransactionHash(draft.transactionHash as Hex);
      setSubmissionOutcomeUnknown(outcomeUnknown);
      setRecoveryDraftSaved(true);
      setError(
        validHash
          ? 'A previous transfer is waiting to be saved. Retry with this same transaction; do not send another payment.'
          : 'A previous wallet submission may have succeeded. Check wallet activity before retrying.',
      );
    } catch {
      setRecoveryDraftSaved(false);
    }
  }, [profile?.userId, recoveryStorageKey]);

  function persistRecoveryDraft(hash: Hex | null, outcomeUnknown: boolean) {
    if (!recoveryStorageKey || typeof window === 'undefined') return false;
    try {
      window.localStorage.setItem(
        recoveryStorageKey,
        JSON.stringify({
          transactionHash: hash,
          submissionOutcomeUnknown: outcomeUnknown,
        }),
      );
      setRecoveryDraftSaved(true);
      return true;
    } catch {
      setRecoveryDraftSaved(false);
      return false;
    }
  }

  function clearRecoveryDraft() {
    if (recoveryStorageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(recoveryStorageKey);
      } catch {
        // A stale recovery draft is safe because retries use the same transaction hash.
      }
    }
    setRecoveryDraftSaved(false);
  }

  async function recordConfirmedTransfer(hash: Hex) {
    setSaving(true);
    setError('');
    setPhase('Saving the confirmed Super Like…');
    try {
      const result = await onConfirmed(hash);
      if (!result.matched || !result.matchId) {
        throw new Error('The matching service did not confirm an active Super Match.');
      }
      setSuperMatchId(result.matchId);
      setPhase('Super Like sent.');
      clearRecoveryDraft();
    } catch (caught) {
      setPhase('');
      setError(
        `The transfer is confirmed, but CHOG MATE could not finish saving the Super Match. Retry with this same transaction; do not send another payment.${getSuperLikeSaveErrorDetail(caught)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveExistingTransfer() {
    const normalizedHash = recoveryHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(normalizedHash)) {
      setError('Enter a valid Monad transaction hash.');
      return;
    }

    const hash = normalizedHash as Hex;
    setTransactionHash(hash);
    setSubmissionOutcomeUnknown(false);
    if (!persistRecoveryDraft(hash, false)) {
      setError('Keep this window open until the confirmed transfer is saved; this device could not store its recovery details.');
    }
    await recordConfirmedTransfer(hash);
  }

  async function confirmSuperLike() {
    setError('');
    if (!profile) return;
    setPhase('Verifying the selected holder’s current wallet…');
    const freshRecipient = await recipientProfile.refetch().catch(() => null);
    const verifiedRecipient =
      freshRecipient &&
      !freshRecipient.isError &&
      freshRecipient.data?.userId === profile.userId &&
      freshRecipient.data.walletVerified &&
      isAddress(freshRecipient.data.walletAddress)
        ? getAddress(freshRecipient.data.walletAddress)
        : null;
    setPhase('');
    if (!verifiedRecipient) {
      setError('We could not verify this holder’s current wallet. No transaction was sent.');
      return;
    }
    if (transactionHash) {
      await recordConfirmedTransfer(transactionHash);
      return;
    }
    if (!canUseWallet || !connection.address || !walletMatchesSession) {
      setError('Connect the wallet used for this verified profile on Monad Mainnet.');
      return;
    }
    if (!publicClient || decimals.isLoading || balance.isLoading) {
      setError('Checking your current $CHOG balance. Please wait and try again.');
      return;
    }
    if (decimals.isError || balance.isError || amount === null || balance.data === undefined) {
      setError('The live $CHOG balance could not be read. No transaction was sent.');
      return;
    }
    if (insufficient) {
      setError('Your connected wallet does not have enough $CHOG for this Super Like.');
      return;
    }

    let submittedHash: Hex | null = null;
    try {
      setPhase('Confirm the transfer in your wallet…');
      submittedHash = await writeContractAsync({
        address: appConfig.chogTokenAddress,
        abi: chogTokenAbi,
        functionName: 'transfer',
        args: [verifiedRecipient, amount],
        chainId: monadNetwork.id,
      });
      setTransactionHash(submittedHash);
      if (!persistRecoveryDraft(submittedHash, false)) {
        setError('Keep this window open until the confirmed transfer is saved; this device could not store its recovery details.');
      }
      setPhase('Waiting for Monad confirmation…');
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: submittedHash,
        confirmations: 1,
      });
      if (receipt.status !== 'success') {
        setPhase('');
        setTransactionHash(null);
        clearRecoveryDraft();
        setError('The $CHOG transfer failed on Monad. No Super Like was saved; you can try a new transaction.');
        return;
      }
      void balance.refetch().catch(() => undefined);
      await recordConfirmedTransfer(submittedHash);
    } catch (caught) {
      setPhase('');
      if (submittedHash) {
        setTransactionHash(submittedHash);
        persistRecoveryDraft(submittedHash, false);
        setError('The transfer was submitted, but its confirmation could not be checked. Open the transaction link and retry saving this same hash; do not send another payment.');
      } else if (isWalletRequestRejected(caught)) {
        setError('The wallet request was rejected. No $CHOG transfer was sent.');
      } else {
        setSubmissionOutcomeUnknown(true);
        if (persistRecoveryDraft(null, true)) {
          setError('The wallet or RPC returned an error before CHOG MATE received a transaction hash. The transfer may still have been submitted. Check your wallet activity or MonadScan before trying again. If it succeeded, paste its transaction hash below. Do not send another transfer.');
        } else {
          setError('The transfer may have been submitted. Keep this window open and check your wallet activity before trying again; recovery details could not be saved on this device.');
        }
      }
    }
  }

  return (
    <Dialog
      open={Boolean(profile)}
      onOpenChange={(nextOpen) => {
        if (
          !nextOpen &&
          (transactionHash || submissionOutcomeUnknown) &&
          !phase.includes('sent') &&
          !recoveryDraftSaved
        ) {
          setError('Keep this window open until the transfer recovery details can be saved on this device.');
          return;
        }
        if (!nextOpen) onOpenChange(false);
      }}
    >
      <DialogContent className="surface max-w-md rounded-[28px] border-[#e8dfd5] bg-[#fffaf6]">
        <DialogHeader>
          <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-[#f2ecff] text-[#7851d9]">
            <Sparkles size={21} />
          </div>
          <DialogTitle className="display text-2xl font-extrabold text-[#24133f]">
            Super Like {profile ? `@${profile.username}` : 'this holder'}?
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#82778c]">
            Transfer 100 $CHOG to {profile ? `@${profile.username}` : 'this holder'} on Monad.
            This immediately creates a Match. The transfer is real and irreversible.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-[#eadfe0] bg-white/70 px-4 py-3 text-sm text-[#594d64]">
          <p className="flex items-center justify-between gap-3">
            <span>Live balance</span>
            <strong className="tabular-nums">{balanceText === null ? (balance.isLoading || decimals.isLoading ? 'Loading…' : 'Unavailable') : `${balanceText} $CHOG`}</strong>
          </p>
          {profile && <p className="mt-2 break-all text-[10px] leading-4 text-[#7053a4]" data-testid="text-super-like-recipient">
            Recipient · {recipientProfile.isFetching ? 'Verifying current wallet…' : recipientWallet ?? 'Wallet not verified'}
          </p>}
        </div>
        {shortfallText !== null && balanceText !== null && (
          <p className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs leading-5 text-[#a34646]" role="status" data-testid="status-super-like-insufficient-balance">
            Your balance is {balanceText} $CHOG; this Super Like requires 100 $CHOG. You need {shortfallText} more before you can send it.
          </p>
        )}
        {!connection.isConnected && <p className="text-xs leading-5 text-[#8b8091]">Connect the wallet used for your CHOG MATE profile to continue.</p>}
        {connection.isConnected && connection.chainId !== monadNetwork.id && <p className="text-xs text-[#a34646]" role="alert">Switch your wallet to Monad Mainnet before sending.</p>}
        {phase && <p className="text-xs font-semibold text-[#7053a4]" role="status">{phase}</p>}
        {transactionHash && (
          <a href={`https://monadscan.com/tx/${transactionHash}`} target="_blank" rel="noreferrer" className="break-all text-xs font-semibold text-[#7047ff] underline">
            View transaction · {transactionHash}
          </a>
        )}
        {error && <p className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs leading-5 text-[#a34646]" role="alert">{error}</p>}
        {superMatchId && phase.includes('sent') && (
          <section
            className="space-y-3 rounded-2xl border border-[#e4d7fa] bg-[#f6f0ff] p-4 text-center"
            role="status"
            data-testid="status-super-match"
          >
            <h3 className="display text-xl font-extrabold text-[#6246b0]">SUPER MATCH! 💜</h3>
            <p className="text-sm font-semibold text-[#594d64]">100 $CHOG sent successfully.</p>
            <p className="text-sm leading-5 text-[#82778c]">
              You matched with @{profile?.username}. You can message each other now.
            </p>
            <div className="grid gap-2">
              <Link
                href={`/messages?match=${encodeURIComponent(superMatchId)}`}
                onClick={() => onOpenChange(false)}
                className="button-primary rounded-full px-4 py-2.5 text-xs font-bold"
                data-testid="link-super-match-conversation"
              >
                Open conversation
              </Link>
              <Link
                href="/matches"
                onClick={() => onOpenChange(false)}
                className="rounded-full border border-[#e5dcef] px-4 py-2.5 text-xs font-bold text-[#635178] transition hover:bg-white"
                data-testid="link-super-match-list"
              >
                View match
              </Link>
            </div>
          </section>
        )}
        {submissionOutcomeUnknown && (
          <div className="space-y-2 rounded-xl border border-[#eadfe0] bg-white/70 p-3">
            {walletAddress && isAddress(walletAddress) && (
              <a
                href={`https://monadscan.com/address/${walletAddress}`}
                target="_blank"
                rel="noreferrer"
                className="block text-xs font-semibold text-[#7047ff] underline"
              >
                Check this wallet’s activity on MonadScan
              </a>
            )}
            <label htmlFor="super-like-recovery-hash" className="block text-xs font-semibold text-[#594d64]">
              Already sent? Paste the transaction hash to save this Super Like
            </label>
            <input
              id="super-like-recovery-hash"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={recoveryHash}
              onChange={event => setRecoveryHash(event.target.value)}
              placeholder="0x…"
              className="w-full rounded-xl border border-[#e5dcef] bg-white px-3 py-2 text-xs text-[#24133f] outline-none focus:border-[#8b52c1]"
              data-testid="input-super-like-recovery-hash"
            />
            <button
              type="button"
              onClick={() => void saveExistingTransfer()}
              disabled={saving || recipientProfile.isFetching || !profile}
              className="w-full rounded-full border border-[#e5dcef] px-4 py-2.5 text-xs font-bold text-[#635178] transition hover:bg-[#f8f4ff] disabled:opacity-50"
              data-testid="button-save-existing-super-like"
            >
              Save existing transaction
            </button>
            <button
              type="button"
              onClick={() => {
                clearRecoveryDraft();
                setSubmissionOutcomeUnknown(false);
                setRecoveryHash('');
                setError('You can retry only after confirming in your wallet history that no $CHOG transfer was sent.');
              }}
              className="w-full px-3 py-1.5 text-[11px] font-semibold text-[#81758a] underline underline-offset-2"
              data-testid="button-confirm-no-super-like-transfer"
            >
              I checked my wallet; no transfer was sent
            </button>
          </div>
        )}
        {(transactionHash || submissionOutcomeUnknown) && !phase.includes('sent') && recoveryDraftSaved && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-full px-3 py-1.5 text-[11px] font-semibold text-[#81758a] underline underline-offset-2"
            data-testid="button-super-like-continue-later"
          >
            Continue later
          </button>
        )}
        <button
          type="button"
          onClick={() => void confirmSuperLike()}
          disabled={walletPending || saving || recipientProfile.isFetching || !profile || (amount !== null && insufficient) || phase.includes('sent') || submissionOutcomeUnknown}
          className="button-primary w-full rounded-full px-5 py-3 text-sm font-bold disabled:opacity-50"
          data-testid="button-confirm-super-like"
        >
          {phase.includes('sent')
            ? 'Super Like sent'
            : walletPending
            ? 'Confirm in your wallet…'
            : saving || phase.includes('Waiting')
              ? 'Waiting for confirmation…'
              : transactionHash
                ? 'Retry saving Super Like'
                : 'Send 100 $CHOG'}
        </button>
        {transactionHash && phase.includes('sent') && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-full border border-[#e5dcef] px-4 py-2.5 text-xs font-bold text-[#635178] transition hover:bg-[#f8f4ff]"
            data-testid="button-close-super-like-confirmation"
          >
            Done
          </button>
        )}
        {!transactionHash && !submissionOutcomeUnknown && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={walletPending || saving}
            className="w-full rounded-full px-4 py-2 text-xs font-semibold text-[#81758a] hover:bg-[#f5f0ff] disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatTokenAmount(value: bigint, decimals: number): string {
  const [whole = '0', fraction = ''] = formatUnits(value, decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, '');
  return trimmedFraction ? `${grouped}.${trimmedFraction}` : grouped;
}

function formatTokenAmountAtLeast(value: bigint, decimals: number): string {
  const displayedDecimals = Math.min(decimals, 4);
  const hiddenUnit = 10n ** BigInt(decimals - displayedDecimals);
  const roundedUp = ((value + hiddenUnit - 1n) / hiddenUnit) * hiddenUnit;
  return formatTokenAmount(roundedUp, decimals);
}

export function DiscoverPage() {
  const { openProfile } = useProfileViewer();
  const maxPreviousCards = 8;
  const swipeFeedbackDuration = 360;
  const [cursor, setCursor] = useState<string | undefined>();
  const [toast, setToast] = useState('');
  const [profileIndex, setProfileIndex] = useState(0);
  const [previousCards, setPreviousCards] = useState<Profile[]>([]);
  const [restoredCard, setRestoredCard] = useState<Profile | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeFeedback, setSwipeFeedback] = useState<'pass' | 'like' | null>(null);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [superLikeTarget, setSuperLikeTarget] = useState<Profile | null>(null);
  const swipeFeedbackStartedAt = useRef<number | null>(null);
  const swipeFeedbackTimeout = useRef<number | null>(null);
  const qc = useQueryClient();
  const swipe = useSwipeProfile();
  const authSession = useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
      staleTime: 0,
    },
  });
  const authSessionValid =
    authSession.data?.authenticated === true && !authSession.isError;
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const canInteract = Boolean(
    authSessionValid &&
    me.data &&
    isDiscoverReadyProfile(me.data.profile, me.data.walletAddress),
  );
  const params: DiscoverProfilesParams = useMemo(
    () => ({
      mode: 'discover',
      limit: 20,
      ...(cursor ? { cursor } : {}),
    }),
    [cursor],
  );
  const key = getDiscoverProfilesQueryKey(params);
  const { data, isLoading, isError, refetch } = useDiscoverProfiles(params, { query: { queryKey:key, retry:false } });
  const profiles = data?.profiles || [];
  const undoPass = useUndoPass();
  useEffect(() => {
    if (canInteract) setWalletDialogOpen(false);
  }, [canInteract]);
  useEffect(() => {
    setProfileIndex(0);
    setToast('');
    setSwipeDirection(null);
    clearSwipeFeedback();
  }, [cursor]);

  useEffect(() => {
    setPreviousCards([]);
    setRestoredCard(null);
  }, [cursor]);

  useEffect(() => () => {
    if (swipeFeedbackTimeout.current !== null) {
      window.clearTimeout(swipeFeedbackTimeout.current);
    }
  }, []);

  function clearSwipeFeedback() {
    if (swipeFeedbackTimeout.current !== null) {
      window.clearTimeout(swipeFeedbackTimeout.current);
      swipeFeedbackTimeout.current = null;
    }
    swipeFeedbackStartedAt.current = null;
    setSwipeFeedback(null);
  }

  function beginSwipeFeedback(selected: 'pass' | 'like') {
    if (swipeFeedbackTimeout.current !== null) {
      window.clearTimeout(swipeFeedbackTimeout.current);
    }
    swipeFeedbackStartedAt.current = Date.now();
    setSwipeFeedback(selected);
    swipeFeedbackTimeout.current = window.setTimeout(() => {
      swipeFeedbackTimeout.current = null;
      swipeFeedbackStartedAt.current = null;
      setSwipeFeedback(null);
    }, swipeFeedbackDuration);
  }

  async function finishSwipeFeedback() {
    const startedAt = swipeFeedbackStartedAt.current;
    const remaining = startedAt === null
      ? 0
      : Math.max(0, swipeFeedbackDuration - (Date.now() - startedAt));
    if (remaining > 0) {
      await new Promise<void>(resolve => window.setTimeout(resolve, remaining));
    }
  }

  async function recordSwipe(
    profile: Profile,
    selected: 'pass'|'like'|'super_like',
    transactionHash?: Hex,
  ) {
    const wasRestored = restoredCard?.userId === profile.userId;
    const result = await swipe.mutateAsync({
      data: {
        targetUserId: profile.userId,
        action: selected,
        ...(transactionHash ? { transactionHash } : {}),
      },
    });
    if (!result.recorded) {
      if (selected === 'super_like') {
        throw new Error('This Super Like was already recorded. Retry saving this same transaction; do not send another payment.');
      }
      if (selected === 'like') {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getGetSentLikesQueryKey() }),
          qc.invalidateQueries({
            queryKey: getDiscoverProfilesQueryKey(),
            refetchType: 'none',
          }),
        ]);
        setToast('This profile already has a saved Like or Super Like. Your Liked By Me list was refreshed.');
      }
      await finishSwipeFeedback();
      if (wasRestored) {
        setRestoredCard(null);
      } else {
        setProfileIndex(index => index + 1);
      }
      setSwipeDirection(null);
      return;
    }
    if (selected === 'pass') {
      setPreviousCards(cards => [...cards, profile].slice(-maxPreviousCards));
    }
    if (selected !== 'super_like') {
      await finishSwipeFeedback();
    }
    if (wasRestored) {
      setRestoredCard(null);
    } else {
      setProfileIndex(index => index + 1);
    }
    setSwipeDirection(null);
    void qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() });
    if (selected === 'like' || selected === 'super_like') {
      await qc.invalidateQueries({ queryKey: getGetSentLikesQueryKey() });
    }
    if (selected === 'like') {
      await qc.invalidateQueries({
        queryKey: getDiscoverProfilesQueryKey(),
        refetchType: 'none',
      });
    }
    if (selected === 'super_like') {
      void qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    }
    return result;
  }

  function action(selected: 'pass'|'like'|'super_like') {
    if (swipe.isPending) return;
    if (!canInteract) {
      if (!authSessionValid) setWalletDialogOpen(true);
      else setToast(
        me.data?.profile
          ? 'Complete your profile before liking or passing on other holders.'
          : 'Create a profile before liking or passing on other holders.',
      );
      return;
    }
    const profile = restoredCard ?? profiles[profileIndex];
    if (!profile) return;
    setToast('');
    if (selected === 'super_like') {
      setSuperLikeTarget(profile);
      return;
    }
    setSwipeDirection(selected === 'like' ? 'right' : 'left');
    beginSwipeFeedback(selected);
    void recordSwipe(profile, selected).catch(error => {
      setSwipeDirection(null);
      clearSwipeFeedback();
      setToast(error instanceof Error ? error.message : 'Your action could not be saved. Please try again.');
    });
  }
  async function restorePreviousCard() {
    if (swipe.isPending || undoPass.isPending || swipeDirection || superLikeTarget) return;
    const previous = previousCards[previousCards.length - 1];
    if (!previous) return;
    setToast('');
    try {
      await undoPass.mutateAsync({ targetUserId: previous.userId });
      setPreviousCards(cards => cards.slice(0, -1));
      setRestoredCard(previous);
      setSwipeDirection(null);
      clearSwipeFeedback();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The previous Pass could not be undone. Please try again.');
    }
  }
  const currentCard = restoredCard ?? profiles[profileIndex];
  const actionPending = swipe.isPending || undoPass.isPending || Boolean(swipeDirection) || Boolean(superLikeTarget);
  return <AppShell><div className="page-enter discover-page">
     <h1 className="sr-only" data-testid="heading-page">Discover Chogs</h1>
    {toast && <div className="mx-auto mb-4 max-w-[620px] rounded-2xl border border-[#ded4f5] bg-white px-4 py-3 text-sm text-[#514177]" role="status" data-testid="status-swipe">{toast}<button className="float-right font-bold" onClick={()=>setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
     {me.isError && !isUnauthorized(me.error) && <p className="mx-auto mb-4 max-w-[620px] rounded-2xl border border-[#ead8ce] bg-[#fff8f1] px-4 py-3 text-sm text-[#755247]" role="status">Your account status could not be loaded. Public profiles are still available; sign-in may be unavailable.</p>}
      <div className="discover-results">
      <QueryState loading={isLoading} error={isError} retry={()=>void refetch()}>
       {currentCard ? <AnimatePresence initial={false} mode="wait">
           <motion.div
             key={currentCard.userId}
             className="discover-card-motion"
             initial={{ opacity: 0, y: 18, scale: 0.985 }}
             animate={swipeDirection
               ? { x: swipeDirection === 'right' ? '110%' : '-110%', opacity: 0, rotate: swipeDirection === 'right' ? 8 : -8 }
               : { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
             exit={swipeDirection
               ? { x: swipeDirection === 'right' ? '110%' : '-110%', opacity: 0, rotate: swipeDirection === 'right' ? 8 : -8 }
               : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: swipeDirection ? 0.32 : 0.3, ease: 'easeInOut' }}
             data-testid={`discover-card-transition-${currentCard.userId}`}
           >
             <DiscoverCard
               profile={currentCard}
               onAction={action}
               onOpenProfile={() => openProfile(currentCard, {
                 source: 'browse',
                 onLike: () => action('like'),
                 onPass: () => action('pass'),
                 onSuperLike: () => setSuperLikeTarget(currentCard),
               })}
               onAuthRequired={()=>setWalletDialogOpen(true)}
               canInteract={canInteract}
             />
           </motion.div>
       </AnimatePresence> : data?.nextCursor ? <EmptyState mark="cm" title="You're at the end of this set." detail="There are more eligible Chog holders in the next set." action={<button onClick={()=>setCursor(data.nextCursor || undefined)} className="button-soft rounded-full px-5 py-2.5 text-sm font-bold" data-testid="button-load-more">Continue discovery</button>} /> :
        <EmptyState mark="cm" title="You're all caught up." detail="There are no more profiles available right now. Check back later for new Chog holders." />}
     </QueryState>
       </div>
      <div className="discover-action-area" role="group" aria-label="Discover actions">
        <button
          type="button"
          className="discover-previous-button"
          onClick={restorePreviousCard}
          disabled={previousCards.length === 0 || Boolean(restoredCard) || actionPending}
          aria-label="Undo the previous Pass"
          title="Undo Pass"
          data-testid="button-discover-previous"
        >
          <Undo2 size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="discover-action-button discover-action-pass"
          disabled={!currentCard || actionPending}
          onClick={() => action('pass')}
          aria-label={currentCard ? `Pass on ${currentCard.displayName}` : 'No profile to pass on'}
          title="Pass"
          data-testid={`button-pass-${currentCard?.userId ?? 'disabled'}`}
        ><X size={31} strokeWidth={2.1} aria-hidden="true" /></button>
        <button
          type="button"
          className="discover-action-button discover-action-super-like"
          disabled={!currentCard || actionPending}
          onClick={() => action('super_like')}
          aria-label={currentCard ? `Super like ${currentCard.displayName}` : 'No profile to Super Like'}
          title="Super Like · 100 $CHOG"
          data-testid={`button-super-like-${currentCard?.userId ?? 'disabled'}`}
        ><Sparkles size={27} strokeWidth={1.9} aria-hidden="true" /></button>
        <button
          type="button"
          className="discover-action-button discover-action-like"
          disabled={!currentCard || actionPending}
          onClick={() => action('like')}
          aria-label={currentCard ? `Like ${currentCard.displayName}` : 'No profile to like'}
          title="Like"
          data-testid={`button-like-${currentCard?.userId ?? 'disabled'}`}
        ><Heart size={28} strokeWidth={1.9} fill="currentColor" aria-hidden="true" /></button>
      </div>
      <div className="discover-footer">
        <p>Real holders. Real possibilities.</p>
        {!restoredCard && profileIndex >= profiles.length && data?.nextCursor && <button onClick={()=>{setCursor(data.nextCursor || undefined);setProfileIndex(0);}} className="button-soft inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold" data-testid="button-load-more">More people <ArrowRight size={14}/></button>}
      </div>
     <AnimatePresence>
       {swipeFeedback && <motion.div
         key={swipeFeedback}
         className={`discover-swipe-feedback discover-swipe-feedback-${swipeFeedback}`}
         initial={{ opacity: 0, scale: 0.55, rotate: swipeFeedback === 'pass' ? -18 : 0 }}
         animate={{ opacity: [0, 1, 0.95, 0], scale: [0.55, 1.06, 1, 1.14], rotate: swipeFeedback === 'pass' ? [-18, 0, 0, 8] : [0, -4, 4, 0] }}
         exit={{ opacity: 0, scale: 1.16 }}
         transition={{ duration: swipeFeedbackDuration / 1000, times: [0, 0.25, 0.72, 1], ease: 'easeInOut' }}
         aria-hidden="true"
         data-testid={`overlay-${swipeFeedback}-result`}
       >
         {swipeFeedback === 'like'
           ? <Heart className="discover-result-heart" size={92} strokeWidth={1.5} fill="currentColor" />
           : <X className="discover-result-pass" size={96} strokeWidth={1.55} />}
       </motion.div>}
     </AnimatePresence>
    <SuperLikeDialog
      profile={superLikeTarget}
      walletAddress={me.data?.walletAddress ?? null}
      onOpenChange={open=>{if(!open)setSuperLikeTarget(null);}}
      onConfirmed={async transactionHash => {
        if (!superLikeTarget) throw new Error('The selected profile is no longer available.');
        const result = await recordSwipe(superLikeTarget, 'super_like', transactionHash);
        return {
          matched: Boolean(result?.matched && result.match?.id),
          matchId: result?.match?.id ?? null,
        };
      }}
    />
    <WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo="/discover"/>
  </div></AppShell>;
}

export function MatchesPage() {
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data, isLoading, isError, refetch } = useGetMatches({
    query: { enabled: Boolean(me.data), queryKey: getGetMatchesQueryKey() },
  });
  const exMatchesQuery = useGetExMatches({
    query: { enabled: Boolean(me.data), queryKey: getGetExMatchesQueryKey() },
  });
  const inbox = useGetLikeInbox({
    query: {
      enabled: Boolean(me.data),
      queryKey: getGetLikeInboxQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  });
  const sent = useGetSentLikes({
    query: {
      enabled: Boolean(me.data),
      queryKey: getGetSentLikesQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  });
  const [walletDialogOpen, setWalletDialogOpen] = useState(true);
  const [socialNotice, setSocialNotice] = useState('');
  const [giftMatch, setGiftMatch] = useState<Pick<Match, "id" | "status" | "profile"> | null>(null);
  const [section, setSection] = useState<'matches' | 'ex-match' | 'liked-you' | 'liked-by-you'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#likes'
      ? 'liked-you'
      : typeof window !== 'undefined' && window.location.hash === '#ex-match'
        ? 'ex-match'
        : 'matches',
  );
  const qc = useQueryClient();
  const matches = data || [];
  useEffect(() => {
    const syncSectionFromHash = () => {
      if (window.location.hash === '#likes') setSection('liked-you');
      else if (window.location.hash === '#liked-by-you') setSection('liked-by-you');
      else if (window.location.hash === '#ex-match' || window.location.hash === '#ex-matches') setSection('ex-match');
    };
    window.addEventListener('hashchange', syncSectionFromHash);
    return () => window.removeEventListener('hashchange', syncSectionFromHash);
  }, []);
  useEffect(() => {
    if (!me.data) return;
    if (section === 'liked-you') void qc.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() });
    else if (section === 'liked-by-you') void qc.invalidateQueries({ queryKey: getGetSentLikesQueryKey() });
    else if (section === 'ex-match') void qc.invalidateQueries({ queryKey: getGetExMatchesQueryKey() });
    else if (section === 'matches') void qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
  }, [section, me.data, qc]);
  function chooseSection(next: 'matches' | 'ex-match' | 'liked-you' | 'liked-by-you') {
    setSection(next);
    const hash = next === 'liked-you'
      ? '#likes'
      : next === 'liked-by-you'
        ? '#liked-by-you'
        : next === 'ex-match'
          ? '#ex-match'
          : '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }
  async function refreshSocialLists(successNotice?: string): Promise<void> {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetSentLikesQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetExMatchesQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
    ]);
    if (successNotice) setSocialNotice(successNotice);
  }
  function unlikeDone(type: LikeInboxItem['type']) {
    setSocialNotice(type === 'super_like'
      ? 'The Super Like was withdrawn. The completed $CHOG transfer is unchanged.'
      : 'Like removed. This person can appear in future Discover results.');
    void refreshSocialLists();
    void qc.invalidateQueries({ queryKey: getDiscoverProfilesQueryKey() });
  }
  if (me.isLoading) return <AppShell><div className="skeleton h-96 rounded-[28px]"/></AppShell>;
  if (me.isError && !isUnauthorized(me.error)) return <AppShell><QueryState loading={false} error retry={()=>void me.refetch()}><div/></QueryState></AppShell>;
  if (!me.data) return <AppShell><div className="page-enter"><PageTitle eyebrow="The feeling is mutual" title="Your matches." description="Sign in to view your mutual connections."/><EmptyState title="Connect your wallet to continue." detail="Your matches are private. Verify your wallet to view them."/></div><WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo="/matches"/></AppShell>;
  return <AppShell><div className="page-enter">
    <PageTitle eyebrow="The feeling is mutual" title="Your connections." description="See who liked you, who you liked, and the people who liked you back." />
    {socialNotice && <p className="mb-5 rounded-2xl border border-[#ded4f5] bg-white px-4 py-3 text-sm text-[#514177]" role="status" data-testid="status-social-action">{socialNotice}</p>}
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Your likes and matches">
      {([
        { id: 'matches', label: 'Matches', count: matches.length },
        { id: 'liked-you', label: 'Liked You', count: inbox.data?.length ?? 0 },
        { id: 'liked-by-you', label: 'Liked By Me', count: sent.data?.length ?? 0 },
        { id: 'ex-match', label: 'Ex Matches', count: exMatchesQuery.data?.length ?? 0 },
      ] as const).map(item => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={section === item.id}
        aria-controls={`panel-${item.id}`}
        onClick={() => chooseSection(item.id)}
        className={`mode-tab shrink-0 rounded-full px-4 py-2.5 text-xs font-bold transition ${section === item.id ? 'active' : ''}`}
        data-testid={`tab-${item.id}`}
      >{item.label}<span className="ml-2 opacity-70">{item.count}</span></button>)}
    </div>
    {section === 'liked-you' && <section id="panel-liked-you" role="tabpanel" aria-label="People who liked you">
      {inbox.isError
        ? <div className="rounded-2xl border border-[#eedbd6] bg-white p-4 text-sm text-[#8b5a59]" role="alert">Likes for you could not be loaded. <button onClick={()=>void inbox.refetch()} className="font-bold underline">Try again</button></div>
        : inbox.isLoading
          ? <div className="skeleton h-48 rounded-2xl" />
          : inbox.data?.length
            ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{inbox.data.map(item=><IncomingLikeCard key={item.id} item={item} onHandled={() => void refreshSocialLists()} />)}</div>
            : <EmptyState title="No new likes yet." detail="People who like you will appear here. Like them back to create a Match."/>}
    </section>}
    {section === 'liked-by-you' && <section id="panel-liked-by-you" role="tabpanel" aria-label="People you liked">
      {sent.isError
        ? <div className="rounded-2xl border border-[#eedbd6] bg-white p-4 text-sm text-[#8b5a59]" role="alert">Your outgoing likes could not be loaded. <button onClick={()=>void sent.refetch()} className="font-bold underline">Try again</button></div>
        : sent.isLoading
          ? <div className="skeleton h-48 rounded-2xl" />
          : sent.data?.length
            ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence initial={false}>{sent.data.map(item=><motion.article
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="surface flex gap-4 rounded-[24px] p-4"
                key={item.id}
                data-testid={`card-liked-by-you-${item.id}`}
              >
                <ProfileOpenButton profile={item.profile} options={{ source: 'liked-by-me' }} className="block aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#eee5fb]" label={`Open ${item.profile.displayName}'s full profile`}><ChogArtwork chog={item.profile.chog} fit="contain"/></ProfileOpenButton>
                <div className="min-w-0 py-1">
                  <ProfileOpenButton profile={item.profile} options={{ source: 'liked-by-me' }} className="block text-left" label={`Open ${item.profile.displayName}'s full profile`}><h2 className="display break-words text-lg font-extrabold text-[#35264b]">{item.profile.displayName}{item.profile.age !== null ? `, ${item.profile.age}` : ''}</h2><p className="mt-1 break-all text-xs text-[#887c90]">@{item.profile.username}</p></ProfileOpenButton>
                  <p className="mt-2 text-[11px] font-semibold text-[#705b83]">Chog #{item.profile.chog.tokenId} · {item.profile.chog.tier || 'Tier unlisted'}</p>
                  <p className="mt-2 text-[10px] font-semibold text-[#8a6cad]">
                    {item.matchStatus === 'active'
                      ? 'Matched with you'
                      : item.matchStatus === 'unmatched'
                        ? 'Previously matched'
                        : item.type === 'super_like'
                          ? 'Super Liked By You · 100 $CHOG sent'
                          : 'Liked By You'}
                  </p>
                  {item.matchStatus === 'active'
                    ? <Link href="/matches" className="button-soft mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-[#64586b]">
                        View match
                      </Link>
                    : <>
                        {item.matchStatus === 'unmatched' && <Link href="/matches#ex-match" className="button-soft mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-[#64586b]">
                          View match history
                        </Link>}
                        <UnlikeAction profile={item.profile} type={item.type} onDone={() => unlikeDone(item.type)} />
                      </>}
                </div>
              </motion.article>)}</AnimatePresence></div>
            : <EmptyState title="You have not liked anyone yet." detail="Like a Chog holder in Discover and they will appear here. Profiles that became matches link to your connections." action={<Link href="/discover" className="button-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold" data-testid="link-discover-from-liked-by-you">Discover holders <ArrowRight size={15}/></Link>}/>}
    </section>}
    {section === 'matches' && <section id="panel-matches" role="tabpanel" aria-label="Your matches">
      <QueryState loading={isLoading} error={isError} retry={()=>void refetch()}>
        {matches.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence initial={false}>{matches.map(match=><motion.article
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="surface flex gap-4 rounded-[26px] p-4 sm:p-5"
          key={match.id}
          data-testid={`card-match-${match.id}`}
        >
          <ProfileOpenButton profile={match.profile} options={{ source: 'matched', matchId: match.id }} className="block aspect-square h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-[#eee5fb]" label={`Open ${match.profile.displayName}'s full profile`}><ChogArtwork chog={match.profile.chog} fit="contain"/></ProfileOpenButton>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><ProfileOpenButton profile={match.profile} options={{ source: 'matched', matchId: match.id }} className="block text-left" label={`Open ${match.profile.displayName}'s full profile`}><h2 className="display break-words text-lg font-extrabold text-[#24133f]">{match.profile.displayName}{match.profile.age !== null ? `, ${match.profile.age}` : ''}</h2><p className="mt-1 break-all text-xs text-[#82778c]">@{match.profile.username}</p></ProfileOpenButton></div><span className="shrink-0 rounded-full bg-[#f2ecff] px-2.5 py-1 text-[10px] font-bold text-[#6246b0]">{match.compatibility}%</span></div>
            <p className="mt-2 text-[11px] font-semibold text-[#705b83]">Chog #{match.profile.chog.tokenId} · {match.profile.chog.tier || 'Tier unlisted'}</p>
            <p className="mt-2 text-[10px] text-[#887c90]">Matched {new Date(match.createdAt).toLocaleDateString()}</p>
             <div className="mt-3 flex flex-wrap gap-2">
               <Link href={`/messages?match=${encodeURIComponent(match.id)}`} className="button-primary inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold" data-testid={`link-message-${match.id}`}><MessageCircle size={15}/>Message</Link>
               {match.status === 'active' && <button type="button" onClick={() => setGiftMatch(match)} className="button-soft inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold" data-testid={`button-gift-${match.id}`}><Gift size={15}/>Send gift</button>}
             </div>
          <MatchActions matchId={match.id} username={match.profile.username} onDone={() => void refreshSocialLists()}/>
          </div>
        </motion.article>)}</AnimatePresence></div> : <EmptyState mark="cm" title="Your first match is out there." detail="When someone you like likes you back, you’ll find your mutual connection here." action={<Link href="/discover" className="button-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold" data-testid="link-discover-from-matches">Meet people <ArrowRight size={15}/></Link>} />}
      </QueryState>
    </section>}
    {section === 'ex-match' && <section id="panel-ex-match" role="tabpanel" aria-label="Ex Matches">
      <QueryState
        loading={exMatchesQuery.isLoading}
        error={exMatchesQuery.isError}
        retry={() => void exMatchesQuery.refetch()}
      >
        {exMatchesQuery.data?.length
          ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence initial={false}>{exMatchesQuery.data.map(item =>
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <ExMatchCard
                  item={item}
                  onRematched={() => refreshSocialLists(`Rematched with @${item.profile.username}. They are back in Matches, and your conversation history is preserved.`)}
                />
              </motion.div>,
            )}</AnimatePresence></div>
          : <EmptyState title="No Ex Matches." detail="People from a previous Match will appear here after either person ends the relationship. Only the person who ended it can Rematch." />}
      </QueryState>
    </section>}
    <GiftFlowDialog match={giftMatch} senderWallet={me.data.walletAddress} open={Boolean(giftMatch)} onOpenChange={open => { if (!open) setGiftMatch(null); }}/>
  </div></AppShell>;
}

function IncomingLikeCard({ item, onHandled }: { item: LikeInboxItem; onHandled: () => void }) {
  const [notice, setNotice] = useState("");
  const swipe = useSwipeProfile();

  async function respond(action: "like" | "pass") {
    setNotice("");
    try {
      const result = await swipe.mutateAsync({
        data: { targetUserId: item.profile.userId, action },
      });
      if (!result.recorded) {
        setNotice("This response was already recorded. Refresh your incoming likes.");
        return;
      }
      onHandled();
      setNotice(result.matched ? "It's a match. Open Messages to say hello." : "Your response was saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your response could not be saved.");
    }
  }

  return <article className="surface rounded-[24px] p-4" data-testid={`card-incoming-like-${item.id}`}>
    <div className="flex items-start gap-3">
      <ProfileOpenButton profile={item.profile} options={{ source: 'incoming' }} className="block aspect-square h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-[#eee5fb]" label={`Open ${item.profile.displayName}'s full profile`}><ChogArtwork chog={item.profile.chog} fit="contain"/></ProfileOpenButton>
      <div className="min-w-0 flex-1">
        <ProfileOpenButton profile={item.profile} options={{ source: 'incoming' }} className="block text-left" label={`Open ${item.profile.displayName}'s full profile`}><h3 className="break-words text-sm font-bold text-[#35264b]">{item.profile.displayName}{item.profile.age !== null ? `, ${item.profile.age}` : ''}</h3><p className="mt-1 break-all text-xs text-[#887c90]">@{item.profile.username}</p></ProfileOpenButton>
        <p className="mt-2 text-[10px] font-semibold text-[#705b83]">Chog #{item.profile.chog.tokenId} · {item.profile.chog.tier || 'Tier unlisted'}</p>
        {item.type === "super_like"
          ? <p className="mt-2 rounded-xl bg-[#f2ecff] px-3 py-2 text-[11px] font-semibold leading-5 text-[#6246b0]">@{item.profile.username} Super Liked you · 100 $CHOG was sent to your wallet.</p>
          : <p className="mt-2 text-[11px] text-[#7c7185]">@{item.profile.username} liked you.</p>}
        <time className="mt-2 block text-[10px] text-[#9b8fa0]">{new Date(item.createdAt).toLocaleString()}</time>
      </div>
      <ReportControl profile={item.profile} canInteract onAuthRequired={()=>undefined} />
    </div>
    {notice && <p className="mt-3 text-xs leading-5 text-[#7053a4]" role="status">{notice}</p>}
    <div className="mt-4 flex gap-2">
      <button onClick={()=>void respond("like")} disabled={swipe.isPending} className="button-primary flex-1 rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50">{swipe.isPending ? "Saving…" : "Like Back"}</button>
      <button onClick={()=>void respond("pass")} disabled={swipe.isPending} className="button-soft flex-1 rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50">Ignore</button>
    </div>
  </article>;
}

function UnlikeAction({
  profile,
  type,
  onDone,
}: {
  profile: Profile;
  type: LikeInboxItem['type'];
  onDone: () => void;
}) {
  const unlike = useUnlikeProfile();
  const [notice, setNotice] = useState('');

  async function removeLike() {
    setNotice('');
    try {
      await unlike.mutateAsync({ targetUserId: profile.userId });
      onDone();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The Like could not be removed.');
    }
  }

  return <>
    <button
      type="button"
      onClick={() => void removeLike()}
      disabled={unlike.isPending}
      className="button-soft mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-[#64586b] disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={`button-unlike-${profile.userId}`}
    >
      {unlike.isPending ? 'Removing…' : type === 'super_like' ? 'Withdraw Super Like' : 'Unlike'}
    </button>
    {notice && <p className="mt-2 text-xs leading-5 text-[#a34646]" role="alert" data-testid={`status-unlike-${profile.userId}`}>{notice}</p>}
  </>;
}

function MatchActions({ matchId, username, onDone }: { matchId: string; username: string; onDone: () => void }) {
  const unmatch = useUnmatchProfile();
  return <button onClick={()=>{if(window.confirm(`Unmatch with @${username}? The active match will end, but your conversation history will remain in Messages.`)) unmatch.mutate({matchId},{onSuccess:onDone});}} disabled={unmatch.isPending} className="mt-4 text-xs font-semibold text-[#998e9e] underline-offset-4 hover:text-[#9a4a4a] hover:underline disabled:opacity-50" data-testid={`button-unmatch-${matchId}`}>{unmatch.isPending ? 'Removing…' : 'Unmatch'}</button>;
}

function ExMatchCard({ item, onRematched }: { item: Match; onRematched: () => Promise<void> }) {
  const profileOptions = {
    source: 'ex-match' as const,
    matchId: item.id,
    rematchAvailable: item.rematchAvailable,
  };
  return <article
    className="surface flex gap-4 rounded-[26px] p-4 sm:p-5"
    data-testid={`card-ex-match-${item.id}`}
  >
    <ProfileOpenButton profile={item.profile} options={profileOptions} className="block aspect-square h-28 w-28 shrink-0 self-start overflow-hidden rounded-2xl bg-[#eee5fb]" label={`Open ${item.profile.displayName}'s full profile`}>
      <ChogArtwork chog={item.profile.chog} fit="contain"/>
    </ProfileOpenButton>
    <div className="min-w-0 flex-1">
      <ProfileOpenButton profile={item.profile} options={profileOptions} className="block text-left" label={`Open ${item.profile.displayName}'s full profile`}>
        <h2 className="display break-words text-lg font-extrabold text-[#24133f]">
        {item.profile.displayName}{item.profile.age !== null ? `, ${item.profile.age}` : ''}
        </h2>
        <p className="mt-1 break-all text-xs text-[#82778c]">@{item.profile.username}</p>
      </ProfileOpenButton>
      <p className="mt-2 text-[11px] font-semibold text-[#705b83]">
        Chog #{item.profile.chog.tokenId} · {item.profile.chog.tier || 'Tier unlisted'}
      </p>
      <p className="mt-2 text-[10px] text-[#887c90]">Previous Match · {new Date(item.createdAt).toLocaleDateString()}</p>
      {item.rematchAvailable && <RematchAction matchId={item.id} onRematched={onRematched}/>}
    </div>
  </article>;
}

function RematchAction({ matchId, onRematched }: { matchId: string; onRematched: () => Promise<void> }) {
  const rematch = useRematchProfile();
  const [notice, setNotice] = useState('');

  async function restoreMatch() {
    setNotice('');
    try {
      await rematch.mutateAsync({ matchId });
      await onRematched();
    } catch (error) {
      setNotice(getApiErrorMessage(error, 'The rematch could not be completed.'));
    }
  }

  return <>
    <button
      type="button"
      onClick={() => void restoreMatch()}
      disabled={rematch.isPending}
      className="button-primary mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50"
      data-testid={`button-rematch-${matchId}`}
    >
      {rematch.isPending ? 'Rematching…' : 'Rematch'}
    </button>
    {notice && <p className="mt-2 text-xs leading-5 text-[#a34646]" role="alert">{notice}</p>}
  </>;
}

export function MessagesPage() {
  const callControls = useCallControls();
  const [selectedMatch, setSelectedMatch] = useState(()=>typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('match') || '' : '');
  const [mobileViewport, setMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  const [chatViewportHeight, setChatViewportHeight] = useState<number | null>(null);
  const currentProfile = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data: conversations, isLoading: conversationsLoading, isError: conversationsError, refetch: retryConversations } = useGetConversations({
    query: {
      enabled: Boolean(currentProfile.data),
      queryKey: getGetConversationsQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
  });
  const match = selectedMatch
    ? conversations?.find(item => item.id === selectedMatch)
    : mobileViewport
      ? undefined
      : conversations?.[0];
  const matchId = match?.id || '';
  const chatOpen = Boolean(match && (!mobileViewport || selectedMatch === match.id));
  const mobileChatOpen = mobileViewport && chatOpen && selectedMatch === match?.id;
  const conversationCanSend = Boolean(match);
  const messageKey = getGetMessagesQueryKey(matchId);
  const { data: messages, isLoading, isError, refetch } = useGetMessages(matchId, { query: { enabled:chatOpen && Boolean(matchId) && Boolean(currentProfile.data), queryKey:messageKey } });
  const callHistory = useQuery({
    queryKey: ['call-history', matchId],
    enabled: Boolean(chatOpen && matchId && currentProfile.data && supabase),
    queryFn: async () => {
      const client = supabase;
      if (!client) return [];
      const { data, error } = await client
        .from('calls')
        .select('id, caller_id, type, status, started_at, connected_at, ended_at')
        .eq('match_id', matchId)
        .order('started_at', { ascending: true })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [content, setContent] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceDraft, setVoiceDraft] = useState<File | null>(null);
  const [imageDraft, setImageDraft] = useState<File | null>(null);
  const [giftMatch, setGiftMatch] = useState<Pick<Match, "id" | "status" | "profile"> | null>(null);
  const send = useSendMessage();
  const requestUpload = useRequestMessageAttachmentUploadUrl();
  const qc = useQueryClient();
  const currentUserId = currentProfile.data?.profile?.userId;
  const giftHistory = useGetGiftHistory(matchId, {
    query: {
      enabled: Boolean(chatOpen && matchId && currentProfile.data),
      queryKey: getGetGiftHistoryQueryKey(matchId),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      retry: false,
    },
  });
  const conversationTimeline = buildConversationTimeline(
    (messages ?? []) as Message[],
    (giftHistory.data ?? []) as GiftRecord[],
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messageChannelCleanupRef = useRef<Promise<unknown>>(Promise.resolve());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceDraftUrl = useMemo(
    () => voiceDraft ? URL.createObjectURL(voiceDraft) : null,
    [voiceDraft],
  );
  const imageDraftUrl = useMemo(
    () => imageDraft ? URL.createObjectURL(imageDraft) : null,
    [imageDraft],
  );
  useEffect(() => () => {
    if (voiceDraftUrl) URL.revokeObjectURL(voiceDraftUrl);
  }, [voiceDraftUrl]);
  useEffect(() => () => {
    if (imageDraftUrl) URL.revokeObjectURL(imageDraftUrl);
  }, [imageDraftUrl]);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', syncViewport);
    syncViewport();
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);
  useEffect(() => {
    if (!selectedMatch || !conversations || conversations.some(item => item.id === selectedMatch)) return;
    setSelectedMatch('');
    updateMessageMatchQuery('');
  }, [conversations, selectedMatch]);
  useEffect(() => {
    if (!mobileChatOpen) {
      setChatViewportHeight(null);
      return;
    }
    const visualViewport = window.visualViewport;
    const updateHeight = () => setChatViewportHeight(
      Math.round(visualViewport?.height ?? window.innerHeight),
    );
    updateHeight();
    visualViewport?.addEventListener('resize', updateHeight);
    visualViewport?.addEventListener('scroll', updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      visualViewport?.removeEventListener('resize', updateHeight);
      visualViewport?.removeEventListener('scroll', updateHeight);
      window.removeEventListener('resize', updateHeight);
    };
  }, [mobileChatOpen]);
  useEffect(() => {
    setVoiceDraft(null);
    setImageDraft(null);
    setMediaError('');
  }, [matchId]);
  useEffect(() => () => {
    recorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);
  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setRecordingSeconds(seconds => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    const client = supabase;
    if (!chatOpen || !matchId || !client) return;
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    void messageChannelCleanupRef.current.then(() => {
      if (disposed) return;
      channel = client
        .channel(`match-messages:${matchId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
          () => {
            if (disposed) return;
            void qc.invalidateQueries({ queryKey: getGetMessagesQueryKey(matchId) });
            void qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
            void qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
          },
        )
        .subscribe();
    }).catch(error => {
      if (!disposed) console.error('Unable to subscribe to this conversation', error);
    });
    return () => {
      disposed = true;
      if (channel) {
        const channelToRemove = channel;
        messageChannelCleanupRef.current = messageChannelCleanupRef.current
          .catch(() => undefined)
          .then(() => client.removeChannel(channelToRemove));
      }
    };
  }, [chatOpen, matchId, qc]);
  useEffect(() => {
    const client = supabase;
    if (!matchId || !client) return;
    let disposed = false;
    const channel = client
      .channel(`call-history:${matchId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `match_id=eq.${matchId}` },
        () => {
          if (!disposed) void qc.invalidateQueries({ queryKey: ['call-history', matchId] });
        },
      )
      .subscribe();
    return () => {
      disposed = true;
      void client.removeChannel(channel);
    };
  }, [matchId, qc]);

  async function sendMedia(file: File, messageType: 'voice' | 'image' | 'file') {
    if (!matchId || !conversationCanSend) return;
    setMediaError('');
    if (!supabase) {
      setMediaError('Private file storage is not configured.');
      return;
    }
    if (!file.size || file.size > 15 * 1024 * 1024 || !file.type) {
      setMediaError('Choose a supported file with a known type, up to 15 MB.');
      return;
    }
    setMediaBusy(true);
    try {
      const upload = await requestUpload.mutateAsync({
        matchId,
        data: {
          fileName: file.name.slice(0, 180),
          contentType: file.type.split(';')[0].trim().toLowerCase(),
          size: file.size,
          messageType,
        },
      });
      const { error: uploadError } = await supabase.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.objectPath, upload.uploadToken, file, {
          contentType: file.type.split(';')[0].trim().toLowerCase(),
          cacheControl: '3600',
        });
      if (uploadError) throw new Error('The file upload failed. Please try again.');
      await send.mutateAsync({
        matchId,
        data: {
          messageType,
          attachmentPath: upload.objectPath,
          attachmentName: file.name.slice(0, 180),
          attachmentContentType: file.type.split(';')[0].trim().toLowerCase(),
          attachmentSize: file.size,
        },
      });
      if (messageType === 'voice') setVoiceDraft(null);
      if (messageType === 'image') setImageDraft(null);
      await qc.invalidateQueries({ queryKey: messageKey });
      await qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'The attachment could not be sent.');
    } finally {
      setMediaBusy(false);
    }
  }

  async function startVoiceRecording() {
    setMediaError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMediaError('Voice recording is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = formats.find(format => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const extension = type.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type });
        if (blob.size) setVoiceDraft(new File([blob], `voice-message.${extension}`, { type }));
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setMediaError('Microphone access was denied or is unavailable.');
    }
  }

  function stopVoiceRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function cancelVoiceRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        recorderRef.current = null;
        audioChunksRef.current = [];
        setRecording(false);
      };
      recorder.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setRecording(false);
    }
    setVoiceDraft(null);
    setMediaError('');
  }

  function selectAttachment(event: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (type === 'image') {
      if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
        setMediaError('Choose an image smaller than 15 MB.');
        return;
      }
      setMediaError('');
      setImageDraft(file);
      return;
    }
    void sendMedia(file, type);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || !matchId || !conversationCanSend) return;
    try {
      await send.mutateAsync({ matchId, data:{content:content.trim()} });
      setContent('');
      await qc.invalidateQueries({queryKey:messageKey});
      await qc.invalidateQueries({queryKey:getGetConversationsQueryKey()});
    } catch { /* The inline mutation error below remains visible. */ }
  }
  function choose(id:string) {
    setSelectedMatch(id);
    updateMessageMatchQuery(id);
  }
  const [walletDialogOpen, setWalletDialogOpen] = useState(true);
  if (currentProfile.isLoading) return <AppShell><div className="skeleton h-96 rounded-[28px]"/></AppShell>;
  if (currentProfile.isError && !isUnauthorized(currentProfile.error)) return <AppShell><QueryState loading={false} error retry={()=>void currentProfile.refetch()}><div/></QueryState></AppShell>;
  if (!currentProfile.data) return <AppShell><div className="page-enter"><PageTitle eyebrow="Your conversations" title="Messages." description="Sign in to view or send messages."/><EmptyState title="Connect your wallet to continue." detail="Messages are available after you verify your wallet and make a mutual match."/></div><WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo="/messages"/></AppShell>;
  if (conversationsLoading) return <AppShell><div className="skeleton h-96 rounded-[28px]"/></AppShell>;
  if (conversationsError) return <AppShell><QueryState loading={false} error retry={()=>void retryConversations()}><div/></QueryState></AppShell>;
  if (!conversations?.length) return <AppShell><PageTitle eyebrow="A good conversation starts here" title="Messages."/><EmptyState title="No chats just yet." detail="A conversation opens after a mutual match. Your messages will be waiting here." action={<Link href="/discover" className="button-primary rounded-full px-5 py-3 text-sm font-bold" data-testid="link-discover-from-messages">Discover holders</Link>}/></AppShell>;
  return <AppShell><div
    className={`page-enter messages-page ${mobileChatOpen ? 'mobile-chat-open' : ''}`}
    style={mobileChatOpen && chatViewportHeight ? { height: `${chatViewportHeight}px` } : undefined}
  >
     <div className="messages-page-title"><PageTitle eyebrow="Your conversations" title="Messages." description="A little hello can go a long way." /></div>
     <div className="surface messages-layout grid min-h-[570px] overflow-hidden rounded-[28px] md:grid-cols-[300px_1fr]">
       <aside className="messages-contacts border-b border-[#24133f12] bg-[#eee7fb] md:border-b-0 md:border-r" aria-label="Conversations">
         <div className="messages-contacts-heading px-5 py-4"><Eyebrow>Conversation history</Eyebrow><h2 className="display text-xl font-extrabold text-[#24133f]">Your people</h2></div>
         <div className="messages-contact-list space-y-1 px-2 pb-3">
           {conversations.map(item => {
             const selected = matchId === item.id;
             return <button
               key={item.id}
               type="button"
               onClick={() => choose(item.id)}
               aria-current={selected ? 'true' : undefined}
               aria-label={`Open conversation with ${item.profile.displayName}`}
               className={`messages-contact-row ${selected ? 'is-selected' : ''}`}
               data-testid={`conversation-${item.id}`}
             >
               <span className="messages-contact-art"><ChogArtwork chog={item.profile.chog} fit="contain" className="rounded-full"/></span>
               <span className="messages-contact-copy">
                 <span className="messages-contact-title">
                   <span className={`messages-contact-name ${(item.unreadCount ?? 0) > 0 ? 'has-unread' : ''}`}>{item.profile.displayName}</span>
                   {item.lastMessageAt && <time className="messages-contact-time" dateTime={item.lastMessageAt}>{formatConversationTime(item.lastMessageAt)}</time>}
                 </span>
                 <span className="messages-contact-username">@{item.profile.username}{item.status === 'unmatched' ? ' · Unmatched' : ''}</span>
                 <span className={`messages-contact-preview ${(item.unreadCount ?? 0) > 0 ? 'has-unread' : ''}`}>{getConversationPreview(item)}</span>
               </span>
               {(item.unreadCount ?? 0) > 0 && <span className="messages-unread-count" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount}</span>}
             </button>;
           })}
         </div>
       </aside>
       <section className="messages-chat flex min-h-[460px] flex-col">
           {match && <header className="messages-chat-header flex flex-wrap items-center gap-3 border-b border-[#24133f12] px-5 py-4">
             <button
               type="button"
               onClick={() => choose('')}
               className="messages-back-button"
               aria-label="Back to conversations"
               data-testid="button-back-to-conversations"
             ><ArrowLeft size={19}/></button>
             <ProfileOpenButton
               profile={match.profile}
               options={match.status === 'unmatched' ? { source: 'ex-match', matchId: match.id } : { source: 'matched', matchId: match.id }}
               className="messages-chat-identity min-w-0 flex-1 text-left"
               label={`Open ${match.profile.displayName}'s full profile`}
             >
               <span className="messages-chat-art"><ChogArtwork chog={match.profile.chog} fit="contain" className="rounded-full"/></span>
               <span className="messages-chat-person">
                 <span className="messages-chat-name">{match.profile.displayName}</span>
                 <span className="messages-chat-username">@{match.profile.username} · Chog holder</span>
               </span>
             </ProfileOpenButton>
             <div className="messages-chat-actions flex items-center gap-2">
                {match.status === 'active' && <button
                  type="button"
                  onClick={() => setGiftMatch(match)}
                  className="messages-call-button inline-flex items-center gap-2 rounded-full border border-[#e9e0d3] px-3 py-2 text-xs font-semibold text-[#6246b0] transition hover:bg-[#f7f2ff]"
                  aria-label={`Send a $CHOG gift to ${match.profile.displayName}`}
                  data-testid={`button-chat-gift-${match.id}`}
                ><Gift size={15}/><span className="messages-call-label">Gift</span></button>}
               <button
                 type="button"
                 onClick={() => void callControls.startCall(match.id, 'audio', match.profile)}
                 disabled={match.status !== 'active' || callControls.busy || Boolean(callControls.activeCall)}
                 title={match.status === 'active' ? 'Start an audio call' : 'Calls require an active match'}
                 aria-label="Start audio call"
                 className="messages-call-button inline-flex items-center gap-2 rounded-full border border-[#e9e0d3] px-3 py-2 text-xs font-semibold text-[#6246b0] transition hover:bg-[#f7f2ff] disabled:cursor-not-allowed disabled:opacity-50"
                 data-testid="button-audio-call"
               ><Phone size={15}/><span className="messages-call-label">Audio</span></button>
               <button
                 type="button"
                 onClick={() => void callControls.startCall(match.id, 'video', match.profile)}
                 disabled={match.status !== 'active' || callControls.busy || Boolean(callControls.activeCall)}
                 title={match.status === 'active' ? 'Start a video call' : 'Calls require an active match'}
                 aria-label="Start video call"
                 className="messages-call-button inline-flex items-center gap-2 rounded-full border border-[#e9e0d3] px-3 py-2 text-xs font-semibold text-[#6246b0] transition hover:bg-[#f7f2ff] disabled:cursor-not-allowed disabled:opacity-50"
                 data-testid="button-video-call"
               ><Video size={15}/><span className="messages-call-label">Video</span></button>
               <ReportControl
                 profile={match.profile}
                 canInteract={Boolean(currentProfile.data)}
                 onAuthRequired={() => setWalletDialogOpen(true)}
               />
             </div>
           </header>}
         {match?.status === 'unmatched' && <p className="border-b border-[#24133f12] bg-[#fffaf0] px-5 py-3 text-xs leading-5 text-[#806b47]" role="status">You are no longer matched, but this conversation remains available until either person blocks the other.</p>}
         <div className="messages-chat-transcript flex flex-1 flex-col gap-3 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#f7f2ff_0,transparent_68%)] p-5">
           {callHistory.data?.length ? (
             <section className="mb-1 space-y-2" aria-label="Call history" data-testid="call-history">
               <h3 className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8091]">Recent calls</h3>
               {callHistory.data.slice(-8).map(call => {
                 const endedAt = call.ended_at ? new Date(call.ended_at).getTime() : Date.now();
                 const connectedAt = call.connected_at ? new Date(call.connected_at).getTime() : null;
                 const result = call.status === 'missed'
                   ? 'Missed'
                   : call.status === 'rejected'
                     ? 'Declined'
                     : call.status === 'failed'
                       ? 'Failed'
                       : connectedAt
                         ? formatCallHistoryDuration(Math.max(0, Math.floor((endedAt - connectedAt) / 1000)))
                         : call.status === 'ended'
                           ? 'Cancelled'
                           : 'In progress';
                 const direction = call.caller_id === currentUserId ? 'Outgoing' : 'Incoming';
                 const type = call.type === 'video' ? 'video' : 'audio';
                 return <div key={call.id} className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-white/80 px-3 py-2.5 text-xs" data-testid={`call-history-${call.id}`}>
                   <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eee8ff] text-[#7047ff]" aria-hidden="true">
                     {type === 'video' ? <Video size={15}/> : <Phone size={15}/>}
                   </span>
                   <span className="min-w-0 flex-1 font-semibold text-[#51445f]">{direction} {type} call</span>
                   <span className="shrink-0 text-[#8b8091]">{result}</span>
                 </div>;
               })}
             </section>
           ) : callHistory.isError ? (
             <p className="text-xs text-[#a34646]" role="status">Call history is temporarily unavailable.</p>
           ) : null}
           <QueryState loading={isLoading} error={isError} retry={()=>void refetch()}>
             {giftHistory.isError && <p className="mx-auto max-w-sm rounded-xl border border-[#eadfe0] bg-white/80 px-3 py-2 text-center text-[11px] text-[#806b8d]" role="status">Gift history could not be loaded. <button type="button" className="font-bold underline" onClick={()=>void giftHistory.refetch()}>Retry</button></p>}
             {conversationTimeline.length ? conversationTimeline.map(event => {
               if (event.type === 'gift') return <GiftChatEvent key={`gift-${event.id}`} gift={event.gift} currentUserId={currentUserId}/>;
               const message = event.message;
               const mine=message.senderId===currentUserId;
               return <div key={`message-${message.id}`} className={`max-w-[82%] rounded-[20px] px-4 py-3 text-sm leading-5 ${mine?'ml-auto rounded-br-md bg-[#7047ff] text-white':'mr-auto rounded-bl-md border border-[#eee5d9] bg-white text-[#51445f]'}`} data-testid={`message-${message.id}`}>
                 {message.messageType === 'image' && message.attachmentUrl
                   ? <a href={message.attachmentUrl} target="_blank" rel="noreferrer"><img src={message.attachmentUrl} alt={message.attachmentName || 'Chat attachment'} className="max-h-72 max-w-full rounded-xl object-contain" loading="lazy"/></a>
                   : message.messageType === 'voice' && message.attachmentUrl
                     ? <audio src={message.attachmentUrl} controls className="max-w-full" aria-label="Voice message"/>
                     : message.messageType === 'file' && message.attachmentUrl
                       ? <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className={`flex items-center gap-2 underline underline-offset-2 ${mine?'text-white':'text-[#7047ff]'}`}><FileText size={17}/><span className="break-all">{message.attachmentName || 'Download file'}</span></a>
                       : <p>{message.content}</p>}
                 {message.messageType !== 'text' && !message.attachmentUrl && <p className="text-xs opacity-80">Attachment unavailable</p>}
                 <time className={`mt-1 block text-[10px] ${mine?'text-white/70':'text-[#9b8fa0]'}`}>{new Date(message.createdAt).toLocaleString()}</time>
               </div>;
             }) : giftHistory.isLoading ? <div className="skeleton m-auto h-16 w-64 rounded-2xl" aria-label="Loading gift history"/> : <div className="m-auto max-w-sm py-10 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#eee8ff] text-[#7047ff]"><MessageCircle size={20}/></div><h3 className="display text-xl font-extrabold text-[#35264b]">Start with a hello.</h3><p className="mt-2 text-sm leading-5 text-[#8b8091]">This is the beginning of your conversation with {match?.profile.displayName}.</p></div>}
           </QueryState>
          {send.isError && <p className="text-right text-xs text-[#a34646]" role="alert" data-testid="status-send-error">Message not sent. Please try again.</p>}
          {mediaError && <p className="text-right text-xs text-[#a34646]" role="alert" data-testid="status-media-error">{mediaError}</p>}
        </div>
         <form onSubmit={submit} className="messages-chat-composer border-t border-[#24133f12] p-4">
           {imageDraft && imageDraftUrl && <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#f5f0ff] p-3"><img src={imageDraftUrl} alt="Image preview before sending" className="h-16 w-16 shrink-0 rounded-xl object-cover"/><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#594d64]">{imageDraft.name}</span><button type="button" onClick={()=>setImageDraft(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#7357a7]" aria-label="Discard image"><X size={17}/></button><button type="button" onClick={()=>void sendMedia(imageDraft,'image')} disabled={mediaBusy||!conversationCanSend} className="button-primary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">{mediaBusy?'Sending…':'Send image'}</button></div>}
           {voiceDraft && voiceDraftUrl && <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#f5f0ff] p-3"><audio src={voiceDraftUrl} controls className="min-w-0 flex-1" aria-label="Voice message preview"/><button type="button" onClick={()=>setVoiceDraft(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#7357a7]" aria-label="Discard voice message"><X size={17}/></button><button type="button" onClick={()=>void sendMedia(voiceDraft,'voice')} disabled={mediaBusy||!conversationCanSend} className="button-primary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">{mediaBusy?'Sending…':'Send voice'}</button></div>}
          <div className="flex gap-2">
             <input value={content} onChange={e=>setContent(e.target.value)} maxLength={4000} disabled={!conversationCanSend} placeholder="Write a message…" className="field min-w-0 flex-1 disabled:cursor-not-allowed disabled:bg-[#f4f1f4]" aria-label="Message" data-testid="input-message"/>
             <button type="submit" disabled={!conversationCanSend||!content.trim()||send.isPending} className="button-primary grid h-12 w-12 shrink-0 place-items-center rounded-2xl disabled:opacity-50" aria-label="Send message" data-testid="button-send-message"><Send size={17}/></button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event=>selectAttachment(event,'image')} aria-label="Choose an image"/>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.zip,.json,.doc,.docx,.xls,.xlsx" className="sr-only" onChange={event=>selectAttachment(event,'file')} aria-label="Choose a file"/>
             <button type="button" onClick={()=>imageInputRef.current?.click()} disabled={!conversationCanSend||mediaBusy||recording} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178] hover:bg-[#f8f4ff] disabled:opacity-50"><ImageIcon size={15}/>Image</button>
             <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={!conversationCanSend||mediaBusy||recording} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178] hover:bg-[#f8f4ff] disabled:opacity-50"><Paperclip size={15}/>File</button>
            {!recording
               ? <button type="button" onClick={()=>void startVoiceRecording()} disabled={!conversationCanSend||mediaBusy||Boolean(voiceDraft)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178] hover:bg-[#f8f4ff] disabled:opacity-50"><Mic size={15}/>Record voice</button>
              : <><span className="text-xs font-semibold text-[#a34646]" aria-live="polite">Recording · {recordingSeconds}s</span><button type="button" onClick={cancelVoiceRecording} className="rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178]">Cancel</button><button type="button" onClick={stopVoiceRecording} className="rounded-full bg-[#7047ff] px-3 py-2 text-xs font-bold text-white"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-white"/>Stop</span></button></>}
            {mediaBusy && <span className="text-xs text-[#8b8091]" role="status">Uploading attachment…</span>}
          </div>
        </form>
      </section>
    </div>
      <GiftFlowDialog match={giftMatch} senderWallet={currentProfile.data.walletAddress} open={Boolean(giftMatch)} onOpenChange={open => { if (!open) setGiftMatch(null); }}/>
   </div></AppShell>;
}

function formatCallHistoryDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function updateMessageMatchQuery(matchId: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (matchId) url.searchParams.set('match', matchId);
  else url.searchParams.delete('match');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function getConversationPreview(conversation: Conversation): string {
  if (!conversation.lastMessageType) return 'No messages yet';
  if (conversation.lastMessageType === 'voice') return 'Voice message';
  if (conversation.lastMessageType === 'image') return 'Photo';
  if (conversation.lastMessageType === 'file') return 'File';
  return conversation.lastMessagePreview?.trim().slice(0, 120) || 'Message';
}

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' }).format(date);
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && 'data' in error) {
    const data = (error as Error & { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && 'status' in error && error.status === 401;
}

function isDiscoverReadyProfile(
  profile: Profile | null | undefined,
  walletAddress: string,
): boolean {
  if (!profile) return false;
  return Boolean(
    profile.displayName.trim() &&
    profile.username.trim() &&
    profile.lookingFor.length > 0 &&
    profile.chog.verified &&
    profile.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
    profile.chog.ownerWallet.toLowerCase() === walletAddress.toLowerCase()
  );
}
