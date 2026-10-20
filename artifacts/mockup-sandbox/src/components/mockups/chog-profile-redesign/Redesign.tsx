import { useState } from 'react';
import { BadgeCheck, Heart, Image as ImageIcon, Languages, PencilLine, Settings2, Sparkles } from 'lucide-react';
import './_group.css';
import './Redesign.css';

const profile = {
  displayName: 'Mira Patel',
  age: 28,
  username: 'mirapatel',
  gender: 'Woman',
  bio: 'Curious by default. I like finding the small, good details in a day—new music, a long walk, an unexpectedly excellent cup of chai.',
  interests: ['Design', 'Indie music', 'Architecture', 'Coffee', 'Travel'],
  hobbies: ['Film photography', 'Hiking', 'Cooking'],
  languages: ['English', 'Hindi', 'Gujarati'],
  lookingFor: ['Dating', 'Friendship', 'Other'],
  lookingForOther: 'Slow mornings and honest conversation',
  chog: {
    tokenId: '1969',
    name: 'CHOG #1461',
    tier: 'Genesis',
    imageUrl:
      'https://i2c.seadn.io/monad/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/fc614010dd6a4ed9084ac7d31e5637/b0fc614010dd6a4ed9084ac7d31e5637.webp',
  },
};

function Artwork({ className = '' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="redesign-artwork-fallback" role="img" aria-label={`Chog #${profile.chog.tokenId}`}>
      <span>CHOG #{profile.chog.tokenId}</span>
    </div>;
  }
  return <img
    className={className}
    src={profile.chog.imageUrl}
    alt="Verified Chog artwork"
    onError={() => setFailed(true)}
    style={{ display: 'block', width: '100%', height: 'auto', maxWidth: '100%' }}
  />;
}

function Tags({ values, lookingFor = false }: { values: string[]; lookingFor?: boolean }) {
  return <div className={`redesign-tags${lookingFor ? ' redesign-tags-looking' : ''}`}>
    {values.map((value, index) => <span className="redesign-tag" key={`${value}-${index}`}>
      {lookingFor && value === 'Other' ? `Other: ${profile.lookingForOther}` : value}
    </span>)}
  </div>;
}

export function Redesign() {
  const groups = [
    { label: 'Interests', values: profile.interests, icon: Sparkles },
    { label: 'Hobbies', values: profile.hobbies, icon: Heart },
    { label: 'Languages', values: profile.languages, icon: Languages },
  ].filter((group) => group.values.length > 0);

  return <div className="redesign-shell">
    <header className="current-preview-topbar">
      <div className="current-preview-topbar-inner">
        <span className="current-preview-wordmark">CHOG MATE</span>
        <nav className="current-preview-nav" aria-label="Main navigation">
          <span>Home</span><span>Discover</span><span>Matches</span><span>Messages</span><span>My Profile</span>
        </nav>
        <span className="current-preview-context">YOUR PROFILE</span>
      </div>
    </header>

    <main className="redesign-main">
      <div className="redesign-page">
        <header className="redesign-page-heading">
          <div>
            <p className="redesign-eyebrow"><Sparkles size={12} /> YOUR CHOG MATE PROFILE</p>
            <h1>My profile</h1>
            <p className="redesign-page-subtitle">Your introduction to the Chog community.</p>
          </div>
          <div className="redesign-actions">
            <button type="button" className="redesign-action-primary"><PencilLine size={14} />Edit Profile</button>
            <a href="#" className="redesign-action-secondary"><ImageIcon size={13} />My Chogs</a>
            <a href="#" className="redesign-action-secondary"><Settings2 size={13} />Settings</a>
          </div>
        </header>

        <div className="redesign-status" role="status">
          <BadgeCheck size={14} />
          <span>Wallet connected and signature verified. Blockchain transactions still require your wallet to approve each transaction.</span>
        </div>

        <section className="redesign-hero" aria-label="Profile introduction" data-testid="my-profile-hero">
          <figure className="redesign-hero-art">
            <Artwork className="redesign-hero-image" />
            <figcaption><span className="redesign-live-dot" />THE CHOG THAT IS YOU</figcaption>
          </figure>
          <div className="redesign-hero-copy">
            <span className="redesign-verified"><BadgeCheck size={13} />Verified Chog {profile.chog.tier}</span>
            <h2 data-testid="text-profile-display-name">{profile.displayName}<span className="redesign-age">, {profile.age}</span></h2>
            <p className="redesign-username" data-testid="text-profile-username">@{profile.username}</p>
            <div className="redesign-hero-rule" />
            <p className="redesign-hero-label">YOUR CHOG IDENTITY</p>
            <p className="redesign-hero-token" data-testid="text-profile-token-id">Chog #{profile.chog.tokenId}<span>·</span><span data-testid="text-profile-chog-tier">{profile.chog.tier}</span></p>
            <div className="redesign-hero-footer">
              <span className="redesign-gender" data-testid="text-profile-gender">{profile.gender}</span>
            </div>
          </div>
        </section>

        <div className="redesign-info-grid">
          <section className="redesign-info-card redesign-about" aria-label="About">
            <p className="redesign-section-label"><span />ABOUT</p>
            <p className="redesign-about-copy" data-testid="text-profile-introduction">{profile.bio}</p>
          </section>

          {groups.map(({ label, values, icon: Icon }) => <section className="redesign-info-card redesign-trait" key={label} aria-label={label}>
            <p className="redesign-section-label"><span />{label.toUpperCase()}</p>
            <Tags values={values} />
            <Icon className="redesign-trait-icon" size={17} aria-hidden="true" />
          </section>)}

          <section className="redesign-info-card redesign-looking" aria-label="Looking for">
            <p className="redesign-section-label"><span />LOOKING FOR</p>
            <Tags values={profile.lookingFor} lookingFor />
          </section>
        </div>

        <section className="redesign-chog-identity" aria-label="Chog identity">
          <div className="redesign-chog-thumb">
            <Artwork className="redesign-thumb-image" />
          </div>
          <div className="redesign-chog-copy">
            <p className="redesign-section-label"><span />CHOG IDENTITY</p>
            <p className="redesign-chog-title">Chog #{profile.chog.tokenId}<span>·</span>{profile.chog.tier}</p>
          </div>
          <span className="redesign-verified-secondary"><BadgeCheck size={14} />Verified Chog {profile.chog.tier}</span>
        </section>
      </div>
    </main>

    <nav className="current-preview-bottom-nav" aria-label="Mobile navigation">
      <span>Home</span><span>Discover</span><span>Matches</span><span>Messages</span><span>Profile</span>
    </nav>
  </div>;
}
