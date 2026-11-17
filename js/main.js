// SPA router: #/ → project menu, #/<id> → booth editor for projects/<id>.json.
import { initEngine, openProject, closeProject } from './engine/engine.js';
import { fetchJson } from './engine/net.js';

const cardsEl = document.getElementById('menu-cards');
let catalog = null;
let openId = null;

async function loadCatalog() {
  catalog ??= (await fetchJson('projects/index.json')).projects;
  return catalog;
}

async function showMenu() {
  closeProject();
  openId = null;
  document.title = 'Booth projects';
  document.body.classList.add('menu-open');
  const projects = await loadCatalog();
  cardsEl.innerHTML = '';
  for (const p of projects) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = `#/${p.id}`;
    a.innerHTML = `<div class="thumb">${p.thumb ? `<img src="${p.thumb}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="meta"><b>${p.title}</b><span>${p.subtitle ?? ''}</span></div>`;
    cardsEl.append(a);
  }
}

async function showProject(id) {
  const projects = await loadCatalog();
  const entry = projects.find(p => p.id === id);
  if (!entry) { location.hash = '#/'; return; }
  if (openId === id) return;
  openId = id;
  document.body.classList.remove('menu-open');
  const project = await fetchJson(entry.file);
  if (openId !== id) return;          // user navigated away while loading
  await openProject(project);
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  (id ? showProject(id) : showMenu()).catch(err => console.error('[app]', err));
}

document.getElementById('go-projects').onclick = () => { location.hash = '#/'; };
window.addEventListener('hashchange', route);
initEngine().then(route);
