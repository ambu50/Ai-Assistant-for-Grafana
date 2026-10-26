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
