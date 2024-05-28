'use client';

import { Album } from '@/types';
import cn from 'classnames';
import createGlobe, { COBEOptions, Marker } from 'cobe';
import { useCallback, useEffect, useRef } from 'react';
import { useSpring } from 'react-spring';

const GLOBE_CONFIG: COBEOptions = {
  width: 1024,
  height: 1024,
  onRender: () => {},
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.42,
  dark: 0,
  diffuse: 0.5,
  mapSamples: 30_000,
  mapBrightness: 1,
  mapBaseBrightness: 0,
  baseColor: [0.995, 0.995, 0.995],
  markerColor: [251 / 255, 21 / 255, 21 / 255],
  glowColor: [1, 1, 1],
  opacity: 0.55,
  markers: []
};

function useMarkers(albums: Array<Album>) {
  return albums.reduce((markers: Array<Marker>, album) => {
    markers.push({
      location: [album.lat, album.lng],
      size: 0.04
    });
    for (const location of album.locations) {
      markers.push({
        location: [location.lat, location.lng],
        size: 0.04
      });
    }
    return markers;
  }, []);
}

export default function Globe({
  albums,
  className,
  config = GLOBE_CONFIG
}: {
  albums: Array<Album>;
  className?: string;
  config?: COBEOptions;
}) {
  const markers = useMarkers(albums);

  let phi = -0.75;
  let width = 0;
  let height = 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef(null);
  const pointerInteractionMovement = useRef(0);
  const [{ r }, api] = useSpring(() => ({
    r: 0,
    config: {
      mass: 1,
      tension: 280,
      friction: 40,
      precision: 0.001
    }
  }));

  const updatePointerInteraction = (value: any) => {
    pointerInteracting.current = value;
    canvasRef.current!.style.cursor = value ? 'grabbing' : 'grab';
  };

  const updateMovement = (clientX: any) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current;
      pointerInteractionMovement.current = delta;
      api.start({ r: delta / 200 });
    }
  };

  const onRender = useCallback(
    (state: Record<string, any>) => {
      if (!pointerInteracting.current) phi += 0.004;
      state.phi = phi + r.get();
      state.width = width * 2;
      state.height = width * 2;
    },
    [pointerInteracting, phi, r]
  );

  const onResize = () => {
    if (canvasRef.current) {
      width = canvasRef.current.offsetWidth;
      height = canvasRef.current.offsetHeight;
    }
  };

  useEffect(() => {
    window.addEventListener('resize', onResize);
    onResize();

    const globe = createGlobe(canvasRef.current!, {
      ...config,
      markers,
      width: width * 2,
      height: height * 2,
      onRender
    });

    setTimeout(
      () =>
        (canvasRef.current!.style.opacity =
          window.innerWidth <= 640 ? '0.5' : '0.85')
    );
    return () => globe.destroy();
  }, [canvasRef]);

  return (
    <div className={cn('absolute aspect-[1/1] w-full', className)}>
      <canvas
        className={cn(
          'h-full w-full opacity-0 transition-opacity duration-500 [contain:layout_paint_size]'
        )}
        ref={canvasRef}
        onPointerDown={e =>
          updatePointerInteraction(
            e.clientX - pointerInteractionMovement.current
          )
        }
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={e => updateMovement(e.clientX)}
        onTouchMove={e => e.touches[0] && updateMovement(e.touches[0].clientX)}
      />
    </div>
  );
}
