const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3o-C_BEGd98LSvCu8_e6RSregYM4vrau8jdbqqn4A5gCYTwoILWo-js0dz566oX7YrdDwAtsPm3xe/pub?';
const RAW_URL = BASE_URL + 'output=csv';
const URL_POKEMON_IMAGES = BASE_URL + 'gid=241891908&output=csv';
const URL_ITEMS = BASE_URL + 'gid=1403600136&single=true&output=csv';

// キャッシュを効率的に使いつつ最新を取得するためのタイムスタンプ（5分単位）
const getCacheBuster = () => {
  return Math.floor(new Date().getTime() / (1000 * 60 * 5));
};

// 直接フェッチを優先し、失敗した場合にプロキシを使用するヘルパー
async function smartFetch(url) {
  const fullUrl = url + '&t=' + getCacheBuster();
  try {
    // まずは直接取得を試みる（CORS許可されている場合が多いため）
    const res = await fetch(fullUrl);
    if (res.ok) return await res.text();
  } catch (e) {
    console.warn("Direct fetch failed, falling back to proxy:", e);
  }
  // 失敗した場合はプロキシ経由で再試行
  const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(fullUrl);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error('通信エラー');
  return await res.text();
}
let pokemonImageMap = {}; // ポケモン画像URLのマップ
const tableBody = document.getElementById('tableBody');
const searchName = document.getElementById('searchName');
const filterEnv = document.getElementById('filterEnv');
const filterFav = document.getElementById('filterFav');
const paginationContainer = document.getElementById('pagination'); // 追加

// ページネーション用の変数▼
let currentPage = 1;
const itemsPerPage = 10;

function updateSelectOptions(selectElement, optionsArray) {
  selectElement.innerHTML = '<option value="">すべて</option>';
  optionsArray.forEach(optionValue => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    selectElement.appendChild(option);
  });
}

function hiraToKata(str) {
  return str.replace(/[ぁ-ん]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) + 0x60);
  });
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

async function fetchData() {
  try {
    tableBody.innerHTML = '<tr><td colspan="3" class="empty-message">データを読み込み中...</td></tr>';

    let csvText = sessionStorage.getItem('cachedLikesCSV');
    let pokemonImagesText = sessionStorage.getItem('cachedPokemonImagesCSV');
    let itemsText = sessionStorage.getItem('cachedItemsCSV');

    // キャッシュがないものだけ取得リストに追加
    const fetchPromises = [];
    const keys = [];

    if (!csvText) { fetchPromises.push(smartFetch(RAW_URL)); keys.push('cachedLikesCSV'); }
    if (!pokemonImagesText) { fetchPromises.push(smartFetch(URL_POKEMON_IMAGES)); keys.push('cachedPokemonImagesCSV'); }
    if (!itemsText) { fetchPromises.push(smartFetch(URL_ITEMS)); keys.push('cachedItemsCSV'); }

    if (fetchPromises.length > 0) {
      const results = await Promise.all(fetchPromises);
      results.forEach((text, i) => {
        sessionStorage.setItem(keys[i], text);
        if (keys[i] === 'cachedLikesCSV') csvText = text;
        if (keys[i] === 'cachedPokemonImagesCSV') pokemonImagesText = text;
        if (keys[i] === 'cachedItemsCSV') itemsText = text;
      });
    }

    // 画像マップの作成
    if (pokemonImagesText) {
      const imgRows = pokemonImagesText.split('\n');
      imgRows.forEach((row, idx) => {
        if (idx === 0) return;
        const cols = parseCSVRow(row.trim());
        if (cols.length >= 2) {
          pokemonImageMap[cols[0].trim()] = cols[1].trim();
        }
      });
    }

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
          favorites: favorites,
          imageUrl: pokemonImageMap[name] || null
        });

        environments.forEach(env => envSet.add(env));
        favorites.forEach(fav => favSet.add(fav));
      }
    }

    updateSelectOptions(filterEnv, Array.from(envSet).sort());
    updateSelectOptions(filterFav, Array.from(favSet).sort());

    renderTable();

  } catch (error) {
    console.error("データの読み込みに失敗しました:", error);
    tableBody.innerHTML = '<tr><td colspan="3" class="empty-message" style="color: red;">データの読み込みに失敗しました。時間をおいて再読み込みしてください。</td></tr>';
  }
}

