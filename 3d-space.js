/* ==================================================================
   MEDINEXUS PRO — Ultra-Lightweight Ambient 3D Medical Canvas Engine
   ================================================================== */

(function () {
    'use strict';

    const canvas = document.getElementById('space-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let width = 0;
    let height = 0;

    // Palette & Density Matrix (Medical Ambient)
    const SPECTRUM = ['#00F0FF', '#00FF88', '#2563EB', '#8B5CF6'];
    const IS_MOBILE = window.innerWidth < 768;
    const STAR_COUNT = IS_MOBILE ? 60 : 120;
    const DUST_COUNT = IS_MOBILE ? 20 : 40;
    const CONNECTION_LIMIT = IS_MOBILE ? 80 : 130;

    let stars = [];
    let dustParticles = [];
    let isTabVisible = true;

    // Tilt & Parallax Physics
    const mouse = { x: -9999, y: -9999, active: false, radius: 150 };
    const tilt = { targetX: 0, targetY: 0, currentX: 0, currentY: 0 };

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initStars();
        initDust();
    }

    // 1. Deep 3D Spatial Grid Stars
    function initStars() {
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: (Math.random() - 0.5) * width * 2,
                y: (Math.random() - 0.5) * height * 2,
                z: Math.random() * 1000 + 40,
                baseZ: Math.random() * 1000 + 40,
                size: Math.random() * 1.4 + 0.6,
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: Math.random() * 0.02 + 0.008,
                color: Math.random() > 0.4 ? '#ffffff' : (Math.random() > 0.5 ? '#00F0FF' : '#00FF88')
            });
        }
    }

    // 2. Foreground Floating Medical Dust Network
    function initDust() {
        dustParticles = [];
        for (let i = 0; i < DUST_COUNT; i++) {
            const depth = Math.random() * 0.8 + 0.3;
            dustParticles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                z: depth,
                vx: (Math.random() - 0.5) * 0.3 * depth,
                vy: (Math.random() - 0.5) * 0.3 * depth,
                radius: (Math.random() * 2 + 1) * depth,
                color: SPECTRUM[Math.floor(Math.random() * SPECTRUM.length)],
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: Math.random() * 0.025 + 0.01
            });
        }
    }

    let lastTime = 0;
    const FRAME_RATE_LIMIT = 1000 / 60; // Locked 60 FPS for battery saving

    // 60 FPS Render Pipeline
    function render(currentTime) {
        requestAnimationFrame(render);
        if (!isTabVisible) return;

        const delta = currentTime - lastTime;
        if (delta < FRAME_RATE_LIMIT) return;
        lastTime = currentTime;

        ctx.clearRect(0, 0, width, height);

        // Smooth Tilt Interpolation
        tilt.currentX += (tilt.targetX - tilt.currentX) * 0.05;
        tilt.currentY += (tilt.targetY - tilt.currentY) * 0.05;

        const cx = width / 2;
        const cy = height / 2;

        // A. Render 3D Deep Stars
        for (let i = 0; i < stars.length; i++) {
            const star = stars[i];
            star.z -= 0.55;
            if (star.z <= 10) {
                star.z = 1000;
                star.x = (Math.random() - 0.5) * width * 2;
                star.y = (Math.random() - 0.5) * height * 2;
            }

            const k = 400 / star.z;
            const px = star.x * k + cx + tilt.currentX * 1.5;
            const py = star.y * k + cy + tilt.currentY * 1.5;

            if (px >= 0 && px <= width && py >= 0 && py <= height) {
                star.twinkle += star.twinkleSpeed;
                const brightness = Math.max(0.2, Math.min(1.0, (1 - star.z / 1000) * (0.65 + Math.sin(star.twinkle) * 0.35)));
                ctx.fillStyle = star.color;
                ctx.globalAlpha = brightness;
                ctx.beginPath();
                ctx.arc(px, py, Math.max(0.6, star.size * k * 0.7), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1.0;

        // B. Constellation Network Linkages
        for (let i = 0; i < dustParticles.length; i++) {
            const p1 = dustParticles[i];
            for (let j = i + 1; j < dustParticles.length; j++) {
                const p2 = dustParticles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.hypot(dx, dy);

                if (dist < CONNECTION_LIMIT) {
                    const alpha = (1 - dist / CONNECTION_LIMIT) * 0.22 * Math.min(p1.z, p2.z);
                    ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
                    ctx.lineWidth = 0.7 * Math.min(p1.z, p2.z);
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }

        // C. Ambient Floating Dust Nodes
        for (let i = 0; i < dustParticles.length; i++) {
            const p = dustParticles[i];
            p.pulse += p.pulseSpeed;

            if (mouse.active) {
                const mdx = p.x - mouse.x;
                const mdy = p.y - mouse.y;
                const mdist = Math.hypot(mdx, mdy);
                if (mdist < mouse.radius && mdist > 0.1) {
                    const mforce = (mouse.radius - mdist) / mouse.radius;
                    p.vx += (mdx / mdist) * mforce * 0.5 * p.z;
                    p.vy += (mdy / mdist) * mforce * 0.5 * p.z;
                }
            }

            p.x += p.vx + tilt.currentX * p.z * 0.3;
            p.y += p.vy + tilt.currentY * p.z * 0.3;
            p.vx *= 0.985;
            p.vy *= 0.985;

            if (Math.abs(p.vx) < 0.05) p.vx += (Math.random() - 0.5) * 0.03;
            if (Math.abs(p.vy) < 0.05) p.vy += (Math.random() - 0.5) * 0.03;

            if (p.x < 0) { p.x = 0; p.vx *= -1; }
            if (p.x > width) { p.x = width; p.vx *= -1; }
            if (p.y < 0) { p.y = 0; p.vy *= -1; }
            if (p.y > height) { p.y = height; p.vy *= -1; }

            const currentRadius = p.radius * (1 + Math.sin(p.pulse) * 0.2);

            ctx.beginPath();
            ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10 * p.z;
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        }
    }

    // Input & Visibility Listeners
    window.addEventListener('resize', resize);

    document.addEventListener('visibilitychange', () => {
        isTabVisible = !document.hidden;
    });

    window.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;

        tilt.targetX = (e.clientX / width - 0.5) * 3;
        tilt.targetY = (e.clientY / height - 0.5) * 3;
    });

    window.addEventListener('mouseleave', () => {
        mouse.active = false;
        tilt.targetX = 0;
        tilt.targetY = 0;
    });

    window.addEventListener('touchmove', e => {
        if (e.touches[0]) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
            mouse.active = true;
            tilt.targetX = (mouse.x / width - 0.5) * 3;
            tilt.targetY = (mouse.y / height - 0.5) * 3;
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
        mouse.active = false;
        tilt.targetX = 0;
        tilt.targetY = 0;
    });

    // Boot Engine
    resize();
    requestAnimationFrame(render);
})();
