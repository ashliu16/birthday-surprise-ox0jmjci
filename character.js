/* Whole-character poses are model-generated artwork. This controller only
   places those images and times the scene's interactive movements. */
(() => {
  'use strict';

  const SCALE = .60;
  const POSES = {
    "walk-a": {
        "src": "assets/character-walk-a-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 250,
        "anchorY": 704,
        "bounds": [
            101,
            130,
            392,
            705
        ]
    },
    "walk-b": {
        "src": "assets/character-walk-b-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 250,
        "anchorY": 678,
        "bounds": [
            130,
            109,
            382,
            679
        ]
    },
    "reach-left": {
        "src": "assets/character-reach-left-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 280,
        "anchorY": 706,
        "handX": 128,
        "handY": 71,
        "bounds": [
            113,
            71,
            367,
            707
        ]
    },
    "reach-low": {
        "src": "assets/character-reach-low-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 285,
        "anchorY": 726,
        "handX": 140,
        "handY": 110,
        "bounds": [
            126,
            110,
            395,
            727
        ]
    },
    "reach-right": {
        "src": "assets/character-reach-right-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 270,
        "anchorY": 727,
        "handX": 369,
        "handY": 69,
        "bounds": [
            152,
            69,
            386,
            728
        ]
    },
    "tiptoe-left": {
        "src": "assets/character-tiptoe-left-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 265,
        "anchorY": 693,
        "handX": 130,
        "handY": 20,
        "bounds": [
            116,
            20,
            400,
            694
        ]
    },
    "tiptoe-right": {
        "src": "assets/character-tiptoe-right-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 270,
        "anchorY": 694,
        "handX": 396,
        "handY": 21,
        "bounds": [
            121,
            21,
            411,
            695
        ]
    },
    "peek": {
        "src": "assets/character-peek-v13.webp",
        "width": 944,
        "height": 1536,
        "anchorX": 830,
        "anchorY": 1450,
        "scale": 0.265,
        "gripX": 944,
        "bounds": [
            636,
            157,
            944,
            1451
        ]
    },
    "idle-left": {
        "src": "assets/character-idle-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 300,
        "anchorY": 711,
        "scale": 0.53,
        "flipX": true,
        "bounds": [
            186,
            49,
            425,
            712
        ]
    },
    "idle-right": {
        "src": "assets/character-idle-v13.webp",
        "width": 512,
        "height": 768,
        "anchorX": 300,
        "anchorY": 711,
        "scale": 0.53,
        "flipX": false,
        "bounds": [
            186,
            49,
            425,
            712
        ]
    },
    "finished": {
        "src": "assets/character-finished-cool-v12.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 517,
        "anchorY": 1498,
        "scale": 0.23828125,
        "bounds": [
            256,
            10,
            851,
            1498
        ]
    }
};
  const TARGETS = {
    birthday: 'tiptoe-left', star: 'reach-left', rich: 'reach-left', pause: 'reach-low',
    report: 'reach-right', secret: 'reach-right', quiet: 'reach-right', surprise: 'tiptoe-right',
  };
  // Model-drawn whole figures. Runtime only changes their visibility.
  const ENDING_SOURCES = [
    'assets/character-ending-idle-v18-00.webp', 'assets/character-ending-idle-v18-01.webp',
    'assets/character-ending-idle-v18-02.webp', 'assets/character-ending-idle-v18-03.webp',
    'assets/character-ending-idle-v18-04.webp', 'assets/character-ending-idle-v18-05.webp',
    'assets/character-ending-idle-v18-06.webp', 'assets/character-ending-idle-v18-07.webp',
    'assets/character-ending-idle-v18-08.webp', 'assets/character-ending-idle-v18-09.webp',
    'assets/character-ending-idle-v18-10.webp', 'assets/character-ending-idle-v18-11.webp',
    'assets/character-ending-idle-v18-12.webp', 'assets/character-ending-idle-v18-13.webp',
  ];
  const ENDING_NAMES = ENDING_SOURCES.slice(1, 13).map((src, index) => {
    const name = `ending-${index + 1}`;
    POSES[name] = { src, width: 646, height: 828, anchorX: 297, anchorY: 594,
      scale: 1, bounds: [215, 234, 390, 594] };
    return name;
  });
  // A settled wind drawing is also the static/reduced-motion ending.
  // Baseline 00/13 remain archived with the complete source sequence.
  POSES.finished = { ...POSES['ending-11'] };
  const isEndingPose = name => name === 'finished' || name.startsWith('ending-');
  const EASE = 'cubic-bezier(.23,1,.32,1)';
  // The stride keeps a steady rhythm, so its travel must keep a steady speed.
  const WALK_EASE = 'linear';

  function create(root, initialLayout) {
    if (!root) return null;
    const actor = root.querySelector('.actor');
    const frames = root.querySelector('.actor-frames');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const images = new Map(), ready = new Map();
    let revision = 0, movement = null, toeLift = null, strideTimer = 0, endingTimer = 0, endingGeneration = 0;
    let position = { x: 390, y: 610 }, pose = 'peek', restPose = 'idle-left';
    let metrics = null, factor = 1;

    function sizeImage(img, name) {
      const data = POSES[name];
      const scale = (data.scale || SCALE) * factor;
      img.style.width = `${data.width * scale}px`;
      img.style.height = `${data.height * scale}px`;
      img.style.left = `${-data.anchorX * scale}px`;
      img.style.top = `${-data.anchorY * scale}px`;
      img.style.transformOrigin = `${data.anchorX * scale}px ${data.anchorY * scale}px`;
    }

    function sizeAll(nextFactor) {
      factor = nextFactor;
      for (const [name, img] of images) sizeImage(img, name);
      root.dataset.scale = factor.toFixed(3);
    }

    function fitX(name, x) {
      const data = POSES[name], scale = (data.scale || SCALE) * factor;
      let left = data.bounds[0] - data.anchorX, right = data.bounds[2] - data.anchorX;
      if (data.flipX) [left, right] = [-right, -left];
      const minimum = (metrics.landscape ? metrics.figureLeft : metrics.safeLeft) + 8 - left * scale;
      const maximum = metrics.figureRight - 8 - right * scale;
      return Math.max(minimum, Math.min(maximum, x));
    }

    function layout(next) {
      if (metrics && ['width', 'height', 'actorFactor', 'groundY', 'centerX', 'edgeX'].every(key => metrics[key] === next[key])) return;
      cancel();
      metrics = next;
      sizeAll(next.actorFactor);
      root.style.setProperty('--actor-edge', `${next.edgeX}px`);
      root.dataset.layout = next.landscape ? 'landscape' : 'portrait';
      if (pose === 'peek') {
        const data = POSES.peek, scale = (data.scale || SCALE) * factor;
        show('peek', 'peek');
        place(next.edgeX - (data.gripX - data.anchorX) * scale, next.groundY);
      } else if (isEndingPose(pose)) {
        place(fitX('finished', next.centerX), next.groundY);
        void startEndingMotion(revision);
      } else {
        const name = position.x < next.centerX ? 'idle-right' : 'idle-left';
        void load(name);
        show(name, 'waiting'); restPose = name;
        place(fitX(name, next.landscape ? next.centerX : position.x), next.groundY);
      }
    }

    function image(name) {
      if (images.has(name)) return images.get(name);
      const data = POSES[name];
      const img = root.querySelector(`[data-pose="${name}"]`) || new Image();
      img.className = 'actor-pose'; img.dataset.pose = name;
      img.alt = ''; img.draggable = false; img.decoding = 'async';
      img.width = data.width; img.height = data.height;
      sizeImage(img, name);
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
      root.dataset.pose = isEndingPose(name) ? 'finished' : name;
      root.dataset.activity = activity;
    }

    function place(x, y) {
      position = { x, y };
      actor.style.transform = `translate3d(${x}px,${y}px,0)`;
      root.dataset.x = x.toFixed(1); root.dataset.y = y.toFixed(1);
    }

    function currentPosition() {
      if (!movement) return position;
      const transform = getComputedStyle(actor).transform;
      const values = transform.match(/^matrix(3d)?\(([^)]+)\)$/);
      if (!values) return position;
      const parts = values[2].split(',').map(Number);
      return values[1] ? { x: parts[12], y: parts[13] } : { x: parts[4], y: parts[5] };
    }

    function cancel() {
      const current = currentPosition();
      revision++;
      clearInterval(strideTimer); strideTimer = 0;
      stopEndingMotion();
      movement?.cancel(); movement = null;
      toeLift?.cancel(); toeLift = null;
      root.classList.remove('is-walking', 'is-facing-right');
      place(current.x, current.y);
      if (pose.startsWith('walk')) show(restPose, 'waiting');
      else if (pose === 'peek') root.dataset.activity = 'peek';
      else if (isEndingPose(pose)) show('finished', 'complete');
      return revision;
    }

    function stopEndingMotion() {
      endingGeneration++;
      clearInterval(endingTimer); endingTimer = 0;
      root.classList.remove('is-ending-breeze');
      delete root.dataset.endingFrame;
    }

    async function startEndingMotion(token) {
      stopEndingMotion();
      const generation = endingGeneration;
      if (reduced.matches || document.hidden || !isEndingPose(pose)) return;
      const loaded = await Promise.all(ENDING_NAMES.map(load));
      if (generation !== endingGeneration || token !== revision || reduced.matches || document.hidden || !isEndingPose(pose) || !loaded.every(Boolean)) return;
      root.classList.add('is-ending-breeze');
      let frame = 0;
      root.dataset.endingFrame = '0';
      endingTimer = window.setInterval(() => {
        frame = (frame + 1) % ENDING_NAMES.length;
        show(ENDING_NAMES[frame], 'complete');
        root.dataset.endingFrame = String(frame);
      }, 467);
    }

    async function travel(x, y, token, duration, easing = EASE) {
      const start = currentPosition();
      if (reduced.matches || duration === 0) { place(x, y); return token === revision; }
      if (typeof actor.animate === 'function') {
        movement = actor.animate([
          { transform: `translate3d(${start.x}px,${start.y}px,0)` },
          { transform: `translate3d(${x}px,${y}px,0)` },
        ], { duration, easing, fill: 'forwards' });
      } else {
        // Older WebViews still get visible movement using CSS transitions.
        let resolveFinished, timeout;
        const finished = new Promise(resolve => { resolveFinished = resolve; });
        const clean = () => {
          clearTimeout(timeout);
          actor.removeEventListener('transitionend', onEnd);
          actor.style.transition = '';
        };
        const complete = () => { clean(); resolveFinished(true); };
        const onEnd = event => {
          if (event.target === actor && event.propertyName === 'transform') complete();
        };
        actor.style.transition = 'none';
        place(start.x, start.y);
        void actor.offsetWidth;
        movement = { finished, cancel() { clean(); resolveFinished(false); } };
        actor.addEventListener('transitionend', onEnd);
        actor.style.transition = `transform ${duration}ms ${easing}`;
        actor.style.transform = `translate3d(${x}px,${y}px,0)`;
        timeout = window.setTimeout(complete, duration + 100);
      }
      const animation = movement;
      const complete = await animation.finished.then(result => result !== false, () => false);
      if (!complete || token !== revision) return false;
      place(x, y);
      animation.cancel(); movement = null;
      return true;
    }

    async function reach(target, { instant = false } = {}) {
      const token = cancel();
      const high = target.id === 'birthday' || target.id === 'surprise';
      const name = metrics.landscape ? high ? 'tiptoe-left' : target.id === 'pause' ? 'reach-low' : 'reach-left'
        : TARGETS[target.id] || 'reach-left';
      const data = POSES[name];
      const base = data.scale || SCALE;
      const bounds = data.bounds;
      let nextFactor = metrics.actorFactor;
      if (metrics.landscape) {
        nextFactor = Math.min(nextFactor,
          (metrics.groundY - metrics.safeTop - 12) / ((data.anchorY - bounds[1]) * base),
          (metrics.figureRight - metrics.figureLeft - 16) / ((bounds[2] - bounds[0]) * base));
      } else {
        nextFactor = Math.min(nextFactor,
          (metrics.height - metrics.safeBottom - 48 - target.y) / ((bounds[3] - data.handY) * base));
        if (data.handX > bounds[0]) nextFactor = Math.min(nextFactor,
          (target.x - metrics.safeLeft - 6) / ((data.handX - bounds[0]) * base));
        if (bounds[2] > data.handX) nextFactor = Math.min(nextFactor,
          (metrics.figureRight - 6 - target.x) / ((bounds[2] - data.handX) * base));
      }
      sizeAll(Math.max(.2, nextFactor));
      const scale = base * factor;
      // Landscape keeps the full girl beside the tree and gestures toward it.
      const x = metrics.landscape
        ? fitX(name, metrics.centerX + ((target.x - metrics.paperLeft) / metrics.paperWidth - .5) * 36)
        : target.x - (data.handX - data.anchorX) * scale;
      const y = metrics.landscape ? metrics.groundY : target.y - (data.handY - data.anchorY) * scale;
      root.dataset.target = target.id;
      root.dataset.tiptoe = String(name.startsWith('tiptoe'));
      root.dataset.activity = 'preparing';
      const available = await load(name);
      if (token !== revision) return false;
      if (!available) return true; // Optional artwork cannot block reading a wish.
      const distance = Math.hypot(x - position.x, y - position.y);
      const immediate = instant || reduced.matches;
      let walkingVisible = false;
      if (!immediate && distance > 14) {
        const walking = await Promise.all([load('walk-a'), load('walk-b'), load('idle-left'), load('idle-right')]);
        if (token !== revision) return false;
        if (walking.every(Boolean)) {
          walkingVisible = true;
          restPose = x < metrics.centerX ? 'idle-right' : 'idle-left';
          root.classList.add('is-walking');
          root.classList.toggle('is-facing-right', x > position.x);
          show('walk-a', 'walking');
          let step = 0;
          strideTimer = window.setInterval(() => show(++step % 2 ? 'walk-b' : 'walk-a', 'walking'), 120);
        }
      }
      // Give a finger tap several readable steps before switching to the reach.
      const duration = immediate ? 0 : walkingVisible
        ? Math.min(800, Math.max(600, distance * 2.4))
        : Math.min(480, Math.max(220, distance * 1.5));
      if (!await travel(x, y, token, duration, walkingVisible ? WALK_EASE : EASE)) return false;
      clearInterval(strideTimer); strideTimer = 0;
      root.classList.remove('is-walking', 'is-facing-right');
      show(name, 'reaching');
      restPose = name;
      root.setAttribute('aria-label', name.startsWith('tiptoe')
        ? '女生走到纸笺下面，踮起脚尖伸手去摘高处的祝福'
        : '女生走到所选纸笺下面，抬头伸手去摘祝福');
      if (immediate || typeof frames.animate !== 'function') return token === revision;
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
      sizeAll(metrics.actorFactor);
      const name = metrics.landscape || position.x >= metrics.centerX ? 'idle-left' : 'idle-right';
      const x = fitX(name, metrics.landscape ? metrics.centerX : position.x);
      const y = metrics.groundY;
      if (!await load(name) || token !== revision) return;
      show(name, 'waiting'); restPose = name;
      root.setAttribute('aria-label', '女生收好祝福，又好奇地抬头望向剩下的纸笺');
      await travel(x, y, token, reduced.matches || instant ? 0 : 220);
    }

    async function finish({ instant = false } = {}) {
      const token = cancel();
      if (!await load('finished') || token !== revision) return;
      sizeAll(metrics.actorFactor);
      show('finished', 'complete'); restPose = 'finished';
      root.setAttribute('aria-label', '所有生辰笺都已收下，女生面向前方戴墨镜比耶，轻轻摆头，发梢与裙边随风向左微动');
      delete root.dataset.target; delete root.dataset.tiptoe;
      if (await travel(fitX('finished', metrics.centerX), metrics.groundY, token, reduced.matches || instant ? 0 : 300)) {
        void startEndingMotion(token);
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopEndingMotion();
      else if (isEndingPose(pose)) void startEndingMotion(revision);
    });
    const motionPreferenceChanged = () => {
      if (!isEndingPose(pose)) return;
      stopEndingMotion(); show('finished', 'complete');
      if (!reduced.matches) void startEndingMotion(revision);
    };
    if (reduced.addEventListener) reduced.addEventListener('change', motionPreferenceChanged);
    else reduced.addListener(motionPreferenceChanged);

    layout(initialLayout);
    void load('peek');
    const warm = () => Object.keys(POSES).forEach(name => void load(name));
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1200 });
    else window.setTimeout(warm, 400);

    return { reach, rest, finish, cancel, layout };
  }

  window.BirthdayCharacter = { create };
})();
