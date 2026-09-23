// Operational approval does not establish external registry verification.
export function identityLabel(source: string | null, registryVerified: boolean | null, hindi = false): string {
  if (source === 'DEMO') return hindi ? 'डेमो पहचान — रजिस्ट्री सत्यापित नहीं' : 'Demo identity — not registry verified'
  if (registryVerified === true) return hindi ? 'रजिस्ट्री सत्यापित' : 'Registry verified'
  return hindi ? 'रजिस्ट्री सत्यापन दर्ज नहीं' : 'Registry verification not recorded'
}
