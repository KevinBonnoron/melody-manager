import type { ProgressShape, WaveStyle } from '@/providers/ThemeProvider';

const W = 58;
const H = 24;
const STEP = 2;
const COUNT = Math.floor(W / STEP);
const PLAYED = Math.floor(COUNT * 0.4);

const LEVELS = Array.from({ length: COUNT }, (_, i) => {
  const swell = Math.sin(i / 3.4) * 0.45 + Math.sin(i / 1.3) * 0.3 + Math.sin(i / 7.1) * 0.25;
  return Math.min(1, Math.max(0.12, Math.abs(swell)));
});

const x = (index: number) => index * STEP;
const height = (level: number) => Math.max(2, level * (H - 4));

function Bars({ anchored }: { anchored: boolean }) {
  return (
    <>
      {LEVELS.map((level, index) => {
        const h = height(level);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length sampling, position is the identity
            key={index}
            x={x(index)}
            y={anchored ? H - h : (H - h) / 2}
            width={STEP - 0.6}
            height={h}
            rx={0.5}
            className={index < PLAYED ? 'fill-current' : 'fill-current opacity-25'}
          />
        );
      })}
    </>
  );
}

function Wave({ style }: { style: WaveStyle }) {
  const up = LEVELS.map((level, index) => `${x(index)},${(H - height(level)) / 2}`).join(' ');
  const down = LEVELS.map((level, index) => `${x(index)},${(H + height(level)) / 2}`).join(' ');
  const back = LEVELS.map((_, index) => `${x(COUNT - 1 - index)},${(H + height(LEVELS[COUNT - 1 - index])) / 2}`).join(' ');

  if (style === 'stroked') {
    return (
      <>
        <polyline points={up} fill="none" stroke="currentColor" strokeWidth={1} className="opacity-25" />
        <polyline points={down} fill="none" stroke="currentColor" strokeWidth={1} className="opacity-25" />
        <g clipPath="url(#played)">
          <polyline points={up} fill="none" stroke="currentColor" strokeWidth={1} />
          <polyline points={down} fill="none" stroke="currentColor" strokeWidth={1} />
        </g>
      </>
    );
  }

  return (
    <>
      <polygon points={`${up} ${back}`} className="fill-current opacity-25" />
      <polygon points={`${up} ${back}`} className="fill-current" clipPath="url(#played)" />
    </>
  );
}

function Plain() {
  return (
    <>
      <rect x={0} y={H / 2 - 1.5} width={W} height={3} rx={1.5} className="fill-current opacity-25" />
      <rect x={0} y={H / 2 - 1.5} width={x(PLAYED)} height={3} rx={1.5} className="fill-current" />
    </>
  );
}

export function ProgressShapePreview({ shape, waveStyle = 'filled', cursor = true }: { shape: ProgressShape; waveStyle?: WaveStyle; cursor?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-[58px] shrink-0" aria-hidden="true" role="presentation">
      <clipPath id="played">
        <rect x={0} y={0} width={x(PLAYED)} height={H} />
      </clipPath>
      {shape === 'bars' && <Bars anchored={false} />}
      {shape === 'columns' && <Bars anchored />}
      {shape === 'wave' && <Wave style={waveStyle} />}
      {shape === 'plain' && <Plain />}
      {shape !== 'plain' && cursor && <rect x={x(PLAYED) - 0.5} y={0} width={1} height={H} className="fill-current" />}
    </svg>
  );
}
