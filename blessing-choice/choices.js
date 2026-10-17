(() => {
  'use strict';

  const init = () => {
    const grid = document.getElementById('note-grid');
    const dialog = document.getElementById('note-dialog');
    const flight = document.getElementById('note-flight');
    const flipper = document.getElementById('note-flipper');
    const noteTemplate = document.getElementById('paper-note-template');
    let frontFace;
    let backFace;
    let frontText;
    let frontSmall;
    let backText;
    const closeButton = document.getElementById('note-close');
    const hint = document.getElementById('note-gesture-hint');
    const count = document.getElementById('note-count');
    const physicalHost = document.getElementById('note-physical');
    if (!grid || !dialog || !flight || !flipper || !noteTemplate || !closeButton) return;

    const triggers = [...grid.querySelectorAll('button.note-trigger[data-note-id]')];
    // 正面：\n 向左另起一列，每列从上往下读。
    // 背面：\n 普通换行，\n\n 段落之间空一行。
    const messages = [
  [
    "平平安安，\n身体健康",
    "衷心祝愿\n身体安康，\n抵抗力up！！\n养好身体，\n远离药罐子！！"
  ],
  [
    "祝你暴富哇",
    "这不会是第一个\n选的吧！！\n\n那我也许愿！\n届时我能给您\n打工吗？\n我要五险一金\n双休不加班！"
  ],
  [
    "祝越来越\n漂亮？！",
    "可恶！！\n\n她应该知道\n自己已如此\n美丽了吧？"
  ],
  [
    "祝愿你会有\n一份兴趣使然，\n值得努力耕耘的事业。",
    "愿你的认真与负责\n换来实在的回报。\n工资涨一点，\n烦心事少一点。"
  ],
  [
    "别糟蹋了脸上\n刺绣的年少！",
    "无比庆幸此刻年少，\n青春正燃烧。"
  ],
  [
    "好运常相伴",
    "愿偶尔的好运，\n恰好落在你身上。\n努力有回音，\n等待有结果。\n普通的一天，\n也藏着小惊喜。"
  ],
  [
    "祝福每天\n元气满满",
    "谢谢你的元气。\n还给你部分元气，\n元气+1+1..."
  ],
  [
    "祝福开心\n与快乐",
    "你还好吗？\n\n有没有遇到\n不好的事情？"
  ]
];
    const previews = ["健康", "暴富", "漂亮", "事业", "自由", "好运", "元气", "心态"];
    // 补送健康时额外加的开场，后面仍接 messages 里的完整健康祝福。
    const healthGift = "咋把这个\n忘了？？\n行吧！\n请一定要\n拿上这个~";
    const messageById = new Map();
    triggers.forEach((trigger, index) => {
      const message = messages[index % messages.length];
      messageById.set(trigger.dataset.noteId, message);
      const caption = trigger.querySelector('.note-small')?.textContent || '';
      const paper = noteTemplate.content.firstElementChild.cloneNode(true);
      setVerticalTitle(paper.querySelector('.note-label'), previews[index]);
      paper.querySelector('.note-small').textContent = caption;
      paper.querySelector('.note-back-text').textContent = message[1];
      if (trigger.dataset.noteId === 'joy') {
        const blossom = new Image();
        blossom.className = 'note-blossom';
        blossom.src = 'assets/plum-blossom.webp';
        blossom.alt = '';
        blossom.draggable = false;
        blossom.addEventListener('error', () => blossom.remove(), { once: true });
        paper.querySelector('.note-front').append(blossom);
      }
      const cord = document.createElement('span');
      cord.className = 'red-cord';
      cord.setAttribute('aria-hidden', 'true');
      const thread = new Image();
      thread.src = 'assets/red-cord.webp'; thread.alt = ''; thread.draggable = false;
      cord.append(thread);
      trigger.replaceChildren(cord, paper);
      fitFrontWriting(paper.querySelector('.note-writing--front'));
      trigger.setAttribute('aria-label', message[0]);
      trigger.setAttribute('aria-controls', 'note-dialog');
      trigger.setAttribute('aria-expanded', 'false');
      // A click count of zero also occurs with non-keyboard activation.
      // Only an actual key event should bypass the character's walking phase.
      trigger.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!event.repeat) requestOpen(trigger, true, true);
      });
      trigger.addEventListener('click', (event) => {
        // Slender hanging tags need generous finger targets. Where those targets
        // overlap, select the paper nearest the actual touch, rather than DOM order.
        let chosen = trigger;
        if (event.clientX !== 0 || event.clientY !== 0) {
          let nearest = Infinity;
          for (const candidate of triggers) {
            if (candidate.hidden) continue;
            const rect = candidate.querySelector('.paper-note').getBoundingClientRect();
            const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2 + 10);
            const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2 + 10);
            const distance = dx * dx + dy * dy;
            if (distance < nearest) { nearest = distance; chosen = candidate; }
          }
        }
        requestOpen(chosen);
      });
    });

    const ease = 'cubic-bezier(0.77, 0, 0.175, 1)';
    const seen = new Set();
    const collected = new Set();
    const scene = document.querySelector('.scene');
    const selectionPanel = document.getElementById('selection-panel');
    const summary = document.getElementById('selection-summary');
    const submitButton = document.getElementById('selection-submit');
    let phase = 'choosing';
    let sending = false;
    let surpriseRevision = 0;
    const art = document.getElementById('scene-art');
    const background = art.querySelector('.scene-background');
    const petals = art.querySelector('.petals');
    const slots = [...grid.querySelectorAll('.note-slot')].map(slot => ({
      slot, cord: Number.parseFloat(slot.style.getPropertyValue('--cord')),
      x: Number.parseFloat(slot.style.getPropertyValue('--x')),
      y: Number.parseFloat(slot.style.getPropertyValue('--y')),
      tagWidth: Number.parseFloat(slot.style.getPropertyValue('--tag-width')),
    }));
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    let layout = null;
    let actor = null;
    let hangingLayoutKey = null;
    const layoutScene = () => {
      // Some in-app WebViews report dvh support but include their native bars.
      scene.style.height = `${Math.max(280, window.visualViewport?.height || innerHeight)}px`;
      document.body.style.minHeight = scene.style.height;
      const width = scene.clientWidth, height = scene.clientHeight;
      const style = getComputedStyle(scene);
      const safeTop = Number.parseFloat(style.paddingTop) || 0;
      const safeBottom = Number.parseFloat(style.paddingBottom) || 0;
      const safeLeft = Number.parseFloat(style.paddingLeft) || 0;
      const safeRight = Number.parseFloat(style.paddingRight) || 0;
      const availableWidth = width - safeLeft - safeRight;
      const landscape = width >= 480 && width > height * 1.15;
      const compact = !landscape && height / width < 1.75;
      const cordFactor = landscape ? 1 : clamp((height / width - 1.3) / .45, .5, 1);
      const paperWidth = landscape ? Math.min(availableWidth * .59, (height - safeTop - 32) * 1.25, 480) : availableWidth;
      const scale = paperWidth / 390;
      const paperLeft = safeLeft;
      let paperTop = Math.max(0, safeTop - 28);
      const figureLeft = landscape ? paperLeft + paperWidth + 12 : safeLeft;
      const figureRight = width - safeRight;
      const centerX = (figureLeft + figureRight) / 2;
      const footerWidth = Math.max(150, figureRight - figureLeft - 32);
      const footerFont = Math.min(22, width * .055, footerWidth / (11 * 1.08));
      const footerBottom = safeBottom + (compact || landscape ? 12 : 24);
      art.style.setProperty('--footer-left', `${figureLeft + 16}px`);
      art.style.setProperty('--footer-width', `${footerWidth}px`);
      art.style.setProperty('--footer-font', `${footerFont}px`);
      art.style.setProperty('--footer-bottom', `${footerBottom}px`);
      const groundY = height - footerBottom - Math.max(footerFont * 1.85 * 2, selectionPanel.offsetHeight) - (compact || landscape ? 18 : 28);
      const rightTagBottom = Math.max(...slots.filter(item => item.x > 195).map(item =>
        item.y + item.cord * cordFactor + item.tagWidth * 2.5 + 6)) * scale + paperTop;
      const maxBodyHeight = landscape ? (groundY - safeTop - 14) * 350 / 416 : groundY - rightTagBottom - 12;
      const bodyHeight = Math.max(130, Math.min(landscape ? height * .62 : clamp(height * .43, 255, 390), maxBodyHeight));
      layout = { width, height, safeTop, safeBottom, safeLeft, safeRight, landscape,
        paperLeft, paperTop, paperWidth, paperScale: scale, figureLeft, figureRight,
        centerX, groundY, actorFactor: bodyHeight / 350, edgeX: figureRight };
      actor?.layout(layout);
      if (actor?.reachPoint && !landscape) {
        // Lower the branch toward her natural reach, keeping the original short cords.
        const branchTops=slots.map(({slot,x,y,cord,tagWidth})=>{
          const trigger=slot.querySelector('.note-trigger');
          const hand=actor.reachPoint({id:trigger.dataset.characterTarget,x:paperLeft+x*scale});
          const angle=Number.parseFloat(slot.style.getPropertyValue('--angle'))*Math.PI/180;
          const hangingBottom=y+(cord*cordFactor+tagWidth*2.5)*Math.cos(angle)
            +tagWidth*.5*Math.abs(Math.sin(angle));
          return hand.handY+3-hangingBottom*scale;
        }).sort((a,b)=>a-b);
        paperTop=clamp((branchTops[3]+branchTops[4])/2,paperTop,paperTop+Math.min(height*.14,96*scale));
        layout.paperTop=paperTop;
      }
      scene.dataset.layout = landscape ? 'landscape' : 'portrait';
      art.style.setProperty('--scene-scale', scale);
      background.style.width = `${paperWidth}px`;
      background.style.left = `${paperLeft}px`;
      background.style.top = `${paperTop}px`;
      const paperTransform = `translate3d(${paperLeft}px,${paperTop}px,0) scale(${scale})`;
      grid.style.transform = paperTransform;
      petals.style.transform = paperTransform;
      petals.style.height = `${height / scale}px`;
      dialog.dataset.layout = scene.dataset.layout;
      const readingHeight = height - safeTop - safeBottom;
      const noteHeight = landscape ? Math.min(360, readingHeight - 40)
        : Math.min(440, readingHeight - (phase === 'surprise' ? 88 : 156), Math.max(phase === 'surprise' ? 380 : 340, readingHeight * .58));
      const noteWidth = Math.min(196, availableWidth * (landscape ? .4 : .56), noteHeight / 2.5);
      dialog.style.height = `${height}px`;
      dialog.style.setProperty('--reader-center-y', `${safeTop + readingHeight / 2}px`);
      dialog.style.setProperty('--note-width', `${Math.max(24, noteWidth)}px`);
      const nextHangingKey = [width,height,safeTop,safeBottom,safeLeft,safeRight,groundY,bodyHeight,paperTop].join(':');
      if (actor && hangingLayoutKey !== nextHangingKey) {
        slots.forEach(({ slot, cord }) => slot.style.setProperty('--cord', `${cord * cordFactor}px`));
        if (!landscape) triggers.filter(trigger => !trigger.hidden).forEach(alignNoteToHand);
        hangingLayoutKey = nextHangingKey;
      }
    };
    new ResizeObserver(layoutScene).observe(scene);
    layoutScene();
    const waits = new Set();
    let state = 'idle';
    let collectionEffect = null;
    let operation = 0;
    let activeTrigger = null;
    let originalVisibility = '';
    let originalBodyOverflow = '';
    let sourceTransform = 'none';
    let fallbackDialog = false;
    let rotation = 0;
    let restingRotation = 0;
    let angularVelocity = 0;
    let pointer = null;
    let spring = null;
    let physicalWanted = true;
    let physicalAvailable = true;
    let physicalReady = false;
    let physicalEngine = null;
    let enginePromise = null;
    let selection = 0;
    let approaching = 0;
    actor = window.BirthdayCharacter?.create(document.getElementById('birthday-character'), layout);
    layoutScene();

    function hasPhysical() { return physicalWanted && physicalReady && physicalAvailable; }

    function updateMotionUI() {
      const enabled = hasPhysical();
      dialog.classList.toggle('has-physical', enabled);
      dialog.classList.toggle('is-paper-fallback', !enabled);
      dialog.dataset.mode = enabled ? 'physical' : physicalAvailable ? 'loading' : 'fallback';
      physicalHost.hidden = !enabled;
      physicalEngine?.activate(enabled);
      exposeFace(isBack(rotation));
      renderRotation();
    }

    function unavailable() {
      physicalAvailable = physicalWanted = physicalReady = false;
      if (state === 'moving' || state === 'approaching') { updateMotionUI(); return; }
      if (state === 'returning') { finishClose(); updateMotionUI(); return; }
      nextOperation();
      releasePointer();
      updateMotionUI();
      if (state !== 'idle') {
        finishTurn(Math.round(rotation / 180) * 180);
        setState('reading');
      }
    }

    function loadEngine() {
      if (!enginePromise) enginePromise = new Promise((resolve, reject) => {
        if (window.BirthdayPaper3D) { resolve(window.BirthdayPaper3D); return; }
        const script = document.createElement('script');
        script.src = 'blessing-choice/birthday-paper-3d.js?v=vertical-columns-1';
        script.async = true;
        script.onload = () => window.BirthdayPaper3D ? resolve(window.BirthdayPaper3D) : reject(new Error('Paper library unavailable'));
        script.onerror = () => reject(new Error('Paper library did not load'));
        document.head.append(script);
      }).then(api => physicalEngine ||= api.createScene(physicalHost, flight, unavailable));
      return enginePromise;
    }

    function writingData(element, center = false) {
      const style = getComputedStyle(element);
      let x = 0, y = 0, node = element;
      while (node && node !== flight) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent; }
      const size = Number.parseFloat(style.fontSize);
      return { text: element.textContent, x: x + (center ? element.offsetWidth / 2 : 0), y,
        size, weight: style.fontWeight, family: style.fontFamily, color: style.color,
        lineFactor: Number.parseFloat(style.lineHeight) / size,
        gap: Number.parseFloat(style.marginBottom) || 0 };
    }

    function capturePaperData(trigger) {
      const signature = writingData(backFace.querySelector('.back-signature'));
      signature.gap = Number.parseFloat(getComputedStyle(backFace.querySelector('.back-signature')).marginTop) || 0;
      const image = frontFace.querySelector('.note-paper');
      const blossom = frontFace.querySelector('.note-blossom');
      const backWriting = backFace.querySelector('.note-writing--back');
      const frontWriting = frontFace.querySelector('.note-writing--front');
      const front = writingData(frontText, true);
      front.text = frontText.getAttribute('aria-label');
      front.columns = [...frontText.querySelectorAll('.note-column')].map(column => column.textContent);
      // Reuse the measured glyph boxes so DOM and curved 3D paper have identical columns.
      front.glyphs = [...frontText.querySelectorAll('.note-glyph')].map(glyph => {
        const {text,x,y} = writingData(glyph, true);
        return {text,x,y};
      });
      return { id: trigger.dataset.noteId, src: image.currentSrc || image.src, width: flight.offsetWidth,
        frontBounds: {
          left: frontWriting.offsetLeft / flight.offsetWidth,
          top: frontWriting.offsetTop / flight.offsetHeight,
          width: frontWriting.clientWidth / flight.offsetWidth,
          height: frontWriting.clientHeight / flight.offsetHeight,
        },
        // New folded paper has an inset frame and lower seal; use the same safe
        // area in the physical texture as in the readable DOM version.
        backBounds: scene.dataset.paperStyle === 'folded' ? {
          left: backWriting.offsetLeft / flight.offsetWidth,
          top: backWriting.offsetTop / flight.offsetHeight,
          width: backWriting.clientWidth / flight.offsetWidth,
          height: backWriting.clientHeight / flight.offsetHeight,
        } : null,
        tint: getComputedStyle(trigger).getPropertyValue('--note-tint').trim() || 'none',
        front, caption: writingData(frontSmall, true),
        back: writingData(backText), eyebrow: writingData(backFace.querySelector('.back-eyebrow')), signature,
        blossom: blossom ? { src: blossom.currentSrc || blossom.src, x: .83, y: .125, size: .30 } : null };
    }

    async function preparePhysical(trigger, data = capturePaperData(trigger)) {
      if (!physicalWanted || !physicalAvailable) return;
      const revision = ++selection;
      updateMotionUI();
      try {
        const engine = await loadEngine();
        if (revision !== selection || activeTrigger !== trigger || !physicalWanted || state === 'returning' || state === 'idle') return;
        // Let the canvas acquire its size while the complete DOM face remains visible.
        physicalHost.hidden = false;
        if (!await engine.setPaper(data)) return;
        if (revision !== selection || activeTrigger !== trigger || !physicalWanted || state === 'returning' || state === 'idle') {
          if (revision === selection) engine.clear();
          return;
        }
        physicalReady = true;
        updateMotionUI();
      } catch (error) {
        if (revision !== selection || state === 'idle') return;
        unavailable();
        console.warn('Using the complete two-sided paper fallback.', error);
      }
    }

    function setVerticalTitle(title, text) {
      title.setAttribute('aria-label', text);
      title.replaceChildren(...String(text).replace(/\r\n?/g, '\n').split('\n').map(line => {
        const column = document.createElement('span');
        column.className = 'note-column'; column.setAttribute('aria-hidden', 'true');
        column.replaceChildren(...Array.from(line.trim(), char => {
          const glyph = document.createElement('span');
          glyph.className = 'note-glyph'; glyph.textContent = char;
          return glyph;
        }));
        return column;
      }));
    }

    function fitFrontWriting(writing) {
      if (!writing || writing.clientHeight < 1 || writing.clientWidth < 1) return;
      const title = writing.querySelector('.note-label');
      const caption = writing.querySelector('.note-small');
      const tokens = getComputedStyle(writing);
      const titleMax = Number.parseFloat(tokens.getPropertyValue('--title-size')) || 19;
      const captionMax = Number.parseFloat(tokens.getPropertyValue('--caption-size')) || 14;
      caption.style.fontSize = `${captionMax}px`;
      // Horizontal glyph boxes avoid Safari's vertical-font/flex clipping.
      // Reserve ink overhang instead of relying on a clipped scrollWidth.
      const columns = [...title.querySelectorAll('.note-column')];
      const count = Math.max(1, ...columns.map(column => column.children.length));
      const columnCount = Math.max(1, columns.length);
      const widthInEm = columnCount * 1.12 + (columnCount - 1) * .38;
      const size = Math.min(titleMax, (writing.clientWidth - 4) / widthInEm,
        (writing.clientHeight - 10) / (count * 1.22));
      title.style.fontSize = `${Math.max(1, Math.floor(size * 4) / 4)}px`;
    }

    function fitBackWriting(face) {
      const writing = face?.querySelector('.note-writing--back');
      const content = face?.querySelector('.back-content');
      const body = face?.querySelector('.note-back-text');
      if (!writing?.clientHeight || !content || !body) return;
      body.style.fontSize = '';
      let size = Number.parseFloat(getComputedStyle(body).fontSize);
      while (content.scrollHeight > writing.clientHeight - 2 && size > 12) {
        size = Math.max(12, size - .25); body.style.fontSize = `${size}px`;
      }
    }

    const frontWritingObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => entries.forEach(({ target }) => fitFrontWriting(target))) : null;
    grid.querySelectorAll('.note-writing--front').forEach((writing) => frontWritingObserver?.observe(writing));
    const refitWriting = () => document.querySelectorAll('.note-writing--front').forEach(fitFrontWriting);
    document.fonts?.ready.then(refitWriting);

    function setState(next) {
      state = next;
      dialog.dataset.state = next;
      scene.classList.toggle('is-note-open', next !== 'idle' && next !== 'approaching');
      scene.setAttribute('aria-busy', String(next === 'approaching'));
      updateBreeze();
      syncChoices();
    }

    function updateBreeze() {
      scene.classList.toggle('is-breeze-paused', state !== 'idle' || document.hidden);
      grid.classList.toggle('is-breeze-paused', state !== 'idle' || document.hidden);
    }

    function stopSpring() {
      if (!spring) return;
      const previous = spring;
      spring = null;
      previous.control?.stop();
      previous.resolve(false);
    }

    function nextOperation() {
      operation += 1;
      stopSpring();
      [...waits].forEach((cancel) => cancel());
      return operation;
    }

    function current(token) {
      return token === operation && state !== 'idle' && dialog.hasAttribute('open');
    }

    function waitTransition(element, property, duration, token) {
      return new Promise((resolve) => {
        let timer;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          element.removeEventListener('transitionend', onEnd);
          waits.delete(finish);
          resolve(current(token));
        };
        const onEnd = (event) => {
          if (event.target === element && event.propertyName === property) finish();
        };
        waits.add(finish);
        element.addEventListener('transitionend', onEnd);
        timer = window.setTimeout(finish, duration + 60);
        if (!current(token)) finish();
      });
    }

    function nextFrame(token) {
      return new Promise((resolve) => requestAnimationFrame(() => resolve(current(token))));
    }

    function isBack(angle) {
      const normalized = ((angle % 360) + 360) % 360;
      return normalized > 90 && normalized < 270;
    }

    function exposeFace(back) {
      flipper.classList.toggle('is-flipped', back);
      frontFace?.setAttribute('aria-hidden', String(back));
      backFace?.setAttribute('aria-hidden', String(!back));
      dialog.setAttribute('aria-describedby', `${back ? 'note-back-text' : 'note-front-text'}${hint ? ' note-gesture-hint' : ''}`);
    }

    function renderRotation() {
      if (hasPhysical()) {
        const grip = pointer?.dragged ? Math.max(-1, Math.min(1, pointer.distance / flight.offsetWidth)) : 0;
        const tilt = pointer?.dragged ? Math.max(-1, Math.min(1, pointer.vertical / 90)) : 0;
        physicalEngine.pose(rotation, grip, tilt);
        exposeFace(isBack(rotation));
      }
    }

    function finishTurn(target) {
      rotation = target;
      restingRotation = target;
      angularVelocity = 0;
      renderRotation();
      exposeFace(isBack(target));
      if (hint) hint.textContent = isBack(target) ? '再拖一下纸条，回到正面' : '左右拖动纸条，翻到背面';
      flipper.style.willChange = '';
    }

    async function settleTo(target, token, velocity = 0) {
      if (!current(token)) return false;
      restingRotation = target;
      if (Math.abs(rotation - target) < .15 && Math.abs(velocity) < 2) {
        finishTurn(target);
        return true;
      }
      if (!hasPhysical()) {
        const changed = flipper.classList.contains('is-flipped') !== isBack(target);
        if (changed) {
          flipper.style.transition = 'opacity 75ms linear';
          flipper.style.opacity = '0';
          if (!await waitTransition(flipper, 'opacity', 75, token)) return false;
          exposeFace(isBack(target));
          flipper.style.opacity = '1';
          if (!await waitTransition(flipper, 'opacity', 75, token)) return false;
        }
        finishTurn(target);
        return true;
      }
      angularVelocity = Math.max(-800, Math.min(800, velocity));
      return animateRotation(target, token, { type: 'spring', mass: 1, stiffness: 100, damping: 10,
        velocity: angularVelocity, restDelta: .15, restSpeed: 2 });
    }

    function animateRotation(target, token, options) {
      return new Promise((resolve) => {
        const animation = { control: null, resolve };
        spring = animation;
        let previous = rotation, previousTime = performance.now();
        animation.control = physicalEngine.animate(rotation, target, { ...options,
          onUpdate(latest) {
            if (spring !== animation || !current(token)) return;
            const now = performance.now();
            angularVelocity = (latest - previous) / Math.max(.001, (now - previousTime) / 1000);
            rotation = previous = latest; previousTime = now;
            renderRotation();
          },
          onComplete() {
            if (spring !== animation || !current(token)) return;
            spring = null; finishTurn(target); resolve(true);
          },
        });
      });
    }

    function resetNoteGridPosition() {
      // Older WebViews may scroll overflow:hidden while focusing an edge note.
      for (const element of [scene, grid]) {
        if (element.scrollLeft !== 0) element.scrollLeft = 0;
        if (element.scrollTop !== 0) element.scrollTop = 0;
      }
    }

    function releasePointer() {
      if (!pointer) return;
      const id = pointer.id;
      pointer = null;
      if (flight.hasPointerCapture?.(id)) flight.releasePointerCapture(id);
    }

    function syncChoices() {
      scene.dataset.choicePhase = phase;
      const names = triggers.filter(t => collected.has(t.dataset.noteId)).map(t => previews[triggers.indexOf(t)]);
      summary.textContent = names.length ? `已选 ${names.length} 份 · ${names.join(' · ')}` : '点开枝头纸笺，挑选你的祝福';
      submitButton.disabled = !names.length || phase !== 'choosing' || state !== 'idle';
      closeButton.disabled = !['reading', 'settling'].includes(state);
      closeButton.textContent = '收下祝福';
      dialog.classList.toggle('is-health-gift', phase === 'surprise');
      count.textContent = `已选 ${names.length} 份祝福`;
      layoutScene();
    }

    function completeBirthday(instant = false) {
      if (phase === 'complete') return;
      phase = 'complete'; sending = false; surpriseRevision++;
      scene.classList.add('is-complete');
      selectionPanel.inert = true; selectionPanel.setAttribute('aria-hidden', 'true');
      grid.inert = true; grid.classList.add('is-finished');
      const wish = document.getElementById('birthday-title'); wish.hidden = false;
      syncChoices(); count.textContent = '祝福已送达。' + wish.textContent;
      wish.focus({preventScroll:true});
      Promise.resolve(actor?.finish({instant})).then(() => {
        document.getElementById('birthday-character').setAttribute('aria-label', '祝福已经送达，女生面向前方戴墨镜比耶，轻轻偏头');
      });
    }

    async function submitChoices() {
      if (sending || phase !== 'choosing' || state !== 'idle' || !collected.size) return;
      sending = true;
      if (collected.has('health')) { completeBirthday(); return; }
      phase = 'surprise'; grid.inert = true; dialog.classList.remove('is-keyboard'); setState('summoning');
      const revision = ++surpriseRevision;
      const health = triggers.find(t => t.dataset.noteId === 'health');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      await new Promise(r => setTimeout(r, reduced ? 0 : 420));
      if (revision !== surpriseRevision || phase !== 'surprise') return;
      health.closest('.note-slot').classList.add('is-released');
      // This extra wish comes to her by itself, without another reaching pose.
      await openNote(health, reduced);
    }
    submitButton.addEventListener('click', submitChoices);

    function finishClose(restoreFocus = true, collect = false, instant = false) {
      collectionEffect?.cancel(); collectionEffect = null;
      approaching++;
      actor?.cancel();
      const returnFocus = activeTrigger;
      if (collect && activeTrigger && seen.has(activeTrigger.dataset.noteId)) {
        collected.add(activeTrigger.dataset.noteId);
        activeTrigger.closest('.note-slot').classList.add('is-collected');
        activeTrigger.hidden = true;
      }
      const giftAccepted = collect && phase === 'surprise';
      if (phase === 'surprise' && !collect) {
        phase = 'choosing'; sending = false; surpriseRevision++; grid.inert = false;
      }

      nextOperation();
      releasePointer();
      selection++;
      physicalReady = false;
      physicalEngine?.clear();
      physicalHost.hidden = true;
      dialog.classList.remove('has-physical');
      dialog.classList.add('is-paper-fallback');
      if (activeTrigger) {
        activeTrigger.style.visibility = originalVisibility;
        activeTrigger.setAttribute('aria-expanded', 'false');
      }
      setState('idle');
      activeTrigger = null;
      flipper.style.transition = 'none';
      flipper.style.opacity = '1';
      finishTurn(0);
      flight.style.transition = 'none';
      flight.style.transform = 'none';
      flight.style.opacity = '1';
      flight.style.willChange = '';
      document.body.style.overflow = originalBodyOverflow;
      if (fallbackDialog) {
        grid.inert = false;
        dialog.removeAttribute('open');
      } else if (dialog.open) {
        dialog.close();
      }
      if (restoreFocus) {
        const next = returnFocus?.hidden ? triggers.find(t => !t.hidden) || document.getElementById('birthday-title') : returnFocus;
        next?.focus({ preventScroll: true });
      }
      if (giftAccepted) completeBirthday(instant);
      else if (collect) void actor?.rest({ instant });
      grid.querySelectorAll('.is-released').forEach(slot => slot.classList.remove('is-released'));
      grid.querySelectorAll('.is-targeted').forEach(slot => slot.classList.remove('is-targeted'));
      resetNoteGridPosition();
    }

    function noteTarget(trigger) {
      const bounds = trigger.querySelector('.paper-note').getBoundingClientRect();
      const sceneBounds = art.getBoundingClientRect();
      return {id:trigger.dataset.characterTarget || trigger.dataset.noteId,
        x:bounds.left+bounds.width/2-sceneBounds.left,
        y:bounds.bottom-sceneBounds.top-3};
    }

    function alignNoteToHand(trigger) {
      if (!actor?.reachPoint || layout.landscape || trigger.hidden) return;
      const slot = trigger.closest('.note-slot');
      const matrix = getComputedStyle(slot).transform.match(/^matrix\(([^)]+)\)$/);
      const cosine = matrix ? Math.abs(Number(matrix[1].split(',')[3])) : 1;
      // Keep the knot on its branch. Only the hanging length follows the hand's height.
      for (let pass=0;pass<2;pass++) {
        const target = noteTarget(trigger);
        const hand = actor.reachPoint(target);
        const cord = Number.parseFloat(slot.style.getPropertyValue('--cord'));
        const correction = (hand.handY-target.y)/(layout.paperScale*Math.max(.5,cosine));
        slot.style.setProperty('--cord', `${Math.max(6,cord+correction)}px`);
      }
    }

    async function requestOpen(trigger, instant = false, keyboard = false) {
      if (phase !== 'choosing' || (state !== 'idle' && state !== 'approaching') || dialog.hasAttribute('open') || trigger.hidden) return;
      dialog.classList.toggle('is-keyboard', keyboard);
      resetNoteGridPosition();
      const request = ++approaching;
      if (actor) {
        setState('approaching');
        triggers.forEach(note => note.closest('.note-slot').classList.toggle('is-targeted', note === trigger));
        alignNoteToHand(trigger);
        const target = noteTarget(trigger);
        const arrived = await actor.reach(target, { instant });
        if (!arrived || request !== approaching || state !== 'approaching') return;
      }
      void openNote(trigger, instant);
    }

    function finishReading(trigger) {
      setState('reading');
      seen.add(trigger.dataset.noteId);
      trigger.classList.add('is-seen');

      flight.style.willChange = '';
      flight.focus({ preventScroll: true });
    }

    async function openNote(trigger, instant = false) {
      instant ||= matchMedia('(prefers-reduced-motion: reduce)').matches;
      resetNoteGridPosition();
      // Freeze the breeze before measuring, and carry its current pose into
      // the extraction instead of snapping the moving paper back to rest.
      grid.classList.add('is-breeze-paused');
      scene.classList.add('is-breeze-paused');
      const sourcePaper = trigger.querySelector('.paper-note');
      const sourceRect = sourcePaper.getBoundingClientRect();
      const sceneScale = layout.paperScale;
      const sourceWidth = sourcePaper.offsetWidth * sceneScale || sourceRect.width;
      const sourceHeight = sourcePaper.offsetHeight * sceneScale || sourceRect.height;
      const transform = getComputedStyle(trigger.closest('.note-slot')).transform;
      const matrix = transform.match(/^matrix(?:3d)?\(([^)]+)\)$/)?.[1].split(',').map(Number);
      const swayAngle = matrix ? Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI : 0;
      const angle = matrix ? swayAngle : (Number.parseFloat(trigger.dataset.angle || '0') || 0);
      // Preserve the small hanging paper's current side turn during extraction.
      // Its cord and pendulum stay in their own 2D coordinate system.
      const paperMatrix = getComputedStyle(sourcePaper).transform.match(/^matrix3d\(([^)]+)\)$/)?.[1].split(',').map(Number);
      const yaw = paperMatrix ? Math.atan2(-paperMatrix[2], paperMatrix[0]) * 180 / Math.PI : 0;
      const [originalFront, originalBack] = messageById.get(trigger.dataset.noteId);
      const front = originalFront;
      activeTrigger = trigger;
      originalVisibility = trigger.style.visibility;
      originalBodyOverflow = document.body.style.overflow;
      // Expand a clone of this complete component, including both faces. The
      // paper and its writing keep the same local coordinate system at any size.
      const paper = trigger.querySelector('.paper-note').cloneNode(true);
      flipper.replaceChildren(...paper.childNodes);
      frontFace = flipper.querySelector('.note-front');
      backFace = flipper.querySelector('.note-back');
      frontText = frontFace.querySelector('.note-label');
      frontSmall = frontFace.querySelector('.note-small');
      backText = backFace.querySelector('.note-back-text');
      backText.textContent = phase === 'surprise'
        ? `${healthGift}\n\n${originalBack}` : originalBack;
      setVerticalTitle(frontText, front);
      frontText.id = 'note-front-text';
      frontText.setAttribute('role', 'heading');
      frontText.setAttribute('aria-level', '2');
      frontSmall.id = 'note-front-small';
      backText.id = 'note-back-text';
      flight.style.setProperty('--note-tint', getComputedStyle(trigger).getPropertyValue('--note-tint').trim() || 'none');
      dialog.setAttribute('aria-label', front);
      physicalReady = false;
      updateMotionUI();
      flipper.style.transition = 'none';
      flipper.style.opacity = '1';
      finishTurn(0);
      flight.style.transition = 'none';
      flight.style.transform = 'none';
      flight.style.opacity = physicalWanted ? '1' : '0';
      flight.style.willChange = physicalWanted ? 'transform' : 'opacity';
      setState('moving');
      const token = nextOperation();
      try {
        fallbackDialog = typeof dialog.showModal !== 'function';
        if (fallbackDialog) {
          dialog.setAttribute('open', '');
          dialog.setAttribute('aria-modal', 'true');
          grid.inert = true;
        } else {
          dialog.showModal();
        }
      } catch (error) {
        finishClose();
        console.error('Unable to open the birthday note.', error);
        return;
      }
      document.body.style.overflow = 'hidden';
      fitFrontWriting(frontFace.querySelector('.note-writing--front'));
      fitBackWriting(backFace);
      const paperReady = physicalWanted ? preparePhysical(trigger, capturePaperData(trigger)) : Promise.resolve();
      const centerRect = flight.getBoundingClientRect();
      const dx = sourceRect.left + sourceRect.width / 2 - centerRect.left - centerRect.width / 2;
      const dy = sourceRect.top + sourceRect.height / 2 - centerRect.top - centerRect.height / 2;
      const sx = sourceWidth / (flight.offsetWidth || centerRect.width || 1);
      const sy = sourceHeight / (flight.offsetHeight || centerRect.height || 1);
      const sideTurn = paperMatrix ? ` perspective(${420 * sceneScale}px) rotateY(${yaw}deg)` : '';
      sourceTransform = `translate3d(${dx}px, ${dy}px, 0) rotate(${angle}deg)${sideTurn} scale(${sx}, ${sy})`;
      flight.style.transform = physicalWanted ? sourceTransform : 'none';
      trigger.style.visibility = 'hidden';
      trigger.setAttribute('aria-expanded', 'true');
      if (instant) {
        flight.style.transform = 'none';
        flight.style.opacity = '1';
        finishReading(trigger);
        if (phase === 'surprise') { await paperReady; finishTurn(180); setState('reading'); }
        return;
      }
      void flight.getBoundingClientRect();
      if (!await nextFrame(token)) return;
      const flyDuration = phase === 'surprise' ? 760 : 260;
      flight.style.transition = physicalWanted ? `transform ${flyDuration}ms ${ease}` : 'opacity 150ms linear';
      flight.style.transform = 'none';
      flight.style.opacity = '1';
      if (!await waitTransition(flight, physicalWanted ? 'transform' : 'opacity',
        physicalWanted ? flyDuration : 150, token)) return;
      finishReading(trigger);
      if (phase === 'surprise') {
        setState('revealing');
        await paperReady;
        await new Promise(r => setTimeout(r, 350));
        if (!current(token)) return;
        if (hasPhysical()) await animateRotation(180, token, {duration:.9, ease:[.37,0,.63,1]});
        else finishTurn(180);
        if (current(token)) setState('reading');
      }
    }

    async function closeNote(instant = false) {
      if (!['reading', 'settling'].includes(state)) return;
      if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finishClose(true, true, true);
        return;
      }
      const token = nextOperation();
      releasePointer();
      setState('returning');
      selection++;
      collectionEffect = window.BirthdayCollection.play({
        flight, dialog, engine: hasPhysical() ? physicalEngine : null,
        facing: rotation, speed: 1,
      });
      const complete = await collectionEffect.finished;
      if (!complete || !current(token)) return;
      finishClose(true, true);
    }

    flight.addEventListener('pointerdown', (event) => {
      if ((state !== 'reading' && state !== 'settling') || pointer ||
          !event.isPrimary || event.button !== 0) return;
      const resumeTarget = restingRotation;
      nextOperation();
      flipper.style.transition = 'none';
      flipper.style.opacity = '1';
      pointer = {
        id: event.pointerId, startX: event.clientX, lastX: event.clientX,
        startY: event.clientY, vertical: 0,
        startRotation: rotation, startRest: resumeTarget, resumeVelocity: angularVelocity,
        lastTime: event.timeStamp, velocity: 0, distance: 0, dragged: false,
        degreesPerPixel: 180 / Math.max(120, flight.offsetWidth * .75),
      };
      flight.setPointerCapture(event.pointerId);
      setState('dragging');
      flipper.style.willChange = 'transform';
    });

    flight.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.startX;
      const dt = event.timeStamp - pointer.lastTime;
      pointer.distance = dx;
      pointer.vertical = event.clientY - pointer.startY;
      pointer.dragged ||= Math.abs(dx) > 5;
      if (dt > 0) {
        const velocity = (event.clientX - pointer.lastX) / dt * pointer.degreesPerPixel * 1000;
        pointer.velocity = pointer.velocity * .35 + velocity * .65;
      }
      pointer.lastX = event.clientX;
      pointer.lastTime = event.timeStamp;
      if (!pointer.dragged) return;
      event.preventDefault();
      const raw = pointer.startRotation + dx * pointer.degreesPerPixel;
      const low = pointer.startRest - 180;
      const high = pointer.startRest + 180;
      // Add resistance beyond one half-turn, instead of letting it spin freely.
      rotation = raw < low ? low - Math.min(35, (low - raw) * .15)
        : raw > high ? high + Math.min(35, (raw - high) * .15) : raw;
      renderRotation();
    });

    async function endDrag(event, cancelled = false) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const gesture = pointer;
      const velocity = event.timeStamp - gesture.lastTime < 90 ? gesture.velocity : 0;
      releasePointer();
      let target = gesture.startRest;
      if (!cancelled && gesture.dragged) {
        const projected = rotation + velocity * .06;
        target = Math.max(gesture.startRest - 180,
          Math.min(gesture.startRest + 180, Math.round(projected / 180) * 180));
        if (target === gesture.startRest && Math.abs(gesture.distance) > 24 && Math.abs(velocity) > 420) {
          target += Math.sign(velocity) * 180;
        }
      }
      const token = nextOperation();
      setState('settling');
      if (await settleTo(target, token, cancelled ? 0 : gesture.dragged ? velocity : gesture.resumeVelocity)) {
        setState('reading');
      }
    }
    flight.addEventListener('pointerup', (event) => void endDrag(event));
    flight.addEventListener('pointercancel', (event) => void endDrag(event, true));
    flight.addEventListener('lostpointercapture', (event) => {
      if (pointer?.id === event.pointerId) void endDrag(event, true);
    });
    flight.addEventListener('dragstart', (event) => event.preventDefault());

    closeButton.addEventListener('click', (event) => void closeNote(event.detail === 0));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      void closeNote(true);
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open && activeTrigger && state !== 'idle') finishClose();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state === 'approaching') {
        event.preventDefault();
        finishClose();
      }
    });
    dialog.addEventListener('keydown', (event) => {
      dialog.classList.add('is-keyboard');
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
          (state === 'reading' || state === 'settling')) {
        event.preventDefault();
        nextOperation();
        releasePointer();
        flipper.style.transition = 'none';
        flipper.style.opacity = '1';
        finishTurn(restingRotation + (event.key === 'ArrowRight' ? 180 : -180));
        setState('reading');
      }
      if (fallbackDialog && event.key === 'Escape') {
        event.preventDefault();
        void closeNote(true);
      }
      if (!fallbackDialog || event.key !== 'Tab') return;
      if (event.shiftKey && (document.activeElement === flight || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        closeButton.focus();
      } else if (!event.shiftKey && (document.activeElement === closeButton || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        flight.focus();
      }
    });
    dialog.addEventListener('pointerdown', () => dialog.classList.remove('is-keyboard'), { passive: true });

    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;
    let visualHeight = window.visualViewport?.height || viewportHeight;
    const onResize = () => {
      const nextVisualHeight = window.visualViewport?.height || window.innerHeight;
      const changed = window.innerWidth !== viewportWidth || window.innerHeight !== viewportHeight ||
        Math.abs(nextVisualHeight - visualHeight) > 1;
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      visualHeight = nextVisualHeight;
      // Locking body scroll may widen visualViewport by the scrollbar width.
      // That must not dismiss a note on a short screen.
      if (changed && state !== 'idle') finishClose();
      if (changed) layoutScene();
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('pagehide', () => {
      if (state !== 'idle') finishClose(false);
    });
    document.addEventListener('visibilitychange', updateBreeze);
    setState('idle');
    syncChoices();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
