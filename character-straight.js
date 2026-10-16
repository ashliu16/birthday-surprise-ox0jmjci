/* Walking/reaching use complete illustration poses. The finished pose keeps
   one fixed texture and only deforms its head, hair tips and skirt slightly. */
(() => {
  'use strict';

  const SCALE = .60;
  const POSES = {
    "idle-left": {
        "src": "assets/straight-hair/idle.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 593.155,
        "anchorY": 1428,
        "scale": 0.26301647,
        "bounds": [
            358,
            93,
            851,
            1429
        ],
        "flipX": true
    },
    "idle-right": {
        "src": "assets/straight-hair/idle.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 593.155,
        "anchorY": 1428,
        "scale": 0.26301647,
        "bounds": [
            358,
            93,
            851,
            1429
        ],
        "flipX": false
    },
    "peek": {
        "src": "assets/straight-hair/peek.webp",
        "width": 983,
        "height": 1600,
        "anchorX": 864.3,
        "anchorY": 1538,
        "scale": 0.24920549,
        "bounds": [
            652,
            163,
            983,
            1539
        ],
        "gripX": 983
    },
    "finished": {
        "src": "assets/straight-hair/finished.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 517,
        "anchorY": 1498,
        "scale": 0.23828125,
        "bounds": [
            256,
            10,
            852,
            1498
        ]
    },
    "walk-a": {
        "src": "assets/straight-hair/walk-a.webp",
        "width": 1023,
        "height": 1537,
        "anchorX": 502.024,
        "anchorY": 1354,
        "scale": 0.30639432,
        "bounds": [
            203,
            229,
            787,
            1355
        ]
    },
    "walk-b": {
        "src": "assets/straight-hair/walk-b.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 502.762,
        "anchorY": 1370,
        "scale": 0.29584775,
        "bounds": [
            258,
            215,
            772,
            1371
        ]
    },
    "reach-left": {
        "src": "assets/straight-hair/reach-left.webp",
        "width": 1023,
        "height": 1537,
        "anchorX": 554.055,
        "anchorY": 1377,
        "scale": 0.30528,
        "bounds": [
            224,
            128,
            726,
            1378
        ],
        "handX": 252,
        "handY": 128
    },
    "reach-low": {
        "src": "assets/straight-hair/reach-low.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 570.684,
        "anchorY": 1435,
        "scale": 0.2933439,
        "bounds": [
            245,
            174,
            796,
            1436
        ],
        "handX": 273,
        "handY": 174
    },
    "reach-right": {
        "src": "assets/straight-hair/reach-right.webp",
        "width": 1023,
        "height": 1537,
        "anchorX": 543.479,
        "anchorY": 1421,
        "scale": 0.30556414,
        "bounds": [
            310,
            128,
            773,
            1422
        ],
        "handX": 739,
        "handY": 128
    },
    "tiptoe-left": {
        "src": "assets/straight-hair/tiptoe-left.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 530.69,
        "anchorY": 1424,
        "scale": 0.28989247,
        "bounds": [
            218,
            30,
            814,
            1425
        ],
        "handX": 248,
        "handY": 30
    },
    "tiptoe-right": {
        "src": "assets/straight-hair/tiptoe-right.webp",
        "width": 1024,
        "height": 1536,
        "anchorX": 530.11,
        "anchorY": 1392,
        "scale": 0.29713446,
        "bounds": [
            228,
            32,
            816,
            1393
        ],
        "handX": 784,
        "handY": 32
    }
};
  const TARGETS = {
    birthday: 'tiptoe-left', star: 'reach-left', rich: 'reach-left', pause: 'reach-low',
    report: 'reach-right', secret: 'reach-right', quiet: 'reach-right', surprise: 'tiptoe-right',
  };
  const isEndingPose = name => name === 'finished';
  const EASE = 'cubic-bezier(.23,1,.32,1)';
  // The stride keeps a steady rhythm, so its travel must keep a steady speed.
  const WALK_EASE = 'linear';

  function create(root, initialLayout) {
    if (!root) return null;
    const actor = root.querySelector('.actor');
    const frames = root.querySelector('.actor-frames');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const images = new Map(), ready = new Map();
    let revision = 0, movement = null, toeLift = null, strideTimer = 0;
    let endingMotion = null, endingTried = false;
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
      endingMotion?.resize();
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
      endingMotion?.stop();
      root.classList.remove('is-ending-breeze');
    }

    function startEndingMotion(token) {
      stopEndingMotion();
      if (token !== revision || reduced.matches || document.hidden || !isEndingPose(pose)) return;
      if (!endingTried) {
        endingTried = true;
        endingMotion = createEndingBreeze(root, frames, image('finished'));
      }
      if (endingMotion?.start()) root.classList.add('is-ending-breeze');
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
      root.setAttribute('aria-label', '所有生辰笺都已收下，女生面向前方戴墨镜比耶，头部缓缓偏转很小的角度，发梢和裙边轻动');
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

  // Single-texture mesh: there are no alternate faces, opacity loops or
  // periodically replaced images. A complete lean and return takes12seconds.
  function createEndingBreeze(root, frames, source) {
    const canvas = document.createElement('canvas');
    canvas.className = 'actor-ending-surface';
    canvas.setAttribute('aria-hidden', 'true');
    let gl;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true,
      antialias: true, depth: false, stencil: false }); } catch (_) { return null; }
    if (!gl) { root.dataset.endingRenderer = 'static'; return null; }
    const vertex = `
      attribute vec2 a_uv;
      uniform float u_time;
      varying vec2 v_uv;
      void main() {
        v_uv = a_uv;
        vec2 p = a_uv * vec2(1024.0,1536.0);
        bool headRegion = p.y<370.0 && p.x>340.0 && p.x<655.0;
        bool hairRegion = p.y>390.0 && p.y<635.0 && p.x>623.0 && p.x<680.0;
        bool skirtRegion = p.y>665.0 && p.y<1342.0;
        if(!headRegion && !hairRegion && !skirtRegion) {
          gl_Position=vec4(a_uv.x*2.0-1.0,1.0-a_uv.y*2.0,0.0,1.0);
          return;
        }
        float breeze = 0.5 - 0.5*cos(u_time*0.5235987756);
        float angle = -0.0104719755*breeze;
        float head = (1.0-smoothstep(300.0,370.0,p.y)) * smoothstep(340.0,385.0,p.x)
          * (1.0-smoothstep(630.0,655.0,p.x));
        vec2 neck = vec2(514.0,334.0);
        vec2 d = p-neck;
        vec2 tilted = vec2(cos(angle)*d.x-sin(angle)*d.y,
                          sin(angle)*d.x+cos(angle)*d.y);
        vec2 offset = (tilted-d)*head;
        float hair = smoothstep(623.0,641.0,p.x)*(1.0-smoothstep(665.0,680.0,p.x))
          * smoothstep(390.0,500.0,p.y)*(1.0-smoothstep(610.0,635.0,p.y));
        offset.x -= 10.0*breeze*hair;
        float skirt = smoothstep(665.0,1150.0,p.y)*(1.0-smoothstep(1320.0,1342.0,p.y));
        float handGuard = 1.0-(1.0-smoothstep(374.0,400.0,p.x))
          *(1.0-smoothstep(920.0,980.0,p.y));
        skirt *= handGuard;
        offset.x -= breeze*skirt*(7.0+2.0*sin(u_time*0.5235987756-p.x*0.008));
        offset.y += breeze*skirt*2.5*sin(u_time*0.5235987756-p.x*0.012);
        vec2 outPoint = a_uv+offset/vec2(1024.0,1536.0);
        gl_Position = vec4(outPoint.x*2.0-1.0,1.0-outPoint.y*2.0,0.0,1.0);
      }`;
    const fragment = `precision mediump float; uniform sampler2D u_image;
      varying vec2 v_uv; void main(){gl_FragColor=texture2D(u_image,v_uv);}`;
    function shader(type, code) {
      const result = gl.createShader(type);
      gl.shaderSource(result, code); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error('Ending shader unavailable');
      return result;
    }
    let program, timeLocation, indexCount;
    try {
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Ending program unavailable');
      gl.useProgram(program);
      const columns=72, rows=108, vertices=[], indices=[];
      for(let y=0;y<=rows;y++) for(let x=0;x<=columns;x++) vertices.push(x/columns,y/rows);
      for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) {
        const a=y*(columns+1)+x, b=a+columns+1;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
      const buffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      const uv=gl.getAttribLocation(program,'a_uv'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW); indexCount=indices.length;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.uniform1i(gl.getUniformLocation(program,'u_image'),0);
      timeLocation=gl.getUniformLocation(program,'u_time');
      gl.clearColor(0,0,0,0); gl.disable(gl.DITHER);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    } catch (_) { root.dataset.endingRenderer='static'; return null; }
    frames.append(canvas);
    root.dataset.endingRenderer='continuous';
    let raf=0, seconds=0, lastTime=null, failed=false;
    function draw() {
      gl.uniform1f(timeLocation,seconds); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
    }
    function resize() {
      for(const key of ['width','height','left','top']) canvas.style[key]=source.style[key];
      // Supersample the fine pencil outlines even in a1x desktop preview.
      const density=2;
      const width=Math.max(1,Math.round(parseFloat(source.style.width)*density));
      const height=Math.max(1,Math.round(parseFloat(source.style.height)*density));
      if(canvas.width!==width||canvas.height!==height) {
        canvas.width=width; canvas.height=height; gl.viewport(0,0,width,height);
      }
      if(!failed) draw();
    }
    function tick(now) {
      if(failed)return;
      if(lastTime!==null)seconds+=Math.min((now-lastTime)/1000,.05);
      lastTime=now;draw();raf=requestAnimationFrame(tick);
    }
    function stop() {cancelAnimationFrame(raf);raf=0;lastTime=null;}
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();failed=true;stop();
      root.classList.remove('is-ending-breeze');root.dataset.endingRenderer='static';
    });
    return {resize,stop,start(){if(failed)return false;resize();stop();raf=requestAnimationFrame(tick);return true;}};
  }

  window.BirthdayCharacter = { create };
})();
