/**
 * Singleton hook — fetches pace zones once, shared across all components.
 * Avoids duplicate API calls when multiple session cards are rendered.
 */
import { useState, useEffect } from 'react'
import { api } from '../api'

let _cache = null
let _fetching = null

export function useZones() {
  const [zones, setZones] = useState(_cache)

  useEffect(() => {
    if (_cache) { setZones(_cache); return }
    if (!_fetching) {
      _fetching = api.getPaceZones()
        .then(d => { _cache = d; return d })
        .catch(() => null)
    }
    _fetching.then(d => { if (d) setZones(d) })
  }, [])

  return zones
}
