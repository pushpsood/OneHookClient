import React from 'react';

type Mood = 'Happy' | 'Neutral' | 'Thinking' | 'Sad' | 'Excited';

export const Mascot: React.FC<{ mood: Mood; lookingUpLeft?: boolean; className?: string }> = ({ mood, lookingUpLeft, className }) => {
  // We adapt the mouth based on mood
  const renderMouth = () => {
    switch (mood) {
      case 'Neutral':
        return <path d="M53 62 Q60 62 67 62" stroke="#7d1f3d" strokeWidth="2" fill="none" />;
      case 'Thinking':
        return <path d="M55 60 Q60 60 65 60" stroke="#7d1f3d" strokeWidth="2" fill="none" />;
      case 'Sad':
        return <path d="M53 64 Q60 58 67 64" stroke="#7d1f3d" strokeWidth="2" fill="none" />;
      case 'Excited':
        return (
          <>
            <path d="M51 58 Q60 54 69 58 Q67 70 60 70.5 Q53 70 51 58 Z" fill="#7d1f3d" />
            <ellipse cx="60" cy="67" rx="4.4" ry="3.2" fill="#ff6f9c" />
          </>
        );
      case 'Happy':
      default:
        return (
          <>
            <path d="M53 58 Q60 56.5 67 58 Q65.5 67 60 67.5 Q54.5 67 53 58 Z" fill="#7d1f3d" />
            <ellipse cx="60" cy="65" rx="3.4" ry="2.2" fill="#ff6f9c" />
          </>
        );
    }
  };

  const eyeOffsetX = lookingUpLeft ? -6 : 0;
  const eyeOffsetY = lookingUpLeft ? -8 : 0;

  return (
    <svg className={className} width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bodyGloss" cx="38%" cy="26%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#c21f6f" stopOpacity="0.25" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="60" cy="114" rx="26" ry="4" fill="#000000" opacity="0.12" />

      {/* Arms + legs */}
      <g stroke="#ff69b4" strokeLinecap="round" fill="none">
        {mood === 'Excited' ? (
           <path d="M31 64 Q20 50 12 40" strokeWidth="9" />
        ) : (
           <path d="M31 64 Q20 70 12 74" strokeWidth="9" />
        )}
        <path d="M90 52 Q101 42 106 31" strokeWidth="9" />
        <path d="M50 92 L49 108" strokeWidth="9" />
        <path d="M70 92 L71 108" strokeWidth="9" />
      </g>

      {/* Hands + feet */}
      <g fill="#ff69b4">
        {mood === 'Excited' ? (
           <circle cx="12" cy="40" r="5.5" />
        ) : (
           <circle cx="12" cy="74" r="5.5" />
        )}
        <circle cx="106" cy="31" r="5.5" />
        <ellipse cx="45" cy="109" rx="7" ry="4.5" />
        <ellipse cx="75" cy="109" rx="7" ry="4.5" />
      </g>

      {/* Body (egg) */}
      <path d="M60 12 C40 12 26 34 26 57 C26 82 40 96 60 96 C80 96 94 82 94 57 C94 34 80 12 60 12 Z" fill="#ff69b4" />
      <path d="M60 12 C40 12 26 34 26 57 C26 82 40 96 60 96 C80 96 94 82 94 57 C94 34 80 12 60 12 Z" fill="url(#bodyGloss)" />

      {/* Eyes */}
      <ellipse cx={mood === 'Thinking' ? 48 : 48} cy="44" rx="11" ry={mood === 'Thinking' ? 9 : 13} fill="#ffffff" />
      <ellipse cx={mood === 'Thinking' ? 72 : 72} cy="44" rx="11" ry={mood === 'Thinking' ? 9 : 13} fill="#ffffff" />
      <g transform={`translate(${eyeOffsetX}, ${eyeOffsetY})`}>
        <circle cx={mood === 'Thinking' ? 51 : 48} cy={mood === 'Thinking' ? 42 : 45} r="7.5" fill="#87ceeb" />
        <circle cx={mood === 'Thinking' ? 51 : 48} cy={mood === 'Thinking' ? 42 : 45} r="4" fill="#0d1b3e" />
        <circle cx={mood === 'Thinking' ? 53 : 50} cy={mood === 'Thinking' ? 39.5 : 42.5} r="1.8" fill="#ffffff" />
        <circle cx={mood === 'Thinking' ? 69 : 72} cy={mood === 'Thinking' ? 42 : 45} r="7.5" fill="#87ceeb" />
        <circle cx={mood === 'Thinking' ? 69 : 72} cy={mood === 'Thinking' ? 42 : 45} r="4" fill="#0d1b3e" />
        <circle cx={mood === 'Thinking' ? 71 : 74} cy={mood === 'Thinking' ? 39.5 : 42.5} r="1.8" fill="#ffffff" />
      </g>

      {/* Mouth */}
      {renderMouth()}
    </svg>
  );
};
