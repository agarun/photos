'use client';

import { useEffect, useRef } from 'react';

function Noise() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !canvas.parentElement) return;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const { width, height } = canvas.parentElement.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    function generateNoise() {
      const currentCanvas = canvas as HTMLCanvasElement;
      const imageData = context.createImageData(
        currentCanvas.width,
        currentCanvas.height
      );
      const data = imageData.data; // `Uint8ClampedArray`
      for (let i = 0; i < data.length; i += 4) {
        const gray = 230 + Math.random() * 25; // Gray values closer to white
        const alpha = 0.25 * 255; // Adjust opacity
        data[i] = gray; // Red
        data[i + 1] = gray; // Green
        data[i + 2] = gray; // Blue
        data[i + 3] = alpha; // Alpha
      }
      context.putImageData(imageData, 0, 0);
    }

    generateNoise();
    const noiseInterval = setInterval(generateNoise, 200);

    return () => clearInterval(noiseInterval);
  }, [ref]);

  return (
    <div
      id="noise"
      className={`will-change-transform mix-blend-multiply
        fixed z-50 top-0 left-0 pointer-events-none
        w-full h-lvh 
        transition-opacity duration-500 opacity-100`}
      style={{
        backfaceVisibility: 'hidden'
      }}
    >
      <canvas ref={ref} id="noise-canvas"></canvas>
    </div>
  );
}

export default Noise;
