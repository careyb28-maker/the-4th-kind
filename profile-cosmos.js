(function () {
  const atmos = document.getElementById('atmosphere');
  if (!atmos) return;

  window.addEventListener('load', () => {
    window.setTimeout(() => document.body.classList.add('atmosphere-ready'), 220);
  }, { once: true });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rootStyle = document.documentElement.style;
  const depthBgs = document.querySelectorAll('.depth-bg');
  let viewportW = window.innerWidth;
  let viewportH = window.innerHeight;
  let scrollPct = 0;
  let depthRafPending = false;

  function setVoidPalette(progress) {
    const lift = Math.min(1, Math.max(0, Math.pow(progress, 0.78)));
    rootStyle.setProperty('--profile-starfield-strength', (0.12 + lift * 0.36).toFixed(3));
    rootStyle.setProperty('--profile-star-opacity', (0.2 + lift * 0.86).toFixed(3));
  }

  function updateScrollDepth() {
    const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
    scrollPct = window.scrollY / maxScroll;
    setVoidPalette(Math.pow(scrollPct, 0.82));
    depthBgs.forEach(bg => {
      const rect = bg.parentElement.getBoundingClientRect();
      bg.style.transform = `translateY(${((rect.top + rect.height * 0.5) / viewportH - 0.5) * 22}%)`;
    });
    depthRafPending = false;
  }

  function queueDepthUpdate() {
    if (depthRafPending) return;
    depthRafPending = true;
    requestAnimationFrame(updateScrollDepth);
  }

  atmos.replaceChildren();

  if (!reducedMotion) {
    const orbiters = [];
    const colorPool = ['', '', 'blue', 'pink', 'glow'];
    for (let i = 0; i < 72; i++) {
      const el = document.createElement('div');
      const size = 1.4 + Math.random() * 4.8;
      const orbitBand = i / 72;
      el.className = `fragment ${colorPool[Math.floor(Math.random() * colorPool.length)]}`;
      el.style.setProperty('--size', `${size}px`);
      atmos.appendChild(el);
      orbiters.push({
        el,
        phase: Math.random() * Math.PI * 2,
        band: Math.pow(orbitBand, 0.72),
        radiusJitter: Math.random() * 92,
        verticalJitter: Math.random() * 34,
        speed: (0.018 + Math.random() * 0.072) * (Math.random() > 0.42 ? 1 : -1),
        alpha: 0.18 + Math.random() * 0.5,
        depth: 0.74 + Math.random() * 0.46,
        drift: (Math.random() - 0.5) * 18
      });
    }

    function animateOrbit(now) {
      const time = now * 0.001;
      const centerX = viewportW * 0.5;
      const centerY = viewportH * (0.48 - scrollPct * 0.05);
      const galaxyWidth = Math.min(viewportW * 0.56, 760);
      const galaxyHeight = Math.min(viewportH * 0.2, 190);
      orbiters.forEach(orb => {
        const angle = orb.phase + time * orb.speed;
        const tilt = Math.sin(angle + orb.phase) * 10;
        const radiusX = 68 + orb.band * galaxyWidth + orb.radiusJitter;
        const radiusY = 20 + orb.band * galaxyHeight + orb.verticalJitter;
        const x = centerX + Math.cos(angle) * radiusX * orb.depth;
        const y = centerY + Math.sin(angle) * radiusY + tilt + orb.drift;
        const lightSide = (Math.sin(angle) + 1) * 0.5;
        const opacity = orb.alpha * (0.42 + lightSide * 0.58);
        const scale = 0.75 + lightSide * 0.75;
        orb.el.style.opacity = Math.min(0.9, opacity).toFixed(3);
        orb.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale.toFixed(3)})`;
      });
      requestAnimationFrame(animateOrbit);
    }

    requestAnimationFrame(animateOrbit);
  }

  window.addEventListener('resize', () => {
    viewportW = window.innerWidth;
    viewportH = window.innerHeight;
    queueDepthUpdate();
  }, { passive: true });
  window.addEventListener('scroll', queueDepthUpdate, { passive: true });
  updateScrollDepth();
})();
