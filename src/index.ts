import { Api } from './api';
import { Adapter } from './adapter';
import { Editor } from './editor';
import { icon } from './icons';
import type { Config } from './model';

declare global {
  interface Window {
    ctstudioConfig?: Config;
  }
}

const config = window.ctstudioConfig;
if (config && window === window.top) {
  const adapter = new Adapter(config),
    api = new Api(config);
  let editor: Editor | null = null,
    toolbar: HTMLLIElement | null = null,
    entry: HTMLButtonElement | null = null,
    pending = false;
  const entryStyle = `:host{display:inline-flex;align-items:center;vertical-align:middle}button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:30px;height:30px;padding:5px;border:0;border-radius:var(--builder-border-radius,4px);background:none;color:var(--builder-color,#202428);cursor:pointer}button:hover:not(:disabled){background:var(--builder-bg-3,#e8eaf0)}button:disabled{opacity:.35;cursor:default}button:focus-visible{outline:2px solid var(--builder-color-accent,#d52689);outline-offset:2px}svg{height:17px;width:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}`;
  const action = (
    label: string,
    click: () => void,
  ): { host: HTMLSpanElement; button: HTMLButtonElement } => {
    const host = document.createElement('span'),
      shadow = host.attachShadow({ mode: 'open' }),
      style = document.createElement('style'),
      button = document.createElement('button');
    style.textContent = entryStyle;
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = icon('camera');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      click();
    });
    shadow.append(style, button);
    return { host, button };
  };
  const refresh = () => {
    if (!editor) return;
    const list = document.querySelector('#bricks-toolbar-top li')?.parentElement;
    if (list && !toolbar?.isConnected) {
      toolbar = document.createElement('li');
      toolbar.className = 'ctstudio-toolbar-entry';
      toolbar.setAttribute(
        'data-balloon',
        config.strings['Capture thumbnail'] || 'Capture thumbnail',
      );
      const control = action(
        config.strings['Capture thumbnail'] || 'Capture thumbnail',
        () => void editor!.entryCapture(),
      );
      entry = control.button;
      toolbar.append(control.host);
      list.append(toolbar);
    }
    if (entry) {
      const selected = adapter.selectedId();
      entry.disabled = !selected;
      entry.title = selected
        ? `${config.strings['Capture thumbnail'] || 'Capture thumbnail'}: ${adapter.components().find((c) => c.id === selected)?.label || selected}`
        : config.strings['No component selected.'] || 'No component selected.';
    }
    const components = adapter.components();
    for (const item of document.querySelectorAll<HTMLElement>(
      '.bricks-popup.browser .browser-content.components .bricks-layout-item',
    )) {
      const existing = item.querySelector<HTMLElement>('[data-ctstudio-gallery]');
      const label = item.querySelector('.title')?.textContent?.trim(),
        matches = components.filter((c) => c.label === label),
        component =
          matches.length === 1
            ? matches[0]
            : matches.find(
                (c) =>
                  c.thumbnail && c.thumbnail === item.querySelector('img')?.getAttribute('src'),
              ),
        actions = item.querySelector('.title-actions');
      if (!component || !actions || !actions.querySelector('.button.edit')) {
        existing?.remove();
        continue;
      }
      if (existing?.dataset.ctstudioGallery === component.id) {
        const button = existing.shadowRoot?.querySelector('button');
        if (button) {
          button.title = `${config.strings['Edit thumbnail'] || 'Edit thumbnail'}: ${component.label}`;
          button.setAttribute('aria-label', button.title);
        }
        continue;
      }
      existing?.remove();
      const control = action(
        `${config.strings['Edit thumbnail'] || 'Edit thumbnail'}: ${component.label}`,
        () => void editor!.open(component.id),
      );
      control.host.dataset.ctstudioGallery = component.id;
      actions.append(control.host);
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      refresh();
    });
  };
  let attempts = 0;
  const start = () => {
    if (!adapter.supported()) {
      if (++attempts < 200) setTimeout(start, 100);
      else console.warn('[Component Thumbnail Studio] The Bricks editor adapter is unavailable.');
      return;
    }
    editor = new Editor(config, adapter, api);
    editor.mount();
    refresh();
    const observer = new MutationObserver(schedule);
    observer.observe(document.querySelector('.brx-body.main') || document.body, {
      subtree: true,
      childList: true,
    });
    const globals = adapter.globals();
    const unwatch = globals?.$_watch?.(
      () => [globals.$_state.activeId, globals.$_state.activeComponent?.id],
      schedule,
    );
    const polling = unwatch ? undefined : setInterval(schedule, 1000);
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) return;
      observer.disconnect();
      unwatch?.();
      clearInterval(polling);
    });
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
