"use client";

type Props = {
  percent: number;
  size?: number;
  stroke?: number;
  accent?: string;
  className?: string;
};

/** Circular progress indicator for group cards. */
export function TaskProgressRing({
  percent,
  size = 44,
  stroke = 4,
  accent = "#2563eb",
  className = "",
}: Props) {
  const clamped = Math.min(100, Math.max(0, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`tcg-progress-ring shrink-0 ${className}`}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={accent}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-500 ease-out"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-slate-900 text-[9px] font-black"
        style={{ fontSize: size < 40 ? 8 : 10 }}
      >
        {clamped}%
      </text>
    </svg>
  );
}
