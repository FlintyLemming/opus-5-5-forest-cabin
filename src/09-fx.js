/* Atmosphere effects: chimney and fire smoke, mug steam, campfire flames and embers, dust motes,
   falling leaves, fireflies, a passing flock of birds and volumetric light shafts. */

const FXU = {
  uAmbient: { value: new THREE.Color(0.3, 0.3, 0.35) },
  uKeyLit: { value: new THREE.Color(1, 0.8, 0.6) },
  uPxScale: { value: 600 },
  uFire: { value: 1 },
  uDust: { value: 1 },
  uFireflies: { value: 0 },
  uShafts: { value: 0.6 },
  uSmokeShade: { value: new THREE.Vector2(0, 0) },   // x: clearing floor height, y: how low the key light is (0..1)
};

const PARTICLE_ATMOS = `${GLSL_NOISE}\n${GLSL_ATMOS}`;

class SmokeSystem {
  constructor(T, { emitter, count, rate, life, size0, size1, rise, spread, opacity, lit = 1, tint = [1, 1, 1], drift = 1, rand }) {
    this.o = { emitter, count, rate, life, size0, size1, rise, spread, opacity, lit, drift };
    this.rng = rand;
    this.p = [];
    this.acc = 0;
    this.level = 1;
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute('aPos', this.aPos);
    quad.setAttribute('aData', this.aData);
    quad.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, ...FXU, uTex: { value: T.smoke }, uOpacity: { value: opacity }, uLit: { value: lit }, uTint: { value: new THREE.Color(...tint) } },
      vertexShader: /* glsl */ `
uniform vec2 uSmokeShade;
attribute vec3 aPos;
attribute vec4 aData;
varying vec2 vUv;
varying float vAlpha;
varying float vSun;
varying vec3 vWorld;
void main() {
  vUv = position.xy + 0.5;
  float c = cos(aData.y), s = sin(aData.y);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aData.x;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = aPos + right * q.x + up * q.y;
  vWorld = wp;
  vAlpha = aData.z;
  // a low sun only reaches the smoke once it has risen above the surrounding crowns
  vSun = mix(1.0, smoothstep(uSmokeShade.x + 7.0, uSmokeShade.x + 24.0, aPos.y), uSmokeShade.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uAmbient;
uniform vec3 uKeyLit;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uLit;
${PARTICLE_ATMOS}
varying vec2 vUv;
varying float vAlpha;
varying float vSun;
varying vec3 vWorld;
void main() {
  vec4 t = texture2D(uTex, vUv);
  float a = t.a * vAlpha * uOpacity;
  vec3 vd = normalize(vWorld - cameraPosition);
  a *= smoothstep(0.4, 2.5, length(vWorld - cameraPosition));
  if (a < 0.002) discard;
  float fwd = pow(max(dot(vd, uScatterDir), 0.0), 5.0);
  vec3 col = (uAmbient * (0.5 + 0.4 * t.r) + uKeyLit * uLit * (0.25 + 0.8 * fwd) * vSun) * uTint;
  col = applyAtmos(col, vWorld);
  gl_FragColor = vec4(col * a, a);
}`,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    this.mesh = new THREE.Mesh(quad, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.geo = quad;
    this._cam = new THREE.Vector3();
  }
  spawn() {
    const r = this.rng, o = this.o;
    this.p.push({
      x: o.emitter.x + r.range(-o.spread, o.spread), y: o.emitter.y, z: o.emitter.z + r.range(-o.spread, o.spread),
      vx: r.range(-0.12, 0.12) * o.drift, vy: o.rise * r.range(0.8, 1.25), vz: r.range(-0.12, 0.12) * o.drift,
      age: 0, life: o.life * r.range(0.75, 1.2), rot: r() * TAU, spin: r.range(-0.25, 0.25), s0: o.size0 * r.range(0.8, 1.2), s1: o.size1 * r.range(0.8, 1.25),
    });
  }
  update(dt, time, camera) {
    const o = this.o;
    const wind = U.uWind.value;
    const rate = o.rate * this.level;
    this.acc += dt * rate;
    while (this.acc > 1) {
      this.acc -= 1;
      if (this.p.length < o.count) this.spawn();
    }
    const gust = 0.6 + 0.8 * wind.w;
    for (const q of this.p) {
      q.age += dt;
      const t = q.age / q.life;
      q.vy *= Math.exp(-dt * 0.35);
      q.vx += (wind.x * wind.z * gust * 1.2 * o.drift - q.vx) * dt * 0.6;
      q.vz += (wind.y * wind.z * gust * 1.2 * o.drift - q.vz) * dt * 0.6;
      q.x += q.vx * dt + Math.sin(time * 0.7 + q.rot * 3) * 0.08 * dt * (1 + t * 3);
      q.y += q.vy * dt;
      q.z += q.vz * dt + Math.cos(time * 0.6 + q.rot * 2) * 0.08 * dt * (1 + t * 3);
      q.rot += q.spin * dt;
    }
    this.p = this.p.filter((q) => q.age < q.life);
    camera.getWorldPosition(this._cam);
    const cp = this._cam;
    this.p.sort((a, b) => ((b.x - cp.x) ** 2 + (b.y - cp.y) ** 2 + (b.z - cp.z) ** 2) - ((a.x - cp.x) ** 2 + (a.y - cp.y) ** 2 + (a.z - cp.z) ** 2));
    const P = this.aPos.array, D = this.aData.array;
    this.p.forEach((q, i) => {
      const t = q.age / q.life;
      P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.z;
      D[i * 4] = lerp(q.s0, q.s1, Math.pow(t, 0.6));
      D[i * 4 + 1] = q.rot;
      // thin at the source, fullest once the puff has opened up, gone before it stalls
      D[i * 4 + 2] = smoothstep(0, 0.05, t) * (0.15 + 0.85 * smoothstep(0.03, 0.35, t)) * (1 - smoothstep(0.42, 1, t)) * this.level;
      D[i * 4 + 3] = 0;
    });
    this.geo.instanceCount = this.p.length;
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
  }
  prewarm(seconds, camera) {
    for (let t = 0; t < seconds; t += 0.1) this.update(0.1, t, camera);
  }
}

