export function isAdminRole(role: string | null | undefined) {
  const normalizedRole = role?.trim().toLowerCase() || ""

  return normalizedRole === "master_admin"
    || normalizedRole.includes("admin")
    || normalizedRole.includes("administrator")
    || normalizedRole.includes("manager")
    || normalizedRole.includes("collections")
}

export function isAdministratorRole(role: string | null | undefined) {
  const normalizedRole = role?.trim().toLowerCase() || ""

  return normalizedRole === "master_admin" || normalizedRole === "admin" || normalizedRole === "administrator"
}

export function isMasterAdminRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() === "master_admin"
}

export function isSalespersonUser(user: { role?: string | null; isSalesperson?: boolean | null } | null | undefined) {
  if (!user) return false
  return user.isSalesperson !== false && !isMasterAdminRole(user.role)
}
