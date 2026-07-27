import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import {
  p2ListExportMaximumRows,
  p2ListExportReasonCodes,
  p2ListMaximumDateRangeDays,
  type P2ListExportReasonCode,
} from "../../../src/p2list-contract";
import {
  type BoundedExportArtifact,
  type EmployeeListItem,
  type EmployeeListQuery,
  type EmployeeListResponse,
  type LifecycleRequestListItem,
  type LifecycleRequestListQuery,
  type LifecycleRequestListResponse,
  ApiClientError,
  createP2ListRequestInit,
  fetchEmployeeExport,
  fetchEmployees,
  fetchLifecycleExport,
  fetchLifecycleRequests,
} from "../api-client";
import type { BoundedPersonaId } from "../persona";
import {
  defaultEmployeeListQuery,
  defaultLifecycleListQuery,
  isLifecycleRangeTooWide,
  type ListView,
  type ParsedListQuery,
  parseEmployeeListQuery,
  parseLifecycleListQuery,
  validateBoundedQuery,
  writeListQuery,
} from "./list-query-state";
import { employeeStatusClass, lifecycleStatusClass } from "./record-status";
import { LoadingState } from "./shared";

const presetPageSizes = [25, 50, 100] as const;

type CollectionErrorKind = "denied" | "invalid" | "service" | "network";

interface CollectionError {
  kind: CollectionErrorKind;
  title: string;
  body: string;
  correlationId?: string;
}

interface CollectionState<Query, Response> {
  location: ParsedListQuery<Query>;
  response: Response | null;
  loading: boolean;
  error: CollectionError | null;
}

interface CollectionHistoryState {
  p2ListCollection?: {
    view: ListView;
    previousLocations: string[];
  };
}

function collectionHistoryState(
  view: ListView,
  previousLocations: string[],
): CollectionHistoryState {
  return {
    p2ListCollection: {
      view,
      previousLocations,
    },
  };
}