function pointsMaterial(vertexBody, fragmentBody, extraUniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...FXU, ...extraUniforms },
    vertexShader: /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
uniform float uPxScale;
uniform vec3 uScatterDir;
attribute vec4 aSeed;
varying float vBright;
varying vec3 vWorld;
${vertexBody}`,
    fragmentShader: /* glsl */ `
${PARTICLE_ATMOS}
varying float vBright;
varying vec3 vWorld;
${fragmentBody}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function buildFX(T, M, cabin, yard, forest) {
  const rng = makeRng('fx');
  const group = new THREE.Group();
  group.name = 'fx';
  const fx = { group, smoke: [], update: null };

  // smoke
  const chimney = new SmokeSystem(T, { emitter: cabin.emitters.chimney, count: 90, rate: 7, life: 11, size0: 0.45, size1: 3.6, rise: 1.3, spread: 0.15, opacity: 0.13, lit: 0.65, rand: rng });
  const fireSmoke = new SmokeSystem(T, { emitter: yard.emitters.fire.clone().add(new THREE.Vector3(0, 0.6, 0)), count: 28, rate: 4.5, life: 5.5, size0: 0.35, size1: 2.4, rise: 1.0, spread: 0.12, opacity: 0.12, lit: 0.7, rand: rng });
  const steam = new SmokeSystem(T, { emitter: cabin.emitters.mug, count: 14, rate: 4, life: 2.6, size0: 0.04, size1: 0.2, rise: 0.12, spread: 0.01, opacity: 0.22, lit: 0.5, tint: [1.2, 1.2, 1.2], drift: 0.12, rand: rng });
  fx.smoke.push(chimney, fireSmoke, steam);
  for (const s of fx.smoke) group.add(s.mesh);

  // campfire flames: three camera-facing (cylindrical) billboards with a noise-driven flame shape
  const fp = yard.emitters.fire;
  const flameGeo = new THREE.InstancedBufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  flameGeo.setIndex([0, 1, 2, 0, 2, 3]);
  flameGeo.setAttribute('aFlame', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0.62, 0.0, 0.12, 0.06, 0.48, 0.37, -0.1, 0.08, 0.42, 0.71]), 4));
  flameGeo.instanceCount = 3;
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...FXU, uNoiseTex: { value: T.noise }, uCenter: { value: fp.clone() } },
    vertexShader: /* glsl */ `
attribute vec4 aFlame;
uniform vec3 uCenter;
uniform float uFire;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = position.xy + vec2(0.5, 0.0);
  vSeed = aFlame.w;
  vec3 c = uCenter + vec3(aFlame.x, 0.0, aFlame.y);
  vec3 toCam = cameraPosition - c;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
  float w = aFlame.z * (0.75 + 0.25 * uFire);
  vec3 wp = c + right * position.x * w + vec3(0.0, position.y * w * 1.55 * (0.6 + 0.4 * uFire), 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uFire;
varying vec2 vUv;
varying float vSeed;
void main() {
  vec2 uv = vUv;
  float n1 = texture2D(uNoiseTex, vec2(uv.x * 0.7 + vSeed, uv.y * 0.55 - uTime * 1.25)).b;
  float n2 = texture2D(uNoiseTex, vec2(uv.x * 1.5 - vSeed, uv.y * 1.1 - uTime * 2.2)).r;
  float shape = (1.0 - uv.y) * (1.0 - pow(abs(uv.x - 0.5) * 2.0, 1.6));
  float f = shape * 1.45 - (n1 * 0.62 + n2 * 0.38) * (0.35 + uv.y * 0.95);
  float a = smoothstep(0.04, 0.32, f);
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.68, 0.24), smoothstep(0.18, 0.62, f));
  col = mix(col, vec3(1.0, 0.93, 0.75), smoothstep(0.62, 0.95, f));
  gl_FragColor = vec4(col * a * uFire * 9.0, 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const flames = new THREE.Mesh(flameGeo, flameMat);
  flames.frustumCulled = false;
  flames.renderOrder = 6;
  group.add(flames);

  // embers rising from the fire
  {
    const n = 46;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = fp.x; pos[i * 3 + 1] = fp.y; pos[i * 3 + 2] = fp.z;
      seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng.range(1.6, 3.4); seed[i * 4 + 3] = rng();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = pointsMaterial(/* glsl */ `
