import { useCallback, useMemo, useState } from 'react';
import { INITIAL_DRAFT, type Draft } from '../../logic/payload-draft';
export interface DraftApi {
  readonly draft: Draft;
  readonly update: (change: (previous: Draft) => Draft) => void;
}
/**
 * Holds the Speak draft above the screens, so it survives a trip to Screeching and back.
 * It lasts until the page is reloaded.
 */
export function useDraft(): DraftApi {
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const update = useCallback((change: (previous: Draft) => Draft): void => setDraft(change), []);
  return useMemo(() => ({ draft, update }), [draft, update]);
}
