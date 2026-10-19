import { useEffect, useState } from 'react';
import { BadgeCheck, Heart } from 'lucide-react';
import './_group.css';

type Chog = {
  tokenId: string;
  name: string;
  tier: string;
  imageUrl: string;
  imageUrls: string[];
};

type Profile = {
  username: string;
  displayName: string;
  gender: string;
  age: number | null;
  bio: string | null;
  interests: string[];
  hobbies: string[];
  languages: string[];
  lookingFor: string[];
  lookingForOther: string | null;
  chog: Chog;
};

const sampleProfile: Profile = {
  username: 'mirapatel',
  displayName: 'Mira Patel',
  gender: 'Woman',
  age: 28,
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
    imageUrls: [
      'https://i2c.seadn.io/monad/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/fc614010dd6a4ed9084ac7d31e5637/b0fc614010dd6a4ed9084ac7d31e5637.webp',
      'https://ipfs.io/ipfs/bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/1461.webp',
    ],
  },
};

function ChogArtwork({ chog }: { chog: Chog }) {
  const sources = [...new Set([...chog.imageUrls, chog.imageUrl].filter(Boolean))];
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [chog.tokenId, sources.join('|')]);

  if (sources[sourceIndex]) {
    return (
      <img
        src={sources[sourceIndex]}
        alt={`Verified Chog #${chog.tokenId}`}
        onError={() => setSourceIndex((index) => Math.min(index + 1, sources.length))}
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: '100%' }}
      />
    );
  }

  return (
    <div className="grid min-h-56 w-full place-items-center bg-[radial-gradient(circle_at_50%_35%,#e8ddff,#c6b3fa)] text-[#3e286a]">
      <span className="display text-3xl font-extrabold">Chog #{chog.tokenId}</span>
    </div>
  );
}

function TagList({ values, lookingFor = false }: { values: string[]; lookingFor?: boolean }) {
  return (
    <div className="my-profile-tag-list">
      {values.map((value, index) => (
        <span className="my-profile-tag" key={`${value}-${index}`}>
          {lookingFor && value === 'Other' && sampleProfile.lookingForOther
            ? `Other: ${sampleProfile.lookingForOther}`
            : value}
        </span>
      ))}
    </div>
  );
}

export function Current() {
  const profile = sampleProfile;
  const groups = [
    { label: 'Interests', values: profile.interests },
    { label: 'Hobbies', values: profile.hobbies },
    { label: 'Languages', values: profile.languages },
  ].filter((group) => group.values.length > 0);

  return (
    <div className="current-preview-shell">
      <header className="current-preview-topbar">
        <div className="current-preview-topbar-inner">
          <span className="current-preview-wordmark">CHOG MATE</span>
          <nav className="current-preview-nav" aria-label="Main navigation">
            <span>Home</span><span>Discover</span><span>Matches</span><span>Messages</span><span>My Profile</span>
          </nav>
          <span className="text-xs font-semibold text-[#fff1d9]">MON · 1.4k</span>
        </div>
      </header>

      <main className="current-preview-main">
        <div className="profile-page-heading">
          <div className="current-profile-heading-row">
            <div className="current-profile-heading-copy">
              <div className="current-eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-[#bf5678]" />Your introduction to the community</div>
              <h1 className="current-profile-title">My profile.</h1>
              <p className="current-profile-description">Your profile, just as other Chog holders see it.</p>
            </div>
            <div className="current-profile-actions">
              <button type="button" className="current-edit-button">Edit Profile</button>
              <a href="#" className="current-soft-button">My Chogs</a>
              <a href="#" className="current-soft-button">Settings</a>
            </div>
          </div>
        </div>

        <div className="current-identity-notice" role="status">
          <BadgeCheck size={15} className="mt-0.5 shrink-0" />
          <span>Wallet connected and signature verified. Blockchain transactions still require your wallet to approve each transaction.</span>
        </div>

        <section className="my-profile-card" aria-label="My complete profile" data-testid="my-profile-card">
          <div className="my-profile-artwork">
            <ChogArtwork chog={profile.chog} />
          </div>
          <div className="my-profile-details">
            <div className="my-profile-scroll">
              <header className="my-profile-identity">
                <span className="my-profile-verified"><BadgeCheck size={12} />Verified Chog {profile.chog.tier}</span>
                <h2>{profile.displayName}<span className="ml-2 text-[.7em] text-[#876e80]">· {profile.age}</span></h2>
                <p className="my-profile-username">@{profile.username}</p>
              </header>
              <div className="my-profile-facts">
                <div>
                  <p className="my-profile-section-title">Your verified Chog</p>
                  <p className="display text-base text-[#332037]">#{profile.chog.tokenId} <span className="font-sans text-[10px] font-semibold normal-case tracking-normal text-[#8c7182]">{profile.chog.tier}</span></p>
                </div>
                {profile.gender && <div className="rounded-full bg-[#f7e9ee] px-2.5 py-1 text-[10px] font-bold text-[#984d67]"><span className="font-medium">Gender:</span> {profile.gender}</div>}
              </div>
              {profile.bio && <section className="mt-3" aria-label="About">
                <h3 className="my-profile-section-title">About</h3>
                <p className="whitespace-pre-line break-words text-[11px] leading-[1.45] text-[#685865]">{profile.bio}</p>
              </section>}
              <div className="my-profile-groups">
                {groups.map((group) => <section key={group.label} aria-label={group.label}>
                  <h3 className="my-profile-section-title">{group.label}</h3>
                  <TagList values={group.values} />
                </section>)}
              </div>
              {profile.lookingFor.length > 0 && <section className="mt-3 border-t border-[#eee5e5] pt-2.5" aria-label="Looking for">
                <h3 className="my-profile-section-title flex items-center gap-1.5"><Heart size={11} className="text-[#b34b70]" />Looking For</h3>
                <TagList values={profile.lookingFor} lookingFor />
              </section>}
            </div>
          </div>
        </section>
      </main>

      <nav className="current-preview-bottom-nav" aria-label="Mobile navigation">
        <span>Home</span><span>Discover</span><span>Matches</span><span>Messages</span><span>Profile</span>
      </nav>
    </div>
  );
}
