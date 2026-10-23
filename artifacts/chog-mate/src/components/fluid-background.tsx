import { useEffect, useRef } from 'react';

// Adapted from the approved canvas mockup's stable-fluid solver.
// Mixing transparent pigment over cream keeps the surface light, never black.
const PALETTE = [
  [126, 57, 219], [68, 23, 121], [190, 145, 248],
  [238, 83, 171], [164, 25, 104], [255, 176, 215],
  [49, 98, 228], [138, 201, 255], [229, 53, 77],
] as const;

function pigment(hue: number) {
  const position = ((hue % 1 + 1) % 1) * PALETTE.length;
  const a = PALETTE[Math.floor(position)];
  const b = PALETTE[(Math.floor(position) + 1) % PALETTE.length];
  const t = position % 1;
  return a.map((value, i) => (value + (b[i] - value) * t) / 255);
}

export function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const n = window.matchMedia('(max-width: 767px)').matches ? 76 : 140;
    const size = (n + 2) ** 2;
    const ix = (x: number, y: number) => x + (n + 2) * y;
    const field = () => new Float32Array(size);
    let u = field(), v = field(), u0 = field(), v0 = field();
    let red = field(), green = field(), blue = field(), density = field(), scratch = field();
    const curl = field();
    const dt = 1 / 45;
    const buffer = document.createElement('canvas');
    buffer.width = buffer.height = n;
    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return;
    const image = bufferCtx.createImageData(n, n);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let time = 0, raf = 0, lastFrame = 0;
    let mx = -1, my = -1, previousX = -1, previousY = -1;
    let pointerActive = false;

    const boundary = (b: number, f: Float32Array) => {
      for (let i = 1; i <= n; i++) {
        f[ix(0, i)] = (b === 1 ? -1 : 1) * f[ix(1, i)];
        f[ix(n + 1, i)] = (b === 1 ? -1 : 1) * f[ix(n, i)];
        f[ix(i, 0)] = (b === 2 ? -1 : 1) * f[ix(i, 1)];
        f[ix(i, n + 1)] = (b === 2 ? -1 : 1) * f[ix(i, n)];
      }
      f[ix(0, 0)] = .5 * (f[ix(1, 0)] + f[ix(0, 1)]);
      f[ix(0, n + 1)] = .5 * (f[ix(1, n + 1)] + f[ix(0, n)]);
      f[ix(n + 1, 0)] = .5 * (f[ix(n, 0)] + f[ix(n + 1, 1)]);
      f[ix(n + 1, n + 1)] = .5 * (f[ix(n, n + 1)] + f[ix(n + 1, n)]);
    };
    const solve = (b: number, f: Float32Array, source: Float32Array, a: number, c: number) => {
      for (let k = 0; k < 14; k++) {
        for (let y = 1; y <= n; y++) {
          for (let x = 1; x <= n; x++) {
            f[ix(x, y)] = (source[ix(x, y)] + a * (
              f[ix(x - 1, y)] + f[ix(x + 1, y)] + f[ix(x, y - 1)] + f[ix(x, y + 1)]
            )) / c;
          }
        }
        boundary(b, f);
      }
    };
    const advect = (b: number, target: Float32Array, source: Float32Array) => {
      for (let y = 1; y <= n; y++) {
        for (let x = 1; x <= n; x++) {
          const px = Math.max(.5, Math.min(n + .5, x - dt * n * u[ix(x, y)]));
          const py = Math.max(.5, Math.min(n + .5, y - dt * n * v[ix(x, y)]));
          const x0 = Math.floor(px), y0 = Math.floor(py), sx = px - x0, sy = py - y0;
          target[ix(x, y)] = (1 - sx) * ((1 - sy) * source[ix(x0, y0)] + sy * source[ix(x0, y0 + 1)])
            + sx * ((1 - sy) * source[ix(x0 + 1, y0)] + sy * source[ix(x0 + 1, y0 + 1)]);
        }
      }
      boundary(b, target);
    };
    const project = () => {
      for (let y = 1; y <= n; y++) {
        for (let x = 1; x <= n; x++) {
          v0[ix(x, y)] = -.5 / n * (u[ix(x + 1, y)] - u[ix(x - 1, y)] + v[ix(x, y + 1)] - v[ix(x, y - 1)]);
          u0[ix(x, y)] = 0;
        }
      }
      boundary(0, v0);
      boundary(0, u0);
      solve(0, u0, v0, 1, 4);
      for (let y = 1; y <= n; y++) {
        for (let x = 1; x <= n; x++) {
          u[ix(x, y)] -= .5 * n * (u0[ix(x + 1, y)] - u0[ix(x - 1, y)]);
          v[ix(x, y)] -= .5 * n * (u0[ix(x, y + 1)] - u0[ix(x, y - 1)]);
        }
      }
      boundary(1, u);
      boundary(2, v);
    };
    const add = (f: Float32Array, x: number, y: number, amount: number, radius: number) => {
      for (let dy = -Math.ceil(radius); dy <= radius; dy++) {
        for (let dx = -Math.ceil(radius); dx <= radius; dx++) {
          const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
          const d2 = dx * dx + dy * dy;
          if (xx < 1 || xx > n || yy < 1 || yy > n || d2 > radius ** 2) continue;
          f[ix(xx, yy)] += amount * Math.exp(-d2 / (radius * .9));
        }
      }
    };
    const dye = (x: number, y: number, amount: number, radius: number, hue: number) => {
      const [r, g, b] = pigment(hue);
      add(red, x, y, amount * r, radius);
      add(green, x, y, amount * g, radius);
      add(blue, x, y, amount * b, radius);
      add(density, x, y, amount, radius);
    };
    const step = () => {
      time += dt;
      const a = time * .14, b = time * .09 + 2.1, ebb = .6 + .4 * Math.sin(time * .25);
      const x1 = (.5 + .33 * Math.sin(a)) * n, y1 = (.5 + .33 * Math.cos(a * .8)) * n;
      const x2 = (.5 + .36 * Math.cos(b)) * n, y2 = (.5 + .3 * Math.sin(b * 1.15)) * n;
      add(u, x1, y1, Math.cos(a * 1.7) * 20 * ebb * dt, 5);
      add(v, x1, y1, Math.sin(a * 1.3) * 20 * ebb * dt, 5);
      add(u, x2, y2, Math.sin(b) * 16 * (1.2 - ebb) * dt, 6);
      add(v, x2, y2, Math.cos(b * .7) * 16 * (1.2 - ebb) * dt, 6);
      dye(x1, y1, 11 * ebb * dt, 3.2, time * .02);
      dye(x2, y2, 9 * (1.2 - ebb) * dt, 3.6, time * .02 + .45);
      if (pointerActive && mx >= 1 && my >= 1) {
        const dx = previousX >= 0 ? mx - previousX : 0;
        const dy = previousY >= 0 ? my - previousY : 0;
        const speed = Math.hypot(dx, dy), scale = speed > 4 ? 4 / speed : 1;
        add(u, mx, my, dx * scale * .9, 3.4);
        add(v, mx, my, dy * scale * .9, 3.4);
        dye(mx, my, Math.min(1.4, .2 + speed * .25), 3, time * .045);
        previousX = mx; previousY = my;
      }
      for (let y = 1; y <= n; y++) {
        for (let x = 1; x <= n; x++) {
          curl[ix(x, y)] = .5 * (v[ix(x + 1, y)] - v[ix(x - 1, y)] - u[ix(x, y + 1)] + u[ix(x, y - 1)]);
        }
      }
      for (let y = 2; y < n; y++) {
        for (let x = 2; x < n; x++) {
          const dx = .5 * (Math.abs(curl[ix(x + 1, y)]) - Math.abs(curl[ix(x - 1, y)]));
          const dy = .5 * (Math.abs(curl[ix(x, y + 1)]) - Math.abs(curl[ix(x, y - 1)]));
          const length = Math.hypot(dx, dy) + 1e-5, w = curl[ix(x, y)] * 9 * dt;
          u[ix(x, y)] += dy / length * w;
          v[ix(x, y)] -= dx / length * w;
        }
      }
      [u0, u] = [u, u0]; [v0, v] = [v, v0];
      const diffusion = dt * .000006 * n * n;
      solve(1, u, u0, diffusion, 1 + 4 * diffusion);
      solve(2, v, v0, diffusion, 1 + 4 * diffusion);
      project();
      // Both velocity components must advect from the same previous field.
      advect(1, u0, u);
      advect(2, v0, v);
      [u0, u] = [u, u0]; [v0, v] = [v, v0];
      project();
      [scratch, red] = [red, scratch]; advect(0, red, scratch);
      [scratch, green] = [green, scratch]; advect(0, green, scratch);
      [scratch, blue] = [blue, scratch]; advect(0, blue, scratch);
      [scratch, density] = [density, scratch]; advect(0, density, scratch);
      for (let i = 0; i < size; i++) {
        red[i] *= .991; green[i] *= .991; blue[i] *= .991; density[i] *= .991;
      }
    };
    const draw = () => {
      for (let y = 1; y <= n; y++) {
        for (let x = 1; x <= n; x++) {
          const i = ix(x, y), offset = ((y - 1) * n + x - 1) * 4;
          const mass = density[i], alpha = .66 * (1 - Math.exp(-mass * 4.5));
          image.data[offset] = mass > .0001 ? red[i] / mass * 255 : 255;
          image.data[offset + 1] = mass > .0001 ? green[i] / mass * 255 : 249;
          image.data[offset + 2] = mass > .0001 ? blue[i] / mass * 255 : 239;
          image.data[offset + 3] = alpha * 255;
        }
      }
      bufferCtx.putImageData(image, 0, 0);
      ctx.fillStyle = '#fff9ef';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'blur(18px)';
      ctx.globalAlpha = .3;
      ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
    };
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    };
    const loop = (timestamp: number) => {
      if (timestamp - lastFrame >= 1000 / 30) {
        step(); draw(); lastFrame = timestamp;
      }
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      pointerActive = false;
      previousX = previousY = -1;
      if (!motion.matches && document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    };
    const move = (event: PointerEvent) => {
      mx = event.clientX / window.innerWidth * n;
      my = event.clientY / window.innerHeight * n;
      pointerActive = true;
    };
    const leave = () => { pointerActive = false; previousX = previousY = -1; };
    for (const [x, y, ux, vy, hue] of [
      [.3, .35, 26, 9, 0], [.68, .28, -14, 22, .34],
      [.55, .66, 18, -20, .7], [.25, .72, -22, -10, .93],
    ]) {
      add(u, x * n, y * n, ux, 5);
      add(v, x * n, y * n, vy, 5);
      dye(x * n, y * n, 1.8, 5, hue);
    }
    for (let i = 0; i < 36; i++) step();
    resize(); sync();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leave);
    window.addEventListener('pointerup', leave);
    window.addEventListener('pointercancel', leave);
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('pointerup', leave);
      window.removeEventListener('pointercancel', leave);
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);

  return <canvas ref={canvasRef} className="fluid-background" aria-hidden="true" data-testid="fluid-background" />;
}
