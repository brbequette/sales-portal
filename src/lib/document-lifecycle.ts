export function buildDocumentLifecycleRefreshToken(
  dropshipments: Array<{ zohoId?: string | null; id?: string | null; status?: string | null }> | null | undefined,
): string {
  return (dropshipments || [])
    .map((dropshipment) => `${dropshipment.zohoId || dropshipment.id || ''}:${dropshipment.status || ''}`)
    .join('|')
}
