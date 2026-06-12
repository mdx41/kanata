import { createAdminImagePicker } from '../admin-shared/image-picker';
import { initAdminContentBitsImagesEditor } from './images-editor';

type AdminContentBootstrap = {
  endpoint: string;
  collection: 'essay' | 'bits';
  entryId: string;
  revision: string;
};

type AdminContentIssue = {
  path: string;
  message: string;
};

type AdminContentWriteResult = {
  changed: boolean;
  written: boolean;
  changedFields: string[];
  relativePath: string;
};

const adminContentRoot = document.querySelector<HTMLElement>('[data-admin-content-root]');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBootstrap = (value: string): AdminContentBootstrap | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    const endpoint = typeof parsed.endpoint === 'string' ? parsed.endpoint.trim() : '';
    const collection = parsed.collection === 'essay' || parsed.collection === 'bits' ? parsed.collection : null;
    const entryId = typeof parsed.entryId === 'string' ? parsed.entryId.trim() : '';
    const revision = typeof parsed.revision === 'string' ? parsed.revision.trim() : '';
    if (!endpoint || !collection || !entryId || !revision) return null;

    return {
      endpoint,
      collection,
      entryId,
      revision
    };
  } catch {
    return null;
  }
};

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const getPayloadErrors = (value: unknown): string[] =>
  isRecord(value) ? getStringArray(value.errors) : [];

