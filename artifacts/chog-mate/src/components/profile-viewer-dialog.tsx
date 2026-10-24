import { BadgeCheck, Heart, HeartCrack, MessageCircle, ShieldAlert, Sparkles, UserRoundX, X } from 'lucide-react';
import type { Profile } from '@workspace/api-client-react';
import { ChogArtwork } from '@/components/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export type ProfileActionMode = 'browse' | 'explore' | 'liked-by-me' | 'matched' | 'ex-match' | 'incoming' | 'none';

export interface ProfileViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  canInteract: boolean;
  actionMode: ProfileActionMode;
  rematchAvailable: boolean;
  actionPending: boolean;
  messageTarget: string | null;
  notice: string | null;
  onLike: () => void;
  onPass: () => void;
  onSuperLike: () => void;
  onUnlike: () => void;
  onLikeBack: () => void;
  onIgnore: () => void;
  onMessage: () => void;
  onUnmatch: () => void;
  onRematch: () => void;
  onBlock: () => void;
  onReport: () => void;
  onAuthRequired: () => void;
}

type ActionDefinition = {
  label: string;
  testId: string;
  onClick: () => void;
  icon: typeof Heart;
  tone?: 'primary' | 'soft' | 'quiet' | 'danger';
};

const cleanValues = (values?: string[] | null) =>
  (values ?? []).map((value) => value.trim()).filter(Boolean);

