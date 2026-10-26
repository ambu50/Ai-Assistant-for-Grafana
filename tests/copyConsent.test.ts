import { describe, it, expect } from 'vitest';
import { acceptedCopyOffer } from '../src/copyConsent';
const copyOffer = { sourceUid: 'source', sourceTitle: 'Source', request: 'Remove Average uptime' };
const offer = { role: 'assistant', content: 'I can create a copy.', copyOffer };
describe('copy offer acceptance', () => {
  it.each(['ok', 'Yes please!', 'go ahead', 'نعم'])('accepts %s without retyping the task', content => {
    expect(acceptedCopyOffer([offer, { role: 'user', content }])).toEqual(copyOffer);
  });
  it('retains acceptance through a failed attempt and retry', () => {
    expect(acceptedCopyOffer([offer, { role: 'user', content: 'ok' }, { role: 'assistant', content: 'Creation rejected' }, { role: 'user', content: 'continue' }])).toEqual(copyOffer);
  });
  it.each(['no', 'ok but do not copy', 'Inspect another dashboard', 'continue'])('does not authorize %s', content => {
    expect(acceptedCopyOffer([offer, { role: 'user', content }])).toBeUndefined();
  });
  it('does not reuse consent after a completed copy or unrelated task', () => {
    expect(acceptedCopyOffer([offer, { role: 'user', content: 'ok' }, { role: 'assistant', content: 'Created', dashboards: [{}] }, { role: 'user', content: 'ok' }])).toBeUndefined();
    expect(acceptedCopyOffer([offer, { role: 'user', content: 'New task' }, { role: 'user', content: 'ok' }])).toBeUndefined();
    expect(acceptedCopyOffer([{ role: 'user', content: 'ok' }])).toBeUndefined();
  });
});
it('accepts a folder selection from the offer without changing saved history', () => {
  const offer = { role: 'assistant', content: 'Offer', copyOffer: { sourceUid: 's', sourceTitle: 'S', request: 'Remove panel', folderUid: 'a', destinations: [{ uid: 'a', title: 'A' }, { uid: 'b', title: 'B' }] } };
  expect(acceptedCopyOffer([offer, { role: 'user', content: 'ok', copyFolderUid: 'b' }])?.folderUid).toBe('b');
  expect(offer.copyOffer.folderUid).toBe('a');
  expect(acceptedCopyOffer([offer, { role: 'user', content: 'ok', copyFolderUid: 'other' }])).toBeUndefined();
});
