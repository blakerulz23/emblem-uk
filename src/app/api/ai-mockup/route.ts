// src/app/api/ai-mockup/route.ts
// Shared Gemini image-stylization endpoint.
// Ported from plushlings/api/generate.js and boppleheads/lib/gemini.ts.
//
// Accepts: { imageBase64, mimeType, kind }
// kind · 'plushie' | 'bobblehead' | 'jewelry-charm' | 'keychain-charm' | 'pin-charm' | 'magnet-charm'
// Returns: { image: 'data:image/png;base64,...', model: 'gemini-...' }

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];

type Kind =
  | 'cutout'
  | 'plushie'
  | 'figurine'
  | 'pendant'
  | 'coin'
  | 'bobblehead'
  | 'armyman'
  | 'rushmore'
  | 'jewelry-charm'
  | 'keychain-charm'
  | 'pin-charm'
  | 'magnet-charm'
  | 'tile-poster'
  | 'tile-sticker'
  | 'tile-keychain'
  | 'tile-magnet'
  | 'tile-pin';

const PROMPTS: Record<Kind, string> = {
  plushie: `Transform this photo into a cute, soft plush KEYCHAIN CHARM of the subject. The subject may be a person OR an animal/pet. Produce a simple commercial PRODUCT SHOT. Requirements:
- A small, huggable plush doll (about 4-6 inches tall) in a friendly front-facing standing or sitting pose
- A KEYCHAIN AT THE TOP IS MANDATORY: a small silver/metal split-ring keyring attached to the very top of the plush's head by a short fabric strap or loop, so it clearly reads as a collectible plush keychain charm. The metal ring must be fully visible above the head and must never be cropped or omitted
- Soft fabric look: minky/fleece/felt textures, visible seams and stitching, slightly fuzzy surface
- Chibi/cute proportions: rounded soft body and a gently oversized head, like a high-quality collectible plush
- EYES ARE CRITICAL: large, cute, clearly visible embroidered or glossy felt eyes with catchlights. Eyes are the most prominent facial feature · never omit or minimize them
- Embroidered/stitched facial features (nose, mouth) and a sewn-on look for clothing details
- For people: keep clothing, hairstyle, hair color, and skin tone recognizable but rendered as plush fabric and yarn hair
- For animals/pets: keep the breed, fur color, and distinctive markings recognizable, rendered as soft plush fur
- Clean pure white studio background, soft even lighting, subtle natural contact shadow under the plush
- Full body visible and centered, including the keychain ring at the top, like a catalog/e-commerce product photo
- No text, no watermarks, no extra props, no packaging`,
  figurine: `Transform this athlete photo into a STYLIZED ANIMATED SPORTS FIGURINE - a cartoon-style hand-painted collectible toy. Think Disney Infinity, Pixar shelf collectibles, or McFarlane Sportspicks - playful and toy-like, NOT a photo, NOT realistic. Produce a clean commercial product shot. Requirements:

- STYLIZED CARTOON PROPORTIONS: head is slightly larger than realistic (about 1.2-1.4x normal head-to-body ratio, but NOT a bobblehead). Body proportions are simplified and slightly stocky. Feels like a fun action-figure toy a kid would pick up.
- The figurine MUST be recognizable as the subject: capture face shape, hair color, hair style, skin tone, key distinguishing features - but SIMPLIFIED into cartoon form. Not photo-real.
- Surface: smooth painted vinyl/plastic, like a high-quality toy collectible. Visible painted color, clean edges, slight glossy finish, slight matte on cloth areas. NO photo-realistic skin pores, NO photo-real fabric weave.
- Face: large expressive cartoon-toy eyes (rounded with iris + clear catchlight). Simplified painted features - eyebrows, mouth, nose. Friendly confident expression. NOT Funko-flat dot eyes - they should look painted on with personality.
- Pose: MATCH THE POSE in the uploaded photo - if they are shooting, dribbling, swinging, running, kicking, replicate that pose in the figurine. Pose should feel kinetic, fun, action-ready.
- Uniform / clothing: simplified painted version of what is in the photo. Big bold blocked-in colors. Simplified logo and number prints (not photo-real). Bright vibrant tones.
- Hair: stylized painted hair shape - keep color and general style but simplified into clean painted forms (not strand-by-strand realistic).
- Base: clean circular display base under the feet - matte black or matte charcoal disc with a thin polished-chrome edge ring. Optionally a clear support rod for dynamic poses.
- Studio shot: clean PURE WHITE (#FFFFFF) background, soft three-point lighting designed for product photography (NOT dramatic / NOT cinematic). Subtle natural contact shadow under the base.
- Subject centered in frame, full body visible head-to-base, slight breathing room. Should look like a single hero collectible on a store shelf.
- NO photo-real skin, NO photo-real fabric, NO bobblehead head ratio, NO Funko-style flat dot eyes, NO ultra-chibi, NO realistic 3D CGI render, NO action lines, NO speed effects, NO sparks, NO environment, NO text, NO watermarks, NO packaging.

This should look like a fun cartoon-styled toy collectible - the kind of figurine a kid would proudly display on their dresser. Recognizable as themselves but rendered as a painted toy.`,

  bobblehead: `Transform this photo into a cute 3D cartoon bobblehead figurine. This could be a person OR an animal/pet. Requirements:
- Standing upright on a small round white base/platform
- Oversized head proportions (head is about 2x the normal size compared to body)
- Looks like a high-quality collectible vinyl toy or 3D printed figurine
- Chibi/cute cartoon style but still recognizable as the subject
- EYES ARE CRITICAL: Large, expressive, clearly visible cartoon eyes with well-defined pupils, irises, and highlights/catchlights. Eyes should be the most prominent facial feature. Never omit or minimize the eyes.
- Clean pure white background
- For people: keep clothing, hairstyle, skin tone, and facial features recognizable but stylized
- For animals/pets: keep the breed, fur color, markings, and distinctive features recognizable but stylized in a cute chibi way. Add a playful pose if appropriate.
- Front-facing, full body visible, standing pose
- Smooth, clean surfaces suitable for 3D modeling
- No text, no watermarks, no extra objects`,

  'jewelry-charm': `Transform the uploaded main subject into a realistic custom jewelry piece. Preserve the subject's core shape, colors, identity, and recognizable details, but convert it into a polished wearable jewelry design. Render it as a high-quality charm made from glossy enamel and polished metal, with clean edges, subtle depth, and premium craftsmanship. The subject should look like a finished physical jewelry item photographed in studio lighting. Place it centered on a plain white background with soft natural shadows.

CRITICAL · TREAT THE ENTIRE UPLOADED SUBJECT AS ONE SINGLE CONNECTED PIECE: if the subject contains multiple letters, words, characters, or distinct elements, render them as ONE unified charm with a single continuous outer metal border that wraps the whole composition. Do NOT separate or individually outline each letter, word, or element. There must be exactly ONE charm in the final image. Leave about 15-20% margin of white space around all edges so the charm does not fill the entire frame.

No extra objects, no decorative background, no added text unless it already exists in the uploaded subject.`,

  'keychain-charm': `Transform the uploaded main subject into a realistic die-cut acrylic keychain. Preserve the subject's core shape, colors, identity, and recognizable details, but convert it into a clean physical keychain design with a thick transparent acrylic border following the silhouette. Add a small circular metal keyring hole near the top, attached to a silver split ring. The keychain should look like a finished product photographed from the front, with subtle glossy reflections, slight thickness, polished edges, and soft natural shadows. Place the keychain centered on a plain white background.

CRITICAL · TREAT THE ENTIRE UPLOADED SUBJECT AS ONE SINGLE CONNECTED PIECE: if the subject contains multiple letters, words, characters, or distinct elements, render them as ONE unified keychain with a single continuous acrylic border that wraps the whole composition, and exactly ONE split ring at the top. Do NOT separate or individually die-cut each letter, word, or element. Exactly ONE keychain in the final image. Leave about 15-20% margin of white space around all edges so the keychain does not fill the entire frame.

No extra objects, no text unless it already exists in the uploaded subject, no decorative background.`,

  'pin-charm': `Transform the uploaded main subject into a realistic custom enamel pin. Preserve the subject's core shape, colors, identity, and recognizable details, but convert it into a polished physical pin design. Add a clean metal outline following the silhouette, glossy enamel color fills, slight raised metal edges, realistic thickness, and subtle highlights. The result should look like a finished product photographed from the front, centered on a plain white background with soft studio lighting and a gentle shadow.

CRITICAL · TREAT THE ENTIRE UPLOADED SUBJECT AS ONE SINGLE CONNECTED PIECE: if the subject contains multiple letters, words, characters, or distinct elements, render them as ONE unified pin with a single continuous outer metal border wrapping the whole composition. Do NOT separate or individually outline each letter, word, or element. There must be exactly ONE pin in the final image. Leave about 15-20% margin of white space around all edges so the pin does not fill the entire frame.

No extra objects, no decorative background, no added text unless it already exists in the uploaded subject.`,

  'magnet-charm': `Transform the uploaded main subject into a realistic custom epoxy magnet. Preserve the subject's core shape, colors, identity, and recognizable details, but convert it into a glossy physical magnet made in the exact silhouette of the subject. The piece should have a smooth clear epoxy dome coating, rounded edges, slight thickness, realistic reflections, and a polished product-mockup appearance. Place it front-facing and centered on a plain white background with soft studio lighting and a gentle natural shadow.

CRITICAL · TREAT THE ENTIRE UPLOADED SUBJECT AS ONE SINGLE CONNECTED PIECE: if the subject contains multiple letters, words, characters, or distinct elements, render them as ONE unified magnet with a single continuous epoxy border wrapping the whole composition. Do NOT separate or individually cut each letter, word, or element. Exactly ONE magnet in the final image. Leave about 20-25% margin of white space around all edges so the magnet does not fill the entire frame · it should look like a product catalog photo with breathing room.

No enamel, no metal outline, no keyring, no pin backing, no decorative background, and no added text unless it already exists in the uploaded subject.`,
  cutout: `Edit this photo to remove the background completely. PRESERVE the main subject EXACTLY as they appear in the photo · keep their exact face, hair, clothing, pose, body, and all distinctive details unchanged. Do NOT redraw or stylize the subject in any way. ONLY change the background to pure solid white (#FFFFFF). Output a clean, high-resolution cutout of the subject on a flat white background, suitable for compositing onto other designs.

CRITICAL: No shadows, no decorative elements, no added effects, no border, no text. The subject must look photographically identical to the input · only the background is replaced with pure white.

If the subject is a person, keep their full body visible (or upper body if the input is upper body). Center the subject in the frame.`,
  'tile-poster': `Reimagine this athlete photo as a printed poster product, flat. Place the poster centered on a clean pure-white studio background with a soft natural drop shadow. The poster shows the athlete inside a luxury futuristic gold + red trading-card design treatment with sparks, stars, and dynamic light accents. Just the poster, no hands, no people holding it, no environment. High-end product photography, studio lighting.`,
  'tile-sticker': `Reimagine this athlete photo as a circular die-cut vinyl sticker product. Place the sticker centered on a clean pure-white studio background with a soft natural drop shadow. The sticker shows the athlete inside a luxury futuristic gold + red trading-card design treatment around the rim with sparks and dynamic accents. Just the sticker, no hands, no people holding it, no environment. High-end product photography, studio lighting.`,
  'tile-keychain': `Reimagine this athlete photo as a circular clear acrylic keychain product with a small polished silver split ring on top. Place the keychain centered on a clean pure-white studio background with a soft natural drop shadow. The keychain shows the athlete inside a luxury futuristic gold + red trading-card design treatment. Just the keychain, no hands, no people holding it, no environment. High-end product photography, studio lighting.`,
  'tile-magnet': `Reimagine this athlete photo as a rectangular fridge magnet product with rounded corners and a smooth vinyl-laminate finish. Place the magnet centered on a clean pure-white studio background with a soft natural drop shadow. The magnet shows the athlete inside a luxury futuristic gold + red trading-card design treatment. Just the magnet, no hands, no people holding it, no environment. High-end product photography, studio lighting.`,
  'tile-pin': `Reimagine this athlete photo as a circular enamel pin product with a polished silver metal rim and metal pin backing. Place the pin centered on a clean pure-white studio background with a soft natural drop shadow. The pin shows the athlete inside a luxury futuristic gold + red trading-card design treatment. Just the pin, no hands, no people holding it, no environment. High-end product photography, studio lighting.`,
  pendant: `Transform this photo into a classical CAMEO PENDANT inspired by Roman/Greek antiquity. Produce a commercial product shot of an OVAL pendant. Requirements:\n- Oval cameo shape, taller than wide (about 5:6 ratio), centered in frame\n- The subject's face in CLEAN SIDE PROFILE, head and shoulders only, looking to the right\n- CARVED RELIEF: ivory/cream-white raised bust on a darker stone background (charcoal gray, sardonyx, or deep navy)\n- Hair styled in classical Greco-Roman fashion (curls, ribbons, laurel wreath, or flowing waves)\n- Visible chisel marks and subtle shadows that suggest hand-carved stone or shell\n- Pendant has a small metal bail/loop at the top for a necklace chain\n- Photographed from straight-on, soft studio lighting from upper-left\n- Background: solid neutral cream or stone gray (#e8e2d4)\n- No text, no watermarks, no extra props\n- The face must remain clearly recognizable as the original subject · preserve key features (nose shape, jawline, hair density) while idealizing per cameo tradition`,
  coin: `Transform this photo into a COMMEMORATIVE COIN (heads side). Produce a commercial product shot. Requirements:\n- Round metal coin shape, centered in frame, photographed from straight-on\n- The subject's face in CLEAN SIDE PROFILE bust portrait, looking right, occupying the center of the coin\n- Subject is rendered in raised METAL RELIEF · gold-tone (warm yellow #d4af37 highlights, deeper bronze shadows). Subject and background are the SAME metal, just different relief depths\n- A circular border of small dots (denticles) around the edge\n- Subtle text in classical inscription style around the upper rim arc · keep text generic like 'EST 2026' or just abstract letterforms; do NOT spell out specific names\n- Slight wear and patina to suggest minting authenticity\n- Background: neutral charcoal (#1a1a23) with soft circular drop shadow under the coin\n- No hands, no environment props, just the coin\n- The face must remain clearly recognizable as the original subject`,
  armyman: `OVERRIDDEN_BY_DYNAMIC_PROMPT`,
  rushmore: `Transform these photos into a MOUNT RUSHMORE-style group portrait carved into a mountain face. Produce a commercial product shot. Requirements:\n- A horizontal granite/sandstone mountain cliff face with FOUR colossal bust-portraits carved side-by-side, looking straight ahead\n- Each face must be clearly recognizable as ONE of the input photos (in the order provided, left to right). If fewer than 4 photos are provided, replicate the last photo to fill remaining slots OR carve the available faces evenly spaced across the cliff\n- Stone material: weathered grey-tan granite with subtle erosion lines and chisel marks, like the real Mount Rushmore\n- Each bust shows head + upper shoulders, classical hairstyle smoothed into the rock\n- Photographed from a tourist viewpoint, slight upward angle\n- Sky background: partly cloudy daytime, soft blue\n- Small pine trees and rocky base visible at the foot of the cliff for scale\n- No text, no signage, no tourists, no flags\n- Each face must remain clearly identifiable as the original subject while idealized in stone`,
};

  // Army Man: build prompt dynamically from pose + color
  function buildArmyManPrompt(pose: string, color: string): string {
    const POSES: Record<string, string> = {
      rifle: 'standing upright with a rifle raised to the shoulder, aiming forward, legs slightly apart in firing stance',
      kneeling: 'kneeling on one knee, rifle braced against the shoulder ready to fire',
      running: 'mid-stride running forward, body angled slightly, one arm pumping',
      radio: 'standing with a field radio backpack, one hand holding the radio handset to the ear',
    };
    const COLORS: Record<string, string> = {
      green: 'solid army olive green plastic (#5b6f3c), monochrome',
      tan: 'solid desert tan plastic (#c9a97b), monochrome',
      gray: 'solid winter gray plastic (#8a8e94), monochrome',
    };
    const poseDesc = POSES[pose] || POSES.rifle;
    const colorDesc = COLORS[color] || COLORS.green;
    return [
      'Transform this photo of the subject into a CLASSIC PLASTIC TOY ARMY MAN figurine, photographed as a commercial product shot.',
      'Requirements:',
      '- The subject\'s face features (hair, expression) should remain subtly recognizable but stylized as the smooth-plastic army-man look',
      '- Pose: ' + poseDesc,
      '- Material: ' + colorDesc + ' · a single uniform color, no texture detail, no fabric pattern, just smooth molded plastic with subtle highlights',
      '- Wearing a generic infantry uniform and helmet, molded as part of the body',
      '- Standing on a small flat circular plastic base, same color as the figure',
      '- About 6cm tall in real-world scale',
      '- Photographed straight-on, eye level, against a pure white #ffffff studio background',
      '- Soft drop shadow underneath the figure',
      '- Glossy injection-molded plastic finish',
      '- NO additional props, NO weapons except as described in the pose, NO text or labels, NO base extras',
    ].join('\n');
  }


