import { zoomState } from '../lib/photo-zoom.mjs';
const dialog = document.querySelector<HTMLDialogElement>('.photo-lightbox');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-gallery-photo]'));
const image = dialog?.querySelector<HTMLImageElement>('.lightbox-photo');
const stage = dialog?.querySelector<HTMLElement>('.lightbox-stage');
if (dialog && image && stage) {
  let index = 0, state = { scale: 1, x: 0, y: 0 }, oldOverflow = '';
  const pointers = new Map<number, { x: number; y: number }>();
  let swipeX = 0, swiping = false;
  const draw = () => {
    image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    stage.dataset.zoomed = String(state.scale > 1);
    dialog.querySelector('[data-zoom-level]')!.textContent = `${state.scale.toFixed(1)}×`;
    dialog.querySelector<HTMLButtonElement>('[data-zoom-out]')!.disabled = state.scale <= 1;
    dialog.querySelector<HTMLButtonElement>('[data-zoom-in]')!.disabled = state.scale >= 4;
  };
  const reset = () => { state = { scale: 1, x: 0, y: 0 }; pointers.clear(); swiping = false; draw(); };
  function zoom(scale: number, anchor = { x: 0, y: 0 }) {
    const viewport = stage!.getBoundingClientRect();
    const fit = Math.min(viewport.width / (image!.naturalWidth || 1), viewport.height / (image!.naturalHeight || 1));
    state = zoomState(state, scale, anchor, viewport, { width: image!.naturalWidth * fit, height: image!.naturalHeight * fit });
    draw();
  }
  const show = (next: number) => {
    index = (next + links.length) % links.length;
    reset(); image.src = links[index].href;
    image.alt = links[index].querySelector('img')?.alt || '';
    const original = dialog.querySelector<HTMLAnchorElement>('[data-original]')!;
    original.href = links[index].dataset.original || links[index].href;
    dialog.querySelector('[data-counter]')!.textContent = `${index + 1} / ${links.length}`;
  };
  links.forEach((link, i) => link.addEventListener('click', event => {
    event.preventDefault(); oldOverflow = document.body.style.overflow; show(i);
    dialog.showModal(); document.body.style.overflow = 'hidden';
  }));
  // A touch tap after a pinch may omit the synthetic click in mobile browsers.
  // Handle its pointer release directly, and ignore only the duplicate mouse click.
  function control(selector: string, action: () => void) {
    const button = dialog!.querySelector<HTMLButtonElement>(selector);
    let lastTouch = -Infinity;
    button?.addEventListener('pointerup', event => {
      if (event.pointerType === 'touch' && !button.disabled) { lastTouch = performance.now(); action(); }
    });
    button?.addEventListener('click', event => {
      if (event.detail === 0 || performance.now() - lastTouch > 500) action();
    });
  }
  control('[data-close]', () => dialog.close());
  control('[data-prev]', () => show(index - 1));
  control('[data-next]', () => show(index + 1));
  control('[data-zoom-in]', () => zoom(state.scale + .5));
  control('[data-zoom-out]', () => zoom(state.scale - .5));
  control('[data-fit]', reset);
  dialog.addEventListener('close', () => { reset(); document.body.style.overflow = oldOverflow; links[index]?.focus(); });
  dialog.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', '+', '=', '-', '_'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
    if (event.key === '+' || event.key === '=') zoom(state.scale + .5);
    if (event.key === '-' || event.key === '_') zoom(state.scale - .5);
  });
  const anchor = (x: number, y: number) => {
    const box = stage.getBoundingClientRect(); return { x: x - box.left - box.width / 2, y: y - box.top - box.height / 2 };
  };
  stage.addEventListener('wheel', event => { event.preventDefault(); zoom(state.scale * Math.exp(-event.deltaY * .002), anchor(event.clientX, event.clientY)); }, { passive: false });
  stage.addEventListener('dblclick', event => { event.preventDefault(); zoom(state.scale > 1 ? 1 : 2, anchor(event.clientX, event.clientY)); });
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) { swipeX = event.clientX; swiping = state.scale === 1 && event.pointerType === 'touch'; }
    else swiping = false;
  });
  stage.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.values()];
    if (before.length === 2) {
      const distance = (points: typeof before) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const center = (points: typeof before) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const old = center(before), now = center(after);
      zoom(state.scale * distance(after) / Math.max(1, distance(before)), anchor(old.x, old.y));
      state.x += now.x - old.x; state.y += now.y - old.y; zoom(state.scale);
    } else if (before.length === 1 && state.scale > 1) {
      state.x += event.clientX - previous.x; state.y += event.clientY - previous.y; zoom(state.scale);
    }
  });
  stage.addEventListener('pointerup', event => {
    if (!pointers.has(event.pointerId)) return;
    const delta = event.clientX - swipeX;
    const turn = swiping && pointers.size === 1 && Math.abs(delta) > 60;
    pointers.delete(event.pointerId); swiping = false;
    if (turn) show(index + (delta < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { pointers.clear(); swiping = false; });
  stage.addEventListener('lostpointercapture', event => { pointers.delete(event.pointerId); });
  window.addEventListener('resize', () => { if (dialog.open) reset(); });
  image.addEventListener('load', () => zoom(state.scale));
}
