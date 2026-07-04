export interface PricingTier {
  id: string;
  name: string;
  packType: 'single' | 'team' | 'league';
  minQty: number;
  maxQty: number;
  pricePerCard: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'single',
    name: 'Single Cards',
    packType: 'single',
    minQty: 1,
    maxQty: 9,
    pricePerCard: 4.99,
    description: 'Perfect for individual players',
    features: [
      'Custom card design',
      'NFC-enabled card',
      'Premium card stock',
      'Glossy finish',
      'Free shipping on 5+',
    ],
  },
  {
    id: 'team',
    name: 'Team Pack',
    packType: 'team',
    minQty: 10,
    maxQty: 49,
    pricePerCard: 3.49,
    description: 'Great for teams of 10-25 players',
    features: [
      'Everything in Single',
      '30% volume discount',
      'Consistent team design',
      'Free shipping included',
      'Team logo on all cards',
    ],
    popular: true,
  },
  {
    id: 'league',
    name: 'League Pack',
    packType: 'league',
    minQty: 50,
    maxQty: 500,
    pricePerCard: 2.49,
    description: 'Best value for leagues of 50+ players',
    features: [
      'Everything in Team',
      '50% volume discount',
      'Dedicated support',
      'Priority shipping',
      'League branding options',
      'Bulk order management',
    ],
  },
];

export function getPricePerCard(quantity: number): number {
  if (quantity >= 50) return 2.49;
  if (quantity >= 10) return 3.49;
  return 4.99;
}

export function getPackType(quantity: number): 'single' | 'team' | 'league' {
  if (quantity >= 50) return 'league';
  if (quantity >= 10) return 'team';
  return 'single';
}