function buildContentsParts(
  text: string,
  mimeType: string,
  imageBase64: string | undefined,
  imagesBase64: string[] | undefined,
): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text }];
  if (imagesBase64 && imagesBase64.length > 0) {
    for (const img of imagesBase64) {
      const data = img.startsWith('data:') ? img.split(',', 2)[1] : img;
      if (data) parts.push({ inlineData: { mimeType, data } });
    }
  } else if (imageBase64) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  return parts;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured on this project.' }, { status: 500 });
  }

  let body: { imageBase64?: string; mimeType?: string; kind?: Kind } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const kind = (body.kind || 'plushie') as Kind;
  if (!(kind in PROMPTS)) {
    return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });
  }
  let imageBase64 = body.imageBase64 || '';
  const mimeType = body.mimeType || 'image/jpeg';
  if (!imageBase64) {
    return NextResponse.json({ error: 'Missing imageBase64.' }, { status: 400 });
  }
  if (imageBase64.includes('base64,')) {
    imageBase64 = imageBase64.split('base64,')[1];
  }

  const payload = {
    contents: [{
      parts: buildContentsParts(
        kind === 'armyman' ? buildArmyManPrompt(String((body as { pose?: string }).pose || 'rifle'), String((body as { color?: string }).color || 'green')) : PROMPTS[kind],
        mimeType,
        imageBase64,
        (body as { imagesBase64?: string[] }).imagesBase64,
      ),
    }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };
  const reqBody = JSON.stringify(payload);
  let lastError = '';

  for (const model of IMAGE_MODELS) {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
    } catch (e) {
      lastError = 'Network error calling Gemini: ' + (e instanceof Error ? e.message : String(e));
      continue;
    }

    if (response.ok) {
      let data: { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }> } = {};
      try {
        data = await response.json();
      } catch {
        lastError = `${model} returned invalid JSON`;
        continue;
      }
      const parts = data?.candidates?.[0]?.content?.parts;
      if (!parts) {
        lastError = `${model} returned no candidates`;
        continue;
      }
      for (const part of parts) {
        if (part.inlineData) {
          return NextResponse.json({
            image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            model,
            kind,
          });
        }
      }
      lastError = `${model} did not return an image part`;
      continue;
    }

    let msg = response.statusText;
    try {
      const err = await response.json();
      msg = err.error?.message || msg;
    } catch {}
    if (response.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      lastError = msg;
      continue;
    }
    return NextResponse.json({ error: `Gemini API error (${model}): ${msg}` }, { status: 502 });
  }

  return NextResponse.json(
    { error: `AI mockup is temporarily unavailable. Last: ${lastError}` },
    { status: 503 },
  );
}
