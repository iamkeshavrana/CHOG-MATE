import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BadgeCheck, Compass, Heart, House, Image, MessageCircle, Settings, UserRound, Wallet } from 'lucide-react';
import type { Chog, Profile } from '@workspace/api-client-react';
import { getGetAuthSessionQueryKey, useGetAuthSession } from '@workspace/api-client-react';
import { ChogBalance } from '@/components/chog-balance';
import { NotificationCenter } from '@/components/notification-center';
import { WalletConnectionDialog } from '@/components/wallet-connection-dialog';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-3" data-testid="link-brand">
    <img
      src="https://media1.tenor.com/m/O3waRaZ2i4AAAAAC/chog-monad.gif"
      alt="Chog dancing"
      width={48}
      height={48}
      className="brand-mark"
    />
    <span className={`display brand-wordmark text-[22px] font-extrabold tracking-[-.07em] ${inverse ? 'brand-wordmark-inverse' : ''}`}>CHOG MATE</span>
  </Link>;
}

const links = [
  { href: '/', label: 'Home', icon: House },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/matches', label: 'Matches', icon: Heart },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/my-chog', label: 'My Chog', icon: Image },
  { href: '/profile', label: 'My Profile', icon: UserRound },
];
const publicLinks = links.slice(0, 2);
const mobileLinks = links.filter(({ href }) => href !== '/my-chog');

