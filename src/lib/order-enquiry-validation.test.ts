import { describe, expect, it, vi } from 'vitest';
import { PRICING_VERSION } from './pricing-engine';
import {
  isValidNamespacedKey,
  validateOrderEnquiry,
  verifySubmittedAssetKeys,
  type AssetChecker,
  type EnquiryBody,
  type EnquiryPlayer,
} from './order-enquiry-validation';

const SUBMISSION_KEY = '11111111-2222-4333-8444-555555555555';
const PREFIX = `order-assets/${SUBMISSION_KEY}/`;
const PRINT_PREFIX = `print-files/${SUBMISSION_KEY}/`;

function fingerprintOf(input: string) {
  // Deterministic, order-preserving stand-in — real route.ts uses sha256;
  // these tests only need "same content -> same output, different -> different".
  return input;
}

function photoKey(suffix = 'p1.jpg') {
  return `${PREFIX}${suffix}`;
}

function printFileKey(suffix = 'card/1-emblem-abc.pdf') {
  return `${PRINT_PREFIX}${suffix}`;
}

/** Default valid metadata a real S3 headObject() would return for a photo. */
function validPhotoMeta() {
  return { exists: true, contentType: 'image/jpeg', contentLength: 500_000 };
}
function validPdfMeta() {
  return { exists: true, contentType: 'application/pdf', contentLength: 1_500_000 };
}

function validMetaFor(key: string) {
  return key.startsWith('print-files/') ? validPdfMeta() : validPhotoMeta();
}

function validPlayer(overrides: Partial<EnquiryPlayer> = {}): EnquiryPlayer {
  return {
    id: overrides.id ?? 'player-1',
    name: 'Alex Player',
    position: 'ST',
    kitNo: '9',
    prints: 1,
    club: 'Sunday League FC',
    templateId: 'emjfl-official',
    photo: { storageKey: photoKey(`${overrides.id ?? 'player-1'}.jpg`) },
    ...overrides,
  };
}

function nPlayers(count: number, overrides: (i: number) => Partial<EnquiryPlayer> = () => ({})): EnquiryPlayer[] {
  return Array.from({ length: count }, (_, i) => validPlayer({ id: `player-${i + 1}`, ...overrides(i) }));
}

function baseBody(overrides: Partial<EnquiryBody> = {}): EnquiryBody {
  const body: EnquiryBody = {
    contact: { name: 'Jamie Parent', email: 'jamie@example.test', team: '' },
    submissionKey: SUBMISSION_KEY,
    players: nPlayers(1),
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'printFiles')) {
    body.printFiles = (body.players ?? []).map((player, index) => ({
      playerId: player.id,
      playerName: player.name,
      key: printFileKey(`card/${index + 1}.pdf`),
    }));
  }
  return body;
}

function validate(body: EnquiryBody) {
  return validateOrderEnquiry(body, { fingerprint: fingerprintOf, now: () => 1_700_000_000_000 });
}

describe('isValidNamespacedKey', () => {
  it('accepts a key with the exact submission prefix', () => {
    expect(isValidNamespacedKey(photoKey(), PREFIX)).toBe(true);
  });
  it('rejects a blob: URL', () => {
    expect(isValidNamespacedKey('blob:http://localhost/abc', PREFIX)).toBe(false);
  });
  it('rejects a data: URL', () => {
    expect(isValidNamespacedKey('data:image/png;base64,AAAA', PREFIX)).toBe(false);
  });
  it('rejects a public https URL', () => {
    expect(isValidNamespacedKey('https://example.com/photo.jpg', PREFIX)).toBe(false);
  });
  it("rejects another submission's namespace", () => {
    expect(isValidNamespacedKey('order-assets/other-submission/p1.jpg', PREFIX)).toBe(false);
  });
  it('rejects a bare prefix with nothing after it', () => {
    expect(isValidNamespacedKey(PREFIX, PREFIX)).toBe(false);
  });
  it('rejects path traversal', () => {
    expect(isValidNamespacedKey(`${PREFIX}../other/p1.jpg`, PREFIX)).toBe(false);
  });
});

