import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  status: 'idle' | 'running' | 'completed' | 'error';
  message?: string;
  details?: string;
  variant?: 'default' | 'compact' | 'detailed';
  showPercentage?: boolean;
  className?: string;
}

export default function ProgressBar({
  progress,
  status,
  message = '',
  details = '',
  variant = 'default',
  showPercentage = true,
  className = ''
}: ProgressBarProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
        );
      case 'completed':
        return (
          <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (variant === 'compact') {
    return (
      <div className={`flex items-center space-x-3 ${className}`}>
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700 font-medium">{message}</span>
            {showPercentage && (
              <span className="text-gray-500">{Math.round(progress)}%</span>
            )}
          </div>
          <div className="mt-1 bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-out rounded-full ${getStatusColor()}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            >
              {status === 'running' && (
                <div className="h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'detailed') {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <h3 className="text-lg font-semibold text-gray-900">{message}</h3>
          </div>
          {showPercentage && (
            <div className="bg-gray-100 rounded-full px-3 py-1">
              <span className="text-sm font-medium text-gray-700">{Math.round(progress)}%</span>
            </div>
          )}
        </div>
        
        <div className="mb-3">
          <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out rounded-full relative ${getStatusColor()}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            >
              {status === 'running' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse"></div>
              )}
            </div>
          </div>
        </div>

        {details && (
          <p className="text-sm text-gray-600 leading-relaxed">{details}</p>
        )}
        
        {status === 'running' && (
          <div className="mt-4 flex items-center text-xs text-gray-500">
            <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
            Bezig met verwerken...
          </div>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className="text-sm font-medium text-gray-900">{message}</span>
        </div>
        {showPercentage && (
          <span className="text-sm text-gray-500 font-medium">{Math.round(progress)}%</span>
        )}
      </div>
      
      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out rounded-full ${getStatusColor()}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        >
          {status === 'running' && (
            <div className="h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
          )}
        </div>
      </div>
      
      {details && (
        <p className="text-xs text-gray-600 mt-2">{details}</p>
      )}
    </div>
  );
}

// Hook for managing progress state
export function useProgress() {
  const [progress, setProgress] = React.useState(0);
  const [status, setStatus] = React.useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [message, setMessage] = React.useState('');
  const [details, setDetails] = React.useState('');

  const start = (initialMessage: string = 'Bezig met laden...') => {
    setProgress(0);
    setStatus('running');
    setMessage(initialMessage);
    setDetails('');
  };

  const update = (newProgress: number, newMessage?: string, newDetails?: string) => {
    setProgress(Math.min(100, Math.max(0, newProgress)));
    if (newMessage) setMessage(newMessage);
    if (newDetails) setDetails(newDetails);
  };

  const complete = (completionMessage: string = 'Voltooid!') => {
    setProgress(100);
    setStatus('completed');
    setMessage(completionMessage);
  };

  const error = (errorMessage: string = 'Er is een fout opgetreden') => {
    setStatus('error');
    setMessage(errorMessage);
  };

  const reset = () => {
    setProgress(0);
    setStatus('idle');
    setMessage('');
    setDetails('');
  };

  return {
    progress,
    status,
    message,
    details,
    start,
    update,
    complete,
    error,
    reset
  };
} 