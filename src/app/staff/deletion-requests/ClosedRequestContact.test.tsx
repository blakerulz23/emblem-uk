import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ClosedRequestContact from './ClosedRequestContact';

/**
 * 0097: a child-deletion request loses its contact address in the same write
 * that closes it, so the staff page shows it once more, at that moment, for
 * the reply.
 */
const render = (outcome: 'completed' | 'rejected', contactEmail: string | null) =>
  renderToStaticMarkup(<ClosedRequestContact outcome={outcome} contactEmail={contactEmail} onDone={() => {}} />);

describe('closed child-deletion request: contact shown once', () => {
  it('after completion it shows the address with the reply instruction and says it has been removed', () => {
    const html = render('completed', 'guardian@example.test');
    expect(html).toContain('Erasure complete.');
    expect(html).toContain('guardian@example.test');
    expect(html).toContain('confirming what was removed');
    expect(html).toContain('removed from the request');
  });

  it('after rejection it asks for the reason to be explained', () => {
    const html = render('rejected', 'guardian@example.test');
    expect(html).toContain('Request rejected.');
    expect(html).toContain('explaining why the request was declined');
  });

  it('with no address on file it says so and shows no address', () => {
    const html = render('completed', null);
    expect(html).toContain('No contact address was on file');
    expect(html).not.toContain('@');
  });
});
