import { createContext, useContext } from 'react';
import type { Profile } from '@workspace/api-client-react';
import type { ProfileActionMode } from '@/components/profile-viewer-dialog';

export interface ProfileViewerOptions {
  source?: ProfileActionMode;
  matchId?: string;
  rematchAvailable?: boolean;
  onLike?: () => void | Promise<void>;
  onPass?: () => void | Promise<void>;
  onSuperLike?: () => void | Promise<void>;
}

interface ProfileViewerContextValue {
  openProfile: (profile: Profile, options?: ProfileViewerOptions) => void;
  openProfileById: (userId: string, options?: ProfileViewerOptions) => void;
  closeProfile: () => void;
}

export const ProfileViewerContext = createContext<ProfileViewerContextValue | null>(null);

export function useProfileViewer() {
  const context = useContext(ProfileViewerContext);
  if (!context) {
    throw new Error('useProfileViewer must be used inside ProfileViewerProvider.');
  }
  return context;
}
