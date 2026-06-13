export type BoundedPersonaId =
  | "hr-operator"
  | "approver"
  | "hr-ops-support"
  | "bounded-admin";

export interface BoundedPersona {
  id: BoundedPersonaId;
  label: string;
  role: string;
  tenantEnvironment: string;
  allowedRoutes: readonly string[];
}

export interface PersonaDecision {
  allowed: boolean;
  reason: string;
  persona: BoundedPersona | null;
}

export const BOUNDED_TENANT_ENVIRONMENT =
  "repo_owned_synthetic_webui_non_production";

export const boundedPersonas: readonly BoundedPersona[] = [
  {
    id: "hr-operator",
    label: "HR operator",
    role: "bounded_hr_operator",
    tenantEnvironment: BOUNDED_TENANT_ENVIRONMENT,
    allowedRoutes: ["queue", "onboarding", "transfer", "termination", "csv"],
  },
  {
    id: "approver",
    label: "Approver",
    role: "bounded_approver",
    tenantEnvironment: BOUNDED_TENANT_ENVIRONMENT,
    allowedRoutes: ["queue", "approvals", "audit"],
  },
  {
    id: "hr-ops-support",
    label: "HR Ops/support",
    role: "bounded_hr_ops_support",
    tenantEnvironment: BOUNDED_TENANT_ENVIRONMENT,
    allowedRoutes: ["queue", "ops", "audit", "support"],
  },
  {
    id: "bounded-admin",
    label: "Bounded admin",
    role: "bounded_admin",
    tenantEnvironment: BOUNDED_TENANT_ENVIRONMENT,
    allowedRoutes: ["queue", "admin"],
  },
];

export function resolveBoundedPersona(
  candidateId: string | null | undefined,
): PersonaDecision {
  if (!candidateId) {
    return {
      allowed: false,
      reason:
        "No bounded non-production persona is selected. The shell fails closed before showing workflow surfaces.",
      persona: null,
    };
  }

  const persona =
    boundedPersonas.find((candidate) => candidate.id === candidateId) ?? null;

  if (!persona) {
    return {
      allowed: false,
      reason:
        "Unknown persona. The local switcher accepts only repository-owned bounded non-production personas.",
      persona: null,
    };
  }

  if (persona.tenantEnvironment !== BOUNDED_TENANT_ENVIRONMENT) {
    return {
      allowed: false,
      reason:
        "Persona tenant does not match the bounded non-production environment.",
      persona: null,
    };
  }

  return {
    allowed: true,
    reason:
      "Bounded non-production persona selected. Server-side authorization remains out of scope for this placeholder.",
    persona,
  };
}
