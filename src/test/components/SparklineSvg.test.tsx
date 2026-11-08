import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SparklineSvg from '../../components/charts/SparklineSvg';

describe('SparklineSvg Component', () => {
  it('renders fallback line when data is empty', () => {
    const { container } = render(<SparklineSvg data={[]} width={100} height={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const line = container.querySelector('line');
    expect(line).toBeInTheDocument();
  });

  it('renders path and end circle when valid data is provided', () => {
    const { container } = render(
      <SparklineSvg data={[10, 20, 15, 30, 45, 25]} color="#2e425c" fillColor="#2e425c" />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(1);
    const circle = container.querySelector('circle');
    expect(circle).toBeInTheDocument();
  });

  it('renders with single data point without throwing error', () => {
    const { container } = render(<SparklineSvg data={[100]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
