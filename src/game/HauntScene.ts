import * as Phaser from "phaser";
import { T, type HauntMap, type MapDoor, type Point } from "@/haunt/generate";
import { PROPS } from "@/haunt/furniture";
import type { Character, Effect, HauntBlueprint } from "@/haunt/schema";
import { surfaceFor, type HauntAudio } from "./audio";
import type { Difficulty } from "./difficulty";
import { glowTexture, paintGround, TILE } from "./render";
import { World, DIRS } from "./world";

// All rules live here; the React layer only shows what the bridge reports.

export { TILE };

export type ObjectiveState = { id: string; text: string; done: boolean; current: boolean };
export type RunResult = {
  outcome: "escaped" | "died";
  killer?: string;
  room?: string;
  seconds: number;
  position: Point;
  inventory: string[];
  objectivesDone: string[];
};

export type Bridge = {
  message(text: string, tone?: "mood" | "pickup" | "event" | "warn"): void;
  objectives(list: ObjectiveState[]): void;
  inventory(items: { id: string; name: string }[]): void;
  talk(characterId: string): void;
  lives(left: number): void;
  end(result: RunResult): void;
};

export type GraveMark = { x: number; y: number; epitaph?: string };

export type Sheets = Record<string, { walk: HTMLCanvasElement; hurt: HTMLCanvasElement }>;

type Dir = "up" | "left" | "down" | "right";
const DIR_ROW: Record<Dir, number> = { up: 0, left: 1, down: 2, right: 3 };

type Actor = {
  c: Character;
  tile: Point;
  next: Point | null;
  px: number;
  py: number;
  dir: Dir;
  behavior: Character["behavior"];
  hostile: boolean;
  waitUntil: number;
  goal: Point | null;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
};

const SPEED: Record<Character["behavior"], number> = {
  stationary: 0,
  wander: 1.2,
  patrol: 1.6,
  stalk: 3.0,
  chase: 3.4,
  hide: 3.6,
};
const PLAYER_SPEED = 4.2;
const LIGHT = { normal: 7, dark: 4.2, out: 3 };
/** sprites stand with their feet this far below the tile centre */
const FEET = 12;
const DARK_RES = 8;

export class HauntScene extends Phaser.Scene {
  private bp!: HauntBlueprint;
  private map!: HauntMap;
  private bridge!: Bridge;
  private sheets!: Sheets;
  private world!: World;
  private difficulty!: Difficulty;
  private audio!: HauntAudio;
  private lives = 1;
  private invulnerableUntil = 0;
  private stepTimer = 0;
  private petals: Phaser.GameObjects.Image[] = [];
  private graves: GraveMark[] = [];
  private readGraves = new Set<number>();
  private guideAt = 0;

  private player!: Phaser.GameObjects.Sprite;
  private pos = { x: 0, y: 0 };
  private facing: Dir = "down";
  private lantern!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private doorViews = new Map<number, Phaser.GameObjects.Graphics>();
  private dark!: Phaser.Textures.CanvasTexture;
  private darkSmall!: CanvasRenderingContext2D;
  private darkPixels!: ImageData;
  private itemViews = new Map<string, Phaser.GameObjects.Image>();
  private actors: Actor[] = [];

  private playerTile: Point = { x: 0, y: 0 };
  private lit = new Map<number, number>();
  private seen = new Set<number>();
  private inventory: string[] = [];
  private talked = new Set<string>();
  /** "bring" items the player was holding while talking to someone */
  private handedOver = new Set<string>();
  private done = new Set<string>();
  private firedEvents = new Set<number>();
  private visitedRooms = new Set<string>();
  private currentRoom: string | null = null;
  private lightsOut = false;
  private flickerUntil = 0;
  private startedAt = 0;
  private inputLocked = false;
  private over = false;
  private lastWarn = 0;
  private openNow = new Set<number>();

  constructor() {
    super("haunt");
  }

  init(data: {
    blueprint: HauntBlueprint;
    map: HauntMap;
    bridge: Bridge;
    sheets: Sheets;
    difficulty: Difficulty;
    audio: HauntAudio;
    graves: GraveMark[];
  }) {
    this.graves = data.graves.filter((g) => data.map.tiles[g.y * data.map.width + g.x] === T.FLOOR).slice(0, 25);
    this.difficulty = data.difficulty;
    this.audio = data.audio;
    this.lives = data.difficulty.lives;
    this.bp = data.blueprint;
    this.map = data.map;
    this.bridge = data.bridge;
    this.sheets = data.sheets;
    this.world = new World(data.map);
  }

  preload() {
    this.load.image("tiles", "/assets/tiles.png");
    this.load.image("props", "/assets/props.png");
  }

