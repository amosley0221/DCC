export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'current'; version?: string }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
  | { state: 'dev' }
