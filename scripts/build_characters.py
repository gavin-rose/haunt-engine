"""Copy the slice of the Universal LPC Spritesheet Character Generator we use.

    python3 -I scripts/build_characters.py <lpc_generator_clone>

The clone can be sparse; missing sheets are checked out with `git sparse-checkout add`.
Writes public/assets/lpc/** and src/game/assets/lpc.json (layers, palettes, credits).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BODIES = ["male", "female", "child", "teen"]
ANIMS = ["walk", "hurt"]
# for items that ship per-colour files instead of a recolourable palette
VARIANT_PICKS = ["black", "white", "gray", "brown", "red", "blue", "green", "tan", "navy", "maroon", "charcoal", "walnut", "purple", "forest", "leather"]
PALETTES = {"body": "body/body_ulpc.json", "cloth": "cloth/cloth_ulpc.json", "hair": "hair/hair_ulpc.json", "eye": "eye/eye_ulpc.json"}

ITEMS = """
body body_skeleton body_zombie
heads_human_male heads_human_female heads_human_child heads_human_male_elderly heads_human_female_elderly
heads_human_male_gaunt heads_human_male_plump heads_skeleton heads_zombie heads_vampire heads_jack
hair_plain hair_bob hair_long_tied hair_ponytail hair_bangs_bun hair_braid hair_pixie hair_messy1 hair_parted
hair_curly_long hair_curly_short hair_afro hair_balding hair_buzzcut hair_relm_xlong hair_unkempt hair_half_up hair_shoulderl
beards_beard beards_5oclock_shadow beards_winter
torso_clothes_longsleeve torso_clothes_shortsleeve torso_clothes_longsleeve2_cardigan torso_clothes_longsleeve2_buttoned
torso_clothes_blouse_longsleeve torso_clothes_blouse torso_clothes_tunic torso_clothes_robe torso_clothes_corset torso_clothes_child_shirt
dress_bodice dress_sash torso_jacket_frock torso_jacket_trench torso_jacket_collared torso_clothes_vest
torso_aprons_apron torso_aprons_apron_full torso_aprons_overalls cape_solid cape_tattered
legs_pants legs_formal legs_childpants legs_skirts_plain legs_skirt_belle legs_skirt_straight legs_shorts
feet_shoes_basic feet_boots_basic feet_slippers
hat_formal_bowler hat_formal_tophat hat_cap_leather hat_hood_cloth hat_hood_sack_cloth hat_headband_kerchief hat_bandana hat_magic_wizard hat_cap_bonnie
facial_glasses facial_glasses_round facial_glasses_halfmoon facial_monocle_right facial_eyepatch_left facial_mask_plain
neck_necktie neck_bowtie neck_scarf neck_amulet_cross neck_necklace_simple
tool_shovel tool_axe tool_hoe tool_hammer tool_rod tool_pickaxe tool_watering_can
wound_ribs wound_eye_left wound_mouth wound_brain wound_arm
""".split()


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def main():
    repo = Path(sys.argv[1])
    defs = {p.stem: p for p in (repo / "sheet_definitions").rglob("*.json")}
    tracked = set(git(repo, "ls-tree", "-r", "--name-only", "HEAD", "spritesheets").splitlines())
    metas = {m: json.loads((repo / "palette_definitions" / m / f"meta_{m}.json").read_text()) for m in PALETTES}

    items, wanted, credits = {}, set(), {}
    for stem in ITEMS:
        d = json.loads(defs[stem].read_text())
        layers = []
        for key in sorted(k for k in d if k.startswith("layer_")):
            layer = d[key]
            paths = {b: layer[b] for b in BODIES if b in layer}
            if paths:
                layers.append({"z": layer["zPos"], "paths": paths})

        recolor = []
        rc = d.get("recolors")
        if rc:
            entries = [rc] if "material" in rc else [v for k, v in sorted(rc.items()) if k.startswith("color_")]
            for e in entries:
                material = e["material"]
                if material not in PALETTES:
                    continue
                base = (e.get("base") or metas[material]["base"]).split(".")[-1]
                recolor.append({"material": material, "base": base})

        variants = None
        if not recolor:
            all_variants = d.get("variants") or []
            variants = [v for v in all_variants if v in VARIANT_PICKS] or all_variants[:1]

        files = []
        for layer in layers:
            for path in layer["paths"].values():
                for anim in ANIMS:
                    candidates = [f"{path}{anim}.png"] if not variants else [f"{path}{anim}/{v.replace(' ', '_')}.png" for v in variants]
                    for c in candidates:
                        if f"spritesheets/{c}" in tracked:
                            files.append(c)
        if not files:
            print(f"skip {stem}: no sheets")
            continue
        wanted.update(files)
        items[stem] = {
            "name": d["name"],
            "layers": layers,
            "recolor": recolor,
            "variants": [v.replace(" ", "_") for v in variants] if variants else None,
            "matchBody": bool(d.get("match_body_color")),
            "files": sorted(set(files)),
        }
        for c in d.get("credits", []):
            if any(f.startswith(c["file"]) for f in files):
                credits[c["file"]] = {k: c[k] for k in ("authors", "licenses", "urls") if k in c}

    missing = [f"/spritesheets/{f}" for f in sorted(wanted) if not (repo / "spritesheets" / f).exists()]
    for i in range(0, len(missing), 200):
        git(repo, "sparse-checkout", "add", *missing[i : i + 200])

    out = ROOT / "public/assets/lpc"
    if out.exists():
        shutil.rmtree(out)
    for f in sorted(wanted):
        dest = out / f
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / "spritesheets" / f, dest)

    palettes = {}
    for material, rel in PALETTES.items():
        colors = json.loads((repo / "palette_definitions" / rel).read_text())
        palettes[material] = {"base": metas[material]["base"], "colors": colors}

    for item in items.values():
        del item["files"]
    catalog = {
        "anims": {"walk": {"cols": 9, "rows": 4}, "hurt": {"cols": 6, "rows": 1}},
        "items": items,
        "palettes": palettes,
        "credits": credits,
    }
    (ROOT / "src/game/assets/lpc.json").write_text(json.dumps(catalog))
    size = sum(f.stat().st_size for f in out.rglob("*.png"))
    print(f"{len(items)} items, {len(wanted)} sheets, {size / 1e6:.1f} MB, {len(credits)} credit entries")


main()
