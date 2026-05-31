import type { TransferTransactionRequestPayload } from "./transfer-transaction-request-contract.js";

export function buildTransferTargetAssignmentId(
  transactionRequestId: string,
): string {
  return `assignment-${transactionRequestId}-transfer-target`;
}

export function buildTransferTargetAssignmentCode(
  payload: TransferTransactionRequestPayload,
): string {
  return `${payload.currentAssignment.assignmentCode}-XFER-${payload.effectiveDate.replaceAll(
    "-",
    "",
  )}`;
}
