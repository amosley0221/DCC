import React from 'react'
import { initials, toneFor, type ThemeName } from './theme'
import { useStore } from './store'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ── text ──────────────────────────────────────────────────────────────────────

export const Kicker = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <div className="kicker" style={color ? { color } : undefined}>{children}</div>
)

export const Meta = ({ children, color, size }: { children: React.ReactNode; color?: string; size?: number }) => (
  <span className="meta" style={{ color, fontSize: size }}>{children}</span>
)

export function SectionHeader({ title, right, sub, mark }: {
  title: string; right?: React.ReactNode; sub?: React.ReactNode
  /** A school mark shown beside the title, when one is known. */
  mark?: React.ReactNode
}) {
  return (
    <>
      <div className="section-head">
        <div>
          <h1 className="screen-title" style={mark ? { display: 'flex', alignItems: 'center', gap: 10 } : undefined}>
            {mark}{title}
          </h1>
          {sub ? <div style={{ marginTop: 7 }}>{sub}</div> : null}
        </div>
        {right}
      </div>
      <div className="section-rule" />
    </>
  )
}

// ── controls ──────────────────────────────────────────────────────────────────

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'accent' | 'dead'
  size?: 'sm' | 'md'
}

export function Btn({ variant = 'secondary', size = 'md', className, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={rest.disabled || variant === 'dead'}
    />
  )
}

export function Chip({ on, accent, children, ...rest }: {
  on?: boolean; accent?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} aria-pressed={!!on} className={cx('chip', accent && 'chip-accent', rest.className)}>
      {children}
    </button>
  )
}

export function Tab({ on, children, ...rest }: { on: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} aria-selected={on} className="tab">{children}</button>
}

export function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="pill" style={{ color }}>{children}</span>
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, suffix }: {
  value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <Btn size="sm" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>−</Btn>
      <span className="num" style={{ minWidth: 52, textAlign: 'center', fontWeight: 600, fontSize: 15 }}>
        {value}{suffix}
      </span>
      <Btn size="sm" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>+</Btn>
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="row" style={{ gap: 8, padding: '3px 0' }} onClick={() => onChange(!on)}>
      <span
        style={{
          width: 30, height: 17, borderRadius: 99, flex: 'none',
          background: on ? 'var(--good)' : 'var(--line)',
          position: 'relative', transition: 'background 140ms',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 2, left: on ? 15 : 2, width: 13, height: 13,
            borderRadius: 99, background: on ? 'var(--bg0)' : 'var(--ink4)', transition: 'left 140ms',
          }}
        />
      </span>
      <Meta>{label}</Meta>
    </button>
  )
}

// ── identity marks ────────────────────────────────────────────────────────────

/**
 * School badge. Real marks are licensed art the app cannot ship, so this is a
 * fictional monogram — the same slot an extracted logo would fill later.
 */
export function SchoolBadge({ teamId, size = 22, me }: { teamId: string; size?: number; me?: boolean }) {
  const { d, state } = useStore()
  const team = d?.teamsById.get(teamId)
  const isMe = me ?? team?.isUser ?? false
  const tone = toneFor(team?.name ?? teamId, state.theme as ThemeName)
  return (
    <span
      className={cx('monogram', isMe && 'monogram-me')}
      title={team?.name}
      style={{ width: size, height: size, background: tone, fontSize: size * 0.42 }}
    >
      {team?.monogram ?? '··'}
    </span>
  )
}

/**
 * Player portrait. With no image provider the initials fallback is the finished
 * state, not a placeholder — every screen has to look complete without media.
 */
export function Portrait({ name, size = 32, generating }: {
  name: string; size?: number; generating?: boolean
}) {
  const { state } = useStore()
  if (generating) {
    return (
      <span
        className="monogram portrait-generating"
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-label={`${name} portrait generating`}
      >
        <span style={{ animation: 'dcc-pulse 1.2s ease-in-out infinite' }}>···</span>
      </span>
    )
  }
  return (
    <span
      className="monogram"
      title={name}
      style={{
        width: size, height: size,
        background: toneFor(name, state.theme as ThemeName),
        fontSize: size * 0.36,
      }}
    >
      {initials(name)}
    </span>
  )
}

