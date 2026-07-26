import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useAffinityGroups } from '@/lib/sports';
import { MARKET_CATEGORIES, productCategory } from '@/lib/products';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useTranslation } from '@/i18n/I18nProvider';
import btgPactualMarkUrl from '@/assets/official-stores/marks/btg-pactual.svg?url';
import integralmedicaMarkUrl from '@/assets/official-stores/marks/integralmedica.svg?url';
import natuVidaMarkUrl from '@/assets/official-stores/marks/natu-vida.svg?url';
import nikeMarkUrl from '@/assets/official-stores/marks/nike.svg?url';
import { ProductCard } from './ProductCard';
import { PurchasedProducts } from './PurchasedProducts';
import {
  isSponsoredMarketProduct,
  marketProductStoreKeys,
  officialMarketStoreKeys,
  promotedMarketProducts,
} from './marketMerchandising';
import {
  useMarketProducts,
  useOfficialMarketStores,
  type MarketProduct,
  type OfficialMarketStore,
} from './useMarket';

type MarketTab = 'mercado' | 'compras';

const OFFICIAL_STORE_MARKS: Record<string, string> = {
  'natu-vida': natuVidaMarkUrl,
  integralmedica: integralmedicaMarkUrl,
  nike: nikeMarkUrl,
  'btg-pactual': btgPactualMarkUrl,
};

function officialStoreMarkUrl(store: OfficialMarketStore): string | null {
  return OFFICIAL_STORE_MARKS[store.slug] ?? null;
}

