export type AccountAssignmentScope = "ALL" | "UPDATE_STATUS"

export function accountAssignmentStatusQuery(scope: AccountAssignmentScope): string {
  return scope === "UPDATE_STATUS" ? "&statusFilter=Update%20Status" : ""
}
