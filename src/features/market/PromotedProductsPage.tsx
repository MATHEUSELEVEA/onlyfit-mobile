import { BadgeCheck, Loader2 } from 'lucide-react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useTranslation } from '@/i18n/I18nProvider';
import { ProductCard } from './ProductCard';
import { promotedMarketProducts } from './marketMerchandising';
import { useMarketProducts, useOfficialMarketStores } from './useMarket';

export function PromotedProductsPage() {
  const { t } = useTranslation();
  const productsQuery = useMarketProducts();
  const storesQuery = useOfficialMarketStores();
  const products = promotedMarketProducts(
    productsQuery.data ?? [],
    storesQuery.data ?? [],
  );
  const isLoading = productsQuery.isLoading || storesQuery.isLoading;
  const isError = productsQuery.isError || storesQuery.isError;

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <PageTopBar title={t('market.featured.allTitle')} backFallback="/produtos" />
      <main className="mx-auto w-full max-w-[720px] px-4 pt-4">
        <div className="mb-4 flex items-center gap-2 text-on-surface-variant">
          <BadgeCheck size={17} className="text-primary" aria-hidden />
          <p className="font-sans text-body-sm">{t('market.featured.disclosure')}</p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2
              size={28}
              className="animate-spin text-on-surface-variant"
              aria-label={t('common.loading')}
            />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="font-sans text-body text-on-surface-variant">
              {t('market.loadError')}
            </p>
            <button
              type="button"
              onClick={() => {
                void productsQuery.refetch();
                void storesQuery.refetch();
              }}
              className="min-h-[44px] rounded-full bg-primary px-6 font-sans text-label text-on-primary"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && products.length === 0 && (
          <div className="py-14 text-center">
            <p className="font-sans text-title text-on-surface">
              {t('market.featured.empty')}
            </p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
              {t('market.featured.emptyDescription')}
            </p>
          </div>
        )}

        {!isLoading && !isError && products.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isOfficialStore
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
