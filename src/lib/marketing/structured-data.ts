import { SINGLE_UNIT_PRICE_PENCE } from '@/lib/pricing-engine';
import { faqPlainAnswer, type FaqItem } from './faq';
import { absoluteUrl, OG_IMAGE, SITE_NAME, SITE_URL } from './site';

/**
 * schema.org JSON-LD builders. Only describe what is visible on the page
 * (Google's structured-data policy): the product, its real GBP price, the
 * organisation, and FAQ answers rendered on the same page.
 */

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/emblem-brand.png'),
  };
}

export function personalisedCardProductJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Personalised Football Card with Digital Player Profile',
    description:
      'A personalised football trading card made from your photo, printed in the UK as a premium trading card with a built-in NFC chip that opens a private, guardian-controlled digital player profile.',
    image: [absoluteUrl(OG_IMAGE.url)],
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl('/builder?mode=single'),
      priceCurrency: 'GBP',
      price: (SINGLE_UNIT_PRICE_PENCE / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      // Free UK delivery (Shopify charges UK customers nothing). Handling +
      // transit match the Terms' "3–5 business days" and the Merchant Center
      // shipping settings; change all three together.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'GBP' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 3, unitCode: 'DAY' },
        },
      },
      // No return policy here on purpose: returns are accepted for defective
      // items only (Terms → "Returns and reprints"), which schema.org can't
      // express cleanly. Merchant Center holds the policy and takes precedence.
    },
  };
}

export function faqPageJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: faqPlainAnswer(item) },
    })),
  };
}

export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: absoluteUrl(t.path) })),
  };
}

/** Serialise for a <script type="application/ld+json">, escaping "<" so content can never close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
