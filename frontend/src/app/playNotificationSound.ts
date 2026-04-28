let audioContext: AudioContext | null = null
let unlockListenersAttached = false
let lastPlaybackAt = 0
let repeatingAlarmTimer: number | null = null
let repeatingAlarmActive = false

const PLAYBACK_THROTTLE_MS = 700
const REPEATING_ALARM_INTERVAL_MS = 2400
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
    if (!normalized.enabled || normalized.volume <= 0) {
      stopRepeatingDeliveryAlarm()
    } else if (repeatingAlarmActive) {
      playNotificationSound()
    }
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
    const peakGain = 0.07 + (settings.volume / 100) * 0.2
    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.18)

    const pulses = [
      { offset: 0, duration: 0.18, from: 940, to: 1120, type: 'square' as OscillatorType },
      { offset: 0.22, duration: 0.18, from: 820, to: 980, type: 'square' as OscillatorType },
      { offset: 0.5, duration: 0.22, from: 960, to: 1180, type: 'sawtooth' as OscillatorType },
      { offset: 0.78, duration: 0.24, from: 760, to: 920, type: 'triangle' as OscillatorType },
    ]

    pulses.forEach((pulse) => {
      const oscillator = context.createOscillator()
      oscillator.type = pulse.type
      oscillator.frequency.setValueAtTime(pulse.from, startAt + pulse.offset)
      oscillator.frequency.exponentialRampToValueAtTime(pulse.to, startAt + pulse.offset + pulse.duration)
      oscillator.connect(gainNode)
      oscillator.start(startAt + pulse.offset)
      oscillator.stop(startAt + pulse.offset + pulse.duration)
    })
  }

  if (context.state === 'running') {
    startPlayback()
    return
  }

  void context.resume().then(startPlayback).catch(() => undefined)
}

export const stopRepeatingDeliveryAlarm = () => {
  repeatingAlarmActive = false
  if (typeof window !== 'undefined' && repeatingAlarmTimer !== null) {
    window.clearInterval(repeatingAlarmTimer)
  }
  repeatingAlarmTimer = null
}

export const startRepeatingDeliveryAlarm = () => {
  prepareNotificationSound()

  const settings = getDeliverySoundSettings()
  if (!settings.enabled || settings.volume <= 0) {
    stopRepeatingDeliveryAlarm()
    return
  }

  if (repeatingAlarmActive && repeatingAlarmTimer !== null) {
    return
  }

  repeatingAlarmActive = true
  playNotificationSound()

  if (typeof window === 'undefined') {
    return
  }

  repeatingAlarmTimer = window.setInterval(() => {
    if (!repeatingAlarmActive) {
      stopRepeatingDeliveryAlarm()
      return
    }
    playNotificationSound()
  }, REPEATING_ALARM_INTERVAL_MS)
}

export const syncRepeatingDeliveryAlarm = (hasPendingNewDeliveryOrders: boolean) => {
  if (hasPendingNewDeliveryOrders) {
    startRepeatingDeliveryAlarm()
    return
  }
  stopRepeatingDeliveryAlarm()
}
