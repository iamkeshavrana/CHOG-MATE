import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck, BriefcaseBusiness, Cake, Check, ChevronDown, Clock3, Compass, Gamepad2, Globe2,
  Heart, Languages, MapPin, Search, SlidersHorizontal, Sparkles, UsersRound, X, Palette, Rocket, Code2, Handshake,
} from 'lucide-react';
import {
  getDiscoverProfilesQueryKey, getGetAuthSessionQueryKey, getGetMeQueryKey,
  useDiscoverProfiles, useGetAuthSession, useGetMe, useSwipeProfile,
} from '@workspace/api-client-react';
import type { DiscoverProfilesMode, DiscoverProfilesParams, Profile } from '@workspace/api-client-react';
import { AppShell, ChogArtwork, Eyebrow, PageTitle } from '@/components/shared';
import { WalletConnectionDialog } from '@/components/wallet-connection-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './explore.css';

const categories: { label: string; mode: DiscoverProfilesMode; icon: typeof Heart; tint: string; note: string }[] = [
  { label: 'Dating', mode: 'date', icon: Heart, tint: 'rose', note: 'A little more than a like' },
  { label: 'Friendship', mode: 'friends', icon: UsersRound, tint: 'lilac', note: 'Find your kind of people' },
  { label: 'Networking', mode: 'network', icon: BriefcaseBusiness, tint: 'peach', note: 'Meet the next connection' },
  { label: 'Collaboration', mode: 'collab', icon: Handshake, tint: 'mint', note: 'Make something together' },
  { label: 'Gaming', mode: 'gaming', icon: Gamepad2, tint: 'blue', note: 'Queue up with holders' },
  { label: 'Startup & Business', mode: 'startup', icon: Rocket, tint: 'gold', note: 'Build what comes next' },
  { label: 'Creative', mode: 'creative', icon: Palette, tint: 'pink', note: 'Find your creative orbit' },
  { label: 'Hackathon / Teammates', mode: 'hackathon', icon: Code2, tint: 'violet', note: 'Ship something bold' },
  { label: 'Other', mode: 'other', icon: Compass, tint: 'plum', note: 'Let the unexpected happen' },
];

type Filters = {
  gender: string; minAge: string; maxAge: string; location: string;
  interests: string; hobbies: string; languages: string; chogTier: string; recentlyActive: boolean;
};
type FilterControlKey = keyof Filters | 'age';
const emptyFilters: Filters = {
  gender: '', minAge: '', maxAge: '', location: '', interests: '', hobbies: '', languages: '', chogTier: '', recentlyActive: false,
};

function countActiveFilters(filters: Filters): number {
  return [
    Boolean(filters.gender),
    Boolean(filters.minAge || filters.maxAge),
    Boolean(filters.location.trim()),
    Boolean(filters.interests.trim()),
    Boolean(filters.hobbies.trim()),
    Boolean(filters.languages.trim()),
    Boolean(filters.chogTier.trim()),
    filters.recentlyActive,
  ].filter(Boolean).length;
}

