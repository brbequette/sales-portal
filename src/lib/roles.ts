export function isAdminRole(role: string | null | undefined) {
  const normalizedRole = role?.trim().toLowerCase() || ""

  return normalizedRole.includes("admin")
    || normalizedRole.includes("administrator")
    || normalizedRole.includes("manager")
    || normalizedRole.includes("collections")
}

export function isAdministratorRole(role: string | null | undefined) {
  const normalizedRole = role?.trim().toLowerCase() || ""

  return normalizedRole === "admin" || normalizedRole === "administrator"
}
