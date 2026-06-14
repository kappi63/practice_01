'use strict';

// ── カテゴリ定義 ──
const CATEGORIES = [
  '床と壁',
  '壁と天井',
  '壁と開口部',
  '床と開口部',
  '外壁と屋根',
  '基礎と外壁',
  '柱と梁',
  'その他',
];

const CAT_COLOR = idx => `cat-${idx % 8}`;

function catIndex(name) {
  const i = CATEGORIES.indexOf(name);
  return i === -1 ? 7 : i;
}

// ── State ──
let details = [];
let filterCategory = 'all';
let filterTag = '';
let searchQuery = '';
let isListView = false;
let editingId = null;
let editTags = [];
let imageMode = 'upload'; // 'upload' | 'url'

// ── Storage ──
const STORAGE_KEY = 'detail_app_v1';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    details = raw ? JSON.parse(raw) : [];
  } catch {
    details = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Computed ──
function filtered() {
  let list = details;
  if (filterCategory !== 'all') {
    list = list.filter(d => d.category === filterCategory);
  }
  if (filterTag) {
    list = list.filter(d => d.tags && d.tags.includes(filterTag));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.tags && d.tags.some(t => t.toLowerCase().includes(q))) ||
      (d.memo && d.memo.toLowerCase().includes(q))
    );
  }
  return list;
}

function allTags() {
  const set = new Set();
  details.forEach(d => (d.tags || []).forEach(t => set.add(t)));
  return [...set].sort();
}

function categoryCounts() {
  const map = {};
  details.forEach(d => {
    map[d.category] = (map[d.category] || 0) + 1;
  });
  return map;
}

// ── Render ──
function render() {
  renderSidebar();
  renderCards();
}

function renderSidebar() {
  const counts = categoryCounts();
  const totalFiltered = filterCategory === 'all' ? details.length : (counts[filterCategory] || 0);

  const catList = document.getElementById('categoryList');
  catList.innerHTML = `
    <li class="${filterCategory === 'all' ? 'active' : ''}" data-cat="all">
      すべて
      <span class="category-count">${details.length}</span>
    </li>
    ${CATEGORIES.map(c => `
      <li class="${filterCategory === c ? 'active' : ''}" data-cat="${c}">
        <span style="flex:1;word-break:break-all;">${c}</span>
        <span class="category-count">${counts[c] || 0}</span>
      </li>
    `).join('')}
  `;
  catList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      filterCategory = li.dataset.cat;
      filterTag = '';
      render();
    });
  });

  const tags = allTags();
  const tagCloud = document.getElementById('tagCloud');
  if (tags.length === 0) {
    tagCloud.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">タグなし</span>';
  } else {
    tagCloud.innerHTML = tags.map(t => `
      <span class="tag-cloud-item ${filterTag === t ? 'active' : ''}" data-tag="${t}">${t}</span>
    `).join('');
    tagCloud.querySelectorAll('.tag-cloud-item').forEach(el => {
      el.addEventListener('click', () => {
        filterTag = filterTag === el.dataset.tag ? '' : el.dataset.tag;
        render();
      });
    });
  }
}

