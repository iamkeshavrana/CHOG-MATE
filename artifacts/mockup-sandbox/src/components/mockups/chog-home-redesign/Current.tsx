import { useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Compass,
  Heart,
  House,
  MessageCircleHeart,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wallet,
} from 'lucide-react';
import chogGif from './assets/chog-wave-transparent.gif';
import secondaryChogGif from './assets/chog-blind-transparent.gif';
import './_group.css';

const navItems = [
  { label: 'Home', icon: House },
  { label: 'Discover', icon: Compass },
  { label: 'Explore', icon: Search },
];

export function Current() {
  const [connectFeedback, setConnectFeedback] = useState(false);
  const showUnavailableWallet = () => setConnectFeedback(true);

  return (
    <div className="chog-home-current app-shell grain">
      <header className="topbar relative z-20 sticky top-0">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 md:px-9">
          <a href="#" className="inline-flex items-center gap-3" aria-label="CHOG MATE home">
            <img
              src="https://media1.tenor.com/m/O3waRaZ2i4AAAAAC/chog-monad.gif"
              alt="Chog dancing"
              width="48"
              height="48"
              className="brand-mark"
            />
            <span className="display brand-wordmark brand-wordmark-inverse text-[22px] font-extrabold tracking-[-.07em]">CHOG MATE</span>
          </a>
          <nav className="nav-glass hidden items-center gap-0.5 rounded-full p-1 md:flex" aria-label="Main navigation">
            {navItems.map(({ label, icon: Icon }) => (
              <a
                key={label}
                href="#"
                aria-current={label === 'Home' ? 'page' : undefined}
                className={`nav-link flex items-center gap-1.5 rounded-full px-2 py-2 text-[11px] font-semibold lg:gap-2 lg:px-2.5 lg:text-xs xl:px-3 xl:text-[13px] ${label === 'Home' ? 'active' : ''}`}
              >
                <Icon size={14} strokeWidth={2.2} />
                {label}
              </a>
            ))}
          </nav>
          <button
            type="button"
            onClick={showUnavailableWallet}
            className="button-primary hidden h-10 items-center gap-2 rounded-full px-4 text-xs font-bold md:inline-flex"
          >
            <Wallet size={14} />Connect Wallet
          </button>
        </div>
      </header>
      <main className="relative z-[1] mx-auto w-full max-w-[1440px] px-5 pb-28 pt-7 md:px-9 md:pb-12 md:pt-10">
        <div className="home-page">
          <section className="home-hero mx-auto grid max-w-[1240px] items-center gap-5 pb-14 pt-8 md:min-h-[650px] md:grid-cols-[1fr_.9fr] md:gap-4 md:pb-16 md:pt-4">
            <div className="relative z-[1] max-w-[620px]">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d9cafa] bg-white/75 px-3.5 py-2 text-xs font-semibold text-[#503877] shadow-sm backdrop-blur-xl">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#eee8ff] text-[#7047ff]">
                  <ShieldCheck size={12} />
                </span>
                A community for verified Chog holders
              </div>
              <h1
                className="home-main-heading display text-[53px] font-extrabold leading-[.96] tracking-[-.065em] sm:text-[75px] lg:text-[88px]"
                data-testid="heading-home"
              >
                MEET YOUR
                <br />
                <span>CHOG MATE</span>
              </h1>
              <div className="mt-7">
                <p className="display text-[19px] font-extrabold italic tracking-[-.03em] text-[#624490]">
                  Meet Match Chog
                </p>
              </div>
              <p className="mt-5 max-w-[470px] text-[16px] leading-7 text-[#72667a]">
                Your Chog is already one of a kind. Meet the people who get it —
                for dates, friendships, ideas, and everything in between.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={showUnavailableWallet}
                  className="button-primary inline-flex min-h-[54px] items-center gap-3 rounded-full px-7 text-sm font-bold"
                  data-testid="button-connect-wallet"
                >
                  START DISCOVERING
                  <ArrowDownRight size={17} />
                </button>
                <span className="text-xs text-[#877b8e]">
                  A signature proves ownership. It never moves funds.
                </span>
              </div>
              {connectFeedback && (
                <p
                  className="mt-4 max-w-lg rounded-2xl border border-[#edc8bc] bg-[#fff2ec] px-4 py-3 text-sm leading-5 text-[#8b4232]"
                  role="status"
                >
                  Wallet connection is unavailable in this visual extract. No wallet action was performed.
                </p>
              )}
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[#d9cfc1] pt-6 text-xs font-medium text-[#74677b]">
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck size={15} className="text-[#7047ff]" />
                  Verified holder identity
                </span>
                <span className="inline-flex items-center gap-2">
                  <Heart size={15} className="text-[#cf78a8]" />
                  Real people, real connections
                </span>
              </div>
            </div>

            <div className="home-hero-art relative mx-auto flex min-h-[360px] w-full max-w-[530px] items-center justify-center sm:min-h-[455px]">
              <div className="home-hero-gif-wrap relative z-[1] flex aspect-square w-full max-w-[420px] items-center justify-center">
                <img
                  src={chogGif}
                  alt="Chog waving hello"
                  className="home-hero-gif"
                  width="300"
                  height="300"
                  fetchPriority="high"
                />
              </div>
            </div>
          </section>

          <section className="home-section mx-auto max-w-[1240px] border-t border-[#ded4c6] py-12 sm:py-16" aria-labelledby="stats-heading">
            <div className="mb-7">
              <Eyebrow>Chog Genesis, at a glance</Eyebrow>
              <h2 id="stats-heading" className="display text-[31px] font-extrabold leading-tight text-[#24133f] sm:text-[40px]">
                Collection statistics.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {['Floor price', 'Top offer', 'Total volume', 'Total holders'].map((label) => (
                <StatCard key={label} label={label} />
              ))}
            </div>
          </section>

          <section className="home-section mx-auto max-w-[1240px] border-t border-[#ded4c6] py-12 sm:py-16" aria-labelledby="sales-heading">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <Eyebrow>Chog Genesis marketplace activity</Eyebrow>
                <h2 id="sales-heading" className="display text-[31px] font-extrabold leading-tight text-[#24133f] sm:text-[40px]">
                  Real live Chog sales.
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#786d80]">
                  Recent sales from OpenSea’s collection feed. No sample listings,
                  no made-up prices. Scroll left to right to browse older sales.
                </p>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-end">
                <a
                  href="https://opensea.io/collection/chog-genesis"
                  target="_blank"
                  rel="noreferrer"
                  className="home-text-link inline-flex w-fit items-center gap-2 rounded-full px-1 py-2 text-xs font-bold"
                >
                  View collection <ArrowRight size={14} />
                </a>
              </div>
            </div>
            <LiveDataState
              title="LIVE SALES UNAVAILABLE"
              description="The marketplace feed isn’t connected in this visual extract. We won’t substitute sample sales."
              testId="state-live-sales-unavailable"
            />
          </section>

          <section className="home-section mx-auto max-w-[1240px] border-t border-[#ded4c6] py-12 sm:py-16" aria-labelledby="how-heading">
            <div className="mb-8 max-w-2xl">
              <Eyebrow>From Chog holder to Chog Mate</Eyebrow>
              <h2 id="how-heading" className="display text-[31px] font-extrabold leading-tight text-[#24133f] sm:text-[40px]">
                A good connection starts with something real.
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { n: '01', title: 'Connect', copy: 'Verify your Chog on Monad. Your wallet is your proof.', icon: ShieldCheck },
                { n: '02', title: 'Create', copy: 'Share the details that help the right people find you.', icon: Sparkles },
                { n: '03', title: 'Discover', copy: 'Meet real holders looking for the same kind of connection.', icon: UsersRound },
                { n: '04', title: 'Match', copy: 'A conversation opens when the interest goes both ways.', icon: MessageCircleHeart },
              ].map(({ n, title, copy, icon: Icon }) => (
                <article key={n} className="home-step surface rounded-[22px] p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="display text-sm font-extrabold text-[#a08ac0]">{n}</span>
                    <Icon size={19} className="text-[#7047ff]" />
                  </div>
                  <h3 className="display mt-6 text-xl font-extrabold text-[#24133f]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#786d80]">{copy}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="verified-discovery" className="home-visible mx-auto my-5 grid max-w-[1240px] items-center gap-8 overflow-hidden rounded-[30px] border border-[#dacbf3] px-6 py-8 sm:px-10 sm:py-10 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
            <div className="relative z-[1] max-w-2xl">
              <Eyebrow>Meet the person. See the Chog.</Eyebrow>
              <h2 className="display text-[29px] font-extrabold leading-tight text-[#24133f] sm:text-[36px]">
                Everything is visible from the first card.
                <span className="mt-1 block text-[#7047ff]">Real profiles, real Chogs.</span>
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#756883]">
                Discover shows each member’s real photo, profile details, and verified
                Chog artwork together on every card.
              </p>
            </div>
            <figure className="home-visible-visual relative z-[1] flex justify-center">
              <a
                href="https://tenor.com/view/waweonline-wawe-monad-chog-gmonad-gif-7405421530750396964"
                target="_blank"
                rel="noreferrer"
                aria-label="View the original animated Chog by Waweonline on Tenor"
              >
                <img
                  src={secondaryChogGif}
                  alt="Animated Chog by Waweonline with a transparent background"
                  loading="eager"
                  decoding="async"
                />
              </a>
            </figure>
          </section>

          <section className="home-final-cta mx-auto my-10 max-w-[1240px] rounded-[30px] px-6 py-10 text-center sm:my-14 sm:px-12 sm:py-14">
            <div className="relative z-[1] mx-auto max-w-2xl">
              <Eyebrow>For the people behind the Chogs</Eyebrow>
              <h2 className="display text-[34px] font-extrabold leading-tight text-[#24133f] sm:text-[46px]">
                Find your Chog Mate.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#756883]">
                Verify your holder identity and meet people who are here for the
                same reason you are.
              </p>
              <button
                onClick={showUnavailableWallet}
                className="button-primary mt-6 inline-flex min-h-[50px] items-center gap-2 rounded-full px-6 text-sm font-bold"
                data-testid="button-final-cta"
              >
                START DISCOVERING <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      </main>
      <nav className="mobile-tabbar fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden" aria-label="Mobile navigation">
        {navItems.map(({ label, icon: Icon }) => (
          <a key={label} href="#" className={`mobile-tab flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] font-semibold ${label === 'Home' ? 'active' : ''}`}>
            <Icon size={18} strokeWidth={2} />{label}
          </a>
        ))}
        <button type="button" onClick={showUnavailableWallet} className="mobile-tab flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] font-semibold">
          <Wallet size={18} strokeWidth={2} />Connect Wallet
        </button>
      </nav>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em]"><span className="h-1.5 w-1.5 rounded-full bg-[#a982ff]" />{children}</div>;
}

function LiveDataState({ title, description, testId }: { title: string; description: string; testId: string }) {
  return (
    <div className="home-data-state surface flex min-h-44 flex-col items-center justify-center rounded-[24px] px-6 py-9 text-center" role="status" data-testid={testId}>
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-[#f1ebff] text-[#7047ff]">
        <Sparkles size={18} />
      </span>
      <h3 className="display text-lg font-extrabold text-[#24133f]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#81758a]">{description}</p>
    </div>
  );
}

function StatCard({ label }: { label: string }) {
  return (
    <article className="home-stat surface rounded-[21px] p-5" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#806b99]">{label}</p>
      <p className="display mt-3 break-words text-[21px] font-extrabold leading-tight text-[#987c9c]">Unavailable</p>
      <p className="mt-2 text-[10px] text-[#9a7180]">Live data unavailable</p>
      {label === 'Top offer' && <p className="mt-2 text-[10px] leading-4 text-[#95899b]">Best active collection offer on OpenSea.</p>}
    </article>
  );
}
