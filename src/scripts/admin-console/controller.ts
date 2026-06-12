import type {
  ThemeSettingsEditableErrorState,
  ThemeSettingsEditablePayload
} from '@/lib/theme-settings';
import type { AdminThemeControls } from './controls';
import type { createFormCodec, EditableSettings } from './form-codec';
import { createInvalidSettingsBannerItems } from './invalid-settings-banner';
import type { createAdminConsoleUiState } from './ui-state';
import type { createValidation, ValidationIssue } from './validation';
import {
  extractInvalidSettingsState,
  extractSettingsPayload,
  getPayloadErrors,
  getPayloadMessage,
  isRecord,
  requestSettingsWrite
} from './settings-transport';

type LoadSource = 'bootstrap' | 'remote';
type AdminThemeFormCodec = ReturnType<typeof createFormCodec>;
type AdminThemeUiState = ReturnType<typeof createAdminConsoleUiState>;
type AdminThemeValidation = ReturnType<typeof createValidation>;

type AdminThemeControllerContext = {
  controls: AdminThemeControls;
  endpoint: string;
  formCodec: AdminThemeFormCodec;
  uiState: AdminThemeUiState;
  validation: AdminThemeValidation;
  finalizeAppliedSettings: () => void;
  syncEditableDerivedControls: () => void;
};

