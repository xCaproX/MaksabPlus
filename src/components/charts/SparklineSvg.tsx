interface SparklineSvgProps {
  data: number[];
  color?: string;
  fillColor?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
  showEndDot?: boolean;
}

export default function SparklineSvg({
  data,
  color = 'var(--primary, #2e425c)',
  fillColor,
  width = 96,
  height = 28,
  strokeWidth = 2,
  className = '',
  showEndDot = true,
}: SparklineSvgProps) {
  if (!data || data.length === 0) {
    return (
      <svg
        className={`sparkline-svg ${className}`.trim()}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="var(--line, #e2e8f0)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const padding = strokeWidth + 2;
  const drawWidth = width - padding * 2;
  const drawHeight = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  const points = data.map((val, idx) => {
    const x = padding + (data.length === 1 ? drawWidth / 2 : (idx / (data.length - 1)) * drawWidth);
    const y = range === 0 ? height / 2 : height - padding - ((val - min) / range) * drawHeight;
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }, '');

  const areaD = fillColor && points.length > 0
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(height - padding).toFixed(1)} L ${points[0].x.toFixed(1)} ${(height - padding).toFixed(1)} Z`
    : null;

  const lastPoint = points[points.length - 1];

  return (
    <svg
      className={`sparkline-svg ${className}`.trim()}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {areaD && (
        <path
          d={areaD}
          fill={fillColor}
          opacity={0.2}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showEndDot && lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={strokeWidth + 0.5}
          fill={color}
        />
      )}
    </svg>
  );
}
