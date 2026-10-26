export type CopyOffer = { sourceUid: string; sourceTitle: string; request: string; folderUid?: string; folderTitle?: string; destinations?: { uid: string; title: string }[] };
type Message = { role: string; content: string; copyOffer?: CopyOffer; dashboards?: unknown[]; copyFolderUid?: string };

// Consent stays attached to the latest offer, and ends on a new task or a completed copy.
export function acceptedCopyOffer(history: Message[]): CopyOffer | undefined {
  let offerIndex = -1;
  history.forEach((message, index) => { if (message.role === 'assistant' && message.copyOffer) offerIndex = index; });
  if (offerIndex < 0) return undefined;
  let accepted = false;
  const offer = { ...history[offerIndex].copyOffer! };
  for (const message of history.slice(offerIndex + 1)) {
    if (message.role === 'assistant' && message.dashboards?.length) return undefined;
    if (message.role !== 'user') continue;
    if (message.copyFolderUid !== undefined) {
      if (!offer.destinations?.some(folder => folder.uid === message.copyFolderUid) && message.copyFolderUid !== offer.folderUid) return undefined;
      offer.folderUid = message.copyFolderUid;
      offer.folderTitle = offer.destinations?.find(folder => folder.uid === message.copyFolderUid)?.title;
    }
    const reply = message.content.trim().toLowerCase().replace(/[.!،,。]+$/g, '').trim();
    if (/^(ok|okay|yes|yes please|sure|go ahead|proceed|do it|please do|نعم|تمام|موافق)$/.test(reply)) accepted = true;
    else if (!(accepted && /^(continue|retry|try again)$/.test(reply))) return undefined;
  }
  return accepted ? offer : undefined;
}