const getPayloadIssues = (value: unknown): AdminContentIssue[] => {
  if (!isRecord(value) || !Array.isArray(value.issues)) return [];

  return value.issues
    .filter((item): item is AdminContentIssue => isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string')
    .map((item) => ({
      path: item.path.trim(),
      message: item.message.trim()
    }));
};

const getPayloadRevision = (value: unknown): string | null => {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const revision = value.payload.revision;
  return typeof revision === 'string' && revision.trim().length > 0 ? revision.trim() : null;
};

const getPayloadResult = (value: unknown): AdminContentWriteResult | null => {
  if (!isRecord(value) || !isRecord(value.result)) return null;
  return {
    changed: value.result.changed === true,
    written: value.result.written === true,
    changedFields: getStringArray(value.result.changedFields),
    relativePath: typeof value.result.relativePath === 'string' ? value.result.relativePath.trim() : ''
  };
};

if (!adminContentRoot) {
  // Current page does not mount the admin content console.
} else {
  const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

  const statusLiveEl = byId<HTMLElement>('admin-content-status-live');
  const statusEl = byId<HTMLElement>('admin-content-status');
  const bootstrapEl = byId<HTMLDivElement>('admin-content-bootstrap');
  const editorForm = byId<HTMLFormElement>('admin-content-editor-form');
  const errorBannerEl = byId<HTMLElement>('admin-content-editor-error-banner');
  const errorTitleEl = byId<HTMLElement>('admin-content-editor-error-title');
  const errorMessageEl = byId<HTMLElement>('admin-content-editor-error-message');
  const errorListEl = byId<HTMLElement>('admin-content-editor-error-list');
  const previewEl = byId<HTMLElement>('admin-content-write-preview');
  const previewTitleEl = byId<HTMLElement>('admin-content-write-preview-title');
  const previewBodyEl = byId<HTMLElement>('admin-content-write-preview-body');
  const previewListEl = byId<HTMLElement>('admin-content-write-preview-list');
  const dryRunBtn = byId<HTMLButtonElement>('admin-content-dry-run');
  const saveBtn = byId<HTMLButtonElement>('admin-content-save');

  const setStatus = (
    state: 'idle' | 'loading' | 'ready' | 'ok' | 'warn' | 'error',
    text: string,
    options: {
      announce?: boolean;
    } = {}
  ) => {
    if (!(statusEl instanceof HTMLElement) || !(statusLiveEl instanceof HTMLElement)) return;
    const { announce = true } = options;
    statusEl.dataset.state = state;
    statusEl.textContent = text;
    statusLiveEl.textContent = announce ? text : '';
  };

  const clearPreview = () => {
    if (!(previewEl instanceof HTMLElement) || !(previewTitleEl instanceof HTMLElement) || !(previewBodyEl instanceof HTMLElement) || !(previewListEl instanceof HTMLElement)) {
      return;
    }

    previewEl.hidden = true;
    previewTitleEl.textContent = '';
    previewBodyEl.textContent = '';
    previewListEl.replaceChildren();
  };

  const clearFieldErrors = () => {
    adminContentRoot.querySelectorAll<HTMLElement>('[data-field-error]').forEach((element) => {
      element.hidden = true;
      element.textContent = '';
    });
    adminContentRoot.querySelectorAll<HTMLElement>('[data-field-path]').forEach((element) => {
      element.classList.remove('is-invalid');
    });
  };

  const clearErrors = () => {
    clearFieldErrors();
    if (!(errorBannerEl instanceof HTMLElement) || !(errorTitleEl instanceof HTMLElement) || !(errorMessageEl instanceof HTMLElement) || !(errorListEl instanceof HTMLElement)) {
      return;
    }

    errorBannerEl.hidden = true;
    errorTitleEl.textContent = 'frontmatter は書き込まれていません';
    errorMessageEl.hidden = true;
    errorMessageEl.textContent = '';
    errorListEl.hidden = true;
    errorListEl.replaceChildren();
  };

  const setIssues = (issues: readonly AdminContentIssue[]) => {
    clearFieldErrors();
    for (const issue of issues) {
      const field = adminContentRoot.querySelector<HTMLElement>(`[data-field-path="${issue.path}"]`);
      const fieldError = adminContentRoot.querySelector<HTMLElement>(`[data-field-error="${issue.path}"]`);
      field?.classList.add('is-invalid');
      if (fieldError) {
        fieldError.hidden = false;
        fieldError.textContent = issue.message;
      }
    }
  };

  const setErrors = (
    errors: readonly string[],
    issues: readonly AdminContentIssue[] = [],
    options: {
      title?: string;
      message?: string;
    } = {}
  ) => {
    if (!(errorBannerEl instanceof HTMLElement) || !(errorTitleEl instanceof HTMLElement) || !(errorMessageEl instanceof HTMLElement) || !(errorListEl instanceof HTMLElement)) {
      return;
    }

    setIssues(issues);
    errorTitleEl.textContent = options.title ?? 'frontmatter は書き込まれていません';
    if (options.message) {
      errorMessageEl.hidden = false;
      errorMessageEl.textContent = options.message;
    } else {
      errorMessageEl.hidden = true;
      errorMessageEl.textContent = '';
    }

    errorListEl.replaceChildren();
    if (errors.length > 0) {
      const fragment = document.createDocumentFragment();
      for (const error of errors) {
        const item = document.createElement('li');
        item.className = 'admin-banner__list-item';
        item.textContent = error;
        fragment.appendChild(item);
      }
      errorListEl.appendChild(fragment);
      errorListEl.hidden = false;
    } else {
      errorListEl.hidden = true;
    }

    errorBannerEl.hidden = false;
  };

  adminContentRoot.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest<HTMLButtonElement>('[data-admin-copy-button]');
    if (!(button instanceof HTMLButtonElement)) return;

    const copyText = button.dataset.copyText?.trim() ?? '';
    const copyLabel = button.dataset.copyLabel?.trim() ?? '内容';
    if (!copyText) {
      setStatus('error', `${copyLabel} が空のためコピーできません`);
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
      setStatus('ok', `コピーしました: ${copyLabel}`);
    } catch {
      setStatus('warn', `ブラウザのクリップボードが使えません。手動でコピーしてください: ${copyLabel}`);
    }
  });

  if (
    !(bootstrapEl instanceof HTMLDivElement)
    || !(editorForm instanceof HTMLFormElement)
    || !(dryRunBtn instanceof HTMLButtonElement)
    || !(saveBtn instanceof HTMLButtonElement)
  ) {
    setStatus('idle', '項目の選択またはパスのコピー待ち', { announce: false });
  } else {
    const bootstrap = parseBootstrap(bootstrapEl.textContent ?? '');
    if (!bootstrap) {
      setStatus('error', 'コンテンツ管理の初期化に失敗しました');
    } else {
      let currentRevision = bootstrap.revision;
      let busy = false;
      const imagePicker = createAdminImagePicker();

      if (bootstrap.collection === 'bits') {
        initAdminContentBitsImagesEditor({
          root: adminContentRoot,
          picker: imagePicker,
          setStatus
        });
      }

      const syncButtons = () => {
        dryRunBtn.disabled = busy;
        saveBtn.disabled = busy;
      };

      const collectFrontmatter = () => {
        const formData = new FormData(editorForm);
        const getText = (name: string) => String(formData.get(name) ?? '');

        if (bootstrap.collection === 'essay') {
          return {
            title: getText('title'),
            description: getText('description'),
            date: getText('date'),
            tagsText: getText('tagsText'),
            draft: formData.get('draft') !== null,
            archive: formData.get('archive') !== null,
            slug: getText('slug'),
            cover: getText('cover'),
            badge: getText('badge')
          };
        }

        return {
          title: getText('title'),
          description: getText('description'),
          date: getText('date'),
          tagsText: getText('tagsText'),
          draft: formData.get('draft') !== null,
          authorName: getText('authorName'),
          authorAvatar: getText('authorAvatar'),
          imagesText: getText('imagesText')
        };
      };

      const renderPreview = (result: AdminContentWriteResult, mode: 'dry-run' | 'write') => {
        if (!(previewEl instanceof HTMLElement) || !(previewTitleEl instanceof HTMLElement) || !(previewBodyEl instanceof HTMLElement) || !(previewListEl instanceof HTMLElement)) {
          return;
        }

        previewTitleEl.textContent = mode === 'dry-run' ? 'dry-run 結果' : '書き込み結果';
        previewBodyEl.textContent = result.changed
          ? `${result.relativePath || '現在の項目'} は以下の項目を更新します。`
          : '現在の frontmatter はディスク上のファイルと一致しているため、書き込みは不要です。';
        previewListEl.replaceChildren();

        const fragment = document.createDocumentFragment();
        if (result.changedFields.length === 0) {
          const item = document.createElement('li');
          item.className = 'admin-content-editor__preview-item';
          item.textContent = '項目の変更は見つかりませんでした。';
          fragment.appendChild(item);
        } else {
          for (const field of result.changedFields) {
            const item = document.createElement('li');
            item.className = 'admin-content-editor__preview-item';
            item.textContent = field;
            fragment.appendChild(item);
          }
        }

        previewListEl.appendChild(fragment);
        previewEl.hidden = false;
      };

      const requestWrite = async (dryRun: boolean) => {
        busy = true;
        syncButtons();
        clearErrors();
        clearPreview();
        setStatus('loading', dryRun ? 'dry-run を実行しています' : 'frontmatter を書き込んでいます');

        try {
          const response = await fetch(
            dryRun ? `${bootstrap.endpoint}?dryRun=1` : bootstrap.endpoint,
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json; charset=utf-8'
              },
              cache: 'no-store',
              body: JSON.stringify({
                collection: bootstrap.collection,
                entryId: bootstrap.entryId,
                revision: currentRevision,
                frontmatter: collectFrontmatter()
              })
            }
          );

          const payload = await parseResponseBody(response);
          const nextRevision = getPayloadRevision(payload);
          if (nextRevision && response.ok) {
            currentRevision = nextRevision;
          }

          if (!response.ok || !isRecord(payload) || payload.ok !== true) {
            const issues = getPayloadIssues(payload);
            setStatus(response.status === 409 ? 'warn' : 'error', dryRun ? 'dry-run 未通过' : '書き込みに失敗しました');
            setErrors(
              getPayloadErrors(payload).length > 0
                ? getPayloadErrors(payload)
                : [dryRun ? 'dry-run の検証に失敗しました。現在のフォームとディスク状態を確認してください' : 'frontmatter の書き込みに失敗しました。レスポンスとコンソールログを確認してください'],
              issues,
              {
                title: response.status === 409 ? '外部更新を検出しました' : 'frontmatter は書き込まれていません',
                ...(response.status === 409 ? { message: '現在の項目を更新し、最新内容を確認してから編集を続けてください。' } : {})
              }
            );
            return;
          }

          const result = getPayloadResult(payload);
          if (!result) {
            setStatus('error', '書き込みレスポンスに結果概要がありません');
            setErrors(['レスポンス本文に result フィールドがありません。開発ログを確認してください']);
            return;
          }

          renderPreview(result, dryRun ? 'dry-run' : 'write');
          if (dryRun) {
            setStatus(result.changed ? 'ok' : 'ready', result.changed ? 'dry-run の検証が完了しました' : '現在、変更はありません');
            return;
          }

          if (!result.changed) {
            setStatus('ready', '現在の frontmatter に変更はありません');
            return;
          }

          setStatus('ok', 'frontmatter を書き込みました。現在の項目を更新しています');
          window.setTimeout(() => {
            window.location.reload();
          }, 320);
        } catch {
          setStatus('error', dryRun ? 'dry-run リクエストに失敗しました' : '書き込みリクエストに失敗しました');
          setErrors([dryRun ? 'dry-run リクエストに失敗しました，しばらくしてから再試行してください' : '書き込みリクエストに失敗しました，しばらくしてから再試行してください']);
        } finally {
          busy = false;
          syncButtons();
        }
      };

      dryRunBtn.addEventListener('click', () => {
        void requestWrite(true);
      });

      saveBtn.addEventListener('click', () => {
        void requestWrite(false);
      });

      syncButtons();
      setStatus('idle', '項目の選択、パスのコピー、または dry-run の実行待ち', { announce: false });
    }
  }
}
