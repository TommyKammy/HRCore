import { useEffect, useState } from "react";

import {
  type EmployeeListItem,
  ApiClientError,
  createP2ListRequestInit,
  fetchEmployees,
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
  useLegacyFixture,
  selectedEmployee,
  onOpenTransfer,
}: {
  personaId: BoundedPersonaId;
  employeeId: string | null;
  useLegacyFixture: boolean;
  selectedEmployee: EmployeeListItem | null;
  onOpenTransfer: (() => void) | null;
}) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<EmployeeDetailState>({
    employee: null,
    loading: false,
    error: null,
  });
  const selectedRecord =
    selectedEmployee?.employeeId === employeeId ? selectedEmployee : null;
  const isLegacyFixture = !selectedRecord && useLegacyFixture;

  useEffect(() => {
    if (isLegacyFixture || selectedRecord || !employeeId) {
      setState({ employee: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ employee: null, loading: true, error: null });
    void fetchEmployees(
      {
        employeeId,
        sort: "employeeId",
        direction: "asc",
        limit: 25,
      },
      createP2ListRequestInit(personaId, controller.signal),
    )
      .then((response) => {
        const employee =
          response.items.find((item) => item.employeeId === employeeId) ?? null;
        setState({
          employee,
          loading: false,
          error: employee
            ? null
            : "指定された従業員は現在の bounded scope では確認できません。",
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
  }, [employeeId, isLegacyFixture, personaId, retryVersion, selectedRecord]);

  if (isLegacyFixture) {
    return (
      <EmployeeDetailView employee={null} onOpenTransfer={onOpenTransfer} />
    );
  }
  if (selectedRecord) {
    return (
      <EmployeeDetailView employee={selectedRecord} onOpenTransfer={null} />
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
