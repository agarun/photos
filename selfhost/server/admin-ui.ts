import { escapeHtml, escapeJsonForScript } from './views/html.ts';

// Local-only album admin UI. Assets are served separately so the page keeps
// a strict content security policy without inline script or style hashes.
// The page is served with the shared HTML CSP from http.ts/baseHeaders,
// which already allows only same-origin scripts, styles, images and fetches.

export type AdminClientPhoto = {
  path: string;
  name: string;
  favorite: boolean;
  sectionId: string;
  sectionTitle?: string;
  previewPath?: string;
};

export type AdminClientSection = {
  id: string;
  title: string;
  photos: AdminClientPhoto[];
};

export type AdminClientData = {
  title: string;
  excluded: string[];
  sections: AdminClientSection[];
  removedPhotos: AdminClientPhoto[];
};

export function renderAdminPage(data: AdminClientData): string {
  const safeTitle = escapeHtml(`${data.title} — Album Admin`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${safeTitle}</title>
<link rel="stylesheet" href="/admin.css">
</head>
<body>
<header class="pf-admin-header">
  <div>
    <h1>${escapeHtml(data.title)}</h1>
    <p class="pf-admin-hint">Drag photos within a section to reorder. Click the star to favorite. Remove hides a photo from the album but keeps the source file.</p>
  </div>
  <div class="pf-admin-actions">
    <button id="admin-sort" type="button">Sort A–Z</button>
    <button id="admin-status" type="button">Saved</button>
  </div>
</header>
<main id="admin-sections"></main>
<noscript><p class="pf-admin-noscript">This admin UI needs JavaScript.</p></noscript>
<script id="admin-data" type="application/json">${escapeJsonForScript(data)}</script>
<script src="/admin.js"></script>
</body>
</html>
`;
}

export const ADMIN_CSS = `
:root {
  color-scheme: light dark;
  --line: #d8d5cf;
  --ink: #1c1b18;
  --muted: #6f6b63;
  --accent: #b3541e;
  --surface: #faf9f7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --line: #3a3833;
    --ink: #eceae6;
    --muted: #a09c94;
    --surface: #201f1c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 72rem;
  padding: 0 1.25rem 4rem;
  font-family: system-ui, sans-serif;
  background: var(--surface);
  color: var(--ink);
}
body.pf-admin-dragging { user-select: none; cursor: grabbing; }
.pf-admin-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1.25rem 0 0.75rem;
  border-bottom: 1px solid var(--line);
}
.pf-admin-header h1 { margin: 0; font-size: 1.25rem; }
.pf-admin-hint { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.85rem; }
#admin-status {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
#admin-sort {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.pf-admin-actions { display: flex; align-items: center; gap: 0.5rem; }
#admin-status.is-saving { color: var(--muted); }
#admin-status.is-error { color: var(--accent); border-color: var(--accent); }
.pf-admin-section { margin-top: 2rem; }
.pf-admin-section h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.pf-admin-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.75rem;
  min-height: 1rem;
}
.pf-admin-list li {
  position: relative;
  margin: 0;
  padding: 0.35rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: transparent;
  cursor: grab;
  touch-action: none;
}
.pf-admin-list li.pf-admin-placeholder {
  min-height: 12rem;
  background: color-mix(in srgb, var(--line) 12%, transparent);
  cursor: default;
}
.pf-admin-list li.is-dragging { opacity: 0.45; cursor: grabbing; }
.pf-admin-list li.drop-before { box-shadow: -3px 0 0 0 var(--accent); }
.pf-admin-list li.drop-after { box-shadow: 3px 0 0 0 var(--accent); }
.pf-admin-list img {
  display: block;
  width: 100%;
  height: 7.5rem;
  object-fit: cover;
  border-radius: 0.25rem;
  pointer-events: none;
}
.pf-admin-image-link {
  display: block;
  cursor: zoom-in;
}
.pf-admin-name {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.pf-admin-star {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  font-size: 1.05rem;
  line-height: 1;
  padding: 0.25rem 0.4rem;
  border: none;
  border-radius: 0.3rem;
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}
.pf-admin-star:hover { background: rgba(0, 0, 0, 0.65); }
li.is-favorite .pf-admin-star { color: #ffd24a; }
.pf-admin-remove {
  display: block;
  width: 100%;
  margin-top: 0.45rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.pf-admin-remove:hover { color: var(--accent); border-color: var(--accent); }
.pf-admin-restore:hover { color: #2f7d4a; border-color: #2f7d4a; }
li.is-favorite::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px solid #ffd24a;
  border-radius: 0.4rem;
  pointer-events: none;
}
.pf-admin-noscript { color: var(--accent); }
`.trimStart();

export const ADMIN_JS = `
(function () {
  'use strict';

  var dataElement = document.getElementById('admin-data');
  var container = document.getElementById('admin-sections');
  var sortButton = document.getElementById('admin-sort');
  var statusButton = document.getElementById('admin-status');
  if (!dataElement || !container || !sortButton || !statusButton) {
    throw new Error('Admin page is missing required elements.');
  }
  var data = JSON.parse(dataElement.textContent || '{}');
  var excluded = new Set(data.excluded || []);
  var favoritePaths = new Set();
  var photosByPath = new Map();
  function registerPhoto(photo) {
    photosByPath.set(photo.path, photo);
    if (photo.favorite) favoritePaths.add(photo.path);
  }
  (data.sections || []).forEach(function (section) {
    (section.photos || []).forEach(function (photo) {
      registerPhoto(photo);
    });
  });
  (data.removedPhotos || []).forEach(registerPhoto);

  var cardObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function (entries, observer) {
            entries.forEach(function (entry) {
              var card = entry.target;
              var photo = photosByPath.get(card.dataset.path);
              if (!photo) return;
              if (entry.isIntersecting) {
                hydrateCard(card, photo);
              } else {
                unhydrateCard(card);
              }
            });
          },
          { rootMargin: '800px 0px' }
        )
      : null;

  var draggedItem = null;
  var pointerDrag = null;
  var dropList = null;
  var dropIndex = null;
  var indicator = null;
  var saveTimer = 0;
  var saving = false;
  var pending = false;
  var autoScrollFrame = 0;

  function encodedMediaUrl(prefix, path) {
    var segments = path.split('/');
    for (var index = 0; index < segments.length; index += 1) {
      segments[index] = encodeURIComponent(segments[index]);
    }
    return prefix + segments.join('/');
  }

  function mediaUrl(photo) {
    return encodedMediaUrl(
      photo.previewPath ? '/preview/' : '/media/',
      photo.previewPath || photo.path
    );
  }

  function setStatus(text, state) {
    statusButton.textContent = text;
    statusButton.classList.toggle('is-saving', state === 'saving');
    statusButton.classList.toggle('is-error', state === 'error');
    statusButton.setAttribute(
      'aria-label',
      state === 'error' ? 'Save failed. Click to retry.' : 'Save changes now'
    );
  }

  function scheduleSave() {
    setStatus('Unsaved changes…', 'saving');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 400);
  }

  function save() {
    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    setStatus('Saving…', 'saving');
    var order = [];
    var favorites = [];
    document.querySelectorAll('.pf-admin-list li[data-path]').forEach(
      function (card) {
        var path = card.dataset.path;
        if (!path || card.dataset.removed === 'true') return;
        order.push(path);
        if (favoritePaths.has(path)) favorites.push(path);
      }
    );
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: order,
        favorites: favorites,
        excluded: Array.from(excluded)
      })
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        setStatus('Saved ✓', 'idle');
      })
      .catch(function () {
        setStatus('Save failed ✕', 'error');
      })
      .finally(function () {
        saving = false;
        if (pending) {
          pending = false;
          scheduleSave();
        }
      });
  }

  statusButton.addEventListener('click', function () {
    window.clearTimeout(saveTimer);
    save();
  });

  function clearIndicator() {
    if (!indicator) return;
    indicator.element.classList.remove('drop-before', 'drop-after');
    indicator = null;
  }

  function setIndicator(element, className) {
    if (
      indicator &&
      indicator.element === element &&
      indicator.className === className
    ) {
      return;
    }
    clearIndicator();
    if (!element) return;
    element.classList.add(className);
    indicator = { element: element, className: className };
  }

  function orderedCards(list) {
    var items = [];
    list.querySelectorAll('li[data-path]').forEach(function (card) {
      if (card !== draggedItem) items.push(card);
    });
    return items;
  }

  function insertionIndex(list, x, y) {
    var items = orderedCards(list);
    if (items.length === 0) return 0;

    var target = document.elementFromPoint(x, y);
    while (target && target !== document.body) {
      if (
        target.tagName === 'LI' &&
        target.dataset.path &&
        target.parentElement === list
      ) {
        var targetIndex = items.indexOf(target);
        if (targetIndex !== -1) {
          var targetRect = target.getBoundingClientRect();
          var targetCenterX = targetRect.left + targetRect.width / 2;
          var targetCenterY = targetRect.top + targetRect.height / 2;
          var before =
            y < targetCenterY ||
            (y <= targetRect.bottom && x < targetCenterX);
          return before ? targetIndex : targetIndex + 1;
        }
      }
      target = target.parentElement;
    }

    // If the pointer is in a gap, choose by row first. Comparing every card's
    // center globally makes the right side of a row resolve to the next row.
    var rows = [];
    for (var index = 0; index < items.length; index += 1) {
      var rect = items[index].getBoundingClientRect();
      var row = rows[rows.length - 1];
      if (!row || Math.abs(row.top - rect.top) > 2) {
        row = { top: rect.top, bottom: rect.bottom, items: [] };
        rows.push(row);
      }
      row.bottom = Math.max(row.bottom, rect.bottom);
      row.items.push({ index: index, rect: rect });
    }
    var selectedRow = rows[0];
    if (y > rows[rows.length - 1].bottom) return items.length;
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      var currentRow = rows[rowIndex];
      if (y >= currentRow.top && y <= currentRow.bottom) {
        selectedRow = currentRow;
        break;
      }
      var nextRow = rows[rowIndex + 1];
      if (nextRow && y < (currentRow.bottom + nextRow.top) / 2) {
        selectedRow = currentRow;
        break;
      }
      if (nextRow) selectedRow = nextRow;
    }
    for (var itemIndex = 0; itemIndex < selectedRow.items.length; itemIndex += 1) {
      var rowItem = selectedRow.items[itemIndex];
      if (x < rowItem.rect.left + rowItem.rect.width / 2) {
        return rowItem.index;
      }
    }
    return selectedRow.items[selectedRow.items.length - 1].index + 1;
  }

  function updateIndicator(list, x, y) {
    if (!draggedItem || !list.contains(draggedItem)) return;
    var items = orderedCards(list);
    var index = insertionIndex(list, x, y);
    dropList = list;
    dropIndex = index;
    setIndicator(
      index < items.length ? items[index] : items[items.length - 1] || null,
      index < items.length ? 'drop-before' : 'drop-after'
    );
  }

  function cardAtPoint(x, y) {
    var target = document.elementFromPoint(x, y);
    while (target && target !== document.body) {
      if (target.tagName === 'LI' && target.dataset.path) return target;
      target = target.parentElement;
    }
    return null;
  }

  function updatePointerDrop(x, y) {
    if (!pointerDrag || !draggedItem) return;
    var target = cardAtPoint(x, y);
    var list = target ? target.parentElement : pointerDrag.list;
    if (!list || list !== pointerDrag.list) {
      clearIndicator();
      dropList = null;
      dropIndex = null;
      return;
    }
    updateIndicator(list, x, y);
  }

  function autoScroll() {
    autoScrollFrame = 0;
    if (!pointerDrag || !pointerDrag.active) return;
    if (pointerDrag.scrollDirection !== 0) {
      window.scrollBy(0, pointerDrag.scrollDirection * 18);
      updatePointerDrop(pointerDrag.x, pointerDrag.y);
      autoScrollFrame = window.requestAnimationFrame(autoScroll);
    }
  }

  function updateAutoScroll(y) {
    if (!pointerDrag) return;
    var edge = 72;
    pointerDrag.scrollDirection =
      y < edge ? -1 : y > window.innerHeight - edge ? 1 : 0;
    if (pointerDrag.scrollDirection !== 0 && autoScrollFrame === 0) {
      autoScrollFrame = window.requestAnimationFrame(autoScroll);
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    var interactive = event.target.closest && event.target.closest('button, a');
    if (interactive) return;
    var card = event.currentTarget;
    pointerDrag = {
      card: card,
      list: card.parentElement,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      scrollDirection: 0
    };
  }

  function handlePointerMove(event) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    pointerDrag.x = event.clientX;
    pointerDrag.y = event.clientY;
    if (!pointerDrag.active) {
      var distance = Math.hypot(
        event.clientX - pointerDrag.startX,
        event.clientY - pointerDrag.startY
      );
      if (distance < 6) return;
      pointerDrag.active = true;
      draggedItem = pointerDrag.card;
      draggedItem.classList.add('is-dragging');
      draggedItem.style.pointerEvents = 'none';
      document.body.classList.add('pf-admin-dragging');
    }
    event.preventDefault();
    updateAutoScroll(event.clientY);
    updatePointerDrop(event.clientX, event.clientY);
  }

  function finishPointerDrag(event) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    var wasActive = pointerDrag.active;
    var item = draggedItem;
    var list = dropList;
    var index = dropIndex;
    if (wasActive && item && list === pointerDrag.list && index !== null) {
      var items = orderedCards(list);
      if (index >= items.length) list.appendChild(item);
      else list.insertBefore(item, items[index]);
      scheduleSave();
    }
    if (item) {
      item.classList.remove('is-dragging');
      item.style.pointerEvents = '';
    }
    if (autoScrollFrame !== 0) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
    }
    document.body.classList.remove('pf-admin-dragging');
    clearIndicator();
    draggedItem = null;
    dropList = null;
    dropIndex = null;
    pointerDrag = null;
  }

  document.addEventListener('pointermove', handlePointerMove, {
    passive: false
  });
  document.addEventListener('pointerup', finishPointerDrag);
  document.addEventListener('pointercancel', finishPointerDrag);

  function sortAlphabetically() {
    document.querySelectorAll('.pf-admin-list').forEach(function (list) {
      var cards = Array.from(list.querySelectorAll('li[data-path]'));
      cards
        .sort(function (left, right) {
          return (left.dataset.name || '').localeCompare(
            right.dataset.name || '',
            undefined,
            { numeric: true, sensitivity: 'base' }
          );
        })
        .forEach(function (card) {
          list.appendChild(card);
        });
    });
    scheduleSave();
  }

  sortButton.addEventListener('click', sortAlphabetically);

  function hydrateCard(card, photo) {
    if (!photo || card.dataset.hydrated === 'true') return;
    card.dataset.hydrated = 'true';
    card.classList.remove('pf-admin-placeholder');
    // Reordering is handled by pointer events below. Leaving native HTML5
    // dragging enabled causes the browser to steal the pointer stream.
    card.draggable = false;

    var image = document.createElement('img');
    image.src = mediaUrl(photo);
    image.alt = photo.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;

    var imageLink = document.createElement('a');
    imageLink.className = 'pf-admin-image-link';
    imageLink.href = encodedMediaUrl('/media/', photo.path);
    imageLink.target = '_blank';
    imageLink.rel = 'noopener';
    imageLink.title = 'Open full-size original';
    imageLink.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    imageLink.appendChild(image);

    var name = document.createElement('span');
    name.className = 'pf-admin-name';
    name.textContent = photo.name;

    card.appendChild(imageLink);
    card.appendChild(name);

    if (card.dataset.removed === 'true') {
      var restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'pf-admin-remove pf-admin-restore';
      restore.textContent = 'Restore';
      restore.setAttribute('aria-label', 'Restore ' + photo.name + ' to album');
      restore.addEventListener('click', function () {
        restorePhoto(photo, card);
      });
      card.appendChild(restore);
      return;
    }

    var star = document.createElement('button');
    star.type = 'button';
    star.className = 'pf-admin-star';
    star.textContent = '★';
    star.setAttribute('aria-pressed', String(favoritePaths.has(photo.path)));
    star.setAttribute('aria-label', 'Favorite ' + photo.name);
    if (favoritePaths.has(photo.path)) card.classList.add('is-favorite');
    star.addEventListener('click', function () {
      var active = card.classList.toggle('is-favorite');
      if (active) favoritePaths.add(photo.path);
      else favoritePaths.delete(photo.path);
      star.setAttribute('aria-pressed', String(active));
      scheduleSave();
    });

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pf-admin-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove ' + photo.name + ' from album');
    remove.addEventListener('click', function () {
      if (
        !window.confirm(
          'Remove “' + photo.name + '” from this album? The source file will be kept.'
        )
      ) {
        return;
      }
      removePhoto(photo, card);
    });

    card.appendChild(star);
    card.appendChild(remove);
  }

  function unhydrateCard(card) {
    if (card.dataset.hydrated !== 'true' || card === draggedItem) return;
    card.replaceChildren();
    card.draggable = false;
    card.classList.add('pf-admin-placeholder');
    delete card.dataset.hydrated;
  }

  function buildCard(photo, isRemoved) {
    var card = document.createElement('li');
    card.dataset.path = photo.path;
    card.dataset.name = photo.name;
    card.dataset.removed = String(Boolean(isRemoved));
    card.draggable = false;
    card.classList.add('pf-admin-placeholder');
    if (!isRemoved) {
      card.addEventListener('pointerdown', handlePointerDown);
    }
    return card;
  }

  function buildSection(section, isRemoved) {
    var wrapper = document.createElement('section');
    wrapper.className = 'pf-admin-section';
    if (isRemoved) wrapper.classList.add('pf-admin-removed-section');
    wrapper.dataset.sectionId = section.id;

    var heading = document.createElement('h2');
    heading.textContent = section.title === '' ? 'Main' : section.title;
    wrapper.appendChild(heading);

    var list = document.createElement('ul');
    list.className = 'pf-admin-list';
    (section.photos || []).forEach(function (photo) {
      list.appendChild(buildCard(photo, isRemoved));
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  function removedList() {
    var existing = container.querySelector('.pf-admin-removed-section');
    if (existing) return existing.querySelector('.pf-admin-list');
    var section = buildSection(
      { id: 'removed', title: 'Removed', photos: [] },
      true
    );
    container.appendChild(section);
    return section.querySelector('.pf-admin-list');
  }

  function activeListFor(sectionId, sectionTitle) {
    var sections = container.querySelectorAll(
      '.pf-admin-section:not(.pf-admin-removed-section)'
    );
    for (var index = 0; index < sections.length; index += 1) {
      if (sections[index].dataset.sectionId === sectionId) {
        return sections[index].querySelector('.pf-admin-list');
      }
    }
    var section = buildSection(
      { id: sectionId, title: sectionTitle || 'Main', photos: [] },
      false
    );
    var removedSection = container.querySelector('.pf-admin-removed-section');
    if (removedSection) container.insertBefore(section, removedSection);
    else container.appendChild(section);
    return section.querySelector('.pf-admin-list');
  }

  function restorePhoto(photo, card) {
    excluded.delete(photo.path);
    if (cardObserver) cardObserver.unobserve(card);
    var list = activeListFor(photo.sectionId, photo.sectionTitle);
    var restored = buildCard(photo, false);
    list.appendChild(restored);
    if (cardObserver) cardObserver.observe(restored);
    card.remove();
    var removedSection = container.querySelector('.pf-admin-removed-section');
    if (
      removedSection &&
      removedSection.querySelectorAll('li[data-path]').length === 0
    ) {
      removedSection.remove();
    }
    scheduleSave();
  }

  function removePhoto(photo, card) {
    excluded.add(photo.path);
    favoritePaths.delete(photo.path);
    if (cardObserver) cardObserver.unobserve(card);
    card.remove();
    var list = removedList();
    var removed = buildCard(photo, true);
    list.appendChild(removed);
    if (cardObserver) cardObserver.observe(removed);
    scheduleSave();
  }

  (data.sections || []).forEach(function (section) {
    container.appendChild(buildSection(section, false));
  });
  if ((data.removedPhotos || []).length > 0) {
    container.appendChild(
      buildSection(
        { id: 'removed', title: 'Removed', photos: data.removedPhotos },
        true
      )
    );
  }

  document.querySelectorAll('.pf-admin-list li[data-path]').forEach(function (card) {
    if (cardObserver) cardObserver.observe(card);
    else hydrateCard(card, photosByPath.get(card.dataset.path));
  });

  setStatus('Saved ✓', 'idle');
})();
`.trimStart();
