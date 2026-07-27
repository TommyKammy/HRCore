import { useEffect, useRef, useState } from "react";

import {
  type EmployeeListItem,
  ApiClientError,
  createP2ListCorrelationId,
  createP2ListRequestInit,
  fetchEmployeeDetail,
} from "../api-client";
import type { BoundedPersonaId } from "../persona";
import { detailRouteErrorMessage } from "./detail-route-error";
import { EmployeeDetailView } from "./screens";
import { LoadingState } from "./shared";

interface EmployeeDetailState {
  employee: EmployeeListItem | null;
  maskedFields: Array<keyof EmployeeListItem>;
  loading: boolean;
  error: string | null;
  correlationId: string | null;
}

export function EmployeeDetailRoute({
  personaId,
  employeeId,
  asOf,
  useLegacyFixture,
  onOpenTransfer,
}: {
  personaId: BoundedPersonaId;
  employeeId: string | null;
  asOf: string | null;
  useLegacyFixture: boolean;
  onOpenTransfer: (() => void) | null;
}) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<EmployeeDetailState>({
    employee: null,
    maskedFields: [],
    loading: false,
    error: null,
    correlationId: null,
  });
  const actionRef = useRef({
    key: "",
    correlationId: createP2ListCorrelationId(),
  });
  const isLegacyFixture = useLegacyFixture || employeeId === null;
  const hasInvalidEmployeeId = employeeId === "";

  useEffect(() => {
    if (isLegacyFixture || hasInvalidEmployeeId) {
      setState({
        employee: null,
        maskedFields: [],
        loading: false,
        error: null,
        correlationId: null,
      });
      return;
    }

    const controller = new AbortController();
    const actionKey = JSON.stringify([personaId, employeeId, asOf]);
    if (actionRef.current.key !== actionKey) {
      actionRef.current = {
        key: actionKey,
        correlationId: createP2ListCorrelationId(),
      };
    }
    setState({
      employee: null,
      maskedFields: [],
      loading: true,
      error: null,
      correlationId: null,
    });
    void fetchEmployeeDetail(
      employeeId,
      { asOf: asOf ?? undefined },
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
          response.item.employeeId !== employeeId ||
          (asOf !== null && response.asOf !== asOf)
        ) {
          throw new ApiClientError(
            "Employee detail response did not match the requested resource.",
            { correlationId: response.correlationId },
          );
        }
        setState({
          employee: response.item,
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
        setState({
          employee: null,
          maskedFields: [],
          loading: false,
          error: detailRouteErrorMessage(caught, {
            client:
              "従業員詳細を再取得できません。権限または検索条件を確認してください。",
            service:
              "従業員詳細APIのサーバー応答または契約を確認できません。時間をおいて再試行してください。",
            network: "従業員詳細APIに接続できません。",
          }),
          correlationId:
            caught instanceof ApiClientError
              ? (caught.correlationId ?? null)
              : null,
        });
      });

    return () => controller.abort();
  }, [
    asOf,
    employeeId,
    hasInvalidEmployeeId,
    isLegacyFixture,
    personaId,
    retryVersion,
  ]);

  if (hasInvalidEmployeeId) {
    return (
      <section className="collection-feedback feedback-invalid" role="alert">
        <div>
          <strong>従業員詳細を表示できません</strong>
          <p>
            従業員詳細URLの従業員IDが空です。従業員一覧から対象を選び直してください。
          </p>
        </div>
      </section>
    );
  }
  if (isLegacyFixture) {
    return (
      <EmployeeDetailView employee={null} onOpenTransfer={onOpenTransfer} />
    );
  }
  if (state.loading) {
    return <LoadingState />;
  }
  if (state.error) {
    return (
      <section className="collection-feedback feedback-invalid" role="alert">
        <div>
          <strong>従業員詳細を表示できません</strong>
          <p>{state.error}</p>
          {state.correlationId ? (
            <p>
              correlation <code>{state.correlationId}</code>
            </p>
          ) : null}
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setRetryVersion((version) => version + 1)}
        >
          再試行
        </button>
      </section>
    );
  }
  return state.employee ? (
    <EmployeeDetailView
      employee={state.employee}
      maskedFields={state.maskedFields}
      onOpenTransfer={null}
    />
  ) : null;
}
