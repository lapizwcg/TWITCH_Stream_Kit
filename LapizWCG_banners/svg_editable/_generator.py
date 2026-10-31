"""Generator of LapizWCG brand images (source SVGs with live text)."""
import math, random, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "src"
os.makedirs(OUT, exist_ok=True)

SERIF = "Georgia"
SANS = "Bahnschrift"

# ---------- palette ----------
ICE = "#e8f4ff"
ICE2 = "#a9d4ff"
BLUE = "#3d7bff"
LAPIS = "#1f4fd8"
GOLD = "#f0c46a"
GOLD_L = "#ffe6a8"
GOLD_D = "#9a6a24"


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


# ---------- shared defs ----------
def defs_common():
    return f"""
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{GOLD_L}"/><stop offset="0.5" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_D}"/>
</linearGradient>
<linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="{GOLD}" stop-opacity="0"/><stop offset="0.5" stop-color="{GOLD_L}"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/>
</linearGradient>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#7f97c4"/><stop offset="0.48" stop-color="#eef6ff"/><stop offset="0.52" stop-color="#9fb4dc"/><stop offset="1" stop-color="#5a6f9c"/>
</linearGradient>
<radialGradient id="gemGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#6fb8ff" stop-opacity="0.75"/><stop offset="0.45" stop-color="{BLUE}" stop-opacity="0.25"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="discFill" cx="0.5" cy="0.4" r="0.6">
  <stop offset="0" stop-color="#14306e"/><stop offset="1" stop-color="#050b22"/>
</radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="glowBig" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
<filter id="blur50" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="50"/></filter>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="6"/><feOffset dy="5" result="s"/>
  <feFlood flood-color="#00030c" flood-opacity="0.85"/><feComposite in2="s" operator="in" result="sh"/>
  <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
"""


# ---------- emblem: lapis crystal, crossed swords, rune ring ----------
RUNES = [
    "M0 -7 V7 M0 -7 L5 -2",
    "M-4 -7 L4 7 M4 -7 L-4 7",
    "M0 -7 V7 M0 -1 L5 -6 M0 -1 L-5 -6",
    "M-4 7 L0 -7 L4 7",
    "M-3 -7 V7 M-3 -7 L4 -3 L-3 1",
    "M0 -7 V7 M-4 -3 L4 3",
    "M-4 -7 L0 -2 L4 -7 M0 -2 V7",
    "M-4 -6 L4 -6 M0 -6 V7 M-4 7 H4",
]


def rune_ring(r, n, size=1.0, color=ICE2, width=1.4, opacity=0.8, seed=3):
    rnd = random.Random(seed)
    out = [f'<g fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" opacity="{opacity}">']
    for i in range(n):
        a = 360 * i / n
        g = RUNES[rnd.randrange(len(RUNES))]
        out.append(f'<path transform="rotate({f(a)}) translate(0 {f(-r)}) scale({size})" d="{g}"/>')
    out.append("</g>")
    return "".join(out)


def sword(angle):
    return f"""<g transform="rotate({angle})">
  <path d="M0 -178 L9 -160 L9 118 L-9 118 L-9 -160 Z" fill="url(#steel)" stroke="#1a2a55" stroke-width="1.5"/>
  <path d="M0 -170 V114" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"/>
  <path d="M-38 118 Q-20 112 0 116 Q20 112 38 118 L40 128 Q20 124 0 128 Q-20 124 -40 128 Z" fill="url(#gold)" stroke="#4a3212" stroke-width="1.2"/>
  <rect x="-5.5" y="128" width="11" height="40" rx="3" fill="#2a1c3a" stroke="#4a3212" stroke-width="1"/>
  <path d="M-5.5 136 H5.5 M-5.5 146 H5.5 M-5.5 156 H5.5" stroke="{GOLD}" stroke-width="1.4" opacity="0.8"/>
  <circle cy="174" r="8" fill="url(#gold)" stroke="#4a3212" stroke-width="1.2"/>
</g>"""


def gem(s=1.0):
    # outer hexagonal crystal and inner table
    O = [(0, -80), (48, -30), (48, 30), (0, 80), (-48, 30), (-48, -30)]
    I = [(0, -36), (22, -13), (22, 13), (0, 36), (-22, 13), (-22, -13)]
    shades = ["#5aa2ff", "#2f74ff", "#1846c4", "#0f2f8f", "#1d55e0", "#3d8bff"]
    parts = []
    for k in range(6):
        a, b = O[k], O[(k + 1) % 6]
        c, d = I[(k + 1) % 6], I[k]
        parts.append(
            f'<path d="M{a[0]} {a[1]} L{b[0]} {b[1]} L{c[0]} {c[1]} L{d[0]} {d[1]} Z" fill="{shades[k]}"/>'
        )
    inner = " ".join(f"{x} {y}" for x, y in I)
    outer = " ".join(f"{x} {y}" for x, y in O)
    return f"""<g transform="scale({s})">
  <circle r="120" fill="url(#gemGlow)"/>
  <polygon points="{outer}" fill="#0b1f66"/>
  {''.join(parts)}
  <polygon points="{inner}" fill="#4b97ff"/>
  <path d="M0 -36 L22 -13 L0 -4 L-22 -13 Z" fill="#9fd0ff" opacity="0.85"/>
  <path d="M0 -36 L-22 -13 L-48 -30 L0 -80 Z" fill="#cfe8ff" opacity="0.35"/>
  <g stroke="#cfe8ff" stroke-opacity="0.35" stroke-width="0.8" fill="none">
    {''.join(f'<path d="M{O[k][0]} {O[k][1]} L{I[k][0]} {I[k][1]}"/>' for k in range(6))}
  </g>
  <polygon points="{outer}" fill="none" stroke="url(#gold)" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="M-30 -52 L-12 -64" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <g fill="#ffffff" filter="url(#glow)">
    <path d="M-14 -46 l2 -7 l2 7 l7 2 l-7 2 l-2 7 l-2 -7 l-7 -2 Z"/>
  </g>
</g>"""


