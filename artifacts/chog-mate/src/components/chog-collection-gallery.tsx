import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ImageOff, RefreshCw } from 'lucide-react';
import { Eyebrow } from '@/components/shared';

interface ChogCollectionItem {
  tokenId: string;
  name: string | null;
  imageUrls: string[];
  marketplaceUrl: string | null;
}

interface CollectionPage {
  items: ChogCollectionItem[];
  next: string | null;
  total: number | null;
}

const PAGE_SIZE = 50;

export function ChogCollectionGallery() {
  const [items, setItems] = useState<ChogCollectionItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (cursor: string | null, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) query.set('next', cursor);
      const response = await fetch(`/api/nft/collection?${query.toString()}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Collection request failed');

      const page = (await response.json()) as CollectionPage;
      if (!Array.isArray(page.items) || !(page.next === null || typeof page.next === 'string')) {
        throw new Error('Collection response was incomplete');
      }

      setItems((current) => {
        const previous = reset ? [] : current;
        const seen = new Set(previous.map((item) => item.tokenId));
        return [
          ...previous,
          ...page.items.filter((item) => {
            if (!item || typeof item.tokenId !== 'string' || seen.has(item.tokenId)) {
              return false;
            }
            seen.add(item.tokenId);
            return true;
          }),
        ];
      });
      setNext(page.next);
      setTotal(typeof page.total === 'number' && Number.isFinite(page.total) ? page.total : null);
    } catch {
      setError('We couldn’t load the collection images. Please try again.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(null, true);
  }, [loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !next || loading || error || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadPage(next);
      },
      { rootMargin: '900px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, loadPage, loading, next]);

  const retryOrContinue = () => {
    if (items.length === 0 && !next) void loadPage(null, true);
    else if (next) void loadPage(next);
  };

  return (
    <section className="relative z-[1] mx-auto max-w-[1240px] pb-16 pt-12 sm:pt-16" aria-labelledby="collection-heading">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Eyebrow>Real Chog Genesis NFTs</Eyebrow>
          <h2 id="collection-heading" className="display text-[32px] font-extrabold leading-tight text-white sm:text-[42px]">
            Meet the collection.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100/75 sm:text-[15px]">
            Browse verified artwork from the Chog Genesis collection, loaded page by page from its live NFT index.
          </p>
        </div>
        <a
          href="https://opensea.io/collection/chog-genesis"
          target="_blank"
          rel="noreferrer"
          className="settings-tab inline-flex w-fit items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold"
        >
          View collection <ArrowUpRight size={14} />
        </a>
      </div>

      {items.length > 0 && (
        <p className="mb-4 text-xs font-medium text-violet-100/65" aria-live="polite">
          {total
            ? `${items.length.toLocaleString()} of ${total.toLocaleString()} collection NFTs loaded`
            : `${items.length.toLocaleString()} collection NFTs loaded`}
        </p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <a
              key={item.tokenId}
              href={item.marketplaceUrl ?? 'https://opensea.io/collection/chog-genesis'}
              target="_blank"
              rel="noreferrer"
              className="surface group overflow-hidden rounded-[20px] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(8,4,24,.4)]"
              aria-label={`Open ${item.name ?? `Chog Genesis #${item.tokenId}`} on OpenSea`}
            >
              <CollectionImage item={item} />
              <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold uppercase tracking-[.12em] text-violet-700">Chog Genesis</p>
                  <p className="mt-1 truncate text-sm font-extrabold text-[#2b1946]">
                    {item.name || `Chog #${item.tokenId}`}
                  </p>
                </div>
                <ArrowUpRight size={15} className="shrink-0 text-violet-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </a>
          ))}
        </div>
      )}

      {items.length === 0 && loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" aria-label="Loading collection artwork">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="surface overflow-hidden rounded-[20px]">
              <div className="skeleton aspect-square" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-2.5 w-2/5 rounded-full" />
                <div className="skeleton h-4 w-3/4 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="surface mx-auto max-w-xl rounded-[24px] px-6 py-7 text-center">
          <p className="text-sm font-semibold text-[#514177]">{error}</p>
          <button
            type="button"
            onClick={retryOrContinue}
            disabled={loading}
            className="button-soft mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Try again
          </button>
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="surface mx-auto flex max-w-xl flex-col items-center rounded-[24px] px-6 py-10 text-center">
          <ImageOff size={22} className="text-violet-600" />
          <p className="mt-3 text-sm font-semibold text-[#514177]">No collection images were returned.</p>
        </div>
      )}

      {next && (
        <div ref={sentinelRef} className="flex min-h-20 flex-col items-center justify-center gap-3 py-7">
          {loading ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-violet-100/75" role="status">
              <RefreshCw size={14} className="animate-spin" /> Loading more Chogs…
            </p>
          ) : (
            <button
              type="button"
              onClick={retryOrContinue}
              className="button-soft rounded-full px-5 py-2.5 text-xs font-bold"
            >
              Load more collection
            </button>
          )}
        </div>
      )}

      {!error && !loading && items.length > 0 && !next && total !== null && items.length < total && (
        <p className="surface mx-auto mt-6 max-w-2xl rounded-2xl px-5 py-4 text-center text-xs leading-5 text-[#624c80]" role="status">
          The index currently returned {items.length.toLocaleString()} of {total.toLocaleString()} on-chain NFTs. Some collection artwork may not be indexed yet.
        </p>
      )}

      {!error && !loading && items.length > 0 && !next && total !== null && items.length >= total && (
        <p className="mt-5 text-center text-xs font-semibold text-violet-100/65" role="status">
          All {total.toLocaleString()} collection NFTs are available above.
        </p>
      )}
    </section>
  );
}

function CollectionImage({ item }: { item: ChogCollectionItem }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = item.imageUrls[sourceIndex];

  if (!source) {
    return (
      <div className="grid aspect-square place-items-center bg-[radial-gradient(ellipse_at_30%_20%,#7d55ca,#21143b_72%)] px-5 text-center text-violet-100/75">
        <span className="flex flex-col items-center gap-2 text-xs font-semibold">
          <ImageOff size={20} /> Artwork unavailable
        </span>
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={item.name ?? `Chog Genesis #${item.tokenId}`}
      loading="lazy"
      decoding="async"
      className="aspect-square w-full object-contain"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}
