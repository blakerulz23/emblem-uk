import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '@/components/marketing/JsonLd';
import { FaqAccordion } from '../HomeEffects';
import { ALL_FAQ_ITEMS, FAQ_SECTIONS } from '@/lib/marketing/faq';
import { breadcrumbJsonLd, faqPageJsonLd } from '@/lib/marketing/structured-data';
import { pageOpenGraph } from '@/lib/marketing/site';

export const metadata: Metadata = {
  title: 'Personalised Football Card FAQ | Emblem',
  description:
    'Answers about Emblem personalised football cards: price, delivery, gifts, how the NFC player profile works, and how guardians keep children’s information private.',
  alternates: { canonical: '/faq' },
  openGraph: pageOpenGraph({ title: 'Emblem questions, answered', url: '/faq' }),
};

export default function FaqPage() {
  return (
    <main className="emh-page">
      <JsonLd data={[faqPageJsonLd(ALL_FAQ_ITEMS), breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'FAQ', path: '/faq' }])]} />
      <section className="emh-section emh-subpage-hero">
        <p className="emh-eyebrow">FAQ</p>
        <h1>Questions, answered.</h1>
        <p>Everything parents, relatives and coaches ask before ordering a personalised football card.</p>
        <nav className="emh-faq-jump" aria-label="FAQ sections">
          {FAQ_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>{section.title}</a>
          ))}
        </nav>
      </section>
      {FAQ_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="emh-section emh-faq">
          <div className="emh-faq-inner">
            <div className="emh-faq-head">
              <h2>{section.title}</h2>
            </div>
            <FaqAccordion items={section.items} idPrefix={`faq-${section.id}`} />
          </div>
        </section>
      ))}
      <section className="emh-final-cta">
        <h2>Ready to make theirs?</h2>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="faq_page_build">Build my card</Link>
          <Link className="emh-btn emh-btn-secondary" href="/os/demo" data-track="faq_page_try_app">Try the app</Link>
        </div>
      </section>
    </main>
  );
}
