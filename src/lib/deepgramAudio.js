const BLACKHOLE_LABEL = 'BlackHole 2ch'

/** Unlock device labels by requesting a temporary mic permission, then release it. */
async function unlockDeviceLabels() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    tmp.getTracks().forEach((t) => t.stop())
  } catch {
    /* permission denied — labels may be empty, handled below */
  }
}

/**
 * Acquire the BlackHole 2ch stream only.
 * This captures all system audio (calls, YouTube, etc.) routed through BlackHole.
 * Throws if BlackHole 2ch is not found.
 */
export async function acquireAudioStream() {
  await unlockDeviceLabels()

  const devices = await navigator.mediaDevices.enumerateDevices()
  const audioInputs = devices.filter((d) => d.kind === 'audioinput')

  const blackholeDevice = audioInputs.find((d) => d.label.includes(BLACKHOLE_LABEL))
  if (!blackholeDevice) {
    throw Object.assign(
      new Error('BlackHole 2ch not detected — please check your audio setup'),
      { code: 'BLACKHOLE_NOT_FOUND' },
    )
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: blackholeDevice.deviceId } },
    video: false,
  })

  const audioContext = new AudioContext()
  return { stream, audioContext, sampleRate: audioContext.sampleRate }
}

/**
 * Attach a ScriptProcessor that converts the stream to 16-bit PCM and
 * calls onChunk for each buffer. Returns an async stop() function.
 */
export function attachPCMProcessor({ stream, audioContext, onChunk }) {
  const source = audioContext.createMediaStreamSource(stream)
  const processor = audioContext.createScriptProcessor(4096, 1, 1)
  const gain = audioContext.createGain()
  gain.gain.value = 0

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0)
    const pcm = floatTo16BitPCM(input)
    onChunk(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength))
  }

  source.connect(processor)
  processor.connect(gain)
  gain.connect(audioContext.destination)

  return async () => {
    try {
      processor.disconnect()
      source.disconnect()
      gain.disconnect()
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop())
    await audioContext.close()
  }
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2)
  const view = new DataView(buffer)
  let offset = 0
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Int16Array(buffer)
}
