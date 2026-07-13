'use client';

import { useEffect, useRef } from 'react';

type Pt = { x: number; y: number };
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}
function edgePoint(): Pt {
  const side = Math.floor(rand(0, 4));
  if (side === 0) return { x: rand(0, 1), y: -0.05 };
  if (side === 1) return { x: 1.05, y: rand(0, 1) };
  if (side === 2) return { x: rand(0, 1), y: 1.05 };
  return { x: -0.05, y: rand(0, 1) };
}

/** Abstract live-dispatch field: vehicles trace curved routes across a dark map. */
export default function RouteCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0;

    let routes: Pt[][] = [];
    let vehicles: { r: number; t: number; speed: number; green: boolean }[] = [];

    function build() {
      routes = [];
      for (let i = 0; i < 7; i++) {
        const p0 = edgePoint(), p3 = edgePoint();
        const p1 = { x: rand(0.15, 0.85), y: rand(0.1, 0.9) };
        const p2 = { x: rand(0.15, 0.85), y: rand(0.1, 0.9) };
        const pts: Pt[] = [];
        for (let s = 0; s <= 90; s++) pts.push(cubic(p0, p1, p2, p3, s / 90));
        routes.push(pts);
      }
      vehicles = Array.from({ length: 24 }, () => ({
        r: Math.floor(rand(0, routes.length)),
        t: rand(0, 1),
        speed: rand(0.018, 0.05),
        green: Math.random() < 0.16,
      }));
    }

    const at = (route: Pt[], t: number): Pt => {
      const f = Math.max(0, Math.min(0.9999, t)) * (route.length - 1);
      const i = Math.floor(f), frac = f - i;
      const a = route[i], b = route[Math.min(route.length - 1, i + 1)];
      return { x: (a.x + (b.x - a.x) * frac) * w, y: (a.y + (b.y - a.y) * frac) * h };
    };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width; h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawNetwork() {
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = 'rgba(139,147,161,0.10)';
      for (const route of routes) {
        ctx!.beginPath();
        route.forEach((p, i) => (i ? ctx!.lineTo(p.x * w, p.y * h) : ctx!.moveTo(p.x * w, p.y * h)));
        ctx!.stroke();
      }
    }

    function drawVehicle(v: (typeof vehicles)[number]) {
      const route = routes[v.r];
      const trail = 11, len = 0.05;
      // fading trail
      for (let k = trail; k > 0; k--) {
        const t0 = v.t - (len * k) / trail;
        const t1 = v.t - (len * (k - 1)) / trail;
        if (t0 < 0) continue;
        const a = at(route, t0), b = at(route, t1);
        const alpha = (1 - k / trail) * 0.5;
        ctx!.strokeStyle = v.green ? `rgba(34,160,107,${alpha})` : `rgba(255,176,32,${alpha})`;
        ctx!.lineWidth = 1.6 * (1 - k / trail) + 0.4;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }
      // glowing head
      const head = at(route, v.t);
      const g = ctx!.createRadialGradient(head.x, head.y, 0, head.x, head.y, 9);
      const core = v.green ? '34,160,107' : '255,176,32';
      g.addColorStop(0, `rgba(${core},0.95)`);
      g.addColorStop(1, `rgba(${core},0)`);
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(head.x, head.y, 9, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = v.green ? '#7ee2b8' : '#ffe0a3';
      ctx!.beginPath();
      ctx!.arc(head.x, head.y, 1.7, 0, Math.PI * 2);
      ctx!.fill();
    }

    function frame(dt: number) {
      ctx!.clearRect(0, 0, w, h);
      drawNetwork();
      for (const v of vehicles) {
        v.t += v.speed * dt;
        if (v.t > 1) { v.t = 0; v.r = Math.floor(rand(0, routes.length)); v.green = Math.random() < 0.16; }
        drawVehicle(v);
      }
    }

    let last = performance.now();
    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) frame(dt);
      raf = requestAnimationFrame(loop);
    }

    resize();
    build();
    if (reduce) {
      frame(0); // single static frame
    } else {
      raf = requestAnimationFrame(loop);
    }
    const onResize = () => { resize(); build(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