// ── status ────────────────────────────────────────────────────────────────────

export function SyncDot({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <span className="meta" style={{ color: 'var(--warn)', fontSize: 9, letterSpacing: 1 }} title="Edit waiting in the queue">
      ● QUEUED
    </span>
  )
}

export function StateTag({ state }: { state: 'HELD' | 'APPLIED' | 'FAILED' }) {
  const color = state === 'HELD' ? 'var(--warn)' : state === 'APPLIED' ? 'var(--good)' : 'var(--accent)'
  return (
    <span className="mono" style={{ color, fontWeight: 600, fontSize: 9.5, letterSpacing: 1.5 }}>{state}</span>
  )
}

export function Track({ value, max = 100, fill, height = 4 }: {
  value: number; max?: number; fill?: string; height?: number
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="track" style={{ height }}>
      <div className="track-fill" style={{ width: `${pct}%`, background: fill ?? 'var(--heatFill)' }} />
    </div>
  )
}

export function HeatMeter({ heat, threshold, compact }: { heat: number; threshold: number; compact?: boolean }) {
  const past = heat >= threshold
  return (
    <div className="col" style={{ gap: 5, minWidth: compact ? 140 : 210 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.6, color: 'var(--ink3)' }}>HEAT</span>
        <span
          className="mono"
          style={{
            fontWeight: 600, fontSize: compact ? 15 : 19,
            color: past ? 'var(--accent)' : 'var(--ink)',
          }}
        >
          {heat}
        </span>
      </div>
      <Track value={heat} />
      <Meta size={9}>THRESHOLD {threshold}</Meta>
    </div>
  )
}

export function Card({ children, style, className, onClick, selected }: {
  children: React.ReactNode; style?: React.CSSProperties; className?: string
  onClick?: () => void; selected?: boolean
}) {
  return (
    <div
      className={cx('card', className)}
      onClick={onClick}
      style={{
        ...(selected ? { borderColor: 'var(--accent)' } : null),
        ...(onClick ? { cursor: 'pointer' } : null),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <Card className="card-pad">
      <Meta size={9}>{label}</Meta>
      <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: color ?? 'var(--ink)', marginTop: 4 }}>
        {value}
      </div>
    </Card>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ color: 'var(--ink4)', fontSize: 11, letterSpacing: 0.8, padding: '26px 2px' }}>
      {children}
    </div>
  )
}

/**
 * A school's mark from the chosen art folder, falling back to nothing rather
 * than to another school's logo. Sized by the caller.
 */
export function SchoolArt(
  { file, size = 20 }: { file?: string; size?: number },
) {
  if (!file) return null
  return (
    <img
      alt=""
      loading="lazy"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', flex: '0 0 auto' }}
      src={'dccart://art/' + file.split(/[\\/]/).map(encodeURIComponent).join('/')}
    />
  )
}

/**
 * A player's portrait from the chosen art folder, falling back to initials.
 * Never another player's face: a gap is better than a wrong answer.
 */
export function PlayerFace(
  { file, first, last, size = 30, className, round }:
  { file?: string; first: string; last: string; size?: number; className?: string; round?: boolean },
) {
  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: round ? '50%' : 4, flex: '0 0 auto',
    background: 'var(--rule)', objectFit: 'cover',
  }
  // Initials are the fallback rather than a broken image: a face is missing
  // whenever the art folder has not been pointed at, or the player is one the
  // game draws generically.
  if (!file) {
    return (
      <span className={className}
        style={{ ...box, display: 'grid', placeItems: 'center', fontSize: size * 0.36, color: 'var(--ink3)' }}>
        {(first[0] ?? '') + (last[0] ?? '')}
      </span>
    )
  }
  return <img className={className} style={box} alt="" loading="lazy"
    src={'dccart://art/' + file.split(/[\\/]/).map(encodeURIComponent).join('/')} />
}
