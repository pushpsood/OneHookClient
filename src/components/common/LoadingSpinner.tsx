import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = 'md', fullScreen = false }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const spinner = (
    <div
      className={`${sizeClasses[size]} border-2 border-border border-t-accent rounded-full animate-spin`}
      role="status"
      aria-label="Loading"
    />
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="relative w-[124px] h-[124px]" style={{ perspective: '600px' }}>
          <img
            src="/media/LogoHeart.png"
            alt=""
            className="absolute inset-0 w-full h-full object-contain animate-oh-flip origin-center"
          />
          <img
            src="/media/LogoOne.png"
            alt=""
            className="absolute inset-0 w-full h-full object-contain z-10"
          />
        </div>
      </div>
    );
  }

  return spinner;
}
