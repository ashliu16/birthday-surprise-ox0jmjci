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
    const dimmer = document.getElementById('note-dimmer');
    const count = document.getElementById('note-count');
    if (!grid || !dialog || !flight || !flipper || !noteTemplate || !closeButton || !hint) return;

    const triggers = [...grid.querySelectorAll('button.note-trigger[data-note-id]')];
    const messages = [
      ['生日快乐呀', '新的一岁，\n有喜欢的人和事，\n也有小小的好运。'],
      ['开心多一点', '今天的快乐不用省。\n蛋糕可以再来一块，\n笑也可以大声一点。'],
      ['愿望都成真', '大愿望慢慢实现，\n小愿望今天就满足。\n先吃喜欢的蛋糕。'],
      ['今天你最大', '寿星说了算。\n带草莓的那块，\n给我留一口好不好？'],
      ['蛋糕管够', '友情提示：\n生日当天的快乐，\n不用计算热量。'],
      ['烦恼先休假', '烦恼先放到明天。\n明天到了再商量：\n能不能继续放假？'],
      ['新的一岁吃好玩好', '这不是敷衍。\n吃好、睡好，\n笑得开心，\n就是很认真的祝福。'],
      ['愿你一直被爱包围', '不用每天闪闪发光。\n有人记得你，\n也有人惦记你。\n普通的你，\n也值得被喜欢。'],
    ];
    const messageById = new Map();
    triggers.forEach((trigger, index) => {
      const message = messages[index % messages.length];
      messageById.set(trigger.dataset.noteId, message);
      const caption = trigger.querySelector('.note-small')?.textContent || '';
      const paper = noteTemplate.content.firstElementChild.cloneNode(true);
      paper.querySelector('.note-label').textContent = message[0];
      paper.querySelector('.note-small').textContent = caption;
      paper.querySelector('.note-back-text').textContent = message[1];
      trigger.replaceChildren(paper);
      fitFrontWriting(paper.querySelector('.note-writing--front'));
      trigger.setAttribute('aria-label', message[0]);
      trigger.setAttribute('aria-controls', 'note-dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', (event) => requestOpen(trigger, event.detail === 0));
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ease = 'cubic-bezier(0.77, 0, 0.175, 1)';
    const seen = new Set();
    const waits = new Set();
    let state = 'idle';
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

    function fitFrontWriting(writing) {
      if (!writing || writing.clientHeight < 1 || writing.clientWidth < 1) return;
      const title = writing.querySelector('.note-label');
      const caption = writing.querySelector('.note-small');
      const tokens = getComputedStyle(writing);
      const titleMax = Number.parseFloat(tokens.getPropertyValue('--title-size')) || 19;
      const captionMax = Number.parseFloat(tokens.getPropertyValue('--caption-size')) || 14;
      title.style.fontSize = `${titleMax}px`;
      caption.style.fontSize = `${captionMax}px`;
      const height = writing.clientHeight - 2;
      const captionVisible = getComputedStyle(caption).display !== 'none';
      const captionMargin = captionVisible ? Number.parseFloat(getComputedStyle(caption).marginTop) || 0 : 0;
      const gap = captionVisible ? Number.parseFloat(getComputedStyle(title.parentElement).columnGap) || 0 : 0;
      const width = title.offsetWidth + (captionVisible ? caption.offsetWidth + gap : 0);
      const ratio = Math.min(1, height / Math.max(title.scrollHeight, 1),
        captionVisible ? (height - captionMargin) / Math.max(caption.scrollHeight, 1) : 1,
        (writing.clientWidth - 2) / Math.max(width, 1));
      title.style.fontSize = `${Math.floor(titleMax * ratio * 4) / 4}px`;
      caption.style.fontSize = `${Math.floor(captionMax * ratio * 4) / 4}px`;
      // Account for fractional font metrics across Android, iOS and desktop fonts.
      while (title.scrollHeight > height && Number.parseFloat(title.style.fontSize) > 1) {
        title.style.fontSize = `${Number.parseFloat(title.style.fontSize) - .25}px`;
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
    }

    function stopSpring() {
      if (!spring) return;
      const previous = spring;
      spring = null;
      cancelAnimationFrame(previous.frame);
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
      dialog.setAttribute('aria-describedby', `${back ? 'note-back-text' : 'note-front-text'} note-gesture-hint`);
    }

    function renderRotation() {
      // Directly change the paper's 3D angle while the finger moves.
      if (!reducedMotion.matches) {
        flipper.style.transform = `rotateY(${rotation}deg)`;
        exposeFace(isBack(rotation));
      }
    }

    function finishTurn(target) {
      rotation = target;
      restingRotation = target;
      angularVelocity = 0;
      renderRotation();
      exposeFace(isBack(target));
      hint.textContent = isBack(target) ? '再拖一下纸条，回到正面' : '左右拖动纸条，翻到背面';
      flipper.style.willChange = '';
    }

    async function settleTo(target, token, velocity = 0) {
      if (!current(token)) return false;
      restingRotation = target;
      if (Math.abs(rotation - target) < .15 && Math.abs(velocity) < 2) {
        finishTurn(target);
        return true;
      }
      if (reducedMotion.matches) {
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
      flipper.style.transition = 'none';
      flipper.style.willChange = 'transform';
      angularVelocity = Math.max(-800, Math.min(800, velocity));
      // Physical spring: mass 1, stiffness 100, damping 10. Re-grabbing cancels
      // this frame loop at its current angle, preserving motion continuity.
      return new Promise((resolve) => {
        const animation = { frame: 0, resolve, lastTime: 0, startTime: 0 };
        spring = animation;
        const tick = (time) => {
          if (spring !== animation || !current(token)) {
            if (spring === animation) spring = null;
            resolve(false);
            return;
          }
          if (!animation.startTime) animation.startTime = time;
          const dt = Math.min((time - (animation.lastTime || time - 16)) / 1000, .032);
          animation.lastTime = time;
          const steps = Math.max(1, Math.ceil(dt / .008));
          for (let i = 0; i < steps; i += 1) {
            const step = dt / steps;
            angularVelocity += (100 * (target - rotation) - 10 * angularVelocity) * step;
            rotation += angularVelocity * step;
          }
          renderRotation();
          if ((Math.abs(target - rotation) < .15 && Math.abs(angularVelocity) < 2) ||
              time - animation.startTime > 1400) {
            spring = null;
            finishTurn(target);
            resolve(true);
            return;
          }
          animation.frame = requestAnimationFrame(tick);
        };
        animation.frame = requestAnimationFrame(tick);
      });
    }

    function resetNoteGridPosition() {
      // Older WebViews may scroll overflow:hidden while focusing an edge note.
      if (grid.scrollLeft !== 0) grid.scrollLeft = 0;
      if (grid.scrollTop !== 0) grid.scrollTop = 0;
    }

    function releasePointer() {
      if (!pointer) return;
      const id = pointer.id;
      pointer = null;
      if (flight.hasPointerCapture?.(id)) flight.releasePointerCapture(id);
    }

    function finishClose(restoreFocus = true) {
      const returnFocus = activeTrigger;
      nextOperation();
      releasePointer();
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
      if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resetNoteGridPosition();
    }

    function requestOpen(trigger, instant = false) {
      if (state !== 'idle' || dialog.hasAttribute('open')) return;
      void openNote(trigger, instant);
    }

    function finishReading(trigger) {
      setState('reading');
      seen.add(trigger.dataset.noteId);
      trigger.classList.add('is-seen');
      if (count) count.textContent = `已打开 ${seen.size} / ${triggers.length}`;
      flight.style.willChange = '';
      flight.focus({ preventScroll: true });
    }

    async function openNote(trigger, instant = false) {
      resetNoteGridPosition();
      const sourceRect = trigger.getBoundingClientRect();
      const sourceWidth = trigger.offsetWidth || sourceRect.width;
      const sourceHeight = trigger.offsetHeight || sourceRect.height;
      const angle = Number.parseFloat(trigger.dataset.angle || '0') || 0;
      const [front] = messageById.get(trigger.dataset.noteId);
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
      frontText.id = 'note-front-text';
      frontText.setAttribute('role', 'heading');
      frontText.setAttribute('aria-level', '2');
      frontSmall.id = 'note-front-small';
      backText.id = 'note-back-text';
      flight.style.setProperty('--note-tint', getComputedStyle(trigger).getPropertyValue('--note-tint').trim() || 'none');
      dialog.setAttribute('aria-label', front);
      dialog.classList.toggle('is-reduced-motion', reducedMotion.matches);
      flipper.style.transition = 'none';
      flipper.style.opacity = '1';
      finishTurn(0);
      flight.style.transition = 'none';
      flight.style.transform = 'none';
      flight.style.opacity = reducedMotion.matches ? '0' : '1';
      flight.style.willChange = reducedMotion.matches ? 'opacity' : 'transform';
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
      const centerRect = flight.getBoundingClientRect();
      const dx = sourceRect.left + sourceRect.width / 2 - centerRect.left - centerRect.width / 2;
      const dy = sourceRect.top + sourceRect.height / 2 - centerRect.top - centerRect.height / 2;
      const sx = sourceWidth / (flight.offsetWidth || centerRect.width || 1);
      const sy = sourceHeight / (flight.offsetHeight || centerRect.height || 1);
      sourceTransform = `translate3d(${dx}px, ${dy}px, 0) rotate(${angle}deg) scale(${sx}, ${sy})`;
      flight.style.transform = reducedMotion.matches ? 'none' : sourceTransform;
      trigger.style.visibility = 'hidden';
      trigger.setAttribute('aria-expanded', 'true');
      if (instant) {
        flight.style.transform = 'none';
        flight.style.opacity = '1';
        finishReading(trigger);
        return;
      }
      void flight.getBoundingClientRect();
      if (!await nextFrame(token)) return;
      flight.style.transition = reducedMotion.matches ? 'opacity 150ms linear' : `transform 260ms ${ease}`;
      flight.style.transform = 'none';
      flight.style.opacity = '1';
      if (!await waitTransition(flight, reducedMotion.matches ? 'opacity' : 'transform',
        reducedMotion.matches ? 150 : 260, token)) return;
      // Clicking only extracts the note. Its complete front remains visible.
      finishReading(trigger);
    }

    async function closeNote(instant = false) {
      if (state === 'idle' || state === 'returning') return;
      if (instant) {
        finishClose();
        return;
      }
      const token = nextOperation();
      releasePointer();
      setState('returning');
      flight.style.willChange = reducedMotion.matches ? 'opacity' : 'transform';
      if (!reducedMotion.matches) {
        flipper.style.transition = `transform 160ms ${ease}`;
        rotation = Math.round(rotation / 360) * 360;
        renderRotation();
        if (!await waitTransition(flipper, 'transform', 160, token)) return;
      }
      flipper.style.transition = 'none';
      finishTurn(0);
      flight.style.transition = reducedMotion.matches ? 'opacity 150ms linear' : `transform 260ms ${ease}`;
      flight.style.transform = reducedMotion.matches ? 'none' : sourceTransform;
      flight.style.opacity = reducedMotion.matches ? '0' : '1';
      if (!await waitTransition(flight, reducedMotion.matches ? 'opacity' : 'transform',
        reducedMotion.matches ? 150 : 260, token)) return;
      finishClose();
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
        startRotation: rotation, startRest: resumeTarget, resumeVelocity: angularVelocity,
        lastTime: event.timeStamp, velocity: 0, distance: 0, dragged: false,
        degreesPerPixel: 180 / Math.max(120, flight.offsetWidth * .75),
      };
      flight.setPointerCapture(event.pointerId);
      setState('dragging');
      flipper.style.willChange = reducedMotion.matches ? '' : 'transform';
    });

    flight.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.startX;
      const dt = event.timeStamp - pointer.lastTime;
      pointer.distance = dx;
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
    if (dimmer) dimmer.addEventListener('click', (event) => void closeNote(event.detail === 0));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) void closeNote();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finishClose();
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open && state !== 'idle') finishClose();
    });
    dialog.addEventListener('keydown', (event) => {
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
        finishClose();
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
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const onMotionChange = () => {
      if (state !== 'idle') finishClose();
      dialog.classList.toggle('is-reduced-motion', reducedMotion.matches);
    };
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', onMotionChange);
    else reducedMotion.addListener(onMotionChange);
    window.addEventListener('pagehide', () => {
      if (state !== 'idle') finishClose(false);
    });
    setState('idle');
    if (count) count.textContent = `已打开 0 / ${triggers.length}`;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
