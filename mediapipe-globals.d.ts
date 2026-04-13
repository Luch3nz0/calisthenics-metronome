type PoseLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
  presence?: number
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

type MediaPipeTasksVisionFileset = {
  wasmLoaderPath: string
  wasmBinaryPath: string
}

type MediaPipeTasksPoseResult = {
  landmarks: PoseLandmark[][]
  worldLandmarks: PoseLandmark[][]
}

type MediaPipeTasksPoseOptions = {
  baseOptions: {
    modelAssetPath: string
  }
  runningMode: 'IMAGE' | 'VIDEO'
  numPoses?: number
  minPoseDetectionConfidence?: number
  minPosePresenceConfidence?: number
  minTrackingConfidence?: number
  outputSegmentationMasks?: boolean
}

interface MediaPipeTasksPoseLandmarker {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): MediaPipeTasksPoseResult
  close(): void
}

interface MediaPipeTasksVisionModule {
  FilesetResolver: {
    forVisionTasks(wasmRoot: string): Promise<MediaPipeTasksVisionFileset>
  }
  PoseLandmarker: {
    createFromOptions(
      fileset: MediaPipeTasksVisionFileset,
      options: MediaPipeTasksPoseOptions
    ): Promise<MediaPipeTasksPoseLandmarker>
  }
}

interface Window {
  __mediaPipeVisionModulePromise?: Promise<MediaPipeTasksVisionModule>
}

declare module 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1/vision_bundle.mjs' {
  export const FilesetResolver: MediaPipeTasksVisionModule['FilesetResolver']
  export const PoseLandmarker: MediaPipeTasksVisionModule['PoseLandmarker']
}
