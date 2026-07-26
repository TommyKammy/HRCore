import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

import {
  type EmployeeListItem,
  type EmployeeListQuery,
  type EmployeeListResponse,
  type LifecycleRequestListItem,
  type LifecycleRequestListQuery,
  type LifecycleRequestListResponse,
  ApiClientError,
  createP2ListRequestInit,
  fetchEmployees,
  fetchLifecycleRequests,
} from "../api-client";
import type { BoundedPersonaId } from "../persona";
import {
  defaultEmployeeListQuery,
  defaultLifecycleListQuery,
  type ListView,
  type ParsedListQuery,
  parseEmployeeListQuery,
  parseLifecycleListQuery,
  writeListQuery,
} from "./list-query-state";
import { employeeStatusClass, lifecycleStatusClass } from "./record-status";
import { LoadingState } from "./shared";

type CollectionErrorKind = "denied" | "invalid" | "network";

interface CollectionError {
  kind: CollectionErrorKind;
  title: string;
  body: string;
}

interface CollectionState<Query, Response> {
  location: ParsedListQuery<Query>;
  response: Response | null;
  loading: boolean;
  error: CollectionError | null;
}

function useBoundedCollection<Query, Response>({
  view,
  parse,
  load,
}: {
  view: ListView;
  parse: () => ParsedListQuery<Query>;
  load: (query: Query, signal: AbortSignal) => Promise<Response>;
}) {
  const [location, setLocation] = useState<ParsedListQuery<Query>>(parse);
  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CollectionError | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [previousLocations, setPreviousLocations] = useState<string[]>([]);

  useEffect(() => {
    const handlePopState = () => {
      setPreviousLocations([]);
      setLocation(parse());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [parse]);

  useEffect(() => {
    if (location.errors.length > 0) {
      setResponse(null);
      setLoading(false);
      setError({
        kind: "invalid",
        title: "URLの検索条件を確認してください",
        body: location.errors.join(" "),
      });
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void load(location.query, controller.signal)
      .then((nextResponse) => {
        setResponse(nextResponse);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setResponse(null);
        setError(classifyCollectionError(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [load, location, retryVersion]);

  const applyQuery = useCallback(
    (query: Query, mode: "push" | "replace" = "push") => {
      setPreviousLocations([]);
      writeListQuery(
        view,
        query as EmployeeListQuery | LifecycleRequestListQuery,
        mode,
      );
      setLocation({ query, errors: [] });
    },
    [view],
  );

  const applyNextQuery = useCallback(
    (query: Query) => {
      const previousLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPreviousLocations((current) => [...current, previousLocation]);
      writeListQuery(
        view,
        query as EmployeeListQuery | LifecycleRequestListQuery,
      );
      setLocation({ query, errors: [] });
    },
    [view],
  );

  const goToPrevious = useCallback(() => {
    const previousLocation = previousLocations.at(-1);
    if (!previousLocation) {
      return;
    }
    window.history.pushState(null, "", previousLocation);
    setPreviousLocations((current) => current.slice(0, -1));
    setLocation(parse());
  }, [parse, previousLocations]);

  const state: CollectionState<Query, Response> = {
    location,
    response,
    loading,
    error,
  };
  return {
    state,
    applyQuery,
    applyNextQuery,
    canGoPrevious: previousLocations.length > 0,
    goToPrevious,
    retry: () => setRetryVersion((version) => version + 1),
  };
}

function classifyCollectionError(caught: unknown): CollectionError {
  if (caught instanceof ApiClientError) {
    const status = Number(caught.message.match(/: (\d{3})$/u)?.[1]);
    if (status === 401 || status === 403) {
      return {
        kind: "denied",
        title: "この一覧を表示する権限が確認できません",
        body: "サーバーの actor context と bounded data scope を確認してください。persona の表示状態だけではアクセスできません。",
      };
    }
    if (status === 400) {
      return {
        kind: "invalid",
        title: "検索条件またはページ情報が無効です",
        body: "条件をリセットして再実行してください。期限切れ・改変済み cursor は再利用できません。",
      };
    }
  }
  return {
    kind: "network",
    title: "一覧APIに接続できません",
    body: "ネットワークとAPIサーバーを確認し、同じ条件で再試行してください。",
  };
}

function CollectionFeedback({
  error,
  onReset,
  onRetry,
}: {
  error: CollectionError;
  onReset: () => void;
  onRetry: () => void;
}) {
  return (
    <section
      className={`collection-feedback feedback-${error.kind}`}
      role="alert"
    >
      <div>
        <strong>{error.title}</strong>
        <p>{error.body}</p>
      </div>
      <div className="collection-feedback-actions">
        <button className="secondary-button" type="button" onClick={onReset}>
          条件をリセット
        </button>
        {error.kind !== "invalid" ? (
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" />
            再試行
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CollectionMeta({
  correlationId,
  maskedFields,
}: {
  correlationId: string;
  maskedFields: readonly string[];
}) {
  return (
    <div className="collection-meta" role="status">
      <span>
        scope <strong>bounded</strong>
      </span>
      <span>
        correlation <code>{correlationId}</code>
      </span>
      <span>
        masked{" "}
        <strong>
          {maskedFields.length > 0 ? maskedFields.length : "none"}
        </strong>
      </span>
    </div>
  );
}

function PaginationControls({
  count,
  canGoPrevious,
  hasNextPage,
  onPrevious,
  onNext,
}: {
  count: number;
  canGoPrevious: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="collection-pagination">
      <span>{count} 件を表示</span>
      <div>
        <button
          className="icon-button"
          type="button"
          title="前のページへ"
          aria-label="前のページへ"
          disabled={!canGoPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title="次のページへ"
          aria-label="次のページへ"
          disabled={!hasNextPage}
          onClick={onNext}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

function employeeStatusLabel(status: EmployeeListItem["employmentStatus"]) {
  return {
    active: "在籍",
    inactive: "休止",
    terminated: "退職",
  }[status];
}

function lifecycleTypeLabel(type: LifecycleRequestListItem["requestType"]) {
  return {
    onboarding: "入社",
    transfer: "異動",
    termination: "退職",
  }[type];
}

function lifecycleStatusLabel(status: LifecycleRequestListItem["status"]) {
  return {
    draft: "下書き",
    submitted: "申請済み",
    returned: "差戻し",
    rejected: "却下",
    cancelled: "取消",
    approved: "承認済み",
    completed: "完了",
  }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(value));
}

function nullableEmployeeField(
  value: string | null,
  field: "organizationCode" | "positionCode",
  maskedFields: readonly (keyof EmployeeListItem)[],
) {
  if (value !== null) {
    return value;
  }
  return maskedFields.includes(field) ? "masked" : "未割当";
}

interface EmployeeListDraft {
  q: string;
  employeeId: string;
  employmentStatus: EmployeeListItem["employmentStatus"] | "";
  organizationCode: string;
  sort: NonNullable<EmployeeListQuery["sort"]>;
  direction: NonNullable<EmployeeListQuery["direction"]>;
  limit: NonNullable<EmployeeListQuery["limit"]>;
}

function employeeDraftFromQuery(query: EmployeeListQuery): EmployeeListDraft {
  return {
    q: query.q ?? "",
    employeeId: query.employeeId ?? "",
    employmentStatus: query.employmentStatus ?? "",
    organizationCode: query.organizationCode ?? "",
    sort: query.sort ?? "displayName",
    direction: query.direction ?? "asc",
    limit: query.limit ?? 25,
  };
}

export function EmployeeListView({
  personaId,
  onOpenEmployee,
}: {
  personaId: BoundedPersonaId;
  onOpenEmployee: ((employee: EmployeeListItem, asOf: string) => void) | null;
}) {
  const load = useCallback(
    (query: EmployeeListQuery, signal: AbortSignal) =>
      fetchEmployees(query, createP2ListRequestInit(personaId, signal)),
    [personaId],
  );
  const {
    state,
    applyQuery,
    applyNextQuery,
    canGoPrevious,
    goToPrevious,
    retry,
  } = useBoundedCollection<EmployeeListQuery, EmployeeListResponse>({
    view: "employees",
    parse: parseEmployeeListQuery,
    load,
  });
  const [draft, setDraft] = useState<EmployeeListDraft>(() =>
    employeeDraftFromQuery(state.location.query),
  );
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(employeeDraftFromQuery(state.location.query));
  }, [state.location.query]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      [draft.q, draft.employeeId, draft.organizationCode].some(
        (value) => value.trim() !== value,
      )
    ) {
      setDraftError("検索条件の前後に空白を含めないでください。");
      return;
    }
    setDraftError(null);
    applyQuery({
      ...state.location.query,
      q: draft.q || undefined,
      employeeId: draft.employeeId || undefined,
      employmentStatus: draft.employmentStatus || undefined,
      organizationCode: draft.organizationCode || undefined,
      sort: draft.sort,
      direction: draft.direction,
      limit: draft.limit,
      cursor: undefined,
    });
  };

  const reset = () => {
    setDraftError(null);
    setDraft(employeeDraftFromQuery(defaultEmployeeListQuery));
    applyQuery(defaultEmployeeListQuery);
  };
  const maskedFields = state.response?.authorization.maskedFields ?? [];
  const appliedAsOf =
    state.response?.appliedFilters.asOf ?? state.location.query.asOf ?? "";

  return (
    <div className="collection-view" aria-labelledby="employee-list-heading">
      <section className="surface collection-header">
        <div>
          <p className="context-label">Employee collection</p>
          <h2 id="employee-list-heading">従業員を検索</h2>
          <p>
            repository-owned synthetic dataset の許可済み項目だけを表示します。
          </p>
        </div>
        <Users size={24} aria-hidden="true" />
      </section>

      <form className="surface collection-filters" onSubmit={submit}>
        <label className="collection-search-field">
          <span>氏名・従業員ID</span>
          <span className="input-with-icon">
            <Search size={16} aria-hidden="true" />
            <input
              value={draft.q}
              maxLength={100}
              placeholder="許可された検索語"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  q: event.target.value,
                }))
              }
            />
          </span>
        </label>
        <label>
          <span>従業員ID</span>
          <input
            value={draft.employeeId}
            maxLength={128}
            placeholder="EMP-001"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                employeeId: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>在籍状態</span>
          <select
            value={draft.employmentStatus}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                employmentStatus: event.target
                  .value as EmployeeListDraft["employmentStatus"],
              }))
            }
          >
            <option value="">すべて</option>
            <option value="active">在籍</option>
            <option value="inactive">休止</option>
            <option value="terminated">退職</option>
          </select>
        </label>
        <label>
          <span>組織コード</span>
          <input
            value={draft.organizationCode}
            maxLength={128}
            placeholder="ORG-SYNTHETIC"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                organizationCode: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>並び順</span>
          <select
            value={draft.sort}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sort: event.target.value as EmployeeListDraft["sort"],
              }))
            }
          >
            <option value="displayName">氏名</option>
            <option value="employeeId">従業員ID</option>
            <option value="hireDate">入社日</option>
          </select>
        </label>
        <label>
          <span>方向</span>
          <select
            value={draft.direction}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                direction: event.target.value as EmployeeListDraft["direction"],
              }))
            }
          >
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
        </label>
        <label>
          <span>表示件数</span>
          <select
            value={draft.limit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                limit: Number(event.target.value),
              }))
            }
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div className="collection-filter-actions">
          <button className="secondary-button" type="button" onClick={reset}>
            リセット
          </button>
          <button type="submit">
            <Search size={16} aria-hidden="true" />
            検索
          </button>
        </div>
        {draftError ? (
          <p className="collection-form-error" role="alert">
            {draftError}
          </p>
        ) : null}
      </form>

      {state.loading ? <LoadingState /> : null}
      {!state.loading && state.error ? (
        <CollectionFeedback
          error={state.error}
          onReset={reset}
          onRetry={retry}
        />
      ) : null}
      {!state.loading && !state.error && state.response ? (
        <section className="surface collection-results">
          <CollectionMeta
            correlationId={state.response.correlationId}
            maskedFields={state.response.authorization.maskedFields}
          />
          {state.response.items.length === 0 ? (
            <div className="collection-empty">
              <strong>条件に一致する従業員はいません</strong>
              <p>検索条件を減らすか、組織 scope を確認してください。</p>
              <button
                className="secondary-button"
                type="button"
                onClick={reset}
              >
                条件をリセット
              </button>
            </div>
          ) : (
            <div className="table-scroll collection-table-scroll">
              <table>
                <caption className="sr-only">従業員検索結果</caption>
                <thead>
                  <tr>
                    <th scope="col">従業員</th>
                    <th scope="col">状態</th>
                    <th scope="col">組織</th>
                    <th scope="col">ポジション</th>
                    <th scope="col">入社日</th>
                    <th scope="col">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.response.items.map((employee) => (
                    <tr key={employee.employeeId}>
                      <td data-label="従業員">
                        <strong>{employee.displayName}</strong>
                        <small>{employee.employeeId}</small>
                      </td>
                      <td data-label="状態">
                        <span
                          className={`table-status ${employeeStatusClass(
                            employee.employmentStatus,
                          )}`}
                        >
                          {employeeStatusLabel(employee.employmentStatus)}
                        </span>
                      </td>
                      <td data-label="組織">
                        {nullableEmployeeField(
                          employee.organizationCode,
                          "organizationCode",
                          maskedFields,
                        )}
                      </td>
                      <td data-label="ポジション">
                        {nullableEmployeeField(
                          employee.positionCode,
                          "positionCode",
                          maskedFields,
                        )}
                      </td>
                      <td data-label="入社日">
                        {formatDate(employee.hireDate)}
                      </td>
                      <td data-label="操作">
                        {onOpenEmployee ? (
                          <button
                            className="row-action"
                            type="button"
                            aria-label={`${employee.displayName}の詳細を開く`}
                            onClick={() =>
                              onOpenEmployee(employee, appliedAsOf)
                            }
                          >
                            詳細
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="muted">閲覧不可</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls
            count={state.response.items.length}
            canGoPrevious={canGoPrevious}
            hasNextPage={state.response.pageInfo.hasNextPage}
            onPrevious={goToPrevious}
            onNext={() => {
              if (state.response?.pageInfo.nextCursor) {
                applyNextQuery({
                  ...state.location.query,
                  cursor: state.response.pageInfo.nextCursor,
                });
              }
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

interface LifecycleListDraft {
  q: string;
  requestType: LifecycleRequestListItem["requestType"] | "";
  status: LifecycleRequestListItem["status"] | "";
  effectiveFrom: string;
  effectiveTo: string;
  sort: NonNullable<LifecycleRequestListQuery["sort"]>;
  direction: NonNullable<LifecycleRequestListQuery["direction"]>;
  limit: NonNullable<LifecycleRequestListQuery["limit"]>;
}

function lifecycleDraftFromQuery(
  query: LifecycleRequestListQuery,
): LifecycleListDraft {
  return {
    q: query.q ?? "",
    requestType: query.requestType?.[0] ?? "",
    status: query.status?.[0] ?? "",
    effectiveFrom: query.effectiveFrom ?? "",
    effectiveTo: query.effectiveTo ?? "",
    sort: query.sort ?? "requestedAt",
    direction: query.direction ?? "desc",
    limit: query.limit ?? 25,
  };
}

export function LifecycleListView({
  personaId,
  onOpenRequest,
}: {
  personaId: BoundedPersonaId;
  onOpenRequest: ((request: LifecycleRequestListItem) => void) | null;
}) {
  const load = useCallback(
    (query: LifecycleRequestListQuery, signal: AbortSignal) =>
      fetchLifecycleRequests(query, createP2ListRequestInit(personaId, signal)),
    [personaId],
  );
  const {
    state,
    applyQuery,
    applyNextQuery,
    canGoPrevious,
    goToPrevious,
    retry,
  } = useBoundedCollection<
    LifecycleRequestListQuery,
    LifecycleRequestListResponse
  >({
    view: "lifecycle",
    parse: parseLifecycleListQuery,
    load,
  });
  const [draft, setDraft] = useState<LifecycleListDraft>(() =>
    lifecycleDraftFromQuery(state.location.query),
  );
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(lifecycleDraftFromQuery(state.location.query));
  }, [state.location.query]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.q.trim() !== draft.q) {
      setDraftError("検索条件の前後に空白を含めないでください。");
      return;
    }
    if ((draft.effectiveFrom === "") !== (draft.effectiveTo === "")) {
      setDraftError("適用日の開始日と終了日を両方指定してください。");
      return;
    }
    if (
      draft.effectiveFrom &&
      draft.effectiveTo &&
      draft.effectiveFrom > draft.effectiveTo
    ) {
      setDraftError("適用日の開始日は終了日以前にしてください。");
      return;
    }
    setDraftError(null);
    const currentQuery = state.location.query;
    const requestType =
      draft.requestType === (currentQuery.requestType?.[0] ?? "")
        ? currentQuery.requestType
        : draft.requestType
          ? [draft.requestType]
          : undefined;
    const status =
      draft.status === (currentQuery.status?.[0] ?? "")
        ? currentQuery.status
        : draft.status
          ? [draft.status]
          : undefined;
    applyQuery({
      ...currentQuery,
      q: draft.q || undefined,
      requestType,
      status,
      effectiveFrom: draft.effectiveFrom || undefined,
      effectiveTo: draft.effectiveTo || undefined,
      sort: draft.sort,
      direction: draft.direction,
      limit: draft.limit,
      cursor: undefined,
    });
  };

  const reset = () => {
    setDraftError(null);
    setDraft(lifecycleDraftFromQuery(defaultLifecycleListQuery));
    applyQuery(defaultLifecycleListQuery);
  };

  return (
    <div className="collection-view" aria-labelledby="lifecycle-list-heading">
      <section className="surface collection-header">
        <div>
          <p className="context-label">Lifecycle collection</p>
          <h2 id="lifecycle-list-heading">手続きを横断検索</h2>
          <p>入社・異動・退職の bounded request evidence を確認します。</p>
        </div>
        <ClipboardList size={24} aria-hidden="true" />
      </section>

      <form className="surface collection-filters" onSubmit={submit}>
        <label className="collection-search-field">
          <span>対象者・従業員ID</span>
          <span className="input-with-icon">
            <Search size={16} aria-hidden="true" />
            <input
              value={draft.q}
              maxLength={100}
              placeholder="許可された検索語"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  q: event.target.value,
                }))
              }
            />
          </span>
        </label>
        <label>
          <span>手続き種別</span>
          <select
            value={draft.requestType}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                requestType: event.target
                  .value as LifecycleListDraft["requestType"],
              }))
            }
          >
            <option value="">すべて</option>
            <option value="onboarding">入社</option>
            <option value="transfer">異動</option>
            <option value="termination">退職</option>
          </select>
        </label>
        <label>
          <span>状態</span>
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as LifecycleListDraft["status"],
              }))
            }
          >
            <option value="">すべて</option>
            <option value="draft">下書き</option>
            <option value="submitted">申請済み</option>
            <option value="returned">差戻し</option>
            <option value="rejected">却下</option>
            <option value="cancelled">取消</option>
            <option value="approved">承認済み</option>
            <option value="completed">完了</option>
          </select>
        </label>
        <label>
          <span>適用日（開始）</span>
          <input
            type="date"
            value={draft.effectiveFrom}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                effectiveFrom: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>適用日（終了）</span>
          <input
            type="date"
            value={draft.effectiveTo}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                effectiveTo: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>並び順</span>
          <select
            value={draft.sort}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sort: event.target.value as LifecycleListDraft["sort"],
              }))
            }
          >
            <option value="requestedAt">申請日時</option>
            <option value="effectiveDate">適用日</option>
          </select>
        </label>
        <label>
          <span>方向</span>
          <select
            value={draft.direction}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                direction: event.target
                  .value as LifecycleListDraft["direction"],
              }))
            }
          >
            <option value="desc">降順</option>
            <option value="asc">昇順</option>
          </select>
        </label>
        <label>
          <span>表示件数</span>
          <select
            value={draft.limit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                limit: Number(event.target.value),
              }))
            }
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div className="collection-filter-actions">
          <button className="secondary-button" type="button" onClick={reset}>
            リセット
          </button>
          <button type="submit">
            <Search size={16} aria-hidden="true" />
            検索
          </button>
        </div>
        {draftError ? (
          <p className="collection-form-error" role="alert">
            {draftError}
          </p>
        ) : null}
      </form>

      {state.loading ? <LoadingState /> : null}
      {!state.loading && state.error ? (
        <CollectionFeedback
          error={state.error}
          onReset={reset}
          onRetry={retry}
        />
      ) : null}
      {!state.loading && !state.error && state.response ? (
        <section className="surface collection-results">
          <CollectionMeta
            correlationId={state.response.correlationId}
            maskedFields={state.response.authorization.maskedFields}
          />
          {state.response.items.length === 0 ? (
            <div className="collection-empty">
              <strong>条件に一致する手続きはありません</strong>
              <p>種別・状態・適用日の条件を見直してください。</p>
              <button
                className="secondary-button"
                type="button"
                onClick={reset}
              >
                条件をリセット
              </button>
            </div>
          ) : (
            <div className="table-scroll collection-table-scroll">
              <table>
                <caption className="sr-only">手続き検索結果</caption>
                <thead>
                  <tr>
                    <th scope="col">対象者</th>
                    <th scope="col">種別</th>
                    <th scope="col">状態</th>
                    <th scope="col">組織</th>
                    <th scope="col">申請日時</th>
                    <th scope="col">適用日</th>
                    <th scope="col">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.response.items.map((request) => (
                    <tr key={request.transactionRequestId}>
                      <td data-label="対象者">
                        <strong>{request.subjectDisplayName}</strong>
                        <small>
                          {request.subjectEmployeeId ??
                            request.transactionRequestId}
                        </small>
                      </td>
                      <td data-label="種別">
                        {lifecycleTypeLabel(request.requestType)}
                      </td>
                      <td data-label="状態">
                        <span
                          className={`table-status ${lifecycleStatusClass(
                            request.status,
                          )}`}
                        >
                          {lifecycleStatusLabel(request.status)}
                        </span>
                      </td>
                      <td data-label="組織">{request.organizationCode}</td>
                      <td data-label="申請日時">
                        <time dateTime={request.requestedAt}>
                          {formatDateTime(request.requestedAt)}
                        </time>
                      </td>
                      <td data-label="適用日">
                        <time dateTime={request.effectiveDate}>
                          {formatDate(request.effectiveDate)}
                        </time>
                      </td>
                      <td data-label="操作">
                        {onOpenRequest ? (
                          <button
                            className="row-action"
                            type="button"
                            aria-label={`${request.subjectDisplayName}の${lifecycleTypeLabel(
                              request.requestType,
                            )}手続きを開く`}
                            onClick={() => onOpenRequest(request)}
                          >
                            詳細
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="muted">閲覧不可</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PaginationControls
            count={state.response.items.length}
            canGoPrevious={canGoPrevious}
            hasNextPage={state.response.pageInfo.hasNextPage}
            onPrevious={goToPrevious}
            onNext={() => {
              if (state.response?.pageInfo.nextCursor) {
                applyNextQuery({
                  ...state.location.query,
                  cursor: state.response.pageInfo.nextCursor,
                });
              }
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
