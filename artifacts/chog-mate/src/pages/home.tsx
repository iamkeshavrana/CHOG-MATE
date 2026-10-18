import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import {
  getGetCollectionStatsQueryKey,
  getGetLiveSalesQueryKey,
  getLiveSales,
  useGetCollectionStats,
} from '@workspace/api-client-react';
import { AppShell, Eyebrow } from '@/components/shared';

const WalletAuthPanel = lazy(() => import('@/components/wallet-auth'));
const chogGif = `${import.meta.env.BASE_URL}chog-wave-transparent.gif`;
const secondaryChogGif = `${import.meta.env.BASE_URL}chog-blind-transparent.gif`;
const secondaryChogGifPage = 'https://tenor.com/view/waweonline-wawe-monad-chog-gmonad-gif-7405421530750396964';

export default function HomePage() {
  const [showWallet, setShowWallet] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [canScrollSalesLeft, setCanScrollSalesLeft] = useState(false);
  const [canScrollSalesRight, setCanScrollSalesRight] = useState(false);
  const salesScrollerRef = useRef<HTMLDivElement>(null);
  const sales = useInfiniteQuery({
    queryKey: getGetLiveSalesQueryKey(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getLiveSales(pageParam ? { next: pageParam } : undefined, { signal }),
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    refetchInterval: 60_000,
    retry: 1,
  });
  const saleItems = sales.data?.pages.flatMap((page) => page.sales) ?? [];
  const stats = useGetCollectionStats({
    query: { queryKey: getGetCollectionStatsQueryKey(), refetchInterval: 120_000, retry: 1 },
  });

  useLayoutEffect(() => {
    const scroller = salesScrollerRef.current;
    if (!scroller) return;

    const updateScrollButtons = () => {
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      setCanScrollSalesLeft(scroller.scrollLeft > 1);
      setCanScrollSalesRight(
        scroller.scrollLeft < maxScrollLeft - 1 || Boolean(sales.hasNextPage),
      );
    };

    updateScrollButtons();
    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(scroller);
    return () => resizeObserver.disconnect();
  }, [saleItems.length, sales.hasNextPage]);

  function scrollSales(direction: -1 | 1) {
    const scroller = salesScrollerRef.current;
    if (!scroller) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    if (
      direction > 0 &&
      scroller.scrollLeft >= maxScrollLeft - 2 &&
      sales.hasNextPage &&
      !sales.isFetchingNextPage
    ) {
      void sales.fetchNextPage();
      return;
    }

    scroller.scrollBy({
      left: direction * Math.max(240, scroller.clientWidth * 0.8),
      behavior: 'smooth',
    });
  }

  function connect() {
    setFeedback('');
    setShowWallet(true);
  }

  return (
    <AppShell>
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
            <div className="mt-7 flex items-center gap-3">
              <span className="h-px w-10 bg-[#a78aef]" />
              <p className="display text-[19px] font-bold tracking-[-.03em] text-[#624490]">
                Meet. Match. Chog.
              </p>
            </div>
            <p className="mt-5 max-w-[470px] text-[16px] leading-7 text-[#72667a]">
              Your Chog is already one of a kind. Meet the people who get it —
              for dates, friendships, ideas, and everything in between.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {showWallet ? (
                <Suspense
                  fallback={
                    <button
                      disabled
                      className="button-primary min-h-[54px] rounded-full px-7 text-sm font-bold opacity-70"
                    >
                      Preparing wallet…
                    </button>
                  }
                >
                  <WalletAuthPanel autoOpen />
                </Suspense>
              ) : (
                <>
                  <button
                    onClick={connect}
                    className="button-primary inline-flex min-h-[54px] items-center gap-3 rounded-full px-7 text-sm font-bold"
                    data-testid="button-connect-wallet"
                  >
                    START DISCOVERING
                    <ArrowDownRight size={17} />
                  </button>
                  <span className="text-xs text-[#877b8e]">
                    A signature proves ownership. It never moves funds.
                  </span>
                </>
              )}
            </div>
            {feedback && (
              <p
                className="mt-4 max-w-lg rounded-2xl border border-[#edc8bc] bg-[#fff2ec] px-4 py-3 text-sm leading-5 text-[#8b4232]"
                role="alert"
                data-testid="status-wallet-error"
              >
                {feedback}
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

        <section
          className="home-section mx-auto max-w-[1240px] border-t border-[#ded4c6] py-12 sm:py-16"
          aria-labelledby="stats-heading"
        >
          <div className="mb-7">
            <Eyebrow>Chog Genesis, at a glance</Eyebrow>
            <h2
              id="stats-heading"
              className="display text-[31px] font-extrabold leading-tight text-[#24133f] sm:text-[40px]"
            >
              Collection statistics.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Floor price"
              value={
                stats.data
                  ? stats.data.floorPrice
                    ? `${formatAmount(stats.data.floorPrice.amount)} ${stats.data.floorPrice.currency}`
                    : 'No active listings'
                  : 'Unavailable'
              }
              loading={stats.isLoading}
              error={stats.isError}
            />
            <StatCard
              label="Top offer"
              value={
                stats.data
                  ? stats.data.topOffer
                    ? `${formatAmount(stats.data.topOffer.amount)} ${stats.data.topOffer.currency}`
                    : 'No active offers'
                  : 'Unavailable'
              }
              loading={stats.isLoading}
              error={stats.isError}
              detail="Best active collection offer on OpenSea."
            />
            <StatCard
              label="Total volume"
              value={
                stats.data?.totalVolume
                  ? `${formatCompactAmount(stats.data.totalVolume.amount)} ${stats.data.totalVolume.currency}`
                  : 'Unavailable'
              }
              loading={stats.isLoading}
              error={stats.isError}
            />
            <StatCard
              label="Total holders"
              value={
                stats.data?.totalHolders != null
                  ? stats.data.totalHolders.toLocaleString()
                  : 'Unavailable'
              }
              loading={stats.isLoading}
              error={stats.isError}
            />
          </div>
          {stats.data && (
            <p className="mt-4 text-right text-[10px] text-[#968a9b]">
              Data updated {formatTimeAgo(stats.data.updatedAt)}
            </p>
          )}
        </section>

        <section
          className="home-section mx-auto max-w-[1240px] border-t border-[#ded4c6] py-12 sm:py-16"
          aria-labelledby="sales-heading"
        >
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>Chog Genesis marketplace activity</Eyebrow>
              <h2
                id="sales-heading"
                className="display text-[31px] font-extrabold leading-tight text-[#24133f] sm:text-[40px]"
              >
                Real live Chog sales.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#786d80]">
                Recent sales from OpenSea’s collection feed. No sample listings,
                no made-up prices. Scroll left to right to browse older sales.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-end">
              {saleItems.length > 0 && (
                <div className="home-sales-controls" role="group" aria-label="Browse live sales">
                  <button
                    type="button"
                    className="home-sales-arrow"
                    aria-label="Scroll toward newer sales"
                    disabled={!canScrollSalesLeft}
                    onClick={() => scrollSales(-1)}
                    data-testid="button-live-sales-left"
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="home-sales-arrow"
                    aria-label="Scroll toward older sales"
                    disabled={!canScrollSalesRight}
                    onClick={() => scrollSales(1)}
                    data-testid="button-live-sales-right"
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>
              )}
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

          {sales.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading live sales">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="surface overflow-hidden rounded-[24px]">
                  <div className="skeleton aspect-[1.28] rounded-none" />
                  <div className="space-y-3 p-5">
                    <div className="skeleton h-4 w-2/5 rounded-full" />
                    <div className="skeleton h-3 w-3/5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : sales.isError ? (
            <LiveDataState
              title="LIVE SALES UNAVAILABLE"
              description="The marketplace feed isn’t available right now. We won’t substitute sample sales."
              testId="state-live-sales-unavailable"
            />
          ) : saleItems.length === 0 ? (
            <LiveDataState
              title="NO LIVE SALES"
              description="Live Chog sales will appear here."
              testId="state-no-live-sales"
            />
          ) : (
            <>
              <div
                ref={salesScrollerRef}
                className="home-sales-scroller"
                role="region"
                aria-label="Live Chog sale history. Scroll left and right to browse sales."
                tabIndex={0}
                onScroll={(event) => {
                  const scroller = event.currentTarget;
                  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
                  setCanScrollSalesLeft(scroller.scrollLeft > 1);
                  setCanScrollSalesRight(
                    scroller.scrollLeft < maxScrollLeft - 1 || Boolean(sales.hasNextPage),
                  );
                  if (
                    scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 180 &&
                    sales.hasNextPage &&
                    !sales.isFetchingNextPage
                  ) {
                    void sales.fetchNextPage();
                  }
                }}
              >
                <div className="home-sales-track">
                {saleItems.map((sale) => (
                  <a
                    key={`${sale.tokenId}-${sale.timestamp}`}
                    href={sale.saleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="home-sale-card surface group overflow-hidden rounded-[24px] transition duration-200 hover:-translate-y-1"
                    data-testid={`card-live-sale-${sale.tokenId}`}
                  >
                    <div className="home-sale-art relative aspect-[1.28] overflow-hidden">
                      {sale.imageUrl ? (
                        <img
                          src={sale.imageUrl}
                          alt={`Chog #${sale.tokenId}`}
                          loading="lazy"
                          decoding="async"
                          className="home-sale-image"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-[#8e8097]">
                          <ImageOff size={24} />
                        </div>
                      )}
                      <span className="absolute left-4 top-4 rounded-full border border-white/75 bg-white/85 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.13em] text-[#5d3987] shadow-sm backdrop-blur">
                        Recent sale
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 p-5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a7c91]">
                          Chog Genesis
                        </p>
                        <h3 className="display mt-1 text-xl font-extrabold text-[#24133f]">
                          Chog #{sale.tokenId}
                        </h3>
                        <p className="mt-2 text-xs text-[#81768b]">
                          {sale.marketplace ?? 'Marketplace not reported'} ·{' '}
                          {formatTimeAgo(sale.timestamp)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-[#f1ebff] px-3 py-2 text-sm font-extrabold text-[#6844bb]">
                        {formatAmount(sale.price)} {sale.currency}
                      </span>
                    </div>
                  </a>
                ))}
                </div>
              </div>
              {sales.isFetchingNextPage && (
                <p className="mt-3 text-xs text-[#968a9b]" role="status">
                  Loading older sales…
                </p>
              )}
              <p className="mt-4 text-right text-[10px] text-[#968a9b]">
                Feed updated {formatTimeAgo(sales.data?.pages[0]?.updatedAt ?? '')}
              </p>
            </>
          )}
        </section>

        <section
          className="home-section mx-auto max-w-[1240px] border-t border-[#ded4c6] py-12 sm:py-16"
          aria-labelledby="how-heading"
        >
          <div className="mb-8 max-w-2xl">
            <Eyebrow>From Chog holder to Chog Mate</Eyebrow>
            <h2
              id="how-heading"
              className="display text-[31px] font-extrabold leading-tight text-[#24133f] sm:text-[40px]"
            >
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
              href={secondaryChogGifPage}
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
              onClick={connect}
              className="button-primary mt-6 inline-flex min-h-[50px] items-center gap-2 rounded-full px-6 text-sm font-bold"
              data-testid="button-final-cta"
            >
              START DISCOVERING <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function LiveDataState({
  title,
  description,
  testId,
}: {
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <div
      className="home-data-state surface flex min-h-44 flex-col items-center justify-center rounded-[24px] px-6 py-9 text-center"
      role="status"
      data-testid={testId}
    >
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-[#f1ebff] text-[#7047ff]">
        <Sparkles size={18} />
      </span>
      <h3 className="display text-lg font-extrabold text-[#24133f]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#81758a]">{description}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  error,
  detail,
}: {
  label: string;
  value: string;
  loading: boolean;
  error: boolean;
  detail?: string;
}) {
  return (
    <article className="home-stat surface rounded-[21px] p-5" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#806b99]">{label}</p>
      {loading ? (
        <div className="skeleton mt-4 h-7 w-3/4 rounded-full" />
      ) : (
        <p className={`display mt-3 break-words text-[21px] font-extrabold leading-tight ${error ? 'text-[#987c9c]' : 'text-[#24133f]'}`}>
          {value}
        </p>
      )}
      {error && <p className="mt-2 text-[10px] text-[#9a7180]">Live data unavailable</p>}
      {detail && !loading && <p className="mt-2 text-[10px] leading-4 text-[#95899b]">{detail}</p>}
    </article>
  );
}

function formatAmount(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(2);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatCompactAmount(amount: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(2);
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTimeAgo(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'time unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