const STATUS_INVALID_SETTINGS = '設定破損';

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const createAdminThemeController = ({
  controls,
  endpoint,
  formCodec,
  uiState,
  validation,
  finalizeAppliedSettings,
  syncEditableDerivedControls
}: AdminThemeControllerContext) => {
  const {
    bootstrapEl,
    errorBanner
  } = controls;
  const {
    canonicalize,
    collectSettings,
    applySettings
  } = formCodec;
  const {
    validateSettings,
    clearInvalidFields,
    markInvalidFields,
    resolveIssueField
  } = validation;

  let baseline: EditableSettings | null = null;
  let currentRevision: string | null = null;
  let pendingExternalUpdate: { revision: string; settings: EditableSettings } | null = null;

  const scrollIntoViewWithOffset = (element: HTMLElement): void => {
    const top = element.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const revealErrorState = (issues: readonly ValidationIssue[] = []): void => {
    const firstField = issues
      .map((issue) => resolveIssueField(issue))
      .find((field): field is HTMLElement => field !== null);

    scrollIntoViewWithOffset(errorBanner);
    window.requestAnimationFrame(() => {
      if (!firstField) {
        errorBanner.focus({ preventScroll: true });
        return;
      }
      firstField.focus({ preventScroll: true });
      const { top, bottom } = firstField.getBoundingClientRect();
      if (top < 96 || bottom > window.innerHeight - 24) {
        scrollIntoViewWithOffset(firstField);
      }
    });
  };

  const setValidationIssues = (issues: readonly ValidationIssue[]): void => {
    markInvalidFields(issues);
    uiState.setErrors(issues.map((issue) => issue.message));
  };

  const clearExternalUpdate = (): void => {
    pendingExternalUpdate = null;
  };

  const refreshDirty = (): void => {
    if (!baseline) return;
    const current = canonicalize(collectSettings());
    uiState.setDirty(pendingExternalUpdate !== null || JSON.stringify(current) !== JSON.stringify(baseline));
  };

  const validateCurrentSettings = (): { draft: EditableSettings; issues: ValidationIssue[] } => {
    const draft = collectSettings();
    const issues = validateSettings(draft);
    setValidationIssues(issues);
    return { draft, issues };
  };

  const stageExternalUpdate = (payload: ThemeSettingsEditablePayload): void => {
    pendingExternalUpdate = {
      revision: payload.revision,
      settings: canonicalize(payload.settings)
    };
  };

  const showExternalUpdateConflict = (payload: unknown, title: string, status: string): boolean => {
    const latestPayload = extractSettingsPayload(payload);
    if (!latestPayload) return false;

    stageExternalUpdate(latestPayload);
    uiState.setErrorBanner({
      title,
      items: ['変更内容はページ内に保持されています。最新設定を同期するには「変更をリセット」を押してください。']
    });
    uiState.setDirty(true);
    uiState.setStatus('warn', status, { announce: false });
    revealErrorState();
    return true;
  };

  const setInvalidSettingsErrorBanner = (invalidState: ThemeSettingsEditableErrorState): void => {
    uiState.setErrorBanner({
      title: '読み取り専用保護に切り替えました',
      message: 'settings 設定ファイルの破損を検出しました。先にファイルを修正してから「再チェック」を押すか、現在のページを更新してください。',
      items: createInvalidSettingsBannerItems(invalidState),
      retryable: true
    });
  };

  const applyInvalidSettingsState = (
    payload: unknown,
    options: { announceStatus?: boolean; revealError?: boolean } = {}
  ): boolean => {
    const invalidState = extractInvalidSettingsState(payload);
    if (!invalidState) return false;

    currentRevision = null;
    baseline = null;
    clearExternalUpdate();
    clearInvalidFields();
    uiState.setDirty(false);
    uiState.setConsoleLocked(true);
    setInvalidSettingsErrorBanner(invalidState);
    uiState.setStatus(
      'error',
      STATUS_INVALID_SETTINGS,
      options.announceStatus === undefined ? {} : { announce: options.announceStatus }
    );
    if (options.revealError) {
      revealErrorState();
    }

    return true;
  };

  const loadPayload = (
    payload: unknown,
    source: LoadSource,
    options: { announceStatus?: boolean } = {}
  ): void => {
    if (
      applyInvalidSettingsState(
        payload,
        options.announceStatus === undefined ? {} : { announceStatus: options.announceStatus }
      )
    ) {
      return;
    }

    const resolvedPayload = extractSettingsPayload(payload);
    if (!resolvedPayload) {
      clearInvalidFields();
      uiState.setStatus('error', '返されたデータ形式が無効です');
      uiState.setErrors([getPayloadMessage(payload) || '設定APIから無効な payload が返されました'], { title: '設定の読み込みに失敗しました' });
      revealErrorState();
      return;
    }

    uiState.setConsoleLocked(false);
    clearExternalUpdate();
    currentRevision = resolvedPayload.revision;
    const normalized = canonicalize(resolvedPayload.settings);
    applySettings(normalized);
    finalizeAppliedSettings();
    baseline = canonicalize(collectSettings());
    clearInvalidFields();
    uiState.clearErrorBanner();
    uiState.setDirty(false);
    uiState.setStatus(
      'ready',
      source === 'remote' ? '最新設定を同期しました' : '初期設定を読み込みました',
      { announce: options.announceStatus ?? source === 'remote' }
    );
  };

  const setInitialLoadError = (message: string): void => {
    currentRevision = null;
    baseline = null;
    clearExternalUpdate();
    clearInvalidFields();
    uiState.setDirty(false);
    uiState.setConsoleLocked(true);
    uiState.setStatus('error', '初始化失敗しました');
    uiState.setErrors([message], {
      title: '設定の読み込みに失敗しました',
      message: 'テーマ設定の現在値を読み込めませんでした。「再チェック」を押して再試行してください。',
      retryable: true
    });
    revealErrorState();
  };

  const hasInitialSettings = (): boolean => baseline !== null && currentRevision !== null;

  const loadBootstrap = (): 'ready' | 'locked' | 'fallback' => {
    try {
      const payload = JSON.parse(bootstrapEl.textContent || '{}') as unknown;
      if (applyInvalidSettingsState(payload, { announceStatus: false })) {
        return 'locked';
      }
      if (!extractSettingsPayload(payload)) {
        console.warn('テーマ設定の bootstrap payload が無効です。/api/admin/settings/ にフォールバックします。');
        return 'fallback';
      }
      loadPayload(payload, 'bootstrap', { announceStatus: false });
      return 'ready';
    } catch (error) {
      console.warn(error);
      return 'fallback';
    }
  };

  const loadFromApi = async (): Promise<void> => {
    uiState.setStatus('loading', '正在読み取り /api/admin/settings', { announce: false });
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (applyInvalidSettingsState(payload, { announceStatus: false })) {
        return;
      }
      if (!response.ok) {
        throw new Error(getPayloadMessage(payload) || `HTTP ${response.status}`);
      }
      if (!extractSettingsPayload(payload)) {
        throw new Error(getPayloadMessage(payload) || '返されたデータ形式が無効です');
      }
      loadPayload(payload, 'remote');
    } catch (error) {
      if (hasInitialSettings()) {
        uiState.setStatus('warn', 'APIの読み込みに失敗したため、初期設定を使用します');
      } else if (!uiState.isConsoleLocked()) {
        setInitialLoadError(error instanceof Error ? error.message : '初期化リクエストに失敗しました。しばらくしてから再試行してください');
      }
      console.warn(error);
    }
  };

  const runValidation = async (): Promise<void> => {
    if (uiState.isSaving() || uiState.isValidating()) return;

    const { draft, issues } = validateCurrentSettings();
    if (issues.length) {
      uiState.setStatus('error', '検証に通りませんでした', { announce: false });
      revealErrorState(issues);
      return;
    }

    const current = canonicalize(draft);
    uiState.setValidating(true);
    uiState.setStatus('loading', '正在进行服务端预检');

    try {
      if (!currentRevision) {
        clearInvalidFields();
        uiState.setErrors(['現在の設定に revision がありません。先に最新設定を同期してからチェックしてください'], {
          title: 'チェック前に設定の再同期が必要です'
        });
        uiState.setStatus('error', '設定チェックに失敗しました', { announce: false });
        revealErrorState();
        return;
      }

      const { response, payload } = await requestSettingsWrite({
        endpoint,
        currentUrl: window.location.href,
        revision: currentRevision,
        settings: current,
        dryRun: true
      });
      if (applyInvalidSettingsState(payload, { announceStatus: false, revealError: true })) {
        return;
      }

      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        clearInvalidFields();
        const serverErrors = getPayloadErrors(payload);

        if (
          response.status === 409
          && showExternalUpdateConflict(payload, 'チェック時に外部更新を検出しました', 'チェック時に外部更新を検出しました。現在の下書きは保持されています')
        ) {
          return;
        }

        uiState.setErrors(serverErrors.length ? serverErrors : ['設定チェックに失敗しました，しばらくしてから再試行してください'], {
          title: '設定チェックに失敗しました'
        });
        uiState.setStatus('error', '設定チェックに失敗しました', { announce: false });
        revealErrorState();
        return;
      }

      clearInvalidFields();
      clearExternalUpdate();
      uiState.clearErrorBanner();
      uiState.setStatus('ok', 'サーバー側の事前チェックを通過しました。保存できます');
    } catch (error) {
      console.error(error);
      clearInvalidFields();
      uiState.setErrors(['設定チェックのリクエストに失敗しました。ローカルサービスのログを確認してください'], { title: '設定チェックに失敗しました' });
      uiState.setStatus('error', '設定チェックに失敗しました', { announce: false });
      revealErrorState();
    } finally {
      uiState.setValidating(false);
      syncEditableDerivedControls();
    }
  };

  const resetSettings = (): void => {
    const externalUpdate = pendingExternalUpdate;
    if (externalUpdate) {
      const latestSettings = deepClone(externalUpdate.settings);
      currentRevision = externalUpdate.revision;
      baseline = latestSettings;
      clearExternalUpdate();
      applySettings(deepClone(latestSettings));
      finalizeAppliedSettings();
      clearInvalidFields();
      uiState.clearErrorBanner();
      uiState.setDirty(false);
      uiState.setStatus('ready', '外部の最新設定を同期しました');
      return;
    }

    if (!baseline) return;
    applySettings(deepClone(baseline));
    finalizeAppliedSettings();
    clearInvalidFields();
    uiState.clearErrorBanner();
    uiState.setDirty(false);
    uiState.setStatus('ready', '已重置为最近一次加载值');
  };

  const saveSettings = async (): Promise<void> => {
    if (uiState.isSaving() || uiState.isValidating()) return;
    const { draft, issues } = validateCurrentSettings();
    if (issues.length) {
      uiState.setStatus('error', '保存前の検証に失敗しました', { announce: false });
      revealErrorState(issues);
      return;
    }

    const current = canonicalize(draft);

    uiState.setSaving(true);
    uiState.setStatus('loading', 'src/data/settings/*.json に保存しています');

    try {
      if (!currentRevision) {
        clearInvalidFields();
        uiState.setErrors(['現在の設定に revision がありません。先に最新設定を同期してから保存してください'], { title: '保存前に設定の再同期が必要です' });
        uiState.setStatus('error', '保存失敗しました', { announce: false });
        revealErrorState();
        return;
      }

      const { response, payload } = await requestSettingsWrite({
        endpoint,
        currentUrl: window.location.href,
        revision: currentRevision,
        settings: current
      });
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        clearInvalidFields();
        if (applyInvalidSettingsState(payload, { announceStatus: false, revealError: true })) {
          return;
        }

        const serverErrors = getPayloadErrors(payload);
        if (
          response.status === 409
          && showExternalUpdateConflict(payload, '外部更新を検出したため、保存を停止しました', '外部更新を検出しました。現在の下書きは保持されています')
        ) {
          return;
        }

        uiState.setErrors(serverErrors.length ? serverErrors : ['保存失敗しました，しばらくしてから再試行してください'], { title: '保存失敗しました' });
        if (response.status === 404) {
          uiState.setStatus('error', '現在の環境では書き込みできません（DEV のみ書き込み可能）', { announce: false });
        } else {
          uiState.setStatus('error', '保存失敗しました', { announce: false });
        }
        revealErrorState();
        return;
      }

      if (extractSettingsPayload(payload)) {
        loadPayload(payload, 'remote', { announceStatus: false });
        uiState.setStatus('ok', '保存しました。対象ページを更新して反映を確認してください');
      } else {
        baseline = current;
        clearExternalUpdate();
        uiState.setDirty(false);
        uiState.setStatus('ok', '保存しました');
      }
      clearInvalidFields();
      uiState.clearErrorBanner();
    } catch (error) {
      console.error(error);
      clearInvalidFields();
      uiState.setErrors(['保存リクエストに失敗しました。ローカルサービスのログを確認してください'], { title: '保存リクエストに失敗しました' });
      uiState.setStatus('error', '保存失敗しました', { announce: false });
      revealErrorState();
    } finally {
      uiState.setSaving(false);
      syncEditableDerivedControls();
    }
  };

  const start = (): void => {
    if (loadBootstrap() === 'fallback') {
      void loadFromApi();
    }
  };

  return {
    loadFromApi,
    refreshDirty,
    resetSettings,
    runValidation,
    saveSettings,
    start
  };
};

export type AdminThemeController = ReturnType<typeof createAdminThemeController>;
