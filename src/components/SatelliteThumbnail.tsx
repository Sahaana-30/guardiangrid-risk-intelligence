import React, { useState } from 'react';
import { getEsriSatelliteThumbnail } from '../config';

interface SatelliteThumbnailProps {
  lat: number;
  lon: number;
  altText: string;
  className?: string;
  aspectRatio?: 'video' | 'square' | 'wide';
}

export const SatelliteThumbnail: React.FC<SatelliteThumbnailProps> = ({
  lat,
  lon,
  altText,
  className = '',
  aspectRatio = 'video',
}) => {
  const [hasError, setHasError] = useState(false);
  const url = getEsriSatelliteThumbnail(lat, lon, 0.012);

  const aspectClass =
    aspectRatio === 'square'
      ? 'aspect-square'
      : aspectRatio === 'wide'
      ? 'aspect-[21/9]'
      : 'aspect-[4/3]';

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${aspectClass} ${className}`}>
      {!hasError ? (
        <img
          src={url}
          alt={altText}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover object-center filter saturate-110 contrast-105"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[#0F766E]/40 to-[#1E3A8A]/50 flex items-center justify-center text-xs text-white/70 font-mono">
          Esri Satellite Imagery
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
      <span className="absolute bottom-1 right-1.5 text-[9px] font-mono text-white/60 tracking-wider uppercase pointer-events-none drop-shadow">
        Esri Satellite
      </span>
    </div>
  );
};
