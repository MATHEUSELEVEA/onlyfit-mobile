import { describe, expect, it } from 'vitest';
import { offeringPresentationName } from './offeringPresentation';

describe('offeringPresentationName legado', () => {
  it('normaliza nomes padrão antigos', () => {
    expect(offeringPresentationName('premium_content', 'Conteúdo Premium')).toBe('Clube');
    expect(offeringPresentationName('health_consultancy', 'Consultoria de saúde')).toBe('Consultoria');
  });

  it('não altera nome personalizado', () => {
    expect(offeringPresentationName('health_consultancy', 'Consultoria 12 semanas')).toBe('Consultoria 12 semanas');
  });
});
