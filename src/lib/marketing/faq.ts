import { PRICES } from './site';

/**
 * The marketing FAQ — one source for the homepage teaser, /faq, the
 * Christmas page and the FAQPage structured data, so the visible answers
 * and the schema can never drift apart (Google requires them to match).
 *
 * Every answer states something the UK product actually does today. Delivery
 * times and Christmas dates are deliberately not promised here until
 * production confirms them.
 */
export type FaqItem = {
  question: string;
  lead?: string;
  answer?: string;
  chips?: string[];
  /** Optional inline link after the answer, e.g. to a policy page. */
  link?: { label: string; href: string };
};

export const FAQ_ABOUT_THE_CARD: FaqItem[] = [
  {
    question: 'What is an Emblem card?',
    answer:
      'An Emblem card is a personalised premium trading card with built-in NFC. Tap it with a compatible phone to open the player’s digital profile, where their milestones, achievements and memories can grow over time.',
  },
  {
    question: 'How much is a personalised football card?',
    answer: `A single personalised card is ${PRICES.single}, including the built-in NFC chip and the digital player profile. Two to nine cards are ${PRICES.multi} each, and squads of ten or more are ${PRICES.squad} each.`,
  },
  {
    question: 'Can I order just one card?',
    answer: 'Yes. You can create one personalised player card, order multiple cards together or build a complete squad.',
  },
  {
    question: 'Do I need to download an app?',
    answer: 'No. Tap the card with an NFC-compatible smartphone and the player’s profile opens in the phone’s browser.',
  },
  {
    question: 'Is there an annual subscription?',
    answer:
      'No. Digital profile access is included with the card, with no annual subscription required. Existing moments, achievements and previous seasons remain accessible.',
  },
  {
    question: 'Can the profile continue into another season?',
    answer:
      'Yes. The same profile can carry the player’s story forward from season to season. A new season card can become the next physical collectible connected to their continuing journey.',
  },
];

export const FAQ_GIFTS_AND_DELIVERY: FaqItem[] = [
  {
    question: 'Can I order a card as a gift for someone else’s child?',
    answer:
      'Yes. Grandparents, relatives and friends can design a card. Because it features a child, a parent or legal guardian must approve the card before it is produced, so the child’s family stays in control.',
  },
  {
    question: 'How much is delivery?',
    answer: 'UK delivery is calculated at checkout and shown before the order is completed.',
  },
  {
    question: 'Will it arrive in time for Christmas?',
    answer:
      'Please order as early as you can. Every card is made to order, and if you are not the child’s parent or guardian, they need to approve the card before it is printed. UK delivery is calculated at checkout and shown before you pay.',
    link: { label: 'See Christmas gift ideas →', href: '/football-gifts-for-kids' },
  },
];

export const FAQ_PRIVACY: FaqItem[] = [
  {
    question: 'How is my child’s information protected?',
    answer:
      'Player profiles are private by default and managed through guardian-controlled access. Emblem limits the information displayed, verifies coach contributions and provides controls for sharing, access and deletion.',
    link: { label: 'Learn how we protect players →', href: '/trust-and-safeguarding' },
  },
  {
    question: 'What happens if an Emblem card is lost?',
    answer:
      'Contact us and we can disable the card’s digital connection. Finding the physical card does not give someone access to the guardian account or private management controls.',
  },
  {
    question: 'Is the player’s information secure?',
    answer: 'Player profiles are managed through authorised parent, guardian and coach access. Guardians remain in control of what is added and what they choose to share.',
  },
  {
    question: 'Can parents add photos and moments?',
    answer:
      'Yes. Parents can add memories and submit player moments. Where coach verification applies, the coach can review them before they appear as verified achievements.',
  },
];

export const FAQ_TEAMS: FaqItem[] = [
  {
    question: 'What qualifies as a Full Squad order?',
    answer: 'An order containing 10 or more player cards qualifies for Full Squad pricing and includes one free coach card.',
  },
  {
    question: 'What is the free coach card?',
    answer: 'It is a personalised Emblem card for the team’s coach, included at no extra cost with every qualifying Full Squad order.',
  },
  {
    question: 'What can coaches do with Coach OS?',
    answer: 'Coaches can manage their squad, verify moments submitted by parents and award player achievements from one dashboard.',
  },
  {
    question: 'Is Emblem only for football?',
    answer: 'No. Emblem is designed to celebrate players, teams and achievements across different sports and levels.',
  },
];

export const FAQ_SECTIONS: ReadonlyArray<{ id: string; title: string; items: FaqItem[] }> = [
  { id: 'the-card', title: 'The card', items: FAQ_ABOUT_THE_CARD },
  { id: 'gifts-delivery', title: 'Gifts and delivery', items: FAQ_GIFTS_AND_DELIVERY },
  { id: 'privacy', title: 'Privacy and safety', items: FAQ_PRIVACY },
  { id: 'teams', title: 'Coaches and teams', items: FAQ_TEAMS },
];

export const ALL_FAQ_ITEMS: FaqItem[] = FAQ_SECTIONS.flatMap((s) => s.items);

/** The four questions a parent asks first — the homepage teaser. */
export const HOMEPAGE_FAQ_ITEMS: FaqItem[] = [
  FAQ_ABOUT_THE_CARD[0],
  FAQ_PRIVACY[0],
  FAQ_ABOUT_THE_CARD[3],
  FAQ_GIFTS_AND_DELIVERY[1],
];

export const GIFT_PAGE_FAQ_ITEMS: FaqItem[] = [
  FAQ_GIFTS_AND_DELIVERY[0],
  FAQ_GIFTS_AND_DELIVERY[2],
  FAQ_GIFTS_AND_DELIVERY[1],
  FAQ_ABOUT_THE_CARD[1],
  FAQ_ABOUT_THE_CARD[3],
  FAQ_PRIVACY[0],
];

/** Plain-text answer used in structured data: lead + answer, no chips or links. */
export function faqPlainAnswer(item: FaqItem): string {
  return [item.lead, item.answer].filter(Boolean).join(' ');
}
