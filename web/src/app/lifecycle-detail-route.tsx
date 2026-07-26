import { useEffect, useState } from "react";

import {
  type LifecycleRequestListItem,
  ApiClientError,
  createP2ListRequestInit,
  fetchLifecycleRequestDetail,
} from "../api-client";
import type { BoundedPersonaId } from "../persona";
import { LifecycleRequestDetailView } from "./screens";
import { LoadingState } from "./shared";

interface LifecycleDetailState {
  request: LifecycleRequestListItem | null;
  loading: boolean;
  error: string | null;
}

export function LifecycleDetailRoute({
  personaId,
  requestId,
  expectedType,
  onBack,
}: {
  personaId: BoundedPersonaId;
  requestId: string;
  expectedType: LifecycleRequestListItem["requestType"];
  onBack: () => void;
}) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<LifecycleDetailState>({
    request: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ request: null, loading: true, error: null });
    void fetchLifecycleRequestDetail(
      requestId,
      createP2ListRequestInit(personaId, controller.signal),
    )
      .then((response) => {
        if (
          response.item.transactionRequestId !== requestId ||
          response.item.requestType !== expectedType
        ) {
          setState({
            request: null,
            loading: false,
            error: "取得した手続き詳細がURLの対象と一致しません。",
          });
          return;
        }
        setState({ request: response.item, loading: false, error: null });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          request: null,
          loading: false,
          error:
            caught instanceof ApiClientError
              ? "手続き詳細を再取得できません。権限またはRequest IDを確認してください。"
              : "手続き詳細APIに接続できません。",
        });
      });

    return () => controller.abort();
  }, [expectedType, personaId, requestId, retryVersion]);

  if (state.loading) {
    return <LoadingState />;
  }
  if (state.error) {
    return (
      <section className="collection-feedback feedback-invalid" role="alert">
        <div>
          <strong>手続き詳細を表示できません</strong>
          <p>{state.error}</p>
        </div>
        <div className="collection-feedback-actions">
          <button className="secondary-button" type="button" onClick={onBack}>
            手続き一覧へ戻る
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setRetryVersion((version) => version + 1)}
          >
            再試行
          </button>
        </div>
      </section>
    );
  }
  return state.request ? (
    <LifecycleRequestDetailView request={state.request} onBack={onBack} />
  ) : null;
}
