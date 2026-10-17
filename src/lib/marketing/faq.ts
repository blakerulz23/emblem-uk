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

/**
 * /football-cards-for-clubs. Worded to the live Squad Invite rules: the
 * team's price tier is fixed at the deadline from completed family
 * commitments, each family then pays for its own card, and the free coach
 * card needs 10 paid families. Kept off /faq so that page is unchanged.
 */
export const CLUB_PAGE_FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Do coaches or the club see children’s details?',
    answer:
      'No roster or photos are ever collected from the organiser. Each family creates and approves their own child’s card through the team link. The organiser sees the team’s progress and each joined player’s first name and surname initial, as printed on the card, never photos, full surnames, dates of birth or parents’ details.',
  },
  {
    question: 'Who pays, and when?',
    answer:
      'Each family pays for their own card through secure checkout once the team’s price is confirmed after your deadline. The organiser does not pay for the team.',
  },
  {
    question: 'How is the team’s price decided?',
    answer: `At your deadline we count the families who have committed to a card: one family is ${PRICES.single}, two to nine families are ${PRICES.multi} per card, and ten or more families are ${PRICES.squad} per card.`,
  },
  {
    question: 'How does the free coach card work?',
    answer: 'Once ten families in the team have paid for their cards, the team’s coach receives a personalised Emblem coach card at no extra cost.',
  },
  {
    question: 'Can we use our club badge?',
    answer: 'Badge details are reviewed with our team after approval, and you confirm that the club has given permission for it to be used.',
  },
  {
    question: 'Who can apply for the pilot?',
    answer:
      'UK grassroots clubs and teams with players aged U6 to U18. The organiser is a coach or authorised club representative, or a parent representative authorised by the team. Every request is reviewed by our team.',
  },
];

/** Plain-text answer used in structured data: lead + answer, no chips or links. */
export function faqPlainAnswer(item: FaqItem): string {
  return [item.lead, item.answer].filter(Boolean).join(' ');
}
