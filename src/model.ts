export const WIDTH = 1200;
export const HEIGHT = 800;
export const DEFAULT_BACKGROUND = '#FCF2E0';
export const MAX_LAYERS = 12;

export interface ImageStyle {
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowColor: string;
  shadowOpacity: number;
}
export const DEFAULT_IMAGE_STYLE: Readonly<ImageStyle> = {
  borderWidth: 0,
  borderColor: '#000000',
  borderRadius: 0,
  shadowX: 0,
  shadowY: 12,
  shadowBlur: 28,
  shadowSpread: 0,
  shadowColor: '#000000',
  shadowOpacity: 0,
};
export const IMAGE_PRESETS: readonly { id: string; label: string; style: ImageStyle }[] = [
  { id: 'none', label: 'None', style: { ...DEFAULT_IMAGE_STYLE } },
  {
    id: 'soft',
    label: 'Soft shadow',
    style: {
      ...DEFAULT_IMAGE_STYLE,
      borderRadius: 12,
      shadowY: 8,
      shadowBlur: 24,
      shadowOpacity: 16,
    },
  },
  {
    id: 'floating',
    label: 'Floating',
    style: {
      ...DEFAULT_IMAGE_STYLE,
      borderRadius: 16,
      shadowY: 16,
      shadowBlur: 40,
      shadowOpacity: 24,
    },
  },
  {
    id: 'outline',
    label: 'Outline',
    style: { ...DEFAULT_IMAGE_STYLE, borderWidth: 1, borderColor: '#B8B8B8' },
  },
  {
    id: 'rounded',
    label: 'Rounded outline',
    style: { ...DEFAULT_IMAGE_STYLE, borderWidth: 1, borderColor: '#B8B8B8', borderRadius: 16 },
  },
];
export interface Layer extends Partial<ImageStyle> {
  id: string;
  captureId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Recipe {
  background: string;
  layers: Layer[];
}
export interface Project extends Recipe {
  revision: number;
  appliedUrl: string;
  appliedUpdated: number;
  attachmentId: number;
}
export interface Component {
  id: string;
  label: string;
  thumbnail: string;
}
export interface Capture {
  id: string;
  componentId: string;
  width: number;
  height: number;
}
export interface Config {
  ajaxUrl: string;
  nonce: string;
  postId: number;
  bricksVersion: string;
  components: Component[];
  screenshotsEnabled: boolean;
  strings: Record<string, string>;
}

export const copyRecipe = (recipe: Recipe): Recipe => ({
  background: recipe.background,
  layers: recipe.layers.map((l) => ({ ...l })),
});
export function normalizeColor(value: string): string | null {
  const trimmed = value.trim();
  return /^#?[a-f\d]{6}$/i.test(trimmed) ? `#${trimmed.replace(/^#/, '').toUpperCase()}` : null;
}
export function getImageStyle(layer: Layer): ImageStyle {
  return Object.fromEntries(
    Object.entries(DEFAULT_IMAGE_STYLE).map(([key, value]) => [
      key,
      layer[key as keyof ImageStyle] ?? value,
    ]),
  ) as unknown as ImageStyle;
}
export function imagePreset(style: ImageStyle): string {
  return (
    IMAGE_PRESETS.find((preset) =>
      Object.entries(preset.style).every(
        ([key, value]) => style[key as keyof ImageStyle] === value,
      ),
    )?.id ?? 'custom'
  );
}
export function shadowColor(style: ImageStyle): string {
  const rgb = [1, 3, 5].map((index) => parseInt(style.shadowColor.slice(index, index + 2), 16));
  return `rgba(${rgb.join(',')},${style.shadowOpacity / 100})`;
}
export function imageShadow(style: ImageStyle, scale = 1): string {
  return style.shadowOpacity
    ? `${style.shadowX * scale}px ${style.shadowY * scale}px ${style.shadowBlur * scale}px ${style.shadowSpread * scale}px ${shadowColor(style)}`
    : 'none';
}
export function imageStyle(layer: Layer): { width: number; color: string; radius: number } {
  const half = Math.min(layer.width, layer.height) / 2;
  return {
    width: Math.min(layer.borderWidth ?? 0, half),
    color: layer.borderColor ?? '#000000',
    radius: Math.min(layer.borderRadius ?? 0, half),
  };
}
export function fitLayer(layer: Layer, margin = 72): Layer {
  const scale = Math.min((WIDTH - margin * 2) / layer.width, (HEIGHT - margin * 2) / layer.height);
  const width = layer.width * scale,
    height = layer.height * scale;
  return { ...layer, width, height, x: (WIDTH - width) / 2, y: (HEIGHT - height) / 2 };
}
export function resizeLayer(layer: Layer, dx: number, dy: number): Layer {
  const scale = Math.max(
    24 / layer.width,
    24 / layer.height,
    Math.min(
      8,
      Math.abs(dx) > Math.abs(dy)
        ? (layer.width + dx) / layer.width
        : (layer.height + dy) / layer.height,
    ),
  );
  return { ...layer, width: layer.width * scale, height: layer.height * scale };
}
export function moveLayer(
  layer: Layer,
  dx: number,
  dy: number,
  snap = true,
): { layer: Layer; vertical: boolean; horizontal: boolean } {
  let x = Math.min(WIDTH - 16, Math.max(16 - layer.width, layer.x + dx));
  let y = Math.min(HEIGHT - 16, Math.max(16 - layer.height, layer.y + dy));
  const vertical = snap && Math.abs(x + layer.width / 2 - WIDTH / 2) < 8;
  const horizontal = snap && Math.abs(y + layer.height / 2 - HEIGHT / 2) < 8;
  if (vertical) x = (WIDTH - layer.width) / 2;
  if (horizontal) y = (HEIGHT - layer.height) / 2;
  return { layer: { ...layer, x, y }, vertical, horizontal };
}
export class History {
  private previous: Recipe[] = [];
  private following: Recipe[] = [];
  push(recipe: Recipe): void {
    const copy = copyRecipe(recipe);
    if (JSON.stringify(this.previous.at(-1)) !== JSON.stringify(copy)) this.previous.push(copy);
    if (this.previous.length > 50) this.previous.shift();
    this.following = [];
  }
  undo(current: Recipe): Recipe | null {
    const value = this.previous.pop();
    if (!value) return null;
    this.following.push(copyRecipe(current));
    return value;
  }
  redo(current: Recipe): Recipe | null {
    const value = this.following.pop();
    if (!value) return null;
    this.previous.push(copyRecipe(current));
    return value;
  }
  get canUndo(): boolean {
    return this.previous.length > 0;
  }
  get canRedo(): boolean {
    return this.following.length > 0;
  }
  clear(): void {
    this.previous = [];
    this.following = [];
  }
  captureIds(current: Recipe): Set<string> {
    return new Set(
      [current, ...this.previous, ...this.following].flatMap((recipe) =>
        recipe.layers.map((layer) => layer.captureId),
      ),
    );
  }
}
