import React from 'react';

interface ProgressStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
  duration?: number;
}

interface ProgressIndicatorProps {
  mode: 'simple' | 'determinate' | 'steps' | 'pulse';
  isVisible: boolean;
  progress?: number; // 0-100 for determinate mode
  title?: string;
  subtitle?: string;
  steps?: ProgressStep[];
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  onCancel?: () => void;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  mode = 'simple',
  isVisible,
  progress = 0,
  title = 'Processing...',
  subtitle,
  steps = [],
  variant = 'default',
  size = 'md',
  showPercentage = true,
  onCancel
}) => {
  if (!isVisible) return null;

  const sizeClasses = {
    sm: 'w-80 max-w-sm',
    md: 'w-96 max-w-md',
    lg: 'w-[32rem] max-w-lg'
  };

  const variantClasses = {
    default: 'border-blue-200 bg-blue-50',
    success: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50'
  };

  const progressBarColors = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600'
  };

  const getStepIcon = (status: ProgressStep['status']) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'running':
        return '⏳';
      case 'error':
        return '❌';
      default:
        return '⚪';
    }
  };

  const renderSimpleLoader = () => (
    <div className="flex items-center gap-3">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
      <div>
        <div className="font-medium text-gray-900">{title}</div>
        {subtitle && <div className="text-sm text-gray-600">{subtitle}</div>}
      </div>
    </div>
  );

  const renderDeterminateProgress = () => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <div className="font-medium text-gray-900">{title}</div>
          {subtitle && <div className="text-sm text-gray-600">{subtitle}</div>}
        </div>
        {showPercentage && (
          <span className="text-sm font-medium text-gray-700">{Math.round(progress)}%</span>
        )}
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ease-out rounded-full ${progressBarColors[variant]}`}
          style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
        />
      </div>
    </div>
  );

  const renderStepsProgress = () => (
    <div className="space-y-4">
      <div>
        <div className="font-medium text-gray-900">{title}</div>
        {subtitle && <div className="text-sm text-gray-600 mt-1">{subtitle}</div>}
      </div>
      
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <span className="text-lg">{getStepIcon(step.status)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${
                step.status === 'completed' ? 'text-green-700' :
                step.status === 'running' ? 'text-blue-700' :
                step.status === 'error' ? 'text-red-700' : 'text-gray-500'
              }`}>
                {step.name}
              </div>
              {step.message && (
                <div className="text-xs text-gray-600 mt-1">{step.message}</div>
              )}
              {step.duration && step.status === 'completed' && (
                <div className="text-xs text-gray-500 mt-1">
                  Completed in {step.duration}ms
                </div>
              )}
            </div>
            {step.status === 'running' && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderPulseLoader = () => (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <div>
        <div className="font-medium text-gray-900">{title}</div>
        {subtitle && <div className="text-sm text-gray-600">{subtitle}</div>}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (mode) {
      case 'determinate':
        return renderDeterminateProgress();
      case 'steps':
        return renderStepsProgress();
      case 'pulse':
        return renderPulseLoader();
      default:
        return renderSimpleLoader();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`
        ${sizeClasses[size]} 
        bg-white rounded-xl shadow-2xl border-2 ${variantClasses[variant]}
        transform transition-all duration-300 ease-out
        animate-in fade-in zoom-in-95
      `}>
        <div className="p-6">
          {renderContent()}
          
          {onCancel && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Hook for managing progress state
export const useProgress = () => {
  const [isVisible, setIsVisible] = React.useState(false);
  const [mode, setMode] = React.useState<ProgressIndicatorProps['mode']>('simple');
  const [progress, setProgress] = React.useState(0);
  const [title, setTitle] = React.useState('Processing...');
  const [subtitle, setSubtitle] = React.useState<string | undefined>();
  const [steps, setSteps] = React.useState<ProgressStep[]>([]);
  const [variant, setVariant] = React.useState<ProgressIndicatorProps['variant']>('default');

  const showProgress = (config?: Partial<ProgressIndicatorProps>) => {
    setIsVisible(true);
    if (config?.mode) setMode(config.mode);
    if (config?.progress !== undefined) setProgress(config.progress);
    if (config?.title) setTitle(config.title);
    if (config?.subtitle !== undefined) setSubtitle(config.subtitle);
    if (config?.steps) setSteps(config.steps);
    if (config?.variant) setVariant(config.variant);
  };

  const hideProgress = () => {
    setIsVisible(false);
  };

  const updateProgress = (newProgress: number, newTitle?: string, newSubtitle?: string) => {
    setProgress(newProgress);
    if (newTitle) setTitle(newTitle);
    if (newSubtitle !== undefined) setSubtitle(newSubtitle);
  };

  const updateSteps = (newSteps: ProgressStep[]) => {
    setSteps(newSteps);
  };

  const updateStep = (stepId: string, updates: Partial<ProgressStep>) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    ));
  };

  return {
    isVisible,
    mode,
    progress,
    title,
    subtitle,
    steps,
    variant,
    showProgress,
    hideProgress,
    updateProgress,
    updateSteps,
    updateStep
  };
};

export default ProgressIndicator; 