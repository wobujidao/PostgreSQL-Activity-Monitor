import { Component } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="max-w-lg w-full space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-2">Произошла ошибка</p>
                <pre className="text-xs whitespace-pre-wrap break-all bg-destructive/10 p-2 rounded">
                  {this.state.error?.message || 'Неизвестная ошибка'}
                </pre>
              </AlertDescription>
            </Alert>
            <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
              Перезагрузить
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
