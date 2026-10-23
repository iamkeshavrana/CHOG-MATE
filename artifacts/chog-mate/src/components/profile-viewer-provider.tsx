import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  getDiscoverProfilesQueryKey,
  getGetAuthSessionQueryKey,
  getGetConversationsQueryKey,
  getGetExMatchesQueryKey,
  getGetLikeInboxQueryKey,
  getGetMatchesQueryKey,
  getGetMeQueryKey,
  getGetSentLikesQueryKey,
  getGetUserProfileQueryKey,
  ReportInputReason,
  useBlockProfile,
  useGetAuthSession,
  useGetConversations,
  useGetExMatches,
  useGetLikeInbox,
  useGetMatches,
  useGetMe,
  useGetSentLikes,
  useGetUserProfile,
  useRematchProfile,
  useReportProfile,
  useSwipeProfile,
  useUnmatchProfile,
  useUnlikeProfile,
} from '@workspace/api-client-react';
import type { Profile } from '@workspace/api-client-react';
import { ProfileViewerDialog, type ProfileActionMode } from '@/components/profile-viewer-dialog';
import { ProfileViewerContext, type ProfileViewerOptions } from '@/components/profile-viewer-context';
import { WalletConnectionDialog } from '@/components/wallet-connection-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface Selection {
  profile: Profile | null;
  userId: string;
  options: ProfileViewerOptions;
}

