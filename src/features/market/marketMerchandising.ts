import type { MarketProduct, OfficialMarketStore } from './useMarket';

export function normalizeMarketStoreKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function marketProductStoreKeys(product: MarketProduct): string[] {
  return [product.organizationId, product.storeSlug, product.storeName, product.creatorName]
    .map(normalizeMarketStoreKey)
    .filter(Boolean);
}

export function officialMarketStoreKeys(store: OfficialMarketStore): string[] {
  return [store.organizationId, store.slug, store.name]
    .map(normalizeMarketStoreKey)
    .filter(Boolean);
}

export function isSponsoredMarketProduct(
  product: MarketProduct,
  stores: OfficialMarketStore[],
): boolean {
  const productKeys = new Set(marketProductStoreKeys(product));
  return stores.some((store) =>
    officialMarketStoreKeys(store).some((key) => productKeys.has(key)),
  );
}

/**
 * Uma loja presente em `official_market_stores` representa um contrato
 * patrocinado ativo. Por isso, somente produtos ligados a essas lojas entram
 * na coleção paga de destaque; o restante do catálogo nunca é promovido por
 * heurística.
 */
export function promotedMarketProducts(
  products: MarketProduct[],
  stores: OfficialMarketStore[],
): MarketProduct[] {
  return products
    .filter((product) => isSponsoredMarketProduct(product, stores))
    .sort((a, b) => b.sales - a.sales);
}
