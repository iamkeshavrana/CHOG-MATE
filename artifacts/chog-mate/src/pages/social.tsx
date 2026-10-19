import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, FileText, Heart, Image as ImageIcon, MessageCircle, Mic, MoreHorizontal, Paperclip, Search, Send, Sparkles, Video, X } from 'lucide-react';
import { Link } from 'wouter';
import {
  getGetAuthSessionQueryKey,
  getDiscoverProfilesQueryKey, getGetMatchesQueryKey, getGetMessagesQueryKey,
  getGetMeQueryKey, getGetLikeInboxQueryKey, getGetSentLikesQueryKey,
  useBlockProfile, useDiscoverProfiles, useGetMatches, useGetMessages,
  useGetAuthSession, useGetLikeInbox, useGetMe, useGetSentLikes, useReportProfile, useRequestMessageAttachmentUploadUrl, useSendMessage, useSwipeProfile, useUnmatchProfile,
} from '@workspace/api-client-react';
import { type DiscoverProfilesMode, type DiscoverProfilesParams, type LikeInboxItem, type Profile, ReportInputReason } from '@workspace/api-client-react';
import { formatUnits, type Hex } from 'viem';
import { useConnection, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { AppShell, ChogArtwork, EmptyState, Eyebrow, PageTitle, ProfileAvatar, QueryState } from '@/components/shared';
import { WalletConnectionDialog } from '@/components/wallet-connection-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { appConfig } from '@/lib/config';
import { monadNetwork } from '@/lib/appkit';
import { supabase } from '@/lib/supabase';

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
  pending,
}: {
  profile: Profile;
  onAction: (action: 'pass'|'like'|'super_like') => void;
  onOpenProfile: () => void;
  onAuthRequired: () => void;
  canInteract: boolean;
  pending: boolean;
}) {
  const touchStart = useRef<number | null>(null);
  const sections = [
    { title: 'Looking For', values: profile.lookingFor },
    { title: 'Interests', values: profile.interests },
    { title: 'Hobbies', values: profile.hobbies },
    { title: 'Languages', values: profile.languages },
  ].filter(section => section.values.length > 0);
  const lookingForOther = profile.lookingForOther?.trim();
  const hasOtherLookingFor = profile.lookingFor.some(value => value.trim().toLowerCase() === 'other');
  function finishTouch(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStart.current === null) return;
    const endX = event.changedTouches[0]?.clientX;
    const distance = endX === undefined ? 0 : endX - touchStart.current;
    touchStart.current = null;
    if (distance > 70) onAction('like');
    else if (distance < -70) onAction('pass');
  }
  return <article className="surface discover-profile-card mx-auto w-full min-w-0 max-w-[920px] overflow-hidden rounded-[28px] border border-[#e8dff0] bg-[#fffaf6] shadow-[0_22px_70px_-36px_#40275e55]" data-testid={`card-profile-${profile.userId}`}>
    <div
      onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={finishTouch}
      onTouchCancel={() => { touchStart.current = null; }}
        className="discover-profile-art relative isolate w-full touch-pan-y bg-[radial-gradient(ellipse_at_50%_30%,#f6efff_0%,#e6ddf8_60%,#d9cbed_100%)]"
      data-testid={`swipe-surface-${profile.userId}`}
      aria-label={`Verified Chog artwork and profile for ${profile.displayName}. Swipe right to like or left to pass.`}
    >
      <ChogArtwork chog={profile.chog} fit="contained-natural" />
    </div>
    <div className="discover-profile-details min-w-0 px-4 pb-3 pt-3 sm:px-5">
      <div className="discover-profile-info">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="discover-profile-meta mb-1 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e9deef] bg-white/75 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-[#73569a]">
                <BadgeCheck size={12} aria-hidden="true" /> Verified holder
              </div>
              <div onClick={event => event.stopPropagation()}>
                <ReportControl profile={profile} canInteract={canInteract} onAuthRequired={onAuthRequired} />
              </div>
            </div>
            <h2 className="display break-words text-[28px] font-extrabold leading-none tracking-[-.045em]" data-testid={`text-display-name-${profile.userId}`}>{profile.displayName}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12px] font-medium text-[#75677c]">
              <span>@{profile.username}</span>
              {profile.age !== null && <><span aria-hidden="true" className="text-[#b8a9ba]">·</span><span>{profile.age}</span></>}
            </p>
            <p className="mt-1 text-[9px] font-medium text-[#97899c] sm:hidden">Swipe to pass or like</p>
          </div>
          <div className="shrink-0 rounded-xl border border-[#e9deef] bg-white/75 px-3 py-2 text-right">
            <span className="display block text-sm font-extrabold leading-none">Chog #{profile.chog.tokenId}</span>
            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.1em] text-[#81758a]">{profile.chog.tier || 'Tier unlisted'}</span>
          </div>
        </div>
        {profile.bio?.trim() && <section aria-label="About" className="mb-3 rounded-2xl bg-[#f7f1fa] px-3.5 py-2.5">
          <h3 className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#9476a0]">About</h3>
          <p className="mt-1 whitespace-pre-line break-words text-[12px] leading-[1.45] text-[#594b62]" data-testid={`text-bio-${profile.userId}`}>{profile.bio}</p>
        </section>}
        <div className="space-y-2.5">
        {sections.map(section => <section key={section.title} aria-label={section.title} data-testid={`section-${section.title.toLowerCase().replace(/\s+/g, '-')}-${profile.userId}`}>
          <h3 className="mb-1 text-[9px] font-extrabold uppercase tracking-[.14em] text-[#9476a0]">{section.title}</h3>
          <div className="flex flex-wrap gap-1">
            {section.values.map(item => <span key={item} className={`max-w-full break-words rounded-full px-2.5 py-1 text-[10px] font-semibold leading-4 ${section.title === 'Looking For' ? 'bg-[#eee5fb] text-[#6246a0]' : 'border border-[#eadfee] bg-[#fffdfb] text-[#6d6075]'}`}>{item}</span>)}
          </div>
          {section.title === 'Looking For' && hasOtherLookingFor && lookingForOther && <p className="mt-2 break-words rounded-xl border-l-2 border-[#d8b8d4] bg-[#fbf5fa] px-3 py-2 text-[11px] leading-5 text-[#655469]" data-testid={`text-looking-for-other-${profile.userId}`}>{lookingForOther}</p>}
        </section>)}
      </div>
      </div>
      <div className="discover-profile-actions mt-2 flex items-center justify-between gap-2 border-t border-[#eee5ec] pt-2.5">
        <button type="button" onClick={event => { event.stopPropagation(); onOpenProfile(); }} className="inline-flex min-h-9 min-w-0 items-center gap-1 rounded-lg text-left text-[11px] font-bold text-[#7047b5] underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a77ad5]" data-testid={`button-open-profile-${profile.userId}`}>
          View full profile <ArrowRight size={13} aria-hidden="true"/>
        </button>
        <div className="flex shrink-0 items-center justify-center gap-2" aria-label="Profile actions">
          <button type="button" disabled={pending} onClick={event => { event.stopPropagation(); onAction('pass'); }} className="grid h-10 w-10 place-items-center rounded-full border border-[#e8dce7] bg-[#fffdfb] text-[#8a7387] transition hover:-translate-y-0.5 hover:border-[#e9a5af] hover:text-[#c5546a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d98190] disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Pass on ${profile.displayName}`} data-testid={`button-pass-${profile.userId}`}><X size={19} aria-hidden="true"/></button>
          <button type="button" disabled={pending} onClick={event => { event.stopPropagation(); onAction('super_like'); }} className="grid h-9 w-9 place-items-center rounded-full bg-[#eee5fb] text-[#7851bd] transition hover:-translate-y-0.5 hover:bg-[#e4d6f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a77ad5] disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Super like ${profile.displayName}`} data-testid={`button-super-like-${profile.userId}`}><Sparkles size={16} aria-hidden="true"/></button>
          <button type="button" disabled={pending} onClick={event => { event.stopPropagation(); onAction('like'); }} className="grid h-11 w-11 place-items-center rounded-full bg-[#a34b83] text-[#fffaf6] shadow-[0_7px_16px_-7px_#81386888] transition hover:-translate-y-0.5 hover:bg-[#923f75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d59abb] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Like ${profile.displayName}`} data-testid={`button-like-${profile.userId}`}><Heart size={20} fill="currentColor" aria-hidden="true"/></button>
        </div>
      </div>
    </div>
  </article>;
}

function ProfileDetailsDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!profile) return null;
  const sections = [
    { title: 'Interests', values: profile.interests },
    { title: 'Hobbies', values: profile.hobbies },
    { title: 'Languages', values: profile.languages },
  ].filter(section => section.values.length > 0);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="surface max-h-[85dvh] max-w-2xl overflow-y-auto rounded-[28px] border-[#e8dfd5] bg-[#fffaf6] p-0">
      <div className="relative bg-[#e8ddff]"><ChogArtwork chog={profile.chog} fit="natural"/><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#211332e8] to-transparent px-6 pb-5 pt-20 text-white sm:px-8"><div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] backdrop-blur"><BadgeCheck size={12}/>Holder verified</div><h2 className="display text-3xl font-extrabold tracking-[-.04em]">{profile.displayName}{profile.age !== null ? `, ${profile.age}` : ''}</h2><p className="mt-1 text-sm text-white/80">@{profile.username}</p></div></div>
      <div className="max-h-[45vh] overflow-y-auto px-6 pb-7 pt-5 sm:px-8">
        <DialogHeader className="text-left">
          <DialogTitle className="sr-only">{profile.displayName}’s profile</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#6d6178]">{profile.bio || 'A verified holder, ready to make a new connection.'}</DialogDescription>
        </DialogHeader>
        {profile.gender && <p className="mt-4 text-xs text-[#81758a]"><strong className="font-bold text-[#594d64]">Gender:</strong> {profile.gender}</p>}
        {profile.lookingFor.length > 0 && <section className="mt-5" aria-label="Looking for"><h3 className="text-[10px] font-bold uppercase tracking-[.13em] text-[#9b6b3c]">Looking for</h3><div className="mt-2 flex flex-wrap gap-2">{profile.lookingFor.map(item=><span key={item} className="rounded-full bg-[#f2ecff] px-3 py-1.5 text-[11px] font-bold text-[#6246b0]">{item}</span>)}</div>{profile.lookingFor.includes('Other') && profile.lookingForOther?.trim() && <p className="mt-2 rounded-xl bg-[#f8f3fc] px-3 py-2 text-xs leading-5 text-[#6d6178]">{profile.lookingForOther}</p>}</section>}
        {sections.map(section=><section key={section.title} className="mt-5"><h3 className="text-[10px] font-bold uppercase tracking-[.13em] text-[#9b6b3c]">{section.title}</h3><div className="mt-2 flex flex-wrap gap-2">{section.values.map(item=><span key={item} className="rounded-full border border-[#e9e1d7] px-3 py-1.5 text-[11px] font-medium text-[#7c7185]">{item}</span>)}</div></section>)}
        <p className="mt-6 flex items-center gap-2 border-t border-[#24133f12] pt-4 text-xs text-[#81758a]"><BadgeCheck size={15} className="text-[#447a43]"/>Chog #{profile.chog.tokenId} · ownership checked on Monad</p>
      </div>
    </DialogContent>
  </Dialog>;
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

