/*! ============================================================
 *  animation.js  —  Cinematic scroll & motion layer
 *  Author: Samarth Dadar Portfolio
 *  Stack:  Anime.js v3 · Custom smooth scroll · Single RAF
 *
 *  ── What this file does ─────────────────────────────────────
 *  • Owns THE ONLY requestAnimationFrame loop on the page
 *  • Exposes window.SDScroll (target/smooth/velocity/progress)
 *  • Drives all UI motion with Anime.js timelines
 *  • Provides split-text, magnets, cursor, parallax, counters
 *  • Injects its own scoped CSS (prefixed .sd-)
 *
 *  ── Integration with your Three.js scene ────────────────────
 *  Remove the RAF loop from your Three.js module and instead:
 *
 *      window.SDScroll.onFrame((s, t) => {
 *          // s = SDScroll state, t = elapsed seconds
 *          camera.position.z = 30 - s.progress * 320;
 *          uniforms.uTime.value = t;
 *          renderer.render(scene, camera);
 *      });
 *
 *  That's it — Three.js now renders inside our single RAF.
 * ============================================================ */

(function () {
    'use strict';

    /* ============================================================
     * 0. GUARDS
     * ========================================================== */
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    /* ============================================================
     * 1. INJECT SCOPED CSS
     * ========================================================== */
    const style = document.createElement('style');
    style.textContent = `
        /* ---- Progress bar ---- */
        .sd-progress {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 2px;
            z-index: 9999;
            pointer-events: none;
            background: transparent;
        }
        .sd-progress span {
            display: block;
            width: 0%;
            height: 100%;
            background: var(--accent, #ff3d3d);
            box-shadow: 0 0 14px var(--accent-glow, rgba(255,61,61,.5));
            transform-origin: left center;
            transition: opacity .4s ease;
        }

        /* ---- Split text ---- */
        .sd-split { display: inline-block; }
        .sd-split .sd-word { display: inline-block; white-space: nowrap; }
        .sd-split .sd-char {
            display: inline-block;
            will-change: transform, opacity, filter;
            transform-origin: 50% 100%;
            backface-visibility: hidden;
        }
        .sd-split .sd-space { display: inline-block; width: .28em; }

        /* ---- Custom cursor ---- */
        .sd-cursor-dot,
        .sd-cursor-ring {
            position: fixed;
            top: 0; left: 0;
            pointer-events: none;
            z-index: 10000;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            will-change: transform;
            mix-blend-mode: difference;
        }
        .sd-cursor-dot {
            width: 6px; height: 6px;
            background: #fff;
            transition: width .25s ease, height .25s ease, opacity .25s ease;
        }
        .sd-cursor-ring {
            width: 34px; height: 34px;
            border: 1px solid rgba(255,255,255,.55);
            transition: width .35s cubic-bezier(.23,1,.32,1),
                        height .35s cubic-bezier(.23,1,.32,1),
                        border-color .35s ease,
                        opacity .35s ease;
        }
        .sd-cursor-hover .sd-cursor-dot { width: 4px; height: 4px; }
        .sd-cursor-hover .sd-cursor-ring {
            width: 60px; height: 60px;
            border-color: var(--accent, #ff3d3d);
        }
        .sd-cursor-hidden .sd-cursor-dot,
        .sd-cursor-hidden .sd-cursor-ring { opacity: 0; }

        @media (hover: none), (pointer: coarse) {
            .sd-cursor-dot, .sd-cursor-ring { display: none !important; }
        }

        /* ---- Magnetic elements ---- */
        .sd-magnet { display: inline-block; will-change: transform; }

        /* ---- Parallax ---- */
        [data-parallax] { will-change: transform; }

        /* ---- Line-by-line link hover ---- */
        .sd-link-line {
            position: relative;
            display: inline-block;
        }

        /* ---- Hover tilt containers ---- */
        [data-tilt] {
            transform-style: preserve-3d;
            transition: transform .5s cubic-bezier(.23,1,.32,1);
            will-change: transform;
        }

        /* ---- Reveal base ---- */
        .sd-reveal { opacity: 0; }
        .sd-reveal-ready { opacity: 1; }

        @media (prefers-reduced-motion: reduce) {
            .sd-cursor-dot, .sd-cursor-ring, .sd-progress { display: none !important; }
        }
    `;
    document.head.appendChild(style);

    /* ============================================================
     * 2. SDScroll — SINGLE SOURCE OF TRUTH
     * ========================================================== */
    const SDScroll = {
        target: 0,
        smooth: 0,
        prevSmooth: 0,
        max: 1,
        progress: 0,
        velocity: 0,
        direction: 0,
        ease: 0.085,
        _frameCallbacks: [],
        _scrollCallbacks: [],

        /** Register a per-frame callback (used by Three.js). */
        onFrame(fn) {
            if (typeof fn === 'function') this._frameCallbacks.push(fn);
        },

        /** Register a scroll-progress callback. */
        onScroll(fn) {
            if (typeof fn === 'function') this._scrollCallbacks.push(fn);
        },

        /** Programmatic smooth scroll to a Y position. */
        to(y, _smooth = true) {
            const clamped = Math.max(0, Math.min(y, this.max));
            window.scrollTo({ top: clamped, behavior: 'smooth' });
        },

        /** Recompute bounds (call on resize). */
        measure() {
            this.max = Math.max(
                1,
                document.documentElement.scrollHeight - window.innerHeight
            );
        }
    };

    window.SDScroll = SDScroll;

    /* ---- Real scroll → target ---- */
    window.addEventListener('scroll', () => {
        SDScroll.target = window.scrollY || window.pageYOffset || 0;
    }, { passive: true });

    window.addEventListener('resize', () => SDScroll.measure(), { passive: true });

    /* ============================================================
     * 3. ANIME UTILITIES — split text
     * ========================================================== */
    function splitByChars(el) {
        if (!el || el.dataset.sdSplit === 'chars') return el;
        const text = el.textContent;
        el.textContent = '';
        el.classList.add('sd-split');
        el.dataset.sdSplit = 'chars';

        const frag = document.createDocumentFragment();
        const words = text.split(/(\s+)/);

        words.forEach(part => {
            if (/^\s+$/.test(part)) {
                const space = document.createElement('span');
                space.className = 'sd-space';
                space.innerHTML = '&nbsp;';
                frag.appendChild(space);
                return;
            }
            const wordEl = document.createElement('span');
            wordEl.className = 'sd-word';
            for (const ch of part) {
                const span = document.createElement('span');
                span.className = 'sd-char';
                span.textContent = ch;
                wordEl.appendChild(span);
            }
            frag.appendChild(wordEl);
        });

        el.appendChild(frag);
        return el;
    }

    function splitByWords(el) {
        if (!el || el.dataset.sdSplit === 'words') return el;
        const text = el.textContent.trim();
        el.textContent = '';
        el.classList.add('sd-split');
        el.dataset.sdSplit = 'words';

        text.split(/\s+/).forEach((word, i, arr) => {
            const wrap = document.createElement('span');
            wrap.className = 'sd-word';
            wrap.style.display = 'inline-block';
            const inner = document.createElement('span');
            inner.className = 'sd-char';
            inner.style.display = 'inline-block';
            inner.textContent = word;
            wrap.appendChild(inner);
            el.appendChild(wrap);
            if (i < arr.length - 1) {
                const space = document.createElement('span');
                space.className = 'sd-space';
                space.innerHTML = '&nbsp;';
                el.appendChild(space);
            }
        });
        return el;
    }

    /* ============================================================
     * 4. THE SINGLE RAF LOOP
     * ========================================================== */
    const clock = { start: performance.now(), last: performance.now() };
    let rafId = null;

    function tick(now) {
        const dt = Math.min(0.05, (now - clock.last) / 1000);
        clock.last = now;
        const t = (now - clock.start) / 1000;

        /* --- Lerp smooth scroll --- */
        SDScroll.prevSmooth = SDScroll.smooth;
        SDScroll.smooth += (SDScroll.target - SDScroll.smooth) * SDScroll.ease;

        /* --- Derived metrics --- */
        SDScroll.progress = SDScroll.max > 0
            ? Math.min(1, Math.max(0, SDScroll.smooth / SDScroll.max))
            : 0;

        const rawVel = SDScroll.smooth - SDScroll.prevSmooth;
        SDScroll.velocity = rawVel;
        SDScroll.direction = rawVel > 0.05 ? 1 : rawVel < -0.05 ? -1 : 0;

        /* --- Fan out to frame subscribers (Three.js etc.) --- */
        for (let i = 0; i < SDScroll._frameCallbacks.length; i++) {
            try { SDScroll._frameCallbacks[i](SDScroll, t, dt); } catch (_) {}
        }

        /* --- Scroll subscribers --- */
        for (let i = 0; i < SDScroll._scrollCallbacks.length; i++) {
            try { SDScroll._scrollCallbacks[i](SDScroll); } catch (_) {}
        }

        rafId = requestAnimationFrame(tick);
    }

    /* ============================================================
     * 5. HERO INTRO TIMELINE
     * ========================================================== */
    function buildHeroTimeline() {
        const hero = document.querySelector('.hero') || document.querySelector('#hero');
        if (!hero) return;

        const greeting = hero.querySelector('.hero-greeting');
        const heading = hero.querySelector('h1');
        const desc = hero.querySelector('.hero-description');
        const cta = hero.querySelector('.hero-cta');
        const scrollHint = hero.querySelector('.hero-scroll');

        if (heading) {
            // Split both lines of the h1 for letter-level animation
            heading.querySelectorAll('.word, span').forEach(node => {
                if (node.children.length === 0 && node.textContent.trim()) {
                    splitByChars(node);
                }
            });
            // Fallback if no inner spans
            if (!heading.querySelector('.sd-char')) splitByChars(heading);
        }

        const tl = anime.timeline({
            easing: 'cubicBezier(0.23, 1, 0.32, 1)',
            duration: 1000
        });

        if (greeting) {
            tl.add({
                targets: greeting,
                opacity: [0, 1],
                translateY: [24, 0],
                filter: ['blur(6px)', 'blur(0px)'],
                duration: 900
            });
        }

        if (heading) {
            tl.add({
                targets: heading.querySelectorAll('.sd-char'),
                opacity: [0, 1],
                translateY: [90, 0],
                rotateX: [-95, 0],
                filter: ['blur(10px)', 'blur(0px)'],
                duration: 1300,
                delay: anime.stagger(26, { start: 100 })
            }, '-=650');
        }

        if (desc) {
            tl.add({
                targets: desc,
                opacity: [0, 1],
                translateY: [30, 0],
                filter: ['blur(4px)', 'blur(0px)'],
                duration: 900
            }, '-=850');
        }

        if (cta) {
            tl.add({
                targets: cta.querySelectorAll('.btn'),
                opacity: [0, 1],
                translateY: [26, 0],
                scale: [0.94, 1],
                duration: 800,
                delay: anime.stagger(90)
            }, '-=650');
        }

        if (scrollHint) {
            tl.add({
                targets: scrollHint,
                opacity: [0, 1],
                translateY: [16, 0],
                duration: 800
            }, '-=500');
        }
    }

    /* ============================================================
     * 6. SECTION REVEAL SYSTEM
     * ========================================================== */
    function buildRevealSystem() {
        const els = document.querySelectorAll(
            '.reveal:not(.sd-reveal-ready), [data-reveal]:not(.sd-reveal-ready)'
        );
        if (!els.length) return;

        els.forEach(el => el.classList.add('sd-reveal'));

        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                io.unobserve(el);

                const isProject = el.classList.contains('project-item');
                const isCard = el.classList.contains('exp-item')
                            || el.classList.contains('skill-group')
                            || el.classList.contains('stat-card');

                const from = isProject
                    ? { opacity: [0, 1], translateY: [50, 0], filter: ['blur(8px)', 'blur(0px)'] }
                    : isCard
                        ? { opacity: [0, 1], translateY: [60, 0], scale: [0.97, 1], filter: ['blur(6px)', 'blur(0px)'] }
                        : { opacity: [0, 1], translateY: [40, 0], filter: ['blur(5px)', 'blur(0px)'] };

                anime({
                    targets: el,
                    ...from,
                    duration: 1050,
                    easing: 'cubicBezier(0.23, 1, 0.32, 1)',
                    complete: () => el.classList.add('sd-reveal-ready')
                });

                // Counters inside this element
                el.querySelectorAll('[data-count]').forEach(animateCounter);

                // Split-text headings inside
                el.querySelectorAll('[data-split]').forEach(node => {
                    if (node.dataset.split === 'words') splitByWords(node);
                    else splitByChars(node);
                    anime({
                        targets: node.querySelectorAll('.sd-char'),
                        opacity: [0, 1],
                        translateY: [30, 0],
                        rotateX: [-80, 0],
                        duration: 900,
                        delay: anime.stagger(14),
                        easing: 'cubicBezier(0.23, 1, 0.32, 1)'
                    });
                });
            });
        }, { threshold: 0.14, rootMargin: '0px 0px -60px 0px' });

        els.forEach(el => io.observe(el));
    }

    /* ============================================================
     * 7. NUMBER COUNTERS
     * ========================================================== */
    const counted = new WeakSet();

    function animateCounter(el) {
        if (counted.has(el)) return;
        counted.add(el);

        const end = parseFloat(el.dataset.count) || 0;
        const suffix = el.dataset.suffix || '';
        const obj = { v: 0 };

        anime({
            targets: obj,
            v: end,
            duration: 1800,
            easing: 'easeOutExpo',
            update: () => {
                el.textContent = Math.round(obj.v) + suffix;
            }
        });
    }

    /* ============================================================
     * 8. MAGNETIC BUTTONS
     * ========================================================== */
    function buildMagnets() {
        if (isTouch || prefersReduced) return;
        const nodes = document.querySelectorAll(
            '.btn, .theme-toggle, .nav-logo, .menu-btn, [data-magnet]'
        );

        nodes.forEach(node => {
            node.classList.add('sd-magnet');

            const strength = node.dataset.magnet ? parseFloat(node.dataset.magnet) : 0.35;

            let hoverAnim = null;

            node.addEventListener('mousemove', (e) => {
                const rect = node.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                if (hoverAnim) hoverAnim.pause();
                hoverAnim = anime({
                    targets: node,
                    translateX: x * strength,
                    translateY: y * strength,
                    duration: 400,
                    easing: 'cubicBezier(0.23, 1, 0.32, 1)'
                });
            });

            node.addEventListener('mouseleave', () => {
                if (hoverAnim) hoverAnim.pause();
                hoverAnim = anime({
                    targets: node,
                    translateX: 0,
                    translateY: 0,
                    duration: 700,
                    easing: 'cubicBezier(0.23, 1, 0.32, 1)'
                });
            });
        });
    }

    /* ============================================================
     * 9. CUSTOM CURSOR
     * ========================================================== */
    function buildCursor() {
        if (isTouch || prefersReduced) return;

        const dot = document.createElement('div');
        dot.className = 'sd-cursor-dot';
        const ring = document.createElement('div');
        ring.className = 'sd-cursor-ring';
        document.body.appendChild(dot);
        document.body.appendChild(ring);

        let mx = window.innerWidth / 2;
        let my = window.innerHeight / 2;
        let rx = mx;
        let ry = my;

        window.addEventListener('mousemove', (e) => {
            mx = e.clientX;
            my = e.clientY;
            document.body.classList.remove('sd-cursor-hidden');
        }, { passive: true });

        document.addEventListener('mouseleave', () => {
            document.body.classList.add('sd-cursor-hidden');
        });

        // Hover state for interactive elements
        const hoverTargets = 'a, button, .btn, .tag, [data-cursor-hover], .project-item, .stat-card, .exp-item, .skill-group';
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest(hoverTargets)) {
                document.body.classList.add('sd-cursor-hover');
            }
        });
        document.addEventListener('mouseout', (e) => {
            if (e.target.closest(hoverTargets)) {
                document.body.classList.remove('sd-cursor-hover');
            }
        });

        // Smooth-follow the ring inside the single RAF loop
        SDScroll.onFrame(() => {
            // Instant for dot, lerped for ring
            dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;

            const ringEase = 0.18;
            rx += (mx - rx) * ringEase;
            ry += (my - ry) * ringEase;
            ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
        });
    }

    /* ============================================================
     * 10. PARALLAX LAYERS
     * ========================================================== */
    function buildParallax() {
        if (prefersReduced) return;
        const nodes = document.querySelectorAll('[data-parallax]');
        if (!nodes.length) return;

        const speeds = new Map();
        nodes.forEach(n => {
            speeds.set(n, parseFloat(n.dataset.parallax) || 0.15);
        });

        SDScroll.onFrame((s) => {
            nodes.forEach(node => {
                const speed = speeds.get(node);
                const rect = node.getBoundingClientRect();
                const center = rect.top + rect.height / 2;
                const distFromViewportCenter = center - window.innerHeight / 2;
                const y = -distFromViewportCenter * speed;
                node.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
            });
        });
    }

    /* ============================================================
     * 11. SCROLL VELOCITY → SUBTLE SCALE (project cards)
     * ========================================================== */
    function buildVelocityEffects() {
        if (prefersReduced || isMobile) return;
        const cards = document.querySelectorAll('.project-item, .exp-item');
        if (!cards.length) return;

        let last = 0;
        SDScroll.onFrame((s) => {
            const v = Math.abs(s.velocity);
            const clamped = Math.min(v, 40) / 40; // 0..1
            const scale = 1 - clamped * 0.012;
            // Only apply on cards visible in the viewport
            cards.forEach(card => {
                const r = card.getBoundingClientRect();
                if (r.bottom < -100 || r.top > window.innerHeight + 100) return;
                card.style.transform = `scale(${scale.toFixed(4)})`;
            });
        });
    }

    /* ============================================================
     * 12. PROGRESS BAR
     * ========================================================== */
    function buildProgressBar() {
        const bar = document.createElement('div');
        bar.className = 'sd-progress';
        bar.innerHTML = '<span></span>';
        document.body.appendChild(bar);
        const fill = bar.querySelector('span');

        let lastWidth = -1;
        SDScroll.onFrame((s) => {
            const w = (s.progress * 100);
            // Only touch DOM when changed by 0.1%
            if (Math.abs(w - lastWidth) < 0.1) return;
            lastWidth = w;
            fill.style.width = w.toFixed(2) + '%';
        });
    }

    /* ============================================================
     * 13. MENU OPEN STAGGER (mobile)
     * ========================================================== */
    function buildMenuStagger() {
        const menuBtn = document.getElementById('menuBtn');
        const navLinks = document.getElementById('navLinks');
        if (!menuBtn || !navLinks) return;

        const links = navLinks.querySelectorAll('a');

        // Initial state — links hidden, ready to stagger
        anime.set(links, { opacity: 0, translateY: 20 });

        menuBtn.addEventListener('click', () => {
            const isOpen = navLinks.classList.contains('open');

            if (isOpen) {
                anime({
                    targets: links,
                    opacity: [0, 1],
                    translateY: [20, 0],
                    duration: 700,
                    delay: anime.stagger(70, { start: 180 }),
                    easing: 'cubicBezier(0.23, 1, 0.32, 1)'
                });
            } else {
                anime({
                    targets: links,
                    opacity: 0,
                    translateY: 20,
                    duration: 300,
                    easing: 'easeOutQuad'
                });
            }
        });
    }

    /* ============================================================
     * 14. THEME TOGGLE ANIMATION HOOK
     * ========================================================== */
    function buildThemeHook() {
        const toggle = document.getElementById('themeToggle');
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            anime({
                targets: toggle,
                rotate: [0, 360],
                scale: [1, 0.85, 1],
                duration: 700,
                easing: 'cubicBezier(0.23, 1, 0.32, 1)'
            });
        });
    }

    /* ============================================================
     * 15. NAV LINK HOVER — underline sweep via anime
     * ========================================================== */
    function buildNavLinkMotion() {
        if (prefersReduced) return;
        const links = document.querySelectorAll('.nav-links a');
        links.forEach(link => {
            // Disable CSS ::after hover effect
            link.style.setProperty('--_x', '0');

            link.addEventListener('mouseenter', () => {
                anime({
                    targets: link,
                    translateY: -2,
                    duration: 400,
                    easing: 'cubicBezier(0.23, 1, 0.32, 1)'
                });
            });
            link.addEventListener('mouseleave', () => {
                anime({
                    targets: link,
                    translateY: 0,
                    duration: 500,
                    easing: 'cubicBezier(0.23, 1, 0.32, 1)'
                });
            });
        });
    }

    /* ============================================================
     * 16. SMOOTH ANCHOR SCROLL
     * ========================================================== */
    function buildAnchorScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', (e) => {
                const id = a.getAttribute('href');
                if (!id || id === '#') return;
                const el = document.querySelector(id);
                if (!el) return;
                e.preventDefault();
                const y = el.getBoundingClientRect().top + window.scrollY - 40;
                SDScroll.to(y);
            });
        });
    }

    /* ============================================================
     * 17. SCROLL-VELOCITY FADE ON HERO BACKGROUND
     *      (works if you have a .hero-bg-text node)
     * ========================================================== */
    function buildHeroBgMotion() {
        const bg = document.querySelector('.hero-bg-text');
        if (!bg || prefersReduced) return;

        SDScroll.onFrame((s) => {
            if (s.smooth > window.innerHeight * 1.5) return;
            const drift = s.smooth * 0.15;
            const scale = 1 + Math.min(s.smooth / window.innerHeight, 1) * 0.08;
            bg.style.transform = `translate(-50%, calc(-50% + ${drift.toFixed(1)}px)) scale(${scale.toFixed(3)})`;
        });
    }

    /* ============================================================
     * 18. INIT
     * ========================================================== */
    function init() {
        SDScroll.measure();

        if (prefersReduced) {
            // Just show everything, skip motion
            document.querySelectorAll('.reveal, [data-anim="hero"]').forEach(el => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            // Still keep the loop alive for Three.js frame subscribers
            clock.last = performance.now();
            rafId = requestAnimationFrame(tick);
            return;
        }

        buildHeroTimeline();
        buildRevealSystem();
        buildMagnets();
        buildCursor();
        buildParallax();
        buildVelocityEffects();
        buildProgressBar();
        buildMenuStagger();
        buildThemeHook();
        buildNavLinkMotion();
        buildAnchorScroll();
        buildHeroBgMotion();

        // Kick off the one and only RAF loop
        clock.last = performance.now();
        rafId = requestAnimationFrame(tick);
    }

    /* ---- Boot ---- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    /* ---- Expose a few utilities ---- */
    window.SDAnim = {
        splitByChars,
        splitByWords,
        animateCounter
    };
})();