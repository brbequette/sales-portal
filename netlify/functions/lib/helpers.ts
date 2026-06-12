export function isAdmin(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  return normalized === 'administrator' || normalized === 'admin' || normalized.includes('admin') || normalized.includes('collections') || normalized.includes('manager');
}

