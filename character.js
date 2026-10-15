/* Whole-character poses are model-generated artwork. This controller only
   places those images and times the scene's interactive movements. */
(() => {
  'use strict';

  const SCALE = .60;
  const POSES = {
    "walk-a": {
        "src": "assets/character-walk-a.webp",
        "width": 512,
        "height": 768,
        "anchorX": 250,
        "anchorY": 703
    },
    "walk-b": {
        "src": "assets/character-walk-b.webp",
        "width": 512,
        "height": 768,
        "anchorX": 250,
        "anchorY": 677
    },
    "reach-left": {
        "src": "assets/character-reach-left.webp",
        "width": 512,
        "height": 768,
        "anchorX": 280,
        "anchorY": 705,
        "handX": 128,
        "handY": 71
    },
    "reach-low": {
        "src": "assets/character-reach-low.webp",
        "width": 512,
        "height": 768,
        "anchorX": 285,
        "anchorY": 726,
        "handX": 140,
        "handY": 110
    },
    "reach-right": {
        "src": "assets/character-reach-right.webp",
        "width": 512,
        "height": 768,
        "anchorX": 270,
        "anchorY": 726,
        "handX": 368,
        "handY": 69
    },
    "tiptoe-left": {
        "src": "assets/character-tiptoe-left.webp",
        "width": 512,
        "height": 768,
        "anchorX": 265,
        "anchorY": 692,
        "handX": 129,
        "handY": 21
    },
    "tiptoe-right": {
        "src": "assets/character-tiptoe-right.webp",
        "width": 512,
        "height": 768,
        "anchorX": 270,
        "anchorY": 693,
        "handX": 396,
        "handY": 21
    },
    "peek": {
        "src": "assets/character-peek.webp",
        "width": 944,
        "height": 1536,
        "anchorX": 830,
        "anchorY": 1450,
        "scale": 0.265,
        "gripX": 944
    },
    "idle-left": {
        "src": "assets/character-idle.webp",
        "width": 512,
        "height": 768,
        "anchorX": 300,
        "anchorY": 710,
        "scale": 0.53,
        "flipX": true
    },
    "idle-right": {
        "src": "assets/character-idle.webp",
        "width": 512,
        "height": 768,
        "anchorX": 300,
        "anchorY": 710,
        "scale": 0.53,
        "flipX": false
    },
    "finished": {
        "src": "assets/character-finished-cool.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 517,
        "anchorY": 1498,
        "scale": 0.23828125
    }
};
  const TARGETS = {
    birthday: 'tiptoe-left', star: 'reach-left', rich: 'reach-left', pause: 'reach-low',
    report: 'reach-right', secret: 'reach-right', quiet: 'reach-right', surprise: 'tiptoe-right',
  };
  const EASE = 'cubic-bezier(.23,1,.32,1)';

  function create(root) {
    if (!root) return null;
    const actor = root.querySelector('.actor');
    const frames = root.querySelector('.actor-frames');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const images = new Map(), ready = new Map();
    let revision = 0, movement = null, toeLift = null, strideTimer = 0;
    let position = { x: 390, y: 610 }, pose = 'peek', restPose = 'idle-left';

    function alignEdge() {
      const bounds = root.parentElement.getBoundingClientRect();
      const sceneScale = bounds.width / 390;
      const edge = window.innerWidth <= 600
        ? (window.innerWidth - bounds.left) / sceneScale : 390;
      root.style.setProperty('--actor-edge', `${edge}px`);
      if (root.dataset.activity === 'peek' || !root.dataset.activity) {
        const data = POSES.peek;
        place(edge - (data.gripX - data.anchorX) * (data.scale || SCALE), 610);
      }
    }

    function image(name) {
      if (images.has(name)) return images.get(name);
      const data = POSES[name];
      const img = root.querySelector(`[data-pose="${name}"]`) || new Image();
      const scale = data.scale || SCALE;
      img.className = 'actor-pose'; img.dataset.pose = name;
      img.alt = ''; img.draggable = false; img.decoding = 'async';
      img.width = data.width; img.height = data.height;
      img.style.width = `${data.width * scale}px`;
      img.style.height = `${data.height * scale}px`;
      img.style.left = `${-data.anchorX * scale}px`;
      img.style.top = `${-data.anchorY * scale}px`;
      img.style.transformOrigin = `${data.anchorX * scale}px ${data.anchorY * scale}px`;
      if (data.flipX) img.style.transform = 'scaleX(-1)';
      if (!img.parentElement) frames.append(img);
      images.set(name, img);
      return img;
    }

    function load(name) {
      if (ready.has(name)) return ready.get(name);
      const img = image(name);
      const promise = new Promise(resolve => {
        const done = () => resolve(img.naturalWidth > 0);
        if (img.complete && img.naturalWidth > 0) { done(); return; }
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        img.src = POSES[name].src;
      });
      ready.set(name, promise);
      return promise;
    }

    function show(name, activity = name) {
      const next = image(name);
      for (const img of images.values()) img.classList.toggle('is-current', img === next);
      pose = name;
      root.dataset.pose = name;
      root.dataset.activity = activity;
    }

    function place(x, y) {
      position = { x, y };
      actor.style.transform = `translate3d(${x}px,${y}px,0)`;
      root.dataset.x = x.toFixed(1); root.dataset.y = y.toFixed(1);
    }

    function currentPosition() {
      if (!movement) return position;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(actor).transform);
      return { x: matrix.m41, y: matrix.m42 };
    }

    function cancel() {
      const current = currentPosition();
      revision++;
      clearInterval(strideTimer); strideTimer = 0;
      movement?.cancel(); movement = null;
      toeLift?.cancel(); toeLift = null;
      root.classList.remove('is-walking', 'is-facing-right');
      place(current.x, current.y);
      if (pose.startsWith('walk')) show(restPose, 'waiting');
      else if (pose === 'peek') root.dataset.activity = 'peek';
      return revision;
    }

    async function travel(x, y, token, duration) {
      const start = currentPosition();
      if (reduced.matches || duration === 0 || typeof actor.animate !== 'function') { place(x, y); return token === revision; }
      movement = actor.animate([
        { transform: `translate3d(${start.x}px,${start.y}px,0)` },
        { transform: `translate3d(${x}px,${y}px,0)` },
      ], { duration, easing: EASE, fill: 'forwards' });
      const animation = movement;
      const complete = await animation.finished.then(() => true, () => false);
      if (!complete || token !== revision) return false;
      place(x, y);
      animation.cancel(); movement = null;
      return true;
    }

    async function reach(target, { instant = false } = {}) {
      const token = cancel();
      const name = TARGETS[target.id] || 'reach-left';
      const data = POSES[name];
      const scale = data.scale || SCALE;
      const x = target.x - (data.handX - data.anchorX) * scale;
      const y = target.y - (data.handY - data.anchorY) * scale;
      root.dataset.target = target.id;
      root.dataset.tiptoe = String(name.startsWith('tiptoe'));
      root.dataset.activity = 'preparing';
      const available = await load(name);
      if (token !== revision) return false;
      if (!available) return true; // Optional artwork cannot block reading a wish.
      const distance = Math.hypot(x - position.x, y - position.y);
      const immediate = instant || reduced.matches || typeof actor.animate !== 'function';
      if (!immediate && distance > 14) {
        const walking = await Promise.all([load('walk-a'), load('walk-b'), load('idle-left'), load('idle-right')]);
        if (token !== revision) return false;
        if (walking.every(Boolean)) {
          restPose = x < 195 ? 'idle-right' : 'idle-left';
          root.classList.add('is-walking');
          root.classList.toggle('is-facing-right', x > position.x);
          show('walk-a', 'walking');
          let step = 0;
          strideTimer = window.setInterval(() => show(++step % 2 ? 'walk-b' : 'walk-a', 'walking'), 120);
        }
      }
      const duration = immediate ? 0 : Math.min(480, Math.max(220, distance * 1.5));
      if (!await travel(x, y, token, duration)) return false;
      clearInterval(strideTimer); strideTimer = 0;
      root.classList.remove('is-walking', 'is-facing-right');
      show(name, 'reaching');
      restPose = name;
      root.setAttribute('aria-label', name.startsWith('tiptoe')
        ? '女生走到纸笺下面，踮起脚尖伸手去摘高处的祝福'
        : '女生走到所选纸笺下面，抬头伸手去摘祝福');
      if (immediate) return token === revision;
      const durationReach = name.startsWith('tiptoe') ? 300 : 180;
      toeLift = frames.animate(name.startsWith('tiptoe') ? [
        { transform: 'translateY(3px)' }, { transform: 'translateY(-4px)', offset: .55 }, { transform: 'translateY(0)' },
      ] : [{ opacity: .8 }, { opacity: 1 }], { duration: durationReach, easing: EASE });
      const complete = await toeLift.finished.then(() => true, () => false);
      if (token === revision) toeLift = null;
      return complete && token === revision;
    }

    async function rest({ instant = false } = {}) {
      const token = cancel();
      const x = Math.max(85, Math.min(305, position.x));
      const y = Math.max(590, Math.min(620, position.y));
      const name = x < 195 ? 'idle-right' : 'idle-left';
      if (!await load(name) || token !== revision) return;
      show(name, 'waiting'); restPose = name;
      root.setAttribute('aria-label', '女生收好祝福，又好奇地抬头望向剩下的纸笺');
      await travel(x, y, token, reduced.matches || instant ? 0 : 220);
    }

    async function finish({ instant = false } = {}) {
      const token = cancel();
      if (!await load('finished') || token !== revision) return;
      show('finished', 'complete'); restPose = 'finished';
      root.setAttribute('aria-label', '所有生辰笺都已收下，女生面向前方，戴上墨镜，左手斜向上比耶');
      delete root.dataset.target; delete root.dataset.tiptoe;
      await travel(199, 612, token, reduced.matches || instant ? 0 : 300);
    }

    alignEdge(); show('peek', 'peek');
    window.addEventListener('resize', alignEdge, { passive: true });
    new ResizeObserver(alignEdge).observe(root.closest('.scene'));
    void load('peek');
    const warm = () => Object.keys(POSES).forEach(name => void load(name));
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1200 });
    else window.setTimeout(warm, 400);

    return { reach, rest, finish, cancel };
  }

  window.BirthdayCharacter = { create };
})();