export function ProfileViewerDialog({
  open,
  onOpenChange,
  profile,
  canInteract,
  actionMode,
  rematchAvailable,
  actionPending,
  messageTarget,
  notice,
  onLike,
  onPass,
  onSuperLike,
  onUnlike,
  onLikeBack,
  onIgnore,
  onMessage,
  onUnmatch,
  onRematch,
  onBlock,
  onReport,
  onAuthRequired,
}: ProfileViewerDialogProps) {
  if (!profile) return null;

  const sections = [
    { title: 'Looking for', values: cleanValues(profile.lookingFor) },
    { title: 'Interests', values: cleanValues(profile.interests) },
    { title: 'Hobbies', values: cleanValues(profile.hobbies) },
    { title: 'Languages', values: cleanValues(profile.languages) },
  ].filter(({ values }) => values.length > 0);
  const lookingForOther = profile.lookingForOther?.trim();
  const hasOtherLookingFor = profile.lookingFor.some((value) => value.toLowerCase() === 'other');
  const traits = (profile.chog.traits ?? []).filter((trait) => trait.traitType.trim() && trait.traitValue.trim());
  const displayName = profile.displayName.trim() || profile.username.trim();
  const canMessage = Boolean(messageTarget?.trim());

  const actionsByMode: Record<ProfileActionMode, ActionDefinition[]> = {
    browse: [
      { label: 'Pass', testId: 'button-profile-pass', onClick: onPass, icon: HeartCrack, tone: 'quiet' },
      { label: 'Like', testId: 'button-profile-like', onClick: onLike, icon: Heart, tone: 'primary' },
      { label: 'Super Like', testId: 'button-profile-super-like', onClick: onSuperLike, icon: Sparkles, tone: 'soft' },
    ],
    explore: [
      { label: 'Like', testId: 'button-profile-like', onClick: onLike, icon: Heart, tone: 'primary' },
    ],
    'liked-by-me': [
      { label: 'Unlike', testId: 'button-profile-unlike', onClick: onUnlike, icon: HeartCrack, tone: 'quiet' },
    ],
    incoming: [
      { label: 'Like Back', testId: 'button-profile-like-back', onClick: onLikeBack, icon: Heart, tone: 'primary' },
      { label: 'Ignore', testId: 'button-profile-ignore', onClick: onIgnore, icon: X, tone: 'quiet' },
    ],
    matched: [
      { label: 'Message', testId: 'button-profile-message', onClick: onMessage, icon: MessageCircle, tone: 'primary' },
      { label: 'Unmatch', testId: 'button-profile-unmatch', onClick: onUnmatch, icon: UserRoundX, tone: 'quiet' },
      { label: 'Block', testId: 'button-profile-block', onClick: onBlock, icon: ShieldAlert, tone: 'danger' },
      { label: 'Report', testId: 'button-profile-report', onClick: onReport, icon: ShieldAlert, tone: 'quiet' },
    ],
    'ex-match': [
      ...(rematchAvailable
        ? [{ label: 'Rematch', testId: 'button-profile-rematch', onClick: onRematch, icon: Heart, tone: 'primary' as const }]
        : []),
      { label: 'Block', testId: 'button-profile-block', onClick: onBlock, icon: ShieldAlert, tone: 'danger' },
      { label: 'Report', testId: 'button-profile-report', onClick: onReport, icon: ShieldAlert, tone: 'quiet' },
    ],
    none: [],
  };
  const actions = actionsByMode[actionMode];
  const showAuthAction = !canInteract && actionMode !== 'none';
  const showConnectAction = !canInteract && actionMode === 'none';
  const showActions = canInteract && actions.length > 0;

  const buttonTone = (tone: ActionDefinition['tone']) => {
    if (tone === 'primary') return 'bg-[#7046c7] text-white shadow-[0_8px_20px_#7046c733] hover:bg-[#5f37b2]';
    if (tone === 'soft') return 'bg-[#f6e8f2] text-[#8c3f78] hover:bg-[#f1dce9]';
    if (tone === 'danger') return 'bg-[#fff0ed] text-[#9d4c43] hover:bg-[#ffe4df]';
    return 'bg-[#f3eef3] text-[#64586b] hover:bg-[#eae2ec]';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={`profile-dialog-description-${profile.userId}`}
         className="profile-viewer-studio !fixed !left-1/2 !top-1/2 !grid !w-[calc(100vw-24px)] !max-w-[1040px] !translate-x-[-50%] !translate-y-[-50%] !gap-0 !overflow-hidden !rounded-[32px] !border !border-[#eadff0] !bg-[#fffaf5] !p-0 !text-[#35234a] !shadow-[0_28px_90px_#24133f30] [&>button:last-child]:hidden sm:!w-[calc(100vw-48px)] max-sm:!left-0 max-sm:!top-0 max-sm:!h-[100dvh] max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none"
        data-testid="dialog-profile-viewer"
      >
        <div className="relative flex max-h-[min(88dvh,820px)] min-h-0 flex-col overflow-y-auto max-sm:h-[100dvh] max-sm:max-h-[100dvh]">
          <button
            type="button"
            aria-label="Close profile"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/80 bg-[#fffaf5]/90 text-[#59436b] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f6bd3] sm:right-5 sm:top-5"
            data-testid="button-close-profile"
          >
            <X size={19} aria-hidden="true" />
          </button>
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(250px,0.88fr)_minmax(0,1.12fr)]">
             <div className="profile-viewer-art relative flex min-h-[230px] items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_42%,#f4dcec_0%,#e9defa_53%,#ddd1f1_100%)] px-5 pb-6 pt-12 sm:min-h-[300px] md:min-h-full md:px-8 md:py-12">
              <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
                <div className="absolute -left-12 top-10 h-36 w-36 rounded-full border border-white/80" />
                <div className="absolute -right-10 bottom-12 h-48 w-48 rounded-full border border-white/70" />
              </div>
              <div className="relative flex h-[min(48dvh,420px)] min-h-[230px] w-full max-w-[390px] items-center justify-center overflow-hidden rounded-2xl">
                <ChogArtwork
                  chog={profile.chog}
                  fit="contain"
                />
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/70 bg-[#fffaf5]/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#624b78] backdrop-blur sm:bottom-6 sm:left-6">
                <BadgeCheck size={14} className="text-[#8054bf]" aria-hidden="true" />
                Verified Chog
              </div>
               {profile.chog.tokenId && <div className="profile-viewer-token absolute right-4 top-4 rounded-[16px] border border-white/70 bg-[#fffaf5]/85 px-3.5 py-2 text-right backdrop-blur sm:right-6 sm:top-6" data-testid={`dialog-chog-token-${profile.userId}`}>
                 <span className="block text-[8px] font-bold uppercase tracking-[.16em] text-[#8f7b9b]">{profile.chog.tier?.trim() || 'Verified Chog'}</span><span className="mt-0.5 block font-mono text-sm font-bold text-[#51366b]">#{profile.chog.tokenId}</span>
               </div>}
            </div>

             <div className="profile-viewer-copy flex min-w-0 flex-col px-5 pb-6 pt-6 sm:px-8 sm:pb-8 md:overflow-y-auto md:px-9 md:pb-8 md:pt-10">
              <div className="mb-5 pr-9">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.19em] text-[#a06b9a]">A little about them</p>
                <DialogTitle className="break-words font-[var(--font-display)] text-[30px] font-extrabold leading-[1.05] tracking-[-.045em] text-[#35234a] sm:text-[38px]" data-testid={`dialog-profile-name-${profile.userId}`}>
                  {displayName}{profile.age !== null && profile.age !== undefined ? `, ${profile.age}` : ''}
                </DialogTitle>
                {profile.username.trim() && (
                  <p className="mt-1.5 break-all text-sm font-medium text-[#806e88]" data-testid={`dialog-profile-username-${profile.userId}`}>
                    @{profile.username}
                  </p>
                )}
                <DialogDescription id={`profile-dialog-description-${profile.userId}`} className="sr-only">
                  Profile details and connection actions for {displayName}.
                </DialogDescription>
                {(profile.chog.tokenId || profile.chog.tier?.trim()) && (
                  <p className="mt-3 text-xs font-semibold text-[#806e88]" data-testid={`dialog-chog-summary-${profile.userId}`}>
                    {profile.chog.tokenId ? `Chog #${profile.chog.tokenId}` : ''}
                    {profile.chog.tokenId && profile.chog.tier?.trim() ? ' · ' : ''}
                    {profile.chog.tier?.trim() || ''}
                  </p>
                )}
              </div>

              {profile.bio?.trim() && (
                <section className="mb-5 border-b border-[#eee3ec] pb-5" aria-label="About">
                  <h3 className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#a06b9a]">About</h3>
                  <p className="whitespace-pre-line break-words text-[14px] leading-6 text-[#5e5065]" data-testid={`text-profile-bio-${profile.userId}`}>
                    {profile.bio.trim()}
                  </p>
                </section>
              )}

              {(profile.gender || sections.length > 0) && (
                <div className="space-y-4">
                  {profile.gender && (
                    <section aria-label="Gender" data-testid={`section-profile-gender-${profile.userId}`}>
                      <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#a06b9a]">Gender</h3>
                      <p className="text-sm font-semibold text-[#594b62]">{profile.gender}</p>
                    </section>
                  )}
                  {sections.map(({ title, values }) => (
                    <section key={title} aria-label={title} data-testid={`section-profile-${title.toLowerCase().replaceAll(' ', '-')}-${profile.userId}`}>
                      <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#a06b9a]">{title}</h3>
                      <div className="flex flex-wrap gap-2">
                        {values.map((value) => (
                          <span key={value} className="max-w-full break-words rounded-full border border-[#eaddec] bg-[#fff5fb] px-3 py-1.5 text-xs font-semibold text-[#684c72]">
                            {value}
                          </span>
                        ))}
                      </div>
                      {title === 'Looking for' && hasOtherLookingFor && lookingForOther && (
                        <p className="mt-2 break-words rounded-xl bg-[#f7eff7] px-3 py-2 text-xs leading-5 text-[#69586f]">{lookingForOther}</p>
                      )}
                    </section>
                  ))}
                </div>
              )}

              {(profile.chog.tokenId || profile.chog.tier?.trim() || traits.length > 0) && (
                <section className="mt-5 border-t border-[#eee3ec] pt-4" aria-label="Chog identity" data-testid={`section-chog-traits-${profile.userId}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#a06b9a]">Chog identity</h3>
                    {profile.chog.verified && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7450a8]"><BadgeCheck size={13} /> Verified</span>}
                  </div>
                  {traits.length > 0 && (
                    <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                      {traits.map((trait, index) => (
                        <div key={`${trait.traitType}-${trait.traitValue}-${index}`} className="min-w-0 rounded-xl bg-[#f5eff7] px-3 py-2.5" data-testid={`chog-trait-${index}`}>
                          <dt className="truncate text-[9px] font-extrabold uppercase tracking-[.12em] text-[#9a7b9e]">{trait.traitType}</dt>
                          <dd className="mt-0.5 break-words text-xs font-semibold text-[#594b62]">{trait.traitValue}</dd>
                          {trait.rarity !== null && trait.rarity !== undefined && (
                            <dd className="mt-1 text-[10px] text-[#8b778f]">Rarity {trait.rarity}%</dd>
                          )}
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              )}

              {(showActions || showAuthAction || showConnectAction || notice) && (
                <div className="mt-auto pt-6">
                  {notice?.trim() && <p className="mb-3 rounded-xl bg-[#f7eff7] px-3.5 py-2.5 text-xs leading-5 text-[#67566f]" role="status" data-testid="text-profile-notice">{notice}</p>}
                  {showAuthAction && (
                    <button type="button" onClick={onAuthRequired} className="w-full rounded-full bg-[#7046c7] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#5f37b2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b7ad8] focus-visible:ring-offset-2" data-testid="button-profile-auth-required">
                      Connect to interact
                    </button>
                  )}
                  {showConnectAction && (
                    <button type="button" onClick={onAuthRequired} className="w-full rounded-full bg-[#7046c7] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#5f37b2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b7ad8] focus-visible:ring-offset-2" data-testid="button-profile-connect">
                      Connect to interact
                    </button>
                  )}
                  {showActions && (
                    <div className="flex flex-wrap gap-2.5" data-testid="profile-action-row">
                      {actions.map(({ label, testId, onClick, icon: Icon, tone }) => (
                        <button
                          key={testId}
                          type="button"
                          onClick={onClick}
                          disabled={actionPending || (testId === 'button-profile-message' && !canMessage)}
                          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b7ad8] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${buttonTone(tone)}`}
                          data-testid={testId}
                        >
                          <Icon size={15} aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogTitle className="sr-only">Profile for {displayName}</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

export default ProfileViewerDialog;
