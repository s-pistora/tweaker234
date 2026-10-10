// Pomocník pro testy aplikace: položka hlavního menu je v rozbalovacím panelu skupiny –
// nejdřív otevřít skupinu (jako uživatel), pak kliknout na položku.
import { fireEvent, screen } from '@testing-library/svelte';
import type { SkupinaId } from '../../src/lib/menu.ts';

export async function zMenu(skupina: SkupinaId, testId: string): Promise<void> {
  const btn = screen.getByTestId(`menu-${skupina}`);
  if (btn.getAttribute('aria-expanded') !== 'true') await fireEvent.click(btn);
  await fireEvent.click(screen.getByTestId(testId));
}
