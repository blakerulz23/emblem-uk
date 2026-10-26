"""Generates Emblem's favicon and app-icon set from one vector definition of
the Emblem "E" symbol (three slanted bars plus the orange wedge, no
wordmark).

The geometry was measured from public/builder-emblem-logo.png (the
largest clean copy of the symbol in the repo, 314x316 px): the bars'
right edges share one line of slope 0.485, the wedge's long edge is
parallel to it, and the bars' top-left corners have a radius of half the
bar height.

Outputs:
  src/app/icon.svg              adaptive favicon: dark bars on light tabs, white bars on dark tabs
  src/app/favicon.ico           16/32/48 px fallback on a dark rounded tile (reads on any tab)
  src/app/apple-icon.png        180 px, opaque dark square (iOS applies its own rounding)
  public/icon-192.png           manifest icon, dark rounded tile
  public/icon-512.png           manifest icon, dark rounded tile
  public/icon-maskable-512.png  manifest maskable icon, full-bleed dark, symbol inside the safe zone

Run from the repo root: python scripts/generate-brand-icons.py  (needs Pillow)
"""

import math
import os

from PIL import Image, ImageDraw

# --- Symbol geometry (units = pixels of the measured 314x316 source) -------
SLOPE = 0.485               # horizontal shift per unit of height on the slanted edges
BAR_LINE_X0 = 316.5         # x of the bars' shared right edge at y = 0
WEDGE_LINE_X0 = 360.0       # x of the wedge's long edge at y = 0
RIGHT = 312.5               # the wedge's vertical right edge
BARS = [(0.5, 80.5), (112.0, 196.5), (229.0, 315.5)]  # (top, bottom) of each bar
LEFT = 0.5
VIEW = (0, 0, 316, 316)

DARK_TILE = (15, 13, 11)            # #0F0D0B, Emblem OS dark background
WHITE = (255, 255, 255)
ORANGE_ON_DARK = (254, 122, 39)     # #FE7A27, from the site's white logo (embm-nav.png)
INK_ON_LIGHT = (17, 17, 17)         # #111111
ORANGE_ON_LIGHT = (236, 84, 33)     # #EC5421, from the black-on-white logo


def bar_right(y):
    return BAR_LINE_X0 - SLOPE * y


def shapes():
    """Each shape: list of (x, y, corner_radius) vertices, clockwise."""
    out = []
    for top, bottom in BARS:
        r = (bottom - top) / 2
        out.append(('bar', [
            (LEFT, top, r),                 # rounded top-left
            (bar_right(top), top, 4),       # acute top-right
            (bar_right(bottom), bottom, 6), # obtuse bottom-right
            (LEFT, bottom, 0),              # square bottom-left
        ]))
    bottom = BARS[-1][1]
    wedge_top_y = (WEDGE_LINE_X0 - RIGHT) / SLOPE
    out.append(('wedge', [
        (RIGHT, wedge_top_y, 3),
        (RIGHT, bottom, 25),
        (WEDGE_LINE_X0 - SLOPE * bottom, bottom, 0),
    ]))
    return out


def rounded_outline(verts, steps=10):
    """Polygon points with each corner replaced by a quadratic curve whose
    control point is the vertex (cut back by its radius along both edges).
    Returns (points, svg_path)."""
    n = len(verts)
    pts, path = [], []
    for i, (x, y, r) in enumerate(verts):
        px, py, _ = verts[i - 1]
        nx, ny, _ = verts[(i + 1) % n]
        if r <= 0:
            seg = [(x, y)]
            path.append(('L', (x, y)))
        else:
            def toward(ax, ay, d):
                length = math.hypot(ax - x, ay - y)
                d = min(d, length / 2)
                return (x + (ax - x) * d / length, y + (ay - y) * d / length)
            a = toward(px, py, r)
            b = toward(nx, ny, r)
            seg = []
            for s in range(steps + 1):
                t = s / steps
                seg.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * x + t ** 2 * b[0],
                            (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * y + t ** 2 * b[1]))
            path.append(('L', a))
            path.append(('Q', (x, y), b))
        pts.extend(seg)
    d = []
    for j, item in enumerate(path):
        if item[0] == 'L':
            d.append(('M' if j == 0 else 'L') + f'{item[1][0]:.1f} {item[1][1]:.1f}')
        else:
            d.append(f'Q{item[1][0]:.1f} {item[1][1]:.1f} {item[2][0]:.1f} {item[2][1]:.1f}')
    return pts, ''.join(d) + 'Z'


def write_svg(path):
    bars = []
    wedge = ''
    for kind, verts in shapes():
        _, d = rounded_outline(verts)
        if kind == 'bar':
            bars.append(d)
        else:
            wedge = d
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEW[0]} {VIEW[1]} {VIEW[2]} {VIEW[3]}">'
        '<style>'
        '.b{fill:#111111}.w{fill:#EC5421}'
        '@media (prefers-color-scheme:dark){.b{fill:#FFFFFF}.w{fill:#FE7A27}}'
        '</style>'
        f'<path class="b" d="{"".join(bars)}"/>'
        f'<path class="w" d="{wedge}"/>'
        '</svg>\n'
    )
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg)


def render(size, *, tile, tile_radius, symbol_fraction, ss=8):
    """Renders the symbol centred on a square canvas, supersampled ss times."""
    big = size * ss
    im = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    if tile == 'rounded':
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=tile_radius * big, fill=DARK_TILE + (255,))
    elif tile == 'square':
        draw.rectangle((0, 0, big - 1, big - 1), fill=DARK_TILE + (255,))
    scale = symbol_fraction * big / VIEW[2]
    offset = (big - VIEW[2] * scale) / 2
    for kind, verts in shapes():
        pts, _ = rounded_outline(verts, steps=24)
        poly = [(offset + x * scale, offset + y * scale) for x, y in pts]
        draw.polygon(poly, fill=(WHITE if kind == 'bar' else ORANGE_ON_DARK) + (255,))
    return im.resize((size, size), Image.LANCZOS)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = os.path.join(root, 'src', 'app')
    public = os.path.join(root, 'public')

    write_svg(os.path.join(app, 'icon.svg'))

    # Favicon fallback: a dark rounded tile keeps the white bars legible on
    # light and dark tabs alike. The symbol fills more of the smallest sizes.
    ico_frames = [render(s, tile='rounded', tile_radius=0.22, symbol_fraction=f)
                  for s, f in ((16, 0.80), (32, 0.74), (48, 0.72))]
    ico_frames[-1].save(os.path.join(app, 'favicon.ico'), format='ICO',
                        sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico_frames[:-1])

    # iOS masks the corners itself and needs an opaque icon.
    render(180, tile='square', tile_radius=0, symbol_fraction=0.62).convert('RGB').save(
        os.path.join(app, 'apple-icon.png'), optimize=True)

    for size in (192, 512):
        render(size, tile='rounded', tile_radius=0.22, symbol_fraction=0.66).save(
            os.path.join(public, f'icon-{size}.png'), optimize=True)
    # Maskable: full bleed, symbol well inside the 80% safe-zone circle.
    render(512, tile='square', tile_radius=0, symbol_fraction=0.52).convert('RGB').save(
        os.path.join(public, 'icon-maskable-512.png'), optimize=True)


if __name__ == '__main__':
    main()
