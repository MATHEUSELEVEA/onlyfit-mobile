import type { OfferingConfigProps } from './OfferingConfigProps';
import { PremiumContentSettingsConfig } from './StructuredOfferingConfig';

// Tipo legado: premium_content — Clube do perfil.
export function PremiumContentConfig(props: OfferingConfigProps) {
  return <PremiumContentSettingsConfig {...props} />;
}
