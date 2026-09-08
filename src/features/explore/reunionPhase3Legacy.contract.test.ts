import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('./ExplorePage.tsx', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./useExplore.ts', import.meta.url), 'utf8');

describe('Explorar legado — contrato da fase 3', () => {
  it('mantém Pessoas no último slot', () => {
    const start = page.indexOf('const TABS');
    const tabs = page.slice(start, page.indexOf('];', start));
    expect(tabs.indexOf("key: 'communities'")).toBeLessThan(tabs.indexOf("key: 'people'"));
  });

  it('usa ranking do backend com fallback seguro para versões sem a RPC', () => {
    expect(repository).toContain("'list_discover_content_v1'");
    expect(repository).toContain("['PGRST202', '42883']");
    expect(repository).toContain(".from('visible_posts')");
    expect(repository).toContain(".not('is_premium', 'is', true)");
    expect(repository).toContain(".not('published_at', 'is', null)");
  });
});