def emblem(x, y, s=1.0, disc=True):
    disc_svg = ""
    if disc:
        disc_svg = f"""<circle r="112" fill="url(#discFill)" opacity="0.92"/>"""
    return f"""<g transform="translate({f(x)} {f(y)}) scale({s})">
  <circle r="150" fill="url(#gemGlow)" opacity="0.6"/>
  {sword(-42)}{sword(42)}
  {disc_svg}
  <circle r="112" fill="none" stroke="url(#gold)" stroke-width="5"/>
  <circle r="100" fill="none" stroke="{GOLD}" stroke-width="1.2" opacity="0.7"/>
  <circle r="80" fill="none" stroke="{ICE2}" stroke-width="1" opacity="0.35"/>
  {rune_ring(90, 20, 0.9, ICE2, 1.4, 0.75)}
  <g fill="url(#gold)">
    <path d="M0 -124 l8 12 l-8 12 l-8 -12 Z"/><path d="M0 124 l8 -12 l-8 -12 l-8 12 Z"/>
    <path d="M-124 0 l12 8 l12 -8 l-12 -8 Z"/><path d="M124 0 l-12 8 l-12 -8 l12 -8 Z"/>
  </g>
  {gem(0.92)}
</g>"""


# ---------- typography ----------
def wordmark(x, y, size, spacing, anchor="middle", gid="wm", shadow=True):
    """LAPIZ in ice, WCG in gold. Gradients in user space around the baseline."""
    top, bot = y - size * 0.72, y
    g = f"""<linearGradient id="{gid}Ice" gradientUnits="userSpaceOnUse" x1="0" y1="{f(top)}" x2="0" y2="{f(bot)}">
  <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="{ICE}"/><stop offset="1" stop-color="#8fc4ff"/></linearGradient>
<linearGradient id="{gid}Gold" gradientUnits="userSpaceOnUse" x1="0" y1="{f(top)}" x2="0" y2="{f(bot)}">
  <stop offset="0" stop-color="{GOLD_L}"/><stop offset="0.55" stop-color="{GOLD}"/><stop offset="1" stop-color="#c58a32"/></linearGradient>"""
    flt = ' filter="url(#shadow)"' if shadow else ""
    t = f"""<text x="{f(x)}" y="{f(y)}" font-family="{SERIF}" font-weight="bold" font-size="{size}" letter-spacing="{spacing}" text-anchor="{anchor}"{flt}
  stroke="#050b22" stroke-width="{f(size/40)}" paint-order="stroke"><tspan fill="url(#{gid}Ice)">LAPIZ</tspan><tspan fill="url(#{gid}Gold)">WCG</tspan></text>"""
    return g, t


def label(x, y, txt, size, spacing, color=ICE2, anchor="middle", opacity=1.0, weight="normal", family=SANS):
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
            f'letter-spacing="{spacing}" text-anchor="{anchor}" fill="{color}" opacity="{opacity}">{txt}</text>')


def ornament_rule(cx, y, half, gap=22, color=GOLD):
    return f"""<g>
  <rect x="{f(cx-gap-half)}" y="{f(y-0.75)}" width="{half}" height="1.5" fill="url(#goldH)"/>
  <rect x="{f(cx+gap)}" y="{f(y-0.75)}" width="{half}" height="1.5" fill="url(#goldH)"/>
  <path d="M{f(cx)} {f(y-9)} l9 9 l-9 9 l-9 -9 Z" fill="none" stroke="{color}" stroke-width="1.6"/>
  <path d="M{f(cx)} {f(y-4)} l4 4 l-4 4 l-4 -4 Z" fill="{color}"/>
  <circle cx="{f(cx-gap+4)}" cy="{f(y)}" r="2" fill="{color}"/><circle cx="{f(cx+gap-4)}" cy="{f(y)}" r="2" fill="{color}"/>
</g>"""


