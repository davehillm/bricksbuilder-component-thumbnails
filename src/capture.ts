import { createContext, destroyContext, domToCanvas } from 'modern-screenshot';
import { withAbort } from './async';
import type { Target } from './adapter';

const transparent = (color: string) =>
  !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be created.'))),
      'image/png',
    ),
  );
}

export function captureDimensions(
  node: HTMLElement,
  win: Window,
): { width: number; height: number } {
  const style = win.getComputedStyle(node);
  const pixels = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
  const borderBox = style.boxSizing === 'border-box';
  // offsetWidth/Height round down fractional boxes and can reflow tightly fitted text.
  const dimension = (axis: string, edges: string[], fallback: number) => {
    const size = parseFloat(style.getPropertyValue(axis));
    if (!Number.isFinite(size)) return Math.max(1, fallback);
    const extra = borderBox
      ? 0
      : edges.reduce(
          (sum, edge) => sum + pixels(`padding-${edge}`) + pixels(`border-${edge}-width`),
          0,
        );
    return Math.max(1, Math.ceil(size + extra));
  };
  return {
    width: dimension('width', ['left', 'right'], node.offsetWidth),
    height: dimension('height', ['top', 'bottom'], node.offsetHeight),
  };
}

export async function captureComponent(target: Target, signal?: AbortSignal): Promise<Blob> {
  const controller = new AbortController(),
    abort = () =>
      controller.abort(signal?.reason || new DOMException('Capture cancelled.', 'AbortError'));
  const timer = setTimeout(
    () =>
      controller.abort(new Error('Capture timed out. Try again after the component has loaded.')),
    30000,
  );
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    return await withAbort(renderComponent(target, controller.signal), controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function renderComponent(target: Target, signal: AbortSignal): Promise<Blob> {
  const { node, document: doc } = target;
  const win = doc.defaultView;
  if (!win) throw new Error('The Bricks canvas is unavailable.');
  await withAbort(doc.fonts.ready, signal);
  const images = Array.from(node.querySelectorAll('img'));
  await withAbort(
    Promise.all(
      images.map(async (image) => {
        if (image.complete && image.naturalWidth > 0) return;
        if (image.loading === 'lazy') {
          // Decode through a detached image, preserving the builder's lazy-loading state.
          const detached = new Image();
          detached.src = image.currentSrc || image.src;
          await detached.decode();
        } else await image.decode();
      }),
    ),
    signal,
  );
  let ancestor: Element | null = node,
    background = '#FFFFFF';
  while (ancestor) {
    const c = win.getComputedStyle(ancestor).backgroundColor;
    if (!transparent(c)) {
      background = c;
      break;
    }
    ancestor = ancestor.parentElement;
  }
  const { width, height } = captureDimensions(node, win);
  const scale = Math.min(2, 2048 / width, 8192 / height, Math.sqrt(15000000 / (width * height)));
  signal.throwIfAborted();
  const context = await createContext(node, {
    width,
    height,
    scale,
    backgroundColor: background,
    maximumCanvasSize: 8192,
    timeout: 15000,
    autoDestruct: false,
    fetch: {
      requestInit: { signal },
      placeholderImage: () => {
        throw new Error(
          'An image could not be captured. Check that its server allows image access.',
        );
      },
    },
    filter: (child) =>
      child.nodeType !== 1 ||
      !(child as Element).matches(
        'script,.bricks-element-actions,.bricks-element-label,.bricks-element-name,[data-ctstudio-ui]',
      ),
    onCloneEachNode: (clone) => {
      if (clone.nodeType === 1 && 'style' in clone) {
        const element = clone as HTMLElement;
        element.style.animation = 'none';
        element.style.transition = 'none';
        element.removeAttribute('contenteditable');
        if (element.tagName === 'VIDEO') {
          const video = element as HTMLVideoElement;
          if (!video.poster)
            throw new Error('This video needs a poster image before it can be captured.');
          const poster = element.ownerDocument.createElement('img');
          poster.src = video.poster;
          poster.style.cssText = element.style.cssText;
          element.replaceWith(poster);
        }
      }
    },
    onCloneNode: (clone) => {
      if (clone.nodeType === 1 && 'style' in clone) {
        const element = clone as HTMLElement;
        element.style.zoom = '1';
        element.style.outline = 'none';
        element.style.boxShadow = win.getComputedStyle(node).boxShadow;
      }
    },
  });
  try {
    signal.throwIfAborted();
    const canvas = await withAbort(domToCanvas(context), signal);
    try {
      const blob = await canvasBlob(canvas);
      if (blob.size > 5 * 1024 * 1024)
        throw new Error('This component is too large to capture. Try a narrower breakpoint.');
      return blob;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    destroyContext(context);
  }
}