function readPreviousLocations(view: ListView): string[] {
  const state = window.history.state as CollectionHistoryState | null;
  const candidate = state?.p2ListCollection;
  if (
    candidate?.view !== view ||
    !Array.isArray(candidate.previousLocations) ||
    candidate.previousLocations.length > 100
  ) {
    return [];
  }
  const locations: string[] = [];
  for (const location of candidate.previousLocations) {
    if (typeof location !== "string") {
      return [];
    }
    let url: URL;
    try {
      url = new URL(location, window.location.href);
    } catch {
      return [];
    }
    if (
      url.origin !== window.location.origin ||
      url.searchParams.get("view") !== view
    ) {
      return [];
    }
    locations.push(`${url.pathname}${url.search}${url.hash}`);
  }
  return locations;
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
  const [previousLocations, setPreviousLocations] = useState<string[]>(() =>
    readPreviousLocations(view),
  );

  useEffect(() => {
    const handlePopState = () => {
      setPreviousLocations(readPreviousLocations(view));
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
    (query: Query, previousQuery?: Query) => {
      if (previousQuery) {
        writeListQuery(
          view,
          previousQuery as EmployeeListQuery | LifecycleRequestListQuery,
          "replace",
          window.history.state,
        );
      }
      const previousLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextPreviousLocations = [...previousLocations, previousLocation];
      setPreviousLocations(nextPreviousLocations);
      writeListQuery(
        view,
        query as EmployeeListQuery | LifecycleRequestListQuery,
        "push",
        collectionHistoryState(view, nextPreviousLocations),
      );
      setLocation({ query, errors: [] });
    },
    [previousLocations, view],
  );

  const goToPrevious = useCallback(() => {
    const previousLocation = previousLocations.at(-1);
    if (!previousLocation) {
      return;
    }
    const nextPreviousLocations = previousLocations.slice(0, -1);
    window.history.pushState(
      collectionHistoryState(view, nextPreviousLocations),
      "",
      previousLocation,
    );
    setPreviousLocations(nextPreviousLocations);
    setLocation(parse());
  }, [parse, previousLocations, view]);

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
    const status =
      caught.status ?? Number(caught.message.match(/: (\d{3})$/u)?.[1]);
    if (status === 401 || status === 403) {
      return {
        kind: "denied",
        title: "この一覧を表示する権限が確認できません",
        body: "サーバーの actor context と bounded data scope を確認してください。persona の表示状態だけではアクセスできません。",
        correlationId: caught.correlationId,
      };
    }
    if (status === 400) {
      return {
        kind: "invalid",
        title: "検索条件またはページ情報が無効です",
        body: "条件をリセットして再実行してください。期限切れ・改変済み cursor は再利用できません。",
        correlationId: caught.correlationId,
      };
    }
    return {
      kind: "service",
      title: "一覧APIの応答を確認できません",
      body: "APIサーバーの障害または応答契約の不一致が発生しました。同じ条件で再試行してください。",
      correlationId: caught.correlationId,
    };
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
        {error.correlationId ? (
          <p>
            correlation <code>{error.correlationId}</code>
          </p>
        ) : null}
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
  appliedAsOf,
}: {
  correlationId: string;
  maskedFields: readonly string[];
  appliedAsOf?: string;
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
      {appliedAsOf ? (
        <span>
          基準日{" "}
          <strong>
            <time dateTime={appliedAsOf}>{formatDate(appliedAsOf)}</time>
          </strong>
        </span>
      ) : null}
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

const exportReasonLabels: Record<P2ListExportReasonCode, string> = {
  uat_reconciliation: "UAT照合",
  operational_reconciliation: "業務照合",
  authorized_case_support: "許可済みケース支援",
  data_quality_investigation: "データ品質調査",
};

function BoundedExportControl({
  meaningfulFilter,
  missingFilterMessage,
  requestExport,
}: {
  meaningfulFilter: boolean;
  missingFilterMessage: string;
  requestExport: (
    reasonCode: P2ListExportReasonCode,
  ) => Promise<BoundedExportArtifact>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reasonCode, setReasonCode] = useState<P2ListExportReasonCode | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
    correlationId?: string;
  } | null>(null);

  const confirmExport = async () => {
    if (!meaningfulFilter) {
      setFeedback({ kind: "error", message: missingFilterMessage });
      return;
    }
    if (!reasonCode) {
      setFeedback({
        kind: "error",
        message: "出力理由を選択してください。",
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const artifact = await requestExport(reasonCode);
      downloadExportArtifact(artifact);
      setConfirming(false);
      setReasonCode("");
      setFeedback({
        kind: "success",
        message: `${artifact.fileName} のダウンロードを開始しました。`,
        correlationId: artifact.correlationId,
      });
    } catch (caught: unknown) {
      setFeedback(classifyExportError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="surface bounded-export" aria-label="CSV出力">
      <div>
        <strong>現在の絞り込み結果をCSV出力</strong>
        <p>
          repository-owned synthetic data のみ、最大 {p2ListExportMaximumRows}{" "}
          件です。上限超過時は出力せず拒否します。
        </p>
      </div>
      {!confirming ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setConfirming(true);
            setFeedback(null);
          }}
        >
          <Download size={16} aria-hidden="true" />
          CSV出力
        </button>
      ) : (
        <div className="bounded-export-confirmation">
          <label>
            <span>出力理由</span>
            <select
              value={reasonCode}
              disabled={submitting}
              onChange={(event) =>
                setReasonCode(event.target.value as P2ListExportReasonCode | "")
              }
            >
              <option value="">選択してください</option>
              {p2ListExportReasonCodes.map((reason) => (
                <option key={reason} value={reason}>
                  {exportReasonLabels[reason]}
                </option>
              ))}
            </select>
          </label>
          <p>
            現在適用中の検索条件と権限をサーバーで再評価し、CSVを同期生成します。
          </p>
          <div>
            <button
              className="secondary-button"
              type="button"
              disabled={submitting}
              onClick={() => {
                setConfirming(false);
                setReasonCode("");
                setFeedback(null);
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void confirmExport()}
            >
              <Download size={16} aria-hidden="true" />
              {submitting ? "出力中" : "確認して出力"}
            </button>
          </div>
        </div>
      )}
      {feedback ? (
        <p
          className={`bounded-export-feedback export-${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
          {feedback.correlationId ? (
            <>
              {" "}
              correlation <code>{feedback.correlationId}</code>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

function classifyExportError(caught: unknown): {
  kind: "error";
  message: string;
  correlationId?: string;
} {
  if (!(caught instanceof ApiClientError)) {
    return {
      kind: "error",
      message:
        "CSV出力APIに接続できません。ネットワークとAPIサーバーを確認してください。",
    };
  }
  let message =
    "CSV出力を完了できませんでした。APIサーバーの状態を確認してください。";
  if (caught.status === 401 || caught.status === 403) {
    message =
      "一覧閲覧・CSV出力・ダウンロードのいずれかの権限、または bounded data scope が確認できません。";
  } else if (caught.code === "export_row_limit_exceeded") {
    message = `対象が ${p2ListExportMaximumRows} 件を超えています。条件をさらに絞り込んでください。`;
  } else if (caught.code === "export_filter_required") {
    message = "CSV出力には識別可能な絞り込み条件が必要です。";
  } else if (
    caught.code === "export_reason_code_required" ||
    caught.code === "export_reason_code_unsupported"
  ) {
    message = "許可された出力理由を選択してください。";
  } else if (caught.status === 400 || caught.status === 422) {
    message =
      "CSV出力条件が受理されませんでした。絞り込み条件と出力理由を確認してください。";
  }
  return {
    kind: "error",
    message,
    ...(caught.correlationId ? { correlationId: caught.correlationId } : {}),
  };
}

function downloadExportArtifact(artifact: BoundedExportArtifact): void {
  const objectUrl = URL.createObjectURL(
    new Blob([artifact.csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = artifact.fileName;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
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

function lifecycleEmployeeId(
  request: LifecycleRequestListItem,
  maskedFields: readonly (keyof LifecycleRequestListItem)[],
) {
  if (request.subjectEmployeeId !== null) {
    return request.subjectEmployeeId;
  }
  return maskedFields.includes("subjectEmployeeId") ? "masked" : "未採番";
}

function hasMeaningfulLifecycleExportFilter(
  filters: LifecycleRequestListResponse["appliedFilters"],
): boolean {
  return Boolean(
    filters.subjectEmployeeId ||
    filters.organizationCode ||
    filters.correlationId ||
    (filters.requestedFrom && filters.requestedTo) ||
    (filters.effectiveFrom && filters.effectiveTo),
  );
}

function pageSizeOptions(limit: number) {
  return presetPageSizes.includes(limit as (typeof presetPageSizes)[number])
    ? presetPageSizes
    : [...presetPageSizes, limit].sort((left, right) => left - right);
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
    const queryError = draft.q ? validateBoundedQuery(draft.q) : null;
    if (queryError) {
      setDraftError(queryError);
      return;
    }
    setDraftError(null);
    applyQuery({
      ...state.location.query,
      asOf: state.response?.appliedFilters.asOf ?? state.location.query.asOf,
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
            {pageSizeOptions(draft.limit).map((limit) => (
              <option value={limit} key={limit}>
                {limit}
              </option>
            ))}
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

      {!state.loading && !state.error && state.response ? (
        <BoundedExportControl
          key={`employee-export-${state.response.correlationId}`}
          meaningfulFilter={Boolean(
            state.response.appliedFilters.employeeId ||
            state.response.appliedFilters.organizationCode,
          )}
          missingFilterMessage="従業員IDまたは組織コードで絞り込んでからCSV出力してください。"
          requestExport={(reasonCode) =>
            fetchEmployeeExport(
              state.response!.appliedFilters,
              reasonCode,
              createP2ListRequestInit(personaId),
            )
          }
        />
      ) : null}

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
            appliedAsOf={appliedAsOf}
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
                const snapshotQuery = {
                  ...state.location.query,
                  asOf: state.response.appliedFilters.asOf,
                };
                applyNextQuery(
                  {
                    ...snapshotQuery,
                    cursor: state.response.pageInfo.nextCursor,
                  },
                  snapshotQuery,
                );
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
  requestType: LifecycleRequestListItem["requestType"][];
  status: LifecycleRequestListItem["status"][];
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
    requestType: query.requestType ?? [],
    status: query.status ?? [],
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
    const queryError = draft.q ? validateBoundedQuery(draft.q) : null;
    if (queryError) {
      setDraftError(queryError);
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
    if (
      draft.effectiveFrom &&
      draft.effectiveTo &&
      isLifecycleRangeTooWide(draft.effectiveFrom, draft.effectiveTo, "date")
    ) {
      setDraftError(
        `適用日の範囲は ${p2ListMaximumDateRangeDays} 日以内で指定してください。`,
      );
      return;
    }
    setDraftError(null);
    const currentQuery = state.location.query;
    applyQuery({
      ...currentQuery,
      q: draft.q || undefined,
      requestType: draft.requestType.length > 0 ? draft.requestType : undefined,
      status: draft.status.length > 0 ? draft.status : undefined,
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
  const maskedFields = state.response?.authorization.maskedFields ?? [];
  const allRetainedFilters: Array<{
    key: string;
    label: string;
    value: string;
    clearKeys: Array<keyof LifecycleRequestListQuery>;
  }> = [
    {
      key: "subjectEmployeeId",
      label: "従業員ID",
      value: state.location.query.subjectEmployeeId ?? "",
      clearKeys: ["subjectEmployeeId"],
    },
    {
      key: "organizationCode",
      label: "組織コード",
      value: state.location.query.organizationCode ?? "",
      clearKeys: ["organizationCode"],
    },
    {
      key: "decidedBy",
      label: "決裁者",
      value: state.location.query.decidedBy ?? "",
      clearKeys: ["decidedBy"],
    },
    {
      key: "requestedRange",
      label: "申請日時",
      value:
        state.location.query.requestedFrom && state.location.query.requestedTo
          ? `${formatDateTime(state.location.query.requestedFrom)} – ${formatDateTime(
              state.location.query.requestedTo,
            )}`
          : (state.location.query.requestedFrom ??
            state.location.query.requestedTo ??
            ""),
      clearKeys: ["requestedFrom", "requestedTo"],
    },
    {
      key: "correlationId",
      label: "correlation",
      value: state.location.query.correlationId ?? "",
      clearKeys: ["correlationId"],
    },
  ];
  const retainedFilters = allRetainedFilters.filter(
    (filter) => filter.value !== "",
  );

  const clearRetainedFilter = (
    clearKeys: Array<keyof LifecycleRequestListQuery>,
  ) => {
    const query = { ...state.location.query, cursor: undefined };
    for (const key of clearKeys) {
      delete query[key];
    }
    applyQuery(query);
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
            multiple
            size={3}
            value={draft.requestType}
            onChange={(event) => {
              const requestType = Array.from(
                event.currentTarget.selectedOptions,
                (option) =>
                  option.value as LifecycleRequestListItem["requestType"],
              );
              setDraft((current) => ({
                ...current,
                requestType,
              }));
            }}
          >
            <option value="onboarding">入社</option>
            <option value="transfer">異動</option>
            <option value="termination">退職</option>
          </select>
        </label>
        <label>
          <span>状態</span>
          <select
            multiple
            size={5}
            value={draft.status}
            onChange={(event) => {
              const status = Array.from(
                event.currentTarget.selectedOptions,
                (option) => option.value as LifecycleRequestListItem["status"],
              );
              setDraft((current) => ({
                ...current,
                status,
              }));
            }}
          >
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
            {pageSizeOptions(draft.limit).map((limit) => (
              <option value={limit} key={limit}>
                {limit}
              </option>
            ))}
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

      {retainedFilters.length > 0 ? (
        <div
          className="collection-active-filters"
          aria-label="適用中の追加条件"
        >
          <strong>追加条件</strong>
          <div>
            {retainedFilters.map((filter) => (
              <span className="collection-filter-chip" key={filter.key}>
                <span>{filter.label}</span>
                <code>{filter.value}</code>
                <button
                  type="button"
                  title={`${filter.label}を解除`}
                  aria-label={`${filter.label}を解除`}
                  onClick={() => clearRetainedFilter(filter.clearKeys)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!state.loading && !state.error && state.response ? (
        <BoundedExportControl
          key={`lifecycle-export-${state.response.correlationId}`}
          meaningfulFilter={hasMeaningfulLifecycleExportFilter(
            state.response.appliedFilters,
          )}
          missingFilterMessage="従業員ID、組織コード、correlation、申請日時範囲、または適用日範囲で絞り込んでからCSV出力してください。"
          requestExport={(reasonCode) =>
            fetchLifecycleExport(
              state.response!.appliedFilters,
              reasonCode,
              createP2ListRequestInit(personaId),
            )
          }
        />
      ) : null}

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
                          {lifecycleEmployeeId(request, maskedFields)}
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
