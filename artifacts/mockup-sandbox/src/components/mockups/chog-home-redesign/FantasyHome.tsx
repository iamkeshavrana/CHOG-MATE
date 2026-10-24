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
import './_group.css';

const navItems = [
  { label: 'Home', icon: House, href: '#home' },
  { label: 'Discover', icon: Compass, href: '#verified-discovery' },
  { label: 'Explore', icon: Search, href: '#marketplace' },
];

export function FantasyHome() {
  const [connectFeedback, setConnectFeedback] = useState(false);
  const showUnavailableWallet = () => setConnectFeedback(true);

  return (
    <div className="chog-home-current chog-home-redesign grain min-h-[100dvh]">
      <header className="fantasy-topbar sticky top-0 z-30">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-7 lg:px-10">
          <a href="#home" className="flex shrink-0 items-center gap-2.5" aria-label="CHOG MATE home">
            <span className="fantasy-brand-mark" aria-hidden="true">C</span>
            <span className="fantasy-wordmark">
              <span>CHOG MATE</span>
              <small>Meet. Match. Chog.</small>
            </span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {navItems.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                aria-current={label === 'Home' ? 'page' : undefined}
                className={`fantasy-nav-link ${label === 'Home' ? 'is-active' : ''}`}
              >
                <Icon size={14} strokeWidth={2.2} />
                {label}
              </a>
            ))}
          </nav>
          <button type="button" onClick={showUnavailableWallet} className="fantasy-wallet hidden md:inline-flex">
            <Wallet size={15} /> Connect Wallet <ArrowRight size={14} />
          </button>
        </div>
      </header>

      <main>
        <section id="home" className="fantasy-hero relative isolate">
          <div className="fantasy-hero-art" aria-hidden="true" />
          <div className="fantasy-hero-wash" aria-hidden="true" />
          <div className="fantasy-hero-content relative z-[1] mx-auto flex min-h-[710px] max-w-[1440px] items-center px-5 pb-28 pt-16 sm:px-9 sm:pt-12 lg:min-h-[690px] lg:px-12 lg:pb-24">
            <div className="max-w-[650px]">
              <div className="fantasy-kicker">
                <span className="fantasy-kicker-gem"><Sparkles size={13} /></span>
                THE CHOG COMMUNITY
              </div>
              <h1 className="fantasy-title" data-testid="heading-home">
                YOUR CHOG.
                <br />
                YOUR STORY.
                <br />
                <span>YOUR MATE.</span>
              </h1>
              <p className="fantasy-script">Meet. Match. Chog.</p>
              <p className="fantasy-intro">
                Discover extraordinary Chogs, meet your kind of people, and find your connection in the Chog universe.
              </p>
              <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={showUnavailableWallet}
                  className="fantasy-cta"
                  data-testid="button-connect-wallet"
                >
                  START DISCOVERING <ArrowDownRight size={16} />
                </button>
                <span className="fantasy-assurance">A signature proves ownership. It never moves funds.</span>
              </div>
              {connectFeedback && (
                <p className="fantasy-feedback" role="status">
                  Wallet connection is unavailable in this visual extract. No wallet action was performed.
                </p>
              )}
              <div className="fantasy-proof-row">
                <span><BadgeCheck size={16} /> Verified holder identity</span>
                <i aria-hidden="true" />
                <span><Heart size={15} /> Real people, real connections</span>
              </div>
            </div>
          </div>
          <div className="fantasy-hero-caption" aria-hidden="true">
            <span>01 — A universe for your Chog</span>
            <span className="fantasy-caption-line" />
            <span>Find your people</span>
          </div>
        </section>

        <div className="fantasy-benefits-wrap px-4 sm:px-7 lg:px-10">
          <section className="fantasy-benefits mx-auto grid max-w-[1330px] sm:grid-cols-2 lg:grid-cols-4" aria-label="The Chog Mate experience">
            {[
              { icon: ShieldCheck, title: 'Your Chog. Your identity.', copy: 'Use your NFT as your profile and stand out in the community.' },
              { icon: UsersRound, title: 'Discover real people', copy: 'Meet verified Chog holders and like-minded individuals.' },
              { icon: Heart, title: 'Match & chat', copy: 'When there’s a match, the real conversations begin.' },
              { icon: Sparkles, title: 'Super Like with $CHOG', copy: 'Use $CHOG to send Super Likes, gifts and unlock special features.' },
            ].map(({ icon: Icon, title, copy }, index) => (
              <article className="fantasy-benefit" key={title}>
                <span className={`fantasy-benefit-icon benefit-${index}`}><Icon size={19} /></span>
                <div>
                  <h2>{title}</h2>
                  <p>{copy}</p>
                </div>
                <ArrowRight className="fantasy-benefit-arrow" size={15} aria-hidden="true" />
              </article>
            ))}
          </section>
        </div>

        <div className="fantasy-content mx-auto max-w-[1440px] px-5 sm:px-9 lg:px-12">
          <section id="marketplace" className="fantasy-section fantasy-stats" aria-labelledby="stats-heading">
            <div className="fantasy-section-heading">
              <div>
                <Eyebrow>Chog Genesis, at a glance</Eyebrow>
                <h2 id="stats-heading">The collection,<br className="sm:hidden" /> honestly told.</h2>
              </div>
              <p>Numbers should mean something. We’ll show them when the live source is available.</p>
            </div>
            <div className="fantasy-stat-grid">
              {['Floor price', 'Top offer', 'Total volume', 'Total holders'].map((label, index) => (
                <article className="fantasy-stat" key={label} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
                  <span className="fantasy-stat-index">0{index + 1}</span>
                  <p>{label}</p>
                  <strong>Unavailable</strong>
                  <small>Live data unavailable</small>
                  {label === 'Top offer' && <small className="fantasy-stat-note">Best active collection offer on OpenSea.</small>}
                </article>
              ))}
            </div>
          </section>

          <section className="fantasy-section fantasy-sales" aria-labelledby="sales-heading">
            <div className="fantasy-section-heading">
              <div>
                <Eyebrow>Chog Genesis marketplace activity</Eyebrow>
                <h2 id="sales-heading">Real live Chog sales.</h2>
                <p className="fantasy-section-copy">
                  Recent sales from OpenSea’s collection feed. No sample listings, no made-up prices.
                </p>
              </div>
              <a
                href="https://opensea.io/collection/chog-genesis"
                target="_blank"
                rel="noreferrer"
                className="fantasy-text-link"
              >
                View collection <ArrowRight size={15} />
              </a>
            </div>
            <LiveDataState
              title="LIVE SALES UNAVAILABLE"
              description="The marketplace feed isn’t connected in this visual extract. We won’t substitute sample sales."
            />
          </section>

          <section id="how-it-works" className="fantasy-section fantasy-how" aria-labelledby="how-heading">
            <div className="fantasy-how-heading">
              <Eyebrow>From Chog holder to Chog Mate</Eyebrow>
              <h2 id="how-heading">A good connection<br />starts with something real.</h2>
              <p>Four little steps from proving it’s your Chog to meeting someone who gets it.</p>
            </div>
            <div className="fantasy-step-grid">
              {[
                { n: '01', title: 'Connect', copy: 'Verify your Chog on Monad. Your wallet is your proof.', icon: ShieldCheck },
                { n: '02', title: 'Create', copy: 'Share the details that help the right people find you.', icon: Sparkles },
                { n: '03', title: 'Discover', copy: 'Meet real holders looking for the same kind of connection.', icon: UsersRound },
                { n: '04', title: 'Match', copy: 'A conversation opens when the interest goes both ways.', icon: MessageCircleHeart },
              ].map(({ n, title, copy, icon: Icon }) => (
                <article className="fantasy-step" key={n}>
                  <div className="fantasy-step-top"><span>{n}</span><Icon size={20} /></div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  {n !== '04' && <ArrowRight className="fantasy-step-arrow" size={17} aria-hidden="true" />}
                </article>
              ))}
            </div>
          </section>

          <section id="verified-discovery" className="fantasy-visible" aria-labelledby="visible-heading">
            <div className="fantasy-visible-copy">
              <Eyebrow>Meet the person. See the Chog.</Eyebrow>
              <h2 id="visible-heading">Everything is visible from the first card.</h2>
              <p>
                Discover shows each member’s real photo, profile details, and verified Chog artwork together on every card.
              </p>
              <a href="#how-it-works" className="fantasy-outline-link">How it works <ArrowRight size={15} /></a>
            </div>
            <div className="fantasy-visible-art" aria-hidden="true">
              <div className="fantasy-orbit orbit-one" />
              <div className="fantasy-orbit orbit-two" />
              <div className="fantasy-visible-glyph">C</div>
              <span className="fantasy-sparkle sparkle-a">✦</span>
              <span className="fantasy-sparkle sparkle-b">✧</span>
              <span className="fantasy-art-label">YOUR CHOG<br />YOUR STORY</span>
            </div>
          </section>

          <section className="fantasy-final-cta" aria-labelledby="final-heading">
            <span className="fantasy-final-mark" aria-hidden="true">✧</span>
            <div className="relative z-[1] mx-auto max-w-2xl">
              <Eyebrow>For the people behind the Chogs</Eyebrow>
              <h2 id="final-heading">Find your Chog Mate.</h2>
              <p>Verify your holder identity and meet people who are here for the same reason you are.</p>
              <button type="button" onClick={showUnavailableWallet} className="fantasy-cta">
                START DISCOVERING <ArrowRight size={16} />
              </button>
              {connectFeedback && (
                <p className="fantasy-feedback mx-auto" role="status">
                  Wallet connection is unavailable in this visual extract. No wallet action was performed.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>

      <nav className="fantasy-mobile-nav fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden" aria-label="Mobile navigation">
        {navItems.map(({ label, icon: Icon, href }) => (
          <a key={label} href={href} className={`fantasy-mobile-link ${label === 'Home' ? 'is-active' : ''}`}>
            <Icon size={18} strokeWidth={2} />{label}
          </a>
        ))}
        <button type="button" onClick={showUnavailableWallet} className="fantasy-mobile-link">
          <Wallet size={18} strokeWidth={2} />Wallet
        </button>
      </nav>

      <footer className="fantasy-footer px-5 pb-24 pt-7 md:px-10 md:pb-8">
        <span>CHOG MATE</span><span>Meet. Match. Chog.</span>
      </footer>

      <style>{`
        .chog-home-redesign {
          --fantasy-plum: #351344;
          --fantasy-purple: #54217a;
          --fantasy-royal: #6b35a5;
          --fantasy-lavender: #b99aef;
          --fantasy-pink: #f5c5e7;
          --fantasy-peach: #ffe0ce;
          --fantasy-cream: #fff9f1;
          --fantasy-ink: #35203f;
          --fantasy-muted: #75677f;
          background: var(--fantasy-cream);
          color: var(--fantasy-ink);
          font-family: 'DM Sans', sans-serif;
          isolation: isolate;
        }
        .chog-home-redesign a { color: inherit; text-decoration: none; }
        .chog-home-redesign button { font-family: inherit; }
        .fantasy-topbar {
          background: rgba(255,249,241,.92);
          border-bottom: 1px solid rgba(84,33,122,.11);
          box-shadow: 0 5px 22px rgba(53,19,68,.045);
          backdrop-filter: blur(16px);
        }
        .fantasy-brand-mark {
          width: 36px; height: 36px; display: grid; place-items: center; border-radius: 12px 12px 12px 4px;
          color: #fff9f1; background: var(--fantasy-purple); font: 900 24px/.9 'Barlow Condensed',sans-serif;
          box-shadow: 0 5px 12px rgba(84,33,122,.2); transform: rotate(-3deg);
        }
        .fantasy-wordmark { display: grid; gap: 0; color: var(--fantasy-plum); font: 900 17px/.94 'Barlow Condensed',sans-serif; letter-spacing: -.025em; }
        .fantasy-wordmark small { margin-top: 3px; font: italic 600 9px/1 'DM Sans',sans-serif; letter-spacing: .035em; color: #816a91; }
        .fantasy-nav-link { position: relative; display: inline-flex; gap: 7px; align-items: center; padding: 10px 13px; border-radius: 999px; color: #715f7c; font: 600 12px 'DM Sans',sans-serif; transition: color .2s, background .2s, transform .2s; }
        .fantasy-nav-link:hover { color: var(--fantasy-purple); background: #f1e7f8; transform: translateY(-1px); }
        .fantasy-nav-link.is-active { color: white; background: var(--fantasy-purple); box-shadow: 0 5px 12px rgba(84,33,122,.17); }
        .fantasy-wallet { align-items: center; gap: 9px; border: 0; border-radius: 999px; padding: 11px 16px; background: var(--fantasy-purple); color: white; font-size: 11px; font-weight: 700; box-shadow: 0 6px 16px rgba(84,33,122,.17); transition: transform .2s, background .2s; }
        .fantasy-wallet:hover { transform: translateY(-2px); background: var(--fantasy-royal); }
        .fantasy-hero { overflow: hidden; min-height: 710px; background: #f8dff0; }
        .fantasy-hero-art, .fantasy-hero-wash { position: absolute; inset: 0; pointer-events: none; }
        .fantasy-hero-art {
          background-image: url('/__mockup/images/chog-mate-hero.png');
          background-size: cover; background-position: center 54%;
        }
        .fantasy-hero-wash {
          background: linear-gradient(90deg,rgba(255,249,241,.97) 0%,rgba(255,249,241,.91) 29%,rgba(255,249,241,.46) 49%,rgba(255,249,241,0) 71%),
            linear-gradient(0deg,rgba(84,33,122,.13),transparent 30%,rgba(255,249,241,.13));
        }
        .fantasy-hero-content { min-height: 710px; }
        .fantasy-kicker, .fantasy-eyebrow { color: var(--fantasy-purple); font: 700 10px/1.4 'Space Mono',monospace; letter-spacing: .13em; }
        .fantasy-kicker { display: inline-flex; align-items: center; gap: 9px; margin-bottom: 20px; padding: 7px 12px 7px 7px; border: 1px solid rgba(84,33,122,.16); border-radius: 999px; background: rgba(255,249,241,.72); backdrop-filter: blur(8px); }
        .fantasy-kicker-gem { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 50%; background: #eadbf7; color: var(--fantasy-purple); }
        .fantasy-title { margin: 0; color: var(--fantasy-plum); font: 900 clamp(4.2rem,8.2vw,7.35rem)/.79 'Barlow Condensed',sans-serif; letter-spacing: -.048em; text-shadow: 0 2px rgba(255,249,241,.8); }
        .fantasy-title span { color: var(--fantasy-royal); }
        .fantasy-script { margin: 17px 0 0; color: #6a3782; font: italic 700 clamp(22px,3vw,31px)/1 'DM Sans',sans-serif; letter-spacing: -.04em; }
        .fantasy-intro { max-width: 400px; margin: 19px 0 0; color: #5e5069; font-size: 14px; line-height: 1.8; }
        .fantasy-cta { min-height: 50px; display: inline-flex; align-items: center; justify-content: center; gap: 12px; padding: 0 22px; border: 0; border-radius: 999px; color: #fff9f1; background: linear-gradient(135deg,#6b35a5,#54217a); box-shadow: 0 9px 21px rgba(84,33,122,.24); font: 700 11px 'Space Mono',monospace; letter-spacing: .045em; transition: transform .2s, box-shadow .2s; }
        .fantasy-cta:hover { transform: translateY(-2px); box-shadow: 0 13px 25px rgba(84,33,122,.3); }
        .fantasy-assurance { color: #685d70; font-size: 10px; line-height: 1.6; }
        .fantasy-feedback { max-width: 440px; margin-top: 14px; border: 1px solid #e8bdae; border-radius: 12px; background: rgba(255,246,239,.94); padding: 10px 13px; color: #814339; font-size: 12px; line-height: 1.5; }
        .fantasy-proof-row { display: flex; flex-wrap: wrap; align-items: center; gap: 13px; margin-top: 28px; border-top: 1px solid rgba(84,33,122,.18); padding-top: 15px; color: #584969; font-size: 10px; font-weight: 600; }
        .fantasy-proof-row span { display: inline-flex; align-items: center; gap: 7px; }
        .fantasy-proof-row svg { color: var(--fantasy-royal); }
        .fantasy-proof-row i { width: 3px; height: 3px; border-radius: 50%; background: #ae8bc3; }
        .fantasy-hero-caption { position: absolute; right: 4.4%; bottom: 27px; display: flex; align-items: center; gap: 10px; color: rgba(53,19,68,.76); font: 700 8px 'Space Mono',monospace; letter-spacing: .075em; text-transform: uppercase; }
        .fantasy-caption-line { width: 42px; height: 1px; background: rgba(84,33,122,.38); }
        .fantasy-benefits-wrap { position: relative; z-index: 2; margin-top: -55px; }
        .fantasy-benefits { overflow: hidden; border: 1px solid rgba(84,33,122,.17); border-radius: 22px; background: rgba(255,250,246,.95); box-shadow: 0 17px 42px rgba(53,19,68,.1); backdrop-filter: blur(18px); }
        .fantasy-benefit { position: relative; display: flex; align-items: flex-start; gap: 13px; min-height: 125px; padding: 23px 18px; }
        .fantasy-benefit + .fantasy-benefit::before { position: absolute; top: 23px; bottom: 23px; left: 0; width: 1px; background: rgba(84,33,122,.14); content: ''; }
        .fantasy-benefit-icon { flex: none; display: grid; width: 37px; height: 37px; place-items: center; border: 1px solid rgba(84,33,122,.1); border-radius: 12px; color: var(--fantasy-purple); background: #f0e5f8; }
        .benefit-1 { background: #f7e5f1; color: #893e85; }
        .benefit-2 { background: #fbe8e8; color: #a34c7c; }
        .benefit-3 { background: #f8eadf; color: #9a573c; }
        .fantasy-benefit h2 { margin: 1px 0 6px; color: var(--fantasy-plum); font: 800 15px/1.1 'Barlow Condensed',sans-serif; }
        .fantasy-benefit p { max-width: 210px; margin: 0; color: #74647c; font-size: 10px; line-height: 1.65; }
        .fantasy-benefit-arrow { flex: none; margin-left: auto; color: #8d68a6; }
        .fantasy-content { padding-bottom: 45px; }
        .fantasy-section { border-bottom: 1px solid rgba(84,33,122,.12); padding: 78px 0; }
        .fantasy-section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; margin-bottom: 25px; }
        .fantasy-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 11px; font-size: 9px; letter-spacing: .1em; }
        .fantasy-eyebrow::before { width: 7px; height: 7px; border-radius: 50%; background: #a97bc4; content: ''; }
        .fantasy-section-heading h2, .fantasy-how-heading h2, .fantasy-visible h2, .fantasy-final-cta h2 { margin: 0; color: var(--fantasy-plum); font: 800 clamp(2.1rem,4vw,3.3rem)/.98 'Barlow Condensed',sans-serif; letter-spacing: -.025em; }
        .fantasy-section-heading > p { max-width: 260px; margin: 0 0 3px; color: var(--fantasy-muted); font-size: 11px; line-height: 1.7; }
        .fantasy-stat-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
        .fantasy-stat { position: relative; min-height: 140px; overflow: hidden; border: 1px solid rgba(84,33,122,.12); border-radius: 15px; background: #fffdfa; padding: 19px; box-shadow: 0 7px 18px rgba(53,19,68,.035); }
        .fantasy-stat::after { position: absolute; right: -30px; bottom: -56px; width: 115px; height: 115px; border: 1px solid rgba(185,154,239,.23); border-radius: 50%; box-shadow: 0 0 0 12px rgba(185,154,239,.055),0 0 0 25px rgba(185,154,239,.035); content: ''; }
        .fantasy-stat-index { position: absolute; top: 16px; right: 17px; color: #bd9ad0; font: 10px 'Space Mono',monospace; }
        .fantasy-stat p { margin: 0 0 20px; color: #766380; font: 700 9px 'Space Mono',monospace; letter-spacing: .06em; text-transform: uppercase; }
        .fantasy-stat strong { display: block; color: #927da0; font: 700 20px 'Barlow Condensed',sans-serif; }
        .fantasy-stat small { display: block; margin-top: 5px; color: #9b879f; font-size: 9px; }
        .fantasy-stat .fantasy-stat-note { margin-top: 8px; line-height: 1.5; }
        .fantasy-section-copy { max-width: 540px; margin: 9px 0 0; color: var(--fantasy-muted); font-size: 12px; line-height: 1.7; }
        .fantasy-text-link, .fantasy-outline-link { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; color: var(--fantasy-purple); font-size: 11px; font-weight: 700; }
        .fantasy-text-link { padding: 9px 0; }
        .fantasy-text-link:hover, .fantasy-outline-link:hover { color: #9b4e97; }
        .fantasy-data-state { min-height: 174px; display: grid; place-items: center; border: 1px solid rgba(84,33,122,.12); border-radius: 18px; background: radial-gradient(ellipse at 50% 0%,#f8ecf8,transparent 70%),#fffdfa; padding: 25px; text-align: center; }
        .fantasy-state-icon { display: grid; width: 37px; height: 37px; margin: 0 auto 10px; place-items: center; border-radius: 12px; color: var(--fantasy-purple); background: #efe3f6; }
        .fantasy-data-state h3 { margin: 0; color: var(--fantasy-plum); font: 800 18px 'Barlow Condensed',sans-serif; letter-spacing: .04em; }
        .fantasy-data-state p { max-width: 440px; margin: 7px auto 0; color: #81738a; font-size: 11px; line-height: 1.6; }
        .fantasy-how { display: grid; grid-template-columns: minmax(210px,.72fr) minmax(0,1.65fr); gap: 38px; align-items: center; }
        .fantasy-how-heading h2 { max-width: 390px; }
        .fantasy-how-heading > p { max-width: 300px; margin: 14px 0 0; color: var(--fantasy-muted); font-size: 11px; line-height: 1.75; }
        .fantasy-step-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; }
        .fantasy-step { position: relative; min-height: 174px; border: 1px solid rgba(84,33,122,.12); border-radius: 15px; background: rgba(255,253,250,.9); padding: 16px 14px; box-shadow: 0 8px 20px rgba(53,19,68,.04); transition: transform .2s, box-shadow .2s; }
        .fantasy-step:hover { transform: translateY(-3px); box-shadow: 0 13px 24px rgba(53,19,68,.085); }
        .fantasy-step-top { display: flex; align-items: center; justify-content: space-between; color: var(--fantasy-royal); }
        .fantasy-step-top span { color: #a17ab4; font: 700 10px 'Space Mono',monospace; }
        .fantasy-step h3 { margin: 25px 0 6px; color: var(--fantasy-plum); font: 800 18px 'Barlow Condensed',sans-serif; }
        .fantasy-step p { margin: 0; color: #7d6e84; font-size: 10px; line-height: 1.6; }
        .fantasy-step-arrow { position: absolute; top: 47%; right: -15px; z-index: 1; color: #7843a2; }
        .fantasy-visible { position: relative; display: grid; grid-template-columns: 1fr .8fr; align-items: center; gap: 35px; min-height: 320px; overflow: hidden; margin: 52px 0; border: 1px solid rgba(84,33,122,.12); border-radius: 24px; background: linear-gradient(112deg,#fff4f0 0%,#f8eafa 57%,#ece1fa 100%); padding: 39px 7%; }
        .fantasy-visible::after { position: absolute; inset: 0; background-image: radial-gradient(rgba(111,67,145,.16) .8px,transparent .8px); background-size: 19px 19px; opacity: .32; mask-image: linear-gradient(90deg,transparent,black); content: ''; pointer-events: none; }
        .fantasy-visible-copy { position: relative; z-index: 1; max-width: 480px; }
        .fantasy-visible h2 { max-width: 460px; font-size: clamp(2.2rem,4vw,3.3rem); }
        .fantasy-visible-copy > p { max-width: 410px; margin: 13px 0 20px; color: #75657e; font-size: 12px; line-height: 1.75; }
        .fantasy-outline-link { min-height: 37px; border: 1px solid rgba(84,33,122,.25); border-radius: 999px; padding: 0 14px; background: rgba(255,249,241,.48); }
        .fantasy-visible-art { position: relative; z-index: 1; display: grid; min-height: 220px; place-items: center; }
        .fantasy-orbit { position: absolute; width: 180px; height: 180px; border: 1px solid rgba(107,53,165,.2); border-radius: 50%; transform: rotate(-28deg) scaleY(.55); }
        .orbit-two { width: 240px; height: 240px; border-color: rgba(107,53,165,.12); transform: rotate(36deg) scaleY(.53); }
        .fantasy-visible-glyph { display: grid; width: 119px; height: 119px; place-items: center; border: 1px solid rgba(255,255,255,.77); border-radius: 42% 48% 45% 50%; color: #fff4fc; background: radial-gradient(circle at 35% 27%,#a36ac6,#59227c 72%); box-shadow: 0 15px 40px rgba(84,33,122,.28),inset 0 2px 10px rgba(255,255,255,.32); font: 900 83px/.8 'Barlow Condensed',sans-serif; transform: rotate(-7deg); }
        .fantasy-sparkle { position: absolute; color: #9a65c1; }
        .sparkle-a { top: 24%; left: 24%; font-size: 20px; }
        .sparkle-b { right: 18%; bottom: 24%; font-size: 30px; color: #bf79ab; }
        .fantasy-art-label { position: absolute; right: 2%; top: 13%; color: #784999; font: 700 8px/1.55 'Space Mono',monospace; letter-spacing: .09em; transform: rotate(8deg); }
        .fantasy-final-cta { position: relative; overflow: hidden; margin: 62px 0 45px; border: 1px solid rgba(185,154,239,.22); border-radius: 24px; background: linear-gradient(116deg,#f3e5f8,#fff0ea 60%,#f9e5f1); padding: 53px 22px; text-align: center; }
        .fantasy-final-cta::before, .fantasy-final-cta::after { position: absolute; width: 210px; height: 210px; border: 1px solid rgba(107,53,165,.14); border-radius: 50%; content: ''; }
        .fantasy-final-cta::before { top: -140px; left: -60px; box-shadow: 0 0 0 18px rgba(107,53,165,.035),0 0 0 40px rgba(107,53,165,.025); }
        .fantasy-final-cta::after { right: -65px; bottom: -165px; }
        .fantasy-final-cta h2 { font-size: clamp(2.5rem,5vw,4rem); }
        .fantasy-final-cta p { max-width: 460px; margin: 12px auto 19px; color: #75657e; font-size: 12px; line-height: 1.7; }
        .fantasy-final-mark { position: absolute; top: 20px; right: 22%; color: rgba(107,53,165,.35); font-size: 31px; }
        .fantasy-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(84,33,122,.1); color: #87738f; font-size: 10px; }
        .fantasy-footer span:first-child { color: var(--fantasy-plum); font: 900 15px 'Barlow Condensed',sans-serif; letter-spacing: .02em; }
        .fantasy-mobile-nav { border-top: 1px solid rgba(84,33,122,.16); background: rgba(255,249,241,.96); box-shadow: 0 -8px 25px rgba(53,19,68,.09); backdrop-filter: blur(15px); }
        .fantasy-mobile-link { display: flex; min-height: 43px; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 0; border-radius: 10px; background: transparent; color: #84738b; font-size: 9px; font-weight: 600; }
        .fantasy-mobile-link.is-active { color: var(--fantasy-purple); background: #efe4f6; }
        @media (max-width: 767px) {
          .fantasy-hero, .fantasy-hero-content { min-height: 750px; }
          .fantasy-hero-art { background-size: 142% auto; background-position: 56% bottom; background-repeat: no-repeat; }
          .fantasy-hero-wash { background: linear-gradient(180deg,rgba(255,249,241,.97) 0%,rgba(255,249,241,.94) 40%,rgba(255,249,241,.62) 59%,rgba(255,249,241,.04) 79%),linear-gradient(0deg,rgba(84,33,122,.1),transparent 40%); }
          .fantasy-hero-content { align-items: flex-start; padding-top: 49px; padding-bottom: 210px; }
          .fantasy-title { font-size: clamp(4rem,18vw,5.7rem); line-height: .79; }
          .fantasy-intro { max-width: 335px; margin-top: 13px; font-size: 12px; line-height: 1.65; }
          .fantasy-script { margin-top: 13px; font-size: 23px; }
          .fantasy-kicker { margin-bottom: 17px; font-size: 9px; }
          .fantasy-proof-row { max-width: 350px; gap: 9px 11px; margin-top: 20px; font-size: 9px; }
          .fantasy-proof-row i { display: none; }
          .fantasy-assurance { max-width: 245px; }
          .fantasy-hero-caption { right: 15px; bottom: 18px; font-size: 7px; }
          .fantasy-benefits-wrap { margin-top: -17px; }
          .fantasy-benefits { border-radius: 18px; }
          .fantasy-benefit { min-height: 95px; padding: 16px 13px; }
          .fantasy-benefit:nth-child(odd)::before { display: none; }
          .fantasy-benefit + .fantasy-benefit::before { top: 14px; bottom: 14px; }
          .fantasy-benefit-icon { width: 32px; height: 32px; border-radius: 10px; }
          .fantasy-benefit h2 { font-size: 14px; }
          .fantasy-benefit p { font-size: 9px; }
          .fantasy-benefit-arrow { display: none; }
          .fantasy-section { padding: 51px 0; }
          .fantasy-section-heading { align-items: flex-start; flex-direction: column; gap: 11px; margin-bottom: 18px; }
          .fantasy-section-heading > p { max-width: 340px; }
          .fantasy-stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
          .fantasy-stat { min-height: 125px; padding: 15px; }
          .fantasy-stat p { margin-bottom: 16px; font-size: 8px; }
          .fantasy-stat strong { font-size: 18px; }
          .fantasy-how { grid-template-columns: 1fr; gap: 23px; }
          .fantasy-step-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
          .fantasy-step { min-height: 150px; padding: 14px; }
          .fantasy-step h3 { margin-top: 18px; }
          .fantasy-step-arrow { display: none; }
          .fantasy-visible { grid-template-columns: 1fr; gap: 4px; margin: 38px 0; padding: 27px 22px 12px; }
          .fantasy-visible-art { min-height: 190px; }
          .fantasy-visible-glyph { width: 95px; height: 95px; font-size: 68px; }
          .fantasy-final-cta { margin: 40px 0 30px; padding: 42px 19px; }
          .fantasy-final-mark { right: 9%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .chog-home-redesign *, .chog-home-redesign *::before, .chog-home-redesign *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
        }
      `}</style>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="fantasy-eyebrow">{children}</div>;
}

function LiveDataState({ title, description }: { title: string; description: string }) {
  return (
    <div className="fantasy-data-state" role="status" data-testid="state-live-sales-unavailable">
      <div>
        <span className="fantasy-state-icon"><Sparkles size={17} /></span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
