"""Pack the LPC tiles and props we use into compact atlases.

    python3 -I scripts/build_assets.py <vendor_dir> [--preview out.png]

<vendor_dir> holds the unzipped OpenGameArt packs (listed in ASSETS.md). Writes
public/assets/{tiles,props}.png and src/game/assets/{tiles,props}.json.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
T = 32

SHEETS = {
    "walls": "lpc-walls/lpc-walls/walls.png",
    "floors": "lpc-floors/lpc-floors/floors.png",
    "furniture": "furniture/dark-wood_4.png",
    "interior": "LPC_house_interior_0/LPC_house_interior/interior.png",
    "ruins": "LPC_cavern_ruins/LPC_cavern_ruins/cavern_ruins.png",
    "graves": "lpc_grave_markers_rework-1.3/PNG/32x32/grave_markers-shadow.png",
}

# wall face style → wangcolor in the "Walls" set; ceiling trim → "Ceilings" set
WALLS = {
    "stone": 27,
    "dark_stone": 49,
    "cobble": 51,
    "brick": 37,
    "plaster": 33,
    "wallpaper_green": 85,
    "wallpaper_red": 99,
    "wallpaper_blue": 119,
    "wallpaper_purple": 71,
    "wood_panel": 25,
    "institutional": 82,
    "tile": 66,
}
CEILINGS = {"wood": 1, "dark_wood": 3, "stone": 28, "grey_brick": 16, "plaster": 17}

# floor style → top-left of a seamless 2x2 block in floors.png
FLOORS = {
    "wood": (4, 37),
    "parquet": (2, 37),
    "worn_wood": (0, 35),
    "plank": (6, 39),
    "dark_wood": (0, 41),
    "dark_parquet": (2, 41),
    "rotten_wood": (8, 43),
    "green_parquet": (0, 47),
    "tile": (2, 52),
    "flagstone": (12, 53),
    "stone": (16, 57),
    "pale_stone": (12, 51),
    "dark_stone": (12, 61),
    "dirt": (0, 62),
}

# stains along the bottom of floors.png, tinted per decal kind at runtime
DECALS = [(12, 62), (14, 62), (16, 62), (17, 62), (18, 62), (20, 62)]

# name: (sheet, tile region x, y, w, h, footprint w, h, blocking)
# The region is generous; sprites are trimmed to their opaque pixels.
PROPS = {
    "grand_piano": ("furniture", 0, 26, 2, 3, 2, 2, True),
    "upright_piano": ("furniture", 2, 26, 3, 3, 2, 1, True),
    "pipe_organ": ("furniture", 5, 26, 3, 3, 3, 1, True),
    "grandfather_clock": ("furniture", 8, 23, 1, 3, 1, 1, True),
    "fireplace": ("furniture", 12, 23, 3, 3, 3, 1, True),
    "wardrobe": ("furniture", 0, 19, 2, 3, 2, 1, True),
    "bookshelf": ("interior", 1, 6, 1, 2, 1, 1, True),
    "dresser": ("furniture", 2, 9, 2, 2, 2, 1, True),
    "cabinet": ("furniture", 7, 2, 1, 2, 1, 1, True),
    "dining_table": ("furniture", 4, 5, 3, 3, 3, 2, True),
    "round_table": ("furniture", 7, 7, 2, 2, 2, 2, True),
    "small_table": ("furniture", 13, 7, 1, 2, 1, 1, True),
    "bench": ("furniture", 10, 7, 3, 1, 3, 1, True),
    "long_table": ("furniture", 10, 8, 3, 1, 3, 1, True),
    "stool": ("furniture", 14, 7, 1, 1, 1, 1, True),
    "chair": ("furniture", 15, 19, 1, 1, 1, 1, True),
    "armchair": ("furniture", 12, 17, 1, 1, 1, 1, True),
    "writing_desk": ("furniture", 2, 23, 2, 1, 2, 1, True),
    "school_desk": ("furniture", 4, 9, 2, 2, 2, 1, True),
    "canopy_bed": ("furniture", 6, 19, 1, 3, 1, 2, True),
    "bunk_bed": ("furniture", 9, 19, 3, 3, 3, 2, True),
    "sofa": ("furniture", 0, 13, 2, 2, 2, 1, True),
    "vanity": ("furniture", 3, 19, 1, 2, 1, 1, True),
    "chess_table": ("furniture", 2, 19, 1, 1, 1, 1, True),
    "pew": ("furniture", 0, 25, 3, 1, 3, 1, True),
    "gothic_chair": ("furniture", 10, 30, 1, 2, 1, 1, True),
    "folding_screen": ("furniture", 11, 26, 1, 3, 1, 1, True),
    "nightstand": ("furniture", 6, 24, 1, 1, 1, 1, True),
    "mantel_clock": ("furniture", 4, 21, 1, 1, 1, 1, False),
    "counter": ("furniture", 0, 0, 3, 1, 3, 1, True),
    "bed": ("interior", 14, 0, 1, 3, 1, 2, True),
    "barrels": ("interior", 1, 8, 2, 2, 2, 1, True),
    "crate": ("interior", 3, 8, 1, 2, 1, 1, True),
    "stove": ("interior", 11, 8, 1, 1, 1, 1, True),
    "sink": ("interior", 2, 3, 1, 1, 1, 1, True),
    "skull": ("interior", 9, 1, 1, 1, 1, 1, False),
    "papers": ("interior", 9, 2, 1, 1, 1, 1, False),
    "jars": ("interior", 7, 4, 2, 1, 2, 1, True),
    "alchemy_table": ("interior", 0, 11, 2, 2, 2, 1, True),
    "lantern": ("interior", 11, 0, 1, 1, 1, 1, False),
    "coffin": ("ruins", 22, 2, 1, 2, 1, 2, True),
    "skeleton": ("ruins", 23, 2, 1, 1, 1, 1, False),
    "armor": ("ruins", 22, 4, 1, 2, 1, 1, True),
    "ritual_circle": ("ruins", 6, 12, 3, 2, 3, 2, False),
    "statue": ("ruins", 17, 7, 1, 2, 1, 1, True),
    "crystals": ("ruins", 9, 10, 1, 2, 1, 1, True),
    "boulder": ("ruins", 12, 9, 1, 1, 1, 1, True),
    "broken_planks": ("ruins", 10, 9, 1, 1, 1, 1, False),
    "headstone": ("graves", 2, 0, 1, 1, 1, 1, True),
    "headstone_rip": ("graves", 3, 0, 1, 1, 1, 1, True),
    "headstone_cross": ("graves", 4, 0, 1, 2, 1, 1, True),
    "wooden_cross": ("graves", 5, 0, 1, 2, 1, 1, True),
    "celtic_cross": ("graves", 6, 0, 1, 2, 1, 1, True),
    "grave_plot": ("graves", 0, 0, 2, 3, 2, 2, True),
    "large_headstone": ("graves", 2, 2, 2, 2, 2, 1, True),
    "monolith": ("graves", 5, 4, 1, 2, 1, 1, True),
}

# full credits text from each pack, shipped verbatim (some packs require all of it)
PACKS = [
    ("[LPC] Walls", "https://opengameart.org/content/lpc-walls", "CC-BY-SA 3.0", "lpc-walls/lpc-walls/CREDITS-walls.txt"),
    ("[LPC] Floors", "https://opengameart.org/content/lpc-floors", "CC-BY-SA 4.0", "lpc-floors/lpc-floors/CREDITS-floors.txt"),
    ("[LPC] Wooden Furniture", "https://opengameart.org/content/lpc-wooden-furniture", "CC-BY-SA 4.0 / CC-BY-SA 3.0 / GPL 3.0", "furniture/credits-furniture.txt_/CREDITS-furniture.txt"),
    ("[LPC] House interior and decorations", "https://opengameart.org/content/lpc-house-interior-and-decorations", "CC-BY-SA 3.0 / GPL 3.0 / GPL 2.0", "LPC_house_interior_0/LPC_house_interior/credits.txt"),
    ("[LPC] Cavern and ruin tiles", "https://opengameart.org/content/lpc-cavern-and-ruin-tiles", "CC-BY-SA 3.0 / GPL", "LPC_cavern_ruins/LPC_cavern_ruins/credits.txt"),
    ("LPC Grave Markers (remix)", "https://opengameart.org/content/lpc-grave-markers-remix", "CC-BY-SA 3.0 / GPL 3.0", "lpc_grave_markers_rework-1.3/sources.md"),
]


def wall_decor():
    """Wall-mounted pieces the packs don't have, drawn in the LPC palette. Hung on wall faces."""
    from PIL import ImageDraw
    import random

    rnd = random.Random(7)
    outline, wood_d, wood, wood_l = (35, 20, 15, 255), (74, 45, 30, 255), (110, 66, 40, 255), (150, 95, 55, 255)
    gold_d, gold, gold_l = (110, 80, 30, 255), (170, 130, 50, 255), (215, 180, 90, 255)

    def framed(w, h, frame, inner_fill, border=3):
        im = Image.new("RGBA", (w, h))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, w - 1, h - 1], fill=frame[1], outline=outline)
        d.line([1, 1, w - 2, 1], fill=frame[2])
        d.line([1, 1, 1, h - 2], fill=frame[2])
        d.line([1, h - 2, w - 2, h - 2], fill=frame[0])
        d.line([w - 2, 1, w - 2, h - 2], fill=frame[0])
        d.rectangle([border, border, w - 1 - border, h - 1 - border], fill=inner_fill, outline=frame[0])
        return im, d

    out = {}
    im, d = framed(92, 44, (wood_d, wood, wood_l), (38, 62, 48, 255))
    for y in range(4, 39):  # board gets darker toward the bottom
        d.line([4, y, 87, y], fill=(38 - y // 6, 62 - y // 4, 48 - y // 5, 255))
    for _ in range(5):  # half-erased chalk
        x, y = rnd.randint(8, 60), rnd.randint(8, 30)
        d.line([x, y, x + rnd.randint(10, 24), y + rnd.randint(-2, 2)], fill=(190, 205, 195, 150))
    d.rectangle([2, 40, 89, 43], fill=wood_l, outline=outline)
    out["chalkboard"] = im

    im, d = framed(30, 26, (gold_d, gold, gold_l), (40, 45, 60, 255))
    d.rectangle([4, 15, 25, 21], fill=(55, 60, 45, 255))
    d.ellipse([18, 6, 23, 11], fill=(200, 200, 170, 255))
    out["painting"] = im

    im, d = framed(26, 34, (gold_d, gold, gold_l), (30, 26, 32, 255))
    d.ellipse([8, 8, 17, 19], fill=(150, 140, 130, 255))
    d.rectangle([7, 20, 18, 30], fill=(45, 40, 50, 255))
    d.point([(11, 13), (14, 13)], fill=(20, 15, 20, 255))  # eyes
    out["portrait"] = im

    im, d = framed(22, 38, ((110, 110, 120, 255), (160, 160, 170, 255), (210, 210, 220, 255)), (60, 70, 85, 255))
    d.line([6, 28, 15, 8], fill=(110, 125, 140, 255), width=2)
    out["mirror"] = im

    im, d = framed(30, 34, (wood_d, wood, wood_l), (22, 30, 62, 255), border=3)
    d.rectangle([4, 4, 25, 16], fill=(40, 52, 92, 255))
    d.line([15, 3, 15, 29], fill=wood)
    d.line([3, 17, 26, 17], fill=wood)
    d.ellipse([18, 6, 23, 11], fill=(220, 225, 200, 255))
    d.rectangle([0, 30, 29, 33], fill=wood_l, outline=outline)
    out["window"] = im
    return out


def wangsets(tsx: Path):
    """corner wang sets: {set name: {color: {"TL TR BR BL" bits: tile id}}}"""
    text = tsx.read_text()
    out = {}
    for block in re.split(r"<wangset ", text)[1:]:
        name = re.search(r'name="([^"]+)"', block).group(1)
        by = defaultdict(dict)
        for tid, wid in re.findall(r'<wangtile tileid="(\d+)" wangid="([\d,]+)"', block):
            w = list(map(int, wid.split(",")))
            corners = (w[7], w[1], w[3], w[5])
            colors = {c for c in corners if c}
            if len(colors) == 1:
                c = colors.pop()
                by[c].setdefault("".join("1" if x else "0" for x in corners), int(tid))
        out[name] = by
    return out


class Atlas:

    def __init__(self, width=1024):
        self.width = width
        self.items = []

    def add(self, img: Image.Image) -> int:
        self.items.append(img)
        return len(self.items) - 1

    def pack(self):
        x = y = shelf = 0
        rects = []
        for img in self.items:
            w, h = img.size
            if x + w > self.width:
                x, y, shelf = 0, y + shelf, 0
            rects.append((x, y, w, h))
            x += w
            shelf = max(shelf, h)
        height = y + shelf
        sheet = Image.new("RGBA", (self.width, height), (0, 0, 0, 0))
        for img, (x, y, _, _) in zip(self.items, rects):
            sheet.alpha_composite(img, (x, y))
        return sheet, rects


def main():
    vendor = Path(sys.argv[1])
    preview = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    sheets = {k: Image.open(vendor / v).convert("RGBA") for k, v in SHEETS.items()}

    def tile(sheet, tid=None, x=None, y=None):
        im = sheets[sheet]
        cols = im.width // T
        if tid is not None:
            x, y = tid % cols, tid // cols
        return im.crop((x * T, y * T, x * T + T, y * T + T))

    # --- tiles: every piece is exactly 32x32 so the atlas is a plain grid ---
    wang = wangsets(vendor / "lpc-walls/lpc-walls/walls.tsx")
    tiles = Atlas(width=T * 32)
    meta = {"walls": {}, "ceilings": {}, "floors": {}, "decals": []}
    for style, color in WALLS.items():
        m = wang["Walls"][color]
        meta["walls"][style] = {
            k: tiles.add(tile("walls", m[bits]))
            for k, bits in {"tl": "0010", "t": "0011", "tr": "0001", "bl": "0100", "b": "1100", "br": "1000"}.items()
        }
    for style, color in CEILINGS.items():
        meta["ceilings"][style] = {bits: tiles.add(tile("walls", tid)) for bits, tid in wang["Ceilings"][color].items()}
    for style, (x, y) in FLOORS.items():
        meta["floors"][style] = [tiles.add(tile("floors", x=x + i % 2, y=y + i // 2)) for i in range(4)]
    for x, y in DECALS:
        meta["decals"].append(tiles.add(tile("floors", x=x, y=y)))
    fill = tile("walls", wang["Ceilings"][CEILINGS["wood"]]["0001"]).getpixel((4, 4))
    meta["ceilingFill"] = "#%02x%02x%02x" % fill[:3]

    sheet, rects = tiles.pack()
    meta["frames"] = rects
    (ROOT / "public/assets").mkdir(parents=True, exist_ok=True)
    (ROOT / "src/game/assets").mkdir(parents=True, exist_ok=True)
    sheet.save(ROOT / "public/assets/tiles.png")
    (ROOT / "src/game/assets/tiles.json").write_text(json.dumps(meta))

    # --- props: trimmed to opaque pixels, anchored bottom-centre on their footprint ---
    props = Atlas(width=1024)
    pmeta = {}
    for name, (src, x, y, w, h, fw, fh, blocking) in PROPS.items():
        im = sheets[src].crop((x * T, y * T, (x + w) * T, (y + h) * T))
        bbox = im.getbbox()
        if not bbox:
            raise SystemExit(f"{name}: empty region")
        im = im.crop(bbox)
        pmeta[name] = {"i": props.add(im), "fw": fw, "fh": fh, "blocking": blocking, "mount": "floor", "source": src}
    for name, im in wall_decor().items():
        fw = max(1, round(im.width / T))
        pmeta[name] = {"i": props.add(im), "fw": fw, "fh": 1, "blocking": False, "mount": "wall", "source": "drawn"}
    psheet, prects = props.pack()
    for name, m in pmeta.items():
        m["frame"] = prects[m.pop("i")]
    psheet.save(ROOT / "public/assets/props.png")
    (ROOT / "src/game/assets/props.json").write_text(json.dumps(pmeta, indent=1))
    print(f"tiles {sheet.size}, props {psheet.size}, {len(pmeta)} props")

    packs = []
    for name, url, license, rel in PACKS:
        text = (vendor / rel).read_text(errors="replace").strip()
        if rel.endswith("sources.md"):
            readme = vendor / "lpc_grave_markers_rework-1.3/README.txt"
            text = readme.read_text(errors="replace").strip() + "\n\n" + text
        packs.append({"name": name, "url": url, "license": license, "text": text})
    (ROOT / "src/game/assets/credits.json").write_text(json.dumps(packs, indent=1))

    if preview:
        from PIL import ImageDraw

        cell = 112
        cols = 10
        rows = (len(pmeta) + cols - 1) // cols
        out = Image.new("RGBA", (cols * cell, rows * (cell + 14)), (70, 60, 52, 255))
        d = ImageDraw.Draw(out)
        for n, (name, m) in enumerate(pmeta.items()):
            fx, fy, fw_, fh_ = m["frame"]
            spr = psheet.crop((fx, fy, fx + fw_, fy + fh_))
            ox, oy = (n % cols) * cell, (n // cols) * (cell + 14)
            out.alpha_composite(spr, (ox + max(0, (cell - fw_) // 2), oy + 14 + max(0, cell - fh_)))
            d.text((ox + 2, oy + 1), name, fill=(255, 255, 0, 255))
        out.save(preview)

main()
