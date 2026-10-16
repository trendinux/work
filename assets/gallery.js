/* Case-study gallery: adds previous / next to the photo lightbox each case study already has, so an open
   photo steps through every image on the page instead of closing and reopening one at a time.
   Works with the page's own lightbox (#lightbox, .gallery-item[data-src]); it only adds to it.
   Controls: the chevrons, the left and right arrow keys, and a swipe on touch screens. */
(function () {
  var lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  var img = lightbox.querySelector('img');
  var items = Array.prototype.filter.call(document.querySelectorAll('.gallery-item'), function (el) {
    return el.getAttribute('data-src');
  });
  if (!img || items.length < 2) return;

  var css = document.createElement('style');
  css.textContent =
    '.lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;' +
    'border:1px solid rgba(255,255,255,.3);background:rgba(15,17,21,.55);color:#fff;cursor:pointer;display:flex;' +
    'align-items:center;justify-content:center;padding:0;transition:background .2s,border-color .2s}' +
    '.lightbox-nav:hover,.lightbox-nav:focus-visible{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.7);outline:none}' +
    '.lightbox-nav svg{width:22px;height:22px}' +
    '.lightbox-prev{left:24px}.lightbox-next{right:24px}' +
    '.lightbox-count{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.75);' +
    'font:12px/1 "SF Mono",ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em}' +
    '@media (max-width:720px){.lightbox-nav{top:auto;bottom:16px;transform:none;width:46px;height:46px}' +
    '.lightbox-prev{left:16px}.lightbox-next{right:16px}.lightbox-count{bottom:32px}}';
  document.head.appendChild(css);

  function button(cls, label, path) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lightbox-nav ' + cls;
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
    lightbox.appendChild(b);
    return b;
  }
  var prev = button('lightbox-prev', 'Previous image', 'M15 18l-6-6 6-6');
  var next = button('lightbox-next', 'Next image', 'M9 18l6-6-6-6');
  var count = document.createElement('div');
  count.className = 'lightbox-count';
  count.setAttribute('aria-live', 'polite');
  lightbox.appendChild(count);

  var current = 0;
  function preload(i) { var p = new Image(); p.src = items[(i + items.length) % items.length].getAttribute('data-src'); }
  function show(i) {
    current = (i + items.length) % items.length;
    var item = items[current], thumb = item.querySelector('img');
    img.src = item.getAttribute('data-src');
    img.alt = thumb ? thumb.alt : '';
    count.textContent = (current + 1) + ' / ' + items.length;
    preload(current + 1); preload(current - 1);
  }
  function isOpen() { return lightbox.classList.contains('is-open'); }

  // the page's own handler opens the lightbox; this only records which image was opened
  items.forEach(function (item, i) {
    item.addEventListener('click', function () { show(i); });
  });
  prev.addEventListener('click', function (e) { e.stopPropagation(); show(current - 1); });
  next.addEventListener('click', function (e) { e.stopPropagation(); show(current + 1); });
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
  });

  var startX = null, startY = null;
  lightbox.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }
  }, { passive: true });
  lightbox.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
    startX = startY = null;
  });
})();