export function ProfileViewerProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState('');
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<keyof typeof ReportInputReason>('other');
  const [reportDetails, setReportDetails] = useState('');
  const [path, setPath] = useLocation();
  const queryClient = useQueryClient();

  const session = useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  });
  const me = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: session.data?.authenticated === true,
      retry: false,
    },
  });
  const canInteract = Boolean(
    session.data?.authenticated &&
    me.data?.profile &&
    me.data.profile.chog.verified &&
    me.data.profile.username.trim() &&
    me.data.profile.displayName.trim() &&
    me.data.walletAddress.toLowerCase() === me.data.profile.walletAddress.toLowerCase(),
  );
  const relationQueriesEnabled = canInteract;
  const matches = useGetMatches({
    query: { enabled: relationQueriesEnabled, queryKey: getGetMatchesQueryKey(), staleTime: 0 },
  });
  const exMatches = useGetExMatches({
    query: { enabled: relationQueriesEnabled, queryKey: getGetExMatchesQueryKey(), staleTime: 0 },
  });
  const inbox = useGetLikeInbox({
    query: { enabled: relationQueriesEnabled, queryKey: getGetLikeInboxQueryKey(), staleTime: 0 },
  });
  const sent = useGetSentLikes({
    query: { enabled: relationQueriesEnabled, queryKey: getGetSentLikesQueryKey(), staleTime: 0 },
  });
  const conversations = useGetConversations({
    query: { enabled: relationQueriesEnabled, queryKey: getGetConversationsQueryKey(), staleTime: 0 },
  });

  const profileId = selection?.profile ? '' : selection?.userId ?? '';
  const profileQuery = useGetUserProfile(profileId, {
    query: {
      enabled: Boolean(profileId),
      queryKey: getGetUserProfileQueryKey(profileId),
      retry: false,
      staleTime: 0,
    },
  });
  const profile = selection?.profile ?? profileQuery.data ?? null;
  const activeMatch = profile
    ? matches.data?.find(item => item.profile.userId === profile.userId)
    : undefined;
  const exMatch = profile
    ? exMatches.data?.find(item => item.profile.userId === profile.userId)
    : undefined;
  const outgoingLike = profile
    ? sent.data?.find(item => item.profile.userId === profile.userId)
    : undefined;
  const incomingLike = profile
    ? inbox.data?.find(item => item.profile.userId === profile.userId)
    : undefined;
  const conversation = profile
    ? conversations.data?.find(item => item.profile.userId === profile.userId)
    : undefined;
  const chosenSource = selection?.options.source;
  const actionMode: ProfileActionMode = activeMatch || chosenSource === 'matched'
    ? 'matched'
    : exMatch || chosenSource === 'ex-match'
      ? 'ex-match'
      : outgoingLike || chosenSource === 'liked-by-me'
        ? 'liked-by-me'
        : incomingLike || chosenSource === 'incoming'
          ? 'incoming'
          : chosenSource === 'browse' || chosenSource === 'explore'
            ? chosenSource
            : canInteract
              ? 'explore'
              : 'none';

  const swipe = useSwipeProfile();
  const unlike = useUnlikeProfile();
  const unmatch = useUnmatchProfile();
  const rematch = useRematchProfile();
  const block = useBlockProfile();
  const report = useReportProfile();

  const invalidateSocial = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getDiscoverProfilesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetLikeInboxQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSentLikesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMatchesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetExMatchesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
    ]);
  }, [queryClient]);

  const closeProfile = useCallback(() => {
    setSelection(null);
    setNotice('');
    setReportOpen(false);
  }, []);

  const openProfile = useCallback((nextProfile: Profile, options: ProfileViewerOptions = {}) => {
    setNotice('');
    setSelection({ profile: nextProfile, userId: nextProfile.userId, options });
  }, []);

  const openProfileById = useCallback((userId: string, options: ProfileViewerOptions = {}) => {
    setNotice('');
    setSelection({ profile: null, userId, options });
  }, []);

  const value = useMemo(() => ({ openProfile, openProfileById, closeProfile }), [
    openProfile,
    openProfileById,
    closeProfile,
  ]);

  const actionPending =
    swipe.isPending || unlike.isPending || unmatch.isPending || rematch.isPending ||
    block.isPending || report.isPending;
  const activeMatchId = activeMatch?.id ??
    (chosenSource === 'matched' ? selection?.options.matchId : undefined) ?? '';
  const exMatchId = exMatch?.id ??
    (chosenSource === 'ex-match' ? selection?.options.matchId : undefined) ?? '';
  const rematchAvailable =
    exMatch?.rematchAvailable ??
    (chosenSource === 'ex-match' ? selection?.options.rematchAvailable : false) ??
    false;
  const messageTarget = actionMode === 'matched' ? activeMatchId || null : null;

  async function recordSwipe(action: 'like' | 'pass') {
    if (!profile || !canInteract) {
      requireInteraction();
      return;
    }
    setNotice('');
    try {
      const result = await swipe.mutateAsync({
        data: { targetUserId: profile.userId, action },
      });
      if (!result.recorded) {
        setNotice('That response was already recorded. Refresh your connections and try again.');
        return;
      }
      await invalidateSocial();
      setNotice(result.matched
        ? "It's a Match. You can message each other now."
        : action === 'like'
          ? 'Like sent. If they like you back, you’ll match.'
          : 'Profile passed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Your response could not be saved.');
    }
  }

  async function unlikeCurrentProfile() {
    if (!profile || !canInteract) {
      requireInteraction();
      return;
    }
    setNotice('');
    try {
      await unlike.mutateAsync({ targetUserId: profile.userId });
      await invalidateSocial();
      setNotice(outgoingLike?.type === 'super_like'
        ? 'The Super Like was withdrawn. The completed $CHOG transfer is unchanged.'
        : 'Like removed. This profile can appear in Discover again.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The Like could not be removed.');
    }
  }

  async function unmatchCurrentProfile() {
    if (!profile || !activeMatchId || !canInteract) return;
    if (!window.confirm(`Unmatch from ${profile.displayName}? Your conversation history will remain in Messages.`)) return;
    setNotice('');
    try {
      await unmatch.mutateAsync({ matchId: activeMatchId });
      await invalidateSocial();
      setNotice('Match ended. This person is now in Ex Matches; your conversation history remains in Messages.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The Match could not be ended.');
    }
  }

  async function rematchCurrentProfile() {
    if (!profile || !exMatchId || !canInteract || !rematchAvailable) return;
    setNotice('');
    try {
      await rematch.mutateAsync({ matchId: exMatchId });
      await invalidateSocial();
      setNotice('Your previous Match has been restored.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rematch is not available.');
    }
  }

  async function blockCurrentProfile() {
    if (!profile || !canInteract) {
      requireInteraction();
      return;
    }
    if (!window.confirm(`Block @${profile.username}? You will no longer see this profile.`)) return;
    setNotice('');
    try {
      await block.mutateAsync({ data: { targetUserId: profile.userId } });
      await invalidateSocial();
      closeProfile();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This profile could not be blocked.');
    }
  }

  async function submitReport() {
    if (!profile || !canInteract) {
      requireInteraction();
      return;
    }
    try {
      await report.mutateAsync({
        data: {
          targetUserId: profile.userId,
          reason: ReportInputReason[reportReason],
          details: reportDetails.trim() || undefined,
        },
      });
      setReportOpen(false);
      setReportDetails('');
      setNotice('Report sent to the safety team. Thank you.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The report could not be sent.');
    }
  }

  function requireInteraction() {
    if (session.data?.authenticated) {
      closeProfile();
      setPath('/profile');
      return;
    }
    setWalletDialogOpen(true);
  }

  async function runPageAction(callback: (() => void | Promise<void>) | undefined) {
    if (!callback) return;
    closeProfile();
    try {
      await callback();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That action could not be completed.');
    }
  }

  return (
    <ProfileViewerContext.Provider value={value}>
      {children}
      {profile ? (
        <ProfileViewerDialog
          open={Boolean(selection)}
          onOpenChange={open => { if (!open) closeProfile(); }}
          profile={profile}
          canInteract={canInteract}
          actionMode={actionMode}
          rematchAvailable={rematchAvailable}
          actionPending={actionPending}
          messageTarget={messageTarget}
          notice={notice}
          onLike={() => selection?.options.onLike
            ? void runPageAction(selection.options.onLike)
            : void recordSwipe('like')}
          onPass={() => selection?.options.onPass
            ? void runPageAction(selection.options.onPass)
            : void recordSwipe('pass')}
          onSuperLike={() => void runPageAction(selection?.options.onSuperLike)}
          onUnlike={() => void unlikeCurrentProfile()}
          onLikeBack={() => void recordSwipe('like')}
          onIgnore={() => void recordSwipe('pass')}
          onMessage={() => {
            if (!messageTarget) return;
            closeProfile();
            setPath(`/messages?match=${encodeURIComponent(messageTarget)}`);
          }}
          onUnmatch={() => void unmatchCurrentProfile()}
          onRematch={() => void rematchCurrentProfile()}
          onBlock={() => void blockCurrentProfile()}
          onReport={() => {
            if (!canInteract) {
              requireInteraction();
              return;
            }
            setReportOpen(true);
          }}
          onAuthRequired={requireInteraction}
        />
      ) : selection ? (
        <Dialog open onOpenChange={open => { if (!open) closeProfile(); }}>
          <DialogContent className="max-w-md rounded-[28px] border-[#eadff0] bg-[#fffaf5] p-7 text-[#35234a]">
            <DialogTitle className="display text-xl font-extrabold">
              {profileQuery.isError ? 'Profile unavailable' : 'Opening profile…'}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#806e88]" role={profileQuery.isError ? 'alert' : 'status'}>
              {profileQuery.isError
                ? 'This profile is no longer available or could not be verified.'
                : 'Loading verified profile details and Chog identity.'}
            </DialogDescription>
            {profileQuery.isError && (
              <button
                type="button"
                onClick={() => void profileQuery.refetch()}
                className="button-soft rounded-full px-4 py-2 text-sm font-bold"
                data-testid="button-retry-open-profile"
              >
                Try again
              </button>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
      {reportOpen && profile && (
        <Dialog open onOpenChange={setReportOpen}>
          <DialogContent className="max-w-md rounded-[26px] border-[#eadff0] bg-[#fffaf5] text-[#35234a]">
            <DialogTitle className="display text-xl font-extrabold">Report @{profile.username}</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#806e88]">
              Reports go to the CHOG MATE safety team.
            </DialogDescription>
            <label className="mt-2 block text-xs font-bold text-[#594b62]">
              Reason
              <select
                value={reportReason}
                onChange={event => setReportReason(event.target.value as keyof typeof ReportInputReason)}
                className="field mt-2"
                data-testid={`select-profile-report-reason-${profile.userId}`}
              >
                {Object.entries(ReportInputReason).map(([key, value]) => (
                  <option value={key} key={key}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-[#594b62]">
              Details (optional)
              <textarea
                value={reportDetails}
                onChange={event => setReportDetails(event.target.value)}
                maxLength={1000}
                className="field mt-2 min-h-24 resize-y"
                data-testid={`input-profile-report-details-${profile.userId}`}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="button-soft rounded-full px-4 py-2.5 text-xs font-bold">Cancel</button>
              <button type="button" onClick={() => void submitReport()} disabled={report.isPending} className="button-primary rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50" data-testid={`button-submit-profile-report-${profile.userId}`}>
                {report.isPending ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <WalletConnectionDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
        returnTo={`${path}${window.location.search}${window.location.hash}`}
      />
    </ProfileViewerContext.Provider>
  );
}