export function AppShell({ children, displayName }: { children: ReactNode; displayName?: string }) {
  const [path] = useLocation();
  const [headerHidden, setHeaderHidden] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const authSession = useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
      staleTime: 0,
    },
  });
  const authenticated =
    authSession.data?.authenticated === true && !authSession.isError;
  const currentRoute = `${path}${window.location.search}${window.location.hash}`;

  useEffect(() => {
    let previousScrollY = window.scrollY;
    const updateHeaderVisibility = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY <= 24) {
        setHeaderHidden(false);
      } else if (currentScrollY > previousScrollY + 5) {
        setHeaderHidden(true);
      } else if (currentScrollY < previousScrollY - 5) {
        setHeaderHidden(false);
      }
      previousScrollY = currentScrollY;
    };

    window.addEventListener('scroll', updateHeaderVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateHeaderVisibility);
  }, []);

  return <div className="app-shell grain relative">
    <header className={`topbar relative z-20 sticky top-0 ${headerHidden ? 'is-hidden' : ''}`}>
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 md:px-9">
        <Brand inverse />
        <nav className="nav-glass hidden items-center gap-0.5 rounded-full p-1 md:flex" aria-label="Main navigation">
          {(authenticated ? links : publicLinks).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`} className={`nav-link flex items-center gap-1.5 rounded-full px-2 py-2 text-[11px] font-semibold lg:gap-2 lg:px-2.5 lg:text-xs xl:px-3 xl:text-[13px] ${path === href ? 'active' : ''}`}><Icon size={14} strokeWidth={2.2} />{label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          {authenticated ? <>
            <ChogBalance />
            <NotificationCenter />
            <Link href="/settings" className="glass-icon-button grid h-10 w-10 place-items-center rounded-full transition" aria-label="Settings" aria-current={path === '/settings' ? 'page' : undefined} data-testid="link-settings"><Settings size={16}/></Link>
          </> : <button type="button" onClick={() => setWalletDialogOpen(true)} className="button-primary hidden h-10 items-center gap-2 rounded-full px-4 text-xs font-bold md:inline-flex" data-testid="button-nav-connect-wallet"><Wallet size={14}/>Connect Wallet</button>}
        </div>
      </div>
    </header>
    <main className="relative z-[1] mx-auto w-full max-w-[1440px] px-5 pb-28 pt-7 md:px-9 md:pb-12 md:pt-10">{children}</main>
    <nav className={`mobile-tabbar fixed bottom-0 left-0 right-0 z-30 grid ${authenticated ? 'grid-cols-5' : 'grid-cols-3'} px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden ${headerHidden ? 'is-hidden' : ''}`} aria-label="Mobile navigation">
      {(authenticated ? mobileLinks : publicLinks).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={`mobile-tab flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] font-semibold ${path === href ? 'active' : ''}`} data-testid={`mobile-nav-${label.toLowerCase().replace(' ', '-')}`}><Icon size={18} strokeWidth={2} />{label === 'My Profile' ? 'Profile' : label}</Link>)}
      {!authenticated && <button type="button" onClick={() => setWalletDialogOpen(true)} className="mobile-tab flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] font-semibold" data-testid="mobile-nav-connect-wallet"><Wallet size={18} strokeWidth={2}/>Connect Wallet</button>}
    </nav>
    <WalletConnectionDialog
      open={walletDialogOpen}
      onOpenChange={setWalletDialogOpen}
      returnTo={currentRoute}
    />
  </div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em]"><span className="h-1.5 w-1.5 rounded-full bg-[#a982ff]" />{children}</div>;
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><Eyebrow>{eyebrow}</Eyebrow><h1 className="display text-[38px] font-extrabold leading-[1.04] text-[#24133f] sm:text-[48px]" data-testid="heading-page">{title}</h1>{description && <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#74697b]">{description}</p>}</div>{action}</div>;
}

export function EmptyState({ mark = 'cm', title, detail, action }: { mark?: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="surface flex min-h-[300px] flex-col items-center justify-center rounded-[28px] px-6 py-12 text-center" data-testid="state-empty">
    <div className="mb-5 grid h-[72px] w-[72px] place-items-center rounded-[25px] bg-[#f1ebff] text-[#7047ff]"><span className="display text-[27px] font-extrabold tracking-[-.1em]">{mark}</span></div>
    <h2 className="display max-w-md text-[24px] font-extrabold text-[#24133f]">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#82778c]">{detail}</p>{action && <div className="mt-6">{action}</div>}
  </div>;
}

export function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="grid gap-4 md:grid-cols-2"><div className="skeleton h-72 rounded-[28px]" /><div className="skeleton h-72 rounded-[28px]" /></div>;
  if (error) return <div className="surface rounded-[28px] px-6 py-12 text-center" data-testid="state-error"><h2 className="display text-2xl font-extrabold text-[#24133f]">That didn’t come through.</h2><p className="mt-2 text-sm text-[#82778c]">We couldn’t reach the CHOG MATE service. Your wallet and data haven’t changed.</p><button onClick={retry} className="button-soft mt-5 rounded-full px-5 py-2.5 text-sm font-bold" data-testid="button-retry">Try again</button></div>;
  return <>{children}</>;
}

export function ChogArtwork({ chog, className = '' }: { chog?: Chog | null; className?: string }) {
  if (chog?.imageUrl) return <img src={chog.imageUrl} alt={chog.name || `Verified Chog ${chog.tokenId}`} className={`h-full w-full object-contain ${className}`} />;
  return <div className={`flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#e8ddff,#dcd4ff_52%,#c6b3fa)] text-[#3e286a] ${className}`}><div className="grid h-20 w-20 place-items-center rounded-[28px] border border-white/50 bg-white/35 shadow-[0_12px_30px_#50329322] backdrop-blur"><span className="display text-3xl font-extrabold tracking-[-.1em]">cm</span></div><span className="mt-3 text-[10px] font-bold uppercase tracking-[.17em]">{chog ? `Chog #${chog.tokenId}` : 'CHOG MATE'}</span></div>;
}

export function ProfileAvatar({ profile, size = 'md' }: { profile: Profile; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-10 w-10' : 'h-12 w-12';
  if (profile.chog?.imageUrl) return <img src={profile.chog.imageUrl} alt="" className={`${dimensions} rounded-full object-cover ring-2 ring-white`} />;
  return <div className={`${dimensions} grid shrink-0 place-items-center rounded-full bg-[#e7dcff] text-[#5435a2] ring-2 ring-white`}><span className="display text-lg font-extrabold">{profile.displayName?.slice(0, 1) || 'C'}</span></div>;
}