  create() {
    const m = this.map;
    const ground = paintGround(m, this.textures.get("tiles").getSourceImage() as HTMLImageElement);
    this.textures.addCanvas("ground", ground);
    this.add.image(0, 0, "ground").setOrigin(0).setDepth(-10);

    this.textures.addCanvas("glow-item", glowTexture(48, "rgba(255,214,120,0.9)"));
    this.textures.addCanvas("petal", petalTexture());
    for (let i = 0; i < 16; i++) this.petals.push(this.add.image(0, 0, "petal").setVisible(false).setDepth(-3));
    this.createProps();
    for (const d of m.doors) this.doorViews.set(this.world.i(d.x, d.y), this.add.graphics());
    for (const e of m.exits) this.drawExit(e);
    this.drawDoors();

    for (const it of m.items) {
      const view = this.add.image(cx(it.x), cy(it.y), "glow-item").setDepth(cy(it.y)).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: view, scale: 0.55, alpha: 0.5, yoyo: true, repeat: -1, duration: 650, ease: "Sine.inOut" });
      this.itemViews.set(it.id, view);
    }

    for (const g of this.graves) {
      this.add.image(cx(g.x), cy(g.y) + 10, "props", "headstone").setOrigin(0.5, 1).setDepth(cy(g.y) + 10).setAlpha(0.85);
    }

    for (const [id, sheet] of Object.entries(this.sheets)) this.registerSheet(id, sheet);
    for (const a of m.actors) this.createActor(a);

    this.pos = { x: cx(m.spawn.x), y: cy(m.spawn.y) };
    this.player = this.add.sprite(this.pos.x, this.pos.y + FEET, "player-walk", DIR_ROW.down * 9).setOrigin(0.5, 0.94);
    this.player.setDepth(this.pos.y + FEET);

    this.add
      .rectangle(-2000, -2000, m.width * TILE + 4000, m.height * TILE + 4000, 0x7d8fc0)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(890);
    this.textures.addCanvas("glow-lantern", glowTexture(360, "rgba(255,160,80,0.3)"));
    this.lantern = this.add.image(0, 0, "glow-lantern").setDepth(900).setBlendMode(Phaser.BlendModes.ADD);

    // darkness: one pixel per tile, blurred up to DARK_RES pixels per tile for soft edges
    const small = document.createElement("canvas");
    small.width = m.width;
    small.height = m.height;
    this.darkSmall = small.getContext("2d")!;
    this.darkPixels = this.darkSmall.createImageData(m.width, m.height);
    this.dark = this.textures.createCanvas("dark", m.width * DARK_RES, m.height * DARK_RES)!;
    this.add.image(0, 0, "dark").setOrigin(0).setScale(TILE / DARK_RES).setDepth(1000);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE", false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on("keydown-E", () => this.interact());
    this.input.keyboard!.on("keydown-SPACE", () => this.interact());

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setZoom(2);
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, 0.12, 0.12);

    this.startedAt = this.time.now;
    this.invulnerableUntil = this.time.now + 2500;
    this.bridge.lives(this.lives);
    this.bridge.message(this.bp.intro, "mood");
    this.updatePlayerTile(true);
    this.publishObjectives();
    this.publishInventory();
  }

  private registerSheet(id: string, sheet: Sheets[string]) {
    const walk = this.textures.addCanvas(`${id}-walk`, sheet.walk)!;
    for (let i = 0; i < 36; i++) walk.add(i, 0, (i % 9) * 64, Math.floor(i / 9) * 64, 64, 64);
    const hurt = this.textures.addCanvas(`${id}-hurt`, sheet.hurt)!;
    for (let i = 0; i < 6; i++) hurt.add(i, 0, i * 64, 0, 64, 64);
    for (const [dir, row] of Object.entries(DIR_ROW)) {
      this.anims.create({
        key: `${id}-walk-${dir}`,
        frames: this.anims.generateFrameNumbers(`${id}-walk`, { start: row * 9 + 1, end: row * 9 + 8 }),
        frameRate: 11,
        repeat: -1,
      });
    }
    this.anims.create({ key: `${id}-die`, frames: this.anims.generateFrameNumbers(`${id}-hurt`, { start: 0, end: 5 }), frameRate: 8 });
  }

  private createProps() {
    const tex = this.textures.get("props");
    for (const [name, meta] of Object.entries(PROPS)) tex.add(name, 0, ...meta.frame);
    for (const p of this.map.props) {
      const meta = PROPS[p.name];
      const bottom = (p.y + p.h) * TILE;
      const img = this.add.image((p.x + p.w / 2) * TILE, bottom, "props", p.name).setOrigin(0.5, 1);
      if (meta.mount === "wall") img.setPosition(img.x, bottom - 4).setDepth(-5);
      else if (!meta.blocking) img.setDepth(-4); // lies on the floor
      else img.setDepth(bottom - 2);
    }
  }

  private createActor(a: { id: string; x: number; y: number }) {
    const c = this.bp.cast.find((k) => k.id === a.id)!;
    const sprite = this.add.sprite(cx(a.x), cy(a.y) + FEET, `${c.id}-walk`, DIR_ROW.down * 9).setOrigin(0.5, 0.94);
    if (c.kind === "ghost") sprite.setTint(0xc6dcff);
    if (c.kind === "shadow") sprite.setTint(0x000000).setTintMode(Phaser.TintModes.FILL);
    if (c.kind === "creature") sprite.setTint(0xffb0a0);
    const label = this.add
      .text(0, 0, c.name, { fontFamily: "Georgia, serif", fontSize: "9px", color: c.hostile ? "#ff9a8a" : "#e6eeff", resolution: 3 })
      .setOrigin(0.5, 1)
      .setDepth(950)
      .setShadow(0, 1, "#000", 2, false, true);
    this.actors.push({
      c,
      tile: { x: a.x, y: a.y },
      next: null,
      px: cx(a.x),
      py: cy(a.y),
      dir: "down",
      behavior: c.behavior,
      hostile: c.hostile,
      waitUntil: 0,
      goal: null,
      sprite,
      label,
    });
  }

  setInputLocked(locked: boolean) {
    this.inputLocked = locked;
    // let the DOM have the keyboard while a text box is open
    this.input.keyboard!.enabled = !locked;
    if (locked) this.input.keyboard!.resetKeys();
  }

  endTalk(characterId: string) {
    this.setInputLocked(false);
    this.talked.add(characterId);
    this.fire("talk", characterId);
    this.checkObjectives();
  }

  update(time: number, delta: number) {
    if (this.over) return;
    const dt = Math.min(delta, 50) / 1000;
    this.movePlayer(dt);
    this.updateActors(time, dt);
    if (this.flickerUntil > time) this.computeLight(time);
    this.lantern.setPosition(this.player.x, this.player.y - 16);
    this.updateDoorsNearPlayer();
    if (this.difficulty.guide && time > this.guideAt) this.updateGuide(time);
    this.animatePetals(time);
    this.checkObjectives();
  }

  private movePlayer(dt: number) {
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (!this.inputLocked) {
      vx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      vy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    }
    if (!vx && !vy) {
      this.player.anims.stop();
      this.player.setFrame(DIR_ROW[this.facing] * 9);
      return;
    }
    this.facing = vx ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
    this.player.anims.play(`player-walk-${this.facing}`, true);
    const len = Math.hypot(vx, vy);
    const sx = (vx / len) * PLAYER_SPEED * TILE * dt;
    const sy = (vy / len) * PLAYER_SPEED * TILE * dt;
    if (this.canStand(this.pos.x + sx, this.pos.y)) this.pos.x += sx;
    if (this.canStand(this.pos.x, this.pos.y + sy)) this.pos.y += sy;
    this.player.setPosition(this.pos.x, this.pos.y + FEET).setDepth(this.pos.y + FEET);
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.29;
      this.audio.step(surfaceFor(this.world.roomAt(this.playerTile.x, this.playerTile.y)?.floor));
    }
    this.updatePlayerTile(false);
  }

  /** the player's footprint is 18px wide; every corner must be on a walkable tile */
  private canStand(x: number, y: number) {
    const r = 9;
    for (const [ox, oy] of [
      [-r, -r + 6],
      [r, -r + 6],
      [-r, r],
      [r, r],
    ]) {
      const tx = Math.floor((x + ox) / TILE);
      const ty = Math.floor((y + oy) / TILE);
      if (!this.world.walkable(tx, ty, "player", this.time.now)) {
        this.bump(tx, ty);
        return false;
      }
    }
    return true;
  }

  private bump(tx: number, ty: number) {
    const k = this.world.i(tx, ty);
    const door = this.world.doorAt.get(k);
    if (!door || this.time.now - this.lastWarn < 1500) return;
    if ((this.world.slammed.get(k) ?? 0) > this.time.now) {
      this.lastWarn = this.time.now;
      this.bridge.message("The door won't move. Something is holding it.", "warn");
    } else if (door.kind === "locked" && !this.world.opened.has(k)) {
      this.lastWarn = this.time.now;
      if (door.key && this.inventory.includes(door.key)) {
        this.world.opened.add(k);
        this.drawDoors();
        this.audio.unlock();
        this.bridge.message(`You unlock the door with the ${this.itemName(door.key)}.`, "event");
      } else {
        this.bridge.message("Locked.", "warn");
      }
    }
  }

  private updatePlayerTile(force: boolean) {
    const t = { x: Math.floor(this.pos.x / TILE), y: Math.floor(this.pos.y / TILE) };
    if (!force && t.x === this.playerTile.x && t.y === this.playerTile.y) return;
    this.playerTile = t;

    for (const [ox, oy] of DIRS) {
      const k = this.world.i(t.x + ox, t.y + oy);
      const d = this.world.doorAt.get(k);
      if (d?.kind === "hidden" && !this.world.found.has(k)) {
        this.world.found.add(k);
        this.drawDoors();
        this.audio.whisper();
        this.bridge.message("A draft. Part of the wall isn't wall.", "event");
      }
    }

    for (const it of this.map.items) {
      if (it.x === t.x && it.y === t.y && !this.inventory.includes(it.id)) this.pickUp(it.id);
    }

    this.graves.forEach((g, i) => {
      if (this.readGraves.has(i) || Math.abs(g.x - t.x) + Math.abs(g.y - t.y) > 1) return;
      this.readGraves.add(i);
      this.audio.whisper();
      this.bridge.message(g.epitaph ? `Someone fell here before you. “${g.epitaph}”` : "Someone fell here before you.", "mood");
    });

    const room = this.world.roomAt(t.x, t.y);
    if (room && room.id !== this.currentRoom) {
      this.currentRoom = room.id;
      if (!this.visitedRooms.has(room.id)) {
        this.visitedRooms.add(room.id);
        this.bridge.message(`${room.name}. ${room.mood}`, "mood");
        this.fire("enter", room.id);
      }
    }

    const exit = this.map.exits.find((e) => Math.abs(e.x - t.x) + Math.abs(e.y - t.y) <= 1);
    if (exit) this.tryEscape();

    this.computeLight(this.time.now);
  }

  private lightRadius(now: number) {
    const room = this.world.roomAt(this.playerTile.x, this.playerTile.y);
    let r = (this.lightsOut ? LIGHT.out : room?.dark ? LIGHT.dark : LIGHT.normal) * this.difficulty.light;
    if (this.flickerUntil > now) r = Math.random() < 0.3 ? 1.5 : r;
    return r;
  }

  private computeLight(now: number) {
    const r = this.lightRadius(now);
    const R = Math.ceil(r) + 1;
    const p = this.playerTile;
    this.lit.clear();
    for (let y = p.y - R; y <= p.y + R; y++)
      for (let x = p.x - R; x <= p.x + R; x++) {
        if (!this.world.in(x, y)) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d > r + 0.5) continue;
        // walls and faces are lit if the open cell in front of them is visible
        const target = this.world.blocksLight(x, y) ? this.frontOf(x, y, p) : { x, y };
        if (!target || !this.world.lineOfSight(p, target)) continue;
        const k = this.world.i(x, y);
        this.lit.set(k, Math.max(0, Math.min(1, 1 - (d / r) ** 1.3)));
        this.seen.add(k);
      }
    this.paintDarkness();
    for (const [id, view] of this.itemViews) {
      const it = this.map.items.find((i) => i.id === id)!;
      view.setVisible(this.lit.has(this.world.i(it.x, it.y)));
    }
  }

  private frontOf(x: number, y: number, viewer: Point): Point | null {
    const dx = Math.sign(viewer.x - x);
    const dy = Math.sign(viewer.y - y);
    for (const [ox, oy] of [
      [0, dy],
      [dx, 0],
      [dx, dy],
    ]) {
      if ((ox || oy) && !this.world.blocksLight(x + ox, y + oy)) return { x: x + ox, y: y + oy };
    }
    return null;
  }

  private paintDarkness() {
    const px = this.darkPixels.data;
    for (let k = 0; k < this.map.width * this.map.height; k++) {
      const light = this.lit.get(k);
      // even right next to the lantern a little dark remains; remembered rooms stay faint
      const a = light !== undefined ? 0.18 + 0.8 * (1 - light) : this.seen.has(k) ? 0.9 : 1;
      px[k * 4 + 3] = Math.round(a * 255);
    }
    this.darkSmall.putImageData(this.darkPixels, 0, 0);
    const ctx = this.dark.context;
    ctx.clearRect(0, 0, this.dark.width, this.dark.height);
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${DARK_RES * 0.6}px)`;
    ctx.drawImage(this.darkSmall.canvas, 0, 0, this.dark.width, this.dark.height);
    ctx.filter = "none";
    this.dark.refresh();
  }

  private updateActors(now: number, dt: number) {
    let tension = 0;
    for (const a of this.actors) {
      const speed = SPEED[a.behavior] * TILE * this.difficulty.enemySpeed;
      if (a.next) {
        const tx = cx(a.next.x),
          ty = cy(a.next.y);
        const dx = tx - a.px,
          dy = ty - a.py;
        const dist = Math.hypot(dx, dy);
        const step = speed * dt;
        if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? "right" : "left";
        else if (dy) a.dir = dy > 0 ? "down" : "up";
        if (dist <= step) {
          a.px = tx;
          a.py = ty;
          a.tile = a.next;
          a.next = null;
        } else {
          a.px += (dx / dist) * step;
          a.py += (dy / dist) * step;
        }
      }
      if (!a.next && now >= a.waitUntil) a.next = this.decide(a, now);

      const bob = a.c.kind === "ghost" ? Math.sin(now / 420 + a.px) * 3 - 4 : 0;
      a.sprite.setPosition(a.px, a.py + FEET + bob).setDepth(a.py + FEET);
      if (a.next) a.sprite.anims.play(`${a.c.id}-walk-${a.dir}`, true);
      else {
        a.sprite.anims.stop();
        a.sprite.setFrame(DIR_ROW[a.dir] * 9);
      }
      const lit = this.lit.get(this.world.i(a.tile.x, a.tile.y));
      const base = a.c.kind === "ghost" ? 0.75 : 1;
      const alpha = lit === undefined ? 0 : a.c.kind === "shadow" ? Math.min(1, lit * 1.8) : Math.max(0.3, lit) * base;
      a.sprite.setAlpha(alpha);
      const near = Math.hypot(a.px - this.pos.x, a.py - this.pos.y) < TILE * 4;
      a.label.setPosition(a.px, a.py + FEET - 54 + bob).setAlpha(near && alpha > 0.2 ? 0.9 : 0);

      const gap = Math.hypot(a.px - this.pos.x, a.py - this.pos.y);
      if (a.hostile) tension = Math.max(tension, 1 - gap / (TILE * 8));
      if (a.hostile && now > this.invulnerableUntil && gap < TILE * 0.6) {
        this.caught(a, now);
        if (this.over) return;
      }
    }
    this.audio.update(Math.max(0, tension));
  }

  private caught(a: Actor, now: number) {
    this.lives--;
    this.bridge.lives(this.lives);
    if (this.lives <= 0) {
      this.die(a);
      return;
    }
    this.invulnerableUntil = now + 3000;
    this.audio.sting();
    this.cameras.main.shake(300, 0.012);
    this.cameras.main.flash(400, 90, 20, 10);
    this.tweens.add({ targets: this.player, alpha: 0.3, yoyo: true, repeat: 5, duration: 120, onComplete: () => this.player.setAlpha(1) });
    const away = this.farFloorFrom(this.playerTile, 6, 12);
    a.tile = away;
    a.next = null;
    a.px = cx(away.x);
    a.py = cy(away.y);
    a.waitUntil = now + 2500;
    this.bridge.message(
      `${a.c.name} touches you, and your candle gutters out. ${this.lives === 1 ? "One candle left." : `${this.lives} candles left.`}`,
      "warn",
    );
  }

  private farFloorFrom(p: Point, min: number, max: number): Point {
    for (let i = 0; i < 80; i++) {
      const q = this.randomFloorNear(p, max);
      if (Math.hypot(q.x - p.x, q.y - p.y) >= min) return q;
    }
    return this.randomFloorNear(p, max);
  }

  private objectiveTarget(): Point | null {
    const o = this.bp.objectives.find((x) => !this.done.has(x.id));
    if (!o) return null;
    const itemAt = (id: string) => (this.inventory.includes(id) ? null : this.map.items.find((i) => i.id === id) ?? null);
    const actorAt = (id: string) => {
      const a = this.actors.find((x) => x.c.id === id);
      return a ? a.tile : null;
    };
    switch (o.kind) {
      case "find":
        return itemAt(o.target);
      case "bring": {
        const item = itemAt(o.target);
        if (item) return item;
        const friend = this.actors.find((a) => !a.hostile);
        return friend ? friend.tile : null;
      }
      case "talk":
        return actorAt(o.target);
      case "escape":
        return this.map.exits.find((e) => e.room === o.target) ?? null;
      case "survive":
        return null;
    }
  }

  private updateGuide(now: number) {
    this.guideAt = now + 700;
    const target = this.objectiveTarget();
    let path = target ? this.world.pathTo(this.playerTile, target, "player", now) : [];
    // behind a locked door: still point the way
    if (target && !path.length) path = this.world.pathTo(this.playerTile, target, "ghost", now);
    this.petals.forEach((p, i) => {
      const step = path[1 + i];
      if (!step) {
        p.setVisible(false);
        return;
      }
      const jx = ((step.x * 7 + step.y * 3) % 9) - 4;
      const jy = ((step.x * 5 + step.y * 11) % 9) - 4;
      p.setData({ x: cx(step.x) + jx, y: cy(step.y) + jy + 6, i }).setVisible(true);
    });
  }

  private animatePetals(now: number) {
    for (const p of this.petals) {
      if (!p.visible) continue;
      const { x, y, i } = p.data.values as { x: number; y: number; i: number };
      const lit = this.lit.get(this.world.i(Math.floor(x / TILE), Math.floor(y / TILE))) ?? 0;
      p.setPosition(x, y + Math.sin(now / 500 + i) * 1.5)
        .setRotation(Math.sin(now / 900 + i * 1.7) * 0.6)
        .setAlpha(Math.min(1, 0.5 + lit) * (1 - i / 20));
    }
  }

  private decide(a: Actor, now: number): Point | null {
    const who = a.c.kind === "ghost" || a.c.kind === "shadow" ? "ghost" : "body";
    const toPlayer = () => this.world.stepToward(a.tile, this.playerTile, who, now);
    const seenByPlayer = this.lit.has(this.world.i(a.tile.x, a.tile.y));
    switch (a.behavior) {
      case "stationary":
        return null;
      case "chase":
        return toPlayer();
      case "stalk":
        // only moves while you aren't looking at it
        if (seenByPlayer) return null;
        return toPlayer();
      case "hide":
        if (Math.hypot(a.tile.x - this.playerTile.x, a.tile.y - this.playerTile.y) <= 3) {
          a.behavior = "chase";
          this.bridge.message(`${a.c.name} was here the whole time.`, "warn");
          return toPlayer();
        }
        return null;
      case "wander": {
        a.waitUntil = now + 400 + Math.random() * 1600;
        const options = DIRS.map(([ox, oy]) => ({ x: a.tile.x + ox, y: a.tile.y + oy })).filter(
          (p) => this.world.walkable(p.x, p.y, who, now) && this.world.roomAt(p.x, p.y)?.id === this.world.roomAt(a.tile.x, a.tile.y)?.id,
        );
        return options.length ? options[Math.floor(Math.random() * options.length)] : null;
      }
      case "patrol": {
        if (!a.goal || (a.goal.x === a.tile.x && a.goal.y === a.tile.y)) {
          a.goal = this.randomFloorNear(a.tile, 14);
          a.waitUntil = now + 1200;
          return null;
        }
        const step = this.world.stepToward(a.tile, a.goal, who, now);
        if (!step) a.goal = null;
        return step;
      }
    }
  }

  private randomFloorNear(p: Point, r: number): Point {
    for (let i = 0; i < 40; i++) {
      const x = p.x + Math.floor((Math.random() * 2 - 1) * r);
      const y = p.y + Math.floor((Math.random() * 2 - 1) * r);
      if (this.world.tile(x, y) === T.FLOOR && this.world.walkable(x, y, "body")) return { x, y };
    }
    return p;
  }

  private interact() {
    if (this.inputLocked || this.over) return;
    const near = this.actors
      .filter((a) => !a.hostile && a.sprite.alpha > 0)
      .map((a) => ({ a, d: Math.hypot(a.px - this.pos.x, a.py - this.pos.y) }))
      .filter((x) => x.d < TILE * 1.8)
      .sort((p, q) => p.d - q.d)[0];
    if (!near) return;
    const a = near.a;
    const dx = this.pos.x - a.px,
      dy = this.pos.y - a.py;
    a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    a.next = null;
    a.waitUntil = this.time.now + 2000;
    this.setInputLocked(true);
    this.bridge.talk(a.c.id);
  }

  private pickUp(id: string) {
    const item = this.bp.items.find((i) => i.id === id)!;
    this.inventory.push(id);
    const view = this.itemViews.get(id);
    if (view) {
      this.tweens.killTweensOf(view);
      this.tweens.add({ targets: view, scale: 2.5, alpha: 0, duration: 400, onComplete: () => view.destroy() });
    }
    this.itemViews.delete(id);
    this.audio.pickup();
    this.bridge.message(`${item.name}. ${item.description}`, "pickup");
    this.publishInventory();
    this.fire("pickup", id);
    this.checkObjectives();
  }

  private objectiveDone(o: HauntBlueprint["objectives"][number]): boolean {
    switch (o.kind) {
      case "find":
        return this.inventory.includes(o.target);
      case "talk":
        return this.talked.has(o.target);
      case "bring":
        return this.handedOver.has(o.target);
      case "survive":
        return this.time.now - this.startedAt >= (o.seconds ?? 90) * 1000;
      case "escape":
        return false; // completed by tryEscape
    }
  }

  private checkObjectives() {
    let changed = false;
    for (const o of this.bp.objectives) {
      if (this.done.has(o.id) || !this.objectiveDone(o)) continue;
      this.done.add(o.id);
      changed = true;
      this.bridge.message(`✓ ${o.text}`, "event");
      this.fire("objective", o.id);
    }
    if (changed) this.publishObjectives();
    if (this.done.size === this.bp.objectives.length) this.finish("escaped");
  }

  private tryEscape() {
    const escape = this.bp.objectives.find((o) => o.kind === "escape" && !this.done.has(o.id));
    if (!escape) return;
    const pending = this.bp.objectives.filter((o) => o.kind !== "escape" && !this.done.has(o.id));
    if (pending.length) {
      if (this.time.now - this.lastWarn > 2500) {
        this.lastWarn = this.time.now;
        this.bridge.message(`Not yet. ${pending[0].text}.`, "warn");
      }
      return;
    }
    this.done.add(escape.id);
    this.publishObjectives();
    this.finish("escaped");
  }

  private fire(on: "pickup" | "enter" | "talk" | "objective", ref: string) {
    if (on === "talk") {
      for (const o of this.bp.objectives)
        if (o.kind === "bring" && this.inventory.includes(o.target)) this.handedOver.add(o.target);
    }
    this.bp.events.forEach((e, i) => {
      if (this.firedEvents.has(i) || e.trigger.on !== on || e.trigger.ref !== ref) return;
      this.firedEvents.add(i);
      for (const f of e.effects) this.apply(f);
    });
  }

  private apply(f: Effect) {
    const now = this.time.now;
    const actor = f.ref ? this.actors.find((a) => a.c.id === f.ref) : undefined;
    switch (f.do) {
      case "lights_out":
        this.lightsOut = true;
        this.audio.lightsOut();
        this.lantern.setAlpha(0.45);
        this.cameras.main.flash(250, 0, 0, 0);
        break;
      case "flicker":
        this.flickerUntil = now + 3000;
        this.audio.whisper();
        break;
      case "door_slam": {
        const near = this.map.doors
          .map((d) => ({ d, dist: Math.hypot(d.x - this.playerTile.x, d.y - this.playerTile.y) }))
          .sort((a, b) => a.dist - b.dist)[0];
        if (near) {
          this.world.slammed.set(this.world.i(near.d.x, near.d.y), now + 12000);
          this.audio.door();
          this.audio.lightsOut();
          this.cameras.main.shake(200, 0.006);
          this.drawDoors();
          this.time.delayedCall(12100, () => this.drawDoors());
        }
        break;
      }
      case "spawn":
        this.audio.sting();
        if (actor) {
          const spot = this.randomFloorNear(this.playerTile, 5);
          actor.tile = spot;
          actor.next = null;
          actor.px = cx(spot.x);
          actor.py = cy(spot.y);
        }
        break;
      case "chase":
        this.audio.sting();
        if (actor) {
          actor.behavior = "chase";
          actor.hostile = true;
          actor.label.setColor("#ff9a8a");
        }
        break;
      case "calm":
        if (actor) {
          actor.behavior = "wander";
          actor.hostile = false;
          actor.label.setColor("#e6eeff");
        }
        break;
      case "whisper":
        this.audio.whisper();
        break;
    }
    if (f.text) this.bridge.message(f.text, "event");
    this.computeLight(now);
  }

  private die(killer: Actor) {
    this.over = true;
    this.player.anims.play("player-die");
    this.audio.death();
    this.cameras.main.shake(400, 0.02);
    this.cameras.main.flash(600, 120, 0, 0);
    this.time.delayedCall(1100, () => {
      this.over = false;
      this.finish("died", killer.c.name);
    });
  }

  private finish(outcome: RunResult["outcome"], killer?: string) {
    if (this.over) return;
    this.over = true;
    if (outcome === "escaped") this.audio.win();
    this.bridge.end({
      outcome,
      killer,
      room: this.currentRoom ?? undefined,
      seconds: Math.round((this.time.now - this.startedAt) / 1000),
      position: this.playerTile,
      inventory: [...this.inventory],
      objectivesDone: [...this.done],
    });
  }

  private publishObjectives() {
    const current = this.bp.objectives.find((o) => !this.done.has(o.id))?.id;
    this.bridge.objectives(
      this.bp.objectives.map((o) => ({ id: o.id, text: o.text, done: this.done.has(o.id), current: o.id === current })),
    );
  }

  private publishInventory() {
    this.bridge.inventory(this.inventory.map((id) => ({ id, name: this.itemName(id) })));
  }

  private itemName(id: string) {
    return this.bp.items.find((i) => i.id === id)?.name ?? id;
  }

  private updateDoorsNearPlayer() {
    const near = new Set<number>();
    for (const d of this.map.doors) {
      const dist = Math.hypot(cx(d.x) - this.pos.x, cy(d.y) - this.pos.y);
      if (dist < TILE * 1.6 && this.world.walkable(d.x, d.y, "player", this.time.now)) near.add(this.world.i(d.x, d.y));
    }
    if (near.size !== this.openNow.size || [...near].some((k) => !this.openNow.has(k))) {
      if ([...near].some((k) => !this.openNow.has(k) && this.world.doorAt.get(k)?.kind !== "vent")) this.audio.door();
      this.openNow = near;
      this.drawDoors();
    }
  }

  private drawDoors() {
    for (const d of this.map.doors) this.drawDoor(d);
  }

  private drawDoor(d: MapDoor) {
    const k = this.world.i(d.x, d.y);
    const g = this.doorViews.get(k)!;
    g.clear();
    const px = d.x * TILE,
      py = d.y * TILE;
    // a door in an east-west wall is seen face-on; in a north-south wall, edge-on
    const faceOn = this.world.tile(d.x - 1, d.y) !== T.FLOOR && this.world.tile(d.x + 1, d.y) !== T.FLOOR;
    g.setDepth(py + TILE - 1);
    if (d.kind === "hidden" && !this.world.found.has(k)) return;
    if (d.kind === "vent") {
      g.fillStyle(0x1b1d21).fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      g.fillStyle(0x7a8290);
      for (let i = 6; i < TILE - 5; i += 5) g.fillRect(px + i, py + 5, 2, TILE - 10);
      return;
    }
    const slammed = (this.world.slammed.get(k) ?? 0) > this.time.now;
    const locked = d.kind === "locked" && !this.world.opened.has(k);
    if (this.openNow.has(k) && !locked && !slammed) {
      g.fillStyle(0x000000, 0.35).fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      return;
    }
    const wood = slammed ? 0x5a1a14 : d.kind === "hidden" ? 0x4a3a2c : 0x6b4226;
    if (faceOn) {
      g.fillStyle(0x2a1a12).fillRect(px + 1, py - 10, TILE - 2, TILE + 10);
      g.fillStyle(wood).fillRect(px + 3, py - 8, TILE - 6, TILE + 6);
      g.fillStyle(0x000000, 0.2);
      for (let i = px + 9; i < px + TILE - 4; i += 7) g.fillRect(i, py - 8, 1, TILE + 6);
      g.fillStyle(locked ? 0xffd36b : 0xc9a46a).fillCircle(px + TILE - 9, py + 10, locked ? 2.5 : 1.5);
      if (locked) g.fillStyle(0x2a1a12).fillRect(px + TILE - 10, py + 13, 2, 3);
    } else {
      g.fillStyle(0x2a1a12).fillRect(px + 10, py, 12, TILE);
      g.fillStyle(wood).fillRect(px + 12, py + 1, 8, TILE - 2);
      if (locked) g.fillStyle(0xffd36b).fillCircle(px + 16, py + 16, 2.5);
    }
  }

  private drawExit(e: Point) {
    const g = this.add.graphics().setDepth(e.y * TILE + TILE - 1);
    const px = e.x * TILE,
      py = e.y * TILE;
    g.fillStyle(0x0d1a12).fillRect(px + 2, py - 6, TILE - 4, TILE + 4);
    g.fillStyle(0x2e5a3a).fillRect(px + 4, py - 4, TILE - 8, TILE);
    const glow = this.add.image(px + TILE / 2, py + 4, "glow-item").setTint(0x6bff9a).setBlendMode(Phaser.BlendModes.ADD).setDepth(901);
    this.tweens.add({ targets: glow, alpha: 0.4, yoyo: true, repeat: -1, duration: 900 });
    this.add
      .text(px + TILE / 2, py - 8, "EXIT", { fontFamily: "monospace", fontSize: "7px", color: "#7dff9e", resolution: 3 })
      .setOrigin(0.5, 1)
      .setDepth(902);
  }
}

function petalTexture() {
  const c = document.createElement("canvas");
  c.width = 9;
  c.height = 7;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c2410c";
  ctx.beginPath();
  ctx.ellipse(4.5, 3.5, 4.2, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.ellipse(4, 3, 2.8, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(3, 2, 2, 1);
  return c;
}

const cx = (x: number) => x * TILE + TILE / 2;
const cy = (y: number) => y * TILE + TILE / 2;
