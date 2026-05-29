/**
 * Self-verify demo for neurons-motion-library. One trigger button per
 * exported primitive — enables `/opsx:apply` to verify the change end-to-end
 * without depending on any future capability ship.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Self-verify /motion-demo route SHALL trigger each exported primitive
 *    in isolation for apply-time verification"
 */

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  AchievementUnlockModal,
  NumberTickUp,
  RARITY_TIMINGS,
  RarityRevealModal,
  SignalOscillation,
  SpikeTrainFiring,
  SPIKE_TRAIN_TIMING,
  OSCILLATION_TIMING,
  Toast,
  useRespectsReducedMotion,
  type Rarity,
} from '../lib/motion'
import { SynapseDemoSvg } from '../components/connectome/SynapseDemoSvg'

type ActiveDemo =
  | { kind: 'none' }
  | { kind: 'toast' }
  | { kind: 'tickup'; nonce: number }
  | { kind: 'reveal'; rarity: Rarity }
  | { kind: 'achievement' }
  | { kind: 'spike'; nonce: number }

export default function MotionDemoPage(): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const [active, setActive] = useState<ActiveDemo>({ kind: 'none' })
  const close = (): void => setActive({ kind: 'none' })

  return (
    <section style={{ padding: '0.5rem 0' }}>
      <h2 style={{ marginTop: 0 }}>🎬 Motion library demo</h2>
      <p style={{ color: '#5a3f29', fontStyle: 'italic' }}>
        Self-verify route for <code>neurons-motion-library</code> capability.
        每個按鈕觸發一個 primitive；切系統 a11y 「prefers-reduced-motion」可比對 soft mode。
        <br />
        目前偵測到 prefers-reduced-motion = <strong>{reduced ? 'reduce' : 'no-preference'}</strong>
      </p>

      <h3 style={h3Style}>Toast primitive</h3>
      <button style={btnStyle} onClick={() => setActive({ kind: 'toast' })}>
        🎉 觸發 celebratory toast（8s 自動消失）
      </button>

      <h3 style={h3Style}>NumberTickUp primitive</h3>
      <p>
        模擬 AP 0 → 100：
        <span
          style={{
            display: 'inline-block',
            minWidth: '3rem',
            marginLeft: '0.5rem',
            fontWeight: 700,
          }}
        >
          {active.kind === 'tickup' ? (
            <NumberTickUp key={active.nonce} from={0} to={100} durationMs={900} />
          ) : (
            '—'
          )}
        </span>
      </p>
      <button
        style={btnStyle}
        onClick={() => setActive({ kind: 'tickup', nonce: Date.now() })}
      >
        🔢 觸發 number tick-up 0 → 100
      </button>

      <h3 style={h3Style}>RarityRevealModal × 5 rarities</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {(['P5', 'P4', 'P3', 'P2', 'P1'] as Rarity[]).map((r) => (
          <button
            key={r}
            style={{ ...btnStyle, marginBottom: 0 }}
            onClick={() => setActive({ kind: 'reveal', rarity: r })}
          >
            🎴 {r}（{RARITY_TIMINGS[r].total}ms）
          </button>
        ))}
      </div>

      <h3 style={h3Style}>AchievementUnlockModal (P1 full-screen)</h3>
      <button style={btnStyle} onClick={() => setActive({ kind: 'achievement' })}>
        🏆 觸發 P1 鑽石解鎖
      </button>

      <h3 style={h3Style}>EEG spike-train firing（答對 firing）</h3>
      <p style={{ margin: '0 0 0.4rem' }}>
        模擬答對時的 spike-train burst（{SPIKE_TRAIN_TIMING.spikes} spikes ·{' '}
        {SPIKE_TRAIN_TIMING.burst + SPIKE_TRAIN_TIMING.settle}ms）：
        <span
          style={{
            display: 'inline-block',
            minWidth: 160,
            height: 32,
            marginLeft: '0.5rem',
            verticalAlign: 'middle',
          }}
        >
          {active.kind === 'spike' && <SpikeTrainFiring key={active.nonce} width={160} />}
        </span>
      </p>
      <button
        style={btnStyle}
        onClick={() => setActive({ kind: 'spike', nonce: Date.now() })}
      >
        ⚡ 觸發 spike-train firing
      </button>

      <h3 style={h3Style}>Signal-oscillation（loading / pending）</h3>
      <p style={{ margin: '0 0 0.4rem' }}>
        持續 loop 的訊號震盪（{OSCILLATION_TIMING.period}ms period）：
        <span style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>
          <SignalOscillation width={120} height={24} />
        </span>
      </p>

      <h3 style={h3Style}>Synapse tree animations</h3>
      <SynapseDemoSvg />

      <AnimatePresence>
        {active.kind === 'toast' && (
          <Toast variant="celebratory" onDismiss={close}>
            <strong>新連線形成：</strong>「胚胎學」⇌「藥理學」 — wire together
          </Toast>
        )}
      </AnimatePresence>

      {active.kind === 'reveal' && (
        <RarityRevealModal
          key={`reveal-${active.rarity}`}
          rarity={active.rarity}
          title={`${active.rarity} 神經元變體`}
          onComplete={close}
        >
          {active.rarity === 'P1' ? '✦ 傳說神經元 ✦' : '示範揭曉內容'}
        </RarityRevealModal>
      )}

      {active.kind === 'achievement' && (
        <AchievementUnlockModal
          onDismiss={close}
          achievement={{
            tierLabel: 'P1 💎 鑽石',
            badge: '🧠',
            title: '11 種 NT 全家族點亮',
            description: '同一天讓 4 個 NT branch 的代表 family 各自 fire ≥ 5 次',
            rewardLabel: '稱號：神經迴路大師',
            ctaLabel: '太強了！',
          }}
        />
      )}
    </section>
  )
}

const h3Style: React.CSSProperties = {
  fontSize: '0.95rem',
  marginTop: '1.2rem',
  marginBottom: '0.4rem',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.2rem',
}

const btnStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.5rem 0.85rem',
  color: '#5a3f29',
  cursor: 'pointer',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  marginRight: '0.5rem',
  marginBottom: '0.5rem',
}
