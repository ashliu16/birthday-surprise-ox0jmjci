(() => {
  const duration = 1400;
  const assets = 'assets/';
  // Preload the tiny decorations before the first collection.
  for (const name of ['plum-blossom.webp', 'petal.webp']) {
    const image = new Image(); image.src = assets + name;
  }
  window.BirthdayCollection = {
    play({ flight, dialog, engine, facing, speed = 1 }) {
      const rect = flight.getBoundingClientRect();
      const start = { x: rect.left + rect.width * .76, y: rect.top + rect.height * .91 };
      const bloom = { x: rect.left + rect.width * .53, y: rect.top + rect.height * .42 };
      const layer = document.createElement('div');
      layer.className = 'collection-bloom'; layer.setAttribute('aria-hidden', 'true');
      dialog.append(layer); dialog.classList.add('is-collecting');
      const animations = [];
      const animate = (element, frames, options = {}) => {
        const animation = element.animate(frames, { duration, fill: 'both', ...options });
        animation.pause(); animations.push(animation); return animation;
      };
      const sprite = (className, file, x, y, size) => {
        const item = file ? new Image() : document.createElement('span');
        item.className = className;
        if (file) { item.src = assets + file; item.alt = ''; }
        Object.assign(item.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
        layer.append(item); return item;
      };
      const transform = (x, y, scale, angle = 0) => `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${angle}deg) scale(${scale})`;
      const flower = sprite('collection-flower', 'plum-blossom.webp', start.x, start.y, 34);
      const dx = bloom.x - start.x, dy = bloom.y - start.y;
      const ease = 'cubic-bezier(.37,0,.63,1)';
      animate(flower, [
        { offset: 0, opacity: 0, transform: transform(0, 0, .65) },
        { offset: .14, opacity: 0, transform: transform(0, 0, .65), easing: ease },
        { offset: .38, opacity: 1, transform: transform(dx * .72, dy * .78, .92, -6), easing: ease },
        { offset: .53, opacity: 1, transform: transform(dx, dy, 1.12, -10) },
        { offset: .65, opacity: 0, transform: transform(dx - 5, dy - 8, 1.08, -14) },
        { offset: 1, opacity: 0, transform: transform(dx - 5, dy - 8, 1.08, -14) },
      ]);
      // Five restrained petals follow different upward curves, not a radial burst.
      const paths = [[-66,-124,-58,11],[-25,-152,45,9],[32,-118,105,12],[57,-87,144,10],[-79,-76,-115,9]];
      paths.forEach(([x,y,turn,size],i) => {
        const petal = sprite('collection-petal', 'petal.webp', bloom.x, bloom.y, size);
        const delay = i * .017;
        animate(petal, [
          { offset: 0, opacity: 0, transform: transform(0,0,.8) },
          { offset: .49 + delay, opacity: 0, transform: transform(0,0,.8,turn/3) },
          { offset: .59 + delay, opacity: .92, transform: transform(x*.22,y*.18,1,turn/2), easing: ease },
          { offset: .78 + delay, opacity: .72, transform: transform(x*.72,y*.61,.96,turn), easing: ease },
          { offset: 1, opacity: 0, transform: transform(x,y,.85,turn*1.3) },
        ]);
      });
      [[-9,-9,5],[13,-24,3],[-17,-36,3]].forEach(([x,y,size],i) => {
        const glint = sprite('collection-glint', null, bloom.x+x,bloom.y+y,size);
        animate(glint,[
          {offset:0,opacity:0,transform:transform(0,0,.8)},
          {offset:.53+i*.045,opacity:0,transform:transform(0,0,.8)},
          {offset:.65+i*.045,opacity:.66,transform:transform(-3,-7,1)},
          {offset:1,opacity:0,transform:transform(-10,-23,.9)},
        ]);
      });
      animate(flight,[
        {offset:0,opacity:1,transform:'translate3d(0,0,0) scale(1)'},
        {offset:.25,opacity:1,transform:'translate3d(0,0,0) scale(1)'},
        {offset:.53,opacity:0,transform:'translate3d(-2px,-5px,0) scale(.96)'},
        {offset:1,opacity:0,transform:'translate3d(-2px,-5px,0) scale(.96)'},
      ]);
      animate(dialog.querySelector('.note-actions'),[{opacity:1},{opacity:0}],{duration:160});
      animate(dialog.querySelector('.note-dimmer'),[
        {offset:0,opacity:1},{offset:.46,opacity:1},{offset:1,opacity:0},
      ]);
      let frame, started = performance.now(), last = started, elapsed = 0, done = false, paused = false;
      let resolve;
      const finished = new Promise(r => { resolve = r; });
      function render(ms) {
        const time = Math.min(duration, Math.max(0,ms));
        animations.forEach(a => { a.currentTime = time; });
        const progress = Math.min(1, time / 720);
        const roll = .96 * (.5 - .5 * Math.cos(progress * Math.PI));
        engine?.collect(roll, facing);
        layer.dataset.progress = (time / duration).toFixed(3);
      }
      function tick(now) {
        if (done || paused) return;
        elapsed += (now-last) / speed; last = now;
        render(elapsed);
        if (elapsed >= duration) { done = true; resolve(true); return; }
        frame = requestAnimationFrame(tick);
      }
      function visibility() {
        cancelAnimationFrame(frame);
        if (!document.hidden && !done && !paused) { last=performance.now(); frame=requestAnimationFrame(tick); }
      }
      document.addEventListener('visibilitychange',visibility);
      render(0); frame=requestAnimationFrame(tick);
      return {
        finished,
        seek(ms) { paused=true; cancelAnimationFrame(frame); render(ms); },
        cancel() {
          done=true; cancelAnimationFrame(frame); resolve(false);
          document.removeEventListener('visibilitychange',visibility);
          animations.forEach(a=>a.cancel()); layer.remove(); dialog.classList.remove('is-collecting');
        },
      };
    },
  };
})();
