import { SINGLE_UNIT_PRICE_PENCE } from '@/lib/pricing-engine';
import { absoluteUrl, SITE_NAME } from './site';

/**
 * Google Merchant Center product feed (RSS 2.0 + g: namespace), for free
 * Shopping listings. Idea adapted from the Canadian repo's catalog feed;
 * rebuilt for the UK: GBP from the pricing engine, UK URLs, one item — the
 * single personalised card, the only thing a shopper can buy at a fixed
 * listed price. No customer or child data. Shipping is configured in the
 * Merchant Center account, not here.
 */
export type MerchantItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  price: string;
};

export function merchantItems(): MerchantItem[] {
  return [
    {
      id: 'emblem-uk-single-card',
      title: 'Personalised Football Card with NFC Digital Player Profile',
      description:
        'A personalised football trading card made from your photo, with name, number and club. Printed in the UK on premium 400gsm stock with a built-in NFC chip that opens a private, guardian-controlled digital player profile. No subscription.',
      link: absoluteUrl('/'),
      imageLink: absoluteUrl('/assets/home/gallery/custom-royal.webp'),
      price: `${(SINGLE_UNIT_PRICE_PENCE / 100).toFixed(2)} GBP`,
    },
  ];
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function merchantFeedXml(items: MerchantItem[] = merchantItems()): string {
  const entries = items
    .map(
      (i) => `    <item>
      <g:id>${xmlEscape(i.id)}</g:id>
      <title>${xmlEscape(i.title)}</title>
      <description>${xmlEscape(i.description)}</description>
      <link>${xmlEscape(i.link)}</link>
      <g:image_link>${xmlEscape(i.imageLink)}</g:image_link>
      <g:price>${xmlEscape(i.price)}</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:brand>${xmlEscape(SITE_NAME)}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>Personalised Gifts &gt; Football Cards</g:product_type>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(SITE_NAME)} UK</title>
    <link>${xmlEscape(absoluteUrl('/'))}</link>
    <description>Personalised football cards with a digital player profile</description>
${entries}
  </channel>
</rss>
`;
}
