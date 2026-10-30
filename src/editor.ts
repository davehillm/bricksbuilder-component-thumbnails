import { Api, ApiError } from './api';
import { Adapter } from './adapter';
import { canvasBlob, captureComponent } from './capture';
import { drawLayer } from './draw';
import { ImageStyleControls } from './style-controls';
import {
  copyRecipe,
  DEFAULT_BACKGROUND,
  fitLayer,
  HEIGHT,
  History,
  getImageStyle,
  imageShadow,
  imageStyle,
  MAX_LAYERS,
  moveLayer,
  normalizeColor,
  resizeLayer,
  WIDTH,
} from './model';
import type { Config, ImageStyle, Layer, Project, Recipe } from './model';
import styles from './editor.css';
import { icon } from './icons';

export class Editor {
  readonly host = document.createElement('div');
  readonly root = this.host.attachShadow({ mode: 'open' });
  private dialog: HTMLDialogElement;
  private stage: HTMLDivElement;
  private wrap: HTMLDivElement;
  private strip: HTMLDivElement;
  private error: HTMLDivElement;
  private status: HTMLDivElement;
  private targetInput: HTMLInputElement;
  private results: HTMLDivElement;
  private color: HTMLInputElement;
  private hex: HTMLInputElement;
  private styleControls: ImageStyleControls;
  private captureBar: HTMLDivElement;
  private applyButton: HTMLButtonElement;
  private history = new History();
  private project: Project = {
    revision: 0,
    background: DEFAULT_BACKGROUND,
    layers: [],
    appliedUrl: '',
    appliedUpdated: 0,
    attachmentId: 0,
  };
  private recipe: Recipe = copyRecipe(this.project);
  private componentId = '';
  private selectedId = '';
  private images = new Map<string, { image: HTMLImageElement; url: string }>();
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stamp = 0;
  private dirty = false;
  private busy = false;
  private captureController: AbortController | null = null;
  private loadController: AbortController | null = null;
  private invalidColor = false;
  private scale = 1;
  private suspended = false;
  private focusBefore: HTMLElement | null = null;
  private drag: { id: string; layer: Layer; x: number; y: number; resize: boolean } | null = null;
  private api: Api;
  private adapter: Adapter;
  private buttons = new Map<string, HTMLButtonElement>();
  private resizeObserver: ResizeObserver;

