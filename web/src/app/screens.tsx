import {
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Cloud,
  Search,
} from "lucide-react";
import {
  type OnboardingRequest,
  type OpsDlqEvidence,
  type PlannedArea,
  type RouteId,
  type TerminationRequest,
  type TransferRequest,
} from "./model";
import { EvidenceItem, SummaryCard } from "./shared";

export function DashboardView({
  onboardingRequest,
  transferRequest,
  terminationRequest,
  opsDlqEvidence,
  onNavigate,
  canNavigate,
}: {
  onboardingRequest: OnboardingRequest | null;
  transferRequest: TransferRequest | null;
  terminationRequest: TerminationRequest | null;
  opsDlqEvidence: OpsDlqEvidence;
  onNavigate: (route: RouteId) => void;
  canNavigate: (route: RouteId) => boolean;
}) {
  const requests = [
    onboardingRequest,
    transferRequest,
    terminationRequest,
  ].filter(
    (
      request,
    ): request is OnboardingRequest | TransferRequest | TerminationRequest =>
      request !== null,
  );
  const submittedCount = requests.filter(
    (request) => request.status === "submitted",
  ).length;
  const draftCount = Math.max(3, requests.length);

  const schedule: Array<{
    time: string;
    title: string;
    meta: string;
    route: RouteId;
  }> = [
    {
      time: "09:00",
      title: "入社開始",
      meta: "3名 / 東京",
      route: "onboarding",
    },
    {
      time: "11:30",
      title: "異動適用",
      meta: "2件が承認待ち",
      route: "transfer",
    },
    {
      time: "18:00",
      title: "future-date apply",
      meta: "7件の予定変更",
      route: "ops",
    },
    {
      time: "20:00",
      title: "SmartHR 再照合",
      meta: "夜間ジョブ",
      route: "ops",
    },
  ];
  const visibleSchedule = schedule.filter((item) => canNavigate(item.route));
  const drafts: Array<{
    title: string;
    detail: string;
    time: string;
    route: RouteId;
  }> = [
    {
      title: "異動手続き / 山田 太郎",
      detail: "営業本部からコーポレートIT",
      time: "09:18",
      route: "transfer",
    },
    {
      title: "退職手続き / 鈴木 一郎",
      detail: "有効日 2026/08/31",
      time: "08:42",
      route: "termination",
    },
    {
      title: "入社手続き / 田中 美咲",
      detail: "必須項目を確認中",
      time: "昨日 18:11",
      route: "onboarding",
    },
  ];
  const visibleDrafts = drafts.filter((item) => canNavigate(item.route));

  return (
    <div className="dashboard-view">
      <section className="summary-grid" aria-label="本日の業務サマリー">
        <SummaryCard
          label="本日の対応"
          value="12"
          detail={`承認 ${submittedCount || 3}件 / 下書き ${draftCount}件`}
          tone="blue"
          icon={ClipboardList}
        />
        <SummaryCard
          label="連携ヘルス"
          value="98.7%"
          detail="writeback 保留 1件"
          tone="green"
          icon={Cloud}
        />
        <SummaryCard
          label="要確認"
          value={String(Math.max(4, submittedCount))}
          detail="影響レビューあり"
          tone="amber"
          icon={CircleAlert}
        />
        <SummaryCard
          label="DLQ"
          value={opsDlqEvidence.status === "open" ? "2" : "1"}
          detail="担当割当待ち"
          tone="red"
          icon={Bell}
        />
      </section>

      <div className="dashboard-grid">
        <section
          className="surface schedule-surface"
          aria-labelledby="schedule"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Work queue</p>
              <h2 id="schedule">今日と7日以内</h2>
            </div>
            <CalendarClock size={20} aria-hidden="true" />
          </div>
          <div className="schedule-list">
            {visibleSchedule.length > 0 ? (
              visibleSchedule.map((item) => (
                <button
                  className="schedule-row"
                  key={`${item.time}-${item.title}`}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                >
                  <time>{item.time}</time>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))
            ) : (
              <p className="muted">
                この persona で利用できる予定導線はありません。
              </p>
            )}
          </div>
        </section>

        <section
          className="surface integration-surface"
          aria-labelledby="integration-status"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Integration health</p>
              <h2 id="integration-status">連携状況</h2>
            </div>
            <CircleCheck size={20} aria-hidden="true" />
          </div>
          <div className="integration-list">
            <div>
              <span>Okta 主系同期</span>
              <strong className="state-success">正常</strong>
              <time>09:42</time>
            </div>
            <div>
              <span>Entra シャドー同期</span>
              <strong className="state-warning">差分 2件</strong>
              <time>09:40</time>
            </div>
            <div>
              <span>会社メール writeback</span>
              <strong className="state-warning">1件保留</strong>
              <time>09:37</time>
            </div>
            <div>
              <span>SmartHR 再照合</span>
              <strong className="state-success">完了</strong>
              <time>02:10</time>
            </div>
          </div>
        </section>

        <section className="surface drafts-surface" aria-labelledby="drafts">
          <div className="section-heading">
            <div>
              <p className="context-label">Recent activity</p>
              <h2 id="drafts">最近の下書き</h2>
            </div>
          </div>
          <div className="draft-list">
            {visibleDrafts.length > 0 ? (
              visibleDrafts.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <time>{item.time}</time>
                </button>
              ))
            ) : (
              <p className="muted">
                この persona で利用できる下書き導線はありません。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function EmployeeDetailView({
  onOpenTransfer,
}: {
  onOpenTransfer: (() => void) | null;
}) {
  return (
    <div className="employee-detail">
      <section className="surface employee-hero">
        <div className="employee-avatar" aria-hidden="true">
          山
        </div>
        <div className="employee-identity">
          <p className="context-label">Repository-owned synthetic record</p>
          <h2>山田 太郎</h2>
          <p>社員番号 EMP-000128 / 正社員 / 2024/04/01 入社</p>
          <div className="badge-row" aria-label="従業員状態">
            <span className="soft-badge state-success">在籍中</span>
            <span className="soft-badge">主系: Okta</span>
            <span className="soft-badge">会社メール連携済</span>
          </div>
        </div>
        {onOpenTransfer ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onOpenTransfer}
          >
            異動手続きを開く
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <div className="employee-grid">
        <section className="surface" aria-labelledby="basic-information">
          <div className="section-heading">
            <div>
              <p className="context-label">Masked where required</p>
              <h2 id="basic-information">基本情報</h2>
            </div>
          </div>
          <dl className="profile-grid">
            <div>
              <dt>氏名</dt>
              <dd>山田 太郎</dd>
            </div>
            <div>
              <dt>氏名カナ</dt>
              <dd>ヤマダ タロウ</dd>
            </div>
            <div>
              <dt>個人番号</dt>
              <dd>PER-000128</dd>
            </div>
            <div>
              <dt>社員番号</dt>
              <dd>EMP-000128</dd>
            </div>
            <div>
              <dt>所属</dt>
              <dd>営業本部 / 第1営業部</dd>
            </div>
            <div>
              <dt>役職</dt>
              <dd>主任</dd>
            </div>
            <div>
              <dt>勤務地</dt>
              <dd>東京本社</dd>
            </div>
            <div>
              <dt>上長</dt>
              <dd>佐藤 花子</dd>
            </div>
            <div>
              <dt>会社メール</dt>
              <dd>taro.yamada@***</dd>
            </div>
            <div>
              <dt>携帯番号</dt>
              <dd>090-****-5678</dd>
            </div>
          </dl>
        </section>

        <section
          className="surface timeline-surface"
          aria-labelledby="timeline"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Lifecycle evidence</p>
              <h2 id="timeline">履歴タイムライン</h2>
            </div>
          </div>
          <ol className="timeline">
            <li>
              <time>2026/04/01</time>
              <span>
                <strong>会社メール連携</strong>
                <small>Okta から work_email を反映</small>
              </span>
            </li>
            <li>
              <time>2025/10/01</time>
              <span>
                <strong>異動</strong>
                <small>営業第2グループから第1グループ</small>
              </span>
            </li>
            <li>
              <time>2024/04/01</time>
              <span>
                <strong>入社</strong>
                <small>営業本部へ配属、アカウント自動作成</small>
              </span>
            </li>
          </ol>
        </section>

        <section
          className="surface external-identities"
          aria-labelledby="external-identities"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Bounded provider evidence</p>
              <h2 id="external-identities">外部ID / 連携状態</h2>
            </div>
          </div>
          <div className="integration-list">
            <div>
              <span>Okta</span>
              <code>00u3abcxyz</code>
              <strong className="state-success">同期正常</strong>
            </div>
            <div>
              <span>Entra</span>
              <code>shadow:9c1f...</code>
              <strong className="state-success">差分なし</strong>
            </div>
            <div>
              <span>SmartHR</span>
              <code>employee:128</code>
              <strong className="state-warning">再照合予定</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function SecondaryAreaView({ area }: { area: PlannedArea }) {
  const Icon = area.icon;
  const isSupport = area.id === "support";

  return (
    <section
      className="surface secondary-area"
      aria-labelledby="secondary-area"
    >
      <span className="secondary-area-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <div>
        <p className="context-label">{area.eyebrow}</p>
        <h2 id="secondary-area">{area.title}</h2>
        <p>{area.summary}</p>
      </div>
      <div className="secondary-area-list">
        {isSupport ? (
          <>
            <div>
              <span>対象</span>
              <strong>EMP-000128 / 山田 太郎</strong>
            </div>
            <div>
              <span>参照境界</span>
              <strong>single subject only</strong>
            </div>
            <div>
              <span>最新記録</span>
              <strong>異動影響の確認依頼</strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Environment label</span>
              <strong>non-production</strong>
            </div>
            <div>
              <span>Primary provider</span>
              <strong>Okta mock</strong>
            </div>
            <div>
              <span>Production controls</span>
              <strong className="state-warning">blocked</strong>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function AuditWorkflow() {
  return (
    <div className="workflow-grid">
      <section className="workflow-panel" aria-labelledby="audit-lookup">
        <div>
          <p className="context-label">Single correlation boundary</p>
          <h3 id="audit-lookup">Direct correlation lookup</h3>
        </div>
        <label className="audit-lookup">
          Correlation ID
          <span>
            <Search size={17} aria-hidden="true" />
            <input
              defaultValue="correlation-transfer-001"
              aria-describedby="audit-lookup-boundary"
            />
          </span>
        </label>
        <EvidenceItem
          title="Lookup boundary"
          body="Operators can inspect one explicit synthetic correlation at a time. Broad search, raw payload export, production authorization, and immutable production audit claims remain blocked."
        />
        <p id="audit-lookup-boundary" className="muted">
          完全一致する repository-owned synthetic ID のみ参照できます。
        </p>
      </section>

      <section className="workflow-panel" aria-labelledby="audit-evidence">
        <div>
          <p className="context-label">Authoritative lifecycle evidence</p>
          <h3 id="audit-evidence">Evidence timeline</h3>
        </div>
        <ol className="audit-timeline">
          <li>
            <CircleCheck size={17} aria-hidden="true" />
            <span>
              <strong>Request submitted</strong>
              <small>mvp_b.transfer.submitted / 09:18</small>
            </span>
          </li>
          <li>
            <CircleCheck size={17} aria-hidden="true" />
            <span>
              <strong>Impact projection recorded</strong>
              <small>repository-owned mock provider / 09:18</small>
            </span>
          </li>
          <li>
            <CalendarClock size={17} aria-hidden="true" />
            <span>
              <strong>Approval pending</strong>
              <small>bounded approver queue / due 17:00</small>
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}
