import { getImageStyle, imageStyle, shadowColor, WIDTH, HEIGHT } from './model';
import type { Layer } from './model';

/** Draw the same inside border and rounded clip used by the editor preview. */
export function drawLayer(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  layer: Layer,
): void {
  const style = imageStyle(layer);
  const shadow = getImageStyle(layer);
  if (
    shadow.shadowOpacity &&
    layer.width + shadow.shadowSpread * 2 > 0 &&
    layer.height + shadow.shadowSpread * 2 > 0
  ) {
    context.save();
    try {
      // An outset CSS shadow is clipped out of the original image's border box.
      context.beginPath();
      context.rect(0, 0, WIDTH, HEIGHT);
      context.roundRect(layer.x, layer.y, layer.width, layer.height, style.radius);
      context.clip('evenodd');
      // Move the opaque caster off canvas; only its native canvas shadow is visible.
      const distance =
        WIDTH + Math.abs(layer.x) + layer.width + Math.abs(shadow.shadowSpread) * 2 + 1;
      context.shadowColor = shadowColor(shadow);
      context.shadowBlur = shadow.shadowBlur;
      context.shadowOffsetX = distance + shadow.shadowX;
      context.shadowOffsetY = shadow.shadowY;
      context.fillStyle = '#000000';
      const width = layer.width + shadow.shadowSpread * 2,
        height = layer.height + shadow.shadowSpread * 2;
      context.beginPath();
      context.roundRect(
        layer.x - distance - shadow.shadowSpread,
        layer.y - shadow.shadowSpread,
        width,
        height,
        Math.min(Math.max(0, style.radius + shadow.shadowSpread), width / 2, height / 2),
      );
      context.fill();
    } finally {
      context.restore();
    }
  }
  context.save();
  try {
    context.beginPath();
    context.roundRect(layer.x, layer.y, layer.width, layer.height, style.radius);
    context.clip();
    context.drawImage(image, layer.x, layer.y, layer.width, layer.height);
    if (style.width) {
      // Fill a ring rather than stroking a centerline: its outer edge stays on the image bounds.
      context.beginPath();
      context.roundRect(layer.x, layer.y, layer.width, layer.height, style.radius);
      context.roundRect(
        layer.x + style.width,
        layer.y + style.width,
        layer.width - style.width * 2,
        layer.height - style.width * 2,
        Math.max(0, style.radius - style.width),
      );
      context.fillStyle = style.color;
      context.fill('evenodd');
    }
  } finally {
    context.restore();
  }
}