function filterProducts(
  products: MarketProduct[],
  filters: {
    term: string;
    category: string | null;
    sport: string | null;
    freeOnly: boolean;
    officialOnly: boolean;
    selectedOfficialStoreKey: string | null;
    isOfficialProduct: (product: MarketProduct) => boolean;
  },
): MarketProduct[] {
  const {
    term,
    category,
    sport,
    freeOnly,
    officialOnly,
    selectedOfficialStoreKey,
    isOfficialProduct,
  } = filters;

  return products.filter((product) => {
    if (category && productCategory(product) !== category) return false;
    if (sport && !product.sports.includes(sport)) return false;
    if (freeOnly && product.price > 0) return false;
    if (officialOnly && !isOfficialProduct(product)) return false;
    if (officialOnly && selectedOfficialStoreKey && !marketProductStoreKeys(product).includes(selectedOfficialStoreKey)) return false;
    if (term) {
      const haystack = `${product.name} ${product.description ?? ''} ${product.storeName} ${product.creatorName}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function ProductsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: MarketTab = searchParams.get('aba') === 'compras' ? 'compras' : 'mercado';
  const setTab = (next: MarketTab) => {
    setSearchParams(next === 'compras' ? { aba: 'compras' } : {}, { replace: true });
  };

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [selectedOfficialStoreKey, setSelectedOfficialStoreKey] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const productsQuery = useMarketProducts();
  const officialStoresQuery = useOfficialMarketStores();
  const { groups } = useAffinityGroups();

  const isLoading = productsQuery.isLoading;
  const isError = productsQuery.isError;
  const products = useMemo((): MarketProduct[] => productsQuery.data ?? [], [productsQuery.data]);
  const officialStores = useMemo((): OfficialMarketStore[] => officialStoresQuery.data ?? [], [officialStoresQuery.data]);

  const isOfficialProduct = useMemo(
    () => (product: MarketProduct) => isSponsoredMarketProduct(product, officialStores),
    [officialStores],
  );
  const promoted = useMemo(
    () => promotedMarketProducts(products, officialStores),
    [products, officialStores],
  );

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => filterProducts(products, {
      term,
      category,
      sport,
      freeOnly,
      officialOnly,
      selectedOfficialStoreKey,
      isOfficialProduct,
    }),
    [products, term, category, sport, freeOnly, officialOnly, selectedOfficialStoreKey, isOfficialProduct],
  );
  const hasActiveFilters = category !== null || sport !== null || freeOnly || officialOnly;
  const selectedOfficialStore = useMemo(() => {
    if (!selectedOfficialStoreKey) return null;
    return officialStores.find((store) => officialMarketStoreKeys(store).includes(selectedOfficialStoreKey)) ?? null;
  }, [officialStores, selectedOfficialStoreKey]);
  const selectedSportLabel = sport ? groups.find((group) => group.key === sport)?.label ?? sport : null;

  const TABS: { key: MarketTab; label: string }[] = [
    { key: 'mercado', label: t('market.tab.market') },
    { key: 'compras', label: t('market.tab.purchases') },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title={t('market.title')} showBackButton={false} />
      <div className="mx-auto w-full max-w-[720px]">
        <div className="grid grid-cols-2 px-4 pt-3" role="tablist" aria-label="Mercado e compras">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                'relative min-h-[40px] whitespace-nowrap pb-2 font-sans text-label transition-colors',
                tab === key ? 'text-on-surface' : 'text-on-surface-variant',
              )}
            >
              {label}
              {tab === key && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {tab === 'compras' && <PurchasedProducts onBrowse={() => setTab('mercado')} />}

        {tab === 'mercado' && (
          <>
            <div className="px-4 pt-4">
              <div className="relative flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('market.searchPlaceholder')}
                    aria-label={t('market.searchAria')}
                    className="min-h-[44px] w-full rounded-xl border border-outline-variant/40 bg-surface py-2 pl-11 pr-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  aria-expanded={filtersOpen}
                  aria-label={t('market.filters.open')}
                  className={clsx(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                    filtersOpen || hasActiveFilters
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant/40 bg-surface text-on-surface-variant',
                  )}
                >
                  <SlidersHorizontal size={18} aria-hidden />
                </button>
              </div>
            </div>

            <SponsorCarousel
              stores={officialStores}
              loading={officialStoresQuery.isLoading && officialStores.length === 0}
              activeStoreKey={selectedOfficialStoreKey}
              onSelect={(store) => {
                setOfficialOnly(true);
                setSelectedOfficialStoreKey(officialMarketStoreKeys(store)[0] ?? null);
                setSearch('');
              }}
            />

            {!isLoading && promoted.length > 0 && (
              <section className="mt-5" aria-labelledby="market-featured-title">
                <div className="flex items-end justify-between gap-3 px-4">
                  <div>
                    <h2 id="market-featured-title" className="font-sans text-title text-on-surface">
                      {t('market.featured.title')}
                    </h2>
                    <p className="font-sans text-body-sm text-on-surface-variant">
                      {t('market.featured.subtitle')}
                    </p>
                  </div>
                  <Link
                    to="/produtos/destaques"
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1 font-sans text-label text-primary"
                  >
                    {t('market.featured.more')}
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </div>
                <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {promoted.map((product) => (
                    <div key={product.id} className="w-44 shrink-0 snap-start">
                      <ProductCard product={product} promoted />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-5" aria-labelledby="market-categories-title">
              <h2 id="market-categories-title" className="px-4 font-sans text-title text-on-surface">
                {t('market.categories')}
              </h2>
              <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  aria-pressed={category === null}
                  onClick={() => setCategory(null)}
                  className={clsx(
                    'min-h-[40px] shrink-0 rounded-full px-4 font-sans text-label transition-colors',
                    category === null
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  {t('common.all')}
                </button>
                {MARKET_CATEGORIES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={category === key}
                    onClick={() => setCategory(category === key ? null : key)}
                    className={clsx(
                      'min-h-[40px] shrink-0 rounded-full px-4 font-sans text-label transition-colors',
                      category === key
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {hasActiveFilters && (
              <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selectedOfficialStore && (
                  <ActiveFilterChip
                    label={selectedOfficialStore.name}
                    onClear={() => {
                      setSelectedOfficialStoreKey(null);
                      setOfficialOnly(false);
                    }}
                  />
                )}
                {officialOnly && !selectedOfficialStore && (
                  <ActiveFilterChip label={t('market.officialStore')} onClear={() => setOfficialOnly(false)} />
                )}
                {category && (
                  <ActiveFilterChip
                    label={MARKET_CATEGORIES.find((item) => item.key === category)?.label ?? category}
                    onClear={() => setCategory(null)}
                  />
                )}
                {sport && (
                  <ActiveFilterChip label={selectedSportLabel ?? sport} onClear={() => setSport(null)} />
                )}
                {freeOnly && <ActiveFilterChip label={t('market.freeOnly')} onClear={() => setFreeOnly(false)} />}
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null);
                    setSport(null);
                    setFreeOnly(false);
                    setOfficialOnly(false);
                    setSelectedOfficialStoreKey(null);
                  }}
                  className="shrink-0 rounded-full px-2 font-sans text-counter text-on-surface-variant"
                >
                  {t('market.filters.clear')}
                </button>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center py-16">
                <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label={t('common.loading')} />
              </div>
            )}

            {isError && !isLoading && (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="font-sans text-body text-on-surface-variant">{t('market.loadError')}</p>
                <button
                  type="button"
                  onClick={() => productsQuery.refetch()}
                  className="min-h-[44px] rounded-full bg-primary px-6 font-sans text-label text-on-primary"
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            {!isLoading && !isError && visible.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
                <p className="font-sans text-title text-on-surface">{t('market.empty.title')}</p>
                <p className="font-sans text-body-sm text-on-surface-variant">
                  {selectedOfficialStore
                    ? t('market.empty.officialStore').replace('{store}', selectedOfficialStore.name)
                    : t('market.empty.description')}
                </p>
              </div>
            )}

            {!isLoading && !isError && visible.length > 0 && (
              <>
                <h2 className="mt-5 px-4 font-sans text-title text-on-surface">
                  {t('market.products')}
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-3 px-4">
                {visible.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isOfficialStore={isOfficialProduct(product)}
                  />
                ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {tab === 'mercado' && (
        <BottomSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t('market.filters.title')}
          description={t('market.filters.description')}
        >
          <div className="space-y-6 px-5 pb-6 pt-1">
            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.category')}</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {MARKET_CATEGORIES.map(({ key, label, icon: Icon }) => {
                  const active = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(active ? null : key)}
                      className={clsx(
                        'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-outline-variant/30 bg-surface-container text-on-surface-variant',
                      )}
                    >
                      <Icon size={22} aria-hidden />
                      <span className="font-sans text-counter">{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.price')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption active={!freeOnly} onClick={() => setFreeOnly(false)}>{t('common.all')}</FilterOption>
                <FilterOption active={freeOnly} onClick={() => setFreeOnly(true)}>{t('market.freeOnly')}</FilterOption>
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.store')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption
                  active={!officialOnly}
                  onClick={() => {
                    setOfficialOnly(false);
                    setSelectedOfficialStoreKey(null);
                  }}
                >
                  {t('common.all')}
                </FilterOption>
                <FilterOption
                  active={officialOnly && selectedOfficialStoreKey === null}
                  onClick={() => {
                    setOfficialOnly(true);
                    setSelectedOfficialStoreKey(null);
                  }}
                >
                  {t('market.officialStore')}
                </FilterOption>
              </div>
            </section>

            <section>
              <h2 className="font-sans text-eyebrow uppercase text-on-surface-variant">{t('market.filters.sport')}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterOption active={sport === null} onClick={() => setSport(null)}>{t('common.all')}</FilterOption>
                {groups.map(({ key, label }) => (
                  <FilterOption key={key} active={sport === key} onClick={() => setSport(sport === key ? null : key)}>
                    {label}
                  </FilterOption>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => {
                setCategory(null);
                setSport(null);
                setFreeOnly(false);
                setOfficialOnly(false);
                setSelectedOfficialStoreKey(null);
              }}
              className="min-h-[44px] w-full rounded-lg border border-outline-variant/50 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high"
            >
              {t('market.filters.clear')}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function SponsorCarousel({
  stores,
  loading,
  activeStoreKey,
  onSelect,
}: {
  stores: OfficialMarketStore[];
  loading: boolean;
  activeStoreKey: string | null;
  onSelect: (store: OfficialMarketStore) => void;
}) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const pressStartedAtRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || stores.length < 2) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        const next = (current + 1) % stores.length;
        const track = trackRef.current;
        const target = track?.children.item(next) as HTMLElement | null;
        if (track && target) {
          track.scrollTo({
            left: target.offsetLeft - track.offsetLeft,
            behavior: 'smooth',
          });
        }
        return next;
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [paused, stores.length]);

  if (!loading && stores.length === 0) return null;

  return (
    <section className="mt-5" aria-labelledby="market-sponsors-title">
      <div className="flex items-end justify-between gap-3 px-4">
        <h2 id="market-sponsors-title" className="font-sans text-title text-on-surface">
          {t('market.sponsors')}
        </h2>
        <p className="font-sans text-counter font-normal text-on-surface-variant">
          {t('market.sponsors.hint')}
        </p>
      </div>
      {loading ? (
        <div className="mx-4 mt-3 aspect-[16/6] animate-pulse rounded-2xl bg-surface-container" aria-hidden />
      ) : (
        <>
          <div
            ref={trackRef}
            onPointerDown={() => {
              pressStartedAtRef.current = Date.now();
              setPaused(true);
            }}
            onPointerUp={() => setPaused(false)}
            onPointerCancel={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
            onScroll={(event) => {
              const track = event.currentTarget;
              const targetLeft = track.scrollLeft + track.offsetLeft;
              const nearest = Array.from(track.children).reduce(
                (best, child, index) => {
                  const distance = Math.abs((child as HTMLElement).offsetLeft - targetLeft);
                  return distance < best.distance ? { index, distance } : best;
                },
                { index: 0, distance: Number.POSITIVE_INFINITY },
              );
              setActiveIndex(nearest.index);
            }}
            className="mt-3 flex snap-x snap-mandatory overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {stores.map((store) => {
              const active = activeStoreKey
                ? officialMarketStoreKeys(store).includes(activeStoreKey)
                : false;
              const markUrl = officialStoreMarkUrl(store) || store.logoUrl;
              return (
                <button
                  key={store.id}
                  type="button"
                  aria-pressed={active}
                  onClick={(event) => {
                    if (
                      event.detail === 0 ||
                      Date.now() - pressStartedAtRef.current < 450
                    ) {
                      onSelect(store);
                    }
                  }}
                  className={clsx(
                    'relative aspect-[16/6] w-full shrink-0 snap-center overflow-hidden rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active && 'ring-2 ring-primary',
                  )}
                >
                  {store.coverImageUrl && (
                    <img
                      src={store.coverImageUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <span
                    aria-hidden
                    className={clsx(
                      'absolute inset-0',
                      store.coverImageUrl
                        ? 'bg-inverse-surface/80'
                        : 'bg-surface-container-high',
                    )}
                  />
                  <span className="relative flex h-full items-center gap-4 p-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest p-2">
                      {markUrl ? (
                        <img
                          src={markUrl}
                          alt={store.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="font-sans text-title text-on-surface">
                          {store.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}
                        </span>
                      )}
                    </span>
                    <span className={clsx('min-w-0', store.coverImageUrl && 'text-inverse-on-surface')}>
                      <span className="inline-flex items-center gap-1 font-sans text-counter">
                        <BadgeCheck size={13} aria-hidden />
                        {t('market.sponsorBrand')}
                      </span>
                      <span className="mt-1 block truncate font-sans text-title">
                        {store.name}
                      </span>
                      <span
                        className={clsx(
                          'mt-0.5 block truncate font-sans text-body-sm',
                          store.coverImageUrl
                            ? 'text-inverse-on-surface/80'
                            : 'text-on-surface-variant',
                        )}
                      >
                        {store.tagline || store.category || t('market.officialStoresSubtitle')}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {stores.length > 1 && (
            <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
              {stores.map((store, index) => (
                <span
                  key={store.id}
                  className={clsx(
                    'h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none',
                    index === activeIndex
                      ? 'w-5 bg-primary'
                      : 'w-1.5 bg-outline-variant',
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ActiveFilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full border border-primary/45 bg-primary/10 px-3 font-sans text-counter text-primary"
    >
      {label}
      <X size={13} aria-hidden />
    </button>
  );
}

function FilterOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 font-sans text-label transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-outline-variant/40 bg-surface text-on-surface-variant',
      )}
    >
      {active && <Check size={16} aria-hidden />}
      {children}
    </button>
  );
}
