import { BadgeCheck } from 'lucide-react';
import './_group.css';
import { PreviewArtwork, PreviewProfileState, useFirstVisibleProfile } from './_profile-data';

export function Portrait() {
  const { profile, loading, error } = useFirstVisibleProfile();
  const secondary = profile?.lookingFor[0]
    ? `${profile.lookingFor[0]}${profile.interests[0] ? ` · ${profile.interests[0]}` : ''}`
    : null;

  return <main className="discover-preview-stage discover-preview-portrait">
    {profile ? <article className="discover-preview-portrait-card">
      <div className="discover-preview-portrait-art">
        <PreviewArtwork chog={profile.chog} className="discover-preview-portrait-image" />
        <div className="discover-preview-portrait-gradient" />
        <div className="discover-preview-portrait-topline">
          <span className="discover-preview-verified"><BadgeCheck size={13} />Verified Chog</span>
          <span className="discover-preview-token">Chog #{profile.chog.tokenId}{profile.chog.tier ? ` · ${profile.chog.tier}` : ''}</span>
        </div>
        <button type="button" className="discover-preview-portrait-details" aria-label={`View ${profile.displayName}${profile.age !== null ? `, ${profile.age}` : ''}'s full profile`}>
          <span className="discover-preview-name-line">
            <span className="discover-preview-display">{profile.displayName}</span>
            {profile.age !== null && <span className="discover-preview-age">, {profile.age}</span>}
          </span>
          <span className="discover-preview-username">@{profile.username}</span>
          {secondary && <span className="discover-preview-secondary">{secondary}</span>}
        </button>
      </div>
    </article> : <PreviewProfileState loading={loading} error={error} />}
    <div className="discover-preview-actions" aria-hidden="true">
      <span className="discover-preview-undo">↶</span>
      <span className="discover-preview-pass">×</span>
      <span className="discover-preview-super">✦</span>
      <span className="discover-preview-like">♥</span>
    </div>
  </main>;
}
