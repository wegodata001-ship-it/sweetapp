/** Build smooth SVG path from normalized points 0..1 */
export function smoothLinePath(
  points: number[],
  width: number,
  height: number,
  padding = 4,
): string {
  if (points.length === 0) return "";
  const w = width - padding * 2;
  const h = height - padding * 2;
  const max = Math.max(...points, 1);
  const coords = points.map((v, i) => {
    const x = padding + (i / Math.max(1, points.length - 1)) * w;
    const y = padding + h - (v / max) * h;
    return [x, y] as const;
  });
  if (coords.length === 1) {
    const [x, y] = coords[0]!;
    return `M ${x} ${y}`;
  }
  let d = `M ${coords[0]![0]} ${coords[0]![1]}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]!;
    const p1 = coords[i]!;
    const p2 = coords[i + 1]!;
    const p3 = coords[Math.min(coords.length - 1, i + 2)]!;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function areaUnderPath(linePath: string, width: number, height: number): string {
  if (!linePath) return "";
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

export function donutSegments(
  slices: { value: number; color: string }[],
): { d: string; color: string; pct: number }[] {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = 40;
  const cx = 50;
  const cy = 50;
  let angle = -Math.PI / 2;
  const out: { d: string; color: string; pct: number }[] = [];
  for (const slice of slices) {
    const pct = slice.value / total;
    const sweep = pct * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    out.push({
      color: slice.color,
      pct: Math.round(pct * 100),
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
    });
  }
  return out;
}
