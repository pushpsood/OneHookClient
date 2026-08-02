import React from 'react';

interface BrandWordmarkProps {
  text?: string;
  className?: string;
  textClassName?: string;
  imageClassName?: string;
}

export function BrandWordmark({
  text = 'ONEHOOK.',
  className = '',
  textClassName = '',
  imageClassName = '',
}: BrandWordmarkProps) {
  return (
    <div className={`inline-flex items-center gap-2 align-middle ${className}`.trim()}>
      <img
        src="/media/onehook-512.png"
        alt=""
        aria-hidden="true"
        className={`h-[1em] w-auto shrink-0 object-contain ${imageClassName}`.trim()}
      />
      <span className={textClassName}>{text}</span>
    </div>
  );
}