uniform float uFire;
void main() {
  float t = fract(uTime / aSeed.z + aSeed.w);
  vec3 p = position;
  p.y += 0.2 + t * (2.2 + aSeed.x * 1.6);
  p.x += sin(uTime * 2.1 + aSeed.y * 30.0) * 0.18 * t + uWind.x * t * t * 1.4 + (aSeed.x - 0.5) * 0.5 * t;
  p.z += cos(uTime * 1.7 + aSeed.x * 20.0) * 0.18 * t + uWind.y * t * t * 1.4 + (aSeed.y - 0.5) * 0.5 * t;
  vBright = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.05, t) * uFire * (0.5 + 0.5 * sin(uTime * 13.0 + aSeed.w * 50.0));
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(0.035 * uPxScale / -mv.z, 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}`, /* glsl */ `
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d));
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * a * vBright * 6.0, 1.0);
}`);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    group.add(pts);
  }

  // dust motes floating in the evening light
  {
    const n = 700;
    const c = WORLD.clearing;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 22;
      const x = c.cx + Math.cos(a) * r, z = c.cz + Math.sin(a) * r * 1.1;
      pos[i * 3] = x; pos[i * 3 + 1] = World.heightAt(x, z) + rng.range(0.3, 7); pos[i * 3 + 2] = z;
      seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng.range(0.6, 1.4); seed[i * 4 + 3] = rng();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = pointsMaterial(/* glsl */ `
uniform float uDust;
void main() {
  vec3 p = position + vec3(sin(uTime * 0.11 + aSeed.x * 40.0), sin(uTime * 0.07 + aSeed.y * 30.0) * 0.5, cos(uTime * 0.09 + aSeed.w * 50.0)) * 0.7;
  p.xz += uWind.xy * sin(uTime * 0.05 + aSeed.x * 6.0) * 0.6;
  vWorld = p;
  vec3 vd = normalize(p - cameraPosition);
  float fwd = pow(max(dot(vd, uScatterDir), 0.0), 7.0);
  vBright = (0.08 + 2.6 * fwd) * uDust * (0.5 + 0.5 * sin(uTime * 0.8 + aSeed.w * 20.0)) * aSeed.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vBright *= smoothstep(0.6, 3.0, -mv.z) * (1.0 - smoothstep(25.0, 45.0, -mv.z));
  gl_PointSize = clamp(0.012 * uPxScale / -mv.z, 1.0, 4.0);
  gl_Position = projectionMatrix * mv;
}`, /* glsl */ `
uniform vec3 uKeyLit;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uKeyLit * a * vBright * 0.6, 1.0);
}`);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    group.add(pts);
  }

  // fireflies over the meadow edge and the creek at dusk and night
  {
    const n = 140;
    const c = WORLD.clearing;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    let i = 0;
    while (i < n) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 40;
      const x = c.cx + Math.cos(a) * r, z = c.cz + Math.sin(a) * r;
      const e = World.ellipse(x, z);
      const ok = (e > 0.65 && e < 1.5) || World.creekDist(x, z) < 6;
      if (!ok || (x > -4 && x < 5 && z > -3.5 && z < 6)) continue;
      pos[i * 3] = x; pos[i * 3 + 1] = World.heightAt(x, z) + rng.range(0.3, 2.4); pos[i * 3 + 2] = z;
      seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng.range(2.5, 6); seed[i * 4 + 3] = rng();
      i++;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = pointsMaterial(/* glsl */ `
