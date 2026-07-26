import { useEffect, useState } from "react";

import {
  type EmployeeListItem,
  ApiClientError,
  createP2ListRequestInit,
  fetchEmployeeDetail,
} from "../api-client";
import type { BoundedPersonaId } from "../persona";
import { EmployeeDetailView } from "./screens";
import { LoadingState } from "./shared";

interface EmployeeDetailState {
  employee: EmployeeListItem | null;
  loading: boolean;
  error: string | null;
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
    loading: false,
    error: null,
  });
  const isLegacyFixture = useLegacyFixture;

  useEffect(() => {
    if (isLegacyFixture || !employeeId) {
      setState({ employee: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ employee: null, loading: true, error: null });
    void fetchEmployeeDetail(
      employeeId,
      { asOf: asOf ?? undefined },
      createP2ListRequestInit(personaId, controller.signal),
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
          );
        }
        setState({
          employee: response.item,
          loading: false,
          error: null,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          employee: null,
          loading: false,
          error:
            caught instanceof ApiClientError
              ? "従業員詳細を再取得できません。権限または検索条件を確認してください。"
              : "従業員詳細APIに接続できません。",
        });
      });

    return () => controller.abort();
  }, [asOf, employeeId, isLegacyFixture, personaId, retryVersion]);

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
    <EmployeeDetailView employee={state.employee} onOpenTransfer={null} />
  ) : null;
}