# ---------- landscape ----------
def ridge(W, y0, amp, seed, iters=7, rough=0.55):
    rnd = random.Random(seed)
    n = 2 ** iters
    h = [0.0] * (n + 1)
    h[0] = y0 + rnd.uniform(-amp, amp) * 0.5
    h[n] = y0 + rnd.uniform(-amp, amp) * 0.5
    step, scale = n, amp
    while step > 1:
        half = step // 2
        for i in range(half, n, step):
            h[i] = (h[i - half] + h[i + half]) / 2 + rnd.uniform(-1, 1) * scale
        step, scale = half, scale * rough
    pad = 40
    return [(-pad + (W + 2 * pad) * i / n, h[i]) for i in range(n + 1)]


def ridge_y(pts, x):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def poly_path(pts, H):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return d + f" L{f(pts[-1][0])} {H+10} L{f(pts[0][0])} {H+10} Z"


def line_path(pts):
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)


def pine(x, y, h, rnd):
    w = h * 0.36
    tiers = 4
    left, right = [], []
    for t in range(tiers):
        ty = y - h + h * (t + 1) / tiers
        tw = w * (0.35 + 0.65 * (t + 1) / tiers) * rnd.uniform(0.9, 1.1)
        iw = tw * 0.45
        left += [(x - iw, ty - h * 0.08), (x - tw, ty)]
        right += [(x + iw, ty - h * 0.08), (x + tw, ty)]
    pts = [(x, y - h)] + right + [(x + 3, y + 4), (x - 3, y + 4)] + left[::-1]
    return "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts) + " Z"


def forest(pts, x0, x1, hmin, hmax, seed, density=1.0):
    rnd = random.Random(seed)
    d = []
    x = x0
    while x < x1:
        h = rnd.uniform(hmin, hmax)
        d.append(pine(x, ridge_y(pts, x) + 6, h, rnd))
        x += h * rnd.uniform(0.22, 0.42) / density
    return " ".join(d)


def castle(x, y, s, warm=True, body="#050c22", glow=True):
    """Silhouette of a hill-top keep, origin at the base center."""
    win = GOLD if warm else ICE2
    return f"""<g transform="translate({f(x)} {f(y)}) scale({s})">
  <g fill="{body}">
    <path d="M-190 0 Q-120 -40 -60 -48 L60 -48 Q130 -40 200 0 L200 60 L-190 60 Z"/>
    <rect x="-100" y="-150" width="190" height="104"/>
    <path d="M-100 -150 h14 v-12 h14 v12 h14 v-12 h14 v12 h14 v-12 h14 v12 h14 v-12 h14 v12 h14 v-12 h14 v12 h14 v-12 h14 v12 h14 v-12 h10 v12 Z"/>
    <rect x="-28" y="-250" width="56" height="110"/>
    <path d="M-36 -250 L0 -330 L36 -250 Z"/>
    <rect x="-130" y="-200" width="40" height="154"/>
    <path d="M-138 -200 L-110 -262 L-82 -200 Z"/>
    <rect x="80" y="-185" width="44" height="139"/>
    <path d="M72 -185 L102 -250 L132 -185 Z"/>
    <path d="M0 -330 V-368" stroke="{body}" stroke-width="3"/>
    <path d="M-110 -262 V-288" stroke="{body}" stroke-width="2.5"/>
  </g>
  <path d="M1 -366 L34 -357 L1 -348 Z" fill="{BLUE}"/>
  <path d="M-109 -287 L-88 -281 L-109 -275 Z" fill="{GOLD}"/>
  <g fill="{win}"{' filter="url(#glow)"' if glow else ' opacity="0.7"'}>
    <rect x="-8" y="-225" width="16" height="26" rx="8"/>
    <rect x="-117" y="-170" width="12" height="20" rx="6" opacity="0.9"/>
    <rect x="96" y="-160" width="12" height="20" rx="6" opacity="0.85"/>
    <rect x="-60" y="-112" width="10" height="16" rx="5" opacity="0.7"/>
    <rect x="30" y="-112" width="10" height="16" rx="5" opacity="0.8"/>
  </g>
</g>"""


def stars(W, H, n, seed, ymax):
    rnd = random.Random(seed)
    out = ['<g fill="#d8ecff">']
    for _ in range(n):
        x = rnd.uniform(0, W)
        y = ymax * (rnd.random() ** 1.6)
        r = rnd.choice([0.6, 0.8, 0.9, 1.0, 1.2, 1.5, 1.9])
        o = rnd.uniform(0.25, 0.95)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" opacity="{f(o)}"/>')
    out.append("</g>")
    return "".join(out)


def sparkles(points, size=1.0):
    out = ['<g fill="#eef7ff" filter="url(#glow)">']
    for x, y, s in points:
        k = s * size
        out.append(
            f'<path transform="translate({f(x)} {f(y)}) scale({f(k)})" d="M0 -12 L2 -2 L12 0 L2 2 L0 12 L-2 2 L-12 0 L-2 -2 Z"/>'
        )
    out.append("</g>")
    return "".join(out)


def particles(cx, cy, spread_x, spread_y, n, seed, scale=1.0):
    rnd = random.Random(seed)
    out = ['<g filter="url(#glow)">']
    for _ in range(n):
        x = cx + rnd.gauss(0, spread_x)
        y = cy - abs(rnd.gauss(0, spread_y))
        r = rnd.uniform(1.0, 3.0) * scale
        c = rnd.choice([ICE2, ICE2, "#8fd4ff", GOLD_L])
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c}" opacity="{f(rnd.uniform(0.35, 0.95))}"/>')
    out.append("</g>")
    return "".join(out)




