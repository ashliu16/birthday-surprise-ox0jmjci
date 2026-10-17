(() => {
  'use strict';
  const init = () => {
    const scene = document.querySelector('[data-card-state]');
    const card = document.getElementById('greeting-card');
    const button = document.getElementById('greeting-open');
    const art = document.getElementById('scene-art');
    if (!scene || !card || !button || !art) return;

    const notes = [...art.querySelectorAll('.note-trigger')];
    const previousDisabled = notes.map(note => note.disabled);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let fallbackTimer;
    let keyboard = false;
    notes.forEach(note => { note.disabled = true; });

    // Also guard older WebViews that do not implement inert.
    const guard = event => {
      if (scene.dataset.cardState === 'open') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    art.addEventListener('click', guard, true);
    art.addEventListener('keydown', guard, true);

    const finish = () => {
      if (scene.dataset.cardState !== 'opening') return;
      clearTimeout(fallbackTimer);
      // The hinge has carried both flaps beyond the screen; the middle never moves.
      scene.dataset.cardState = 'open';
      card.hidden = true;
      art.inert = false;
      art.removeAttribute('inert');
      art.removeAttribute('aria-hidden');
      notes.forEach((note, index) => { note.disabled = previousDisabled[index]; });
      button.setAttribute('aria-expanded', 'true');
      button.removeAttribute('aria-busy');
      art.removeEventListener('click', guard, true);
      art.removeEventListener('keydown', guard, true);
      if (keyboard) notes.find(note => !note.disabled)?.focus({ preventScroll: true });
    };

    card.addEventListener('transitionend', event => {
      if ((event.target.classList.contains('greeting-flap') && event.propertyName === 'transform') ||
          (event.target === card && event.propertyName === 'opacity')) finish();
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') keyboard = true;
    });
    button.addEventListener('pointerdown', () => { keyboard = false; }, { passive: true });
    button.addEventListener('click', () => {
      if (scene.dataset.cardState !== 'closed') return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      // Resolve the closed transform even when tapped immediately after loading.
      void card.offsetWidth;
      scene.dataset.cardState = 'opening';
      // transitionend is primary; the timer handles background tabs / old WebViews.
      const surface = reduced.matches ? card : card.querySelector('.greeting-flap');
      const duration = parseFloat(getComputedStyle(surface).transitionDuration) * 1000;
      fallbackTimer = setTimeout(finish, (Number.isFinite(duration) ? duration : 1200) + 120);
    });
    reduced.addEventListener?.('change', () => {
      if (reduced.matches) finish();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