function SuperLikeDialog({
  profile,
  walletAddress,
  identityMode,
  onOpenChange,
  onConfirmed,
}: {
  profile: Profile | null;
  walletAddress: string | null;
  identityMode: 'wallet_connected' | 'address_only' | undefined;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (transactionHash: Hex) => Promise<void>;
}) {
  const connection = useConnection();
  const publicClient = usePublicClient({ chainId: monadNetwork.id });
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const walletMatchesSession = Boolean(
    connection.address &&
    walletAddress &&
    connection.address.toLowerCase() === walletAddress.toLowerCase(),
  );
  const canUseWallet = Boolean(
    connection.isConnected &&
    connection.chainId === monadNetwork.id &&
    walletMatchesSession &&
    identityMode === 'wallet_connected',
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

  useEffect(() => {
    setTransactionHash(null);
    setPhase('');
    setError('');
    setSaving(false);
  }, [profile?.userId]);

  async function recordConfirmedTransfer(hash: Hex) {
    setSaving(true);
    setError('');
    setPhase('Saving the confirmed Super Like…');
    try {
      await onConfirmed(hash);
      setPhase('Super Like sent.');
    } catch {
      setPhase('');
      setError('The transfer is confirmed, but the Super Like could not be saved. Retry saving this same transaction; do not send another payment.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmSuperLike() {
    setError('');
    if (!profile) return;
    if (transactionHash) {
      await recordConfirmedTransfer(transactionHash);
      return;
    }
    if (!canUseWallet || !connection.address || !walletMatchesSession) {
      setError(
        identityMode === 'address_only'
          ? 'Connect your wallet to continue.'
          : 'Connect the wallet used for this verified profile on Monad Mainnet.',
      );
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

    try {
      setPhase('Confirm the transfer in your wallet…');
      const hash = await writeContractAsync({
        address: appConfig.chogTokenAddress,
        abi: chogTokenAbi,
        functionName: 'transfer',
        args: [profile.walletAddress as `0x${string}`, amount],
        chainId: monadNetwork.id,
      });
      setTransactionHash(hash);
      setPhase('Waiting for Monad confirmation…');
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      if (receipt.status !== 'success') {
        setPhase('');
        setError('The $CHOG transfer failed on Monad. No Super Like was saved.');
        return;
      }
      await balance.refetch();
      await recordConfirmedTransfer(hash);
    } catch (caught) {
      setPhase('');
      if (transactionHash) {
        setError(caught instanceof Error ? caught.message : 'The transaction did not confirm. No Super Like was saved.');
      } else {
        setError(caught instanceof Error ? caught.message : 'The wallet rejected or failed the transfer. No Super Like was saved.');
      }
    }
  }

  return (
    <Dialog
      open={Boolean(profile)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && transactionHash && !phase.includes('sent')) {
          setError('Save the confirmed transaction before closing this window.');
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
            This is a real, irreversible transfer of 100 $CHOG. It does not create a mutual Match.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-[#eadfe0] bg-white/70 px-4 py-3 text-sm text-[#594d64]">
          <p className="flex items-center justify-between gap-3">
            <span>Live balance</span>
            <strong className="tabular-nums">{balanceText === null ? (balance.isLoading || decimals.isLoading ? 'Loading…' : 'Unavailable') : `${balanceText} $CHOG`}</strong>
          </p>
          {profile && <p className="mt-2 break-all text-[10px] leading-4 text-[#978a9b]">Recipient · {profile.walletAddress}</p>}
        </div>
        {!connection.isConnected && <p className="text-xs leading-5 text-[#8b8091]">Connect the wallet used for your CHOG MATE profile to continue.</p>}
        {connection.isConnected && connection.chainId !== monadNetwork.id && <p className="text-xs text-[#a34646]" role="alert">Switch your wallet to Monad Mainnet before sending.</p>}
        {identityMode === 'address_only' && <p className="text-xs leading-5 text-[#a34646]" role="alert">Connect your wallet to continue. Address-only accounts can like and message, but cannot sign blockchain transactions.</p>}
        {phase && <p className="text-xs font-semibold text-[#7053a4]" role="status">{phase}</p>}
        {transactionHash && (
          <a href={`https://monadscan.com/tx/${transactionHash}`} target="_blank" rel="noreferrer" className="break-all text-xs font-semibold text-[#7047ff] underline">
            View transaction · {transactionHash}
          </a>
        )}
        {error && <p className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs leading-5 text-[#a34646]" role="alert">{error}</p>}
        <button
          type="button"
          onClick={() => void confirmSuperLike()}
          disabled={walletPending || saving || !profile || (amount !== null && insufficient) || phase.includes('sent')}
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
        {!transactionHash && (
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

export function DiscoverPage() {
  const [cursor, setCursor] = useState<string | undefined>();
  const [mode, setMode] = useState<DiscoverProfilesMode>('discover');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [profileIndex, setProfileIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [likeAnimation, setLikeAnimation] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);
  const [superLikeTarget, setSuperLikeTarget] = useState<Profile | null>(null);
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
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setCursor(undefined);
      setProfileIndex(0);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);
  const params: DiscoverProfilesParams = useMemo(
    () => ({
      mode,
      limit: 20,
      ...(cursor ? { cursor } : {}),
      ...(search ? { search } : {}),
    }),
    [cursor, mode, search],
  );
  const key = getDiscoverProfilesQueryKey(params);
  const { data, isLoading, isError, refetch } = useDiscoverProfiles(params, { query: { queryKey:key, retry:false } });
  const profiles = data?.profiles || [];
  useEffect(() => {
    if (canInteract) setWalletDialogOpen(false);
  }, [canInteract]);
  useEffect(() => {
    setProfileIndex(0);
    setToast('');
    setSwipeDirection(null);
    setLikeAnimation(false);
  }, [cursor, mode, search]);
  async function recordSwipe(
    profile: Profile,
    selected: 'pass'|'like'|'super_like',
    transactionHash?: Hex,
  ) {
    const result = await swipe.mutateAsync({
      data: {
        targetUserId: profile.userId,
        action: selected,
        ...(transactionHash ? { transactionHash } : {}),
      },
    });
    if (!result.recorded) {
      throw new Error('This action was already recorded. Refresh discovery before trying again.');
    }
    if (selected === 'like') {
      setLikeAnimation(true);
      await new Promise<void>(resolve => {
        window.setTimeout(resolve, 720);
      });
    } else if (selected === 'pass') {
      await new Promise<void>(resolve => window.setTimeout(resolve, 260));
    }
    setProfileIndex(index => index + 1);
    setSwipeDirection(null);
    setLikeAnimation(false);
    setToast(
      result.matched
        ? "It's a match. Open Matches to start a conversation."
        : selected === 'super_like'
          ? 'Super Like sent. 100 $CHOG was transferred; this does not create a Match.'
          : selected === 'like'
            ? 'Like sent. If they like you back, you’ll match.'
            : 'Profile passed.',
    );
    void qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() });
    void qc.invalidateQueries({ queryKey: getDiscoverProfilesQueryKey() });
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
    const profile = profiles[profileIndex];
    if (!profile) return;
    if (selected === 'super_like') {
      setSuperLikeTarget(profile);
      return;
    }
    setToast('');
    setSwipeDirection(selected === 'like' ? 'right' : 'left');
    setLikeAnimation(false);
    void recordSwipe(profile, selected).catch(error => {
      setSwipeDirection(null);
      setLikeAnimation(false);
      setToast(error instanceof Error ? error.message : 'Your action could not be saved. Please try again.');
    });
  }
  const currentCard = profiles[profileIndex];
  return <AppShell><div className="page-enter discover-page">
     <header className="discover-heading">
       <Eyebrow>The good kind of scrolling</Eyebrow>
       <h1 className="display text-[34px] font-extrabold leading-none text-[#24133f] sm:text-[40px]" data-testid="heading-page">Find your people.</h1>
       <p className="discover-description mt-1 text-[11px] leading-4 text-[#74697b]">Browse real Chog holders without signing in. Complete your profile to get compatibility scores and interact.</p>
     </header>
      <div className="discover-search mx-auto max-w-3xl">
       <label htmlFor="discover-search" className="sr-only">Search Chog Mates by name, username, or Chog token ID</label>
       <div className="flex items-center gap-3 rounded-[22px] border border-white/80 bg-white/60 px-4 shadow-[0_16px_40px_rgba(84,44,62,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition focus-within:border-[#cf83a4] focus-within:bg-white/80 focus-within:shadow-[0_18px_48px_rgba(164,75,112,0.15)]">
         <Search size={19} aria-hidden="true" className="shrink-0 text-[#a45d7b]" />
         <input
           id="discover-search"
           type="text"
           role="searchbox"
           value={searchInput}
           onChange={event => setSearchInput(event.target.value)}
           placeholder="Search Chog Mates..."
           maxLength={100}
           autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[#4b3b4c] outline-none placeholder:text-[#9a8b98]"
           data-testid="input-discover-search"
         />
         {searchInput && <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8b7180] transition hover:bg-white/80 hover:text-[#4b3b4c]" data-testid="button-clear-discover-search"><X size={16}/></button>}
       </div>
     </div>
      <div className="discover-filters flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Connection type">{([{value:'discover',label:'All paths'},{value:'date',label:'Dating'},{value:'friends',label:'Friendship'},{value:'network',label:'Networking'},{value:'collab',label:'Collaboration'}] as {value:DiscoverProfilesMode;label:string}[]).map(item=><button key={item.value} onClick={()=>{setMode(item.value);setCursor(undefined);setToast('');}} className={`mode-tab shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${mode===item.value?'active':''}`} aria-pressed={mode===item.value} data-testid={`button-mode-${item.value}`}>{item.label}</button>)}</div>
    {toast && <div className="mx-auto mb-4 max-w-[620px] rounded-2xl border border-[#ded4f5] bg-white px-4 py-3 text-sm text-[#514177]" role="status" data-testid="status-swipe">{toast}<button className="float-right font-bold" onClick={()=>setToast('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
     {me.isError && !isUnauthorized(me.error) && <p className="mx-auto mb-4 max-w-[620px] rounded-2xl border border-[#ead8ce] bg-[#fff8f1] px-4 py-3 text-sm text-[#755247]" role="status">Your account status could not be loaded. Public profiles are still available; sign-in may be unavailable.</p>}
      <div className="discover-results">
      <QueryState loading={isLoading} error={isError} retry={()=>void refetch()}>
      {currentCard ? <>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={currentCard.userId}
             className="discover-card-motion w-full"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={swipeDirection
              ? { x: swipeDirection === 'right' ? '110%' : '-110%', opacity: 0, rotate: swipeDirection === 'right' ? 8 : -8 }
              : { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={swipeDirection
              ? { x: swipeDirection === 'right' ? '110%' : '-110%', opacity: 0, rotate: swipeDirection === 'right' ? 8 : -8 }
              : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: swipeDirection ? 0.26 : 0.28, ease: 'easeOut' }}
            data-testid={`discover-card-transition-${currentCard.userId}`}
          >
            <DiscoverCard profile={currentCard} onAction={action} onOpenProfile={()=>setViewingProfile(currentCard)} onAuthRequired={()=>setWalletDialogOpen(true)} canInteract={canInteract} pending={swipe.isPending} />
          </motion.div>
        </AnimatePresence>
        <div className="mx-auto mt-5 flex max-w-[620px] items-center justify-between"><p className="text-xs text-[#92869a]">Real holders. Real possibilities.</p>{profileIndex >= profiles.length && data?.nextCursor && <button onClick={()=>{setCursor(data.nextCursor || undefined);setProfileIndex(0);}} className="button-soft inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold" data-testid="button-load-more">More people <ArrowRight size={14}/></button>}</div>
      </> : data?.nextCursor ? <EmptyState mark="cm" title="Looking a little further." detail="No complete profiles in this group yet. Continue to the next set of real Chog holders." action={<button onClick={()=>setCursor(data.nextCursor || undefined)} className="button-soft rounded-full px-5 py-2.5 text-sm font-bold" data-testid="button-load-more">Continue discovery</button>} /> :
       search ? <EmptyState mark="cm" title="No Chog Mates found." detail="Search includes profiles whose owner has Discover visibility on and still holds a verified Chog." action={<button onClick={()=>setSearchInput('')} className="button-soft rounded-full px-5 py-2.5 text-sm font-bold" data-testid="button-clear-search-empty">Clear search</button>} /> :
       <EmptyState mark="cm" title="No one new, for now." detail="Profiles appear when their owner turns Discover visibility on and still holds a verified Chog." action={<button onClick={()=>{setProfileIndex(0);void refetch();}} className="button-soft rounded-full px-5 py-2.5 text-sm font-bold" data-testid="button-refresh-discovery">Check again</button>} />}
    </QueryState>
      </div>
    <AnimatePresence>
      {likeAnimation && <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#6a35a6f2_0%,#321447f5_48%,#180d25fa_100%)] px-6 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        role="status"
        aria-live="assertive"
        aria-label="Like sent"
        data-testid="overlay-like-sent"
      >
        <motion.div
          className="relative flex flex-col items-center text-center text-white"
          initial={{ scale: 0.72, y: 18 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: -8 }}
          transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        >
          <span className="absolute -left-16 top-1 h-2 w-2 rounded-full bg-[#f5d8ff] shadow-[0_0_18px_#f5d8ff]" aria-hidden="true"/>
          <span className="absolute -right-14 top-9 h-1.5 w-1.5 rounded-full bg-[#f2b6d8] shadow-[0_0_16px_#f2b6d8]" aria-hidden="true"/>
          <span className="absolute -left-10 bottom-7 h-1.5 w-1.5 rounded-full bg-[#c8adff] shadow-[0_0_16px_#c8adff]" aria-hidden="true"/>
          <motion.div
            className="grid h-28 w-28 place-items-center rounded-full border border-white/25 bg-white/10 text-[#fff5ff] shadow-[0_0_70px_#dc8aff77] backdrop-blur-md"
            animate={{ scale: [1, 1.08, 1], boxShadow: ['0 0 55px #dc8aff55', '0 0 90px #dc8aff99', '0 0 55px #dc8aff55'] }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
          >
            <Heart size={54} strokeWidth={1.8} fill="currentColor" aria-hidden="true"/>
          </motion.div>
          <p className="mt-7 text-[10px] font-extrabold uppercase tracking-[.28em] text-white/70">CHOG MATE</p>
          <h2 className="display mt-2 text-3xl font-extrabold tracking-[.06em] sm:text-4xl">LIKE SENT</h2>
          <p className="mt-2 text-sm text-white/75">If they like you back, it’s a match.</p>
          <Sparkles className="mt-6 text-[#f6d7ff]" size={19} aria-hidden="true"/>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
    <ProfileDetailsDialog profile={viewingProfile} open={Boolean(viewingProfile)} onOpenChange={open=>{if(!open)setViewingProfile(null);}}/>
    <SuperLikeDialog
      profile={superLikeTarget}
      walletAddress={me.data?.walletAddress ?? null}
      identityMode={me.data?.identityMode}
      onOpenChange={open=>{if(!open)setSuperLikeTarget(null);}}
      onConfirmed={async transactionHash => {
        if (!superLikeTarget) throw new Error('The selected profile is no longer available.');
        await recordSwipe(superLikeTarget, 'super_like', transactionHash);
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
  const inbox = useGetLikeInbox({
    query: { enabled: Boolean(me.data), queryKey: getGetLikeInboxQueryKey() },
  });
  const sent = useGetSentLikes({
    query: { enabled: Boolean(me.data), queryKey: getGetSentLikesQueryKey() },
  });
  const [walletDialogOpen, setWalletDialogOpen] = useState(true);
  const [section, setSection] = useState<'matches' | 'liked-you' | 'liked-by-you'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#likes' ? 'liked-you' : 'matches',
  );
  const qc = useQueryClient();
  const matches = data || [];
  useEffect(() => {
    const syncSectionFromHash = () => {
      if (window.location.hash === '#likes') setSection('liked-you');
      else if (window.location.hash === '#liked-by-you') setSection('liked-by-you');
    };
    window.addEventListener('hashchange', syncSectionFromHash);
    return () => window.removeEventListener('hashchange', syncSectionFromHash);
  }, []);
  function chooseSection(next: 'matches' | 'liked-you' | 'liked-by-you') {
    setSection(next);
    const hash = next === 'liked-you' ? '#likes' : next === 'liked-by-you' ? '#liked-by-you' : '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }
  function refreshSocialLists() {
    void qc.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetSentLikesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
  }
  if (me.isLoading) return <AppShell><div className="skeleton h-96 rounded-[28px]"/></AppShell>;
  if (me.isError && !isUnauthorized(me.error)) return <AppShell><QueryState loading={false} error retry={()=>void me.refetch()}><div/></QueryState></AppShell>;
  if (!me.data) return <AppShell><div className="page-enter"><PageTitle eyebrow="The feeling is mutual" title="Your matches." description="Sign in to view your mutual connections."/><EmptyState title="Connect your wallet to continue." detail="Your matches are private. Verify your wallet to view them."/></div><WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo="/matches"/></AppShell>;
  return <AppShell><div className="page-enter">
    <PageTitle eyebrow="The feeling is mutual" title="Your connections." description="See who liked you, who you liked, and the people who liked you back." />
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Your likes and matches">
      {([
        { id: 'matches', label: 'Matches', count: matches.length },
        { id: 'liked-you', label: 'Liked You', count: inbox.data?.length ?? 0 },
        { id: 'liked-by-you', label: 'Liked By You', count: sent.data?.length ?? 0 },
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
            ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{inbox.data.map(item=><IncomingLikeCard key={item.id} item={item} onHandled={refreshSocialLists} />)}</div>
            : <EmptyState title="No new likes yet." detail="People who like you will appear here. Like them back to create a Match."/>}
    </section>}
    {section === 'liked-by-you' && <section id="panel-liked-by-you" role="tabpanel" aria-label="People you liked">
      {sent.isError
        ? <div className="rounded-2xl border border-[#eedbd6] bg-white p-4 text-sm text-[#8b5a59]" role="alert">Your outgoing likes could not be loaded. <button onClick={()=>void sent.refetch()} className="font-bold underline">Try again</button></div>
        : sent.isLoading
          ? <div className="skeleton h-48 rounded-2xl" />
          : sent.data?.length
            ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sent.data.map(item=><article className="surface flex gap-4 rounded-[24px] p-4" key={item.id} data-testid={`card-liked-by-you-${item.id}`}>
                <div className="w-24 shrink-0 rounded-2xl bg-[#eee5fb]"><ChogArtwork chog={item.profile.chog} fit="natural"/></div>
                <div className="min-w-0 py-1">
                  <h2 className="display break-words text-lg font-extrabold text-[#35264b]">{item.profile.displayName}{item.profile.age !== null ? `, ${item.profile.age}` : ''}</h2>
                  <p className="mt-1 text-xs text-[#887c90]">@{item.profile.username}</p>
                  <p className="mt-2 text-[11px] font-semibold text-[#705b83]">Chog #{item.profile.chog.tokenId} · {item.profile.chog.tier || 'Tier unlisted'}</p>
                  <p className="mt-2 text-[10px] font-semibold text-[#8a6cad]">{item.type === 'super_like' ? 'Super Liked By You · 100 $CHOG sent' : 'Liked By You'}</p>
                </div>
              </article>)}</div>
            : <EmptyState title="You have not liked anyone yet." detail="Like a Chog holder in Discover and they will appear here until you match." action={<Link href="/discover" className="button-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold" data-testid="link-discover-from-liked-by-you">Discover holders <ArrowRight size={15}/></Link>}/>}
    </section>}
    {section === 'matches' && <section id="panel-matches" role="tabpanel" aria-label="Your matches">
      <QueryState loading={isLoading} error={isError} retry={()=>void refetch()}>
        {matches.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{matches.map(match=><article className="surface flex gap-4 rounded-[26px] p-4 sm:p-5" key={match.id} data-testid={`card-match-${match.id}`}>
          <div className="w-28 shrink-0 rounded-2xl bg-[#eee5fb]"><ChogArtwork chog={match.profile.chog} fit="natural"/></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="display break-words text-lg font-extrabold text-[#24133f]">{match.profile.displayName}{match.profile.age !== null ? `, ${match.profile.age}` : ''}</h2><p className="mt-1 text-xs text-[#82778c]">@{match.profile.username}</p></div><span className="shrink-0 rounded-full bg-[#f2ecff] px-2.5 py-1 text-[10px] font-bold text-[#6246b0]">{match.compatibility}%</span></div>
            <p className="mt-2 text-[11px] font-semibold text-[#705b83]">Chog #{match.profile.chog.tokenId} · {match.profile.chog.tier || 'Tier unlisted'}</p>
            <p className="mt-2 text-[10px] text-[#887c90]">Matched {new Date(match.createdAt).toLocaleDateString()}</p>
            <Link href={`/messages?match=${encodeURIComponent(match.id)}`} className="button-primary mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold" data-testid={`link-message-${match.id}`}><MessageCircle size={15}/>Message</Link>
            <MatchActions matchId={match.id} username={match.profile.username} onDone={refreshSocialLists}/>
          </div>
        </article>)}</div> : <EmptyState mark="cm" title="Your first match is out there." detail="When someone you like likes you back, you’ll find your mutual connection here." action={<Link href="/discover" className="button-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold" data-testid="link-discover-from-matches">Meet people <ArrowRight size={15}/></Link>} />}
      </QueryState>
    </section>}
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
      <div className="w-28 shrink-0 rounded-2xl bg-[#eee5fb]"><ChogArtwork chog={item.profile.chog} fit="natural"/></div>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-sm font-bold text-[#35264b]">{item.profile.displayName}{item.profile.age !== null ? `, ${item.profile.age}` : ''}</h3>
        <p className="mt-1 break-all text-xs text-[#887c90]">@{item.profile.username}</p>
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

function MatchActions({ matchId, username, onDone }: { matchId: string; username: string; onDone: () => void }) {
  const unmatch = useUnmatchProfile();
  return <button onClick={()=>{if(window.confirm(`Unmatch with @${username}? This removes the mutual connection.`)) unmatch.mutate({matchId},{onSuccess:onDone});}} disabled={unmatch.isPending} className="mt-4 text-xs font-semibold text-[#998e9e] underline-offset-4 hover:text-[#9a4a4a] hover:underline disabled:opacity-50" data-testid={`button-unmatch-${matchId}`}>{unmatch.isPending ? 'Removing…' : 'Unmatch'}</button>;
}

export function MessagesPage() {
  const [selectedMatch, setSelectedMatch] = useState(()=>typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('match') || '' : '');
  const currentProfile = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data: matches, isLoading: matchesLoading, isError: matchesError, refetch: retryMatches } = useGetMatches({
    query: { enabled: Boolean(currentProfile.data), queryKey: getGetMatchesQueryKey() },
  });
  const match = matches?.find(item=>item.id === selectedMatch) || matches?.[0];
  const matchId = match?.id || '';
  const messageKey = getGetMessagesQueryKey(matchId);
  const { data: messages, isLoading, isError, refetch } = useGetMessages(matchId, { query: { enabled:!!matchId && Boolean(currentProfile.data), queryKey:messageKey } });
  const [content, setContent] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceDraft, setVoiceDraft] = useState<File | null>(null);
  const [imageDraft, setImageDraft] = useState<File | null>(null);
  const send = useSendMessage();
  const requestUpload = useRequestMessageAttachmentUploadUrl();
  const qc = useQueryClient();
  const currentUserId = currentProfile.data?.profile?.userId;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
    if (!matchId || !client) return;
    const channel = client
      .channel(`match-messages:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        () => {
          void qc.invalidateQueries({ queryKey: getGetMessagesQueryKey(matchId) });
          void qc.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [matchId, qc]);

  async function sendMedia(file: File, messageType: 'voice' | 'image' | 'file') {
    if (!matchId) return;
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
    if (!content.trim() || !matchId) return;
    try {
      await send.mutateAsync({ matchId, data:{content:content.trim()} });
      setContent('');
      await qc.invalidateQueries({queryKey:messageKey});
    } catch { /* The inline mutation error below remains visible. */ }
  }
  function choose(id:string) { setSelectedMatch(id); }
  const [walletDialogOpen, setWalletDialogOpen] = useState(true);
  if (currentProfile.isLoading) return <AppShell><div className="skeleton h-96 rounded-[28px]"/></AppShell>;
  if (currentProfile.isError && !isUnauthorized(currentProfile.error)) return <AppShell><QueryState loading={false} error retry={()=>void currentProfile.refetch()}><div/></QueryState></AppShell>;
  if (!currentProfile.data) return <AppShell><div className="page-enter"><PageTitle eyebrow="Your conversations" title="Messages." description="Sign in to view or send messages."/><EmptyState title="Connect your wallet to continue." detail="Messages are available after you verify your wallet and make a mutual match."/></div><WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo="/messages"/></AppShell>;
  if (matchesLoading) return <AppShell><div className="skeleton h-96 rounded-[28px]"/></AppShell>;
  if (matchesError) return <AppShell><QueryState loading={false} error retry={()=>void retryMatches()}><div/></QueryState></AppShell>;
  if (!matches?.length) return <AppShell><PageTitle eyebrow="A good conversation starts here" title="Messages."/><EmptyState title="No chats just yet." detail="A conversation opens after a mutual match. Your messages will be waiting here." action={<Link href="/discover" className="button-primary rounded-full px-5 py-3 text-sm font-bold" data-testid="link-discover-from-messages">Discover holders</Link>}/></AppShell>;
  return <AppShell><div className="page-enter">
    <PageTitle eyebrow="Your conversations" title="Messages." description="A little hello can go a long way." />
    <div className="surface grid min-h-[570px] overflow-hidden rounded-[28px] md:grid-cols-[300px_1fr]">
      <aside className="border-b border-[#24133f12] bg-[#eee7fb] md:border-b-0 md:border-r"><div className="px-5 py-4"><Eyebrow>Mutual connections</Eyebrow><h2 className="display text-xl font-extrabold text-[#24133f]">Your people</h2></div><div className="flex gap-2 overflow-x-auto px-3 pb-4 md:block md:space-y-1 md:px-2">{matches.map(item=><button onClick={()=>choose(item.id)} key={item.id} className={`flex min-w-[200px] items-center gap-3 rounded-2xl p-3 text-left transition md:w-full ${matchId===item.id?'bg-[#eee8ff]':'hover:bg-[#f6f1e9]'}`} data-testid={`button-conversation-${item.id}`}><ProfileAvatar profile={item.profile} size="sm"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[#35264b]">{item.profile.displayName}</span><span className="block truncate text-xs text-[#8b8091]">@{item.profile.username}</span></span>{(item.unreadCount||0)>0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#7047ff] px-1 text-[10px] font-bold text-white">{item.unreadCount}</span>}</button>)}</div></aside>
      <section className="flex min-h-[460px] flex-col">
        {match && <header className="flex items-center gap-3 border-b border-[#24133f12] px-5 py-4"><ProfileAvatar profile={match.profile} size="sm"/><div className="min-w-0 flex-1"><p className="font-bold text-[#35264b]">{match.profile.displayName}</p><p className="text-xs text-[#887c90]">@{match.profile.username} · Chog holder</p></div><button disabled title="Voice and video calling are not available yet" className="flex items-center gap-2 rounded-full border border-[#e9e0d3] px-3 py-2 text-xs font-semibold text-[#988d9f] disabled:cursor-not-allowed" data-testid="button-call-unavailable"><Video size={15}/>Calls unavailable</button></header>}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#f7f2ff_0,transparent_68%)] p-5">
          <QueryState loading={isLoading} error={isError} retry={()=>void refetch()}>{messages?.length ? messages.map(message=>{
            const mine=message.senderId===currentUserId;
            return <div key={message.id} className={`max-w-[82%] rounded-[20px] px-4 py-3 text-sm leading-5 ${mine?'ml-auto rounded-br-md bg-[#7047ff] text-white':'mr-auto rounded-bl-md border border-[#eee5d9] bg-white text-[#51445f]'}`} data-testid={`message-${message.id}`}>
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
          }) : <div className="m-auto max-w-sm py-10 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[#eee8ff] text-[#7047ff]"><MessageCircle size={20}/></div><h3 className="display text-xl font-extrabold text-[#35264b]">Start with a hello.</h3><p className="mt-2 text-sm leading-5 text-[#8b8091]">This is the beginning of your conversation with {match?.profile.displayName}.</p></div>}</QueryState>
          {send.isError && <p className="text-right text-xs text-[#a34646]" role="alert" data-testid="status-send-error">Message not sent. Please try again.</p>}
          {mediaError && <p className="text-right text-xs text-[#a34646]" role="alert" data-testid="status-media-error">{mediaError}</p>}
        </div>
        <form onSubmit={submit} className="border-t border-[#24133f12] p-4">
          {imageDraft && imageDraftUrl && <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#f5f0ff] p-3"><img src={imageDraftUrl} alt="Image preview before sending" className="h-16 w-16 shrink-0 rounded-xl object-cover"/><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#594d64]">{imageDraft.name}</span><button type="button" onClick={()=>setImageDraft(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#7357a7]" aria-label="Discard image"><X size={17}/></button><button type="button" onClick={()=>void sendMedia(imageDraft,'image')} disabled={mediaBusy} className="button-primary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">{mediaBusy?'Sending…':'Send image'}</button></div>}
          {voiceDraft && voiceDraftUrl && <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#f5f0ff] p-3"><audio src={voiceDraftUrl} controls className="min-w-0 flex-1" aria-label="Voice message preview"/><button type="button" onClick={()=>setVoiceDraft(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#7357a7]" aria-label="Discard voice message"><X size={17}/></button><button type="button" onClick={()=>void sendMedia(voiceDraft,'voice')} disabled={mediaBusy} className="button-primary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">{mediaBusy?'Sending…':'Send voice'}</button></div>}
          <div className="flex gap-2">
            <input value={content} onChange={e=>setContent(e.target.value)} maxLength={4000} placeholder="Write a message…" className="field min-w-0 flex-1" aria-label="Message" data-testid="input-message"/>
            <button type="submit" disabled={!content.trim()||send.isPending} className="button-primary grid h-12 w-12 shrink-0 place-items-center rounded-2xl disabled:opacity-50" aria-label="Send message" data-testid="button-send-message"><Send size={17}/></button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event=>selectAttachment(event,'image')} aria-label="Choose an image"/>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.zip,.json,.doc,.docx,.xls,.xlsx" className="sr-only" onChange={event=>selectAttachment(event,'file')} aria-label="Choose a file"/>
            <button type="button" onClick={()=>imageInputRef.current?.click()} disabled={mediaBusy||recording} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178] hover:bg-[#f8f4ff] disabled:opacity-50"><ImageIcon size={15}/>Image</button>
            <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={mediaBusy||recording} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178] hover:bg-[#f8f4ff] disabled:opacity-50"><Paperclip size={15}/>File</button>
            {!recording
              ? <button type="button" onClick={()=>void startVoiceRecording()} disabled={mediaBusy||Boolean(voiceDraft)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178] hover:bg-[#f8f4ff] disabled:opacity-50"><Mic size={15}/>Record voice</button>
              : <><span className="text-xs font-semibold text-[#a34646]" aria-live="polite">Recording · {recordingSeconds}s</span><button type="button" onClick={cancelVoiceRecording} className="rounded-full border border-[#e5dcef] px-3 py-2 text-xs font-semibold text-[#635178]">Cancel</button><button type="button" onClick={stopVoiceRecording} className="rounded-full bg-[#7047ff] px-3 py-2 text-xs font-bold text-white"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-white"/>Stop</span></button></>}
            {mediaBusy && <span className="text-xs text-[#8b8091]" role="status">Uploading attachment…</span>}
          </div>
        </form>
      </section>
    </div>
  </div></AppShell>;
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
