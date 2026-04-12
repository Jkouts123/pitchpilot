export function getProspectDisplayName(form) {
  if (form.manualEntry && form.prospectName?.trim()) {
    return form.prospectName.trim()
  }
  const u = form.linkedInUrl?.trim()
  if (!u) return 'Prospect'
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`)
    const path = parsed.pathname.replace(/\/+$/, '')
    const m = path.match(/\/in\/([^/]+)/i)
    if (m) {
      const slug = decodeURIComponent(m[1])
      return slug
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    }
  } catch {
    /* ignore */
  }
  return 'Prospect'
}

export function getProspectCompanyLine(form) {
  if (form.manualEntry && form.prospectCompany?.trim()) {
    return form.prospectCompany.trim()
  }
  if (form.linkedInUrl?.trim()) return 'LinkedIn'
  return 'Company'
}
