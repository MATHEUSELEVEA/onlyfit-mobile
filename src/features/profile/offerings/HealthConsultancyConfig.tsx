import type { OfferingConfigProps } from './OfferingConfigProps';
import { HealthConsultancySettingsConfig } from './StructuredOfferingConfig';

// Tipo legado: health_consultancy — Consultoria.
export function HealthConsultancyConfig(props: OfferingConfigProps) {
  return <HealthConsultancySettingsConfig {...props} />;
}
