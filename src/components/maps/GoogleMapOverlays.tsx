import React, { useEffect, useRef } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { LatLngPoint } from '../../types/maps';

interface GoogleMapCircleProps {
  center: LatLngPoint;
  radius: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillColor?: string;
  fillOpacity?: number;
}

export const GoogleMapCircle: React.FC<GoogleMapCircleProps> = ({
  center,
  radius,
  strokeColor = '#0F766E',
  strokeOpacity = 0.7,
  strokeWeight = 1.5,
  fillColor = '#0F766E',
  fillOpacity = 0.1,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const circleRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !mapsLib) return;
    const circle = new mapsLib.Circle({
      map,
      center,
      radius,
      strokeColor,
      strokeOpacity,
      strokeWeight,
      fillColor,
      fillOpacity,
      clickable: false,
    });
    circleRef.current = circle;
    return () => {
      circle.setMap(null);
      circleRef.current = null;
    };
  }, [map, mapsLib]);

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setCenter(center);
    circleRef.current.setRadius(radius);
  }, [center.lat, center.lng, radius]);

  return null;
};

interface GoogleMapPolylineProps {
  path: LatLngPoint[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  dashed?: boolean;
}

export const GoogleMapPolyline: React.FC<GoogleMapPolylineProps> = ({
  path,
  strokeColor = '#0F766E',
  strokeOpacity = 0.9,
  strokeWeight = 4,
  dashed = false,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polyRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return;

    const options: Record<string, any> = {
      map,
      path,
      strokeColor,
      strokeOpacity: dashed ? 0 : strokeOpacity,
      strokeWeight,
      geodesic: true,
    };

    if (dashed) {
      options.icons = [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: strokeOpacity,
            scale: 3,
            strokeColor,
          },
          offset: '0',
          repeat: '14px',
        },
      ];
    }

    const polyline = new mapsLib.Polyline(options);
    polyRef.current = polyline;
    return () => {
      polyline.setMap(null);
      polyRef.current = null;
    };
  }, [map, mapsLib, path, strokeColor, strokeOpacity, strokeWeight, dashed]);

  return null;
};

interface GoogleMapBoundsFitterProps {
  points: LatLngPoint[];
  maxZoom?: number;
}

export const GoogleMapBoundsFitter: React.FC<GoogleMapBoundsFitterProps> = ({
  points,
  maxZoom = 15,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  const signature = points
    .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join('|');

  useEffect(() => {
    if (!map || !coreLib || points.length === 0) return;

    if (points.length === 1) {
      map.panTo(points[0]);
      if ((map.getZoom() ?? 14) > maxZoom) {
        map.setZoom(maxZoom);
      }
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    points.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, { top: 44, right: 44, bottom: 44, left: 44 });

    const listener = map.addListener('idle', () => {
      const z = map.getZoom();
      if (typeof z === 'number' && z > maxZoom) {
        map.setZoom(maxZoom);
      }
      listener.remove();
    });

    return () => {
      listener.remove();
    };
  }, [map, coreLib, signature, maxZoom]);

  return null;
};
