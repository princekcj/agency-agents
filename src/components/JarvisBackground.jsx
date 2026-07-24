import React, { useEffect, useRef } from 'react';

/**
 * Ultron Protocol — procedural canvas background.
 * Arc-reactor rings, hex grid, data-stream particles — all in Ultron red.
 */
export default function JarvisBackground({ videoSrc }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (videoSrc) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, cx, cy;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cx = W / 2;
      cy = H / 2;
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Particles ──────────────────────────────────────────────
    const PARTICLE_COUNT = 80;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => mkParticle(W, H));

    function mkParticle(W, H) {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.3 - Math.random() * 0.5,
        size: 1 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.5,
        color: Math.random() > 0.6 ? '#ff6b6b' : '#dc2626',
      };
    }

    // ── Hex grid points ────────────────────────────────────────
    const HEX_SIZE = 36;
    const hexPoints = [];
    for (let row = -2; row < H / (HEX_SIZE * 1.73) + 2; row++) {
      for (let col = -2; col < W / (HEX_SIZE * 2) + 2; col++) {
        const x = col * HEX_SIZE * 2 + (row % 2 === 0 ? 0 : HEX_SIZE);
        const y = row * HEX_SIZE * 0.866 * 2;
        hexPoints.push({ x, y });
      }
    }

    function drawHex(ctx, x, y, size) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + size * Math.cos(a);
        const py = y + size * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    // ── Arc reactor rings ───────────────────────────────────────
    const rings = [
      { r: 60,  speed: 0.004,   dash: [8, 6],   alpha: 0.9 },
      { r: 90,  speed: -0.003,  dash: [16, 8],  alpha: 0.7 },
      { r: 130, speed: 0.002,   dash: [4, 12],  alpha: 0.5 },
      { r: 180, speed: -0.0015, dash: [20, 10], alpha: 0.35 },
      { r: 240, speed: 0.001,   dash: [6, 20],  alpha: 0.22 },
      { r: 320, speed: -0.0008, dash: [30, 15], alpha: 0.12 },
    ];

    // ── Corner HUD brackets ─────────────────────────────────────
    function drawCornerBracket(ctx, x, y, size, flipX, flipY) {
      const sx = flipX ? -1 : 1;
      const sy = flipY ? -1 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, sy * size);
      ctx.lineTo(0, 0);
      ctx.lineTo(sx * size, 0);
      ctx.stroke();
      ctx.restore();
    }

    // ── Data-stream columns ─────────────────────────────────────
    const COLS = Math.floor(W / 24);
    const streams = Array.from({ length: COLS }, (_, i) => ({
      x: i * 24 + 12,
      y: Math.random() * H,
      speed: 0.5 + Math.random() * 1.5,
      alpha: 0.04 + Math.random() * 0.08,
      char: () => String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)),
    }));

    let t = 0;
    let scanY = 0;

    const draw = () => {
      t += 0.016;
      scanY = (scanY + 0.8) % H;

      // ── Background ──────────────────────────────────────────
      ctx.fillStyle = 'rgba(7, 0, 0, 0.55)';
      ctx.fillRect(0, 0, W, H);

      // ── Hex grid (subtle) ───────────────────────────────────
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.025)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([]);
      for (const { x, y } of hexPoints) {
        drawHex(ctx, x, y, HEX_SIZE - 2);
        ctx.stroke();
      }

      // ── Data streams ────────────────────────────────────────
      ctx.font = '10px monospace';
      for (const s of streams) {
        ctx.fillStyle = `rgba(220,38,38,${s.alpha})`;
        ctx.fillText(s.char(), s.x, s.y);
        s.y += s.speed;
        if (s.y > H) { s.y = -10; s.alpha = 0.03 + Math.random() * 0.06; }
      }

      // ── Radial glow centre ──────────────────────────────────
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 350);
      grd.addColorStop(0, 'rgba(180,0,0,0.07)');
      grd.addColorStop(0.4, 'rgba(100,0,0,0.03)');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // ── Arc reactor rings ───────────────────────────────────
      for (const ring of rings) {
        ring._angle = (ring._angle || 0) + ring.speed;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring._angle);
        ctx.beginPath();
        ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
        ctx.setLineDash(ring.dash);
        ctx.strokeStyle = `rgba(220,38,38,${ring.alpha})`;
        ctx.lineWidth = 1;
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
      }

      // ── Inner reactor glow ──────────────────────────────────
      ctx.save();
      ctx.translate(cx, cy);
      const innerGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
      innerGrd.addColorStop(0, `rgba(220,38,38,${0.18 + 0.06 * Math.sin(t * 2)})`);
      innerGrd.addColorStop(0.5, 'rgba(150,0,0,0.06)');
      innerGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = innerGrd;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fill();

      // Spokes
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(220,38,38,0.35)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + t * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 55, Math.sin(a) * 55);
        ctx.stroke();
      }
      ctx.restore();

      // ── Crosshair ───────────────────────────────────────────
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(220,38,38,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      ctx.stroke();

      // ── Corner brackets ─────────────────────────────────────
      const BW = 40;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(220,38,38,0.5)';
      ctx.lineWidth = 1.5;
      drawCornerBracket(ctx, 20, 70, BW, false, false);
      drawCornerBracket(ctx, W - 20, 70, BW, true, false);
      drawCornerBracket(ctx, 20, H - 20, BW, false, true);
      drawCornerBracket(ctx, W - 20, H - 20, BW, true, true);

      // ── Scan line ───────────────────────────────────────────
      const scanGrd = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      scanGrd.addColorStop(0, 'transparent');
      scanGrd.addColorStop(0.5, 'rgba(220,38,38,0.04)');
      scanGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = scanGrd;
      ctx.setLineDash([]);
      ctx.fillRect(0, scanY - 30, W, 60);

      // ── Particles ───────────────────────────────────────────
      for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10 || p.x < -10 || p.x > W + 10) {
          Object.assign(p, mkParticle(W, H));
          p.y = H + 5;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [videoSrc]);

  if (videoSrc) {
    return (
      <video
        autoPlay loop muted playsInline
        src={videoSrc}
        style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', zIndex: 0, opacity: 0.55,
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none',
      }}
    />
  );
}
