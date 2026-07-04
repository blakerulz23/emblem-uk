'use client';
import { useSearchParams } from 'next/navigation';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  CARD_TEMPLATES,
  DEFAULT_BOBBLEHEAD,
  DEFAULT_JEWELRY,
  DEFAULT_KEYCHAIN,
  DEFAULT_MAGNET,
  DEFAULT_PIN,
  DEFAULT_PLUSHIE,
  DEFAULT_FIGURINEZ,
  DEFAULT_WRISTBAND,
  EMPTY_LOGO,
  PRODUCT_ORDER,
  SIZES,
  buildSteps,
  type Bobblehead,
  SPORT_STATS,
  type CardTemplate,
  type Details,
  type Jewelry,
  type Keychain,
  type LogoState,
  type PhotoCharm,
  type Plushie,
  type Puzzle,
  DEFAULT_PUZZLE,
  type Pendant,
  DEFAULT_PENDANT,
  type Coin,
  DEFAULT_COIN,
  type ArmyMan,
  DEFAULT_ARMYMAN,
  type Rushmore,
  DEFAULT_RUSHMORE,
  type Figurinez,
  type PhysicalKey,
  type ProductId,
  type SportId,
  type StepKey,
  type WristbandActiveEditor,
  type WristbandBand,
  type WristbandPatch,
  type WristbandState,
} from '@/components/builder/emblem/data';

type EmblemStateType = {
  photo: string | null;
  setPhoto: (v: string | null) => void;
  logo: string | null;
  setLogo: (v: string | null) => void;
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  setPhotoScale: (v: number) => void;
  setPhotoOffsetX: (v: number) => void;
  setPhotoOffsetY: (v: number) => void;
  sport: SportId;
  setSport: (v: SportId) => void;
  stats: Record<string, string>;
  setStat: (key: string, value: string) => void;
  backText: string;
  setBackText: (v: string) => void;
  physical: Record<PhysicalKey, string>;
  setPhysical: (key: PhysicalKey, value: string) => void;
  product: ProductId;
  setProduct: (v: ProductId) => void;
  template: CardTemplate;
  setTemplate: (v: CardTemplate) => void;
  details: Details;
  setDetail: (key: keyof Details, value: string) => void;
  size: string;
  setSize: (v: string) => void;
  qty: number;
  setQty: (v: number) => void;
  cart: number;
  step: StepKey;
  dir: 1 | -1;
  steps: StepKey[];
  index: number;
  pct: number;
  deepLink: boolean;
  go: (key: StepKey, dir?: 1 | -1) => void;
  next: (productOverride?: ProductId) => void;
  back: () => void;
  reset: () => void;
  success: boolean;
  setSuccess: (v: boolean) => void;
  addToCart: () => void;
  /** First applied code, kept for back-compat. Prefer `referralCodes`. */
  referralCode: string | null;
  setReferralCode: (v: string | null) => void;
  /** All applied discount codes (multi). */
  referralCodes: string[];
  setReferralCodes: (v: string[]) => void;
  wristband: WristbandState;
  setBand: (patch: Partial<WristbandBand>) => void;
  setBandLogo: (patch: Partial<LogoState>) => void;
  setPatch: (patch: Partial<WristbandPatch>) => void;
  setPatchLogo: (patch: Partial<LogoState>) => void;
  setActiveEditor: (v: WristbandActiveEditor) => void;
  clearBandLogo: () => void;
  clearPatchLogo: () => void;
  keychain: Keychain;
  setKeychain: (patch: Partial<Keychain>) => void;
  setKeychainLogo: (patch: Partial<LogoState>) => void;
  clearKeychainLogo: () => void;
  jewelry: Jewelry;
  setJewelry: (patch: Partial<Jewelry>) => void;
  setJewelryLogo: (patch: Partial<LogoState>) => void;
  clearJewelryLogo: () => void;
  pin: PhotoCharm;
  setPin: (patch: Partial<PhotoCharm>) => void;
  magnet: PhotoCharm;
  setMagnet: (patch: Partial<PhotoCharm>) => void;
  plushie: Plushie;
  setPlushie: (patch: Partial<Plushie>) => void;
  puzzle: Puzzle;
  setPuzzle: (patch: Partial<Puzzle>) => void;
  pendant: Pendant;
  setPendant: (patch: Partial<Pendant>) => void;
  coin: Coin;
  setCoin: (patch: Partial<Coin>) => void;
  armyman: ArmyMan;
  setArmyman: (patch: Partial<ArmyMan>) => void;
  rushmore: Rushmore;
  setRushmore: (patch: Partial<Rushmore>) => void;
  figurinez: Figurinez;
  setFigurinez: (patch: Partial<Figurinez>) => void;
  bobblehead: Bobblehead;
  setBobblehead: (patch: Partial<Bobblehead>) => void;
};

