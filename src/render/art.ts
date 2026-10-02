import { GRID_SIZE, SPRITES, FOG } from "../core/consts";
import type { ObjectSprite } from "../core/consts";
import { setWallImage } from "./walls";

// One cell of floor, repeated as a pattern, and a desaturated, darkened copy for fog memory. The art
// is scaled to a cell with smoothing off, so pixel art stays crisp at any resolution.
const makeTile = () => {
  const tile = document.createElement('canvas');
  tile.width = tile.height = GRID_SIZE;
  return tile;
}
export const floorTile = makeTile(), dimFloorTile = makeTile();
const paintTiles = (img: HTMLImageElement, lit: HTMLCanvasElement, dim: HTMLCanvasElement) => {
  const t = lit.getContext('2d')!;
  t.imageSmoothingEnabled = false;
  t.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);
  const d = dim.getContext('2d')!;
  d.filter = `grayscale(1) brightness(${FOG.floorBrightness})`;
  d.drawImage(lit, 0, 0);
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`couldn't load ${url}`));
  img.src = url;
});

// Every image in src/assets and its folders, by its path in there ('interactive/mirror.png').
const assetUrls: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/**/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.slice('../assets/'.length), url]),
);
const asset = (file: string) => {
  const url = assetUrls[file];
  if (!url) throw new Error(`No image src/assets/${file} (moved or renamed? the paths are in consts.ts)`);
  return loadImage(url);
}
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
  kinds.forEach((k, i) => playerSprites[k] = images[i]);
  objects.forEach((k, i) => {
    const lit = images[kinds.length + i];
    const dim = document.createElement('canvas');
    dim.width = lit.width;
    dim.height = lit.height;
    const d = dim.getContext('2d')!;
    d.filter = `grayscale(1) brightness(${FOG.floorBrightness})`;
    d.drawImage(lit, 0, 0);
    objectArt[k] = { lit, dim };
  });
  paintTiles(floor, floorTile, dimFloorTile);
  setWallImage(wall);
}

// Object art, as drawn and as remembered in fog (grayed and darkened like the floor), turned by
// `angle` about its anchor (the image's centre unless it names one). Art is scaled so its canvas is
// one cell, with smoothing off.
export type ObjectKind = keyof typeof SPRITES.objects;
const objectArt = {} as Record<ObjectKind, { lit: HTMLImageElement; dim: HTMLCanvasElement }>;
export const drawObject = (c: CanvasRenderingContext2D, kind: ObjectKind, x: number, y: number, angle: number, dim: boolean, scale = 1) => {
  const art = objectArt[kind], k = GRID_SIZE / art.lit.width, sprite: ObjectSprite = SPRITES.objects[kind];
  const anchor = sprite.anchor ?? { x: art.lit.width / 2, y: art.lit.height / 2 };
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(k * scale, k * scale);
  c.imageSmoothingEnabled = false;
  c.drawImage(dim ? art.dim : art.lit, -anchor.x, -anchor.y);
  c.restore();
}
