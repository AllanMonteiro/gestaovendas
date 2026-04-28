let audioContext: AudioContext | null = null
let unlockListenersAttached = false
let lastPlaybackAt = 0

const PLAYBACK_THROTTLE_MS = 900
const DELIVERY_SOUND_SETTINGS_KEY = 'sorveteria.delivery-sound-settings'
export const DELIVERY_SOUND_SETTINGS_EVENT = 'sorveteria:delivery-sound-settings'

export type DeliverySoundSettings = {
  enabled: boolean
  volume: number
}

const DEFAULT_DELIVERY_SOUND_SETTINGS: DeliverySoundSettings = {
  enabled: true,
  volume: 72,
}

const normalizeVolume = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_DELIVERY_SOUND_SETTINGS.volume
  }
  return Math.min(100, Math.max(0, Math.round(numeric)))
}

export const getDeliverySoundSettings = (): DeliverySoundSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_DELIVERY_SOUND_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(DELIVERY_SOUND_SETTINGS_KEY)
    if (!raw) {
      return DEFAULT_DELIVERY_SOUND_SETTINGS
    }

    const parsed = JSON.parse(raw) as Partial<DeliverySoundSettings>
    return {
      enabled: parsed.enabled !== false,
      volume: normalizeVolume(parsed.volume),
    }
  } catch {
    return DEFAULT_DELIVERY_SOUND_SETTINGS
  }
}

export const saveDeliverySoundSettings = (settings: DeliverySoundSettings) => {
  if (typeof window === 'undefined') {
    return
  }

  const normalized: DeliverySoundSettings = {
    enabled: settings.enabled !== false,
    volume: normalizeVolume(settings.volume),
  }

  try {
    window.localStorage.setItem(DELIVERY_SOUND_SETTINGS_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent<DeliverySoundSettings>(DELIVERY_SOUND_SETTINGS_EVENT, { detail: normalized }))
  } catch {
    // Ignore local storage failures and keep runtime behavior.
  }
}

const getAudioContext = () => {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) {
    return null
  }

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextCtor()
  }

  return audioContext
}

const unlockAudioContext = () => {
  const context = getAudioContext()
  if (!context || context.state !== 'suspended') {
    return
  }
  void context.resume().catch(() => undefined)
}

const attachUnlockListeners = () => {
  if (typeof window === 'undefined' || unlockListenersAttached) {
    return
  }

  unlockListenersAttached = true
  const options: AddEventListenerOptions = { once: true, passive: true }
  window.addEventListener('pointerdown', unlockAudioContext, options)
  window.addEventListener('keydown', unlockAudioContext, options)
  window.addEventListener('touchstart', unlockAudioContext, options)
}

export const prepareNotificationSound = () => {
  attachUnlockListeners()
  unlockAudioContext()
}

export const playNotificationSound = () => {
  prepareNotificationSound()

  const settings = getDeliverySoundSettings()
  if (!settings.enabled || settings.volume <= 0) {
    return
  }

  const context = getAudioContext()
  if (!context) {
    return
  }

  const now = Date.now()
  if (now - lastPlaybackAt < PLAYBACK_THROTTLE_MS) {
    return
  }
  lastPlaybackAt = now

  const startPlayback = () => {
    const startAt = context.currentTime + 0.01
    const gainNode = context.createGain()
    gainNode.connect(context.destination)
    const peakGain = 0.04 + (settings.volume / 100) * 0.14
    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42)

    const highTone = context.createOscillator()
    highTone.type = 'sine'
    highTone.frequency.setValueAtTime(880, startAt)
    highTone.frequency.exponentialRampToValueAtTime(1046, startAt + 0.16)
    highTone.connect(gainNode)
    highTone.start(startAt)
    highTone.stop(startAt + 0.18)

    const lowTone = context.createOscillator()
    lowTone.type = 'triangle'
    lowTone.frequency.setValueAtTime(660, startAt + 0.2)
    lowTone.frequency.exponentialRampToValueAtTime(784, startAt + 0.38)
    lowTone.connect(gainNode)
    lowTone.start(startAt + 0.2)
    lowTone.stop(startAt + 0.42)
  }

  if (context.state === 'running') {
    startPlayback()
    return
  }

  void context.resume().then(startPlayback).catch(() => undefined)
}
