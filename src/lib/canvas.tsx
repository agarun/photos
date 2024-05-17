'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function randomChoice(array: Array<any>) {
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

const background = '#fff';
const foreground = '#de2c6d';

type Config = {
  n?: number;
  d?: number;
  progress?: number;
};

const defaults = {
  n: 2,
  d: 39,
  progress: 0.5
};

function Canvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  const draw = useCallback((config: Config = {}) => {
    const canvas = ref.current;
    if (!ref.current || !canvas) return;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const width = canvas.width;
    const height = canvas.height;

    const size = 130;

    const rose = (n: number, d: number, progress: number) => {
      context.beginPath();
      context.lineWidth = 0.1;
      context.strokeStyle = foreground;
      for (let theta = 0; theta <= 360; theta++) {
        let k = (theta * d * Math.PI) / Math.floor(progress * 80);
        let r = size * Math.sin(n * k);
        let x = -r * Math.cos(k);
        let y = -r * Math.sin(k);
        context.lineTo(x, y);
        context.moveTo(x, y);
      }
      context.stroke();
      context.beginPath();
      context.lineWidth = 0.1;
      context.strokeStyle = foreground;
      for (let theta = 0; theta <= 360; theta++) {
        let k = (theta * Math.PI) / Math.floor(progress * 30);
        let r = size * Math.sin(n * k);
        let x = r * Math.cos(k);
        let y = -r * Math.sin(k);
        context.lineTo(x, y);
        context.moveTo(x, y);
      }
      context.stroke();
    };

    const [n, d] = randomChoice([
      [2, 39],
      [3, 47],
      [4, 31],
      [5, 97],
      [6, 71],
      [7, 19]
    ]);
    const progress = randomInRange(0.4, 0.8);

    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);
    rose(config.n || n, config.d || d, config.progress || progress);

    context.restore();
  }, []);

  useEffect(() => {
    draw(defaults);
  }, [draw]);

  return (
    <canvas
      ref={ref}
      width={40}
      height={40}
      className={`rounded-lg border border-${background} cursor-pointer hover:opacity-75`}
      onClick={() => draw()}
    />
  );
}

export default Canvas;
