// The 13 provinces and territories, in Statistics Canada's usual order (east to west, then
// the territories), with the English names WDS uses for Geography members.
export const PROVINCES = [
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'QC', name: 'Quebec' },
  { code: 'ON', name: 'Ontario' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'YT', name: 'Yukon' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
] as const

export type ProvinceCode = (typeof PROVINCES)[number]['code']

const BY_NAME = new Map<string, ProvinceCode>(
  PROVINCES.map((p) => [p.name.toLowerCase(), p.code]),
)
BY_NAME.set('québec', 'QC')

// Some tables qualify member names, e.g. "Ontario [35]" or "Ontario (map)".
function bareName(member: string): string {
  return member
    .replace(/\s*[[(].*$/, '')
    .trim()
    .toLowerCase()
}

/** The province or territory a Geography member names, or null for anything else. */
export function provinceCode(member: string): ProvinceCode | null {
  return BY_NAME.get(bareName(member)) ?? null
}

export function isCanada(member: string): boolean {
  return bareName(member) === 'canada'
}
