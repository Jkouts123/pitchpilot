const KEY = 'pitchpilot.deals'

export function loadDeals() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveDeals(deals) {
  localStorage.setItem(KEY, JSON.stringify(deals))
}

export function addDeal(deal) {
  const list = loadDeals()
  list.unshift(deal)
  saveDeals(list)
}

export function getDealById(id) {
  return loadDeals().find((d) => d.id === id) ?? null
}