# ---------- times of day ----------
NIGHT = dict(
    sky=[(0, "#02050f"), (0.35, "#071236"), (0.62, "#132a6e"), (0.8, "#22307a"), (1, "#0b1640")],
    halo=[("#cfe8ff", 0.55), ("#7fb8ff", 0.3), ("#3d6bff", 0.08)], face=["#ffffff", "#e3f1ff", "#a9cdf5"], craters=True,
    rim=["#cfe8ff", "#7fb0ff"], m1=("#2d5bb8", "#13306f"), m2=("#173a86", "#0a1b48"), m3=("#0c1d4c", "#050d26"),
    m4=("#040a1e", "#01040d"), fog=("#6fa0ff", 0.22), stars=True,
    nebula=[("#2b3f9e", 0.5), ("#4a2f8e", 0.45), ("#3a5ad0", 0.5)], tree="#01040d", castle="#050c22",
    win=GOLD, win_glow=True, vig=("#00020a", 0.8), clouds=None, birds=False, sun_r=7)
DAY = dict(
    sky=[(0, "#2a78d4"), (0.4, "#559ee9"), (0.72, "#9fd0f6"), (1, "#e6f5ff")],
    halo=[("#fffdf2", 0.95), ("#fff4cc", 0.45), ("#ffffff", 0.1)], face=["#ffffff", "#ffffff", "#fff4cf"], craters=False,
    rim=["#ffffff", "#eaf5ff"], m1=("#a8c4e8", "#86a8d6"), m2=("#7199cf", "#5179b4"), m3=("#3f6aa3", "#2b4f84"),
    m4=("#1f3d68", "#13284a"), fog=("#ffffff", 0.4), stars=False, nebula=None, tree="#112743", castle="#26476f",
    win="#9cc8f0", win_glow=False, vig=("#0a1f45", 0.35), clouds="#ffffff", birds=True, sun_r=6)
DUSK = dict(
    sky=[(0, "#232c66"), (0.32, "#544f92"), (0.58, "#aa78a4"), (0.8, "#eda281"), (1, "#ffd59c")],
    halo=[("#fff4d8", 0.95), ("#ffc78a", 0.45), ("#ff8f6a", 0.12)], face=["#fffbf2", "#ffeac0", "#ffc47a"], craters=False,
    rim=["#ffe4b4", "#f3a3a0"], m1=("#8c78ae", "#6d5d96"), m2=("#5b5591", "#443f79"), m3=("#363766", "#25274f"),
    m4=("#191a3b", "#0e1028"), fog=("#ffcfae", 0.26), stars=False, nebula=None, tree="#0d0f26", castle="#1c1c40",
    win=GOLD, win_glow=True, vig=("#0b0820", 0.6), clouds="#ffd2bf", birds=True, sun_r=6)


def sky_defs(W, H, mx, my, mr, T):
    sky = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in T["sky"])
    (h0, o0), (h1, o1), (h2, o2) = T["halo"]
    fc = T["face"]

    def lg(name, pair):
        return (f'<linearGradient id="{name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{pair[0]}"/>'
                f'<stop offset="1" stop-color="{pair[1]}"/></linearGradient>')
    fogc, fogo = T["fog"]
    vc, vo = T["vig"]
    return f"""
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">{sky}</linearGradient>
<radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="{mx}" cy="{my}" r="{mr*T['sun_r']}">
  <stop offset="0" stop-color="{h0}" stop-opacity="{o0}"/><stop offset="0.14" stop-color="{h1}" stop-opacity="{o1}"/>
  <stop offset="0.5" stop-color="{h2}" stop-opacity="{o2}"/><stop offset="1" stop-color="{h2}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="moonFace" cx="0.38" cy="0.35" r="0.75">
  <stop offset="0" stop-color="{fc[0]}"/><stop offset="0.6" stop-color="{fc[1]}"/><stop offset="1" stop-color="{fc[2]}"/>
</radialGradient>
<radialGradient id="rim" gradientUnits="userSpaceOnUse" cx="{mx}" cy="{my}" r="{W*0.75}">
  <stop offset="0" stop-color="{T['rim'][0]}" stop-opacity="0.9"/><stop offset="0.5" stop-color="{T['rim'][1]}" stop-opacity="0.35"/><stop offset="1" stop-color="{T['rim'][1]}" stop-opacity="0.05"/>
</radialGradient>
{lg("m1", T["m1"])}{lg("m2", T["m2"])}{lg("m3", T["m3"])}{lg("m4", T["m4"])}
<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{fogc}" stop-opacity="0"/><stop offset="0.5" stop-color="{fogc}" stop-opacity="{fogo}"/><stop offset="1" stop-color="{fogc}" stop-opacity="0"/>
</linearGradient>
<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.72">
  <stop offset="0.6" stop-color="{vc}" stop-opacity="0"/><stop offset="1" stop-color="{vc}" stop-opacity="{vo}"/>
</radialGradient>
<linearGradient id="cloudShade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#5a6ea8" stop-opacity="0.35"/>
</linearGradient>
"""


