const KEY = 'pitchpilot.presets'

export function loadPresets() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function savePresets(presets) {
  localStorage.setItem(KEY, JSON.stringify(presets))
}

export function upsertPreset(preset) {
  const list = loadPresets()
  const idx = list.findIndex((p) => p.id === preset.id)
  if (idx >= 0) list[idx] = preset
  else list.push(preset)
  savePresets(list)
}

export function deletePreset(id) {
  savePresets(loadPresets().filter((p) => p.id !== id))
}

export function getPresetById(id) {
  return loadPresets().find((p) => p.id === id) ?? null
}