  constructor(
    private config: Config,
    adapter: Adapter,
    api: Api,
  ) {
    this.adapter = adapter;
    this.api = api;
    this.host.dataset.ctstudioUi = 'editor';
    // THESIS: Native Bricks component preview composition, with direct image manipulation.
    // OWN-WORLD: Bricks builder tokens, system controls, one restrained accent, editable canvas color.
    // STORY: Capture the actual component, arrange its views, apply a durable native thumbnail.
    // FIRST VIEWPORT: Native popup header and toolbar, large 3:2 canvas, compact image strip.
    // FORM: Precise extension of the existing Bricks component manager; user-pinned direction.
    // FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
    this.root.innerHTML = `<style>${styles}</style><dialog aria-labelledby="ctstudio-title"><header class="header"><h2 id="ctstudio-title"></h2><div class="header-actions"></div></header><div class="toolbar"><div class="target"><input type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="ctstudio-results"><div id="ctstudio-results" class="results" role="listbox" hidden></div></div><div class="background"><input type="color"><input class="hex" maxlength="7" spellcheck="false"></div><div class="tools"></div><div class="spacer"></div><div class="group actions"></div></div><div class="error" role="alert" hidden></div><div class="stage-wrap"><div class="stage" tabindex="0"></div></div><footer class="footer"><div class="filmstrip"></div><div class="group"><span class="dimensions">1200 × 800</span><div class="status" role="status" aria-live="polite"></div></div></footer></dialog><div class="capture-bar" hidden><span></span></div><div class="notice" role="status" hidden></div>`;
    this.dialog = this.el('dialog');
    this.stage = this.el('.stage');
    this.wrap = this.el('.stage-wrap');
    this.strip = this.el('.filmstrip');
    this.error = this.el('.error');
    this.status = this.el('.status');
    this.targetInput = this.el('.target input');
    this.results = this.el('.results');
    this.color = this.el('input[type=color]');
    this.hex = this.el('.hex');
    this.captureBar = this.el('.capture-bar');
    this.el('h2').textContent = this.t('Thumbnail');
    this.targetInput.setAttribute('aria-label', this.t('Component'));
    this.color.setAttribute('aria-label', this.t('Background color'));
    this.hex.setAttribute('aria-label', this.t('Background hex'));
    this.stage.setAttribute('aria-label', this.t('Thumbnail canvas'));
    this.strip.setAttribute('aria-label', this.t('Thumbnail images'));
    const headerActions = this.el('.header-actions');
    const expand = this.button(headerActions, 'expand', 'Fullscreen', () => {
      const expanded = this.dialog.classList.toggle('fullscreen');
      expand.setAttribute('aria-pressed', String(expanded));
      this.resize();
    });
    expand.setAttribute('aria-pressed', 'false');
    this.button(headerActions, 'close', 'Close', () => void this.close());
    const tools = this.el('.tools');
    this.button(tools, 'undo', 'Undo', () => this.travel(false));
    this.button(tools, 'redo', 'Redo', () => this.travel(true));
    this.separator(tools);
    this.button(tools, 'center', 'Center image', () =>
      this.changeSelected((l) => ({ ...l, x: (WIDTH - l.width) / 2, y: (HEIGHT - l.height) / 2 })),
    );
    this.button(tools, 'fit', 'Fit image', () => this.changeSelected((l) => fitLayer(l)));
    this.styleControls = new ImageStyleControls(
      tools,
      (key) => this.t(key),
      (style, remember) => this.setImageStyle(style, remember),
      () => this.history.push(this.recipe),
      () => this.updateButtons(),
    );
    this.button(tools, 'back', 'Send backward', () => this.reorder(-1));
    this.button(tools, 'front', 'Bring forward', () => this.reorder(1));
    this.button(tools, 'trash', 'Remove image', () => this.removeSelected());
    const actions = this.el('.actions');
    this.button(actions, 'plus', 'Add capture', () => void this.addCapture(), true);
    this.applyButton = this.button(actions, 'check', 'Apply', () => void this.apply(), true);
    this.applyButton.classList.add('primary');
    const more = document.createElement('div');
    more.className = 'more';
    actions.append(more);
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.hidden = true;
    more.append(menu);
    const moreButton = this.button(more, 'more', 'More actions', () => {
      menu.hidden = !menu.hidden;
      moreButton.setAttribute('aria-expanded', String(!menu.hidden));
    });
    moreButton.setAttribute('aria-haspopup', 'true');
    moreButton.setAttribute('aria-expanded', 'false');
    const release = this.button(
      menu,
      'camera',
      'Use automatic thumbnail',
      () => {
        menu.hidden = true;
        moreButton.setAttribute('aria-expanded', 'false');
        void this.release();
      },
      true,
    );
    release.className = '';
    this.button(
      this.captureBar,
      'camera',
      'Capture selected component',
      () => void this.capture(),
      true,
    ).classList.add('primary');
    this.button(this.captureBar, 'close', 'Cancel capture', () => {
      this.captureBar.hidden = true;
      this.suspended = false;
      this.show();
    });
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      void this.close();
    });
    this.dialog.addEventListener(
      'pointerdown',
      (event) => {
        if (!more.contains(event.target as Node)) {
          menu.hidden = true;
          moreButton.setAttribute('aria-expanded', 'false');
        }
        if (!this.styleControls.host.contains(event.target as Node)) this.styleControls.hide();
      },
      true,
    );
    this.targetInput.addEventListener('input', () => this.renderTargets());
    this.targetInput.addEventListener('focus', () => {
      this.targetInput.select();
      this.renderTargets();
    });
    this.targetInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hideTargets();
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.results.querySelector<HTMLButtonElement>('button')?.focus();
      }
    });
    this.targetInput.addEventListener('blur', () =>
      setTimeout(() => {
        if (!this.results.contains(this.root.activeElement)) this.hideTargets();
      }, 100),
    );
    this.color.addEventListener('pointerdown', () => this.history.push(this.recipe));
    this.color.addEventListener('input', () => this.setColor(this.color.value, false));
    this.hex.addEventListener('change', () => this.setColor(this.hex.value, true));
    this.hex.addEventListener('input', () => {
      this.invalidColor = !normalizeColor(this.hex.value);
      this.hex.setAttribute('aria-invalid', String(this.invalidColor));
      if (!this.invalidColor) this.setColor(this.hex.value, true);
      this.updateButtons();
    });
    this.stage.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.stage.addEventListener('pointermove', (e) => this.pointerMove(e));
    this.stage.addEventListener('pointerup', () => this.pointerEnd());
    this.stage.addEventListener('pointercancel', () => this.pointerEnd());
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      this.keydown(e as KeyboardEvent);
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.wrap);
    const keepAlive = setInterval(() => {
      if ((this.dialog.open || this.suspended) && !this.busy && this.componentId) {
        void this.api
          .keepAlive(this.componentId, this.history.captureIds(this.recipe))
          .catch((error) => {
            if (this.dialog.open) this.errorMessage(error);
          });
      }
    }, 240000);
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) return;
      clearInterval(keepAlive);
      clearTimeout(this.timer);
      this.captureController?.abort();
      this.loadController?.abort();
      this.resizeObserver.disconnect();
      this.releaseImages();
    });
    window.addEventListener('beforeunload', (event) => {
      if (this.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }
  private t(key: string): string {
    return this.config.strings[key] || key;
  }
  private el<T extends HTMLElement = HTMLDivElement>(selector: string): T {
    return this.root.querySelector(selector) as T;
  }
  private button(
    parent: HTMLElement,
    name: string,
    label: string,
    action: () => void,
    text = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = text ? '' : 'icon';
    button.setAttribute('aria-label', this.t(label));
    button.title = this.t(label);
    button.innerHTML = icon(name);
    if (text) {
      const span = document.createElement('span');
      span.textContent = this.t(label);
      button.append(span);
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    parent.append(button);
    this.buttons.set(label, button);
    return button;
  }
  private separator(parent: HTMLElement): void {
    const separator = document.createElement('span');
    separator.className = 'separator';
    separator.setAttribute('aria-hidden', 'true');
    parent.append(separator);
  }
  mount(): void {
    (document.querySelector('.brx-body.main') || document.body).append(this.host);
  }
  private show(): void {
    if (!this.dialog.open) this.dialog.showModal();
    this.render();
    this.resize();
    this.stage.focus();
  }
  private errorMessage(error: unknown): void {
    this.error.hidden = false;
    this.error.textContent = this.t(error instanceof Error ? error.message : String(error));
    this.setStatus('');
    if (error instanceof ApiError && error.status === 409) {
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.textContent = this.t('Reload latest');
      reload.addEventListener('click', () => {
        clearTimeout(this.timer);
        this.queue = Promise.resolve();
        this.dirty = false;
        void this.open(this.componentId);
      });
      this.error.append(reload);
    }
  }
  notice(text: string): void {
    const notice = this.el('.notice');
    notice.textContent = text;
    notice.hidden = false;
    setTimeout(() => {
      notice.hidden = true;
    }, 5000);
  }
  private setStatus(text: string): void {
    this.status.classList.toggle('success', text === 'Applied');
    this.status.replaceChildren();
    if (text === 'Applied') this.status.insertAdjacentHTML('beforeend', icon('check'));
    this.status.append(document.createTextNode(this.t(text)));
  }
  private clearError(): void {
    this.error.hidden = true;
    this.error.textContent = '';
  }
  async open(id: string, takeCapture = false): Promise<void> {
    if (this.busy) return;
    const controller = new AbortController(),
      timeout = setTimeout(
        () =>
          controller.abort(
            new Error(
              'The server could not be reached. Your arrangement is still open. Try again.',
            ),
          ),
        60000,
      );
    try {
      await this.flush();
      if (this.busy) return;
      this.loadController = controller;
      this.focusBefore = document.activeElement as HTMLElement;
      this.busy = true;
      this.clearError();
      this.setStatus('Loading…');
      if (!this.dialog.open) this.dialog.showModal();
      this.stage.style.opacity = '.5';
      this.stage.setAttribute('aria-busy', 'true');
      this.updateButtons();
      this.resize();
      const loaded = await this.api.load(id, controller.signal),
        images = await this.loadImages(id, loaded.project.layers, controller.signal);
      controller.signal.throwIfAborted();
      for (const [key, value] of this.images) if (!images.has(key)) URL.revokeObjectURL(value.url);
      this.images = images;
      this.componentId = id;
      this.project = loaded.project;
      this.recipe = copyRecipe(this.project);
      this.history.clear();
      this.selectedId = this.recipe.layers.at(-1)?.id || '';
      this.dirty = false;
      this.stamp = 0;
      this.loadController = null;
      clearTimeout(timeout);
      this.stage.style.opacity = '1';
      this.stage.removeAttribute('aria-busy');
      this.busy = false;
      this.suspended = false;
      this.captureBar.hidden = true;
      this.clearError();
      this.setStatus('');
      this.show();
      if (!this.config.screenshotsEnabled)
        this.errorMessage(
          new Error(
            this.t('Enable component screenshots in Bricks settings to display thumbnails.'),
          ),
        );
      if (loaded.restrictedSources)
        this.errorMessage(
          new Error(
            'Some captures belong to pages you cannot edit. Add a capture to start a new composition.',
          ),
        );
      if (takeCapture) await this.capture();
    } catch (error) {
      if (controller.signal.aborted && this.loadController !== controller) return;
      this.busy = false;
      if (this.componentId) this.show();
      this.errorMessage(error);
      this.updateButtons();
    } finally {
      clearTimeout(timeout);
      if (this.loadController === controller) {
        this.loadController = null;
        this.stage.style.opacity = '1';
        this.stage.removeAttribute('aria-busy');
      }
    }
  }
  private async loadImages(
    id: string,
    layers: Layer[],
    signal: AbortSignal,
  ): Promise<Map<string, { image: HTMLImageElement; url: string }>> {
    const next = new Map<string, { image: HTMLImageElement; url: string }>(),
      added: string[] = [];
    try {
      const ids = [...new Set(layers.map((l) => l.captureId))];
      for (let i = 0; i < ids.length; i += 2) {
        const batch = await Promise.allSettled(
          ids.slice(i, i + 2).map(async (captureId) => {
            signal.throwIfAborted();
            const cached = this.images.get(captureId);
            if (cached) {
              next.set(captureId, cached);
              return;
            }
            const blob = await this.api.image(id, captureId, signal),
              url = URL.createObjectURL(blob),
              image = new Image();
            added.push(url);
            image.src = url;
            await image.decode();
            signal.throwIfAborted();
            next.set(captureId, { image, url });
          }),
        );
        const failed = batch.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failed) throw failed.reason;
      }
      return next;
    } catch (error) {
      for (const url of added) URL.revokeObjectURL(url);
      throw error;
    }
  }
  private async storeImage(id: string, blob: Blob): Promise<void> {
    if (this.images.has(id)) return;
    const url = URL.createObjectURL(blob),
      image = new Image();
    image.src = url;
    try {
      await image.decode();
      this.images.set(id, { image, url });
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  private pruneImages(): void {
    const used = this.history.captureIds(this.recipe);
    for (const [id, asset] of this.images) {
      if (!used.has(id)) {
        URL.revokeObjectURL(asset.url);
        this.images.delete(id);
      }
    }
  }
  private releaseImages(): void {
    for (const asset of this.images.values()) URL.revokeObjectURL(asset.url);
    this.images.clear();
    this.stage.replaceChildren();
    this.strip.replaceChildren();
  }
  private render(): void {
    this.targetInput.value =
      this.adapter.components().find((c) => c.id === this.componentId)?.label || this.componentId;
    this.color.value = this.recipe.background;
    this.hex.value = this.recipe.background;
    this.hex.setAttribute('aria-invalid', 'false');
    this.invalidColor = false;
    this.syncImageStyle();
    this.renderStage();
    this.renderStrip();
    this.updateButtons();
  }
  private renderStage(vertical = false, horizontal = false): void {
    const resizeFocused = this.root.activeElement?.classList.contains('handle');
    this.stage.style.backgroundColor = this.recipe.background;
    this.stage.replaceChildren();
    this.recipe.layers.forEach((layer, index) => {
      const div = document.createElement('div');
      div.className = `layer${layer.id === this.selectedId ? ' selected' : ''}`;
      div.dataset.layer = layer.id;
      div.setAttribute('role', 'img');
      div.setAttribute('aria-label', this.t('Image %d').replace('%d', String(index + 1)));
      Object.assign(div.style, {
        left: `${layer.x * this.scale}px`,
        top: `${layer.y * this.scale}px`,
        width: `${layer.width * this.scale}px`,
        height: `${layer.height * this.scale}px`,
      });
      const source = this.images.get(layer.captureId);
      if (source) {
        const style = imageStyle(layer);
        const img = document.createElement('img');
        img.src = source.url;
        img.alt = '';
        img.draggable = false;
        img.style.borderRadius = `${style.radius * this.scale}px`;
        img.style.boxShadow = imageShadow(getImageStyle(layer), this.scale);
        div.append(img);
        const outline = document.createElement('div');
        outline.className = 'image-outline';
        Object.assign(outline.style, {
          borderWidth: `${style.width * this.scale}px`,
          borderColor: style.color,
          borderRadius: `${style.radius * this.scale}px`,
        });
        div.append(outline);
      }
      if (layer.id === this.selectedId) {
        const handle = document.createElement('button');
        handle.className = 'handle';
        handle.dataset.resize = 'true';
        handle.setAttribute('aria-label', this.t('Resize image'));
        handle.title = this.t('Resize image');
        div.append(handle);
      }
      this.stage.append(div);
    });
    if (!this.recipe.layers.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const rgb = [1, 3, 5]
        .map((i) => parseInt(this.recipe.background.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      empty.style.color =
        rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#202428' : '#FFFFFF';
      empty.textContent = this.t('Capture a component to begin.');
      this.stage.append(empty);
    }
    for (const name of [vertical ? 'vertical' : '', horizontal ? 'horizontal' : ''].filter(
      Boolean,
    )) {
      const guide = document.createElement('div');
      guide.className = `guide ${name}`;
      this.stage.append(guide);
    }
    if (resizeFocused)
      (this.stage.querySelector<HTMLButtonElement>('.handle') || this.stage).focus();
  }
  private renderStrip(): void {
    this.strip.replaceChildren();
    this.recipe.layers.forEach((layer, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = this.t('Image %d').replace('%d', String(index + 1));
      button.setAttribute('aria-label', this.t('Select image %d').replace('%d', String(index + 1)));
      button.setAttribute('aria-pressed', String(layer.id === this.selectedId));
      button.classList.toggle('selected', layer.id === this.selectedId);
      const source = this.images.get(layer.captureId);
      if (source) {
        const img = document.createElement('img');
        img.src = source.url;
        img.alt = '';
        button.append(img);
      }
      button.addEventListener('click', () => {
        this.selectedId = layer.id;
        this.renderStage();
        this.renderStrip();
        this.updateButtons();
        this.stage.focus();
      });
      this.strip.append(button);
    });
  }
  private resize(): void {
    if (!this.dialog.open) return;
    const box = this.wrap.getBoundingClientRect(),
      padding = window.innerWidth < 800 ? 36 : 64;
    this.scale = Math.max(
      0.05,
      Math.min((box.width - padding) / WIDTH, (box.height - padding) / HEIGHT),
    );
    this.stage.style.width = `${WIDTH * this.scale}px`;
    this.stage.style.height = `${HEIGHT * this.scale}px`;
    this.renderStage();
    this.styleControls.position();
  }
  private updateButtons(): void {
    if (this.styleControls.layerId !== this.selectedId) this.syncImageStyle();
    for (const label of [
      'Center image',
      'Fit image',
      'Bring forward',
      'Send backward',
      'Remove image',
    ]) {
      const button = this.buttons.get(label);
      if (button) button.disabled = this.busy || !this.selectedId;
    }
    this.buttons.get('Undo')!.disabled = this.busy || !this.history.canUndo;
    this.buttons.get('Redo')!.disabled = this.busy || !this.history.canRedo;
    this.buttons.get('Add capture')!.disabled =
      this.busy || this.recipe.layers.length >= MAX_LAYERS;
    this.buttons.get('Use automatic thumbnail')!.disabled = this.busy || !this.project.appliedUrl;
    this.applyButton.disabled =
      this.busy ||
      this.invalidColor ||
      !this.styleControls.valid ||
      !this.config.screenshotsEnabled ||
      !this.recipe.layers.length;
    this.targetInput.disabled = this.busy;
    this.color.disabled = this.busy;
    this.hex.disabled = this.busy;
    this.styleControls.setEnabled(!this.busy && !!this.selectedId);
  }
  private syncImageStyle(): void {
    this.styleControls.sync(this.recipe.layers.find((item) => item.id === this.selectedId));
  }
  private setImageStyle(style: Partial<ImageStyle>, remember: boolean): void {
    const layer = this.recipe.layers.find((item) => item.id === this.selectedId);
    if (this.busy || !layer) return;
    if (remember) this.history.push(this.recipe);
    this.recipe.layers = this.recipe.layers.map((item) =>
      item.id === layer.id ? { ...item, ...style } : item,
    );
    this.renderStage();
    this.changed();
  }
  private changed(): void {
    this.pruneImages();
    this.dirty = true;
    this.stamp++;
    this.setStatus('');
    this.updateButtons();
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.flush().catch((error) => this.errorMessage(error)),
      700,
    );
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.dirty || !this.componentId) {
      await this.queue;
      return;
    }
    const stamp = this.stamp,
      recipe = copyRecipe(this.recipe),
      id = this.componentId,
      retained = this.history.captureIds(recipe);
    const job = this.queue
      .catch(() => {})
      .then(async () => {
        this.setStatus('Saving…');
        const response = await this.api.save(id, recipe, this.project.revision, retained);
        this.project = response.project;
        if (this.stamp === stamp) this.dirty = false;
        this.setStatus(this.dirty ? '' : 'Saved');
      });
    this.queue = job;
    await job;
  }
  private setColor(value: string, remember: boolean): void {
    const normalized = normalizeColor(value);
    this.invalidColor = !normalized;
    this.hex.setAttribute('aria-invalid', String(this.invalidColor));
    if (!normalized) {
      this.updateButtons();
      return;
    }
    if (normalized === this.recipe.background) return;
    if (remember) this.history.push(this.recipe);
    this.recipe.background = normalized;
    this.color.value = normalized;
    this.hex.value = normalized;
    this.renderStage();
    this.changed();
  }
  private changeSelected(change: (layer: Layer) => Layer): void {
    if (this.busy || !this.selectedId) return;
    this.history.push(this.recipe);
    this.recipe.layers = this.recipe.layers.map((l) => (l.id === this.selectedId ? change(l) : l));
    this.renderStage();
    this.changed();
  }
  private reorder(direction: number): void {
    const index = this.recipe.layers.findIndex((l) => l.id === this.selectedId),
      next = index + direction;
    if (index < 0 || next < 0 || next >= this.recipe.layers.length) return;
    this.history.push(this.recipe);
    [this.recipe.layers[index], this.recipe.layers[next]] = [
      this.recipe.layers[next],
      this.recipe.layers[index],
    ];
    this.renderStage();
    this.renderStrip();
    this.changed();
  }
  private removeSelected(): void {
    if (!this.selectedId || this.busy) return;
    this.history.push(this.recipe);
    this.recipe.layers = this.recipe.layers.filter((l) => l.id !== this.selectedId);
    this.selectedId = this.recipe.layers.at(-1)?.id || '';
    this.renderStage();
    this.renderStrip();
    this.changed();
  }
  private travel(redo: boolean): void {
    if (this.busy) return;
    const next = redo ? this.history.redo(this.recipe) : this.history.undo(this.recipe);
    if (!next) return;
    this.recipe = next;
    if (!next.layers.some((l) => l.id === this.selectedId))
      this.selectedId = next.layers.at(-1)?.id || '';
    this.render();
    this.changed();
  }
  private pointerDown(event: PointerEvent): void {
    if (this.busy || event.button !== 0) return;
    event.preventDefault();
    const target = event.target as Element;
    const el = target.closest<HTMLElement>('[data-layer]');
    if (!el) {
      this.selectedId = '';
      this.renderStage();
      this.renderStrip();
      this.updateButtons();
      return;
    }
    const layer = this.recipe.layers.find((l) => l.id === el.dataset.layer);
    if (!layer) return;
    this.history.push(this.recipe);
    this.selectedId = layer.id;
    this.drag = {
      id: layer.id,
      layer: { ...layer },
      x: event.clientX,
      y: event.clientY,
      resize: !!target.closest('[data-resize]'),
    };
    this.stage.setPointerCapture(event.pointerId);
    this.stage.focus();
    this.renderStage();
    this.renderStrip();
    this.updateButtons();
  }
  private pointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    const dx = (event.clientX - this.drag.x) / this.scale,
      dy = (event.clientY - this.drag.y) / this.scale;
    const moved = this.drag.resize
      ? { layer: resizeLayer(this.drag.layer, dx, dy), vertical: false, horizontal: false }
      : moveLayer(this.drag.layer, dx, dy, !event.altKey);
    this.recipe.layers = this.recipe.layers.map((l) => (l.id === this.drag!.id ? moved.layer : l));
    this.renderStage(moved.vertical, moved.horizontal);
  }
  private pointerEnd(): void {
    if (!this.drag) return;
    this.drag = null;
    this.renderStage();
    this.changed();
  }
  private keydown(event: KeyboardEvent): void {
    if (!this.dialog.open) return;
    event.stopPropagation();
    const target = event.target as HTMLElement,
      input = target.matches('input,select,textarea');
    if (event.key === 'Tab') {
      const focusable = Array.from(
        this.dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),[tabindex="0"]',
        ),
      ).filter((el) => !el.closest('[hidden]'));
      const active = this.root.activeElement;
      if (event.shiftKey && active === focusable[0]) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && active === focusable.at(-1)) {
        event.preventDefault();
        focusable[0]?.focus();
      }
      return;
    }
    if (input || this.busy) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.travel(event.shiftKey);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.travel(true);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeSelected();
      return;
    }
    const amount = event.shiftKey ? 10 : 1,
      delta: Record<string, [number, number]> = {
        ArrowLeft: [-amount, 0],
        ArrowRight: [amount, 0],
        ArrowUp: [0, -amount],
        ArrowDown: [0, amount],
      };
    if (delta[event.key] && this.selectedId) {
      event.preventDefault();
      const [dx, dy] = delta[event.key];
      this.changeSelected((l) =>
        target.dataset.resize ? resizeLayer(l, dx, dy) : moveLayer(l, dx, dy, false).layer,
      );
    }
  }
  private renderTargets(): void {
    const query = this.targetInput.value.toLocaleLowerCase();
    this.results.replaceChildren();
    this.results.hidden = false;
    this.targetInput.setAttribute('aria-expanded', 'true');
    for (const component of this.adapter
      .components()
      .filter((c) => c.label.toLocaleLowerCase().includes(query))) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = component.label;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(component.id === this.componentId));
      button.addEventListener('click', () => {
        this.hideTargets();
        void this.assign(component.id);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next =
            event.key === 'ArrowDown' ? button.nextElementSibling : button.previousElementSibling;
          (next as HTMLElement | null)?.focus();
        }
        if (event.key === 'Escape') {
          this.hideTargets();
          this.targetInput.focus();
          event.preventDefault();
        }
      });
      this.results.append(button);
    }
    if (!this.results.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'empty-results';
      empty.textContent = this.t('No components found.');
      this.results.append(empty);
    }
  }
  private async assign(id: string): Promise<void> {
    if (this.busy || id === this.componentId) return;
    if (!this.recipe.layers.length) {
      await this.open(id);
      return;
    }
    try {
      await this.flush();
      if (this.busy) return;
      this.busy = true;
      this.clearError();
      this.setStatus('Saving…');
      this.updateButtons();
      const loaded = await this.api.load(id),
        recipe = copyRecipe(this.recipe);
      const images = new Map<string, { image: HTMLImageElement; url: string }>();
      const mapping = new Map<string, string>();
      for (const captureId of new Set(recipe.layers.map((layer) => layer.captureId))) {
        const asset = this.images.get(captureId);
        if (!asset) throw new Error('A source image is missing. Reopen the thumbnail.');
        const capture = await this.api.copy(id, this.componentId, captureId);
        mapping.set(captureId, capture.id);
        if (!images.has(capture.id)) images.set(capture.id, asset);
      }
      recipe.layers = recipe.layers.map((layer) => ({
        ...layer,
        captureId: mapping.get(layer.captureId)!,
      }));
      const response = await this.api.save(id, recipe, loaded.project.revision);
      const retained = new Set([...images.values()].map((asset) => asset.url));
      for (const asset of this.images.values())
        if (!retained.has(asset.url)) URL.revokeObjectURL(asset.url);
      this.images = images;
      this.componentId = id;
      this.project = response.project;
      this.recipe = recipe;
      this.history.clear();
      this.dirty = false;
      this.stamp = 0;
      this.setStatus('Saved');
      this.render();
    } catch (error) {
      this.errorMessage(error);
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }
  private hideTargets(): void {
    this.results.hidden = true;
    this.targetInput.setAttribute('aria-expanded', 'false');
    this.targetInput.value =
      this.adapter.components().find((c) => c.id === this.componentId)?.label || this.componentId;
  }
  private async addCapture(): Promise<void> {
    try {
      await this.flush();
      this.suspended = true;
      this.dialog.close();
      this.adapter.showBuilder();
      this.captureBar.querySelector('span')!.textContent =
        this.adapter.components().find((c) => c.id === this.componentId)?.label || this.componentId;
      this.captureBar.hidden = false;
    } catch (error) {
      this.errorMessage(error);
    }
  }
  async capture(): Promise<void> {
    if (this.busy) return;
    const target = this.adapter.selected();
    if (!target) {
      this.notice(this.t('No component selected.'));
      return;
    }
    if (!this.componentId) {
      await this.open(target.componentId, true);
      return;
    }
    if (this.recipe.layers.length >= MAX_LAYERS) {
      this.notice(this.t('A thumbnail can contain up to 12 images.'));
      return;
    }
    this.captureBar.hidden = true;
    this.suspended = false;
    this.show();
    this.busy = true;
    this.clearError();
    this.setStatus('Capturing…');
    this.updateButtons();
    const controller = new AbortController();
    this.captureController = controller;
    try {
      this.config.postId = this.adapter.postId();
      const blob = await captureComponent(target, controller.signal);
      if (controller.signal.aborted) return;
      const capture = await this.api.upload(this.componentId, blob, controller.signal);
      if (controller.signal.aborted) return;
      await this.storeImage(capture.id, blob);
      if (controller.signal.aborted) {
        if (!this.dialog.open) this.releaseImages();
        return;
      }
      this.history.push(this.recipe);
      const offset = this.recipe.layers.length * 20;
      const layer = fitLayer(
        {
          id: crypto.randomUUID(),
          captureId: capture.id,
          x: 0,
          y: 0,
          width: capture.width,
          height: capture.height,
        },
        this.recipe.layers.length ? 130 : 72,
      );
      layer.x += offset;
      layer.y += offset;
      this.recipe.layers.push(layer);
      this.selectedId = layer.id;
      this.render();
      this.changed();
      await this.flush();
    } catch (error) {
      if (!controller.signal.aborted) this.errorMessage(error);
    } finally {
      if (this.captureController === controller) {
        this.captureController = null;
        this.busy = false;
        this.updateButtons();
      }
    }
  }
  private async export(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The thumbnail canvas is unavailable.');
    context.fillStyle = this.recipe.background;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    for (const layer of this.recipe.layers) {
      const source = this.images.get(layer.captureId);
      if (!source) throw new Error('A source image is missing. Reopen the thumbnail.');
      drawLayer(context, source.image, layer);
    }
    try {
      return await canvasBlob(canvas);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  private async apply(): Promise<void> {
    if (this.busy || this.invalidColor) return;
    this.busy = true;
    this.clearError();
    this.updateButtons();
    try {
      await this.flush();
      this.setStatus('Saving…');
      const response = await this.api.apply(
        this.componentId,
        this.recipe,
        this.project.revision,
        await this.export(),
      );
      this.project = response.project;
      this.adapter.updateThumbnail(this.componentId, response.fileUrl, response.updated);
      this.setStatus('Applied');
    } catch (error) {
      this.errorMessage(error);
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }
  private async release(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.updateButtons();
    try {
      await this.flush();
      this.project = (await this.api.release(this.componentId, this.project.revision)).project;
      await this.adapter.automatic(this.componentId);
      this.setStatus('Saved');
    } catch (error) {
      this.errorMessage(error);
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }
  private async close(): Promise<void> {
    if (this.captureController || this.loadController) {
      this.captureController?.abort();
      this.loadController?.abort();
      this.captureController = null;
      this.loadController = null;
      this.busy = false;
      this.stage.style.opacity = '1';
      this.stage.removeAttribute('aria-busy');
      this.setStatus('');
    }
    if (this.busy) return;
    try {
      await this.flush();
      this.styleControls.hide();
      this.dialog.close();
      this.suspended = false;
      this.captureBar.hidden = true;
      this.history.clear();
      this.releaseImages();
      this.focusBefore?.focus();
    } catch (error) {
      this.errorMessage(error);
    }
  }
  async entryCapture(): Promise<void> {
    if (this.suspended) {
      await this.capture();
      return;
    }
    const id = this.adapter.selectedId();
    if (!id) {
      this.notice(this.t('No component selected.'));
      return;
    }
    await this.open(id, true);
  }
}
