import { clsx } from 'clsx';
import { formatPrice } from '@/lib/format';

// Selo de preço no padrão do marketplace (Grátis x valor), usado em produtos,
// comunidades e desafios. "owned" vira "Adquirido", já que preço não faz mais
// sentido depois da compra.
export function PriceBadge({ price, owned = false }: { price: number; owned?: boolean }) {
  if (owned) {
    return (
      <span className="inline-flex items-center rounded-full bg-tertiary-container px-2.5 py-1 font-sans text-counter text-on-tertiary-container">
        Adquirido
      </span>
    );
  }
  const free = !price || price <= 0;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 font-sans text-counter',
        free ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-primary text-on-primary',
      )}
    >
      {free ? 'Grátis' : formatPrice(price)}
    </span>
  );
}