const EmblemCtx = createContext<EmblemStateType | null>(null);

const VALID_PRODUCTS = new Set<ProductId>([
  'cards', 'posters', 'wristbands', 'stickers', 'keychains', 'jewelry',
  'pins', 'magnets', 'plushies', 'bobbleheads', 'puzzles', 'pendants', 'coins', 'armymen', 'rushmore',
]);

export function EmblemProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [product, setProductRaw] = useState<ProductId>('cards');
  const [deepLink, setDeepLink] = useState<boolean>(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [photoScale, setPhotoScale] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [sport, setSport] = useState<SportId>('basketball');
  const [stats, setStats] = useState<Record<string, string>>({});
  const [backText, setBackText] = useState('');
  const [physical, setPhysicalState] = useState<Record<PhysicalKey, string>>({
    height: '', age: '', classYear: '', hometown: '',
  });
  const [template, setTemplate] = useState<CardTemplate>(CARD_TEMPLATES[0]);
  const [details, setDetails] = useState<Details>({
    name: 'Caden Isaacs',
    number: '00',
    team: 'KINGS',
    position: 'POINT GUARD',
  });
  const [size, setSize] = useState<string>(SIZES.cards[0]);
  const [qty, setQty] = useState<number>(1);
  const [cart, setCart] = useState<number>(0);
  const [step, setStep] = useState<StepKey>('upload');
  const [dir, setDir] = useState<1 | -1>(1);
  const [success, setSuccess] = useState<boolean>(false);

  const [referralCodes, setReferralCodesState] = useState<string[]>([]);
  const setReferralCodes = useCallback((v: string[]) => {
    // Normalize, dedupe, cap at 5.
    const normalized = v
      .map((c) => c.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ''))
      .filter((c) => c.length >= 2 && c.length <= 32);
    setReferralCodesState(Array.from(new Set(normalized)).slice(0, 5));
  }, []);
  const referralCode = referralCodes[0] ?? null;
  const setReferralCode = useCallback((v: string | null) => {
    setReferralCodes(v ? [v] : []);
  }, [setReferralCodes]);
  const searchParams = useSearchParams();
  useEffect(() => {
    const ref = searchParams?.get('ref');
    if (ref) {
      // Allow ?ref=CODE1,CODE2 to seed multiple codes from a link.
      setReferralCodes(ref.split(/[,\s]+/));
    }
  }, [searchParams, setReferralCodes]);
  // Allow ?product=ID to deep-link straight into a specific product's editor (admin/testing)
  useEffect(() => {
    const p = searchParams?.get('product');
    if (p && VALID_PRODUCTS.has(p as ProductId)) {
      const nextProduct = p as ProductId;
      setDeepLink(true);
      setProductRaw(nextProduct);
      setStep(buildSteps(nextProduct, true)[0]);
    }
  }, [searchParams]);

  const [wristband, setWristband] = useState<WristbandState>(DEFAULT_WRISTBAND);
  const [keychain, setKeychainState] = useState<Keychain>(DEFAULT_KEYCHAIN);
  const [jewelry, setJewelryState] = useState<Jewelry>(DEFAULT_JEWELRY);
  const [pin, setPinState] = useState<PhotoCharm>(DEFAULT_PIN);
  const [magnet, setMagnetState] = useState<PhotoCharm>(DEFAULT_MAGNET);
  const [plushie, setPlushieState] = useState<Plushie>(DEFAULT_PLUSHIE);
  const [puzzle, setPuzzleState] = useState<Puzzle>(DEFAULT_PUZZLE);
  const [pendant, setPendantState] = useState<Pendant>(DEFAULT_PENDANT);
  const [coin, setCoinState] = useState<Coin>(DEFAULT_COIN);
  const [armyman, setArmymanState] = useState<ArmyMan>(DEFAULT_ARMYMAN);
  const [rushmore, setRushmoreState] = useState<Rushmore>(DEFAULT_RUSHMORE);
  const [figurinez, setFigurinezState] = useState<Figurinez>(DEFAULT_FIGURINEZ);
  const setFigurinez = useCallback(
    (patch: Partial<Figurinez>) => setFigurinezState((prev) => ({ ...prev, ...patch })),
    []
  );
  const [bobblehead, setBobbleheadState] = useState<Bobblehead>(DEFAULT_BOBBLEHEAD);

  const steps = useMemo(() => buildSteps(product, deepLink), [product, deepLink]);
  const index = Math.max(0, steps.indexOf(step));
  const pct = ((index + 1) / steps.length) * 100;

  useEffect(() => {
    const list = SIZES[product] || ['One size'];
    setSize(list[0]);
  }, [product]);

  const setDetail = useCallback((key: keyof Details, value: string) => {
    setDetails((d) => ({ ...d, [key]: value }));
  }, []);

  const setProduct = useCallback((v: ProductId) => {
    setProductRaw(v);
  }, []);

  const setStat = useCallback((key: string, value: string) => {
    setStats((s) => ({ ...s, [key]: value }));
  }, []);

  const setPhysical = useCallback((key: PhysicalKey, value: string) => {
    setPhysicalState((p) => ({ ...p, [key]: value }));
  }, []);

  const setBand = useCallback((patch: Partial<WristbandBand>) => {
    setWristband((w) => ({ ...w, band: { ...w.band, ...patch } }));
  }, []);
  const setBandLogo = useCallback((patch: Partial<LogoState>) => {
    setWristband((w) => ({ ...w, band: { ...w.band, logo: { ...w.band.logo, ...patch } } }));
  }, []);
  const clearBandLogo = useCallback(() => {
    setWristband((w) => ({
      ...w,
      band: { ...w.band, logo: EMPTY_LOGO, preset: w.band.preset.startsWith('logo-') ? 'bold' : w.band.preset },
    }));
  }, []);
  const setPatch = useCallback((patch: Partial<WristbandPatch>) => {
    setWristband((w) => ({ ...w, patch: { ...w.patch, ...patch } }));
  }, []);
  const setPatchLogo = useCallback((patch: Partial<LogoState>) => {
    setWristband((w) => ({ ...w, patch: { ...w.patch, logo: { ...w.patch.logo, ...patch } } }));
  }, []);
  const clearPatchLogo = useCallback(() => {
    setWristband((w) => ({
      ...w,
      patch: { ...w.patch, logo: EMPTY_LOGO, kind: w.patch.kind === 'logo' ? 'brand' : w.patch.kind },
    }));
  }, []);
  const setActiveEditor = useCallback((v: WristbandActiveEditor) => {
    setWristband((w) => ({ ...w, active: v }));
  }, []);

  const setKeychain = useCallback((patch: Partial<Keychain>) => {
    setKeychainState((k) => ({ ...k, ...patch }));
  }, []);
  const setKeychainLogo = useCallback((patch: Partial<LogoState>) => {
    setKeychainState((k) => ({ ...k, logo: { ...k.logo, ...patch } }));
  }, []);
  const clearKeychainLogo = useCallback(() => {
    setKeychainState((k) => ({ ...k, logo: EMPTY_LOGO }));
  }, []);

  const setJewelry = useCallback((patch: Partial<Jewelry>) => {
    setJewelryState((j) => ({ ...j, ...patch }));
  }, []);
  const setJewelryLogo = useCallback((patch: Partial<LogoState>) => {
    setJewelryState((j) => ({ ...j, logo: { ...j.logo, ...patch } }));
  }, []);
  const clearJewelryLogo = useCallback(() => {
    setJewelryState((j) => ({ ...j, logo: EMPTY_LOGO }));
  }, []);

  const setPin = useCallback((patch: Partial<PhotoCharm>) => {
    setPinState((p) => ({ ...p, ...patch }));
  }, []);
  const setMagnet = useCallback((patch: Partial<PhotoCharm>) => {
    setMagnetState((m) => ({ ...m, ...patch }));
  }, []);

  const setPlushie = useCallback((patch: Partial<Plushie>) => {
    setPlushieState((p) => ({ ...p, ...patch }));
  }, []);
  const setPuzzle = useCallback((patch: Partial<Puzzle>) => {
    setPuzzleState((p) => ({ ...p, ...patch }));
  }, []);
  const setPendant = useCallback((patch: Partial<Pendant>) => {
    setPendantState((p) => ({ ...p, ...patch }));
  }, []);
  const setCoin = useCallback((patch: Partial<Coin>) => {
    setCoinState((p) => ({ ...p, ...patch }));
  }, []);
  const setArmyman = useCallback((patch: Partial<ArmyMan>) => {
    setArmymanState((p) => ({ ...p, ...patch }));
  }, []);
  const setRushmore = useCallback((patch: Partial<Rushmore>) => {
    setRushmoreState((p) => ({ ...p, ...patch }));
  }, []);
  const setBobblehead = useCallback((patch: Partial<Bobblehead>) => {
    setBobbleheadState((b) => ({ ...b, ...patch }));
  }, []);

  const go = useCallback((key: StepKey, d: 1 | -1 = 1) => {
    setDir(d);
    setStep(key);
    if (typeof document !== 'undefined') {
      document.querySelector('.screen-body')?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  const next = useCallback(
    (productOverride?: ProductId) => {
      const po = productOverride ?? product;
      const seq = buildSteps(po, deepLink);
      const i = seq.indexOf(step);
      if (i < seq.length - 1) go(seq[i + 1], 1);
    },
    [deepLink, go, product, step],
  );

  const back = useCallback(() => {
    const i = steps.indexOf(step);
    if (i > 0) go(steps[i - 1], -1);
  }, [go, step, steps]);

  const reset = useCallback(() => {
    setSuccess(false);
    setPhoto(null);
    setProductRaw('cards');
    setDeepLink(false);
    setLogo(null);
    setPhotoScale(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setSport('basketball');
    setStats({});
    setBackText('');
    setPhysicalState({ height: '', age: '', classYear: '', hometown: '' });
    setProduct('cards');
    setQty(1);
    setTemplate(CARD_TEMPLATES[0]);
    setDetails({ name: 'Caden Isaacs', number: '00', team: 'KINGS', position: 'POINT GUARD' });
    setWristband(DEFAULT_WRISTBAND);
    setKeychainState(DEFAULT_KEYCHAIN);
    setJewelryState(DEFAULT_JEWELRY);
    setPinState(DEFAULT_PIN);
    setMagnetState(DEFAULT_MAGNET);
    setPlushieState(DEFAULT_PLUSHIE);
    setPuzzleState(DEFAULT_PUZZLE);
    setPendantState(DEFAULT_PENDANT);
    setCoinState(DEFAULT_COIN);
    setArmymanState(DEFAULT_ARMYMAN);
    setRushmoreState(DEFAULT_RUSHMORE);
    setBobbleheadState(DEFAULT_BOBBLEHEAD);
    setStep('upload');
  }, []);

  const addToCart = useCallback(() => {
    setCart((c) => c + qty);
    setSuccess(true);
  }, [qty]);

  const value: EmblemStateType = {
    photo, setPhoto,
    logo, setLogo,
    photoScale, setPhotoScale,
    photoOffsetX, setPhotoOffsetX,
    photoOffsetY, setPhotoOffsetY,
    sport, setSport,
    stats, setStat,
    backText, setBackText,
    physical, setPhysical,
    product, setProduct,
    template, setTemplate,
    details, setDetail,
    size, setSize,
    qty, setQty,
    cart,
    step, dir, steps, index, pct, deepLink,
    go, next, back, reset,
    success, setSuccess,
    addToCart,
    referralCode, setReferralCode,
    referralCodes, setReferralCodes,
    wristband, setBand, setBandLogo, setPatch, setPatchLogo, setActiveEditor,
    clearBandLogo, clearPatchLogo,
    keychain, setKeychain, setKeychainLogo, clearKeychainLogo,
    jewelry, setJewelry, setJewelryLogo, clearJewelryLogo,
    pin, setPin,
    magnet, setMagnet,
    plushie, setPlushie,
    puzzle, setPuzzle,
    pendant, setPendant,
    coin, setCoin,
    armyman, setArmyman,
    rushmore, setRushmore,
    figurinez, setFigurinez,
    bobblehead, setBobblehead,
  };

  return <EmblemCtx.Provider value={value}>{children}</EmblemCtx.Provider>;
}

export function useEmblem(): EmblemStateType {
  const ctx = useContext(EmblemCtx);
  if (!ctx) throw new Error('useEmblem must be used inside <EmblemProvider>');
  return ctx;
}

export const PRODUCT_ORDER_RE = PRODUCT_ORDER;
