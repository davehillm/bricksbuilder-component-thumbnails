import type { Config, Project, Recipe, Capture } from './model';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class Api {
  constructor(private config: Config) {}
  private form(
    operation: string,
    componentId: string,
    values: Record<string, string | Blob> = {},
  ): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      action: `ctstudio_${operation}`,
      nonce: this.config.nonce,
      postId: String(this.config.postId),
      componentId,
      ...values,
    }))
      data.append(key, value);
    return data;
  }
  private async request<T>(
    operation: string,
    componentId: string,
    values: Record<string, string | Blob> = {},
    external?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController(),
      abort = () => controller.abort(external?.reason),
      timer = setTimeout(
        () => controller.abort(new DOMException('The request timed out.', 'TimeoutError')),
        60000,
      );
    if (external?.aborted) abort();
    else external?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(this.config.ajaxUrl, {
        method: 'POST',
        credentials: 'same-origin',
        body: this.form(operation, componentId, values),
        signal: controller.signal,
      });
      let result: { success: boolean; data: T & { message?: string } } | number;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          'The server could not be reached. Your arrangement is still open. Try again.',
        );
      }
      if (typeof result === 'number')
        throw new ApiError('Your editor session expired. Reload Bricks to continue.', 403);
      if (!response.ok || !result.success)
        throw new ApiError(
          result.data?.message || 'The thumbnail could not be saved. Try again.',
          response.status,
        );
      return result.data;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    }
  }
  load(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ project: Project; restrictedSources?: boolean }> {
    return this.request('load', id, {}, signal);
  }
  keepAlive(id: string, captureIds: Set<string>): Promise<{ project: Project }> {
    return this.request('load', id, { captureIds: JSON.stringify([...captureIds]) });
  }
  upload(id: string, image: Blob, signal?: AbortSignal): Promise<Capture> {
    return this.request('upload_capture', id, { image }, signal);
  }
  copy(id: string, sourceComponentId: string, captureId: string): Promise<Capture> {
    return this.request('copy_capture', id, { sourceComponentId, captureId });
  }
  save(
    id: string,
    recipe: Recipe,
    revision: number,
    captureIds?: Set<string>,
  ): Promise<{ project: Project }> {
    return this.request('save', id, {
      recipe: JSON.stringify(recipe),
      revision: String(revision),
      ...(captureIds ? { captureIds: JSON.stringify([...captureIds]) } : {}),
    });
  }
  apply(
    id: string,
    recipe: Recipe,
    revision: number,
    image: Blob,
  ): Promise<{ project: Project; fileUrl: string; updated: number }> {
    return this.request('apply', id, {
      recipe: JSON.stringify(recipe),
      revision: String(revision),
      image,
    });
  }
  release(id: string, revision: number): Promise<{ project: Project }> {
    return this.request('release', id, { revision: String(revision) });
  }
  async image(id: string, captureId: string, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(this.config.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      body: this.form('capture_data', id, { captureId }),
      signal: signal || AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png'))
      throw new Error(
        'A source image could not be loaded. Reopen the thumbnail or capture it again.',
      );
    return response.blob();
  }
}
