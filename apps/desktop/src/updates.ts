export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'current'; version?: string }
  | { state: 'available'; version: string; notes?: unknown }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string; notes?: unknown }
  | { state: 'error'; message: string }
  | { state: 'dev' }
