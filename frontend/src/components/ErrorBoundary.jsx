import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Log Firebase errors specifically
    if (error.message && error.message.includes('INTERNAL ASSERTION FAILED')) {
      console.error('Firebase Auth Error:', error);
      // Don't crash the app for Firebase assertion errors
      return;
    }
    
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Only show error UI for non-Firebase errors
      if (this.state.error?.message?.includes('INTERNAL ASSERTION FAILED')) {
        return this.props.children;
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-8">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-4">An error occurred while loading the application.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
