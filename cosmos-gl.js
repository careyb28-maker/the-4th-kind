(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof THREE === 'undefined') return;

  try {
    const t = document.createElement('canvas');
    if (!t.getContext('webgl') && !t.getContext('experimental-webgl')) return;
  } catch (e) { return; }

  const isMobile = window.innerWidth < 768;

  const canvas = document.createElement('canvas');
  canvas.id = 'cosmos-canvas';
  canvas.style.cssText = [
    'position:fixed', 'inset:0', 'width:100%', 'height:100%',
    'pointer-events:none', 'z-index:0', 'opacity:0', 'transition:opacity 0.9s ease'
  ].join(';');
  document.body.insertBefore(canvas, document.body.firstChild);

  window.addEventListener('load', function () {
    setTimeout(function () { canvas.style.opacity = '1'; }, 220);
  }, { once: true });

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 5;

  var scrollY = 0;
  var mouseX = 0, mouseY = 0;
  var targetX = 0, targetY = 0;

  // ─────────────────────────────────────────────────
  // NEBULA BACKGROUND  (desktop only)
  // Procedural FBM noise creates wispy purple clouds
  // ─────────────────────────────────────────────────

  var nebulaMat = null;

  if (!isMobile) {
    var nebulaVert = [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n');

    var nebulaFrag = [
      'uniform float uTime;',
      'varying vec2 vUv;',

      'float hash(vec2 p) {',
      '  p = fract(p * vec2(234.34, 435.345));',
      '  p += dot(p, p + 34.23);',
      '  return fract(p.x * p.y);',
      '}',

      'float noise(vec2 p) {',
      '  vec2 i = floor(p);',
      '  vec2 f = fract(p);',
      '  vec2 u = f * f * (3.0 - 2.0 * f);',
      '  return mix(',
      '    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
      '    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),',
      '    u.y);',
      '}',

      'float fbm(vec2 p) {',
      '  float v = 0.0; float a = 0.5;',
      '  mat2 rot = mat2(0.866, 0.5, -0.5, 0.866);',
      '  for (int i = 0; i < 5; i++) {',
      '    v += a * noise(p);',
      '    p  = rot * p * 2.1 + vec2(100.0);',
      '    a *= 0.5;',
      '  }',
      '  return v;',
      '}',

      'void main() {',
      '  vec2 uv = vUv;',
      '  float t = uTime * 0.013;',
      '  vec2  p = uv * 3.4 - vec2(1.7);',

      '  float n1 = fbm(p + t * vec2(0.09, 0.12));',
      '  float n2 = fbm(p * 1.7 - t * vec2(0.06, 0.04) + vec2(5.2, 1.3));',
      '  float n3 = fbm(p * 0.6 + t * vec2(0.04, 0.07) + vec2(2.4, 8.1));',

      '  float warp    = fbm(p + n1 * 0.68);',
      '  float density = fbm(p + warp * 0.44 + t * 0.055);',
      '  density = pow(max(0.0, density - 0.22), 2.2);',

      '  float core = pow(1.0 - smoothstep(0.0, 0.84, length(uv - vec2(0.5, 0.54)) * 1.58), 2.5) * 0.52;',

      '  vec3 deepPurple = vec3(0.04, 0.01, 0.13);',
      '  vec3 violet     = vec3(0.19, 0.07, 0.44);',
      '  vec3 lavender   = vec3(0.50, 0.29, 0.84);',
      '  vec3 pink       = vec3(0.66, 0.24, 0.74);',
      '  vec3 indigo     = vec3(0.08, 0.04, 0.30);',

      '  vec3 color = mix(deepPurple, violet, n1 * 1.2);',
      '  color = mix(color, lavender, density * 0.74);',
      '  color = mix(color, pink,     n2 * density * 0.46);',
      '  color = mix(color, indigo,   n3 * 0.34);',
      '  color += lavender * core;',

      '  float alpha = clamp(density * 0.66 + core * 0.44 + n1 * density * 0.12, 0.0, 0.76);',
      '  float dith = hash(vUv * vec2(7919.0, 4813.0)) * 0.022 - 0.011;',
      '  color = clamp(color + dith, 0.0, 1.0);',
      '  gl_FragColor = vec4(color, alpha);',
      '}'
    ].join('\n');

    nebulaMat = new THREE.ShaderMaterial({
      vertexShader: nebulaVert,
      fragmentShader: nebulaFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    var nebulaPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 14),
      nebulaMat
    );
    nebulaPlane.position.z = -9;
    scene.add(nebulaPlane);
  }

  // ─────────────────────────────────────────────────
  // SHARED GLSL SHADERS for all particle systems
  // Stars rendered as GPU points with per-star twinkle,
  // glow falloff, and diffraction spikes on bright stars
  // ─────────────────────────────────────────────────

  var starVert = [
    'uniform float uTime;',
    'uniform float uScroll;',
    'uniform vec2  uMouse;',
    'attribute float aSize;',
    'attribute vec3  aColor;',
    'attribute float aTwinkle;',
    'attribute float aDepth;',
    'varying vec3  vColor;',
    'varying float vAlpha;',
    'varying float vPtSize;',

    'void main() {',
    '  vColor = aColor;',
    '  float tw = sin(uTime * aTwinkle + position.x * 17.3 + position.y * 11.7) * 0.5 + 0.5;',
    '  vAlpha = 0.34 + tw * 0.66;',

    '  vec3 pos = position;',
    '  pos.x += uMouse.x * aDepth * 0.015;',
    '  pos.y += uMouse.y * aDepth * 0.010;',
    '  pos.y += uScroll  * aDepth * 0.000052;',

    '  vec4 mvp = modelViewMatrix * vec4(pos, 1.0);',
    '  float att = 265.0 / -mvp.z;',
    '  vPtSize    = aSize * att;',
    '  gl_PointSize = vPtSize * (0.76 + tw * 0.24);',
    '  gl_Position  = projectionMatrix * mvp;',
    '}'
  ].join('\n');

  var starFrag = [
    'varying vec3  vColor;',
    'varying float vAlpha;',
    'varying float vPtSize;',

    'void main() {',
    '  vec2  uv = gl_PointCoord - vec2(0.5);',
    '  float d  = length(uv);',
    '  if (d > 0.5) discard;',

    '  float core  = 1.0 - smoothstep(0.0, 0.11, d);',
    '  float mid   = 1.0 - smoothstep(0.0, 0.30, d);',
    '  float outer = pow(1.0 - smoothstep(0.0, 0.50, d), 2.4);',

    // Diffraction spikes — only on larger/brighter stars
    '  float spike = 0.0;',
    '  if (vPtSize > 2.4) {',
    '    spike = max(',
    '      exp(-abs(uv.x) * 26.0) * exp(-abs(uv.y) * 3.8),',
    '      exp(-abs(uv.y) * 26.0) * exp(-abs(uv.x) * 3.8)',
    '    ) * 0.58;',
    '  }',

    '  vec3  col   = vColor * (core * 1.6 + mid * 0.7 + outer * 0.35 + spike);',
    '  float alpha = (core + mid * 0.52 + outer * 0.20 + spike * 0.72) * vAlpha;',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  function buildPoints(count, positions, sizes, colors, twinkles, depths, uniforms) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
    geo.setAttribute('aDepth',   new THREE.BufferAttribute(depths, 1));

    var mat = new THREE.ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    return new THREE.Points(geo, mat);
  }

  // ─────────────────────────────────────────────────
  // MAIN STARFIELD
  // 2800 stars on desktop, 1100 on mobile
  // Colors: white, blue-white, lavender, warm purple
  // ─────────────────────────────────────────────────

  var STAR_N = isMobile ? 1100 : 2800;

  var sPos   = new Float32Array(STAR_N * 3);
  var sSize  = new Float32Array(STAR_N);
  var sColor = new Float32Array(STAR_N * 3);
  var sTw    = new Float32Array(STAR_N);
  var sDep   = new Float32Array(STAR_N);

  var palette = [
    [1.00, 1.00, 1.00],
    [0.86, 0.90, 1.00],
    [0.80, 0.74, 1.00],
    [0.94, 0.88, 1.00],
    [0.70, 0.62, 0.98],
    [0.96, 0.96, 1.00],
    [0.74, 0.68, 0.96]
  ];

  for (var i = 0; i < STAR_N; i++) {
    var i3    = i * 3;
    var theta = Math.random() * Math.PI * 2;
    var r     = Math.pow(Math.random(), 0.42) * 13;

    sPos[i3]     = Math.cos(theta) * r + (Math.random() - 0.5) * 1.8;
    sPos[i3 + 1] = (Math.random() - 0.5) * 9;
    sPos[i3 + 2] = -2.5 - Math.random() * 16;

    sDep[i]  = 0.22 + Math.random() * 0.78;
    sSize[i] = 0.006 + Math.pow(Math.random(), 3.4) * 0.060;

    var c = palette[Math.floor(Math.random() * palette.length)];
    sColor[i3] = c[0]; sColor[i3 + 1] = c[1]; sColor[i3 + 2] = c[2];
    sTw[i] = 0.32 + Math.random() * 2.5;
  }

  var starUniforms = {
    uTime:   { value: 0 },
    uScroll: { value: 0 },
    uMouse:  { value: new THREE.Vector2() }
  };

  var starMesh = buildPoints(STAR_N, sPos, sSize, sColor, sTw, sDep, starUniforms);
  scene.add(starMesh);

  // ─────────────────────────────────────────────────
  // GALACTIC DUST RING  (desktop only)
  // 420 purple particles in an elliptical orbit —
  // complements the CSS ring pseudo-element in #atmosphere
  // ─────────────────────────────────────────────────

  var ringMesh = null;
  var ringUniforms = null;

  if (!isMobile) {
    var RING_N = 420;
    var rPos   = new Float32Array(RING_N * 3);
    var rSize  = new Float32Array(RING_N);
    var rColor = new Float32Array(RING_N * 3);
    var rTw    = new Float32Array(RING_N);
    var rDep   = new Float32Array(RING_N);

    for (var j = 0; j < RING_N; j++) {
      var j3     = j * 3;
      var angle  = (j / RING_N) * Math.PI * 2 + (Math.random() - 0.5) * 0.24;
      var spread = 0.88 + Math.random() * 0.24;

      rPos[j3]     = Math.cos(angle) * 5.5 * spread;
      rPos[j3 + 1] = Math.sin(angle) * 0.82 * spread + (Math.random() - 0.5) * 0.20;
      rPos[j3 + 2] = -4.5 + (Math.random() - 0.5) * 0.55;

      rDep[j]  = 0.38 + Math.random() * 0.62;
      rSize[j] = 0.003 + Math.random() * 0.018;

      var rt = Math.random();
      rColor[j3]     = 0.52 + rt * 0.34;
      rColor[j3 + 1] = 0.24 + rt * 0.26;
      rColor[j3 + 2] = 0.86 + rt * 0.14;
      rTw[j] = 0.48 + Math.random() * 2.1;
    }

    ringUniforms = {
      uTime:   { value: 0 },
      uScroll: { value: 0 },
      uMouse:  { value: new THREE.Vector2() }
    };

    ringMesh = buildPoints(RING_N, rPos, rSize, rColor, rTw, rDep, ringUniforms);
    ringMesh.rotation.x = -0.22;
    scene.add(ringMesh);
  }

  // ─────────────────────────────────────────────────
  // LOGO AREA STAR HALO
  // Stars concentrated around the 4K logo position
  // (screen center-lower, ~56% y). Lavender/purple tones
  // to match the logo glow — more visible than the
  // general starfield in that region.
  // ─────────────────────────────────────────────────
  //
  // Logo is at (50%, 56%) in screen space.
  // With camera at z=5, FOV 60°, at world z=-4 (9 units out):
  //   ndc_y offset = (0.56 - 0.5) * 2 = 0.12 below center
  //   world_y = -0.12 * 9 * tan(30°) ≈ -0.62

  var HALO_N = isMobile ? 80 : 220;
  var hPos   = new Float32Array(HALO_N * 3);
  var hSize  = new Float32Array(HALO_N);
  var hColor = new Float32Array(HALO_N * 3);
  var hTw    = new Float32Array(HALO_N);
  var hDep   = new Float32Array(HALO_N);

  for (var k = 0; k < HALO_N; k++) {
    var k3     = k * 3;
    var hAngle = Math.random() * Math.PI * 2;
    var hR     = Math.pow(Math.random(), 0.55) * 3.2;

    hPos[k3]     = Math.cos(hAngle) * hR;
    hPos[k3 + 1] = -0.62 + Math.sin(hAngle) * hR * 0.44;
    hPos[k3 + 2] = -3.2 - Math.random() * 2.4;

    hDep[k]  = 0.28 + Math.random() * 0.72;
    hSize[k] = 0.005 + Math.pow(Math.random(), 2.8) * 0.052;

    var ht = Math.random();
    hColor[k3]     = 0.66 + ht * 0.28;
    hColor[k3 + 1] = 0.50 + ht * 0.36;
    hColor[k3 + 2] = 0.90 + ht * 0.10;
    hTw[k] = 0.38 + Math.random() * 2.4;
  }

  var haloUniforms = {
    uTime:   { value: 0 },
    uScroll: { value: 0 },
    uMouse:  { value: new THREE.Vector2() }
  };

  var haloMesh = buildPoints(HALO_N, hPos, hSize, hColor, hTw, hDep, haloUniforms);
  scene.add(haloMesh);

  // ─────────────────────────────────────────────────
  // WIREFRAME ARTIFACTS  (desktop only)
  // Holographic scientific models — museum exhibit feel
  // ─────────────────────────────────────────────────

  var artifacts = [];

  if (!isMobile) {
    // Geodesic crystal — upper right
    var icoGeo   = new THREE.IcosahedronGeometry(0.72, 2);
    var icoEdges = new THREE.EdgesGeometry(icoGeo);
    var icoMat   = new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.22 });
    var icoMesh  = new THREE.LineSegments(icoEdges, icoMat);
    icoMesh.position.set(3.8, 1.6, -4.0);
    scene.add(icoMesh);
    artifacts.push({ mesh: icoMesh, rx: 0.0028, ry: 0.0042, rz: 0,     baseY: 1.6,  sf: 0.0005 });

    // Octahedron — lower left
    var octGeo   = new THREE.OctahedronGeometry(0.62);
    var octEdges = new THREE.EdgesGeometry(octGeo);
    var octMat   = new THREE.LineBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.18 });
    var octMesh  = new THREE.LineSegments(octEdges, octMat);
    octMesh.position.set(-4.2, -1.2, -4.5);
    scene.add(octMesh);
    artifacts.push({ mesh: octMesh, rx: -0.0038, ry: 0.0024, rz: 0,    baseY: -1.2, sf: 0.0004 });

    // Orbit torus — lower right
    var torGeo   = new THREE.TorusGeometry(0.88, 0.016, 6, 60);
    var torWire  = new THREE.WireframeGeometry(torGeo);
    var torMat   = new THREE.LineBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.16 });
    var torMesh  = new THREE.LineSegments(torWire, torMat);
    torMesh.position.set(2.8, -2.4, -5.5);
    torMesh.rotation.x = 0.5;
    scene.add(torMesh);
    artifacts.push({ mesh: torMesh, rx: 0,       ry: 0.005,  rz: 0.003, baseY: -2.4, sf: 0.0007 });

    // Tetrahedron — top left background
    var tetGeo   = new THREE.TetrahedronGeometry(0.52);
    var tetEdges = new THREE.EdgesGeometry(tetGeo);
    var tetMat   = new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.15 });
    var tetMesh  = new THREE.LineSegments(tetEdges, tetMat);
    tetMesh.position.set(-3.2, 2.8, -5.2);
    scene.add(tetMesh);
    artifacts.push({ mesh: tetMesh, rx: 0.005,   ry: -0.003, rz: 0.002, baseY: 2.8,  sf: 0.0003 });

    // ── Vinyl record ──
    var vinylVert = [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n');

    var vinylFrag = [
      'uniform float uTime;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec2 uv = vUv - vec2(0.5);',
      '  float r = length(uv);',
      '  if (r > 0.49) discard;',
      '  if (r < 0.022) discard;',
      '  if (r < 0.105) {',
      '    gl_FragColor = vec4(0.26, 0.09, 0.46, 0.90);',
      '    return;',
      '  }',
      '  float groove = fract(r * 52.0);',
      '  float grooveLine = smoothstep(0.0, 0.28, groove) * (1.0 - smoothstep(0.72, 1.0, groove));',
      '  vec3 base = vec3(0.05, 0.03, 0.09);',
      '  vec3 col = mix(base, vec3(0.12, 0.07, 0.20), grooveLine * 0.5);',
      '  float angle = atan(uv.y, uv.x);',
      '  float sheen = pow(max(0.0, sin(angle + uTime * 0.45)), 4.0) * 0.45 * (1.0 - r * 1.6);',
      '  col += vec3(0.30, 0.06, 0.58) * sheen;',
      '  gl_FragColor = vec4(col, 0.88);',
      '}'
    ].join('\n');

    var vinylMat = new THREE.ShaderMaterial({
      vertexShader: vinylVert,
      fragmentShader: vinylFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var vinyl = new THREE.Mesh(new THREE.CircleGeometry(1.2, 72), vinylMat);
    vinyl.position.set(-3.0, 0.6, -4.2);
    vinyl.rotation.x = 0.28;
    vinyl.rotation.z = 0.12;
    scene.add(vinyl);
  }

  // ─────────────────────────────────────────────────
  // EVENT LISTENERS
  // ─────────────────────────────────────────────────

  window.addEventListener('scroll', function () {
    scrollY = window.scrollY;
  }, { passive: true });

  window.addEventListener('mousemove', function (e) {
    targetX = (e.clientX / window.innerWidth  - 0.5) * 2;
    targetY = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  window.addEventListener('resize', function () {
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }, { passive: true });

  // ─────────────────────────────────────────────────
  // ANIMATION LOOP
  // ─────────────────────────────────────────────────

  function tick(now) {
    requestAnimationFrame(tick);
    var t = now * 0.001;

    mouseX += (targetX - mouseX) * 0.04;
    mouseY += (targetY - mouseY) * 0.04;

    if (nebulaMat) nebulaMat.uniforms.uTime.value = t;

    starUniforms.uTime.value   = t;
    starUniforms.uScroll.value = scrollY;
    starUniforms.uMouse.value.set(mouseX, mouseY);

    if (ringUniforms) {
      ringUniforms.uTime.value   = t;
      ringUniforms.uScroll.value = scrollY;
      ringUniforms.uMouse.value.set(mouseX, mouseY);
      ringMesh.rotation.z = t * 0.009;
    }

    haloUniforms.uTime.value   = t;
    haloUniforms.uScroll.value = scrollY;
    haloUniforms.uMouse.value.set(mouseX, mouseY);

    // Animate vinyl
    if (vinyl) {
      vinyl.rotation.y += 0.007;
      vinylMat.uniforms.uTime.value = t;
      vinyl.position.y = 0.6 - scrollY * 0.00055;
    }

    // Animate wireframe artifacts
    for (var ai = 0; ai < artifacts.length; ai++) {
      var a = artifacts[ai];
      if (a.rx) a.mesh.rotation.x += a.rx;
      if (a.ry) a.mesh.rotation.y += a.ry;
      if (a.rz) a.mesh.rotation.z += a.rz;
      a.mesh.position.y = a.baseY - scrollY * a.sf;
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
})();
