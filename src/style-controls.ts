import {
  DEFAULT_IMAGE_STYLE,
  getImageStyle,
  IMAGE_PRESETS,
  imagePreset,
  normalizeColor,
} from './model';
import type { ImageStyle, Layer } from './model';
import { icon } from './icons';

type NumberKey = {
  [K in keyof ImageStyle]: ImageStyle[K] extends number ? K : never;
}[keyof ImageStyle];
type ColorKey = 'borderColor' | 'shadowColor';

/** Contextual, editor-only controls. The recipe remains the single persisted source of truth. */
export class ImageStyleControls {
  readonly host = document.createElement('div');
  private button = document.createElement('button');
  private panel = document.createElement('div');
  private preset = document.createElement('select');
  private fields = new Map<keyof ImageStyle, HTMLInputElement>();
  private swatches = new Map<ColorKey, HTMLInputElement>();
  private invalid = new Set<HTMLInputElement>();
  private style: ImageStyle = { ...DEFAULT_IMAGE_STYLE };
  layerId = '';

  constructor(
    parent: HTMLElement,
    private t: (key: string) => string,
    private change: (style: Partial<ImageStyle>, remember: boolean) => void,
    private checkpoint: () => void,
    private validityChanged: () => void,
  ) {
    this.host.className = 'image-style';
    this.button.type = 'button';
    this.button.className = 'icon';
    this.button.innerHTML = icon('style');
    this.button.title = this.t('Image style');
    this.button.setAttribute('aria-label', this.t('Image style'));
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-controls', 'ctstudio-image-style');
    this.panel.id = 'ctstudio-image-style';
    this.panel.className = 'style-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'group');
    this.panel.setAttribute('aria-label', this.t('Image style'));
    this.preset.setAttribute('aria-label', this.t('Preset'));
    for (const preset of [...IMAGE_PRESETS, { id: 'custom', label: 'Custom' }]) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = this.t(preset.label);
      option.disabled = preset.id === 'custom';
      this.preset.append(option);
    }
    this.row(this.panel, 'Preset', this.preset);
    this.number(this.panel, 'Border width', 'borderWidth', 0, 64);
    this.number(this.panel, 'Corner radius', 'borderRadius', 0, 600);
    this.color(this.panel, 'Border color', 'Border hex', 'borderColor');
    const shadow = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent = this.t('Shadow');
    shadow.className = 'shadow-tuning';
    shadow.append(summary);
    this.number(shadow, 'Horizontal', 'shadowX', -200, 200);
    this.number(shadow, 'Vertical', 'shadowY', -200, 200);
    this.number(shadow, 'Blur', 'shadowBlur', 0, 200);
    this.number(shadow, 'Spread', 'shadowSpread', -100, 100);
    this.number(shadow, 'Opacity', 'shadowOpacity', 0, 100, '%');
    this.color(shadow, 'Shadow color', 'Shadow hex', 'shadowColor');
    this.panel.append(shadow);
    this.host.append(this.button, this.panel);
    parent.append(this.host);
    this.preset.addEventListener('change', () => {
      const preset = IMAGE_PRESETS.find((item) => item.id === this.preset.value);
      if (!preset || !this.layerId) return;
      this.style = { ...preset.style };
      this.render();
      this.change({ ...this.style }, true);
    });
    this.button.addEventListener('click', () => {
      if (this.panel.hidden) {
        this.panel.hidden = false;
        this.button.setAttribute('aria-expanded', 'true');
        this.position();
        this.preset.focus();
      } else this.hide();
    });
    this.host.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        this.button.focus();
      }
    });
  }
  private row(parent: HTMLElement, name: string, field: HTMLElement): void {
    const label = document.createElement('label'),
      text = document.createElement('span');
    text.textContent = this.t(name);
    label.append(text, field);
    parent.append(label);
  }
  private number(
    parent: HTMLElement,
    label: string,
    key: NumberKey,
    min: number,
    max: number,
    unit = 'px',
  ): void {
    const input = document.createElement('input'),
      wrapper = document.createElement('div'),
      suffix = document.createElement('span');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '0.5';
    input.setAttribute('aria-label', this.t(label));
    wrapper.className = 'number-field';
    suffix.textContent = unit;
    suffix.setAttribute('aria-hidden', 'true');
    wrapper.append(input, suffix);
    this.row(parent, label, wrapper);
    this.fields.set(key, input);
    input.addEventListener('input', () => {
      const valid = input.value !== '' && input.validity.valid;
      this.validate(input, valid);
      if (valid) this.set({ [key]: input.valueAsNumber });
    });
    input.addEventListener('blur', () => this.restoreInvalid(input, key));
  }
  private color(parent: HTMLElement, label: string, hexLabel: string, key: ColorKey): void {
    const swatch = document.createElement('input'),
      hex = document.createElement('input'),
      wrapper = document.createElement('div');
    swatch.type = 'color';
    swatch.setAttribute('aria-label', this.t(label));
    hex.className = 'hex';
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.setAttribute('aria-label', this.t(hexLabel));
    wrapper.className = 'background';
    wrapper.append(swatch, hex);
    this.row(parent, label, wrapper);
    this.fields.set(key, hex);
    this.swatches.set(key, swatch);
    swatch.addEventListener('focus', () => this.checkpoint());
    swatch.addEventListener('input', () => {
      hex.value = swatch.value.toUpperCase();
      this.validate(hex, true);
      this.set({ [key]: hex.value }, false);
    });
    hex.addEventListener('input', () => {
      const color = normalizeColor(hex.value);
      this.validate(hex, !!color);
      if (color) {
        swatch.value = color;
        this.set({ [key]: color });
      }
    });
    hex.addEventListener('blur', () => this.restoreInvalid(hex, key));
  }
  private set(patch: Partial<ImageStyle>, remember = true): void {
    if (
      !this.layerId ||
      Object.entries(patch).every(([key, value]) => this.style[key as keyof ImageStyle] === value)
    )
      return;
    this.style = { ...this.style, ...patch };
    this.preset.value = imagePreset(this.style);
    this.change(patch, remember);
  }
  private validate(input: HTMLInputElement, valid: boolean): void {
    input.setAttribute('aria-invalid', String(!valid));
    if (valid) this.invalid.delete(input);
    else this.invalid.add(input);
    this.validityChanged();
  }
  private restoreInvalid(input: HTMLInputElement, key: keyof ImageStyle): void {
    if (this.invalid.has(input)) {
      input.value = String(this.style[key]);
      this.validate(input, true);
    }
  }
  private render(): void {
    this.invalid.clear();
    this.preset.value = imagePreset(this.style);
    for (const [key, field] of this.fields) {
      field.value = String(this.style[key]);
      field.setAttribute('aria-invalid', 'false');
    }
    for (const [key, swatch] of this.swatches) swatch.value = this.style[key];
  }
  sync(layer?: Layer): void {
    this.layerId = layer?.id ?? '';
    this.style = layer ? getImageStyle(layer) : { ...DEFAULT_IMAGE_STYLE };
    this.render();
  }
  get valid(): boolean {
    return this.invalid.size === 0;
  }
  setEnabled(enabled: boolean): void {
    this.button.disabled = !enabled;
    this.preset.disabled = !enabled;
    for (const input of [...this.fields.values(), ...this.swatches.values()])
      input.disabled = !enabled;
    if (!this.layerId) this.hide();
  }
  hide(): void {
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }
  position(): void {
    if (this.panel.hidden) return;
    this.panel.style.left = '0px';
    const box = this.panel.getBoundingClientRect(),
      dialog = this.host.closest('dialog')!.getBoundingClientRect();
    this.panel.style.left = `${Math.max(dialog.left + 12 - box.left, Math.min(0, dialog.right - 12 - box.right))}px`;
    this.panel.style.maxHeight = `${Math.max(120, dialog.bottom - box.top - 14)}px`;
  }
}
