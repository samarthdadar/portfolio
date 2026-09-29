/*! ============================================================
 *  scenes.js — Swappable 3D scene library for SDScroll
 *  Requires: THREE (via importmap) · window.SDScroll · anime.js
 * ============================================================ */
(function () {
    'use strict';

    const getCss = (name) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';

    /* ============================================================
     * SCENE REGISTRY
     * Each scene: { name, label, icon, create(ctx) → instance }
     * instance:  { object, update(t, s, camera), refreshTheme(), dispose() }
     * ========================================================== */
    const registry = {};
    const register = (def) => { registry[def.name] = def; };

    /* ------------------------------------------------------------
     * 1. TERRAIN — low-poly infinite mountains
     * ---------------------------------------------------------- */
    register({
        name: 'terrain',
        label: 'Mountains',
        icon: '⛰',
        create(ctx) {
            const { THREE, scene } = ctx;

            const uniforms = {
                uTime:       { value: 0 },
                uMeshOffset: { value: new THREE.Vector2(0, 0) },
                uColorLow:   { value: new THREE.Color(getCss('--shade-low')) },
                uColorMid:   { value: new THREE.Color(getCss('--shade-mid')) },
                uColorHigh:  { value: new THREE.Color(getCss('--shade-high')) },
                uColorTop:   { value: new THREE.Color(getCss('--shade-top')) },
                uColorRim:   { value: new THREE.Color(getCss('--shade-rim')) },
                uFogColor:   { value: new THREE.Color(getCss('--shade-fog')) },
                uFogNear:    { value: 60 },
                uFogFar:     { value: 220 },
                uLightDir:   { value: new THREE.Vector3(0.6, 1, 0.4).normalize() },
                uGridOpacity:{ value: 0.06 }
            };

            const geo = new THREE.PlaneGeometry(180, 400, 100, 180);
            geo.rotateX(-Math.PI / 2);

            const mat = new THREE.ShaderMaterial({
                uniforms,
                vertexShader: /* glsl */`
                    uniform float uTime; uniform vec2 uMeshOffset;
                    varying float vHeight; varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth;
                    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
                    float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
                        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
                    float fbm(vec2 p){float v=0.0;float a=0.5;mat2 r=mat2(0.8,0.6,-0.6,0.8);
                        for(int i=0;i<4;i++){v+=a*noise(p);p=r*p*2.02;a*=0.5;}return v;}
                    void main(){
                        vec2 xz=position.xz+uMeshOffset;
                        float h=pow(fbm(xz*0.045),1.35)*12.0;
                        float e=1.5;
                        float hL=pow(fbm((xz+vec2(-e,0))*0.045),1.35)*12.0;
                        float hR=pow(fbm((xz+vec2(e,0))*0.045),1.35)*12.0;
                        float hD=pow(fbm((xz+vec2(0,-e))*0.045),1.35)*12.0;
                        float hU=pow(fbm((xz+vec2(0,e))*0.045),1.35)*12.0;
                        vec3 n=normalize(vec3(hL-hR,2.0*e,hD-hU));
                        vNormal=n; vHeight=h;
                        vec3 pos=position; pos.y+=h;
                        vec4 wp=modelMatrix*vec4(pos,1.0);
                        vWorldPos=wp.xyz;
                        vec4 mv=viewMatrix*wp;
                        vFogDepth=-mv.z;
                        gl_Position=projectionMatrix*mv;
                    }`,
                fragmentShader: /* glsl */`
                    uniform vec3 uColorLow,uColorMid,uColorHigh,uColorTop,uColorRim,uFogColor;
                    uniform float uFogNear,uFogFar,uGridOpacity;
                    uniform vec3 uLightDir;
                    varying float vHeight; varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth;
                    void main(){
                        vec3 N=normalize(vNormal); vec3 L=normalize(uLightDir);
                        float diff=max(dot(N,L),0.0);
                        float toon=floor(diff*5.0+0.5)/5.0;
                        toon=mix(0.25,1.0,toon);
                        float hn=clamp(vHeight/12.0,0.0,1.0);
                        vec3 base;
                        if(hn<0.4) base=mix(uColorLow,uColorMid,hn/0.4);
                        else if(hn<0.75) base=mix(uColorMid,uColorHigh,(hn-0.4)/0.35);
                        else base=mix(uColorHigh,uColorTop,(hn-0.75)/0.25);
                        vec3 col=base*toon;
                        vec3 V=normalize(cameraPosition-vWorldPos);
                        float rim=pow(1.0-max(dot(N,V),0.0),3.5);
                        col+=uColorRim*rim*0.35;
                        float gx=abs(fract(vWorldPos.x*0.25)-0.5)/fwidth(vWorldPos.x*0.25);
                        float gz=abs(fract(vWorldPos.z*0.25)-0.5)/fwidth(vWorldPos.z*0.25);
                        float g=1.0-min(min(gx,gz),1.0);
                        col=mix(col,uColorRim,g*uGridOpacity);
                        float fog=smoothstep(uFogNear,uFogFar,vFogDepth);
                        col=mix(col,uFogColor,fog);
                        gl_FragColor=vec4(col,1.0);
                    }`
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            scene.add(mesh);

            return {
                object: mesh,
                update(t, s, camera) {
                    uniforms.uTime.value = t;
                    const camZ = 30 - s.progress * 320;
                    const sway = Math.sin(s.smooth * 0.003) * 3.0;
                    camera.position.set(sway, 9 + Math.sin(t * 0.6) * 0.35, camZ);
                    camera.lookAt(sway * 0.3, 4.5, camZ - 40);

                    mesh.position.set(0, 0, camZ - 150);
                    mesh.updateMatrix();
                    uniforms.uMeshOffset.value.set(0, mesh.position.z);
                    uniforms.uGridOpacity.value = 0.06 + Math.sin(t * 0.4) * 0.02;
                },
                refreshTheme() {
                    uniforms.uColorLow.value.set(getCss('--shade-low'));
                    uniforms.uColorMid.value.set(getCss('--shade-mid'));
                    uniforms.uColorHigh.value.set(getCss('--shade-high'));
                    uniforms.uColorTop.value.set(getCss('--shade-top'));
                    uniforms.uColorRim.value.set(getCss('--shade-rim'));
                    uniforms.uFogColor.value.set(getCss('--shade-fog'));
                },
                dispose() {
                    geo.dispose(); mat.dispose(); scene.remove(mesh);
                }
            };
        }
    });

    /* ------------------------------------------------------------
     * 2. TUNNEL — infinite scrolling tube
     * ---------------------------------------------------------- */
    register({
        name: 'tunnel',
        label: 'Tunnel',
        icon: '◉',
        create(ctx) {
            const { THREE, scene } = ctx;

            const uniforms = {
                uTime:  { value: 0 },
                uColor: { value: new THREE.Color(getCss('--accent')) },
                uDark:  { value: new THREE.Color(getCss('--bg-deep')) }
            };

            const geo = new THREE.CylinderGeometry(22, 22, 600, 64, 300, true);
            geo.rotateX(Math.PI / 2);

            const mat = new THREE.ShaderMaterial({
                uniforms,
                side: THREE.BackSide,
                vertexShader: /* glsl */`
                    varying vec2 vUv;
                    void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
                fragmentShader: /* glsl */`
                    uniform float uTime; uniform vec3 uColor; uniform vec3 uDark;
                    varying vec2 vUv;
                    void main(){
                        float stripes = sin(vUv.x * 80.0 + uTime * 2.0) * 0.5 + 0.5;
                        stripes = smoothstep(0.85, 1.0, stripes);
                        float pulse = sin(vUv.y * 40.0 - uTime * 4.0) * 0.5 + 0.5;
                        vec3 col = mix(uDark, uColor, stripes * 0.9 + pulse * 0.1);
                        gl_FragColor = vec4(col, 1.0);
                    }`
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            scene.add(mesh);

            return {
                object: mesh,
                update(t, s, camera) {
                    uniforms.uTime.value = t;
                    const camZ = 30 - s.progress * 320;
                    const sway = Math.sin(s.smooth * 0.002) * 1.5;
                    camera.position.set(sway, 1 + Math.sin(t * 0.5) * 0.4, camZ);
                    camera.lookAt(sway * 0.5, 1, camZ - 40);

                    mesh.position.set(0, 1, camZ - 200);
                    mesh.updateMatrix();
                },
                refreshTheme() {
                    uniforms.uColor.value.set(getCss('--accent'));
                    uniforms.uDark.value.set(getCss('--bg-deep'));
                },
                dispose() { geo.dispose(); mat.dispose(); scene.remove(mesh); }
            };
        }
    });

    /* ------------------------------------------------------------
     * 3. OCEAN — infinite wavy water
     * ---------------------------------------------------------- */
    register({
        name: 'ocean',
        label: 'Ocean',
        icon: '〜',
        create(ctx) {
            const { THREE, scene } = ctx;

            const uniforms = {
                uTime:    { value: 0 },
                uOffset:  { value: new THREE.Vector2(0, 0) },
                uColorA:  { value: new THREE.Color(getCss('--shade-mid')) },
                uColorB:  { value: new THREE.Color(getCss('--shade-top')) },
                uRim:     { value: new THREE.Color(getCss('--shade-rim')) },
                uFog:     { value: new THREE.Color(getCss('--shade-fog')) }
            };

            const geo = new THREE.PlaneGeometry(600, 800, 200, 250);
            geo.rotateX(-Math.PI / 2);

            const mat = new THREE.ShaderMaterial({
                uniforms,
                vertexShader: /* glsl */`
                    uniform float uTime; uniform vec2 uOffset;
                    varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth;
                    void main(){
                        vec3 p = position;
                        vec2 wxz = p.xz + uOffset;
                        float wave = sin(wxz.x * 0.15 + uTime * 1.2) * 0.8
                                   + sin(wxz.y * 0.2 + uTime * 0.9) * 0.6
                                   + sin((wxz.x + wxz.y) * 0.1 + uTime * 0.7) * 0.5;
                        p.y += wave;
                        float e = 0.5;
                        float hL = sin((wxz.x-e) * 0.15 + uTime * 1.2) * 0.8
                                 + sin(wxz.y * 0.2 + uTime * 0.9) * 0.6;
                        float hR = sin((wxz.x+e) * 0.15 + uTime * 1.2) * 0.8
                                 + sin(wxz.y * 0.2 + uTime * 0.9) * 0.6;
                        vNormal = normalize(vec3(hL - hR, 2.0 * e, 0.5));
                        vec4 wp = modelMatrix * vec4(p, 1.0);
                        vWorldPos = wp.xyz;
                        vec4 mv = viewMatrix * wp;
                        vFogDepth = -mv.z;
                        gl_Position = projectionMatrix * mv;
                    }`,
                fragmentShader: /* glsl */`
                    uniform vec3 uColorA, uColorB, uRim, uFog;
                    varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth;
                    void main(){
                        vec3 N = normalize(vNormal);
                        vec3 V = normalize(cameraPosition - vWorldPos);
                        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
                        vec3 col = mix(uColorA, uColorB, fres);
                        float highlight = pow(max(dot(N, normalize(vec3(0.5, 1.0, 0.3))), 0.0), 20.0);
                        col += uRim * highlight * 0.8;
                        col = mix(col, uRim, fres * 0.3);
                        float fog = smoothstep(80.0, 380.0, vFogDepth);
                        col = mix(col, uFog, fog);
                        gl_FragColor = vec4(col, 1.0);
                    }`
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            scene.add(mesh);

            return {
                object: mesh,
                update(t, s, camera) {
                    uniforms.uTime.value = t;
                    const camZ = 30 - s.progress * 320;
                    const sway = Math.sin(s.smooth * 0.002) * 4.0;
                    camera.position.set(sway, 14, camZ);
                    camera.lookAt(sway * 0.3, 4, camZ - 60);

                    mesh.position.set(0, -2, camZ - 200);
                    mesh.updateMatrix();
                    uniforms.uOffset.value.set(0, mesh.position.z);
                },
                refreshTheme() {
                    uniforms.uColorA.value.set(getCss('--shade-mid'));
                    uniforms.uColorB.value.set(getCss('--shade-top'));
                    uniforms.uRim.value.set(getCss('--shade-rim'));
                    uniforms.uFog.value.set(getCss('--shade-fog'));
                },
                dispose() { geo.dispose(); mat.dispose(); scene.remove(mesh); }
            };
        }
    });

    /* ------------------------------------------------------------
     * 4. GRID — Tron-style retro game grid
     * ---------------------------------------------------------- */
    register({
        name: 'grid',
        label: 'Retro Grid',
        icon: '▦',
        create(ctx) {
            const { THREE, scene } = ctx;

            const uniforms = {
                uTime:    { value: 0 },
                uOffset:  { value: new THREE.Vector2(0, 0) },
                uLine:    { value: new THREE.Color(getCss('--accent')) },
                uBg:      { value: new THREE.Color(getCss('--bg-deep')) },
                uHorizon: { value: new THREE.Color(getCss('--shade-top')) }
            };

            const geo = new THREE.PlaneGeometry(400, 800, 1, 1);
            geo.rotateX(-Math.PI / 2);

            const mat = new THREE.ShaderMaterial({
                uniforms,
                vertexShader: /* glsl */`
                    varying vec3 vWorldPos; varying vec2 vUv;
                    uniform vec2 uOffset;
                    void main(){
                        vUv = uv;
                        vec3 p = position;
                        p.xz += uOffset;
                        vec4 wp = modelMatrix * vec4(p, 1.0);
                        vWorldPos = wp.xyz;
                        gl_Position = projectionMatrix * viewMatrix * wp;
                    }`,
                fragmentShader: /* glsl */`
                    uniform float uTime; uniform vec3 uLine; uniform vec3 uBg; uniform vec3 uHorizon;
                    varying vec3 vWorldPos;
                    void main(){
                        vec2 coord = vWorldPos.xz;
                        // Sweeping grid
                        float gx = abs(fract(coord.x * 0.5 + uTime * 0.5) - 0.5) / fwidth(coord.x * 0.5);
                        float gz = abs(fract(coord.y * 0.5 + uTime * 1.5) - 0.5) / fwidth(coord.y * 0.5);
                        float grid = 1.0 - min(min(gx, gz), 1.0);
                        // Distance fade to horizon
                        float dist = length(vWorldPos.xz - vec2(cameraPosition.x, cameraPosition.z));
                        float fade = smoothstep(50.0, 250.0, dist);
                        vec3 col = mix(uBg, uLine, grid * (1.0 - fade));
                        // Horizon glow
                        col += uHorizon * fade * 0.15;
                        gl_FragColor = vec4(col, 1.0);
                    }`
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            scene.add(mesh);

            return {
                object: mesh,
                update(t, s, camera) {
                    uniforms.uTime.value = t;
                    const camZ = 30 - s.progress * 320;
                    const sway = Math.sin(s.smooth * 0.003) * 2.0;
                    camera.position.set(sway, 4, camZ);
                    camera.lookAt(sway * 0.2, 2, camZ - 50);

                    mesh.position.set(0, 0, camZ - 200);
                    mesh.updateMatrix();
                    uniforms.uOffset.value.set(0, mesh.position.z);
                },
                refreshTheme() {
                    uniforms.uLine.value.set(getCss('--accent'));
                    uniforms.uBg.value.set(getCss('--bg-deep'));
                    uniforms.uHorizon.value.set(getCss('--shade-top'));
                },
                dispose() { geo.dispose(); mat.dispose(); scene.remove(mesh); }
            };
        }
    });

    /* ------------------------------------------------------------
     * 5. NEBULA — volumetric particle cloud
     * ---------------------------------------------------------- */
    register({
        name: 'nebula',
        label: 'Nebula',
        icon: '✦',
        create(ctx) {
            const { THREE, scene } = ctx;
            const isMobile = window.matchMedia('(max-width: 768px)').matches;

            const COUNT = isMobile ? 1200 : 3000;
            const positions = new Float32Array(COUNT * 3);
            const seeds = new Float32Array(COUNT);

            for (let i = 0; i < COUNT; i++) {
                const r = Math.pow(Math.random(), 0.6) * 80;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
                positions[i * 3 + 1] = r * Math.cos(phi) * 0.6;
                positions[i * 3 + 2] = -Math.random() * 500;
                seeds[i] = Math.random();
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

            const uniforms = {
                uTime:  { value: 0 },
                uColor: { value: new THREE.Color(getCss('--accent')) },
                uColor2:{ value: new THREE.Color(getCss('--shade-top')) },
                uSize:  { value: isMobile ? 2.0 : 3.0 }
            };

            const mat = new THREE.ShaderMaterial({
                uniforms,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                vertexShader: /* glsl */`
                    attribute float aSeed;
                    uniform float uTime; uniform float uSize;
                    varying float vAlpha; varying float vSeed;
                    void main(){
                        vSeed = aSeed;
                        vec3 pos = position;
                        pos.x += sin(uTime * 0.3 + aSeed * 10.0) * 2.0;
                        pos.y += cos(uTime * 0.4 + aSeed * 8.0) * 2.0;
                        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
                        gl_PointSize = uSize * aSeed * (300.0 / -mv.z);
                        gl_Position = projectionMatrix * mv;
                        vAlpha = smoothstep(400.0, 20.0, -mv.z);
                    }`,
                fragmentShader: /* glsl */`
                    uniform vec3 uColor; uniform vec3 uColor2;
                    varying float vAlpha; varying float vSeed;
                    void main(){
                        vec2 c = gl_PointCoord - 0.5;
                        float d = length(c);
                        if (d > 0.5) discard;
                        float glow = smoothstep(0.5, 0.0, d);
                        vec3 col = mix(uColor, uColor2, vSeed);
                        gl_FragColor = vec4(col, glow * vAlpha);
                    }`
            });

            const points = new THREE.Points(geo, mat);
            points.matrixAutoUpdate = false;
            points.updateMatrix();
            scene.add(points);

            return {
                object: points,
                update(t, s, camera) {
                    uniforms.uTime.value = t;
                    const camZ = 30 - s.progress * 400;
                    const sway = Math.sin(s.smooth * 0.002) * 5.0;
                    camera.position.set(sway, 2 + Math.sin(t * 0.3) * 2, camZ);
                    camera.lookAt(sway * 0.3, 2, camZ - 40);

                    points.position.set(0, 0, camZ - 100);
                    points.updateMatrix();
                },
                refreshTheme() {
                    uniforms.uColor.value.set(getCss('--accent'));
                    uniforms.uColor2.value.set(getCss('--shade-top'));
                },
                dispose() { geo.dispose(); mat.dispose(); scene.remove(points); }
            };
        }
    });

    /* ------------------------------------------------------------
     * 6. LATTICE — rotating wireframe icosphere
     * ---------------------------------------------------------- */
    register({
        name: 'lattice',
        label: 'Lattice',
        icon: '⬡',
        create(ctx) {
            const { THREE, scene } = ctx;

            const group = new THREE.Group();
            group.matrixAutoUpdate = false;
            group.updateMatrix();
            scene.add(group);

            const uniforms = {
                uTime:  { value: 0 },
                uColor: { value: new THREE.Color(getCss('--accent')) },
                uAccent:{ value: new THREE.Color(getCss('--shade-top')) }
            };

            const mat = new THREE.ShaderMaterial({
                uniforms,
                wireframe: true,
                transparent: true,
                vertexShader: /* glsl */`
                    uniform float uTime;
                    varying vec3 vNormal;
                    void main(){
                        vNormal = normalize(normalMatrix * normal);
                        vec3 p = position;
                        p += normal * sin(uTime * 2.0 + position.x * 0.5) * 0.3;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                    }`,
                fragmentShader: /* glsl */`
                    uniform vec3 uColor; uniform vec3 uAccent;
                    varying vec3 vNormal;
                    void main(){
                        float fres = 1.0 - abs(vNormal.z);
                        vec3 col = mix(uColor, uAccent, fres);
                        gl_FragColor = vec4(col, 0.7);
                    }`
            });

            const sphereGeo = new THREE.IcosahedronGeometry(10, 3);
            const sphere = new THREE.Mesh(sphereGeo, mat);
            sphere.matrixAutoUpdate = false;
            sphere.updateMatrix();
            group.add(sphere);

            const outerGeo = new THREE.IcosahedronGeometry(14, 1);
            const outer = new THREE.Mesh(outerGeo, mat.clone());
            outer.material.uniforms = uniforms;
            outer.matrixAutoUpdate = false;
            outer.updateMatrix();
            group.add(outer);

            return {
                object: group,
                update(t, s, camera) {
                    uniforms.uTime.value = t;
                    const camZ = 30 - s.progress * 200;
                    const sway = Math.sin(s.smooth * 0.002) * 3.0;
                    camera.position.set(sway, 3, camZ);
                    camera.lookAt(0, 3, camZ - 50);

                    group.rotation.y = t * 0.25;
                    group.rotation.x = Math.sin(t * 0.3) * 0.15;
                    group.position.set(0, 5, camZ - 90);
                    group.updateMatrix();
                    outer.rotation.y = -t * 0.15;
                    outer.updateMatrix();
                },
                refreshTheme() {
                    uniforms.uColor.value.set(getCss('--accent'));
                    uniforms.uAccent.value.set(getCss('--shade-top'));
                },
                dispose() {
                    sphereGeo.dispose(); outerGeo.dispose();
                    mat.dispose(); outer.material.dispose();
                    scene.remove(group);
                }
            };
        }
    });

    /* ============================================================
     * SCENE MANAGER
     * ========================================================== */
    class SceneManager {
        constructor(ctx) {
            this.ctx = ctx;
            this.current = null;
            this.currentName = null;
            this.autoSwitch = true;
        }

        list() { return Object.keys(registry); }

        mount(name) {
            if (this.currentName === name) return;
            if (this.current) {
                this.current.dispose();
                this.current = null;
            }
            const def = registry[name];
            if (!def) { console.warn('[Scenes] Unknown scene:', name); return; }

            this.current = def.create(this.ctx);
            this.currentName = name;

            // Notify UI + persist
            window.dispatchEvent(new CustomEvent('scene:change', { detail: { name, def } }));
            try { localStorage.setItem('scene', name); } catch (_) {}

            // Update URL hash silently
            if (this.autoSwitch) {
                history.replaceState(null, '', `#scene=${name}`);
            }
        }

        update(t, s) {
            if (this.current && this.current.update) {
                this.current.update(t, s, this.ctx.camera);
            }
        }

        refreshTheme() {
            if (this.current && this.current.refreshTheme) {
                this.current.refreshTheme();
            }
        }
    }

    /* ============================================================
     * SELECTOR UI
     * ========================================================== */
    function buildUI(mgr) {
        const ui = document.createElement('div');
        ui.className = 'sd-scenes';
        ui.setAttribute('aria-label', 'Scene selector');

        const pill = document.createElement('div');
        pill.className = 'sd-scenes-pill';
        ui.appendChild(pill);

        mgr.list().forEach(name => {
            const def = registry[name];
            const btn = document.createElement('button');
            btn.className = 'sd-scene-btn';
            btn.dataset.scene = name;
            btn.type = 'button';
            btn.innerHTML = `<span class="sd-scene-icon">${def.icon}</span><span class="sd-scene-label">${def.label}</span>`;
            btn.addEventListener('click', () => mgr.mount(name));
            pill.appendChild(btn);
        });

        document.body.appendChild(ui);

        // Sync active state
        const sync = (name) => {
            ui.querySelectorAll('.sd-scene-btn').forEach(b => {
                b.classList.toggle('is-active', b.dataset.scene === name);
            });
        };
        window.addEventListener('scene:change', e => sync(e.detail.name));
        sync(mgr.currentName);

        return ui;
    }

    /* ============================================================
     * SCENE-SPECIFIC CSS
     * ========================================================== */
    const style = document.createElement('style');
    style.textContent = `
        .sd-scenes {
            position: fixed;
            bottom: 22px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 500;
            pointer-events: none;
            opacity: 0.55;
            transition: opacity .4s ease, transform .4s ease;
        }
        .sd-scenes:hover { opacity: 1; }
        .sd-scenes-pill {
            display: flex;
            gap: 4px;
            padding: 6px;
            background: var(--bg-card, rgba(22,18,22,.72));
            backdrop-filter: blur(20px) saturate(1.3);
            -webkit-backdrop-filter: blur(20px) saturate(1.3);
            border: 1px solid var(--border, rgba(255,255,255,.08));
            border-radius: 999px;
            pointer-events: auto;
            box-shadow: 0 8px 40px rgba(0,0,0,.35);
        }
        .sd-scene-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            border: none;
            background: transparent;
            color: var(--text-muted, #9a8f9a);
            font-family: var(--font-body, sans-serif);
            font-size: 0.7rem;
            font-weight: 500;
            letter-spacing: 0.05em;
            border-radius: 999px;
            cursor: pointer;
            transition: background .3s ease, color .3s ease, transform .3s ease;
            text-transform: uppercase;
        }
        .sd-scene-btn:hover {
            background: var(--accent-soft, rgba(255,61,61,.1));
            color: var(--text, #fff);
            transform: translateY(-1px);
        }
        .sd-scene-btn.is-active {
            background: var(--accent, #ff3d3d);
            color: #fff;
            box-shadow: 0 0 20px var(--accent-glow, rgba(255,61,61,.4));
        }
        .sd-scene-icon {
            font-size: 0.95rem;
            line-height: 1;
        }
        .sd-scene-label {
            display: none;
        }
        .sd-scene-btn.is-active .sd-scene-label,
        .sd-scene-btn:hover .sd-scene-label {
            display: inline;
        }

        @media (max-width: 640px) {
            .sd-scenes {
                bottom: 12px;
                max-width: calc(100vw - 24px);
                overflow-x: auto;
                padding: 4px;
                scrollbar-width: none;
            }
            .sd-scenes::-webkit-scrollbar { display: none; }
            .sd-scene-btn { padding: 7px 10px; font-size: 0.65rem; }
            .sd-scene-label { display: none !important; }
        }

        @media (prefers-reduced-motion: reduce) {
            .sd-scenes { display: none !important; }
        }
    `;
    document.head.appendChild(style);

    /* ============================================================
     * PUBLIC API
     * ========================================================== */
    let _mgr = null;

    window.SDScenes = {
        init(ctx) {
            _mgr = new SceneManager(ctx);

            // Initial scene priority: URL hash > saved > default
            const hashMatch = location.hash.match(/scene=([\w-]+)/);
            const initial = (hashMatch && registry[hashMatch[1]]) ? hashMatch[1]
                          : (localStorage.getItem('scene') && registry[localStorage.getItem('scene')])
                          ? localStorage.getItem('scene')
                          : 'terrain';

            _mgr.mount(initial);
            buildUI(_mgr);

            // Keyboard shortcuts: 1–6
            window.addEventListener('keydown', (e) => {
                if (e.target.matches('input, textarea, [contenteditable]')) return;
                const n = parseInt(e.key, 10);
                if (n >= 1 && n <= 9) {
                    const names = _mgr.list();
                    if (names[n - 1]) _mgr.mount(names[n - 1]);
                }
            });

            // Theme refresh hook
            window.addEventListener('theme:change', () => _mgr.refreshTheme());
            // Also observe attribute changes directly
            new MutationObserver(() => _mgr.refreshTheme())
                .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

            // Frame hook — single RAF
            if (window.SDScroll) {
                window.SDScroll.onFrame((s, t) => _mgr.update(t, s));
            }

            // Anchor: hover any project → show its scene (optional)
            document.querySelectorAll('[data-scene]').forEach(el => {
                el.addEventListener('mouseenter', () => {
                    const target = el.dataset.scene;
                    if (registry[target]) _mgr.mount(target);
                });
            });

            return _mgr;
        },
        mount: (name) => _mgr && _mgr.mount(name),
        list: () => _mgr ? _mgr.list() : []
    };
})();