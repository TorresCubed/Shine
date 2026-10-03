import { GRID_SIZE, SPRITES, FOG } from '../core/consts';
import type { ObjectSprite } from '../core/consts';

// Art as fog remembers it: grayed and darkened, drawn into `into` (by default a new canvas).
export const dimCopy = (art: HTMLImageElement | HTMLCanvasElement, into = document.createElement('canvas')) => {
  into.width = art.width;
  into.height = art.height;
  const d = into.getContext('2d')!;
  d.filter = `grayscale(1) brightness(${FOG.floorBrightness})`;
  d.drawImage(art, 0, 0);
  return into;
};

// One cell of floor, repeated as a pattern, and its fog copy. Scaled to a cell with smoothing off, so
// pixel art stays crisp.
export const floorTile = document.createElement('canvas');
export const dimFloorTile = document.createElement('canvas');
export let wallImage: HTMLImageElement;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`couldn't load ${url}`));
    img.src = url;
  });

// Every image in src/assets and its folders, by its path in there ('interactive/mirror.png').
const assetUrls: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/**/*.png', { eager: true, query: '?url', import: 'default' })).map(
    ([path, url]) => [path.slice('../assets/'.length), url],
  ),
);
const asset = (file: string) => {
  const url = assetUrls[file];
  if (!url) throw new Error(`No image src/assets/${file} (moved or renamed? the paths are in consts.ts)`);
  return loadImage(url);
};
type SpriteKind = keyof typeof SPRITES.player;
export const playerSprites = {} as Record<SpriteKind, HTMLImageElement>;

export const loadAssets = async () => {
  const kinds = Object.keys(SPRITES.player) as SpriteKind[];
  const objects = Object.keys(SPRITES.objects) as ObjectKind[];
  const [floor, wall, ...images] = await Promise.all([
    asset('levelPieces/floorboards.png'),
    asset('levelPieces/walls.png'),
    ...kinds.map(k => asset(SPRITES.player[k].file)),
    ...objects.map(k => asset(SPRITES.objects[k].file)),
  ]);
  kinds.forEach((k, i) => (playerSprites[k] = images[i]));
  objects.forEach((k, i) => {
    const lit = images[kinds.length + i];
    objectArt[k] = { lit, dim: dimCopy(lit) };
  });
  floorTile.width = floorTile.height = GRID_SIZE;
  const t = floorTile.getContext('2d')!;
  t.imageSmoothingEnabled = false;
  t.drawImage(floor, 0, 0, GRID_SIZE, GRID_SIZE);
  dimCopy(floorTile, dimFloorTile);
  wallImage = wall;
};

// Object art, lit or as fog remembers it, turned by `angle` about its anchor (the image's centre
// unless it names one), scaled so its canvas is one cell.
export type ObjectKind = keyof typeof SPRITES.objects;
const objectArt = {} as Record<ObjectKind, { lit: HTMLImageElement; dim: HTMLCanvasElement }>;
export const drawObject = (
  c: CanvasRenderingContext2D,
  kind: ObjectKind,
  x: number,
  y: number,
  angle: number,
  dim: boolean,
  scale = 1,
) => {
  const art = objectArt[kind];
  const k = GRID_SIZE / art.lit.width;
  const sprite: ObjectSprite = SPRITES.objects[kind];
  const anchor = sprite.anchor ?? { x: art.lit.width / 2, y: art.lit.height / 2 };
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(k * scale, k * scale);
  c.imageSmoothingEnabled = false;
  c.drawImage(dim ? art.dim : art.lit, -anchor.x, -anchor.y);
  c.restore();
};
