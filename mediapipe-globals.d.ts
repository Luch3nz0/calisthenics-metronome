type PoseLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
}

type PoseResults = {
  poseLandmarks?: PoseLandmark[]
}

type PoseOptions = {
  modelComplexity?: number
  smoothLandmarks?: boolean
  selfieMode?: boolean
  enableSegmentation?: boolean
  minDetectionConfidence?: number
  minTrackingConfidence?: number
}

interface MediaPipePoseInstance {
  setOptions(options: PoseOptions): void
  onResults(callback: (results: PoseResults) => void): void
  send(input: { image: CanvasImageSource }): Promise<void>
  close?(): void | Promise<void>
}

declare const Pose: {
  new (config: { locateFile: (file: string) => string }): MediaPipePoseInstance
}
