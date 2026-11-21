const SHAPE = /^LJ-[A-Z0-9]{6}$/

/** Uppercases, drops spaces, and adds the LJ- prefix when only the six characters were typed. */
export function normalizeFamilyCode(input: string): string {
  const code = input.toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9]{6}$/.test(code) ? `LJ-${code}` : code
}

/** True when the code could be a real family code. Whether it exists is the server's call. */
export function looksLikeFamilyCode(code: string): boolean {
  return SHAPE.test(code)
}