def clouds(specs, color, seed=1):
    rnd = random.Random(seed)
    out = []
    for cx, cy, w, op in specs:
        parts = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(w*0.5)}" ry="{f(w*0.09)}"/>']
        n = 5
        for i in range(n):
            bx = cx - w * 0.36 + w * 0.72 * i / (n - 1) + rnd.uniform(-w * 0.04, w * 0.04)
            r = w * rnd.uniform(0.09, 0.17) * (1.25 - abs(i - 2) * 0.22)
            parts.append(f'<circle cx="{f(bx)}" cy="{f(cy - r*0.55)}" r="{f(r)}"/>')
        shape = "".join(parts)
        out.append(f'<g opacity="{op}"><g fill="{color}" filter="url(#blur2)">{shape}</g>'
                   f'<g fill="url(#cloudShade)" filter="url(#blur6)" opacity="0.8">{shape}</g></g>')
    return "".join(out)


def birds(specs, color):
    out = [f'<g fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">']
    for x, y, s in specs:
        out.append(f'<path transform="translate({f(x)} {f(y)}) scale({s})" d="M-10 -2 Q-5 -7 0 0 Q5 -7 10 -2"/>')
    out.append("</g>")
    return "".join(out)


def scenery(W, H, mx, my, mr, horizon, T, seed=11, castle_at=None, forest_spans=None, portal=None,
            density=1.0, cloud_specs=None, bird_specs=None):
    s = H / 1080
    far = ridge(W, horizon - 110 * s, 190 * s, seed, rough=0.62)
    mid = ridge(W, horizon + 40 * s, 130 * s, seed + 1, rough=0.6)
    near = ridge(W, horizon + 175 * s, 70 * s, seed + 2, rough=0.55)
    front = ridge(W, horizon + 300 * s, 28 * s, seed + 3, rough=0.5)
    out = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
    if T["nebula"]:
        (c0, o0), (c1, o1), (c2, o2) = T["nebula"]
        out.append(f'<g filter="url(#blur50)" opacity="0.55">'
                   f'<ellipse cx="{f(W*0.22)}" cy="{f(H*0.22)}" rx="{f(W*0.2)}" ry="{f(H*0.08)}" fill="{c0}" opacity="{o0}"/>'
                   f'<ellipse cx="{f(W*0.62)}" cy="{f(H*0.12)}" rx="{f(W*0.18)}" ry="{f(H*0.06)}" fill="{c1}" opacity="{o1}"/>'
                   f'<ellipse cx="{f(W*0.5)}" cy="{f(horizon-60*s)}" rx="{f(W*0.55)}" ry="{f(H*0.1)}" fill="{c2}" opacity="{o2}"/></g>')
    if T["stars"]:
        out.append(stars(W, H, int(220 * density * W / 1920), seed + 7, horizon - 40 * s))
    out.append(f'<rect width="{W}" height="{H}" fill="url(#halo)"/>')
    out.append(f'<circle cx="{mx}" cy="{my}" r="{mr}" fill="url(#moonFace)"/>')
    if T["craters"]:
        out.append(f'<g fill="#9cc1ea" opacity="0.35"><circle cx="{f(mx-mr*0.3)}" cy="{f(my-mr*0.2)}" r="{f(mr*0.18)}"/>'
                   f'<circle cx="{f(mx+mr*0.32)}" cy="{f(my+mr*0.3)}" r="{f(mr*0.13)}"/><circle cx="{f(mx+mr*0.15)}" cy="{f(my-mr*0.38)}" r="{f(mr*0.08)}"/>'
                   f'<circle cx="{f(mx-mr*0.25)}" cy="{f(my+mr*0.4)}" r="{f(mr*0.07)}"/></g>')
    if T["clouds"] and cloud_specs:
        out.append(clouds(cloud_specs, T["clouds"], seed))
    if T["birds"] and bird_specs:
        out.append(birds(bird_specs, T["m4"][0]))
    out.append(f'<path d="{poly_path(far, H)}" fill="url(#m1)" opacity="0.92"/>')
    out.append(f'<path d="{line_path(far)}" fill="none" stroke="url(#rim)" stroke-width="{f(1.6*s+0.4)}" opacity="0.7"/>')
    out.append(f'<rect x="0" y="{f(horizon-60*s)}" width="{W}" height="{f(200*s)}" fill="url(#fog)" filter="url(#blur20)"/>')
    out.append(f'<path d="{poly_path(mid, H)}" fill="url(#m2)"/>')
    out.append(f'<path d="{line_path(mid)}" fill="none" stroke="url(#rim)" stroke-width="{f(1.3*s+0.4)}" opacity="0.45"/>')
    out.append(f'<rect x="0" y="{f(horizon+80*s)}" width="{W}" height="{f(160*s)}" fill="url(#fog)" filter="url(#blur20)" opacity="0.8"/>')
    if castle_at:
        cx, cs = castle_at
        c = castle(cx, ridge_y(near, cx) + 8 * s, cs * s, body=T["castle"], glow=T["win_glow"])
        out.append(c.replace(f'<g fill="{GOLD}"', f'<g fill="{T["win"]}"'))
    out.append(f'<path d="{poly_path(near, H)}" fill="url(#m3)"/>')
    out.append(f'<path d="{line_path(near)}" fill="none" stroke="url(#rim)" stroke-width="{f(1.0*s+0.3)}" opacity="0.3"/>')
    out.append(f'<path d="{poly_path(front, H)}" fill="url(#m4)"/>')
    if portal:
        px, py, prx = portal
        out.append(portal_svg(px, py, prx))
    for i, (a, b) in enumerate(forest_spans or []):
        out.append(f'<path d="{forest(front, a * W, b * W, 60 * s, 150 * s, seed + 20 + i)}" fill="{T["tree"]}"/>')
    return "".join(out), front


