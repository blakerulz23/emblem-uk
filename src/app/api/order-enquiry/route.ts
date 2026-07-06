import { NextResponse } from 'next/server';

type EnquiryBody = {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    team?: string;
    notes?: string;
  };
  order?: {
    id?: string;
    type?: string;
    club?: string;
  };
  pricing?: {
    approvedPrints?: number;
    subtotal?: number;
  };
  players?: unknown[];
  submittedAt?: string;
};

export async function POST(request: Request) {
  let body: EnquiryBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid production request payload' }, { status: 400 });
  }

  const name = body.contact?.name?.trim();
  const email = body.contact?.email?.trim();
  const hasEmail = Boolean(email && /\S+@\S+\.\S+/.test(email));
  const approvedPlayers = Array.isArray(body.players) ? body.players.length : 0;

  if (!name || !hasEmail) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }

  if (approvedPlayers < 1) {
    return NextResponse.json({ error: 'Approve at least one card before sending' }, { status: 400 });
  }

  // This is intentionally a thin handoff point. It can be connected to email,
  // a CRM, Supabase, Airtable, or Shopify draft orders without changing the UI.
  console.info('Emblem production request received', {
    orderId: body.order?.id,
    orderType: body.order?.type,
    club: body.order?.club,
    approvedPlayers,
    approvedPrints: body.pricing?.approvedPrints,
    subtotal: body.pricing?.subtotal,
    contact: {
      name,
      email,
      phone: body.contact?.phone,
      team: body.contact?.team,
    },
    submittedAt: body.submittedAt,
  });

  return NextResponse.json({
    ok: true,
    message: 'Production request received',
    requestId: `emblem-${Date.now()}`,
  });
}
