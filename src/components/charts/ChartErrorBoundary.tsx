import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ChartErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dashboard-card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
            <AlertCircle size={24} className="text-warning" />
            <p style={{ margin: 0, fontSize: 'var(--font-sm)' }}>
              تعذر تحميل بعض الرسوم البيانية مؤقتاً. بقية وظائف النظام تعمل بشكل طبيعي.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
