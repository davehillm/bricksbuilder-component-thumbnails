import type { Component, Config } from './model';

interface BricksElement {
  id: string;
  cid?: string;
  label?: string;
}
interface BricksComponent {
  id: string;
  elements?: BricksElement[];
  thumbnail?: string;
  thumbnailUpdated?: number;
}
interface BricksState {
  activeId?: string;
  activeElement?: BricksElement;
  activeComponent?: BricksComponent;
  componentInstanceId?: string;
  componentPreviewInstance?: BricksElement;
  components: BricksComponent[];
  postId?: number;
  popup?: string;
  isBroadcasting?: number | boolean;
}
interface Globals {
  $_state: BricksState;
  $_getDynamicElementById?: (id: string) => BricksElement | undefined;
  $_getElementNode?: (element: BricksElement, context: string) => HTMLElement | null;
  $_getComponentById?: (id: string) => BricksComponent;
  $_generateComponentScreenshot?: (
    id: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  $_watch?: (get: () => unknown, cb: () => void) => () => void;
}
interface VueRoot extends HTMLElement {
  __vue_app__?: { config: { globalProperties: Globals } };
  __vueParentComponent?: { appContext: { config: { globalProperties: Globals } } };
}
export interface Target {
  componentId: string;
  node: HTMLElement;
  document: Document;
}

export class Adapter {
  constructor(private config: Config) {}
  globals(): Globals | null {
    const root =
      document.querySelector<VueRoot>('.brx-body.main') ||
      document.querySelector<VueRoot>('.brx-body');
    return (
      root?.__vue_app__?.config.globalProperties ||
      root?.__vueParentComponent?.appContext.config.globalProperties ||
      null
    );
  }
  supported(): boolean {
    return /^2\.4\./.test(this.config.bricksVersion) && !!this.globals()?.$_state;
  }
  postId(): number {
    return this.globals()?.$_state.postId || this.config.postId;
  }
  components(): Component[] {
    const items = this.globals()?.$_state.components;
    if (!Array.isArray(items)) return this.config.components;
    return items.map((c) => ({
      id: c.id,
      label:
        c.elements?.find((e) => e.id === c.id)?.label ||
        this.config.components.find((s) => s.id === c.id)?.label ||
        c.id,
      thumbnail: c.thumbnail || '',
    }));
  }
  selectedId(): string | null {
    const g = this.globals(),
      state = g?.$_state;
    if (!state) return null;
    const selected = state.activeId ? g?.$_getDynamicElementById?.(state.activeId) : undefined;
    return (
      state.activeComponent?.id ||
      selected?.cid ||
      (state.activeElement?.id === state.activeId ? state.activeElement?.cid : null) ||
      null
    );
  }
  selected(): Target | null {
    const g = this.globals(),
      state = g?.$_state,
      componentId = this.selectedId();
    const frame = document.getElementById('bricks-builder-iframe') as HTMLIFrameElement | null;
    const doc = frame?.contentDocument;
    if (!state || !componentId || !doc) return null;
    const selected = state.activeId ? g?.$_getDynamicElementById?.(state.activeId) : undefined;
    const ids = (
      state.activeComponent
        ? [
            state.componentInstanceId,
            state.componentPreviewInstance?.id,
            state.activeId,
            componentId,
          ]
        : [state.activeId, selected?.id, componentId]
    ).filter(Boolean) as string[];
    let node: HTMLElement | null = null;
    const nativeNode = selected ? g?.$_getElementNode?.(selected, 'iframe') : null;
    if (nativeNode) {
      let candidate = nativeNode.closest<HTMLElement>('[data-component]');
      while (candidate && candidate.dataset.scriptId !== componentId)
        candidate = candidate.parentElement?.closest<HTMLElement>('[data-component]') || null;
      node = candidate;
    }
    for (const id of ids) {
      if (node) break;
      const candidate = doc.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
      let root = candidate?.closest<HTMLElement>('[data-component]');
      while (root && root.dataset.scriptId !== componentId)
        root = root.parentElement?.closest<HTMLElement>('[data-component]') || null;
      if (root && root.getBoundingClientRect().width > 0) {
        node = root;
        break;
      }
    }
    node ||= doc.querySelector<HTMLElement>(`[data-component="${CSS.escape(componentId)}"]`);
    if (!node || node.getBoundingClientRect().width < 1 || node.getBoundingClientRect().height < 1)
      return null;
    return { componentId, node, document: doc };
  }
  showBuilder(): void {
    const state = this.globals()?.$_state;
    if (state?.popup) state.popup = '';
  }
  updateThumbnail(id: string, url: string, updated: number): void {
    const g = this.globals(),
      component = g?.$_getComponentById?.(id) || g?.$_state.components.find((c) => c.id === id);
    if (!component || !g) return;
    const previous = g.$_state.isBroadcasting;
    g.$_state.isBroadcasting = Date.now();
    component.thumbnail = url;
    component.thumbnailUpdated = updated;
    queueMicrotask(() => {
      g.$_state.isBroadcasting = previous;
    });
    const summary = this.config.components.find((c) => c.id === id);
    if (summary) summary.thumbnail = url;
  }
  async automatic(id: string): Promise<void> {
    const generate = this.globals()?.$_generateComponentScreenshot;
    if (!generate) throw new Error('Automatic capture is unavailable in this Bricks version.');
    await generate(id, { skipSave: true, showMessage: true });
  }
}
