const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3o-C_BEGd98LSvCu8_e6RSregYM4vrau8jdbqqn4A5gCYTwoILWo-js0dz566oX7YrdDwAtsPm3xe/pub?';
const RAW_URL = BASE_URL + 'output=csv';
const URL_ITEMS = BASE_URL + 'gid=1403600136&single=true&output=csv';

// キャッシュ定数（1時間 = 3600000ms）
const CACHE_EXPIRY = 3600 * 1000;

const getCacheBuster = () => Math.floor(new Date().getTime() / (1000 * 60 * 5));

// タイムアウト付きフェッチ
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function smartFetch(url) {
  const fullUrl = url + '&t=' + getCacheBuster();
  try {
    // 5秒制限で直接フェッチを試みる（少し長めに設定）
    const res = await fetchWithTimeout(fullUrl);
    if (res.ok) return await res.text();
  } catch (e) {
    console.warn("Direct fetch failed or timed out, falling back to proxy:", e);
  }
  // 失敗/遅延時はプロキシ利用
  const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(fullUrl);
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('通信エラー');
    return await res.text();
  } catch (e) {
    console.error("Proxy fetch failed:", e);
    throw e;
  }
}

// LocalStorage キャッシュ管理
const cache = {
  set(key, data) {
    try {
      const item = { data, timestamp: Date.now() };
      localStorage.setItem(key, JSON.stringify(item));
    } catch (e) {
      console.warn("localStorage set failed:", e);
    }
  },
  get(key) {
    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;
      const item = JSON.parse(itemStr);
      if (Date.now() - item.timestamp > CACHE_EXPIRY) return null;
      return item.data;
    } catch (e) {
      console.warn("localStorage get failed:", e);
      return null;
    }
  }
};

let pokemonData = [];
const pokemonGrid = document.getElementById('pokemonGrid');
const searchName = document.getElementById('searchName');
const filterEnv = document.getElementById('filterEnv');
const favFilterContainer = document.getElementById('favFilterContainer');
const addFavFilterBtn = document.getElementById('addFavFilter');
const paginationContainer = document.getElementById('pagination');

// ページネーション用の変数▼
let currentPage = 1;
const itemsPerPage = 12;
let favoriteOptions = []; 

function updateSelectOptions(selectElement, optionsArray) {
  const currentValue = selectElement.value;
  selectElement.innerHTML = '<option value="">すべて</option>';
  optionsArray.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    selectElement.appendChild(option);
  });
  selectElement.value = currentValue;
}

function updateAllFavSelects() {
  const selects = favFilterContainer.querySelectorAll('.filter-fav');
  selects.forEach(select => updateSelectOptions(select, favoriteOptions));
}

function createFavFilterRow() {
    const row = document.createElement('div');
    row.className = 'fav-filter-row';

    const select = document.createElement('select');
    select.className = 'filter-fav';
    updateSelectOptions(select, favoriteOptions);
    select.addEventListener('change', resetAndRender);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-filter-btn';
    removeBtn.textContent = '削除';
    removeBtn.onclick = () => {
        row.remove();
        resetAndRender();
    };

    row.appendChild(select);
    row.appendChild(removeBtn);
    return row;
}

addFavFilterBtn.addEventListener('click', () => {
    const row = createFavFilterRow();
    favFilterContainer.appendChild(row);
});

function hiraToKata(str) {
  return str.replace(/[ぁ-ん]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60));
}

// --- URL同期用の関数ここから ---
function updateURL() {
    const params = new URLSearchParams();
    const q = searchName.value.trim();
    if (q) params.set('q', q);
    const env = filterEnv.value;
    if (env) params.set('env', env);
    const favs = Array.from(favFilterContainer.querySelectorAll('.filter-fav'))
        .map(sel => sel.value)
        .filter(val => val !== "");
    if (favs.length > 0) params.set('fav', favs.join(','));
    if (currentPage > 1) params.set('page', currentPage);
    const newRelativePathQuery = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    history.replaceState(null, '', newRelativePathQuery);
}

function loadStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('q')) searchName.value = params.get('q');
    if (params.has('env')) filterEnv.value = params.get('env');
    if (params.has('fav')) {
        const favs = params.get('fav').split(',');
        favFilterContainer.innerHTML = '';
        favs.forEach((favVal) => {
            const row = createFavFilterRow();
            const select = row.querySelector('.filter-fav');
            select.value = favVal;
            favFilterContainer.appendChild(row);
        });
    }
    if (favFilterContainer.children.length === 0) {
        favFilterContainer.innerHTML = '';
        favFilterContainer.appendChild(createFavFilterRow());
    }
    if (params.has('page')) currentPage = parseInt(params.get('page'), 10) || 1;
}

async function fetchData() {
  try {
    pokemonGrid.innerHTML = '<p class="empty-message">データを読み込み中...</p>';

    let csvText = cache.get('cachedLikesCSV');

    if (csvText) {
      processAndRender(csvText);
    }

    const fetchPromises = [];
    const keys = [];

    if (!csvText) { fetchPromises.push(smartFetch(RAW_URL)); keys.push('cachedLikesCSV'); }

    if (fetchPromises.length > 0) {
      const results = await Promise.all(fetchPromises);
      results.forEach((text, i) => {
        cache.set(keys[i], text);
        if (keys[i] === 'cachedLikesCSV') csvText = text;
      });
      processAndRender(csvText);
    }
  } catch (error) {
    console.error("データの読み込みに失敗しました:", error);
    pokemonGrid.innerHTML = '<p class="empty-message" style="color: red;">データの読み込みに失敗しました。時間をおいて再読み込みしてください。</p>';
  }
}

