export const PIN_LENGTH = 4

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

/** What a PIN field keeps from whatever was typed or pasted. */
export function pinDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_LENGTH)
}
