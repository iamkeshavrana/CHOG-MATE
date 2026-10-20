import './_group.css';
import { PreviewArtwork, PreviewProfileState, useFirstVisibleProfile } from './_profile-data';

export function Current() {
  const { profile, loading, error } = useFirstVisibleProfile();

  return <main className="discover-preview-stage discover-preview-current">
    {profile ? <article className="discover-preview-current-card">
      <div className="discover-preview-current-art">
        <PreviewArtwork chog={profile.chog} className="discover-preview-current-image" />
      </div>
      <div className="discover-preview-current-details">
        <button type="button" className="discover-preview-current-name">
          <span className="discover-preview-current-display">{profile.displayName}</span>
          {profile.age !== null && <span className="discover-preview-current-age">, {profile.age}</span>}
        </button>
      </div>
    </article> : <PreviewProfileState loading={loading} error={error} />}
  </main>;
}