function processAndRender(csvText) {
  try {
    if (!csvText) return;

    const rows = csvText.split('\n');
    pokemonData = [];
    const envSet = new Set();
    const favSet = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;
      const columns = parseCSVRow(row);
      if (columns.length >= 3) {
        const environments = columns[1].split(/[,、]/).map(s => s.trim()).filter(s => s !== "");
        const favorites = columns[2].split(/[,、]/).map(s => s.trim()).filter(s => s !== "");
        const name = columns[0].trim();
        pokemonData.push({
          name: name,
          environments: environments,
          favorites: favorites
        });
        environments.forEach(env => envSet.add(env));
        favorites.forEach(fav => favSet.add(fav));
      }
    }

    favoriteOptions = Array.from(favSet).sort();
    updateSelectOptions(filterEnv, Array.from(envSet).sort());
    updateAllFavSelects();
    loadStateFromURL();
    renderTable();

  } catch (e) {
    console.error("Rendering error:", e);
    pokemonGrid.innerHTML = '<p class="empty-message" style="color: red;">表示処理中にエラーが発生しました。</p>';
  }
}

function parseCSVRow(text) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i+1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function renderTable() {
  const nameQuery = searchName.value.trim().toLowerCase();
  const envQuery = filterEnv.value;
  const favSelects = Array.from(favFilterContainer.querySelectorAll('.filter-fav'));
  const favQueries = favSelects.map(sel => sel.value).filter(val => val !== "");
  const queryKata = hiraToKata(nameQuery);

  const filteredData = pokemonData.filter(pokemon => {
    const matchName = pokemon.name.includes(nameQuery) || pokemon.name.includes(queryKata);
    const matchEnv = envQuery === "" || pokemon.environments.includes(envQuery);
    const matchFav = favQueries.every(q => pokemon.favorites.includes(q));
    return matchName && matchEnv && matchFav;
  });

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  pokemonGrid.innerHTML = '';
  if (totalItems === 0) {
    pokemonGrid.innerHTML = '<p class="empty-message">条件に一致するポケモンが見つかりません。</p>';
    paginationContainer.innerHTML = '';
    return;
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  paginatedData.forEach(pokemon => {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    card.onclick = function(event) {
      if (event.target.closest('.tag')) return;
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.set('name', pokemon.name);
      window.location.href = `pokemon.html?${currentParams.toString()}`;
    };

    const envTags = pokemon.environments.map(env => `<span class="tag env">${env}</span>`).join('');
    const favTags = pokemon.favorites.map(fav => `<span class="tag fav">${fav}</span>`).join('');
    card.innerHTML = `
      <div class="card-content">
        <h3 class="card-title">${pokemon.name}</h3>
        <div class="card-tags-section">
          <h4>🌲 好きな環境</h4>
          <div class="tags-list">${envTags || '<span style="color:#aaa; font-size:0.8rem;">設定なし</span>'}</div>
        </div>
        <div class="card-tags-section">
          <h4>🪑 好きなもの</h4>
          <div class="tags-list">${favTags || '<span style="color:#aaa; font-size:0.8rem;">設定なし</span>'}</div>
        </div>
      </div>
    `;
    pokemonGrid.appendChild(card);
  });

  renderPagination(totalPages);
  updateURL();
}

function renderPagination(totalPages) {
  paginationContainer.innerHTML = '';
  if (totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.textContent = '前へ';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
  paginationContainer.appendChild(prevBtn);

  let startPage = 1, endPage = totalPages;
  if (totalPages > 5) {
    startPage = Math.max(1, currentPage - 2);
    endPage = Math.min(totalPages, startPage + 4);
    if (endPage === totalPages) startPage = totalPages - 4;
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.addEventListener('click', () => { currentPage = i; renderTable(); });
    paginationContainer.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.textContent = '次へ';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; renderTable(); } });
  paginationContainer.appendChild(nextBtn);
}

function resetAndRender() {
  currentPage = 1;
  renderTable();
}

pokemonGrid.addEventListener('click', function(event) {
  const target = event.target;
  if (target.classList.contains('tag')) {
    const tagText = target.textContent;
    if (target.classList.contains('env')) {
      filterEnv.value = tagText;
    } else if (target.classList.contains('fav')) {
      const selects = Array.from(favFilterContainer.querySelectorAll('.filter-fav'));
      let targetSelect = selects.find(sel => sel.value === "");
      if (!targetSelect) {
          const row = createFavFilterRow();
          favFilterContainer.appendChild(row);
          targetSelect = row.querySelector('.filter-fav');
      }
      targetSelect.value = tagText;
    }
    resetAndRender();
  }
});

searchName.addEventListener('input', resetAndRender);
filterEnv.addEventListener('change', resetAndRender);
document.querySelector('.filter-fav').addEventListener('change', resetAndRender);

fetchData();
