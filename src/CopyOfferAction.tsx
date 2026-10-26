import React, { useState } from 'react';
import type { CopyOffer } from './copyConsent';
export function CopyOfferAction({ offer, onAccept }: { offer: CopyOffer; onAccept: (folderUid: string) => void }) {
  const [folderUid, setFolderUid] = useState(offer.folderUid || '');
  const destinations = offer.destinations?.length ? offer.destinations : [{ uid: offer.folderUid || '', title: offer.folderTitle || offer.folderUid || 'General' }];
  return <div className="ai-copy-offer">
    <label>Copy destination <select aria-label="Copy destination" value={folderUid} onChange={event => setFolderUid(event.target.value)}>
      {destinations.map(folder => <option key={folder.uid} value={folder.uid}>{folder.title}{folder.uid ? ` (${folder.uid})` : ''}</option>)}
    </select></label>{' '}
    <button type="button" className="ai-resume" onClick={() => onAccept(folderUid)}>Create modified copy</button>
  </div>;
}