// 表示処理にページ切り取りを追加▼
function renderTable() {
  const nameQuery = searchName.value.trim().toLowerCase();
  const envQuery = filterEnv.value;
  const favQuery = filterFav.value;

  // 1. まず条件に合うものを全て絞り込む
  const queryKata = hiraToKata(nameQuery);
  const filteredData = pokemonData.filter(pokemon => {
    const matchName = pokemon.name.includes(nameQuery) || pokemon.name.includes(queryKata);
    const matchEnv = envQuery === "" || pokemon.environments.includes(envQuery);
    const matchFav = favQuery === "" || pokemon.favorites.includes(favQuery);
    return matchName && matchEnv && matchFav;
  });

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 絞り込みの結果、現在のページが存在しなくなったら1ページ目に戻す
  if (currentPage > totalPages) currentPage = totalPages || 1;

  tableBody.innerHTML = '';

  if (totalItems === 0) {
    tableBody.innerHTML = '<tr><td colspan="3" class="empty-message">条件に一致するポケモンが見つかりません。</td></tr>';
    paginationContainer.innerHTML = '';
    return;
  }

  // 2. 現在のページに表示する分だけを切り取る（slice）
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // 3. テーブルに描画
  paginatedData.forEach(pokemon => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.style.cursor = 'pointer';
    tr.onclick = function(event) {
      // タグやリンクがクリックされた場合は遷移させない（各々の動作を優先）
      if (event.target.closest('.tag') || event.target.closest('a')) {
        return;
      }
      window.location.href = `pokemon.html?name=${encodeURIComponent(pokemon.name)}`;
    };

    const envTags = pokemon.environments.map(env => `<span class="tag env">${env}</span>`).join('');
    const favTags = pokemon.favorites.map(fav => `<span class="tag fav">${fav}</span>`).join('');
    
    // 画像タグの生成（URLがある場合）
    const imgHtml = pokemon.imageUrl 
        ? `<img src="${pokemon.imageUrl}" alt="${pokemon.name}" class="thumb-img">`
        : `<div class="thumb-img placeholder-img"></div>`;

    tr.innerHTML = `
      <td data-label="ポケモン名">
        <div class="pokemon-name-cell">
          ${imgHtml}
          <strong><a href="pokemon.html?name=${encodeURIComponent(pokemon.name)}" class="pokemon-link">${pokemon.name}</a></strong>
        </div>
      </td>
      <td data-label="🌲 好きな環境">${envTags}</td>
      <td data-label="🪑 好きなもの">${favTags}</td>
    `;
    tableBody.appendChild(tr);
  });

  // 4. ページネーションボタンを描画
  renderPagination(totalPages);
}

// ページネーションのボタンを作る関数▼
function renderPagination(totalPages) {
  paginationContainer.innerHTML = '';

  if (totalPages <= 1) return; // 1ページしかない場合はボタンを表示しない

  // 「前へ」ボタン
  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.textContent = '前へ';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });
  paginationContainer.appendChild(prevBtn);

  // 表示するページの範囲（スタートとエンド）を計算▼
  let startPage = 1;
  let endPage = totalPages;
  const maxPagesToShow = 5; // 表示する最大ページ数

  if (totalPages > maxPagesToShow) {
    // 基本は現在のページを中心に配置
    startPage = currentPage - 2;
    endPage = currentPage + 2;

    // もし左側（1ページ目方向）にはみ出す場合の補正
    if (startPage < 1) {
      startPage = 1;
      endPage = maxPagesToShow;
    }
    // もし右側（最終ページ方向）にはみ出す場合の補正
    else if (endPage > totalPages) {
      endPage = totalPages;
      startPage = totalPages - maxPagesToShow + 1;
    }
  }

  // 数字ボタンを生成（計算した範囲だけループを回す）
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.addEventListener('click', () => {
      currentPage = i;
      renderTable();
    });
    paginationContainer.appendChild(pageBtn);
  }

  // 「次へ」ボタン
  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.textContent = '次へ';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });
  paginationContainer.appendChild(nextBtn);
}

// 絞り込みが変更されたら1ページ目に戻す関数▼
function resetAndRender() {
  currentPage = 1;
  renderTable();
}

tableBody.addEventListener('click', function(event) {
  const target = event.target;
  if (target.classList.contains('tag')) {
    const tagText = target.textContent;
    if (target.classList.contains('env')) {
      filterEnv.value = tagText;
    } else if (target.classList.contains('fav')) {
      filterFav.value = tagText;
    }
    resetAndRender(); // タグクリック時も1ページ目に戻す
  }
});

// リスナーを resetAndRender に変更
searchName.addEventListener('input', resetAndRender);
filterEnv.addEventListener('change', resetAndRender);
filterFav.addEventListener('change', resetAndRender);

fetchData();
