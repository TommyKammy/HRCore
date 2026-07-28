import { useEffect, useRef, useState } from "react";

import {
  type LifecycleRequestListItem,
  ApiClientError,
  createP2ListCorrelationId,
  createP2ListRequestInit,
  fetchLifecycleRequestDetail,
  isCompletedP2ListDenial,
} from "../api-client";
import type { BoundedPersonaId } from "../persona";
import { detailRouteErrorMessage } from "./detail-route-error";
import { LifecycleRequestDetailView } from "./screens";
import { LoadingState } from "./shared";

interface LifecycleDetailState {
  request: LifecycleRequestListItem | null;
  maskedFields: Array<keyof LifecycleRequestListItem>;
  loading: boolean;
  error: string | null;
  correlationId: string | null;
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
    maskedFields: [],
    loading: true,
    error: null,
    correlationId: null,
  });
  const actionRef = useRef({
    key: "",
    correlationId: createP2ListCorrelationId(),
  });

  useEffect(() => {
    const controller = new AbortController();
    const actionKey = JSON.stringify([personaId, requestId, expectedType]);
    if (actionRef.current.key !== actionKey) {
      actionRef.current = {
        key: actionKey,
        correlationId: createP2ListCorrelationId(),
      };
    }
    setState({
      request: null,
      maskedFields: [],
      loading: true,
      error: null,
      correlationId: null,
    });
    void fetchLifecycleRequestDetail(
      requestId,
      createP2ListRequestInit(
        personaId,
        controller.signal,
        actionRef.current.correlationId,
      ),
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }
        if (
          response.item.transactionRequestId !== requestId ||
          response.item.requestType !== expectedType
        ) {
          setState({
            request: null,
            maskedFields: [],
            loading: false,
            error: "取得した手続き詳細がURLの対象と一致しません。",
            correlationId: response.correlationId,
          });
          return;
        }
        setState({
          request: response.item,
          maskedFields: response.authorization.maskedFields,
          loading: false,
          error: null,
          correlationId: response.correlationId,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (isCompletedP2ListDenial(caught)) {
          actionRef.current = {
            ...actionRef.current,
            correlationId: createP2ListCorrelationId(),
          };
        }
        setState({
          request: null,
          maskedFields: [],
          loading: false,
          error: detailRouteErrorMessage(caught, {
            client:
              "手続き詳細を再取得できません。権限またはRequest IDを確認してください。",
            service:
              "手続き詳細APIのサーバー応答または契約を確認できません。時間をおいて再試行してください。",
            network: "手続き詳細APIに接続できません。",
          }),
          correlationId:
            caught instanceof ApiClientError
              ? (caught.correlationId ?? null)
              : null,
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
          {state.correlationId ? (
            <p>
              correlation <code>{state.correlationId}</code>
            </p>
          ) : null}
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
    <LifecycleRequestDetailView
      request={state.request}
      maskedFields={state.maskedFields}
      onBack={onBack}
    />
  ) : null;
}