def portal_svg(cx, cy, rx):
    ry = rx * 0.17
    return f"""<g>
  <ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx*1.15)}" ry="{f(ry*2.2)}" fill="{BLUE}" opacity="0.28" filter="url(#blur20)"/>
  <g transform="translate({f(cx)} {f(cy)}) scale(1 0.17)" filter="url(#glow)" fill="none">
    <circle r="{f(rx)}" stroke="#8fd0ff" stroke-width="5" opacity="0.85"/>
    <circle r="{f(rx*0.86)}" stroke="#8fd0ff" stroke-width="2" stroke-dasharray="10 14" opacity="0.6"/>
    <circle r="{f(rx*0.62)}" stroke="{GOLD}" stroke-width="3" opacity="0.6"/>
    {rune_ring(rx*0.74, 28, rx/90, "#bfe4ff", 1.6, 0.7, seed=9)}
  </g>
</g>"""


def frame(W, H, inset=28):
    i, j = inset, inset + 12
    L = 110
    return f"""<g fill="none" filter="url(#glow)">
  <rect x="{i}" y="{i}" width="{W-2*i}" height="{H-2*i}" rx="6" stroke="{ICE2}" stroke-width="1.5" opacity="0.45"/>
  <rect x="{j}" y="{j}" width="{W-2*j}" height="{H-2*j}" rx="4" stroke="{GOLD}" stroke-width="1" opacity="0.3"/>
  <g stroke="url(#gold)" stroke-width="2.5" opacity="0.9">
    <path d="M{i} {i+L} V{i} H{i+L}"/><path d="M{W-i} {i+L} V{i} H{W-i-L}"/>
    <path d="M{i} {H-i-L} V{H-i} H{i+L}"/><path d="M{W-i} {H-i-L} V{H-i} H{W-i-L}"/>
  </g>
</g>
<g fill="{GOLD_L}">
  <path d="M{i} {i-7} l7 7 l-7 7 l-7 -7 Z"/><path d="M{W-i} {i-7} l7 7 l-7 7 l-7 -7 Z"/>
  <path d="M{i} {H-i-7} l7 7 l-7 7 l-7 -7 Z"/><path d="M{W-i} {H-i-7} l7 7 l-7 7 l-7 -7 Z"/>
</g>"""


def svg(W, H, defs, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
            f"<defs>{defs}</defs>\n{body}\n</svg>\n")


def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(content)


