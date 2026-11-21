/**
 * Grown-up PIN. The server has no PIN field, so the PIN lives on this device
 * only, hashed with a per-family salt. It keeps a child from tapping Approve
 * on a shared phone; it is not account security and is not sent anywhere.
 */
const KEY = 'lelije.pins.v1'

type PinStore = Record<string, { salt: string; hash: string }>

export const PIN_LENGTH = 4

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

function read(): PinStore {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as PinStore
  } catch {
    return {}
  }
}

function write(store: PinStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Storage blocked: the PIN lasts until the page is closed, so ask again next time.
  }
}

async function digest(text: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  // crypto.subtle is missing on plain-http origins such as a phone on the LAN.
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(16)
}

function newSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hasPin(familyCode: string): boolean {
  return Boolean(read()[familyCode])
}

export async function savePin(familyCode: string, pin: string): Promise<void> {
  const salt = newSalt()
  const store = read()
  store[familyCode] = { salt, hash: await digest(`${salt}:${pin}`) }
  write(store)
}

export async function checkPin(familyCode: string, pin: string): Promise<boolean> {
  const entry = read()[familyCode]
  if (!entry) return false
  return (await digest(`${entry.salt}:${pin}`)) === entry.hash
}