export function ExplorePage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DiscoverProfilesMode>('discover');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusedFilter, setFocusedFilter] = useState<FilterControlKey | null>(null);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedProfiles, setLoadedProfiles] = useState<Profile[]>([]);
  const [pageNumber, setPageNumber] = useState(1);

  const session = useGetAuthSession({ query: { queryKey: getGetAuthSessionQueryKey(), retry: false } });
  const authenticated = session.data?.authenticated === true && !session.isError;
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false, enabled: authenticated } });
  const readyToLike = Boolean(authenticated && me.data?.profile && isReadyProfile(me.data.profile, me.data.walletAddress));
  const swipe = useSwipeProfile();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setCursor(undefined);
      setLoadedProfiles([]);
      setPageNumber(1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const params: DiscoverProfilesParams = useMemo(() => ({
    mode,
    limit: 20,
    ...(cursor ? { cursor } : {}),
    ...(search ? { search } : {}),
    ...(filters.gender ? { gender: filters.gender as DiscoverProfilesParams['gender'] } : {}),
    ...(filters.minAge ? { minAge: Number(filters.minAge) } : {}),
    ...(filters.maxAge ? { maxAge: Number(filters.maxAge) } : {}),
    ...(filters.location.trim() ? { location: filters.location.trim() } : {}),
    ...(filters.interests.trim() ? { interests: filters.interests.trim() } : {}),
    ...(filters.hobbies.trim() ? { hobbies: filters.hobbies.trim() } : {}),
    ...(filters.languages.trim() ? { languages: filters.languages.trim() } : {}),
    ...(filters.chogTier ? { chogTier: filters.chogTier } : {}),
    ...(filters.recentlyActive ? { recentlyActive: true } : {}),
  }), [cursor, filters, mode, search]);
  const queryKey = getDiscoverProfilesQueryKey(params);
  const discovery = useDiscoverProfiles(params, { query: { queryKey, retry: false } });

  useEffect(() => {
    if (!discovery.data) return;
    setLoadedProfiles(current => cursor
      ? [...current.filter(profile => !discovery.data.profiles.some(next => next.userId === profile.userId)), ...discovery.data.profiles]
      : discovery.data.profiles);
  }, [discovery.data, cursor]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraftFilters(current => ({ ...current, [key]: value }));
  }
  function openFilters(filter: FilterControlKey | null = null) {
    setDraftFilters(filters);
    setFocusedFilter(filter);
    setFiltersOpen(true);
  }
  function resetPaging() {
    setCursor(undefined);
    setLoadedProfiles([]);
    setPageNumber(1);
  }
  function selectCategory(next: DiscoverProfilesMode) {
    setMode(current => current === next ? 'discover' : next);
    resetPaging();
  }
  function clearFilters() {
    setFilters(emptyFilters);
    setDraftFilters(emptyFilters);
    setMode('discover');
    setSearchInput('');
    setSearch('');
    resetPaging();
    setNotice('');
  }
  async function likeProfile(profile: Profile) {
    setNotice('');
    if (!authenticated) {
      setWalletDialogOpen(true);
      return;
    }
    if (!readyToLike) {
      setNotice(me.data?.profile
        ? 'Finish your profile and select a verified Chog owned by this account before liking.'
        : 'Create a profile and select a verified Chog before liking.');
      return;
    }
    try {
      const result = await swipe.mutateAsync({ data: { targetUserId: profile.userId, action: 'like' } });
      if (!result.recorded) throw new Error('This like was already recorded.');
      setNotice(result.matched ? `You and ${profile.displayName} matched.` : `Like sent to @${profile.username}.`);
      await queryClient.invalidateQueries({ queryKey: getDiscoverProfilesQueryKey() });
      await discovery.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Your like could not be saved. Please try again.');
    }
  }

  const activeFilterCount = countActiveFilters(filters);
  const profiles = loadedProfiles.length ? loadedProfiles : (discovery.data?.profiles ?? []);
  const hasSearch = Boolean(searchInput.trim());
  const currentCategory = categories.find(category => category.mode === mode);
  const filterControls = [
    { key: 'gender' as const, label: 'Gender', shortLabel: 'Gender', icon: UsersRound },
    { key: 'age' as const, label: 'Age range', shortLabel: 'Age', icon: Cake },
    { key: 'location' as const, label: 'Location / timezone', shortLabel: 'Location', icon: MapPin },
    { key: 'interests' as const, label: 'Interests', shortLabel: 'Interests', icon: Sparkles },
    { key: 'hobbies' as const, label: 'Hobbies', shortLabel: 'Hobbies', icon: Compass },
    { key: 'languages' as const, label: 'Languages', shortLabel: 'Languages', icon: Languages },
    { key: 'chogTier' as const, label: 'Chog tier', shortLabel: 'Chog tier', icon: BadgeCheck },
    { key: 'recentlyActive' as const, label: 'Recently active', shortLabel: 'Active', icon: Clock3 },
  ];
  const isFilterActive = (key: FilterControlKey) => key === 'age'
    ? Boolean(filters.minAge || filters.maxAge)
    : filters[key] !== '' && filters[key] !== false;

  return <AppShell>
    <div className="explore-page page-enter">
      <header className="explore-heading">
        <div className="explore-heading-copy">
          <Eyebrow>A shared collection. A world of people.</Eyebrow>
          <PageTitle eyebrow="Real people. Verified Chogs." title="Explore your orbit." description="Find the connection you came here for." />
        </div>
        <div className="explore-heading-stamp" aria-hidden="true"><span>CHOG</span><b>GENESIS</b><i>•</i><span>HOLDERS</span></div>
      </header>

      <section className="explore-search-row" aria-label="Search and filters">
        <label className="explore-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Search people by name, username, or Chog token ID</span>
          <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search Chog Mates…" data-testid="input-explore-search" />
          {searchInput && <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search" data-testid="button-clear-search"><X size={16} /></button>}
          <span className="explore-search-shortcut">/</span>
        </label>
      </section>

      <section className="explore-categories" aria-labelledby="explore-categories-title">
        <div className="explore-section-heading">
          <div><span className="explore-kicker">Choose your direction</span><h2 id="explore-categories-title">What are you here for?</h2></div>
            <button className="explore-clear" type="button" onClick={clearFilters} data-testid="button-clear-filters" disabled={mode === 'discover' && activeFilterCount === 0 && !searchInput}>
              <X size={14} /> Clear Filters
          </button>
        </div>
        <div className="explore-category-grid">
          {categories.map(({ label, mode: categoryMode, icon: Icon, tint, note }, index) => <button
            key={categoryMode}
            type="button"
            className={`explore-category explore-category-${tint} ${mode === categoryMode ? 'is-selected' : ''}`}
            onClick={() => selectCategory(categoryMode)}
            aria-pressed={mode === categoryMode}
            data-testid={`button-category-${categoryMode}`}
            style={{ animationDelay: `${index * 35}ms` }}
          >
            <span className="explore-category-icon"><Icon size={21} strokeWidth={1.8} /></span>
            <span className="explore-category-label">{label}</span>
            <span className="explore-category-note">{note}</span>
            <span className="explore-category-arrow" aria-hidden="true">↗</span>
          </button>)}
        </div>
      </section>

      <section className="explore-filter-toolbar" aria-label="Explore filters">
        <span className="explore-filter-toolbar-label"><SlidersHorizontal size={14} /> Refine</span>
        <div className="explore-filter-chip-list">
          {filterControls.map(({ key, label, shortLabel, icon: Icon }) => <button
            key={key}
            type="button"
            className={`explore-filter-chip ${isFilterActive(key) ? 'is-active' : ''}`}
            onClick={() => openFilters(key)}
            aria-label={`Filter by ${label}`}
            aria-haspopup="dialog"
            data-testid={`button-filter-${key}`}
          >
            <Icon size={14} /><span>{shortLabel}</span>{isFilterActive(key) && <i aria-hidden="true" />}
          </button>)}
        </div>
        <button type="button" className={`explore-filter-toggle ${filtersOpen && focusedFilter === null ? 'is-active' : ''}`} onClick={() => openFilters()} data-testid="button-open-filters" aria-haspopup="dialog">
          <SlidersHorizontal size={15} /><span>All filters</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
        </button>
      </section>

      <section className="explore-results" aria-labelledby="explore-results-title">
        <div className="explore-results-heading">
          <div>
            <span className="explore-kicker">{hasSearch ? 'Search results' : 'The people behind the Chogs'}</span>
            <h2 id="explore-results-title">{hasSearch ? `Looking for “${search}”` : currentCategory ? `${currentCategory.label}, together.` : 'Meet the community.'}</h2>
          </div>
          <div className="explore-result-meta">
            {activeFilterCount > 0 && <span>{activeFilterCount} filters on</span>}
            {!discovery.isLoading && <span>{profiles.length} profiles</span>}
          </div>
        </div>
        {notice && <div className="explore-notice" role="status" data-testid="status-explore-action"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

        {discovery.isLoading && profiles.length === 0 && <div className="explore-profile-grid" aria-label="Loading profiles" data-testid="loading-explore-profiles">
          {Array.from({ length: 6 }, (_, index) => <div className="explore-skeleton-card" key={index}><div className="explore-skeleton-art skeleton" /><div className="explore-skeleton-copy"><i className="skeleton" /><i className="skeleton" /><i className="skeleton" /></div></div>)}
        </div>}
        {discovery.isError && profiles.length === 0 && <div className="explore-state explore-state-error" role="alert" data-testid="error-explore-profiles"><span className="explore-state-mark">!</span><h3>Couldn’t reach the community.</h3><p>Your discovery filters are still here. Try loading profiles again.</p><button type="button" onClick={() => void discovery.refetch()} data-testid="button-retry-explore">Try again</button></div>}
        {!discovery.isLoading && !discovery.isError && profiles.length === 0 && <div className="explore-state" data-testid="empty-explore-profiles"><span className="explore-state-mark"><Compass size={23} /></span><h3>{hasSearch ? 'No one found this time.' : 'Your next connection is still out there.'}</h3><p>{hasSearch ? 'Try a name, username, or active Chog token ID.' : 'Try another direction or loosen your filters to see more holders.'}</p><button type="button" onClick={clearFilters} data-testid="button-reset-explore-empty">Reset discovery</button></div>}
        {profiles.length > 0 && <div className="explore-profile-grid" data-testid="grid-explore-profiles">
          {profiles.map(profile => <article key={profile.userId} className="explore-profile-card" data-testid={`card-explore-profile-${profile.userId}`}>
            <button type="button" className="explore-profile-open" onClick={() => setViewingProfile(profile)} aria-label={`Open ${profile.displayName}'s profile`} data-testid={`button-open-explore-profile-${profile.userId}`}>
              <div className="explore-card-art"><ChogArtwork chog={profile.chog} fit="contain" /><span className="explore-card-verified"><BadgeCheck size={13} /> Verified Chog</span></div>
              <div className="explore-card-info">
                <div className="explore-card-name-line"><h3>{profile.displayName}{profile.age !== null ? <span>, {profile.age}</span> : null}</h3><span className="explore-card-token">#{profile.chog.tokenId}</span></div>
                <p className="explore-card-username">@{profile.username}{profile.chog.tier ? <span> · {profile.chog.tier}</span> : null}</p>
                {profile.bio && <p className="explore-card-bio">{profile.bio}</p>}
                {profile.lookingFor.length > 0 && <div className="explore-looking-tags">{profile.lookingFor.slice(0, 3).map(item => <span key={item}>{item}</span>)}</div>}
              </div>
            </button>
            <div className="explore-card-footer">
              {typeof profile.compatibility === 'number' ? <span className="explore-match-score"><Sparkles size={13} /> {profile.compatibility}% connection</span> : <span className="explore-match-score"><Globe2 size={13} /> Genesis holder</span>}
              <button type="button" className="explore-like-button" onClick={() => void likeProfile(profile)} disabled={swipe.isPending} aria-label={`Like ${profile.displayName}`} data-testid={`button-like-explore-${profile.userId}`}><Heart size={16} /> Like</button>
            </div>
          </article>)}
        </div>}
        {discovery.isFetching && !discovery.isLoading && profiles.length > 0 && <p className="explore-loading-more" role="status">Refreshing profiles…</p>}
        {!discovery.isError && discovery.data?.nextCursor && <button type="button" className="explore-load-more" onClick={() => { setCursor(discovery.data?.nextCursor ?? undefined); setPageNumber(value => value + 1); }} disabled={discovery.isFetching} data-testid="button-load-more">
          {discovery.isFetching ? 'Loading profiles…' : `Load more · page ${pageNumber + 1}`} <ChevronDown size={16} />
        </button>}
      </section>
    </div>

    <Dialog open={filtersOpen} onOpenChange={open => { setFiltersOpen(open); if (!open) setFocusedFilter(null); }}>
      <DialogContent className="explore-filter-dialog">
        <DialogHeader className="explore-filter-dialog-head">
          <div><span className="explore-kicker">Refine your orbit</span><DialogTitle>{focusedFilter ? `Filter by ${filterControls.find(item => item.key === focusedFilter)?.label}` : 'Find your people.'}</DialogTitle><DialogDescription>Combine as many filters as you like.</DialogDescription></div>
          <button type="button" className="explore-clear explore-dialog-clear" onClick={() => setDraftFilters(emptyFilters)} data-testid="button-reset-filter-controls">Reset filters</button>
        </DialogHeader>
        <div className="explore-filter-body">
          {filterControls.map(({ key, label, icon: Icon }) => <section className={`explore-filter-control explore-control-${key} ${focusedFilter === key ? 'is-focused' : ''}`} key={key}>
            <h3><span><Icon size={15} /></span>{label}</h3>
            {key === 'gender' && <select value={draftFilters.gender} onChange={event => updateFilter('gender', event.target.value)} className="field" aria-label="Gender" data-testid="select-filter-gender">
              <option value="">Any gender</option>{['Male', 'Female', 'Gay', 'Trans', 'Alien'].map(value => <option key={value} value={value}>{value}</option>)}
            </select>}
            {key === 'age' && <div className="explore-age-fields"><label><span>Minimum</span><input type="number" min="18" max="120" placeholder="18" value={draftFilters.minAge} onChange={event => updateFilter('minAge', event.target.value)} className="field" aria-label="Minimum age" data-testid="input-filter-min-age" /></label><i>to</i><label><span>Maximum</span><input type="number" min="18" max="120" placeholder="120" value={draftFilters.maxAge} onChange={event => updateFilter('maxAge', event.target.value)} className="field" aria-label="Maximum age" data-testid="input-filter-max-age" /></label></div>}
            {key === 'location' && <input value={draftFilters.location} onChange={event => updateFilter('location', event.target.value)} className="field" placeholder="City, region, or UTC offset" aria-label="Location or timezone" data-testid="input-filter-location" />}
            {key === 'interests' && <input value={draftFilters.interests} onChange={event => updateFilter('interests', event.target.value)} className="field" placeholder="For example: design, web3" aria-label="Interests" data-testid="input-filter-interests" />}
            {key === 'hobbies' && <input value={draftFilters.hobbies} onChange={event => updateFilter('hobbies', event.target.value)} className="field" placeholder="For example: climbing, film" aria-label="Hobbies" data-testid="input-filter-hobbies" />}
            {key === 'languages' && <input value={draftFilters.languages} onChange={event => updateFilter('languages', event.target.value)} className="field" placeholder="For example: English, Japanese" aria-label="Languages" data-testid="input-filter-languages" />}
            {key === 'chogTier' && <input value={draftFilters.chogTier} onChange={event => updateFilter('chogTier', event.target.value)} className="field" placeholder="Enter a Chog tier" aria-label="Chog tier" data-testid="input-filter-chog-tier" />}
            {key === 'recentlyActive' && <button type="button" className={`explore-active-toggle ${draftFilters.recentlyActive ? 'is-on' : ''}`} onClick={() => updateFilter('recentlyActive', !draftFilters.recentlyActive)} aria-pressed={draftFilters.recentlyActive} data-testid="toggle-filter-recently-active"><span>{draftFilters.recentlyActive ? <Check size={14} /> : <Clock3 size={14} />}</span>{draftFilters.recentlyActive ? 'Only recently active' : 'Any activity'}</button>}
          </section>)}
        </div>
        <div className="explore-filter-actions"><button type="button" className="explore-filter-cancel" onClick={() => setFiltersOpen(false)} data-testid="button-cancel-filters">Cancel</button><button type="button" className="explore-filter-apply" onClick={() => { setFilters(draftFilters); resetPaging(); setFiltersOpen(false); }} data-testid="button-apply-filters">Show profiles <span>{countActiveFilters(draftFilters) ? `· ${countActiveFilters(draftFilters)} on` : ''}</span></button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(viewingProfile)} onOpenChange={open => !open && setViewingProfile(null)}>
      <DialogContent className="explore-profile-dialog">
        {viewingProfile && <div className="explore-dialog-profile">
          <div className="explore-dialog-art"><ChogArtwork chog={viewingProfile.chog} fit="contain" /></div>
          <div className="explore-dialog-copy">
            <DialogHeader><span className="explore-card-verified"><BadgeCheck size={13} /> Verified Chog holder</span><DialogTitle>{viewingProfile.displayName}{viewingProfile.age !== null ? `, ${viewingProfile.age}` : ''}</DialogTitle><DialogDescription>@{viewingProfile.username} · Chog #{viewingProfile.chog.tokenId}{viewingProfile.chog.tier ? ` · ${viewingProfile.chog.tier}` : ''}</DialogDescription></DialogHeader>
            {viewingProfile.bio && <p className="explore-dialog-bio">{viewingProfile.bio}</p>}
            {viewingProfile.lookingFor.length > 0 && <section className="explore-dialog-section"><h3>Looking for</h3><div>{viewingProfile.lookingFor.map(value => <span key={value}>{value}</span>)}</div></section>}
            {[['Interests', viewingProfile.interests], ['Hobbies', viewingProfile.hobbies], ['Languages', viewingProfile.languages]].filter(([, values]) => (values as string[]).length > 0).map(([label, values]) => <section className="explore-dialog-section" key={label as string}><h3>{label as string}</h3><div>{(values as string[]).map(value => <span key={value}>{value}</span>)}</div></section>)}
            {viewingProfile.chog.traits?.length ? <section className="explore-dialog-section"><h3>Chog traits</h3><div className="explore-traits">{viewingProfile.chog.traits.map((trait, index) => <span key={`${trait.traitType}-${index}`}><b>{trait.traitType}</b>{trait.traitValue}</span>)}</div></section> : null}
            <button type="button" className="explore-dialog-like" onClick={() => void likeProfile(viewingProfile)} disabled={swipe.isPending} data-testid={`button-dialog-like-${viewingProfile.userId}`}><Heart size={17} /> Like profile</button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <WalletConnectionDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} returnTo="/explore" />
  </AppShell>;
}

function isReadyProfile(profile: Profile | null | undefined, walletAddress: string): boolean {
  return Boolean(profile && profile.displayName.trim() && profile.username.trim() && profile.lookingFor.length > 0 &&
    profile.chog.verified && profile.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
    profile.chog.ownerWallet.toLowerCase() === walletAddress.toLowerCase());
}

export default ExplorePage;
