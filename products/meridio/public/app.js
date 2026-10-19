(() => {
  'use strict';
  const cards = [...document.querySelectorAll('.world-card')];
  const search = document.getElementById('world-search');
  const counter = document.getElementById('world-count');
  const empty = document.getElementById('world-empty');
  const dialog = document.getElementById('world-dialog');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogDescription = document.getElementById('dialog-description');
  const close = document.getElementById('close-dialog');
  const done = document.getElementById('dialog-done');
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  function filter() {
    const query = (search.value || '').toLocaleLowerCase().trim();
    let count = 0;
    cards.forEach((card) => {
      const visible = !query || (card.dataset.search + ' ' + card.textContent).toLocaleLowerCase().includes(query);
      card.hidden = !visible;
      if (visible) count += 1;
    });
    counter.textContent = count + (count === 1 ? ' world' : ' worlds');
    empty.hidden = count !== 0;
  }
  function openWorld(card) {
    dialogTitle.textContent = card.querySelector('h3').textContent;
    dialogDescription.textContent = card.querySelector('p').textContent;
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }
  cards.forEach((card) => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-haspopup', 'dialog');
    card.addEventListener('click', () => openWorld(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWorld(card);
      }
    });
  });
  search.addEventListener('input', filter);
  const dismiss = () => dialog.close();
  close.addEventListener('click', dismiss);
  done.addEventListener('click', dismiss);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss();
  });
})();