def scrim(cx, cy, rx, ry, op=0.55, color="#02061a"):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{color}" opacity="{op}" filter="url(#blur50)"/>'


def title_grad(gid, top, bot, mid="#d6ecff", end="#6fa8ff"):
    return f"""<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="{top}" x2="0" y2="{bot}">
  <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="{mid}"/><stop offset="1" stop-color="{end}"/></linearGradient>"""


PLQ = """<linearGradient id="plq" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#132a6e"/><stop offset="0.55" stop-color="#0a1740"/><stop offset="1" stop-color="#050b22"/></linearGradient>
<linearGradient id="plqShine" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#6fb8ff" stop-opacity="0.25"/><stop offset="0.6" stop-color="#6fb8ff" stop-opacity="0"/></linearGradient>"""

# =====================================================================
# 1) Profile banner 1200x480 (night)
W, H = 1200, 480
mx, my, mr = 1010, 100, 30
gd, gt = wordmark(632, 258, 72, 6, gid="wm")
body, _ = scenery(W, H, mx, my, mr, 330, NIGHT, seed=41, castle_at=(1080, 0.42),
                  forest_spans=[(0.0, 0.22), (0.7, 1.0)], density=1.3)
body += scrim(600, 240, 460, 120, 0.6)
body += emblem(327, 228, 0.52)
body += gt
body += ornament_rule(632, 284, 190)
body += label(632, 320, "ALBION ONLINE  ·  СТРИМЫ  ·  PVP И ПРИКЛЮЧЕНИЯ", 19, 4, ICE2, opacity=0.9)
body += particles(600, 440, 260, 50, 26, 5, 0.7)
body += f'<rect width="{W}" height="{H}" fill="url(#vignette)" opacity="0.7"/>'
write("1_profile_banner_1200x480.svg", svg(W, H, defs_common() + sky_defs(W, H, mx, my, mr, NIGHT) + gd, body))

# =====================================================================
# 2) Offline player banner 1920x1080 (night)
W, H = 1920, 1080
mx, my, mr = 1560, 190, 64
gd, gt = wordmark(960, 492, 58, 12, gid="wm")
body, _ = scenery(W, H, mx, my, mr, 690, NIGHT, seed=7, castle_at=(300, 0.95),
                  forest_spans=[(0.0, 0.12), (0.78, 1.0)], portal=(960, 990, 330))
body += scrim(960, 520, 760, 330, 0.62)
body += sparkles([(420, 140, 1.2), (1780, 420, 0.8), (700, 90, 0.9), (1240, 120, 0.7)])
body += emblem(960, 300, 0.92)
body += gt
body += ornament_rule(960, 530, 300)
body += (f'<text x="960" y="700" font-family="{SERIF}" font-weight="bold" font-size="176" letter-spacing="28" '
         f'text-anchor="middle" fill="url(#offT)" stroke="#040a20" stroke-width="4" paint-order="stroke" filter="url(#shadow)">OFFLINE</text>')
body += label(960, 770, "СЕЙЧАС НЕ В ЭФИРЕ", 40, 14, GOLD, weight="bold")
body += label(960, 830, "ЗАГЛЯНИ ПОЗЖЕ  ·  ВКЛЮЧИ УВЕДОМЛЕНИЯ  ·  ALBION ONLINE", 24, 6, ICE2, opacity=0.85)
body += particles(960, 990, 260, 140, 60, 12)
body += f'<rect width="{W}" height="{H}" fill="url(#vignette)"/>'
body += frame(W, H)
write("2_offline_player_1920x1080.svg",
      svg(W, H, defs_common() + sky_defs(W, H, mx, my, mr, NIGHT) + gd + title_grad("offT", 560, 700), body))

# =====================================================================
# 3) BRB 1920x1080 (dusk, neutral)
W, H = 1920, 1080
mx, my, mr = 1660, 560, 74
gd, gt = wordmark(960, 960, 50, 12, gid="wm")
body, _ = scenery(W, H, mx, my, mr, 700, DUSK, seed=23, castle_at=(330, 0.85),
                  forest_spans=[(0.0, 0.14), (0.8, 1.0)],
                  cloud_specs=[(300, 170, 380, 0.75), (1560, 120, 460, 0.6), (900, 90, 300, 0.45), (1330, 470, 420, 0.45)],
                  bird_specs=[(1340, 300, 1.0), (1385, 280, 0.8), (1300, 325, 0.7), (1420, 312, 0.6)])
body += scrim(960, 560, 640, 220, 0.32, "#130d2e")
body += f"""<g transform="translate(960 330)">
  <circle r="300" fill="#ffd7a0" opacity="0.14" filter="url(#blur50)"/>
  <g filter="url(#glow)" fill="none">
    <circle r="228" stroke="#ffe7c2" stroke-width="1.5" opacity="0.45"/>
    <circle r="212" stroke="{GOLD}" stroke-width="1" stroke-dasharray="3 9" opacity="0.7"/>
    <circle r="176" stroke="#ffe7c2" stroke-width="1" opacity="0.3"/>
  </g>
  {rune_ring(194, 36, 1.3, "#ffe7c2", 1.6, 0.55, seed=17)}
</g>"""
body += emblem(960, 330, 1.0)
body += (f'<text x="960" y="680" font-family="{SERIF}" font-weight="bold" font-size="124" letter-spacing="10" '
         f'text-anchor="middle" fill="url(#brbT)" stroke="#140e30" stroke-width="4" paint-order="stroke" filter="url(#shadow)">СКОРО ВЕРНУСЬ</text>')
body += ornament_rule(960, 730, 330)
body += label(960, 790, "BE RIGHT BACK  ·  НЕ ПЕРЕКЛЮЧАЙСЯ", 36, 12, GOLD_L, weight="bold")
body += f'<rect width="{W}" height="{H}" fill="url(#vignette)"/>'
body += gt
body += frame(W, H)
write("3_brb_1920x1080.svg", svg(W, H, defs_common() + sky_defs(W, H, mx, my, mr, DUSK) + gd
                                 + title_grad("brbT", 560, 680, "#fff1dc", "#ffc98a"), body))

# =====================================================================
# 5) Live stream background 1920x1080 (clear day)
W, H = 1920, 1080
mx, my, mr = 1540, 170, 62
gd, gt = wordmark(960, 520, 96, 10, gid="wm")
body, _ = scenery(W, H, mx, my, mr, 720, DAY, seed=5, castle_at=(1600, 0.9),
                  forest_spans=[(0.0, 0.2), (0.86, 1.0)],
                  cloud_specs=[(330, 190, 440, 0.95), (1180, 110, 360, 0.8), (720, 330, 300, 0.6), (1700, 380, 380, 0.75)],
                  bird_specs=[(560, 260, 1.0), (600, 240, 0.8), (520, 285, 0.75), (640, 270, 0.6)])
body += scrim(960, 500, 520, 170, 0.28, "#0a1f4a")
body += emblem(960, 300, 0.85)
body += gt
body += ornament_rule(960, 562, 300)
body += f"""<g transform="translate(960 620)">
  <rect x="-128" y="-26" width="256" height="52" rx="26" fill="#0a1740" opacity="0.85"/>
  <rect x="-128" y="-26" width="256" height="52" rx="26" fill="none" stroke="url(#gold)" stroke-width="1.6"/>
  <circle cx="-92" cy="0" r="9" fill="#ff4d5e" filter="url(#glow)"/>
  {label(14, 11, "В ЭФИРЕ", 28, 8, ICE, weight="bold")}
</g>"""
body += label(960, 700, "ALBION ONLINE", 26, 14, "#ffffff", opacity=0.95)
body += f'<rect width="{W}" height="{H}" fill="url(#vignette)"/>'
body += frame(W, H)
write("5_stream_background_1920x1080.svg", svg(W, H, defs_common() + sky_defs(W, H, mx, my, mr, DAY) + gd, body))


# =====================================================================
# 4) Brand cover for the minimap + location bar (1080p: x 1510..1910, y 732..1072)
def cover(ox, oy, gid):
    w, h = 400, 370
    p = f"M{ox+22} {oy} H{ox+w-22} L{ox+w} {oy+22} V{oy+h-22} L{ox+w-22} {oy+h} H{ox+22} L{ox} {oy+h-22} V{oy+22} Z"
    pi = f"M{ox+26} {oy+9} H{ox+w-26} L{ox+w-9} {oy+26} V{oy+h-26} L{ox+w-26} {oy+h-9} H{ox+26} L{ox+9} {oy+h-26} V{oy+26} Z"
    cx = ox + w / 2
    g, t = wordmark(cx, oy + 292, 50, 4, gid=gid)
    hexes = "".join(
        f'<path transform="translate({f(ox + 40 + 52 * i + (26 if j % 2 else 0))} {f(oy + 40 + 45 * j)})" d="M0 -26 L22.5 -13 V13 L0 26 L-22.5 13 V-13 Z"/>'
        for j in range(8) for i in range(8))
    body = f"""<clipPath id="{gid}Clip"><path d="{p}"/></clipPath>
<path d="{p}" fill="url(#plq)" filter="url(#shadow)"/>
<g clip-path="url(#{gid}Clip)">
  <g fill="none" stroke="#5fa8ff" stroke-width="1" opacity="0.12">{hexes}</g>
  <ellipse cx="{f(cx)}" cy="{oy+130}" rx="190" ry="130" fill="{BLUE}" opacity="0.22" filter="url(#blur20)"/>
</g>
<path d="{p}" fill="none" stroke="url(#gold)" stroke-width="4" stroke-linejoin="round"/>
<path d="{pi}" fill="none" stroke="{ICE2}" stroke-width="1" opacity="0.4"/>
{emblem(cx, oy + 132, 0.56)}
{t}
{ornament_rule(cx, oy + 316, 120, gap=16)}
{label(cx, oy + 348, "ALBION ONLINE", 15, 7, ICE2, opacity=0.9)}"""
    return g, body


g, b = cover(0, 0, "cv")
write("4_minimap_cover_400x370.svg", svg(400, 370, defs_common() + PLQ + g, b))
g, b = cover(1510, 702, "cv")
write("4_minimap_cover_overlay_1920x1080.svg", svg(1920, 1080, defs_common() + PLQ + g, b))

# 6) Logo plaque + watermark (extras)
W, H = 1200, 400
gd, gt = wordmark(368, 228, 112, 6, anchor="start", gid="wm")
plaque = "M150 80 L1120 80 L1160 120 L1160 280 L1120 320 L150 320 Z"
body = f"""<g filter="url(#shadow)">
  <path d="{plaque}" fill="url(#plq)"/>
  <path d="{plaque}" fill="url(#plqShine)"/>
  <path d="{plaque}" fill="none" stroke="url(#gold)" stroke-width="5" stroke-linejoin="round"/>
  <path d="M160 92 L1115 92 L1148 125 L1148 275 L1115 308 L160 308" fill="none" stroke="{ICE2}" stroke-width="1.2" opacity="0.4"/>
  <path d="M1160 200 l-12 -10 v20 Z" fill="{GOLD}"/>
</g>"""
body += emblem(200, 200, 1.0) + gt + ornament_rule(700, 258, 230) + label(700, 296, "ALBION ONLINE", 24, 14, ICE2, opacity=0.9)
write("6_logo_plaque_1200x400.svg", svg(W, H, defs_common() + gd + PLQ, body))
W, H = 1200, 340
gd, gt = wordmark(368, 210, 112, 6, anchor="start", gid="wm")
body = emblem(190, 170, 0.95) + gt + ornament_rule(700, 240, 230) + label(700, 280, "ALBION ONLINE", 24, 14, ICE2, opacity=0.95)
write("6_logo_watermark_1200x340.svg", svg(W, H, defs_common() + gd, body))
print("ok")
