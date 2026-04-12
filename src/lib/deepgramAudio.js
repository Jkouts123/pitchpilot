const BLACKHOLE_LABEL = 'BlackHole 2ch'
const MIC_LABEL = 'MacBook Pro Microphone'

/** Unlock device labels by requesting a temporary mic permission, then release it. */
async function unlockDeviceLabels() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    tmp.getTracks().forEach((t) => t.stop())
  } catch {
    /* permission denied — labels may be empty, we handle that below */
  }
}

/**
 * Acquire two audio streams:
 *   - BlackHole 2ch  → system / call audio  (Speaker 1 = prospect)
 *   - MacBook Pro Microphone → salesperson mic (Speaker 0 = "You")
 *
 * Both are mixed into a single AudioContext destination so they can be sent
 * to Deepgram on one WebSocket connection with diarize:true.
 *
 * Throws an error whose message starts with "BLACKHOLE_NOT_FOUND" when the
 * BlackHole virtual device is not present.
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

  const micDevice = audioInputs.find((d) => d.label.includes(MIC_LABEL))

  // Stream 1 — BlackHole 2ch (prospect / system audio)
  const blackholeStream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: blackholeDevice.deviceId } },
    video: false,
  })

  // Stream 2 — MacBook Pro Microphone (salesperson)
  let micStream
  if (micDevice) {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: micDevice.deviceId } },
      video: false,
    })
  } else {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }

  const audioContext = new AudioContext()
  const destination = audioContext.createMediaStreamDestination()

  // Mic = Speaker 0 ("You"), BlackHole = Speaker 1 (prospect).
  // Connect mic first so Deepgram diarization typically assigns it speaker 0.
  const micSource = audioContext.createMediaStreamSource(micStream)
  const blackholeSource = audioContext.createMediaStreamSource(blackholeStream)

  micSource.connect(destination)
  blackholeSource.connect(destination)

  return {
    stream: destination.stream,
    audioContext,
    sampleRate: audioContext.sampleRate,
    rawStreams: [micStream, blackholeStream],
  }
}

/**
 * Attach a ScriptProcessor that converts the mixed stream to 16-bit PCM and
 * calls onChunk for each buffer.  Returns an async stop() function.
 *
 * @param {{ stream, audioContext, onChunk, rawStreams?: MediaStream[] }} opts
 */
export function attachPCMProcessor({ stream, audioContext, onChunk, rawStreams = [] }) {
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
    // Stop the mixed destination stream tracks
    stream.getTracks().forEach((t) => t.stop())
    // Stop the original mic / BlackHole streams
    rawStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    await audioContext.close()
  }
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2)
  const view = new DataView(buffer)
  let offset = 0
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Int16Array(buffer)
}
