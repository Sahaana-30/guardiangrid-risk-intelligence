import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import { WaterBody, RiskCalculationResult } from '../types';
import { TierBadge } from './TierBadge';

interface WaterHeroSceneProps {
  topSites: Array<{ site: WaterBody; risk?: RiskCalculationResult }>;
  onSelectSite?: (siteId: string) => void;
}

export const WaterHeroScene: React.FC<WaterHeroSceneProps> = ({
  topSites,
  onSelectSite,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  const [hoveredSite, setHoveredSite] = useState<{
    site: WaterBody;
    risk?: RiskCalculationResult;
    x: number;
    y: number;
  } | null>(null);

  const [projectedPins, setProjectedPins] = useState<
    Array<{
      id: string;
      name: string;
      score: number;
      tier: string;
      x: number;
      y: number;
      visible: boolean;
      site: WaterBody;
      risk?: RiskCalculationResult;
    }>
  >([]);

  const [webGLSupported, setWebGLSupported] = useState(true);

  useEffect(() => {
    // Check WebGL availability
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLSupported(false);
        return;
      }
    } catch {
      setWebGLSupported(false);
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    const isMobile = window.innerWidth < 768;

    // Three.js Scene: Crisp rendering without global fog to eliminate gray haze
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    camera.position.set(0, 2.9, 7.0);
    camera.lookAt(0, -0.2, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);

    // High-detail Water Geometry
    const segments = isMobile ? 48 : 110;
    const planeGeo = new THREE.PlaneGeometry(34, 28, segments, segments);
    planeGeo.rotateX(-Math.PI / 2.32);

    // Dynamic Shader Uniforms
    const waterUniforms = {
      uTime: { value: 0 },
      uMouseRipple: { value: new THREE.Vector3(-10, -10, 0) },
      uRippleAge: { value: 99.0 },
      uScrollProgress: { value: 0.0 },
    };

    const waterMat = new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: `
        uniform float uTime;
        uniform vec3 uMouseRipple;
        uniform float uRippleAge;
        uniform float uScrollProgress;

        varying vec2 vUv;
        varying float vElevation;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Crisp directional waves that visibly flow across the water surface
          float wave1 = sin(pos.x * 1.5 + pos.y * 1.0 + uTime * 2.2) * 0.22;
          float wave2 = cos(-pos.x * 1.2 + pos.y * 1.7 + uTime * 1.7) * 0.16;
          float wave3 = sin((pos.x * 0.8 - pos.y * 1.4) + uTime * 2.8) * 0.10;
          float wave4 = cos(pos.x * 3.2 + pos.y * 2.4 + uTime * 3.4) * 0.05;
          float wave5 = sin(pos.x * 5.8 - uTime * 4.0) * 0.025;

          // Interactive Cursor Ripple
          float distToMouse = length(pos.xy - uMouseRipple.xy);
          float rippleEffect = 0.0;
          if (uRippleAge < 4.0) {
            float waveRadius = uRippleAge * 4.6;
            float ring = exp(-pow(distToMouse - waveRadius, 2.0) * 1.4);
            float fade = max(0.0, 1.0 - uRippleAge / 4.0);
            rippleEffect = sin(distToMouse * 7.5 - uTime * 8.0) * 0.38 * ring * fade;
          }

          pos.z += wave1 + wave2 + wave3 + wave4 + wave5 + rippleEffect;
          vElevation = pos.z;

          // Exact analytical normals for sharp reflections and specular crest highlights
          float dx = 1.5 * cos(pos.x * 1.5 + pos.y * 1.0 + uTime * 2.2) * 0.22
                   - 1.2 * (-sin(-pos.x * 1.2 + pos.y * 1.7 + uTime * 1.7)) * 0.16
                   + 0.8 * cos((pos.x * 0.8 - pos.y * 1.4) + uTime * 2.8) * 0.10
                   + 3.2 * (-sin(pos.x * 3.2 + pos.y * 2.4 + uTime * 3.4)) * 0.05
                   + 5.8 * cos(pos.x * 5.8 - uTime * 4.0) * 0.025;

          float dy = 1.0 * cos(pos.x * 1.5 + pos.y * 1.0 + uTime * 2.2) * 0.22
                   + 1.7 * (-sin(-pos.x * 1.2 + pos.y * 1.7 + uTime * 1.7)) * 0.16
                   - 1.4 * cos((pos.x * 0.8 - pos.y * 1.4) + uTime * 2.8) * 0.10
                   + 2.4 * (-sin(pos.x * 3.2 + pos.y * 2.4 + uTime * 3.4)) * 0.05;

          vNormal = normalize(vec3(-dx * 2.2, -dy * 2.2, 1.0));

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uScrollProgress;

        varying vec2 vUv;
        varying float vElevation;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);

          // Deep, vibrant water colors near camera: rich ocean teal to bright sparkling turquoise
          vec3 deepTeal = vec3(0.015, 0.20, 0.26);       // Deep ocean teal
          vec3 vibrantTeal = vec3(0.035, 0.44, 0.50);    // Vibrant coastal teal
          vec3 turquoise = vec3(0.07, 0.72, 0.68);       // Sparkling turquoise
          vec3 crestHighlight = vec3(0.24, 0.88, 0.84);  // Sunlit crest highlight
          vec3 foamColor = vec3(0.96, 1.0, 0.99);        // Crisp white foam
          vec3 paleCream = vec3(0.965, 0.945, 0.906);    // Clean page background cream (#F6F1E7)

          // Saturated color grading from depth to surface crests
          vec3 waterBase = mix(deepTeal, vibrantTeal, smoothstep(-0.35, 0.05, vElevation));
          waterBase = mix(waterBase, turquoise, smoothstep(0.05, 0.28, vElevation));

          // Camera glide / scroll tint shift to deep navy
          vec3 deepNavy = vec3(0.01, 0.12, 0.22);
          waterBase = mix(waterBase, deepNavy, uScrollProgress * 0.7);

          // Crisp animated wave ripple lines & moving highlights (visibly flowing water)
          float rippleLines1 = pow(clamp(0.5 + 0.5 * sin(vElevation * 32.0 + uTime * 3.4), 0.0, 1.0), 6.0);
          float rippleLines2 = pow(clamp(0.5 + 0.5 * cos(vUv.x * 42.0 + vUv.y * 32.0 - uTime * 2.2), 0.0, 1.0), 7.0);
          float waveRipples = rippleLines1 * 0.36 + rippleLines2 * 0.28;
          waterBase += crestHighlight * waveRipples;

          // Fresnel reflection on water surface
          float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.0);
          waterBase += vec3(0.65, 0.92, 0.96) * (fresnel * 0.52);

          // Crisp sun glints & specular highlights across crests
          vec3 sunDir = normalize(vec3(0.35, 0.90, 0.42));
          vec3 halfVec = normalize(sunDir + viewDir);
          float spec = pow(max(0.0, dot(normal, halfVec)), 88.0) * 2.8;
          waterBase += vec3(1.0, 0.99, 0.94) * spec;

          // Soft clean foam on wave crests
          float foamFactor = smoothstep(0.19, 0.33, vElevation);
          vec3 waterWithFoam = mix(waterBase, foamColor, foamFactor * 0.85);

          // Horizon blend strictly at far distance into pale cream (no blur, no gray haze)
          float depthDist = length(vViewPosition);
          float horizonBlend = smoothstep(12.5, 18.5, depthDist);
          vec3 finalColor = mix(waterWithFoam, paleCream, horizonBlend);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: false,
      side: THREE.DoubleSide,
    });

    const waterMesh = new THREE.Mesh(planeGeo, waterMat);
    waterMesh.position.set(0, -0.7, -0.5);
    scene.add(waterMesh);

    // 3D Site Anchors placed strictly in the LOWER water area and left-to-center band
    // (Never overlapping headline, subtitle, buttons, or right-hand card)
    const pinObjects: Array<{
      id: string;
      obj: THREE.Object3D;
      site: WaterBody;
      risk?: RiskCalculationResult;
    }> = [];

    // Distinct 3D coordinates projecting exclusively into the lower water band (y > 62%, x < 56%)
    const pinCoords = [
      { x: -3.3, z: 3.2 },  // Pin 1: Lower-left foreground (~18% X, ~82% Y)
      { x: -1.8, z: 3.4 },  // Pin 2: Lower mid-left foreground (~34% X, ~86% Y)
      { x: -0.3, z: 3.1 },  // Pin 3: Lower center foreground (~48% X, ~81% Y)
      { x: -2.5, z: 2.2 },  // Pin 4: Lower-band mid water (~27% X, ~68% Y)
    ];

    topSites.slice(0, 4).forEach((item, idx) => {
      const coord = pinCoords[idx % pinCoords.length];
      const anchor = new THREE.Object3D();
      anchor.position.set(coord.x, 0.35, coord.z);
      scene.add(anchor);
      pinObjects.push({
        id: item.site.id,
        obj: anchor,
        site: item.site,
        risk: item.risk,
      });
    });

    // Mouse & Parallax State
    let mouseX = 0;
    let mouseY = 0;
    let targetCameraX = 0;
    let targetCameraY = 2.9;
    let currentCameraX = 0;
    let currentCameraY = 2.9;
    let rippleStartTime = 99.0;
    let lastRippleX = 0;
    let lastRippleY = 0;
    let isVisible = true;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      mouseX = (x - 0.5) * 2;
      mouseY = -(y - 0.5) * 2;

      targetCameraX = mouseX * 0.5;
      targetCameraY = 2.9 + mouseY * 0.22;

      // Cursor water ripple trigger
      const worldX = mouseX * 7.0;
      const worldY = mouseY * 5.0;
      const dist = Math.hypot(worldX - lastRippleX, worldY - lastRippleY);
      if (dist > 1.2) {
        waterUniforms.uMouseRipple.value.set(worldX, worldY, 0);
        rippleStartTime = 0;
        lastRippleX = worldX;
        lastRippleY = worldY;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Scroll listener for camera glide & tint shift
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const progress = Math.min(1.0, Math.max(0.0, scrollY / 700));
      waterUniforms.uScrollProgress.value = progress;
      camera.position.z = 7.0 - progress * 1.8;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // IntersectionObserver to pause when off-screen
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting;
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      if (!isVisible) return;

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        waterUniforms.uTime.value = elapsed;

        if (rippleStartTime < 4.0) {
          rippleStartTime += delta;
          waterUniforms.uRippleAge.value = rippleStartTime;
        }

        // Camera gentle drift when idle + eased parallax lerp
        const idleDriftX = Math.sin(elapsed * 0.4) * 0.10;
        const idleDriftY = Math.cos(elapsed * 0.3) * 0.05;

        currentCameraX += (targetCameraX + idleDriftX - currentCameraX) * 0.04;
        currentCameraY += (targetCameraY + idleDriftY - currentCameraY) * 0.04;

        camera.position.x = currentCameraX;
        camera.position.y = currentCameraY;
        camera.lookAt(0, -0.2, 0);

        // Bob pins gently and float above local wave elevation
        pinObjects.forEach((p, idx) => {
          const waveHeight =
            Math.sin(p.obj.position.x * 1.5 + p.obj.position.z * 1.0 + elapsed * 2.2) * 0.22 +
            Math.cos(-p.obj.position.x * 1.2 + p.obj.position.z * 1.7 + elapsed * 1.7) * 0.16;
          p.obj.position.y = 0.36 + waveHeight * 0.5 + Math.sin(elapsed * 2.2 + idx * 1.4) * 0.07;
        });
      }

      renderer.render(scene, camera);

      // Project 3D site coordinates to 2D screen positions
      // Enforce strict containment in the lower water area (below buttons, away from right card)
      const pins = pinObjects.map((p) => {
        const v = new THREE.Vector3();
        p.obj.getWorldPosition(v);
        v.project(camera);

        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-(v.y * 0.5) + 0.5) * height;

        // Pin must be in lower water area (y between 62% and 92% of hero)
        // and in left-to-center water band (x between 5% and 56% of hero)
        // ensuring zero overlap with headline, subtitle, buttons, or right card
        const inSafeLowerBand = y > height * 0.62 && y < height * 0.92 && x > 24 && x < width * 0.56;
        const visible = v.z < 1.0 && inSafeLowerBand;

        return {
          id: p.id,
          name: p.site.name,
          score: p.risk?.score ?? 45,
          tier: p.risk?.tier ?? 'Low',
          x,
          y,
          visible,
          site: p.site,
          risk: p.risk,
        };
      });

      setProjectedPins(pins);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
      planeGeo.dispose();
      waterMat.dispose();
      renderer.dispose();
    };
  }, [topSites]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto"
    >
      {webGLSupported ? (
        <canvas ref={canvasRef} className="w-full h-full block" />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-[#0F766E]/20 via-[#1E3A8A]/10 to-[#F6F1E7]" />
      )}

      {/* 3D Floating Interactive Site Pins in Lower Water Band */}
      {projectedPins.map((pin) => {
        if (!pin.visible) return null;
        const isHigh = pin.score >= 70;
        let colorClass = 'bg-emerald-600 border-emerald-300 shadow-emerald-900/30';
        if (pin.tier === 'Severe') colorClass = 'bg-red-800 border-red-300 shadow-red-950/40';
        else if (pin.tier === 'High') colorClass = 'bg-[#D65A4A] border-red-300 shadow-red-900/30';
        else if (pin.tier === 'Medium') colorClass = 'bg-[#E9A03B] border-amber-200 shadow-amber-900/30';

        return (
          <div
            key={pin.id}
            style={{
              position: 'absolute',
              left: `${pin.x}px`,
              top: `${pin.y}px`,
              transform: 'translate(-50%, -100%)',
              zIndex: 25,
            }}
            className="cursor-pointer group select-none"
            onClick={() => {
              if (onSelectSite) onSelectSite(pin.id);
              else navigate(`/water-bodies/${pin.id}`);
            }}
            onMouseEnter={() =>
              setHoveredSite({
                site: pin.site,
                risk: pin.risk,
                x: pin.x,
                y: pin.y,
              })
            }
            onMouseLeave={() => setHoveredSite(null)}
          >
            <div className="relative flex flex-col items-center">
              {/* Expanding pulse ring for high risk */}
              {isHigh && (
                <span className="absolute -inset-2.5 rounded-full border-2 border-[#D65A4A] animate-ping opacity-60 pointer-events-none" />
              )}

              {/* Glowing Pin Bubble with Risk Score */}
              <div
                className={`px-2.5 py-1 rounded-full text-white font-bold text-xs shadow-lg border-2 flex items-center gap-1.5 transition-transform group-hover:scale-115 ${colorClass}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>{pin.score}</span>
              </div>

              {/* Pin Arrow Tip */}
              <div
                className={`w-2 h-2 rotate-45 -mt-1 shadow-md border-r-2 border-b-2 ${colorClass}`}
              />

              {/* Label Pill: Hidden by default to prevent overlap, revealed cleanly on hover */}
              <div className="mt-1 px-2.5 py-1 rounded-lg bg-[#1B2A38]/95 text-white text-[11px] font-semibold whitespace-nowrap backdrop-blur-md opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1 transition-all duration-150 border border-white/20 shadow-xl pointer-events-none">
                {pin.name}
              </div>
            </div>
          </div>
        );
      })}

      {/* Glass Tooltip on Pin Hover */}
      {hoveredSite && (
        <div
          style={{
            position: 'absolute',
            left: `${hoveredSite.x}px`,
            top: `${hoveredSite.y - 75}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 40,
            pointerEvents: 'none',
          }}
          className="p-3 bg-[#FBF8F3]/95 backdrop-blur-md border border-[#E9E1D3] rounded-2xl shadow-2xl text-[#1B2A38] min-w-[210px] animate-fadeIn"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-xs">{hoveredSite.site.name}</span>
            <TierBadge tier={hoveredSite.risk?.tier || 'Low'} size="sm" />
          </div>
          <div className="mt-1.5 text-xs text-[#5B687A] flex items-center justify-between">
            <span>Risk Score:</span>
            <strong className="text-[#0F766E] font-mono text-sm">
              {hoveredSite.risk?.score ?? 42}/100
            </strong>
          </div>
          <div className="mt-1 text-[10px] text-[#5B687A]">
            Click to inspect site telemetry & SHAP breakdown →
          </div>
        </div>
      )}
    </div>
  );
};