uniform float uFireflies;
void main() {
  float t = uTime * (0.18 + aSeed.x * 0.15);
  vec3 p = position + vec3(sin(t + aSeed.y * 30.0) * 1.4 + sin(t * 2.3 + aSeed.w * 10.0) * 0.4, sin(t * 1.3 + aSeed.x * 20.0) * 0.45, cos(t * 0.9 + aSeed.w * 40.0) * 1.4);
  vWorld = p;
  float blink = sin(uTime * 6.2831 / aSeed.z + aSeed.w * 6.2831);
  vBright = pow(smoothstep(0.55, 1.0, blink), 2.0) * uFireflies;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(0.06 * uPxScale / -mv.z, 1.5, 9.0);
  gl_Position = projectionMatrix * mv;
}`, /* glsl */ `
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(vec3(0.75, 1.0, 0.32) * a * vBright * 7.0, 1.0);
}`);
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    group.add(pts);
  }

  // falling leaves
  const leaves = (() => {
    const max = 110;
    const parts = [0, 2, 3, 4].map((cell) => flatCard('leaf', cell, 0.11, rng));
    const geo = mergeGeometries([parts[0]], { aWind: 3 });
    const mesh = new THREE.InstancedMesh(geo, M.leaf, max);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const sources = forest.instances.filter((o) => (o.species === 'birch' || o.species === 'maple') && Math.hypot(o.x - WORLD.clearing.cx, o.z - WORLD.clearing.cz) < 45);
    const items = [];
    const tint = new THREE.Color();
    const spawn = (q, initial) => {
      const s = rng.pick(sources.length ? sources : [{ x: 0, z: 0, scale: 1, species: 'birch' }]);
      const a = rng() * TAU, r = rng.range(0.5, 4);
      q.x = s.x + Math.cos(a) * r; q.z = s.z + Math.sin(a) * r;
      const top = World.heightAt(q.x, q.z) + rng.range(5, 11) * s.scale;
      q.y = initial ? lerp(World.heightAt(q.x, q.z) + 0.5, top, rng()) : top;
      q.vy = rng.range(0.55, 0.95);
      q.phase = rng() * TAU;
      q.freq = rng.range(0.8, 1.6);
      q.amp = rng.range(0.4, 0.9);
      q.ax = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      q.spin = rng.range(1.5, 4.5) * rng.sign();
      q.angle = rng() * TAU;
      q.rest = 0;
      q.maple = s.species === 'maple';
    };
    for (let i = 0; i < max; i++) { const q = {}; spawn(q, true); items.push(q); }
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let active = max;
    return {
      mesh,
      setLevel(level) { active = Math.max(0, Math.min(max, Math.round(max * level))); mesh.count = active; },
      update(dt, time) {
        const w = U.uWind.value;
        for (let i = 0; i < active; i++) {
          const q = items[i];
          const ground = World.heightAt(q.x, q.z) + 0.02;
          if (q.rest > 0) {
            q.rest -= dt;
            if (q.rest <= 0) spawn(q, false);
          } else {
            q.y -= q.vy * dt;
            q.x += (Math.sin(time * q.freq + q.phase) * q.amp + w.x * w.z * (0.6 + w.w)) * dt;
            q.z += (Math.cos(time * q.freq * 0.8 + q.phase) * q.amp * 0.6 + w.y * w.z * (0.6 + w.w)) * dt;
            q.angle += q.spin * dt;
            if (q.y <= ground) { q.y = ground; q.rest = rng.range(2, 6); }
          }
          qt.setFromAxisAngle(q.ax, q.rest > 0 ? 1.57 : q.angle);
          m4.compose(p.set(q.x, q.y, q.z), qt, sc);
          mesh.setMatrixAt(i, m4);
          tint.set(q.maple ? 0xff9a7a : 0xffffff);
          mesh.setColorAt(i, tint);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
    };
  })();
  group.add(leaves.mesh);

  // a flock of birds crossing the sky now and then
  const birds = (() => {
    const n = 7;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.8, 0, -0.1, 0, 0, -0.18, 0, 0, 0.12, 0, 0, -0.18, 0.8, 0, -0.1], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aWing', new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 1], 1));
    const mat = new THREE.MeshBasicMaterial({ color: lin('#141412'), side: THREE.DoubleSide });
    patchMaterial(mat, {
      vsPars: 'attribute float aWing;',
      vsBegin: 'vec3 transformed = vec3(position);\nfloat flap = sin(uTime * 9.0 + float(gl_InstanceID) * 1.7);\ntransformed.y += aWing * flap * 0.45;\ntransformed.x *= 1.0 - aWing * abs(flap) * 0.2;',
    });
    const mesh = new THREE.InstancedMesh(g, mat, n);
    mesh.frustumCulled = false;
    const offs = [];
    for (let i = 0; i < n; i++) offs.push(new THREE.Vector3((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2.2, rng.range(-1, 1), -Math.ceil(i / 2) * 2.6));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1.4, 1.4, 1.4);
    let level = 0.5;
    return {
      mesh,
      setLevel(l) { level = l; },
      update(dt, time) {
        const period = 52, t = (time % period) / period;
        const visible = level > 0.15 && t < 0.55;
        mesh.visible = visible;
        if (!visible) return;
        const u = t / 0.55;
        const c = WORLD.clearing;
        const a0 = 200 * DEG, a1 = 330 * DEG;
        const a = lerp(a0, a1, u);
        const R = 95;
        const center = new THREE.Vector3(c.cx + Math.sin(a) * R, World.H0 + 42 + Math.sin(u * Math.PI) * 10, c.cz + Math.cos(a) * R);
        const dir = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        offs.forEach((o, i) => {
          p.copy(o).applyQuaternion(q).add(center);
          p.y += Math.sin(time * 0.9 + i) * 0.6;
          m4.compose(p, q, s);
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  })();
  group.add(birds.mesh);

  // volumetric light shafts: long additive cards aligned with the key light, billboarded around their axis
  const shafts = (() => {
    const n = 16;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const aA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const aB = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    g.setAttribute('aShaftA', aA);
    g.setAttribute('aShaftB', aB);
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, ...FXU, uNoiseTex: { value: T.noise } },
      vertexShader: /* glsl */ `
