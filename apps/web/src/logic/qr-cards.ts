/**
 * Pure model for the on-screen QR_Card and the Print_Page. The setup screen and
 * the print page render the same model, so printed codes match the screen.
 */
import { sanitizeClueText } from '@screech/core';
import { encodeSetupLink } from './hunt-link';
import { setupView, type SetupDraft } from './hunt-setup';

export interface QrCardModel {
  readonly index: number;
  readonly total: number;
  /** 'Spirit N of M' */
  readonly title: string;
  readonly name: string;
  readonly huntId: string;
  /** 'Hide at: <Hide_At>' or null when the Hide_At is empty. */
  readonly hideAtLine: string | null;
  readonly link: string;
  /** 'Spirit N of M, <name>' */
  readonly alt: string;
}

export interface PrintModel {
  /** null when the Opening_Riddle is empty. */
  readonly opening: string | null;
  /** Ascending by index. */
  readonly cards: readonly QrCardModel[];
}

/** Returns null when links cannot be made. */
export function buildPrintModel(
  huntId: string,
  draft: SetupDraft,
  baseUrl: string,
): PrintModel | null {
  if (!setupView(huntId, draft).canMakeLinks) return null;

  const cards: QrCardModel[] = [];
  for (let i = 0; i < draft.total; i++) {
    const row = draft.rows[i];
    if (row === undefined) return null;
    const index = i + 1;
    const encoded = encodeSetupLink(baseUrl, {
      huntId,
      index,
      total: draft.total,
      name: row.name,
      clue: row.clue,
    });
    if (!encoded.ok) return null;
    const name = sanitizeClueText(row.name);
    const hideAt = sanitizeClueText(row.hideAt);
    const title = `Spirit ${index} of ${draft.total}`;
    cards.push({
      index,
      total: draft.total,
      title,
      name,
      huntId,
      hideAtLine: hideAt === '' ? null : `Hide at: ${hideAt}`,
      link: encoded.link,
      alt: `${title}, ${name}`,
    });
  }

  const opening = sanitizeClueText(draft.opening);
  return { opening: opening === '' ? null : opening, cards };
}
