import { type FormEvent, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Activity, BadgeCheck, Check, ChevronDown, Copy, Heart, Image as ImageIcon, LockKeyhole, LogOut, PencilLine, RefreshCw, Save, Settings2, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { MotionConfig, motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { formatUnits, isAddress, type Address } from 'viem';
import { useConnection, useDisconnect, useReadContract } from 'wagmi';
import {
  getGetAuthSessionQueryKey, getGetBlockedUsersQueryKey, getGetMeQueryKey, getGetNftOwnershipQueryKey,
  useGetBlockedUsers, useGetMe, useGetNftOwnership, useLogoutWallet, useSelectActiveChog,
  useUnblockUser, useUpdateMeProfile,
} from '@workspace/api-client-react';
import type { Chog, Profile, ProfileInput } from '@workspace/api-client-react';
import { AppShell, ChogArtwork, EmptyState, Eyebrow, PageTitle, QueryState } from '@/components/shared';
import { appConfig } from '@/lib/config';
import { monadNetwork } from '@/lib/appkit';
import { Form } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  emptyManualTestProfileFields,
  readManualTestFlow,
  readManualTestProfile,
  writeManualTestProfile,
  type ManualTestProfileFields,
  type ManualTestProfileRecord,
} from '@/lib/manual-test-profile';
import { supabase } from '@/lib/supabase';

const chogTokenBalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{name:'account',type:'address'}],
    outputs: [{name:'',type:'uint256'}],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{name:'',type:'uint8'}],
  },
] as const;

function MyChogTokenBalance({
  walletAddress,
  identityMode,
}: {
  walletAddress: string;
  identityMode: 'wallet_connected' | 'address_only';
}) {
  const connection = useConnection();
  const verifiedAddress = isAddress(walletAddress) ? walletAddress as Address : undefined;
  const connectedAddress = connection.isConnected && connection.address && isAddress(connection.address)
    ? connection.address as Address
    : undefined;
  const walletMatches = Boolean(
    verifiedAddress &&
    connectedAddress &&
    verifiedAddress.toLowerCase() === connectedAddress.toLowerCase(),
  );
  const address = verifiedAddress && (!connection.isConnected || walletMatches)
    ? verifiedAddress
    : undefined;
  const accountError = !verifiedAddress
    ? 'The verified wallet address is unavailable.'
    : connection.isConnected && !walletMatches
      ? identityMode === 'address_only'
        ? 'The connected wallet does not match this address-only account.'
        : 'The connected wallet does not match the signed-in account.'
      : null;

  // useReadContract uses the configured Monad public client, not a wallet signer.
  // This also permits a read-only balance lookup for a disconnected address-only account.
  const decimals = useReadContract({
    address: appConfig.chogTokenAddress,
    abi: chogTokenBalanceAbi,
    functionName: 'decimals',
    chainId: monadNetwork.id,
    query: {enabled:Boolean(address),staleTime:60*60*1000},
  });
  const balance = useReadContract({
    address: appConfig.chogTokenAddress,
    abi: chogTokenBalanceAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: monadNetwork.id,
    query: {
      enabled: Boolean(address),
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      staleTime: 30_000,
    },
  });
  const loading = Boolean(address) && (balance.isFetching || decimals.isFetching);
  const rpcError = Boolean(address) && (balance.isError || decimals.isError);
  const value = address && balance.data !== undefined && decimals.data !== undefined
    ? formatChogTokenBalance(balance.data, decimals.data)
    : null;
  const displayText = accountError
    ?? (loading
      ? 'Loading $CHOG balance...'
      : rpcError
        ? 'Could not read the live balance from Monad. Refresh to retry.'
        : value !== null
          ? `${value} CHOG`
          : 'Loading $CHOG balance...');

  return <section className="surface flex flex-col justify-between gap-4 rounded-[26px] p-5 sm:flex-row sm:items-center sm:px-7" aria-label="Actual CHOG token balance" data-testid="card-chog-token-balance">
    <div>
      <Eyebrow>On-chain token balance</Eyebrow>
      <h2 className="display text-xl font-extrabold text-[#24133f]">$CHOG Balance</h2>
    </div>
    <div className="flex items-center gap-3">
      <p className={`min-w-[7rem] max-w-full break-words text-right ${accountError || rpcError ? 'text-sm font-semibold text-[#a34646]' : 'text-2xl font-extrabold tabular-nums text-[#24133f]'}`} aria-live="polite" data-testid="text-chog-token-balance">
        {displayText}
      </p>
      <button type="button" onClick={()=>{void decimals.refetch();void balance.refetch();}} disabled={!address || loading} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e9e0d3] text-[#806c9c] transition hover:bg-[#f2ecff] disabled:opacity-50" aria-label="Refresh $CHOG balance" data-testid="button-refresh-chog-balance">
        <RefreshCw size={14} className={loading?'animate-spin':''}/>
      </button>
    </div>
  </section>;
}

function formatChogTokenBalance(value: bigint, decimals: number) {
  const [whole='0',fraction=''] = formatUnits(value,decimals).split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const roundedFraction = fraction.slice(0,4).replace(/0+$/,'');
  return roundedFraction ? `${groupedWhole}.${roundedFraction}` : groupedWhole;
}

export function MyChogPage() {
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), refetchOnWindowFocus: true } });
  const wallet = me.data?.walletAddress || '';
  const ownershipKey = getGetNftOwnershipQueryKey(wallet);
  const ownership = useGetNftOwnership(wallet, { query:{ enabled:!!wallet, queryKey:ownershipKey, refetchOnWindowFocus:true } });
  const verifiedChogs = ownership.data?.verified ? ownership.data.chogs.filter(item=>item.verified) : [];
  const [selected, setSelected] = useState('');
  const tokenId = (verifiedChogs.some(item=>item.tokenId===selected) ? selected : '') ||
    (verifiedChogs.some(item=>item.tokenId===me.data?.selectedChogTokenId) ? me.data?.selectedChogTokenId : '') ||
    verifiedChogs[0]?.tokenId || '';
  const qc = useQueryClient();
  const selectActiveChog = useSelectActiveChog();
  const profile = me.data?.profile;
  const [notice, setNotice] = useState('');
  async function useAsProfileChog(tokenId: string) {
    setNotice('');
    if (!me.data?.hasProfile || !verifiedChogs.some(item=>item.tokenId===tokenId)) return;
    setSelected(tokenId);
    if (tokenId === me.data.selectedChogTokenId) return;
    try {
      await selectActiveChog.mutateAsync({data:{tokenId}});
      await Promise.all([
        qc.invalidateQueries({queryKey:getGetMeQueryKey()}),
        qc.invalidateQueries({queryKey:ownershipKey}),
      ]);
      setNotice(`Chog #${tokenId} is now active. Your profile details were unchanged.`);
    } catch {
      setSelected(me.data.selectedChogTokenId || '');
      setNotice('Couldn’t switch your active Chog. Ownership may have changed; refresh and try again.');
    }
  }
  function chooseChog(tokenId: string) {
    if (selectActiveChog.isPending) return;
    if (me.data?.hasProfile) {
      void useAsProfileChog(tokenId);
      return;
    }
    setSelected(tokenId);
    setNotice('');
  }
  return <AppShell displayName={profile?.displayName}><div className={`page-enter ${profile ? 'my-profile-page' : ''}`}>
    <PageTitle eyebrow="Your verified collection" title="My Chogs." description="Your owned Chog Genesis NFTs and live $CHOG balance." />
    {me.data && !me.data.hasProfile && verifiedChogs.length > 0 && (
      <section className="surface mb-5 flex flex-col gap-4 rounded-[24px] border border-[#eadde2] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6" data-testid="card-create-profile-next-step">
        <div>
          <Eyebrow>Next step</Eyebrow>
          <h2 className="display text-xl font-extrabold text-[#24133f]">Create your profile</h2>
          <p className="mt-1 text-xs leading-5 text-[#82778c]">Your Chog is verified. Add the details people will see when they meet you.</p>
        </div>
        <Link
          href={`/profile?chog=${encodeURIComponent(tokenId)}`}
          className="button-primary inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 text-xs font-bold"
          data-testid="link-create-profile-from-my-chogs"
        >
          Create your profile
        </Link>
      </section>
    )}
    <QueryState loading={me.isLoading} error={me.isError} retry={()=>void me.refetch()}>
      {!me.data ? <EmptyState title="Connect your wallet first." detail="Your verified collection appears here after wallet sign-in."/> :
      <>
        <MyChogTokenBalance walletAddress={wallet} identityMode={me.data.identityMode}/>
        <QueryState loading={ownership.isLoading} error={ownership.isError} retry={()=>void ownership.refetch()}>
          {!verifiedChogs.length
            ? <EmptyState title="No Chog Found" detail="No verified Chog Genesis NFTs are currently owned by this wallet." mark="cm"/>
            : <section className="surface rounded-[28px] p-5 sm:p-7" aria-label="Owned Chog NFTs" data-testid="section-owned-chogs">
                <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <div>
                    <Eyebrow>Chog Genesis</Eyebrow>
                    <h2 className="display text-[25px] font-extrabold text-[#24133f]">Owned Chogs</h2>
                  </div>
                  <p className="text-xs text-[#81758a]" data-testid="text-owned-chog-count">{verifiedChogs.length} owned {verifiedChogs.length===1?'Chog':'Chogs'}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {verifiedChogs.map(item=>{
                    const isSelected = item.tokenId===tokenId;
                    const isActive = item.tokenId===me.data.selectedChogTokenId;
                    return <article
                      key={item.tokenId}
                      className={`overflow-hidden rounded-[22px] border-2 bg-white transition ${isSelected?'border-[#8a63ff] shadow-[0_0_0_3px_#8a63ff1c]':'border-transparent'}`}
                      data-testid={`card-owned-chog-${item.tokenId}`}
                    >
                      <div className="relative aspect-square overflow-hidden bg-[#f4eddf]">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={`Chog #${item.tokenId}`} className="block h-full w-full object-contain object-center" data-testid={`img-owned-chog-${item.tokenId}`}/>
                          : <div className="grid h-full place-items-center bg-[#f7f2e9] px-5 text-center text-sm font-semibold text-[#81758a]" role="status">Real artwork is unavailable for Chog #{item.tokenId}.</div>}
                        {isActive && <span className="absolute right-3 top-3 rounded-full bg-[#7047ff] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-white" data-testid={`status-active-chog-${item.tokenId}`}>Active profile Chog</span>}
                      </div>
                      <div className="p-4 sm:p-5">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="display text-lg font-extrabold text-[#24133f]" data-testid={`text-owned-chog-token-id-${item.tokenId}`}>Chog #{item.tokenId}</h3>
                          <span className="shrink-0 text-[10px] font-semibold text-[#715795]" data-testid={`text-owned-chog-tier-${item.tokenId}`}>{item.tier ? `Tier: ${item.tier}` : 'Tier unavailable'}</span>
                        </div>
                        <button type="button" onClick={()=>chooseChog(item.tokenId)} disabled={selectActiveChog.isPending || isActive} aria-pressed={isSelected} className="mt-4 w-full rounded-full border border-[#e6ddf2] px-4 py-2.5 text-[10px] font-bold text-[#7047ff] transition hover:bg-[#f6f1ff] disabled:cursor-default disabled:opacity-60" data-testid={`button-select-owned-chog-${item.tokenId}`} aria-live="polite">
                          {me.data.hasProfile
                            ? isActive
                              ? 'Active profile Chog'
                              : selectActiveChog.isPending && selected===item.tokenId
                                ? 'Switching active Chog…'
                                : 'Set as active profile Chog'
                            : isSelected ? 'Selected for your profile' : 'Select Chog'}
                        </button>
                      </div>
                    </article>;
                  })}
                </div>
                {notice && <p className={`mt-5 rounded-xl px-4 py-3 text-xs ${notice.startsWith('Chog #')?'bg-[#eef8ea] text-[#447a43]':'bg-[#fff2ec] text-[#914c3c]'}`} role="status" data-testid="status-active-chog-change">{notice}</p>}
              </section>}
        </QueryState>
      </>}
    </QueryState>
  </div></AppShell>;
}

