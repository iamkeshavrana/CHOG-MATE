import { useEffect, useState } from 'react';

export type PreviewChog = {
  tokenId: string;
  verified: boolean;
  name?: string | null;
  tier: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
};

export type PreviewProfile = {
  userId: string;
  username: string;
  displayName: string;
  age: number | null;
  lookingFor: string[];
  interests: string[];
  chog: PreviewChog;
};

type PreviewState = {
  profile: PreviewProfile | null;
  loading: boolean;
  error: boolean;
};

export function useFirstVisibleProfile() {
  const [state, setState] = useState<PreviewState>({ profile: null, loading: true, error: false });

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/discover?mode=discover&limit=1', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Discover profile request failed');
        const result = await response.json() as { profiles?: PreviewProfile[] };
        setState({ profile: result.profiles?.[0] ?? null, loading: false, error: false });
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ profile: null, loading: false, error: true });
      });
    return () => controller.abort();
  }, []);

  return state;
}

export function PreviewArtwork({ chog, className = '' }: { chog: PreviewChog; className?: string }) {
  const sources = [...new Set([...(chog.imageUrls ?? []), chog.imageUrl].filter((url): url is string => Boolean(url)))];
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => setSourceIndex(0), [chog.tokenId, sources.join('|')]);

  if (sources[sourceIndex]) {
    return <img
      src={sources[sourceIndex]}
      alt={chog.name || `Verified Chog ${chog.tokenId}`}
      onError={() => setSourceIndex(index => Math.min(index + 1, sources.length))}
      className={className}
    />;
  }

  return <div className={`preview-art-fallback ${className}`} role="img" aria-label={`Verified Chog ${chog.tokenId}`}>
    <span className="preview-art-monogram">cm</span>
    <span className="preview-art-caption">Chog #{chog.tokenId}</span>
  </div>;
}

export function PreviewProfileState({ loading, error }: { loading: boolean; error: boolean }) {
  return <div className="preview-profile-state" role={error ? 'alert' : 'status'}>
    <span className="preview-profile-state-mark">{error ? '!' : 'cm'}</span>
    <strong>{loading ? 'Loading a visible Chog holder…' : error ? 'Live profile unavailable' : 'No visible profiles to preview'}</strong>
    <span>{error
      ? 'This preview uses live Discover data and does not insert example people or NFT artwork.'
      : loading
        ? 'The card preview only displays profiles returned by CHOG MATE Discover.'
        : 'The current Discover response contains no visible verified profiles.'}</span>
  </div>;
}
