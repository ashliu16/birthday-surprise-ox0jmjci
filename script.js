(() => {
  'use strict';

  const init = () => {
    const grid = document.getElementById('note-grid');
    const dialog = document.getElementById('note-dialog');
    const flight = document.getElementById('note-flight');
    const flipper = document.getElementById('note-flipper');
    const frontText = document.getElementById('note-front-text');
    const backText = document.getElementById('note-back-text');
    const closeButton = document.getElementById('note-close');
    const againButton = document.getElementById('note-again');
    const dimmer = document.getElementById('note-dimmer');
    const count = document.getElementById('note-count');
    if (!grid || !dialog || !flight || !flipper || !frontText || !backText ||
        !closeButton || !againButton) return;

    const triggers = [...grid.querySelectorAll('button.note-trigger[data-note-id]')];
    const messages = [
      ['生日快乐呀', '新的一岁，\n有喜欢的人和事，\n也有小小的好运。', '生日\n快乐呀'],
      ['开心多一点', '今天的快乐不用省。\n蛋糕可以再来一块，\n笑也可以大声一点。', '开心\n多一点'],
      ['愿望都成真', '大愿望慢慢实现，\n小愿望今天就满足。\n先吃喜欢的蛋糕。', '愿望\n都成真'],
      ['今天你最大', '寿星说了算。\n带草莓的那块，\n给我留一口好不好？', '今天\n你最大'],
      ['蛋糕管够', '友情提示：\n生日当天的快乐，\n不用计算热量。', '蛋糕\n管够'],
      ['烦恼先休假', '烦恼先放到明天。\n明天到了再商量：\n能不能继续放假？', '烦恼\n先休假'],
      ['吃好玩好', '这不是敷衍。\n吃好、睡好，\n笑得开心，\n就是很认真的祝福。', '吃好\n玩好'],
      ['被爱包围', '不用每天闪闪发光。\n有人记得你，\n也有人惦记你。\n普通的你，\n也值得被喜欢。', '被爱\n包围'],
    ];
    const messageById = new Map();
    triggers.forEach((trigger, index) => {
      const message = messages[index % messages.length];
      messageById.set(trigger.dataset.noteId, message);
      const label = trigger.querySelector('.note-label');
      if (label) label.textContent = message[2] || message[0];
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
    let lastRequestedTrigger = null;
    let originalVisibility = '';
    let originalBodyOverflow = '';
    let sourceTransform = 'none';
    let fallbackDialog = false;

    function setState(next) {
      state = next;
      dialog.dataset.state = next;
      againButton.disabled = next !== 'reading';
    }

    function nextOperation() {
      operation += 1;
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
        // Covers zero-distance transitions, reduced motion, and WebView quirks.
        timer = window.setTimeout(finish, duration + 60);
        if (!current(token)) finish();
      });
    }

    function nextFrame(token) {
      return new Promise((resolve) => {
        requestAnimationFrame(() => resolve(current(token)));
      });
    }

    function updateCount() {
      if (count) count.textContent = `已打开 ${seen.size} / ${triggers.length}`;
    }

    function resetNoteGridPosition() {
      // overflow:hidden can be scrolled by focus in older WebViews even without
      // visible scrollbars. The clipped paper arrangement must remain anchored.
      if (grid.scrollLeft !== 0) grid.scrollLeft = 0;
      if (grid.scrollTop !== 0) grid.scrollTop = 0;
    }

    function restoreSource() {
      if (!activeTrigger) return;
      activeTrigger.style.visibility = originalVisibility;
      activeTrigger.setAttribute('aria-expanded', 'false');
    }

    function finishClose(restoreFocus = true) {
      const returnFocus = activeTrigger;
      nextOperation();
      restoreSource();
      setState('idle');
      activeTrigger = null;
      lastRequestedTrigger = null;
      flipper.style.transition = 'none';
      flipper.style.opacity = '1';
      flipper.classList.remove('is-flipped');
      flight.style.transition = 'none';
      flight.style.transform = 'none';
      flight.style.opacity = '1';
      flight.style.willChange = '';
      flipper.style.willChange = '';
      document.body.style.overflow = originalBodyOverflow;
      if (fallbackDialog) {
        grid.inert = false;
        dialog.removeAttribute('open');
      } else if (dialog.open) {
        dialog.close();
      }
      if (restoreFocus && returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
      resetNoteGridPosition();
    }

    async function flipTo(back, token) {
      if (!current(token)) return false;
      const already = flipper.classList.contains('is-flipped') === back;
      if (already) {
        flipper.style.opacity = '1';
        return true;
      }
      if (reducedMotion.matches) {
        // CSS switches the faces without rotating them in reduced-motion mode.
        flipper.style.transition = 'opacity 75ms linear';
        flipper.style.opacity = '0';
        if (!await waitTransition(flipper, 'opacity', 75, token)) return false;
        flipper.classList.toggle('is-flipped', back);
        flipper.style.opacity = '1';
        return waitTransition(flipper, 'opacity', 75, token);
      }
      flipper.style.transition = `transform 220ms ${ease}`;
      flipper.classList.toggle('is-flipped', back);
      return waitTransition(flipper, 'transform', 220, token);
    }

    function requestOpen(trigger, instant = false) {
      // Native modal makes the background inert. Repeated/synthetic clicks cannot
      // create a second flight; this records only the most recent accepted request.
      if (state !== 'idle' || dialog.hasAttribute('open')) return;
      lastRequestedTrigger = trigger;
      void openNote(lastRequestedTrigger, instant);
    }

    function finishReading(trigger) {
      setState('reading');
      seen.add(trigger.dataset.noteId);
      trigger.classList.add('is-seen');
      updateCount();
      flight.style.willChange = '';
      flipper.style.willChange = '';
      closeButton.focus({ preventScroll: true });
    }

    async function openNote(trigger, instant = false) {
      resetNoteGridPosition();
      const sourceRect = trigger.getBoundingClientRect();
      const sourceWidth = trigger.offsetWidth || sourceRect.width;
      const sourceHeight = trigger.offsetHeight || sourceRect.height;
      const angle = Number.parseFloat(trigger.dataset.angle || '0') || 0;
      const [front, back] = messageById.get(trigger.dataset.noteId);
      activeTrigger = trigger;
      originalVisibility = trigger.style.visibility;
      originalBodyOverflow = document.body.style.overflow;
      frontText.textContent = front;
      backText.textContent = back;
      flight.style.setProperty('--note-tint', getComputedStyle(trigger).getPropertyValue('--note-tint').trim() || 'none');
      dialog.setAttribute('aria-label', front);
      dialog.classList.toggle('is-reduced-motion', reducedMotion.matches);
      flipper.classList.remove('is-flipped');
      flipper.style.transition = 'none';
      flipper.style.opacity = '1';
      flight.style.transition = 'none';
      flight.style.transform = 'none';
      flight.style.opacity = reducedMotion.matches ? '0' : '1';
      flight.style.willChange = reducedMotion.matches ? 'opacity' : 'transform';
      flipper.style.willChange = reducedMotion.matches ? 'opacity' : 'transform';
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
        // Keyboard activation reveals the readable face immediately.
        flight.style.transform = 'none';
        flight.style.opacity = '1';
        flipper.classList.add('is-flipped');
        finishReading(trigger);
        return;
      }
      // Commit the source geometry before starting a retargetable CSS transition.
      void flight.getBoundingClientRect();
      if (!await nextFrame(token)) return;
      flight.style.transition = reducedMotion.matches
        ? 'opacity 150ms linear'
        : `transform 260ms ${ease}`;
      flight.style.transform = 'none';
      flight.style.opacity = '1';
      if (!await waitTransition(flight, reducedMotion.matches ? 'opacity' : 'transform',
        reducedMotion.matches ? 150 : 260, token)) return;
      setState('flipping');
      if (!await flipTo(true, token)) return;
      finishReading(trigger);
    }

    async function closeNote(instant = false) {
      if (state === 'idle') return;
      if (instant) {
        finishClose();
        return;
      }
      if (state === 'returning') return;
      const token = nextOperation();
      setState('returning');
      flight.style.willChange = reducedMotion.matches ? 'opacity' : 'transform';
      if (!await flipTo(false, token)) return;
      flight.style.transition = reducedMotion.matches
        ? 'opacity 150ms linear'
        : `transform 260ms ${ease}`;
      flight.style.transform = reducedMotion.matches ? 'none' : sourceTransform;
      flight.style.opacity = reducedMotion.matches ? '0' : '1';
      if (!await waitTransition(flight, reducedMotion.matches ? 'opacity' : 'transform',
        reducedMotion.matches ? 150 : 260, token)) return;
      finishClose();
    }

    closeButton.addEventListener('click', (event) => void closeNote(event.detail === 0));
    if (dimmer) dimmer.addEventListener('click', (event) => void closeNote(event.detail === 0));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) void closeNote();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      void closeNote(true);
    });
    dialog.addEventListener('close', () => {
      // Recover if another caller closes the dialog during an animation.
      if (!dialog.open && state !== 'idle') finishClose();
    });
    dialog.addEventListener('keydown', (event) => {
      if (fallbackDialog && event.key === 'Escape') {
        event.preventDefault();
        void closeNote(true);
      }
      if (!fallbackDialog || event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll('button')]
        .filter((button) => !button.disabled && button.getClientRects().length);
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
    againButton.addEventListener('click', async (event) => {
      if (state !== 'reading') return;
      if (event.detail === 0) return;
      const token = nextOperation();
      setState('flipping');
      if (!await flipTo(false, token)) return;
      if (!await flipTo(true, token)) return;
      setState('reading');
    });

    const onResize = () => {
      // Geometry captured before rotation/keyboard changes must never be reused.
      if (state !== 'idle') finishClose();
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
    updateCount();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