function renderCards() {
  const list = filtered();
  const grid = document.getElementById('cardGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('resultCount');

  count.textContent = `${list.length} 件`;

  if (list.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = details.length === 0
      ? 'ディテールがまだ登録されていません'
      : '条件に一致するディテールがありません';
  } else {
    grid.style.display = '';
    empty.style.display = 'none';
  }

  grid.innerHTML = list.map(d => {
    const ci = catIndex(d.category);
    const imageHtml = d.image
      ? `<div class="card-image"><img src="${d.image}" alt="" loading="lazy" /></div>`
      : `<div class="card-image no-image" style="background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:36px;">📐</div>`;
    const tagsHtml = (d.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    return `
      <div class="card" data-id="${d.id}">
        ${imageHtml}
        <div class="card-body">
          <span class="card-category ${CAT_COLOR(ci)}">${d.category}</span>
          <div class="card-title">${escHtml(d.title)}</div>
          ${d.memo ? `<div class="card-memo">${escHtml(d.memo)}</div>` : ''}
          ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openViewModal(card.dataset.id));
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Edit Modal ──
function switchImageTab(mode) {
  imageMode = mode;
  document.getElementById('tabUpload').classList.toggle('active', mode === 'upload');
  document.getElementById('tabUrl').classList.toggle('active', mode === 'url');
  document.getElementById('panelUpload').style.display = mode === 'upload' ? '' : 'none';
  document.getElementById('panelUrl').style.display = mode === 'url' ? '' : 'none';
}

function openAddModal() {
  editingId = null;
  editTags = [];
  document.getElementById('modalTitle').textContent = 'ディテールを追加';
  document.getElementById('fTitle').value = '';
  document.getElementById('fCategory').value = '';
  document.getElementById('fMemo').value = '';
  clearImagePreview();
  clearUrlPreview();
  switchImageTab('upload');
  renderTagChips();
  document.getElementById('editModal').style.display = 'flex';
}

function openEditModal(id) {
  const d = details.find(x => x.id === id);
  if (!d) return;
  editingId = id;
  editTags = [...(d.tags || [])];
  document.getElementById('modalTitle').textContent = 'ディテールを編集';
  document.getElementById('fTitle').value = d.title;
  document.getElementById('fCategory').value = d.category;
  document.getElementById('fMemo').value = d.memo || '';
  clearImagePreview();
  clearUrlPreview();
  if (d.image) {
    if (d.imageMode === 'url') {
      switchImageTab('url');
      document.getElementById('fImageUrl').value = d.image;
      setUrlPreview(d.image);
    } else {
      switchImageTab('upload');
      setImagePreview(d.image);
    }
  } else {
    switchImageTab('upload');
  }
  renderTagChips();
  closeViewModal();
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  editingId = null;
  editTags = [];
}

// ── View Modal ──
function openViewModal(id) {
  const d = details.find(x => x.id === id);
  if (!d) return;
  const ci = catIndex(d.category);

  const badge = document.getElementById('viewCategory');
  badge.textContent = d.category;
  badge.className = `view-category-badge ${CAT_COLOR(ci)}`;

  document.getElementById('viewTitle').textContent = d.title;

  const imgWrap = document.getElementById('viewImageWrap');
  if (d.image) {
    document.getElementById('viewImage').src = d.image;
    imgWrap.style.display = '';
  } else {
    imgWrap.style.display = 'none';
  }

  document.getElementById('viewTags').innerHTML =
    (d.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

  document.getElementById('viewMemo').textContent = d.memo || '（メモなし）';

  const date = new Date(d.createdAt);
  document.getElementById('viewDate').textContent =
    `登録日: ${date.toLocaleDateString('ja-JP')}`;

  document.getElementById('deleteBtn').onclick = () => deleteDetail(id);
  document.getElementById('editFromViewBtn').onclick = () => openEditModal(id);

  document.getElementById('viewModal').style.display = 'flex';
}

function closeViewModal() {
  document.getElementById('viewModal').style.display = 'none';
}

function deleteDetail(id) {
  if (!confirm('このディテールを削除しますか？')) return;
  details = details.filter(d => d.id !== id);
  save();
  closeViewModal();
  render();
}

// ── Save ──
function saveDetail() {
  const title = document.getElementById('fTitle').value.trim();
  const category = document.getElementById('fCategory').value;
  if (!title) { alert('タイトルを入力してください'); return; }
  if (!category) { alert('部位カテゴリを選択してください'); return; }

  let image = '';
  if (imageMode === 'upload') {
    const prev = document.getElementById('imagePreview');
    image = prev.style.display !== 'none' ? prev.src : '';
  } else {
    const urlPrev = document.getElementById('urlPreview');
    image = urlPrev.style.display !== 'none' ? urlPrev.src : '';
  }
  const memo = document.getElementById('fMemo').value.trim();

  if (editingId) {
    const d = details.find(x => x.id === editingId);
    Object.assign(d, { title, category, image, imageMode, memo, tags: [...editTags] });
  } else {
    details.unshift({ id: genId(), title, category, image, imageMode, memo, tags: [...editTags], createdAt: Date.now() });
  }

  save();
  closeEditModal();
  render();
}

// ── Image upload ──
function setImagePreview(src) {
  const img = document.getElementById('imagePreview');
  img.src = src;
  img.style.display = '';
  document.getElementById('uploadPlaceholder').style.display = 'none';
  document.getElementById('removeImageBtn').style.display = '';
}

function clearImagePreview() {
  const img = document.getElementById('imagePreview');
  img.src = '';
  img.style.display = 'none';
  document.getElementById('uploadPlaceholder').style.display = '';
  document.getElementById('removeImageBtn').style.display = 'none';
  document.getElementById('fImage').value = '';
}

function handleFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => setImagePreview(e.target.result);
  reader.readAsDataURL(file);
}

// ── URL image ──
function setUrlPreview(url) {
  const img = document.getElementById('urlPreview');
  const wrap = document.getElementById('urlPreviewWrap');
  const errEl = document.getElementById('urlError');
  const removeBtn = document.getElementById('removeUrlBtn');
  img.style.display = 'none';
  errEl.style.display = 'none';
  removeBtn.style.display = 'none';
  wrap.style.display = '';
  img.onload = () => {
    img.style.display = '';
    removeBtn.style.display = '';
    errEl.style.display = 'none';
  };
  img.onerror = () => {
    img.style.display = 'none';
    errEl.style.display = '';
    removeBtn.style.display = 'none';
  };
  img.src = url;
}

function clearUrlPreview() {
  document.getElementById('fImageUrl').value = '';
  document.getElementById('urlPreviewWrap').style.display = 'none';
  document.getElementById('urlPreview').src = '';
  document.getElementById('urlError').style.display = 'none';
  document.getElementById('removeUrlBtn').style.display = 'none';
}

// ── Tag chips ──
function renderTagChips() {
  const container = document.getElementById('tagChips');
  container.innerHTML = editTags.map((t, i) => `
    <span class="tag-chip">
      ${escHtml(t)}
      <button type="button" class="tag-chip-remove" data-i="${i}">×</button>
    </span>
  `).join('');
  container.querySelectorAll('.tag-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      editTags.splice(Number(btn.dataset.i), 1);
      renderTagChips();
    });
  });
}

// ── Init ──
function init() {
  load();
  render();

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    render();
  });

  // Add button
  document.getElementById('addBtn').addEventListener('click', openAddModal);
  document.getElementById('emptyAddBtn').addEventListener('click', openAddModal);

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeEditModal);
  document.getElementById('cancelBtn').addEventListener('click', closeEditModal);
  document.getElementById('saveBtn').addEventListener('click', saveDetail);

  // View modal close
  document.getElementById('viewClose').addEventListener('click', closeViewModal);
  document.getElementById('viewClose2').addEventListener('click', closeViewModal);

  // Click outside to close
  document.getElementById('editModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  document.getElementById('viewModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeViewModal();
  });

  // View toggle
  document.getElementById('gridViewBtn').addEventListener('click', () => {
    isListView = false;
    document.getElementById('gridViewBtn').classList.add('active');
    document.getElementById('listViewBtn').classList.remove('active');
    document.getElementById('cardGrid').classList.remove('list-view');
  });
  document.getElementById('listViewBtn').addEventListener('click', () => {
    isListView = true;
    document.getElementById('listViewBtn').classList.add('active');
    document.getElementById('gridViewBtn').classList.remove('active');
    document.getElementById('cardGrid').classList.add('list-view');
  });

  // Image upload
  const uploadArea = document.getElementById('imageUploadArea');
  uploadArea.addEventListener('click', e => {
    if (e.target.closest('.remove-image-btn')) return;
    document.getElementById('fImage').click();
  });
  document.getElementById('fImage').addEventListener('change', e => {
    handleFileSelect(e.target.files[0]);
  });
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files[0]);
  });
  document.getElementById('removeImageBtn').addEventListener('click', clearImagePreview);

  // Image tabs
  document.getElementById('tabUpload').addEventListener('click', () => switchImageTab('upload'));
  document.getElementById('tabUrl').addEventListener('click', () => switchImageTab('url'));

  // URL load
  document.getElementById('loadUrlBtn').addEventListener('click', () => {
    const url = document.getElementById('fImageUrl').value.trim();
    if (!url) return;
    setUrlPreview(url);
  });
  document.getElementById('fImageUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const url = e.target.value.trim();
      if (url) setUrlPreview(url);
    }
  });
  document.getElementById('removeUrlBtn').addEventListener('click', clearUrlPreview);

  // Tag input
  document.getElementById('fTagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val && !editTags.includes(val)) {
        editTags.push(val);
        renderTagChips();
      }
      e.target.value = '';
    }
  });

  // Form submit prevention
  document.getElementById('detailForm').addEventListener('submit', e => e.preventDefault());

  // Load sample data if empty
  if (details.length === 0) loadSamples();
}

function loadSamples() {
  const samples = [
    {
      id: genId(),
      title: 'GL壁と床の取り合い（幅木あり）',
      category: '床と壁',
      image: '',
      memo: 'フローリングとGL壁の取り合い。幅木H=60mm を設置。\n床材: フローリング t=12\n壁仕上げ: GL工法 + クロス張り',
      tags: ['木造', 'クロス', '幅木'],
      createdAt: Date.now() - 86400000 * 3,
    },
    {
      id: genId(),
      title: '天井廻り縁（和室）',
      category: '壁と天井',
      image: '',
      memo: '和室の壁と天井の取り合い。廻り縁 30×40 を設置。\n天井: 竿縁天井\n壁: 聚楽壁',
      tags: ['木造', '和室', '廻り縁'],
      createdAt: Date.now() - 86400000 * 2,
    },
    {
      id: genId(),
      title: 'アルミサッシ枠と外壁（防水テープ処理）',
      category: '壁と開口部',
      image: '',
      memo: '外壁開口部とアルミサッシの取り合い。透湿防水シートと防水テープで処理。\nシーリング: 変成シリコン',
      tags: ['RC造', '防水', 'サッシ'],
      createdAt: Date.now() - 86400000,
    },
  ];
  details = samples;
  save();
}

document.addEventListener('DOMContentLoaded', init);
