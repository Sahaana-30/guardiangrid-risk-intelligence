import React, { useRef, useState } from 'react';

interface FloatingTiltCardProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  bobDelay?: number;
}

export const FloatingTiltCard: React.FC<FloatingTiltCardProps> = ({
  children,
  className = '',
  maxTilt = 8,
  bobDelay = 0,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = useState('');
  const [highlightStyle, setHighlightStyle] = useState({ opacity: 0, x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -maxTilt;
    const rotateY = ((x - centerX) / centerX) * maxTilt;

    setTransformStyle(
      `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`
    );

    setHighlightStyle({
      opacity: 1,
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    });
  };

  const handleMouseLeave = () => {
    setTransformStyle('perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)');
    setHighlightStyle({ opacity: 0, x: 50, y: 50 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: transformStyle || undefined,
        animationDelay: `${bobDelay}s`,
        transition: 'transform 0.15s ease-out',
      }}
      className={`relative overflow-hidden group cursor-pointer animate-float-slow ${className}`}
    >
      {/* Moving Edge Specular Highlight */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 rounded-[inherit]"
        style={{
          opacity: highlightStyle.opacity,
          background: `radial-gradient(circle at ${highlightStyle.x}% ${highlightStyle.y}%, rgba(20, 149, 138, 0.25) 0%, rgba(255, 255, 255, 0.1) 40%, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
};