describe('validateOrderEnquiry — basic request shape', () => {
  it('rejects a missing name', () => {
    const result = validate(baseBody({ contact: { name: '', email: 'a@b.com' } }));
    expect(result.ok).toBe(false);
  });
  it('rejects an invalid email', () => {
    const result = validate(baseBody({ contact: { name: 'Jamie', email: 'not-an-email' } }));
    expect(result.ok).toBe(false);
  });
  it('rejects a missing submission key', () => {
    const result = validate(baseBody({ submissionKey: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
  it('rejects a non-UUID submission key', () => {
    const result = validate(baseBody({ submissionKey: 'not-a-uuid' }));
    expect(result.ok).toBe(false);
  });
  it('rejects zero players', () => {
    const result = validate(baseBody({ players: [] }));
    expect(result.ok).toBe(false);
  });
  it('accepts a single valid player', () => {
    const result = validate(baseBody());
    expect(result.ok).toBe(true);
  });
});

describe('validateOrderEnquiry — player validation', () => {
  it('rejects a player with no id', () => {
    const result = validate(baseBody({ players: [validPlayer({ id: '' })] }));
    expect(result.ok).toBe(false);
  });
  it('rejects duplicate player ids', () => {
    const result = validate(baseBody({ players: [validPlayer({ id: 'dup' }), validPlayer({ id: 'dup' })] }));
    expect(result.ok).toBe(false);
  });
  it('rejects a blank player name', () => {
    const result = validate(baseBody({ players: [validPlayer({ name: '   ' })] }));
    expect(result.ok).toBe(false);
  });
  it('rejects a non-positive print quantity', () => {
    const result = validate(baseBody({ players: [validPlayer({ prints: 0 })] }));
    expect(result.ok).toBe(false);
  });
  it('rejects an absurdly large print quantity', () => {
    const result = validate(baseBody({ players: [validPlayer({ prints: 100000 })] }));
    expect(result.ok).toBe(false);
  });
  it("rejects a player photo key outside this submission's namespace", () => {
    const result = validate(baseBody({ players: [validPlayer({ photo: { storageKey: 'order-assets/someone-else/p1.jpg' } })] }));
    expect(result.ok).toBe(false);
  });
  it('rejects a blob: URL as a player photo key', () => {
    const result = validate(baseBody({ players: [validPlayer({ photo: { storageKey: 'blob:http://localhost/x' } })] }));
    expect(result.ok).toBe(false);
  });
  it('rejects an unknown template id', () => {
    const result = validate(baseBody({ players: [validPlayer({ templateId: 'not-a-real-template' })] }));
    expect(result.ok).toBe(false);
  });
  it('accepts a player with no templateId (optional)', () => {
    const result = validate(baseBody({ players: [validPlayer({ templateId: undefined })] }));
    expect(result.ok).toBe(true);
  });
});

describe('validateOrderEnquiry — authoritative pricing (never trusts client pricing)', () => {
  it('derives Single tier for 1 player regardless of an altered client tier claim', () => {
    const result = validate(baseBody({ pricing: { pricingTier: 'squad', subtotalPence: 1, coachCardIncluded: true } }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_pricing_tier).toBe('single');
      expect(result.params.p_coach_card).toBeNull();
    }
  });

  it('derives Multi tier for 5 players regardless of client claims', () => {
    const result = validate(baseBody({ players: nPlayers(5), pricing: { pricingTier: 'single', subtotalPence: 999999 } }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_pricing_tier).toBe('multi');
      expect(result.params.p_unit_price_pence).toBe(2199);
    }
  });

  it('derives Squad tier for 10 players and requires a real coach card, ignoring an altered client subtotal', () => {
    const result = validate(
      baseBody({
        players: nPlayers(10),
        pricing: { subtotalPence: 1 },
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach.jpg') },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_pricing_tier).toBe('squad');
      expect(result.params.p_unit_price_pence).toBe(1899);
      expect(result.params.p_subtotal_pence).toBe(18990); // 10 * 1899, NOT the client's claimed 1
      expect(result.params.p_pricing_version).toBe(PRICING_VERSION);
      expect(result.params.p_coach_card).not.toBeNull();
    }
  });

  it('totalPrintQuantity is summed from validated per-player prints, not trusted from the client', () => {
    const result = validate(baseBody({ players: nPlayers(3, (i) => ({ prints: i + 1 })) })); // 1+2+3 = 6
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_paid_player_count).toBe(3);
      expect(result.params.p_total_print_quantity).toBe(6);
      expect(result.params.p_subtotal_pence).toBe(6 * result.params.p_unit_price_pence);
    }
  });
});

describe('validateOrderEnquiry — Single/Multi coach card rejection', () => {
  it('rejects an injected coachCard block on a Single order', () => {
    const result = validate(
      baseBody({ coachCard: { fullName: 'X', roleTitle: 'Y', clubName: 'Z', teamName: 'Z', photoKey: photoKey('c.jpg') } }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an injected coachCard block on a Multi order', () => {
    const result = validate(
      baseBody({ players: nPlayers(4), coachCard: { fullName: 'X', roleTitle: 'Y', clubName: 'Z', teamName: 'Z', photoKey: photoKey('c.jpg') } }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateOrderEnquiry — Squad coach card requirements', () => {
  const squadPlayers = nPlayers(10);

  it('rejects a squad submission with no coachCard at all', () => {
    const result = validate(baseBody({ players: squadPlayers }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/coach card/i);
  });

  it('rejects incomplete coach card details (missing fullName)', () => {
    const result = validate(
      baseBody({ players: squadPlayers, coachCard: { roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('c.jpg') } }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects whitespace-only coach fields', () => {
    const result = validate(
      baseBody({
        players: squadPlayers,
        coachCard: { fullName: '   ', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('c.jpg') },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a coach club/team that does not belong to the submitted order', () => {
    const result = validate(
      baseBody({
        players: squadPlayers,
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Some Other Club', teamName: 'Some Other Club', photoKey: photoKey('c.jpg') },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid (out-of-namespace) coach photo key', () => {
    const result = validate(
      baseBody({
        players: squadPlayers,
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: 'blob:http://localhost/x' },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects the coach photo reusing a player photo key', () => {
    const sharedKey = photoKey('shared.jpg');
    const result = validate(
      baseBody({
        players: [validPlayer({ id: 'p1', photo: { storageKey: sharedKey } }), ...nPlayers(9, (i) => ({ id: `p${i + 2}` }))],
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: sharedKey },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a complete, valid coach card for an eligible squad order', () => {
    const result = validate(
      baseBody({
        players: squadPlayers,
        coachCard: { fullName: '  Alex Coach  ', roleTitle: ' Head Coach ', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach.jpg') },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_coach_card).toEqual({
        fullName: 'Alex Coach',
        roleTitle: 'Head Coach',
        clubName: 'Sunday League FC',
        teamName: 'Sunday League FC',
        photoKey: photoKey('coach.jpg'),
      });
    }
  });
});

describe('validateOrderEnquiry — idempotency fingerprint', () => {
  it('produces the same fingerprint for identical content submitted twice', () => {
    const body = baseBody({ players: nPlayers(2) });
    const first = validate(body);
    const second = validate(body);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.params.p_request_fingerprint).toBe(second.params.p_request_fingerprint);
    }
  });

  it('produces a different fingerprint when the submitted content materially changes', () => {
    const first = validate(baseBody({ players: nPlayers(2) }));
    const second = validate(baseBody({ players: nPlayers(3) }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.params.p_request_fingerprint).not.toBe(second.params.p_request_fingerprint);
    }
  });
});

describe('validateOrderEnquiry — orderRef', () => {
  it('falls back to a server-generated ref derived from the submission key when none is supplied', () => {
    const result = validate(baseBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_order_ref).toMatch(/^emblem-/);
    }
  });

  it('uses a valid client-supplied orderRef', () => {
    const result = validate(baseBody({ orderRef: 'emblem-abc123' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_order_ref).toBe('emblem-abc123');
    }
  });

  it('rejects a malformed client-supplied orderRef in favour of a server-generated one', () => {
    const result = validate(baseBody({ orderRef: '!!!not valid!!!' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_order_ref).toMatch(/^emblem-/);
      expect(result.params.p_order_ref).not.toBe('!!!not valid!!!');
    }
  });
});

describe('validateOrderEnquiry — print files', () => {
  it('rejects the whole submission if any print file has a key outside the print-files/ category entirely', () => {
    // Stage 6 amendment — print files are now validated strictly (namespace
    // + player ownership), not silently filtered: a malformed/foreign entry
    // is rejected outright, since silently dropping it would leave that
    // player's card unproduced with no signal to anyone (see the
    // asset-completeness report).
    const result = validate(baseBody({ printFiles: [{ key: 'evil/path.pdf' }] }));
    expect(result.ok).toBe(false);
  });

  it('accepts a well-namespaced print-files/<submissionKey>/ key', () => {
    const result = validate(baseBody({ printFiles: [{ playerId: 'player-1', key: printFileKey() }] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_print_files).toEqual([{ playerId: 'player-1', playerName: null, key: printFileKey() }]);
    }
  });

  it('rejects when no print files are present', () => {
    const result = validate(baseBody({ printFiles: [] }));
    expect(result.ok).toBe(false);
  });
});

describe('validateOrderEnquiry — retry stability (Stage 6 asset-idempotency amendment)', () => {
  it('two calls with identical, stable player/coach photo keys produce byte-identical params and fingerprint', () => {
    const body = baseBody({
      players: nPlayers(10),
      coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach.jpg') },
    });
    const first = validate(body);
    const second = validate(body); // simulates an identical retry after a lost response
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.params).toEqual(first.params);
      expect(second.params.p_request_fingerprint).toBe(first.params.p_request_fingerprint);
    }
  });

  it('demonstrates the original defect: a changed player photoKey between attempts (the pre-fix behaviour) changes the fingerprint', () => {
    const first = validate(baseBody({ players: [validPlayer({ id: 'p1', photo: { storageKey: photoKey('attempt-1.jpg') } })] }));
    const second = validate(baseBody({ players: [validPlayer({ id: 'p1', photo: { storageKey: photoKey('attempt-2.jpg') } })] }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.params.p_request_fingerprint).not.toBe(first.params.p_request_fingerprint);
    }
    // This is exactly why ProductionBuilder.tsx now caches upload results
    // by stable identity (blob URL / coach photo.id) instead of generating
    // a fresh key on every submit attempt — a real retry must look like
    // the first case above, never this one.
  });

  it('a changed coach photoKey between attempts also changes the fingerprint (the pre-fix coach defect)', () => {
    const players = nPlayers(10);
    const first = validate(baseBody({ players, coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach-attempt-1.jpg') } }));
    const second = validate(baseBody({ players, coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach-attempt-2.jpg') } }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.params.p_request_fingerprint).not.toBe(first.params.p_request_fingerprint);
    }
  });
});

describe('validateOrderEnquiry — badge, print-file namespace/ownership, malformed rejection', () => {
  it('accepts a valid badgeStorageKey and queues it for verification', () => {
    const result = validate(baseBody({ players: [validPlayer({ id: 'p1', badgeStorageKey: photoKey('p1-badge.jpg') })] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_players[0].badgeStorageKey).toBe(photoKey('p1-badge.jpg'));
      expect(result.assetsToVerify.some((a) => a.key === photoKey('p1-badge.jpg') && a.category === 'photo')).toBe(true);
    }
  });

  it('is fine with no badge at all (official collection / no upload)', () => {
    const result = validate(baseBody({ players: [validPlayer({ id: 'p1' })] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.p_players[0].badgeStorageKey).toBeNull();
  });

  it('rejects a malformed badgeStorageKey rather than silently dropping it', () => {
    const result = validate(baseBody({ players: [validPlayer({ id: 'p1', badgeStorageKey: 'blob:http://localhost/x' })] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a badge key from a different submission', () => {
    const result = validate(baseBody({ players: [validPlayer({ id: 'p1', badgeStorageKey: 'order-assets/someone-else/p1-badge.jpg' })] }));
    expect(result.ok).toBe(false);
  });

  it.each([
    'blob:http://localhost/badge',
    'data:image/png;base64,AAAA',
    'https://example.com/badge.png',
  ])('rejects an arbitrary badge URL without a durable upload key: %s', (badgeUrl) => {
    const result = validate(baseBody({ players: [validPlayer({ badgeUrl, badgeSnapshotUrl: badgeUrl })] }));
    expect(result.ok).toBe(false);
  });

  it('supports a recognised official static badge without S3 verification', () => {
    const badgeSnapshotUrl = '/templates/emjfl/clubs/afc-oldham.png';
    const result = validate(baseBody({ players: [validPlayer({ badgeSnapshotUrl })] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_players[0].badgeSnapshotUrl).toBe(badgeSnapshotUrl);
      expect(result.assetsToVerify.some((asset) => asset.key === badgeSnapshotUrl)).toBe(false);
    }
  });

  it('strips an uploaded badge signed preview URL from the normalized RPC input', () => {
    const key = photoKey('badge.png');
    const result = validate(baseBody({ players: [validPlayer({ badgeStorageKey: key, badgeUrl: 'https://signed.example/expires' })] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_players[0]).toMatchObject({ badgeStorageKey: key, badgeUrl: null, badgeSnapshotUrl: null });
      expect(JSON.stringify(result.params)).not.toContain('signed.example');
    }
  });

  it('keeps each uploaded badge attached to its own player in a multi-club order', () => {
    const players = [
      validPlayer({ id: 'red-1', club: 'Red FC', badgeStorageKey: photoKey('red-badge.png') }),
      validPlayer({ id: 'blue-1', club: 'Blue FC', badgeStorageKey: photoKey('blue-badge.png') }),
    ];
    const result = validate(baseBody({ players }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_players.map(({ id, club, badgeStorageKey }) => ({ id, club, badgeStorageKey }))).toEqual([
        { id: 'red-1', club: 'Red FC', badgeStorageKey: photoKey('red-badge.png') },
        { id: 'blue-1', club: 'Blue FC', badgeStorageKey: photoKey('blue-badge.png') },
      ]);
    }
  });

  it('accepts a valid, namespaced print file and queues it for verification', () => {
    const result = validate(baseBody({ printFiles: [{ playerId: 'player-1', playerName: 'Alex', key: printFileKey() }] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.p_print_files).toEqual([{ playerId: 'player-1', playerName: 'Alex', key: printFileKey() }]);
      expect(result.assetsToVerify.some((a) => a.key === printFileKey() && a.category === 'print-file')).toBe(true);
    }
  });

  it('rejects a print file outside this submission (wrong or missing namespace)', () => {
    const result = validate(baseBody({ printFiles: [{ playerId: 'player-1', key: 'print-files/some-other-submission/card/1.pdf' }] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a print file for a player id that is not part of this submission', () => {
    const result = validate(baseBody({ printFiles: [{ playerId: 'not-in-this-order', key: printFileKey() }] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a duplicate print file for the same player', () => {
    const result = validate(
      baseBody({
        printFiles: [
          { playerId: 'player-1', key: printFileKey('a.pdf') },
          { playerId: 'player-1', key: printFileKey('b.pdf') },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a missing PDF for one submitted player', () => {
    const result = validate(baseBody({
      players: nPlayers(2),
      printFiles: [{ playerId: 'player-1', key: printFileKey('player-1.pdf') }],
    }));
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed print-file entry', () => {
    const result = validate(baseBody({ printFiles: [{ playerId: 'player-1' }] }));
    expect(result.ok).toBe(false);
  });

  it('normalizes print files in submitted player order and gives arrival-order-independent fingerprints', () => {
    const players = nPlayers(2);
    const first = validate(baseBody({
      players,
      printFiles: [
        { playerId: 'player-2', key: printFileKey('player-2.pdf') },
        { playerId: 'player-1', key: printFileKey('player-1.pdf') },
      ],
    }));
    const second = validate(baseBody({
      players,
      printFiles: [
        { playerId: 'player-1', key: printFileKey('player-1.pdf') },
        { playerId: 'player-2', key: printFileKey('player-2.pdf') },
      ],
    }));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.params.p_print_files.map((file) => file.playerId)).toEqual(['player-1', 'player-2']);
      expect(first.params.p_print_files).toEqual(second.params.p_print_files);
      expect(first.params.p_request_fingerprint).toBe(second.params.p_request_fingerprint);
    }
  });

  it('rejects zero print files for a new authoritative order', () => {
    const result = validate(baseBody({ printFiles: [] }));
    expect(result.ok).toBe(false);
  });

  it('every required key is queued exactly once, even if a badge happened to reuse a print-file-shaped string', () => {
    const result = validate(
      baseBody({
        players: [validPlayer({ id: 'player-1' })],
        printFiles: [{ playerId: 'player-1', key: printFileKey() }],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = result.assetsToVerify.map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length); // no duplicates
    }
  });
});

describe('verifySubmittedAssetKeys', () => {
  const players = [validPlayer({ id: 'p1' })];

  it('accepts when every referenced key exists, is an allowed type, and has a valid size', async () => {
    const validated = validate(baseBody({ players }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => validMetaFor(key));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(true);
  });

  it('accepts a valid front/back print file (application/pdf)', async () => {
    const validated = validate(baseBody({ printFiles: [{ playerId: 'player-1', key: printFileKey() }] }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => (key.startsWith('print-files/') ? validPdfMeta() : validPhotoMeta()));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(true);
  });

  it('accepts a valid badge alongside a valid photo', async () => {
    const validated = validate(baseBody({ players: [validPlayer({ id: 'p1', badgeStorageKey: photoKey('p1-badge.jpg') })] }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => validMetaFor(key));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(true);
    expect(checker).toHaveBeenCalledTimes(3); // photo + badge + required print file
  });

  it('rejects when a referenced object does not exist (missing print file)', async () => {
    const validated = validate(baseBody({ printFiles: [{ playerId: 'player-1', key: printFileKey() }] }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => (key.startsWith('print-files/') ? { exists: false } : validPhotoMeta()));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects a zero-byte object', async () => {
    const validated = validate(baseBody({ players }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async () => ({ exists: true, contentType: 'image/jpeg', contentLength: 0 }));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects a zero-byte required PDF specifically', async () => {
    const validated = validate(baseBody());
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => key.startsWith('print-files/')
      ? { exists: true, contentType: 'application/pdf', contentLength: 0 }
      : validPhotoMeta());
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects an oversized photo (over the 18MB photo-category limit)', async () => {
    const validated = validate(baseBody({ players }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async () => ({ exists: true, contentType: 'image/jpeg', contentLength: 19 * 1024 * 1024 }));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects an oversized print file (over the print-file-category limit)', async () => {
    const validated = validate(baseBody({ printFiles: [{ playerId: 'player-1', key: printFileKey() }] }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => (key.startsWith('print-files/') ? { exists: true, contentType: 'application/pdf', contentLength: 26 * 1024 * 1024 } : validPhotoMeta()));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects a photo key whose object is actually a PDF (wrong MIME for its category)', async () => {
    const validated = validate(baseBody({ players }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async () => ({ exists: true, contentType: 'application/pdf', contentLength: 500_000 }));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects a print-file key whose object is actually an image (wrong MIME for its category)', async () => {
    const validated = validate(baseBody({ printFiles: [{ playerId: 'player-1', key: printFileKey() }] }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => (key.startsWith('print-files/') ? { exists: true, contentType: 'image/jpeg', contentLength: 500_000 } : validPhotoMeta()));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects when the object exists but is not an allowed content type at all', async () => {
    const validated = validate(baseBody({ players }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async () => ({ exists: true, contentType: 'application/zip', contentLength: 500_000 }));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
  });

  it('rejects, without leaking the raw error, when the checker throws', async () => {
    const validated = validate(baseBody({ players }));
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async () => {
      throw new Error('AWS credential AKIAIOSFODNN7EXAMPLE rejected');
    });
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain('AKIA');
  });

  it('checks the coach photo key in addition to every player photo key', async () => {
    const validated = validate(
      baseBody({
        players: nPlayers(10),
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach.jpg') },
      }),
    );
    if (!validated.ok) throw new Error('setup failed');
    const seenKeys: string[] = [];
    const checker: AssetChecker = vi.fn(async (key) => {
      seenKeys.push(key);
      return validMetaFor(key);
    });
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(result.ok).toBe(true);
    expect(seenKeys).toContain(photoKey('coach.jpg'));
    expect(seenKeys).toHaveLength(21); // 10 photos + 10 PDFs + 1 coach
  });

  it('checks all players even when one of many fails, and reports failure overall', async () => {
    // 10 players -> Squad tier -> requires a coachCard too (see the Squad
    // coach-card requirement tests above); include a valid one so this
    // test's only concern (partial S3 failure among many keys) is isolated.
    const validated = validate(
      baseBody({
        players: nPlayers(10),
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach.jpg') },
      }),
    );
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => ({ exists: !key.includes('player-5.jpg'), contentType: 'image/jpeg', contentLength: 500_000 }));
    const result = await verifySubmittedAssetKeys(validated.assetsToVerify, checker, { concurrency: 3 });
    expect(result.ok).toBe(false);
  });

  it('every required key is checked exactly once after deduplication', async () => {
    const validated = validate(
      baseBody({
        players: [validPlayer({ id: 'p1', badgeStorageKey: photoKey('p1-badge.jpg') })],
        printFiles: [{ playerId: 'p1', key: printFileKey() }],
      }),
    );
    if (!validated.ok) throw new Error('setup failed');
    const checker: AssetChecker = vi.fn(async (key) => (key.startsWith('print-files/') ? validPdfMeta() : validPhotoMeta()));
    await verifySubmittedAssetKeys(validated.assetsToVerify, checker);
    expect(checker).toHaveBeenCalledTimes(3); // photo + badge + print file, no duplicates
  });

  it('respects a bounded concurrency (never more in flight than the configured limit)', async () => {
    const validated = validate(
      baseBody({
        players: nPlayers(20),
        coachCard: { fullName: 'Alex Coach', roleTitle: 'Coach', clubName: 'Sunday League FC', teamName: 'Sunday League FC', photoKey: photoKey('coach.jpg') },
      }),
    );
    if (!validated.ok) throw new Error('setup failed');
    let inFlight = 0;
    let maxInFlight = 0;
    const checker: AssetChecker = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return validPhotoMeta();
    });
    await verifySubmittedAssetKeys(validated.assetsToVerify, checker, { concurrency: 4 });
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });
});