const tags = (text: string) => text.split(',').map(value=>value.trim()).filter(Boolean);
const joinTags = (values?: string[]) => values?.join(', ') || '';
const profileGenderOptions = ['Male', 'Female', 'Gay', 'Trans', 'Alien'] as const satisfies readonly NonNullable<Profile['gender']>[];
const profileLookingForOptions = ['Dating', 'Friendship', 'Networking', 'Collaboration', 'Other'] as const satisfies readonly Profile['lookingFor'][number][];

function profileGenderValue(value: string): Profile['gender'] {
  return profileGenderOptions.find(option=>option===value) ?? null;
}

function createLookingForValues(selected: string, other: string): Profile['lookingFor'] {
  void other;
  const values = tags(selected).filter(
    (value): value is Profile['lookingFor'][number] =>
      profileLookingForOptions.some(option=>option===value),
  );
  return [...new Set(values)];
}

type ProfilePreviewData = Pick<Profile, 'username' | 'displayName' | 'gender' | 'age' | 'bio' | 'interests' | 'hobbies' | 'languages' | 'lookingFor' | 'chog'> & { lookingForOther?: string | null };

function ProfilePreview({profile,testMode=false}:{profile:ProfilePreviewData;testMode?:boolean}) {
  const groups = [
    { label: 'Interests', values: profile.interests },
    { label: 'Hobbies', values: profile.hobbies },
    { label: 'Languages', values: profile.languages },
  ].filter(group => group.values.length > 0);
  return <>
    <style>{`
      .profile-preview-card{background:#fffaf8;border:1px solid rgba(116,66,89,.15);box-shadow:0 18px 45px rgba(79,43,64,.09)}
      .profile-artwork{display:flex;height:min(58dvh,440px);min-height:250px;align-items:center;justify-content:center}
      .profile-artwork img{transition:transform .7s cubic-bezier(.2,.75,.25,1)}
      .profile-preview-card:hover .profile-artwork img{transform:scale(1.025)}
      @media(prefers-reduced-motion:reduce){.profile-artwork img{transition:none}}
    `}</style>
    <section className="profile-preview-card mx-auto max-w-[520px] overflow-hidden rounded-[30px]" aria-label="Public profile preview" data-testid="profile-preview">
      <div className="profile-artwork relative overflow-hidden bg-[#eadde2]">
        <ChogArtwork chog={profile.chog} fit="contain"/>
        <div className="absolute inset-0 bg-gradient-to-t from-[#261529]/85 via-transparent to-transparent"/>
        <div className="absolute bottom-5 left-5 right-5 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.13em] backdrop-blur"><BadgeCheck size={12}/>{testMode ? 'Local preview' : 'Verified holder'}</span>
          <h2 className="display mt-3 break-words text-[34px] leading-none text-white sm:text-[42px]" data-testid="text-preview-display-name">{profile.displayName || 'Your name'}{profile.age !== null && <span className="ml-2 text-white/85">{profile.age}</span>}</h2>
          <p className="mt-2 text-sm font-medium text-white/80" data-testid="text-preview-username">@{profile.username || 'your-handle'}</p>
        </div>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-[#eee5e5] pb-3">
          <div><p className="text-[9px] font-bold uppercase tracking-[.17em] text-[#a35b79]">Chog Genesis</p><p className="display text-lg text-[#332037]" data-testid="text-preview-chog-id">#{profile.chog.tokenId} <span className="font-sans text-xs font-semibold normal-case tracking-normal text-[#8c7182]">{profile.chog.tier || 'Verified'}</span></p></div>
          {profile.gender && <span className="rounded-full bg-[#f7e9ee] px-3 py-1.5 text-[10px] font-bold text-[#984d67]">{profile.gender}</span>}
        </div>
        {profile.bio && <p className="whitespace-pre-line text-[13px] leading-6 text-[#685865]" data-testid="text-preview-bio">{profile.bio}</p>}
        <div className="flex flex-wrap gap-1.5">{groups.flatMap(group=>group.values.map((value,index)=><span key={`${group.label}-${value}-${index}`} className="rounded-full bg-[#f5edf1] px-3 py-1.5 text-[10px] font-semibold text-[#70566a]" data-testid={`tag-preview-${group.label.toLowerCase()}-${index}`}>{value}</span>))}{profile.lookingFor.map((value,index)=><span key={`${value}-${index}`} className="max-w-full whitespace-normal break-words rounded-full bg-[#f8e9e8] px-3 py-1.5 text-[10px] font-bold text-[#984d55]" data-testid={`tag-preview-looking-for-${index}`}>{value==='Other' && profile.lookingForOther?.trim()?`Other: ${profile.lookingForOther.trim()}`:value}</span>)}</div>
      </div>
    </section>
  </>;
}

function testProfilePreview(
  fields: ManualTestProfileFields,
  chog: Chog,
): ProfilePreviewData {
  return {
    username: fields.username,
    displayName: fields.displayName,
    gender: profileGenderValue(fields.gender),
    age: fields.age ? Number(fields.age) : null,
    bio: fields.bio || null,
    interests: tags(fields.interests),
    hobbies: tags(fields.hobbies),
    languages: tags(fields.languages),
    lookingFor: createLookingForValues(fields.lookingFor, fields.lookingForOther),
    lookingForOther: fields.lookingForOther || null,
    chog,
  };
}

function ManualTestProfilePage() {
  const [flow] = useState(readManualTestFlow);
  const [record, setRecord] = useState<ManualTestProfileRecord | null>(() =>
    flow?.selectedTokenId
      ? readManualTestProfile(flow.walletAddress, flow.selectedTokenId)
      : null,
  );
  const [notice, setNotice] = useState('');
  const ownership = useGetNftOwnership(flow?.walletAddress ?? '', {
    query: {
      enabled: Boolean(flow?.walletAddress && flow.selectedTokenId),
      queryKey: flow
        ? [
            ...getGetNftOwnershipQueryKey(flow.walletAddress),
            'manual-test-profile',
            flow.selectedTokenId,
          ]
        : ['manual-test-profile', 'no-selected-chog'],
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 0,
    },
  });
  const chog =
    ownership.data?.verified && flow
      ? ownership.data.chogs.find(
          (item) =>
            item.verified &&
            item.tokenId === flow.selectedTokenId &&
            item.ownerWallet.toLowerCase() === flow.walletAddress.toLowerCase(),
        ) ?? null
      : null;

  function updateField(key: keyof ManualTestProfileFields, value: string) {
    if (!record) return;
    const next = { ...record, draft: { ...record.draft, [key]: value } };
    setRecord(next);
    setNotice('');
    try {
      writeManualTestProfile(next);
    } catch {
      setNotice('This browser could not save the test draft locally.');
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    if (!record || !flow || !chog) {
      setNotice('The selected Chog could not be verified again. Return to the scan and choose a current Chog.');
      return;
    }
    const fields = record.draft;
    if (!fields.displayName.trim()) {
      setNotice('Add a display name to continue.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,24}$/.test(fields.username.trim())) {
      setNotice('Use a username with 2–24 letters, numbers, or underscores.');
      return;
    }
    const age = fields.age.trim() ? Number(fields.age) : null;
    if (age !== null && (!Number.isInteger(age) || age < 18 || age > 120)) {
      setNotice('Age must be a whole number from 18 to 120, or left blank.');
      return;
    }
    if (!tags(fields.lookingFor).length) {
      setNotice('Add at least one connection type under Looking For.');
      return;
    }
    const savedFields = { ...fields, displayName: fields.displayName.trim(), username: fields.username.trim() };
    const next = { ...record, draft: savedFields, saved: savedFields };
    try {
      writeManualTestProfile(next);
      setRecord(next);
      setNotice('Test profile saved in this browser.');
    } catch {
      setNotice('This browser could not save the test profile. Check browser storage settings and try again.');
    }
  }

  return <AppShell>
    <div className="page-enter">
      <PageTitle
        eyebrow="Read-only wallet test"
        title="Create your profile."
        description="Use the selected Chog to preview the existing profile flow. This test profile is not published."
        action={<Link href="/" className="button-soft inline-flex items-center rounded-full px-4 py-2.5 text-xs font-bold" data-testid="link-test-profile-back-to-scan">Back to scan</Link>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e7c98b] bg-[#fff8e8] px-4 py-3 text-xs leading-5 text-[#79521a]" data-testid="notice-test-profile-local-only">
        <span className="rounded-full bg-[#f5e5bb] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.12em]">TEST MODE</span>
        <span>Address-only ownership check. Not connected or authenticated; profile data is saved only in this browser and is not visible to other users.</span>
      </div>
      {!flow || !flow.selectedTokenId ? (
        <EmptyState
          title="Choose a Chog to continue."
          detail="Return to the wallet scan, scan a valid address, then select one of its verified Chogs."
          action={<Link href="/" className="button-primary inline-flex rounded-full px-5 py-3 text-xs font-bold">Return to scan</Link>}
        />
      ) : ownership.isLoading ? (
        <p className="surface rounded-2xl px-5 py-4 text-sm text-[#766a80]" role="status">Rechecking Chog ownership before opening the test profile…</p>
      ) : ownership.isError ? (
        <div className="surface rounded-2xl p-5" role="alert">
          <p className="text-sm text-[#914c3c]">The selected Chog could not be rechecked. No profile data was submitted.</p>
          <button type="button" onClick={() => void ownership.refetch()} className="button-primary mt-4 rounded-full px-5 py-3 text-xs font-bold">Try again</button>
        </div>
      ) : !chog ? (
        <EmptyState
          title="No Chog Found"
          detail="The selected token is no longer verified as owned by this address. Return to the scan and choose a current Chog."
          action={<Link href="/" className="button-primary inline-flex rounded-full px-5 py-3 text-xs font-bold">Return to scan</Link>}
        />
      ) : record ? (
        <div className="space-y-5">
          {record.saved && <ProfilePreview profile={testProfilePreview(record.saved, chog)} testMode />}
          <form id="edit-profile" onSubmit={save} className="grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_330px]">
            <section className="surface rounded-[28px] p-5 sm:p-8">
              <div className="mb-5">
                <Eyebrow>CREATE YOUR PROFILE · TEST MODE</Eyebrow>
                <h2 className="display mt-1 text-2xl font-extrabold text-[#24133f]">Tell them a little more.</h2>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Display name" value={record.draft.displayName} onChange={value=>updateField('displayName',value)} placeholder="How people will meet you" maxLength={48} testId="input-display-name"/>
                <Field label="Username" value={record.draft.username} onChange={value=>updateField('username',value.replace(/[^a-zA-Z0-9_]/g,''))} placeholder="Your public handle" maxLength={24} prefix="@" testId="input-username"/>
                <label><span className="mb-2 block text-xs font-bold text-[#5c5067]">Age <span className="font-normal text-[#958a9b]">(optional)</span></span><input className="field" type="number" min="18" max="120" step="1" inputMode="numeric" value={record.draft.age} onChange={event=>updateField('age',event.target.value)} placeholder="18+" data-testid="input-profile-age"/><span className="mt-1 block text-[10px] text-[#9b8fa0]">If entered, use a whole number from 18 to 120.</span></label>
                 <label><span className="mb-2 block text-xs font-bold text-[#5c5067]">Gender</span><select className="field" value={record.draft.gender} onChange={event=>updateField('gender',event.target.value)} data-testid="select-profile-gender"><option value="">Select gender</option>{profileGenderOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
                <label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[#5c5067]">Your introduction</span><textarea value={record.draft.bio} onChange={event=>updateField('bio',event.target.value)} maxLength={500} rows={4} className="field resize-y" placeholder="A little about what lights you up…" data-testid="input-bio"/><span className="mt-1 block text-right text-[10px] text-[#9c91a1]">{record.draft.bio.length}/500</span></label>
                <TagField label="Interests" value={record.draft.interests} onChange={value=>updateField('interests',value)} placeholder="Art, climbing, long reads" testId="input-interests"/>
                <TagField label="Hobbies" value={record.draft.hobbies} onChange={value=>updateField('hobbies',value)} placeholder="Hiking, cooking, photography" testId="input-hobbies"/>
                <TagField label="Languages" value={record.draft.languages} onChange={value=>updateField('languages',value)} placeholder="English, Hindi, Spanish" testId="input-languages"/>
                 <fieldset className="sm:col-span-2"><legend className="mb-2 text-xs font-bold text-[#5c5067]">Looking For</legend><div className="flex flex-wrap gap-2">{profileLookingForOptions.map(option=><button type="button" key={option} aria-pressed={tags(record.draft.lookingFor).includes(option)} onClick={()=>{const selected=tags(record.draft.lookingFor);updateField('lookingFor',[...selected.filter(value=>value!==option),...(selected.includes(option)?[]:[option])].join(', '));}} className={`profile-visibility-choice px-3 ${tags(record.draft.lookingFor).includes(option)?'is-selected':''}`} data-testid={`button-test-looking-for-${option.toLowerCase()}`}>{option}</button>)}</div>{tags(record.draft.lookingFor).includes('Other')&&<Field label="Your option" value={record.draft.lookingForOther} onChange={value=>updateField('lookingForOther',value)} placeholder="Type your own option" maxLength={50} testId="input-test-looking-for-other"/>}</fieldset>
              </div>
              {notice && <p className={`mt-5 rounded-2xl px-4 py-3 text-sm ${notice.startsWith('Test profile saved')?'bg-[#eef8ea] text-[#447a43]':'bg-[#fff2ec] text-[#914c3c]'}`} role="status" data-testid="status-profile-save">{notice}</p>}
              <div className="mt-6 flex flex-col-reverse justify-between gap-4 border-t border-[#24133f10] pt-5 sm:flex-row sm:items-center">
                <p className="text-xs leading-5 text-[#908498]">This creates a local test preview only. It does not create an account, connect the scanned address, or publish your profile.</p>
                <button type="submit" className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold" data-testid="button-save-profile"><Save size={16}/>Save profile</button>
              </div>
            </section>
            <aside className="surface h-fit rounded-[28px] p-5 sm:p-6">
              <Eyebrow>Selected test NFT</Eyebrow>
              <h2 className="display mt-1 text-2xl font-extrabold text-[#24133f]">Chog #{chog.tokenId}</h2>
              <div className="mt-4 aspect-square overflow-hidden rounded-2xl bg-[#f4eddf]"><ChogArtwork chog={chog} fit="contain"/></div>
               <p className="mt-3 text-[11px] leading-5 text-[#998ea0]">This address scan is a local-only preview. Ownership verification does not prove control of the wallet, create a signed-in account, or publish profile details.</p>
            </aside>
          </form>
        </div>
      ) : null}
    </div>
  </AppShell>;
}

export function ProfilePage() {
  return <ConnectedProfilePage />;
}

type ConnectedProfileFormValues = {
  username: string;
  displayName: string;
  gender: string;
  age: string;
  bio: string;
  interests: string;
  hobbies: string;
  languages: string;
  lookingFor: string;
  lookingForOther: string;
  selectedChogTokenId: string;
  profileVisible: boolean | null;
};

const emptyConnectedProfile: ConnectedProfileFormValues = {
  username: '',
  displayName: '',
  gender: '',
  age: '',
  bio: '',
  interests: '',
  hobbies: '',
  languages: '',
  lookingFor: '',
  lookingForOther: '',
  selectedChogTokenId: '',
  profileVisible: null,
};

function lookingForFormValues(values: string[]) {
  return {
    lookingFor: values.filter(value=>profileLookingForOptions.includes(value as typeof profileLookingForOptions[number])).join(', '),
    lookingForOther: '',
  };
}

function connectedProfileFormValues(
  profile: Profile,
  selectedChogTokenId: string | null | undefined,
  profileVisible: boolean | null | undefined,
): ConnectedProfileFormValues {
  return {
    username: profile.username,
    displayName: profile.displayName,
    gender: profile.gender || '',
    age: profile.age === null ? '' : String(profile.age),
    bio: profile.bio || '',
    interests: joinTags(profile.interests),
    hobbies: joinTags(profile.hobbies),
    languages: joinTags(profile.languages),
    ...lookingForFormValues(profile.lookingFor),
    lookingForOther: profile.lookingForOther || '',
    selectedChogTokenId: selectedChogTokenId || profile.chog.tokenId,
    profileVisible: profileVisible ?? null,
  };
}

function ConnectedProfilePage() {
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), refetchOnWindowFocus: true } });
  const profile = me.data?.profile;
  const form = useForm<ConnectedProfileFormValues>({ defaultValues: emptyConnectedProfile });
  const { reset, setValue, watch, getValues } = form;
  const {
    username,
    displayName,
    gender,
    age,
    bio,
    interests,
    hobbies,
    languages,
    lookingFor,
    lookingForOther,
    selectedChogTokenId,
  } = watch();
  const [notice,setNotice] = useState('');
  const [editOpen,setEditOpen] = useState(false);
  const [initializedWalletAddress,setInitializedWalletAddress] = useState('');
  const [usernameError,setUsernameError] = useState('');
  useEffect(()=>{
    if(!me.data || initializedWalletAddress.toLowerCase()===me.data.walletAddress.toLowerCase()) return;
    if(profile) {
      reset(connectedProfileFormValues(profile, me.data.selectedChogTokenId, me.data.profileVisible));
    } else {
      const requestedTokenId = new URLSearchParams(window.location.search).get('chog');
      const requestedChog = me.data.chogs.find(chog=>chog.verified && chog.tokenId===requestedTokenId);
      reset({
        ...emptyConnectedProfile,
        selectedChogTokenId: requestedChog?.tokenId || '',
        profileVisible: true,
      });
    }
    setUsernameError('');
    setNotice('');
    setInitializedWalletAddress(me.data.walletAddress);
  },[profile,me.data,initializedWalletAddress,reset]);
  const update = useUpdateMeProfile();
  const selectActiveChog = useSelectActiveChog();
  const qc = useQueryClient();
  function openEditProfile() {
    if (!profile || !me.data) return;
    reset(connectedProfileFormValues(profile, me.data.selectedChogTokenId, me.data.profileVisible));
    setUsernameError('');
    setNotice('');
    setEditOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setNotice('');
    const values = getValues();
    const cleanUsername = values.username.trim();
    if (!/^[a-zA-Z0-9_]{2,24}$/.test(cleanUsername)) {
      setUsernameError('Use 2–24 letters, numbers, or underscores.');
      setNotice('Check the highlighted username before saving.');
      return;
    }
    setUsernameError('');
    if (!values.displayName.trim()) { setNotice('Add a display name to continue.'); return; }
    const selectedLookingFor = tags(values.lookingFor);
    if (selectedLookingFor.includes('Other') && !values.lookingForOther.trim()) {
      setNotice('Add your own option for “Other” to continue.');
      return;
    }
    const lookingForValues = createLookingForValues(values.lookingFor, values.lookingForOther);
    if (!lookingForValues.length) { setNotice('Choose at least one option for what you’re looking for.'); return; }
    const tokenIdForSave = profile
      ? me.data?.selectedChogTokenId || profile.chog.tokenId
      : values.selectedChogTokenId;
    if (!tokenIdForSave) { setNotice('Choose a verified Chog to show on your profile.'); return; }
    const numericAge = values.age.trim() ? Number(values.age) : null;
    if (numericAge !== null && (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 120)) { setNotice('Use a whole-number age from 18 to 120.'); return; }
    const data: ProfileInput = {
      username: cleanUsername,
      displayName: values.displayName.trim(),
      gender: profileGenderValue(values.gender),
      age: numericAge,
      bio: values.bio || null,
      interests: tags(values.interests),
      hobbies: tags(values.hobbies),
      languages: tags(values.languages),
      lookingFor: lookingForValues,
      lookingForOther: values.lookingFor.includes('Other') ? values.lookingForOther.trim() : '',
      selectedChogTokenId: tokenIdForSave,
      profileVisible: values.profileVisible ?? true,
    };
    try {
      const saved = await update.mutateAsync({data});
      reset(connectedProfileFormValues(saved, saved.chog.tokenId, values.profileVisible));
      await qc.invalidateQueries({queryKey:getGetMeQueryKey()});
      setEditOpen(false);
      setNotice(profile ? 'Your profile changes have been saved.' : 'Your profile is saved. This is how other Chog holders will meet you.');
    }
    catch (error) {
      const apiMessage = error && typeof error === 'object' && 'data' in error
        ? (error as { data?: unknown }).data
        : null;
      const message = apiMessage && typeof apiMessage === 'object' && 'error' in apiMessage
        && typeof (apiMessage as { error?: unknown }).error === 'string'
        ? (apiMessage as { error: string }).error
        : 'Your profile couldn’t be saved. Check your connection and try again.';
      setNotice(message);
    }
  }
  async function switchActiveChog() {
    setNotice('');
    const walletAddress = me.data?.walletAddress;
    const chosen = me.data?.chogs.find(chog=>chog.verified && chog.tokenId===selectedChogTokenId);
    if (!profile || !walletAddress || !chosen || chosen.tokenId===me.data?.selectedChogTokenId) return;
    try {
      await selectActiveChog.mutateAsync({data:{tokenId:chosen.tokenId}});
      await Promise.all([
        qc.invalidateQueries({queryKey:getGetMeQueryKey()}),
        qc.invalidateQueries({queryKey:getGetNftOwnershipQueryKey(walletAddress)}),
      ]);
      setNotice(`Chog #${chosen.tokenId} is now active. Your profile details were unchanged.`);
    } catch {
      setNotice('Couldn’t switch your active Chog. Ownership may have changed; refresh and try again.');
    }
  }
  function toggleLookingForOption(option: typeof profileLookingForOptions[number]) {
    const selected = tags(lookingFor);
    const next = selected.includes(option)
      ? selected.filter(value=>value!==option)
      : [...selected, option];
    setValue('lookingFor', next.join(', '), {shouldDirty:true});
    if (option==='Other' && selected.includes(option)) setValue('lookingForOther', '', {shouldDirty:true});
  }
  const selectedChog = me.data?.chogs.find(chog=>chog.verified && chog.tokenId===selectedChogTokenId) || profile?.chog;
  const draftPreview: ProfilePreviewData | null = selectedChog ? {
    username, displayName, gender:profileGenderValue(gender), age:age.trim()?Number(age):null,
    bio:bio||null, interests:tags(interests), hobbies:tags(hobbies), languages:tags(languages),
    lookingFor:createLookingForValues(lookingFor,lookingForOther), lookingForOther:lookingForOther||null, chog:selectedChog,
  } : null;
  return <AppShell displayName={profile?.displayName}><div className="page-enter">
    <style>{`
      .profile-page-heading{position:relative;border:1px solid rgba(168,83,112,.18);background:linear-gradient(115deg,rgba(255,246,244,.98),rgba(255,249,241,.98) 62%,rgba(248,234,238,.98));box-shadow:0 15px 36px rgba(92,49,67,.07)}
      .profile-page-heading:after{content:"";position:absolute;z-index:0;right:-58px;top:-120px;width:320px;height:320px;border:1px solid rgba(178,91,124,.16);border-radius:50%;pointer-events:none;box-shadow:0 0 0 28px rgba(178,91,124,.035),0 0 0 58px rgba(178,91,124,.025)}
      .profile-page-heading>*{position:relative;z-index:1}
      .profile-form-panel,.profile-side-panel{position:relative;border:1px solid rgba(133,82,104,.16);background:rgba(255,251,248,.96);box-shadow:0 13px 35px rgba(79,43,64,.065)}
      .profile-section-index{display:grid;width:29px;height:29px;flex:none;place-items:center;border:1px solid #ead4dc;border-radius:50%;background:#fbf1f2;color:#a34d70;font:700 9px var(--app-font-mono)}
      .profile-field-label{display:block;margin-bottom:8px;color:#594a58;font-size:11px;font-weight:700}
      .profile-field-prefix{position:absolute;left:13px;top:12px;color:#a38d99}
      .profile-chog-choice{border:1px solid #eadddf;background:#fffaf8;transition:transform .2s,border-color .2s,box-shadow .2s}
      .profile-chog-choice:hover{transform:translateY(-2px);border-color:#c78da0}
      .profile-chog-choice.is-selected{border-color:#ad5275;box-shadow:0 0 0 3px rgba(173,82,117,.12)}
      .profile-visibility-choice{display:flex;min-height:44px;align-items:center;justify-content:center;gap:6px;border:1px solid #e7dadd;border-radius:12px;background:#fffaf8;padding:8px;color:#766776;font-size:10px;font-weight:700;transition:background .2s,border-color .2s,color .2s}
      .profile-visibility-choice:hover{border-color:#c78da0}
      .profile-visibility-choice.is-selected{border-color:#ad5275;background:#f8e9ee;color:#984567}
      .profile-chog-choice:focus-visible,.profile-visibility-choice:focus-visible,.profile-form-panel button:focus-visible{outline:2px solid #a8436a;outline-offset:3px}
      @media(max-width:639px){.profile-page-heading:after{right:-180px;opacity:.55}}
    `}</style>
    {!profile && <div className="profile-page-heading mb-7 overflow-hidden rounded-[30px] px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#9d4b6b]"><span className="h-1.5 w-1.5 rounded-full bg-[#bf5678]"/>Your introduction to the community</div>
          <h1 className="display text-[42px] leading-[.92] text-[#38253a] sm:text-[58px]" data-testid="heading-page">Let’s meet.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#756575]">Your verified Chog gets you in the room. Add the details that help the right people find their way to you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#edit-profile" className="button-primary inline-flex items-center rounded-full px-4 py-2.5 text-xs font-bold" data-testid="link-edit-profile">Start your profile</a>
          <Link href="/my-chog" className="button-soft inline-flex items-center rounded-full px-4 py-2.5 text-xs font-bold" data-testid="link-profile-my-chog">My Chogs</Link>
          <Link href="/settings" className="button-soft inline-flex items-center rounded-full px-4 py-2.5 text-xs font-bold" data-testid="link-profile-settings">Settings</Link>
        </div>
      </div>
      {!profile && <div className="mt-7 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3" aria-label="Profile setup steps">
        {[['01','Your story'],['02','Your people'],['03','Your visibility']].map(([step,label],index)=><div key={step} className="flex items-center gap-2.5 border-t border-[#cf9bad]/40 pt-3">
          <span className={`font-mono text-[9px] font-bold ${index===0?'text-[#b04770]':'text-[#ad9ba5]'}`}>{step}</span><span className="text-[10px] font-semibold text-[#776575] sm:text-[11px]">{label}</span>
        </div>)}
      </div>}
    </div>}
    <QueryState loading={me.isLoading} error={me.isError} retry={()=>void me.refetch()}>
      {!me.data ? <EmptyState title="Connect to create your profile." detail="Sign in with the wallet holding your Chog Genesis NFT to get started."/> :
       (!me.data.hasChog || !me.data.chogs.some(chog=>chog.verified)) ? <EmptyState title="No Chog Found" detail="A Chog NFT is required to create a CHOG MATE profile. Connect the wallet that owns a Chog NFT to continue."/> :
       (me.data.hasProfile && !profile) ? <EmptyState title="Choose an active Chog." detail="Your previous active Chog is no longer in this wallet. Choose another verified Chog to restore your profile; your saved details will stay unchanged." action={<Link href="/my-chog" className="button-primary inline-flex rounded-full px-5 py-3 text-xs font-bold" data-testid="link-restore-active-chog">Choose a Chog</Link>}/> :
          <div className={profile ? 'my-profile-page' : 'space-y-6'}>
           <div
             className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs leading-5 ${
               me.data.identityMode === 'address_only'
                 ? 'border-[#ead8ce] bg-[#fff8f1] text-[#755247]'
                 : 'border-[#cfe2cb] bg-[#eef8ea] text-[#447a43]'
              } ${profile ? 'my-profile-identity-status' : ''}`}
             role="status"
             data-testid="status-profile-identity"
           >
             <BadgeCheck size={16} className="mt-0.5 shrink-0" />
             <span>
               {me.data.identityMode === 'address_only'
                 ? 'NFT ownership is verified, but this wallet is not connected. Address-only accounts can use social features but cannot send blockchain transactions. This does not prove control of the address.'
                 : 'Wallet connected and signature verified. Blockchain transactions still require your wallet to approve each transaction.'}
             </span>
           </div>
         {profile ? <>
            {notice && <p className="my-profile-save-notice" role="status" data-testid="status-profile-save">{notice}</p>}
            <MyProfileExperience profile={profile} onEdit={openEditProfile}/>
           <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="surface max-h-[92dvh] max-w-2xl overflow-y-auto rounded-[28px] border-[#e8dfd5] bg-[#fffaf6] p-5 sm:p-7">
               <DialogHeader className="pr-8 text-left">
                 <DialogTitle className="display text-2xl font-extrabold text-[#38253a]">Edit Profile</DialogTitle>
                 <DialogDescription className="text-sm leading-6 text-[#756575]">Update your profile details. Your verified Chog identity stays unchanged.</DialogDescription>
               </DialogHeader>
                <form onSubmit={save} className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-[#eadde2] bg-[#fff6f4] p-3" aria-label={`Selected verified Chog ${profile.chog.tokenId}`} data-testid="card-edit-selected-chog">
                      <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-[#f2e6eb]" role="img" aria-label={`Artwork for Chog #${profile.chog.tokenId}`}><ChogArtwork chog={profile.chog} fit="contain"/></div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#a35b79]">Your verified Chog</p>
                      <p className="display mt-1 text-lg text-[#38253a]">Chog #{profile.chog.tokenId}</p>
                      <p className="text-[10px] text-[#897985]">{profile.chog.tier || 'Genesis'}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label><span className="profile-field-label">Name <span className="text-[#b45a78]">*</span></span><input className="field" value={displayName} onChange={event=>setValue('displayName',event.target.value,{shouldDirty:true})} placeholder="How people will meet you" maxLength={48} required data-testid="input-edit-display-name"/></label>
                   <label><span className="profile-field-label">Username <span className="text-[#b45a78]">*</span></span><span className="relative block"><span className="profile-field-prefix">@</span><input className={`field pl-8 ${usernameError?'!border-[#c65861]':''}`} value={username} onChange={event=>{setValue('username',event.target.value.replace(/[^a-zA-Z0-9_]/g,''),{shouldDirty:true});setUsernameError('');}} placeholder="Your public handle" maxLength={24} minLength={2} required aria-invalid={Boolean(usernameError)} aria-describedby={usernameError?'edit-username-help':'edit-username-format'} data-testid="input-edit-username"/></span><span id={usernameError?'edit-username-help':'edit-username-format'} className={`mt-1.5 block text-[10px] ${usernameError?'text-[#aa4848]':'text-[#978692]'}`}>{usernameError || '2–24 letters, numbers, or underscores.'}</span></label>
                    <label><span className="profile-field-label">Age <span className="font-normal text-[#958a9b]">(optional)</span></span><input className="field" type="number" min="18" max="120" step="1" inputMode="numeric" value={age} onChange={event=>setValue('age',event.target.value,{shouldDirty:true})} placeholder="18+" data-testid="input-edit-profile-age"/><span className="mt-1.5 block text-[10px] leading-4 text-[#978692]">Whole number, 18 to 120.</span></label>
                    <label><span className="profile-field-label">Gender</span><select className="field" value={gender} onChange={event=>setValue('gender',event.target.value,{shouldDirty:true})} data-testid="select-edit-gender"><option value="">Select gender</option>{profileGenderOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
                    <label className="sm:col-span-2"><span className="profile-field-label">About</span><textarea value={bio} onChange={event=>setValue('bio',event.target.value,{shouldDirty:true})} maxLength={500} rows={3} className="field resize-y" placeholder="What are you curious about lately? What do you love talking about?" data-testid="input-edit-bio"/><span className="mt-1.5 block text-right text-[10px] text-[#978692]">{bio.length}/500</span></label>
                   <TagField label="Interests" value={interests} onChange={value=>setValue('interests',value,{shouldDirty:true})} placeholder="Art, climbing, long reads" testId="input-edit-interests"/>
                   <TagField label="Hobbies" value={hobbies} onChange={value=>setValue('hobbies',value,{shouldDirty:true})} placeholder="Hiking, cooking, photography" testId="input-edit-hobbies"/>
                   <TagField label="Languages" value={languages} onChange={value=>setValue('languages',value,{shouldDirty:true})} placeholder="English, Hindi, Spanish" testId="input-edit-languages"/>
                    <fieldset className="sm:col-span-2">
                     <legend className="profile-field-label">Looking For <span className="text-[#b45a78]">*</span></legend>
                     <p className="mb-3 text-[10px] leading-4 text-[#978692]">Choose one or more.</p>
                     <div className="flex flex-wrap gap-2">
                       {profileLookingForOptions.map(option=><button key={option} type="button" aria-pressed={tags(lookingFor).includes(option)} onClick={()=>toggleLookingForOption(option)} className={`profile-visibility-choice min-h-10 px-4 ${tags(lookingFor).includes(option)?'is-selected':''}`} data-testid={`button-edit-looking-for-${option.toLowerCase()}`}>{option}</button>)}
                     </div>
                     {tags(lookingFor).includes('Other') && <label className="mt-3 block"><span className="profile-field-label">Your option <span className="text-[#b45a78]">*</span></span><input className="field" value={lookingForOther} onChange={event=>setValue('lookingForOther',event.target.value,{shouldDirty:true})} placeholder="Type your own option" maxLength={100} required data-testid="input-edit-looking-for-other"/></label>}
                   </fieldset>
                 </div>
                 {notice && <p className="rounded-2xl border border-[#ebc9c5] bg-[#fff1ed] px-4 py-3 text-sm text-[#914c3c]" role="alert" data-testid="status-profile-edit-error">{notice}</p>}
                  <div className="flex flex-col-reverse gap-3 border-t border-[#eadde2] pt-4 sm:flex-row sm:justify-end">
                   <button type="button" onClick={()=>setEditOpen(false)} className="button-soft rounded-full px-5 py-3 text-sm font-bold" data-testid="button-cancel-profile-edit">Cancel</button>
                   <button type="submit" disabled={update.isPending} className="button-primary rounded-full px-5 py-3 text-sm font-bold disabled:opacity-50" data-testid="button-save-profile-changes">{update.isPending?'Saving…':'Save Changes'}</button>
                 </div>
               </form>
             </DialogContent>
           </Dialog>
         </> : <>
         {draftPreview && <ProfilePreview profile={draftPreview}/>}
         {!draftPreview && <div className="surface flex items-center gap-3 rounded-2xl px-4 py-3 text-xs text-[#776575]" role="status"><ShieldCheck size={17} className="shrink-0 text-[#9d4b6b]"/>Choose one of your verified Chogs to see your profile preview.</div>}
          <Form {...form}>
          <form id="edit-profile" onSubmit={save} className="grid scroll-mt-24 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
           <section className="profile-form-panel rounded-[28px] p-5 sm:p-8">
             <div className="mb-7 flex items-start justify-between gap-4 border-b border-[#eadde2] pb-5">
               <div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#a35b79]">{profile?'Profile details':'First, the basics'}</p><h2 className="display mt-1 text-[28px] text-[#38253a]">{profile?'Refine your introduction.':'Start with what feels like you.'}</h2></div>
               <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f7e9ed] text-[#ac4c70] sm:grid"><Sparkles size={18}/></span>
             </div>
               <div className="grid gap-4 sm:grid-cols-2">
                 <label><span className="profile-field-label">Name <span className="text-[#b45a78]">*</span></span><input className="field" value={displayName} onChange={event=>setValue('displayName',event.target.value,{shouldDirty:true})} placeholder="How people will meet you" maxLength={48} required data-testid="input-display-name"/></label>
                 <label><span className="profile-field-label">Username <span className="text-[#b45a78]">*</span></span><span className="relative block"><span className="profile-field-prefix">@</span><input className={`field pl-8 ${usernameError?'!border-[#c65861]':''}`} value={username} onChange={event=>{setValue('username',event.target.value.replace(/[^a-zA-Z0-9_]/g,''),{shouldDirty:true});setUsernameError('');}} placeholder="Your public handle" maxLength={24} minLength={2} required aria-invalid={Boolean(usernameError)} aria-describedby={usernameError?'username-help':'username-format'} data-testid="input-username"/></span><span id={usernameError?'username-help':'username-format'} className={`mt-1.5 block text-[10px] ${usernameError?'text-[#aa4848]':'text-[#978692]'}`}>{usernameError || '2–24 letters, numbers, or underscores.'}</span></label>
                 <label><span className="profile-field-label">Age <span className="font-normal text-[#958a9b]">(optional)</span></span><input className="field" type="number" min="18" max="120" step="1" inputMode="numeric" value={age} onChange={event=>setValue('age',event.target.value,{shouldDirty:true})} placeholder="18+" data-testid="input-profile-age"/></label>
                 <label><span className="profile-field-label">Gender</span><select className="field" value={gender} onChange={event=>setValue('gender',event.target.value,{shouldDirty:true})} data-testid="select-profile-gender"><option value="">Select gender</option>{profileGenderOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
                 <label className="sm:col-span-2"><span className="profile-field-label">About</span><textarea value={bio} onChange={event=>setValue('bio',event.target.value,{shouldDirty:true})} maxLength={500} rows={3} className="field resize-y" placeholder="What are you curious about lately?" data-testid="input-bio"/><span className="mt-1.5 block text-right text-[10px] text-[#978692]">{bio.length}/500</span></label>
                 <TagField label="Interests" value={interests} onChange={value=>setValue('interests',value,{shouldDirty:true})} placeholder="Art, climbing, long reads" testId="input-interests"/>
                 <TagField label="Hobbies" value={hobbies} onChange={value=>setValue('hobbies',value,{shouldDirty:true})} placeholder="Hiking, cooking, photography" testId="input-hobbies"/>
                 <TagField label="Languages" value={languages} onChange={value=>setValue('languages',value,{shouldDirty:true})} placeholder="English, Hindi, Spanish" testId="input-languages"/>
                 <fieldset className="sm:col-span-2"><legend className="profile-field-label">Looking For <span className="text-[#b45a78]">*</span></legend><p className="mb-3 text-[10px] leading-4 text-[#978692]">Choose one or more.</p><div className="flex flex-wrap gap-2">{profileLookingForOptions.map(option=><button key={option} type="button" aria-pressed={tags(lookingFor).includes(option)} onClick={()=>toggleLookingForOption(option)} className={`profile-visibility-choice min-h-10 px-4 ${tags(lookingFor).includes(option)?'is-selected':''}`} data-testid={`button-looking-for-${option.toLowerCase()}`}>{option}</button>)}</div>{tags(lookingFor).includes('Other') && <label className="mt-3 block"><span className="profile-field-label">Your option <span className="text-[#b45a78]">*</span></span><input className="field" value={lookingForOther} onChange={event=>setValue('lookingForOther',event.target.value,{shouldDirty:true})} placeholder="Type your own option" maxLength={50} required data-testid="input-looking-for-other"/></label>}</fieldset>
               </div>
             {notice && <p className={`mt-6 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm leading-5 ${notice.startsWith('Your profile is saved')?'border border-[#bed8c0] bg-[#edf6ec] text-[#3d7048]':'border border-[#ebc9c5] bg-[#fff1ed] text-[#914c3c]'}`} role="status" data-testid="status-profile-save"><span className="mt-0.5"><Check size={15}/></span>{notice}</p>}
             <div className="mt-7 flex flex-col-reverse justify-between gap-4 border-t border-[#eadde2] pt-5 sm:flex-row sm:items-center">
               <p className="max-w-xs text-[10px] leading-5 text-[#958692]">Your wallet, verified ownership, and token ID are protected and can’t be edited here.</p>
               <button type="submit" disabled={update.isPending} className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold disabled:opacity-50" data-testid="button-save-profile"><Save size={16}/>{update.isPending?'Saving your profile…':'Save profile'}</button>
             </div>
           </section>
           <aside className="profile-side-panel h-fit rounded-[28px] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[9px] font-bold uppercase tracking-[.17em] text-[#a35b79]">Your verified collection</p><h2 className="display mt-1 text-[25px] text-[#38253a]">{profile?'Active Chog':'Choose your Chog'}</h2></div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f6e9ee] text-[#a64b70]"><BadgeCheck size={17}/></span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#897985]">{profile?'Choose which verified Chog represents you.':'Select the verified NFT you want on your profile.'}</p>
              <label className="mt-4 block"><span className="profile-field-label">Selected Chog</span><select className="field" value={selectedChogTokenId} onChange={event=>setValue('selectedChogTokenId',event.target.value,{shouldDirty:true})} data-testid="select-profile-chog">{me.data.chogs.filter(chog=>chog.verified).map(chog=><option key={chog.tokenId} value={chog.tokenId}>Chog #{chog.tokenId}{chog.tier?` · ${chog.tier}`:''}</option>)}</select></label>
                 {selectedChog && <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#eadde2] bg-[#fffaf8] p-3" data-testid="card-selected-chog-preview"><div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f2e6eb]"><ChogArtwork chog={selectedChog} fit="contain"/></div><div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#a35b79]">Profile identity</p><p className="display mt-1 text-base text-[#38253a]">Chog #{selectedChog.tokenId}</p><p className="text-[10px] text-[#897985]">{selectedChog.tier || 'Genesis'}</p></div></div>}
              {profile ? <div className="mt-4 border-t border-[#eadde2] pt-4"><p className="text-[10px] leading-5 text-[#897985]">Switching changes only your active Chog identity. Your profile details stay exactly as they are.</p><button type="button" onClick={()=>void switchActiveChog()} disabled={selectActiveChog.isPending || !selectedChogTokenId || selectedChogTokenId===me.data.selectedChogTokenId} className="button-primary mt-3 w-full rounded-full px-4 py-3 text-xs font-bold disabled:opacity-50" data-testid="button-set-active-chog">{selectActiveChog.isPending?'Revalidating ownership…':selectedChogTokenId===me.data.selectedChogTokenId?'Active Chog':'Make active Chog'}</button></div> : <p className="mt-3 text-[10px] leading-5 text-[#897985]">Your selected Chog becomes your active profile identity when you save.</p>}
            {profile && <div className="mt-5 border-t border-[#eadde2] pt-4">
                <p className="mb-2 text-xs font-bold text-[#493b4d]">Profile visibility</p>
                <p className="text-[10px] leading-5 text-[#978692]">Profiles appear in Explore unless either person has blocked the other. Blocked users are managed in <Link href="/settings" className="font-bold text-[#a34d70]" data-testid="link-profile-visibility-settings">Settings</Link>.</p>
              </div>}
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#f8f0ee] px-3 py-2.5 text-[9px] leading-4 text-[#806f7c]"><LockKeyhole size={13} className="mt-0.5 shrink-0 text-[#9b5670]"/>Only your profile details are shared. Wallet credentials are never displayed.</div>
           </aside>
          </form>
          </Form>
         </>}
        </div>}
    </QueryState>
  </div></AppShell>;
}

function MyProfileExperience({profile,onEdit}:{profile:Profile;onEdit:()=>void}) {
  const groups = [
    {label:'Interests',values:profile.interests},
    {label:'Hobbies',values:profile.hobbies},
    {label:'Languages',values:profile.languages},
  ].filter(group=>group.values.length>0);

  const tier = profile.chog.tier || 'Genesis';

  return <MotionConfig reducedMotion="user">
    <section className="my-profile-experience" aria-label="My complete profile" data-testid="my-profile-card">
      <header className="my-profile-page-heading">
        <div className="my-profile-heading-copy">
          <p className="my-profile-eyebrow"><Sparkles size={13}/>Your Chog Mate profile</p>
          <h1 data-testid="heading-page">My profile</h1>
          <p className="my-profile-heading-subtitle">Your introduction to the Chog community.</p>
        </div>
        <div className="my-profile-heading-actions">
          <motion.button
            type="button"
            onClick={onEdit}
            className="my-profile-action my-profile-action-primary"
            data-testid="button-edit-profile"
            whileHover={{y:-2}}
            whileTap={{scale:.97}}
            transition={{duration:.18}}
          >
            <PencilLine size={14}/>Edit Profile
          </motion.button>
          <Link href="/my-chog" className="my-profile-action my-profile-action-secondary" data-testid="link-profile-my-chog"><ImageIcon size={13}/>My Chogs</Link>
          <Link href="/settings" className="my-profile-action my-profile-action-secondary" data-testid="link-profile-settings"><Settings2 size={13}/>Settings</Link>
        </div>
      </header>

      <motion.section
        className="my-profile-hero"
        aria-label="Profile introduction"
        initial={{opacity:0,y:14}}
        animate={{opacity:1,y:0}}
        transition={{duration:.48,ease:'easeOut'}}
      >
        <motion.div
          className="my-profile-hero-artwork"
          initial={{opacity:0,scale:.97}}
          animate={{opacity:1,scale:1}}
          transition={{duration:.56,delay:.08,ease:'easeOut'}}
        >
          <ChogArtwork chog={profile.chog} fit="natural" className="my-profile-hero-image"/>
          <span className="my-profile-art-caption"><span/>The Chog that is you</span>
        </motion.div>

        <div className="my-profile-hero-copy">
          <span className="my-profile-verified"><BadgeCheck size={13}/>Verified Chog {tier}</span>
          <h2 data-testid="text-profile-display-name">
            {profile.displayName}
            {profile.age !== null && <span className="my-profile-age">, {profile.age}</span>}
          </h2>
          <p className="my-profile-username" data-testid="text-profile-username">@{profile.username}</p>
          <div className="my-profile-hero-rule"/>
          <p className="my-profile-hero-label">Your Chog identity</p>
          <p className="my-profile-hero-token" data-testid="text-profile-token-id">
            Chog #{profile.chog.tokenId}<span>·</span><span data-testid="text-profile-chog-tier">{tier}</span>
          </p>
          <div className="my-profile-hero-footer">
            {profile.gender && <span className="my-profile-gender" data-testid="text-profile-gender">{profile.gender}</span>}
          </div>
        </div>
      </motion.section>

      <div className="my-profile-information-grid">
        {profile.bio?.trim() && <motion.section
          className="my-profile-info-card my-profile-about"
          aria-label="About"
          initial={{opacity:0,y:9}}
          animate={{opacity:1,y:0}}
          transition={{duration:.34,delay:.16,ease:'easeOut'}}
        >
          <h3 className="my-profile-section-label"><span/>About</h3>
          <p className="my-profile-about-copy" data-testid="text-profile-introduction">{profile.bio}</p>
        </motion.section>}

        {groups.map((group,index)=><motion.section
          className="my-profile-info-card my-profile-info-group"
          key={group.label}
          aria-label={group.label}
          initial={{opacity:0,y:9}}
          animate={{opacity:1,y:0}}
          transition={{duration:.34,delay:.22+index*.06,ease:'easeOut'}}
        >
          <h3 className="my-profile-section-label"><span/>{group.label}</h3>
          <div className="my-profile-tags">
            {group.values.map((value,index)=><span className="my-profile-tag" key={`${value}-${index}`}>{value}</span>)}
          </div>
        </motion.section>)}

        {profile.lookingFor.length>0 && <motion.section
          className="my-profile-info-card my-profile-looking-for"
          aria-label="Looking for"
          initial={{opacity:0,y:9}}
          animate={{opacity:1,y:0}}
          transition={{duration:.34,delay:.38,ease:'easeOut'}}
        >
          <h3 className="my-profile-section-label"><span/>Looking For</h3>
          <div className="my-profile-tags">
            {profile.lookingFor.map((value,index)=><span className="my-profile-tag my-profile-tag-looking" key={`${value}-${index}`}>
              {value==='Other' && profile.lookingForOther?.trim() ? `Other: ${profile.lookingForOther.trim()}` : value}
            </span>)}
          </div>
        </motion.section>}
      </div>

      <motion.section
        className="my-profile-chog-identity"
        aria-label="Chog identity"
        initial={{opacity:0,y:9}}
        animate={{opacity:1,y:0}}
        transition={{duration:.34,delay:.42,ease:'easeOut'}}
      >
        <div className="my-profile-chog-thumb">
          <ChogArtwork chog={profile.chog} fit="contained-natural" className="my-profile-chog-thumb-image"/>
        </div>
        <div className="my-profile-chog-copy">
          <p className="my-profile-section-label"><span/>Chog identity</p>
          <p className="my-profile-chog-title">Chog #{profile.chog.tokenId}<span>·</span>{tier}</p>
        </div>
        <span className="my-profile-chog-verified"><BadgeCheck size={14}/>Verified Chog {tier}</span>
      </motion.section>
    </section>
  </MotionConfig>;
}

function Field({label,value,onChange,placeholder,maxLength,prefix,testId}:{label:string;value:string;onChange:(value:string)=>void;placeholder:string;maxLength?:number;prefix?:string;testId:string}) {
  return <label><span className="mb-2 block text-xs font-bold text-[#5c5067]">{label}</span><span className="relative block">{prefix && <span className="absolute left-3 top-3 text-[#9b8fa0]">{prefix}</span>}<input className={`field ${prefix?'pl-8':''}`} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} data-testid={testId}/></span></label>;
}
function TagField({label,value,onChange,placeholder,testId}:{label:string;value:string;onChange:(value:string)=>void;placeholder:string;testId:string}) {
  return <label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[#5c5067]">{label}</span><input className="field" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} data-testid={testId}/><span className="mt-1 block text-[10px] text-[#9b8fa0]">Separate each with a comma.</span></label>;
}

export function SettingsPage() {
  const me=useGetMe();
  const profile=me.data?.profile;
  const [message,setMessage]=useState('');
  const blockedUsers=useGetBlockedUsers({query:{queryKey:getGetBlockedUsersQueryKey(),refetchOnWindowFocus:true}});
  const unblock=useUnblockUser();
  const logout=useLogoutWallet();
  const walletConnection=useConnection();
  const walletDisconnect=useDisconnect();
  const qc=useQueryClient();
  const [,navigate]=useLocation();
  const walletAddress=me.data?.walletAddress;
  const shortWalletAddress=walletAddress ? `${walletAddress.slice(0,6)}…${walletAddress.slice(-4)}` : '';
  async function copyWalletAddress() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setMessage('Wallet address copied.');
    } catch {
      setMessage('Could not copy the wallet address. Please copy it manually.');
    }
  }
  async function unblockUser(userId:string) {
    try {
      await unblock.mutateAsync({blockedUserId:userId});
      await qc.invalidateQueries({queryKey:getGetBlockedUsersQueryKey()});
      setMessage('User unblocked.');
    } catch {
      setMessage('We couldn’t unblock this user. Please try again.');
    }
  }
  async function signOut() {
    try {
      await logout.mutateAsync();
    } catch {
      setMessage('Sign out did not complete. Please try again.');
      return;
    }

    await qc.cancelQueries();
    const cleanupTasks:Promise<unknown>[]=[];
    if (supabase) cleanupTasks.push(supabase.auth.signOut());
    if (walletConnection.connector) {
      cleanupTasks.push(walletDisconnect.disconnectAsync({ connector: walletConnection.connector }));
    }
    await Promise.allSettled(cleanupTasks);
    qc.clear();
    qc.setQueryData(getGetAuthSessionQueryKey(), { authenticated: false });
    navigate('/');
  }
  return <AppShell displayName={profile?.displayName}><div className="page-enter">
    <PageTitle eyebrow="Account preferences" title="Settings." description="Manage your wallet connection and blocked users." />
    <div className="space-y-5">
      <section className="surface rounded-[26px] p-6" aria-labelledby="settings-wallet-title">
        <Eyebrow>Connected Wallet</Eyebrow>
        <h2 id="settings-wallet-title" className="display text-2xl font-extrabold text-[#24133f]">Connected Wallet</h2>
        {me.isLoading ? <div className="skeleton mt-4 h-14 rounded-2xl" role="status" aria-label="Loading connected wallet"/> :
          walletAddress ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#faf6ef] p-4">
            <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eee8ff] text-[#7047ff]"><Wallet size={18}/></span><p className="truncate text-sm font-semibold text-[#594d64]" title={walletAddress} data-testid="text-settings-wallet" aria-label={`Connected wallet ${walletAddress}`}>{shortWalletAddress}</p></div>
            <button type="button" onClick={()=>void copyWalletAddress()} className="inline-flex items-center gap-2 rounded-full border border-[#e9e0d3] bg-white px-4 py-2.5 text-xs font-bold text-[#594d64] hover:bg-[#f8f4ed]" data-testid="button-copy-wallet"><Copy size={14}/>Copy</button>
          </div> : <p className="mt-3 text-sm text-[#887c90]" role="status">No connected wallet session.</p>}
      </section>

      <section className="surface rounded-[26px] p-6" aria-labelledby="settings-visibility-title">
        <Eyebrow>Profile visibility</Eyebrow>
        <h2 id="settings-visibility-title" className="display text-2xl font-extrabold text-[#24133f]">Profiles appear in Explore</h2>
        <p className="mt-3 rounded-2xl bg-[#faf6ef] p-4 text-sm leading-6 text-[#594d64]" data-testid="text-settings-visibility">Every eligible Chog holder appears in Explore, regardless of their saved visibility preference. Blocking is the only way to keep a specific person out of your Explore results.</p>
      </section>

      <section className="surface rounded-[26px] p-6" aria-labelledby="settings-blocked-title">
        <Eyebrow>Blocked Users</Eyebrow>
        <h2 id="settings-blocked-title" className="display text-2xl font-extrabold text-[#24133f]">Blocked Users</h2>
        {blockedUsers.isLoading ? <div className="skeleton mt-4 h-14 rounded-2xl" role="status" aria-label="Loading blocked users"/> :
          blockedUsers.isError ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fff2ec] p-4"><p className="text-sm text-[#914c3c]" role="alert">Blocked users couldn’t be loaded.</p><button type="button" onClick={()=>void blockedUsers.refetch()} className="rounded-full border border-[#e9d7d1] px-4 py-2 text-xs font-bold text-[#99534a]" data-testid="button-retry-blocked-users">Try again</button></div> :
          !blockedUsers.data?.length ? <p className="mt-4 rounded-2xl bg-[#faf6ef] px-4 py-4 text-sm text-[#887c90]" data-testid="text-no-blocked-users">You haven’t blocked anyone.</p> :
          <ul className="mt-4 divide-y divide-[#eee5e5]">
            {blockedUsers.data.map(user=>{
              const name=user.displayName||user.username||(user.walletAddress?`${user.walletAddress.slice(0,6)}…${user.walletAddress.slice(-4)}`:'CHOG MATE user');
              const isUnblocking=unblock.isPending&&unblock.variables?.blockedUserId===user.userId;
              return <li key={user.userId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" data-testid={`row-blocked-user-${user.userId}`}>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#594d64]" data-testid={`text-blocked-user-${user.userId}`}>{name}</p><p className="truncate text-xs text-[#887c90]">{user.username?`@${user.username}`:user.walletAddress??'Blocked account'}</p></div>
                <button type="button" onClick={()=>void unblockUser(user.userId)} disabled={unblock.isPending} className="rounded-full border border-[#e9d7d1] px-4 py-2 text-xs font-bold text-[#99534a] hover:bg-[#fff2ec] disabled:opacity-50" data-testid={`button-unblock-${user.userId}`}>{isUnblocking?'Unblocking…':'Unblock'}</button>
              </li>;
            })}
          </ul>}
      </section>

      <section className="surface rounded-[26px] p-6" aria-labelledby="settings-logout-title">
        <Eyebrow>Session</Eyebrow>
        <h2 id="settings-logout-title" className="display text-2xl font-extrabold text-[#24133f]">Logout / Disconnect Wallet</h2>
        <p className="mt-2 text-sm leading-6 text-[#82778c]">End your current CHOG MATE session and disconnect the wallet from this app where supported.</p>
        <button type="button" onClick={()=>void signOut()} disabled={logout.isPending||walletDisconnect.isPending} className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-[#e9d7d1] px-5 py-2.5 text-xs font-bold text-[#99534a] hover:bg-white disabled:opacity-50" data-testid="button-sign-out"><LogOut size={14}/>{logout.isPending||walletDisconnect.isPending?'Logging out…':'Logout / Disconnect Wallet'}</button>
      </section>
      {message && <p role="status" className="rounded-2xl bg-[#f2ecff] px-4 py-3 text-sm text-[#594285]" data-testid="status-settings">{message}</p>}
    </div>
  </div></AppShell>;
}