attribute vec4 aShaftA; // ground point xyz, width
attribute vec4 aShaftB; // length, seed, strength, unused
uniform vec3 uScatterDir;
varying vec2 vUv;
varying float vSeed;
varying float vStrength;
varying vec3 vWorld;
void main() {
  vec3 axis = normalize(uScatterDir);
  vec3 base = aShaftA.xyz;
  vec3 mid = base + axis * aShaftB.x * 0.5;
  vec3 toCam = normalize(cameraPosition - mid);
  vec3 side = normalize(cross(axis, toCam));
  vec3 wp = base + side * position.x * aShaftA.w + axis * position.y * aShaftB.x;
  vUv = vec2(position.x + 0.5, position.y);
  vSeed = aShaftB.y;
  vStrength = aShaftB.z * smoothstep(0.0, 0.35, abs(dot(toCam, side) * 0.0 + 1.0 - abs(dot(toCam, axis))));
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uShafts;
uniform vec3 uKeyLit;
uniform vec3 uScatterDir;
varying vec2 vUv;
varying float vSeed;
varying float vStrength;
varying vec3 vWorld;
void main() {
  float across = exp(-pow((vUv.x - 0.5) * 2.6, 2.0) * 2.2);
  float along = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float n = texture2D(uNoiseTex, vec2(vUv.x * 0.6 + vSeed, vUv.y * 0.4 - uTime * 0.012)).b;
  float flick = 0.75 + 0.25 * sin(uTime * 0.35 + vSeed * 20.0);
  vec3 vd = normalize(vWorld - cameraPosition);
  float fwd = 0.25 + 1.6 * pow(max(dot(vd, normalize(uScatterDir)), 0.0), 3.0);
  float dist = length(vWorld - cameraPosition);
  float near = smoothstep(1.0, 6.0, dist);
  float a = across * along * (0.55 + 0.9 * n) * flick * fwd * near * vStrength * uShafts * 0.11;
  gl_FragColor = vec4(uKeyLit * a, 1.0);
}`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    const srng = makeRng('shafts');
    const seeds = [];
    for (let i = 0; i < n; i++) seeds.push([srng(), srng(), srng(), srng()]);
    return {
      mesh,
      place() {
        const dir = U.uScatterDir.value;
        const az = Math.atan2(dir.x, dir.z);
        const c = WORLD.clearing;
        const A = aA.array, B = aB.array;
        for (let i = 0; i < n; i++) {
          const [s0, s1, s2, s3] = seeds[i];
          const a = az + (s0 - 0.5) * 1.6;
          const rr = lerp(0.35, 0.95, s1);
          const x = c.cx + Math.sin(a) * c.rx * rr, z = c.cz + Math.cos(a) * c.rz * rr;
          A[i * 4] = x;
          A[i * 4 + 1] = World.heightAt(x, z) + lerp(-0.2, 1.5, s2);
          A[i * 4 + 2] = z;
          A[i * 4 + 3] = lerp(0.9, 3.4, s3);
          B[i * 4] = lerp(26, 48, s2);
          B[i * 4 + 1] = s0 * 10;
          B[i * 4 + 2] = lerp(0.45, 1.0, s1);
        }
        aA.needsUpdate = true;
        aB.needsUpdate = true;
      },
    };
  })();
  shafts.place();
  group.add(shafts.mesh);

  // fire light and porch lantern
  const fireLight = new THREE.PointLight(0xff8a3a, 1, 14, 2);
  fireLight.position.copy(fp).add(new THREE.Vector3(0, 0.55, 0));
  const lantern = new THREE.PointLight(0xffb36a, 1, 9, 2);
  lantern.position.copy(cabin.lights.lantern);
  const windowLight = new THREE.PointLight(0xffa860, 1, 7, 2);
  windowLight.position.set(0, CABIN.FL + 1.25, CABIN.zw + 1.4);
  group.add(fireLight, lantern, windowLight);

  let fireLevel = 1, lanternLevel = 1, windowLevel = 1;
  let lastDir = new THREE.Vector3();
  fx.setTime = (p) => {
    fireLevel = p.fire;
    lanternLevel = p.lantern;
    windowLevel = p.windows;
    FXU.uDust.value = p.dust;
    FXU.uFireflies.value = p.fireflies;
    FXU.uShafts.value = p.shafts;
    GLOW_LEVELS.windows.value = p.windows;
    GLOW_LEVELS.lantern.value = p.lantern;
    const amb = new THREE.Color().copy(p.hemiSky).multiplyScalar(p.hemiIntensity * 0.2).add(p.fogA.clone().multiplyScalar(0.1));
    FXU.uAmbient.value.copy(amb);
    FXU.uKeyLit.value.copy(p.keyColor).multiplyScalar(p.keyIntensity * 0.16 * smoothstep(-2, 3, p.keyEl));
    FXU.uSmokeShade.value.set(World.H0, 1 - smoothstep(10, 30, p.keyEl));
    for (const s of fx.smoke) s.level = s === steam ? 1 : p.smoke;
    leaves.setLevel(p.leaves * fx.quality);
    birds.setLevel(p.birds);
    if (lastDir.distanceToSquared(U.uScatterDir.value) > 1e-5) {
      shafts.place();
      lastDir.copy(U.uScatterDir.value);
    }
  };
  fx.quality = 1;
  fx.setQuality = (q) => {
    fx.quality = q.fx;
  };
  fx.update = (dt, time, app) => {
    const cam = app.camera;
    FXU.uPxScale.value = app.post.h / (2 * Math.tan((cam.fov * DEG) / 2));
    const flicker = 0.78 + 0.12 * Math.sin(time * 11.3) + 0.1 * Noise.n2(time * 6.0, 1.7);
    FXU.uFire.value = fireLevel * (0.85 + 0.15 * Noise.n2(time * 3.0, 4.2));
    fireLight.intensity = fireLevel * 9 * flicker;
    lantern.intensity = lanternLevel * 1.8 * (0.97 + 0.03 * Math.sin(time * 7.0));
    windowLight.intensity = windowLevel * 0.45;
    for (const s of fx.smoke) s.update(dt, time, cam);
    leaves.update(dt, time);
    birds.update(dt, time);
  };
  fx.prewarm = (camera) => { for (const s of fx.smoke) s.prewarm(s === chimney ? 12 : 6, camera); };
  fx.lights = { fireLight, lantern, windowLight };
  return fx;
}
