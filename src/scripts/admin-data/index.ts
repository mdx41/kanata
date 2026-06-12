import {
  parseAdminSettingsExportBundle,
  type AdminSettingsExportBundle
} from '../../lib/admin-console/settings-data';
import {
  queryAdminDataControls,
  reportAdminDataSetupError
} from './controls';
import {
  getBundleKey,
  getDownloadFileName,
  getPayloadErrors,
  getPayloadResults,
  getPayloadRevision,
  GROUP_ORDER,
  hasWriteResultChanges,
  isRecord,
  parseBootstrap,
  parseResponseBody,
  type WriteResultsMap
} from './shared';
import { createAdminDataUi } from './ui';

const root = document.querySelector<HTMLElement>('[data-admin-data-root]');
type ImportAction = 'dry-run' | 'apply';
type ImportFailureOptions = {
  status: 'error' | 'warn';
  statusText: string;
  errors: readonly string[];
  errorTitle?: string;
  previewState?: 'error' | 'warn';
  previewTitle: string;
  previewBody: string;
};

if (!root) {
  // Current page does not use admin data console.
} else {
  const controlState = queryAdminDataControls();
  if (!controlState.ok) {
    reportAdminDataSetupError(controlState.controls, {
      message: 'ページに必要なコントロールがないため、クライアントスクリプトの初期化を停止しました。ページを更新するか、テンプレートとコントロールIDが一致しているか確認してください。',
      details: controlState.missing
    });
  } else {
    const controls = controlState.controls;
    const ui = createAdminDataUi(controls);
    const bootstrap = parseBootstrap(controls.bootstrapEl.textContent ?? '');

    if (!bootstrap) {
      console.error('[admin-data] bootstrap 数据无效');
      ui.showBootstrapError('現在のページで bootstrap 初期化を完了できませんでした。ページを更新するか、開発サーバーを再起動してから再試行してください。');
    } else {
      let currentRevision = bootstrap.revision;
      let currentBundle: AdminSettingsExportBundle | null = null;
      let busy = false;
      let dragDepth = 0;
      let lastDryRunKey = '';
      let lastDryRunHasChanges = false;
      let hasCompletedApply = false;
      let activeAction: ImportAction | null = null;

      const syncActionState = () => {
        const hasBundle = currentBundle !== null;
        const canApply = hasBundle
          && lastDryRunKey === getBundleKey(currentBundle)
          && lastDryRunHasChanges;
        const dryRunStepState = !hasBundle
          ? 'blocked'
          : activeAction === 'dry-run'
            ? 'running'
            : lastDryRunKey !== '' || hasCompletedApply
              ? 'done'
              : 'ready';
        const applyStepState = !hasBundle
          ? 'blocked'
          : activeAction === 'apply'
            ? 'running'
            : hasCompletedApply
              ? 'done'
              : canApply
                ? 'ready'
                : 'blocked';

        ui.syncActionState({
          busy,
          hasBundle,
          canApply,
          dryRunStepState,
          applyStepState
        });
      };

      const resetDropzoneDragState = () => {
        dragDepth = 0;
        ui.setDropzoneDragActive(false);
      };

      const resetImportConfirmation = () => {
        lastDryRunKey = '';
        lastDryRunHasChanges = false;
        hasCompletedApply = false;
      };

      const resetImportSession = () => {
        resetImportConfirmation();
        activeAction = null;
        currentBundle = null;
        ui.renderFileMeta(null, null);
      };

      const showImportFailure = ({
        status,
        statusText,
        errors,
        errorTitle,
        previewState = 'error',
        previewTitle,
        previewBody
      }: ImportFailureOptions) => {
        resetImportConfirmation();
        ui.setStatus(status, statusText);
        ui.setErrors(errors, errorTitle ? { title: errorTitle } : {});
        ui.showPreviewEmpty({
          state: previewState,
          title: previewTitle,
          body: previewBody
        });
      };

      const showImportActionLoading = (action: ImportAction) => {
        const isDryRun = action === 'dry-run';
        ui.setStatus('loading', isDryRun ? 'dry-run を実行しています' : '正在書き込み');
        ui.showPreviewEmpty({
          state: 'loading',
          title: isDryRun ? 'dry-run を実行しています 検証' : '正在書き込み settings',
          body: isDryRun
            ? '現在の settings とインポートスナップショットを比較しています。完了後、ここに差分概要を表示します。'
            : '既存のトランザクション経路で settings を書き込んでいます。完了後、ここに書き込み結果を表示します。'
        });
      };

      const completeDryRun = (results: WriteResultsMap | null) => {
        if (!currentBundle) return;

        const hasChanges = GROUP_ORDER.some((group) => hasWriteResultChanges(results?.[group]));
        lastDryRunKey = getBundleKey(currentBundle);
        lastDryRunHasChanges = hasChanges;
        hasCompletedApply = false;
        ui.renderPreview(
          results,
          hasChanges
            ? {
                state: 'diff',
                note: '書き込み確定前に revision を再検証し、外部変更の上書きを防ぎます。'
              }
            : {
                state: 'clean',
                body: '現在のインポートスナップショットはローカル settings と一致しています。書き込みは不要です。'
              }
        );
        ui.setStatus(hasChanges ? 'ok' : 'ready', 'dry-run 完成');
      };

      const completeApply = (results: WriteResultsMap | null) => {
        lastDryRunKey = '';
        lastDryRunHasChanges = false;
        hasCompletedApply = true;
        ui.renderPreview(results, {
          state: 'applied',
          body: '✅ 書き込み成功',
          note: '继续インポート其他快照前，请再执行 dry-run。'
        });
        ui.setStatus('ok', '書き込み完成');
      };

      const handleSelectedFile = async (file: File | null) => {
        ui.clearErrors();
        resetImportSession();
        syncActionState();

        if (!file) {
          ui.setSelectedFileLabel(null);
          ui.resetPreview();
          ui.setStatus('idle', '操作待ち', { announce: false });
          return;
        }

        ui.setSelectedFileLabel(file.name);
        ui.showPreviewEmpty({
          state: 'loading',
          title: 'インポートスナップショットを解析しています',
          body: `正在読み取り ${file.name} を読み取り、manifest 構造を検証しています。`
        });
        ui.setStatus('loading', '正在解析', { announce: false });

        try {
          const text = await file.text();
          const json = JSON.parse(text) as unknown;
          const parsed = parseAdminSettingsExportBundle(json);

          if (!parsed.ok) {
            showImportFailure({
              status: 'error',
              statusText: '解析失敗しました',
              errors: parsed.errors,
              errorTitle: 'インポートファイルが settings エクスポート形式に一致しません',
              previewTitle: 'インポートファイルの解析に失敗しました',
              previewBody: '現在のファイルが settings エクスポート形式に一致しません。schemaVersion、includedScopes、JSON 構造を確認してから再試行してください。'
            });
            return;
          }

          currentBundle = parsed.bundle;
          ui.renderFileMeta(parsed.bundle, file.name);
          ui.showPreviewEmpty({
            state: 'ready',
            title: '快照已就绪',
            body: `${file.name}\n已完成 manifest 解析，可执行 dry-run`
          });
          ui.setStatus('ready', '快照已解析');
        } catch {
          showImportFailure({
            status: 'error',
            statusText: 'JSON 无效',
            errors: ['選択したファイルは有効な JSON ではないか、エンコード内容が破損しています'],
            previewTitle: 'インポートファイルが有効な JSON ではありません',
            previewBody: '選択したファイルは有効な JSON ではないか、エンコード内容が破損しています。请再選択エクスポート快照。'
          });
        } finally {
          syncActionState();
        }
      };

      const runImportAction = async (action: ImportAction) => {
        if (!currentBundle) return;

        const isDryRun = action === 'dry-run';
        activeAction = action;
        if (isDryRun) {
          hasCompletedApply = false;
        }
        busy = true;
        syncActionState();
        ui.clearErrors();
        showImportActionLoading(action);

        try {
          const response = await fetch(
            isDryRun ? `${bootstrap.importEndpoint}?dryRun=1` : bootstrap.importEndpoint,
            {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json; charset=utf-8'
              },
              cache: 'no-store',
              body: JSON.stringify({
                revision: currentRevision,
                settings: currentBundle.settings
              })
            }
          );

          const payload = await parseResponseBody(response);
          const latestRevision = getPayloadRevision(payload);
          if (latestRevision) {
            currentRevision = latestRevision;
          }

          if (!response.ok || !isRecord(payload) || payload.ok !== true) {
            const isRevisionConflict = response.status === 409;
            const payloadErrors = getPayloadErrors(payload);
            showImportFailure({
              status: isRevisionConflict ? 'warn' : 'error',
              statusText: isDryRun ? 'dry-run 未通过' : '書き込みに失敗しました',
              errors: payloadErrors.length > 0
                ? payloadErrors
                : [isDryRun ? 'dry-run の検証に失敗しました。インポートファイルと現在の設定状態を確認してください' : 'settings の書き込みに失敗しました。レスポンスとコンソールログを確認してください'],
              errorTitle: isRevisionConflict ? '外部更新を検出しました' : 'インポート未完成',
              previewState: isRevisionConflict ? 'warn' : 'error',
              previewTitle: isRevisionConflict ? '外部更新を検出しました' : isDryRun ? 'dry-run 未通过' : '書き込みに失敗しました',
              previewBody: isRevisionConflict
                ? '本次インポート已停止，避免静默覆盖外部修改。请再执行 dry-run，并在最新 revision 上确认结果。'
                : isDryRun
                  ? '現在未生成可提交的変更预览，请修正错误清单后再次执行 dry-run。'
                  : '今回の書き込みは完了していません。先にエラー一覧を処理してから、設定スナップショットを再送信してください。'
            });
            return;
          }

          const results = getPayloadResults(payload);
          if (isDryRun) {
            completeDryRun(results);
          } else {
            completeApply(results);
          }
        } catch {
          showImportFailure({
            status: 'error',
            statusText: isDryRun ? 'dry-run リクエストに失敗しました' : '書き込みリクエストに失敗しました',
            errors: [isDryRun ? 'dry-run リクエストに失敗しました，しばらくしてから再試行してください' : '書き込みリクエストに失敗しました，しばらくしてから再試行してください'],
            previewTitle: isDryRun ? 'dry-run リクエストに失敗しました' : '書き込みリクエストに失敗しました',
            previewBody: isDryRun
              ? 'サーバー応答を取得できませんでした。開発サーバーの状態を確認してから、再度 dry-run を実行してください。'
              : '書き込み結果を確認できませんでした。開発サーバーの状態を確認してから再送信してください。'
          });
        } finally {
          activeAction = null;
          busy = false;
          syncActionState();
        }
      };

      controls.exportBtn.addEventListener('click', async () => {
        busy = true;
        syncActionState();
        ui.clearErrors();
        ui.setStatus('loading', 'スナップショットを書き出しています');

        try {
          const response = await fetch(bootstrap.exportEndpoint, {
            method: 'GET',
            headers: {
              Accept: 'application/json'
            },
            cache: 'no-store'
          });

          if (!response.ok) {
            const payload = await parseResponseBody(response);
            ui.setStatus(response.status === 409 ? 'warn' : 'error', 'エクスポート失敗しました');
            ui.setErrors(
              getPayloadErrors(payload).length > 0
                ? getPayloadErrors(payload)
                : ['現在の settings 状態ではエクスポートできません。先にローカル設定を修正してから再試行してください'],
              {
                title: response.status === 409 ? 'settings 現在不可エクスポート' : 'エクスポート失敗しました'
              }
            );
            return;
          }

          const blob = await response.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = downloadUrl;
          anchor.download = getDownloadFileName(response);
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(downloadUrl);
          ui.setStatus('ok', '快照已エクスポート');
        } catch {
          ui.setStatus('error', 'エクスポートリクエストに失敗しました');
          ui.setErrors(['エクスポートリクエストに失敗しました。開発サーバーの状態を確認してから再試行してください']);
        } finally {
          busy = false;
          syncActionState();
        }
      });

      controls.fileInput.addEventListener('change', () => {
        const file = controls.fileInput.files?.[0] ?? null;
        controls.fileInput.value = '';
        void handleSelectedFile(file);
      });

      const requestFileSelection = () => {
        if (!busy) {
          controls.fileInput.click();
        }
      };

      controls.dropzoneTriggerBtn.addEventListener('click', requestFileSelection);
      controls.dropzoneReselectBtn.addEventListener('click', requestFileSelection);

      controls.dropzoneEl.addEventListener('dragenter', (event) => {
        event.preventDefault();
        if (busy) return;

        dragDepth += 1;
        ui.setDropzoneDragActive(true);
      });

      controls.dropzoneEl.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (busy) return;

        ui.setDropzoneDragActive(true);
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy';
        }
      });

      controls.dropzoneEl.addEventListener('dragleave', (event) => {
        event.preventDefault();
        if (busy) {
          resetDropzoneDragState();
          return;
        }

        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
          ui.setDropzoneDragActive(false);
        }
      });

      controls.dropzoneEl.addEventListener('drop', (event) => {
        event.preventDefault();
        resetDropzoneDragState();
        if (busy) return;

        const file = event.dataTransfer?.files?.[0] ?? null;
        if (file) {
          void handleSelectedFile(file);
        }
      });

      controls.dryRunBtn.addEventListener('click', () => {
        void runImportAction('dry-run');
      });

      controls.applyBtn.addEventListener('click', () => {
        void runImportAction('apply');
      });

      syncActionState();
      resetDropzoneDragState();
      ui.setSelectedFileLabel(null);
      ui.resetPreview();
      ui.setStatus('idle', '准备就绪', { announce: false });
    }
  }
}
