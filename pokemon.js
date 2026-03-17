const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3o-C_BEGd98LSvCu8_e6RSregYM4vrau8jdbqqn4A5gCYTwoILWo-js0dz566oX7YrdDwAtsPm3xe/pub?';
const URL_LIKES = BASE_URL + 'output=csv';
const URL_ITEMS = BASE_URL + 'gid=1403600136&single=true&output=csv';
const URL_POKEMON_IMAGES = BASE_URL + 'gid=241891908&output=csv';
const URL_ITEM_IMAGES = BASE_URL + 'gid=1960224020&output=csv';

const getCacheBuster = () => Math.floor(new Date().getTime() / (1000 * 60 * 5));

async function smartFetch(url) {
  const fullUrl = url + '&t=' + getCacheBuster();
  try {
    const res = await fetch(fullUrl);
    if (res.ok) return await res.text();
  } catch (e) {
    console.warn("Direct fetch failed, falling back to proxy:", e);
  }
  const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(fullUrl);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error('通信エラー');
  return await res.text();
}

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const pokemonName = urlParams.get('name');

  const container = document.getElementById('pokemonDetail');

  if (!pokemonName) {
    container.innerHTML = '<p class="empty-message" style="color:red;">ポケモン名が指定されていません。</p>';
  }

  try {
    let likesCsv = sessionStorage.getItem('cachedLikesCSV');
    let itemsCsv = sessionStorage.getItem('cachedItemsCSV');
    let pokemonImagesCsv = sessionStorage.getItem('cachedPokemonImagesCSV');
    let itemImagesCsv = sessionStorage.getItem('cachedItemImagesCSV');

    const fetchPromises = [];
    const keys = [];

    const checkAndPush = (csv, url, key) => {
      if (!csv) {
        fetchPromises.push(smartFetch(url));
        keys.push(key);
      } else {
        fetchPromises.push(Promise.resolve(csv));
        keys.push(null);
      }
    };

    checkAndPush(likesCsv, URL_LIKES, 'cachedLikesCSV');
    checkAndPush(itemsCsv, URL_ITEMS, 'cachedItemsCSV');
    checkAndPush(pokemonImagesCsv, URL_POKEMON_IMAGES, 'cachedPokemonImagesCSV');
    checkAndPush(itemImagesCsv, URL_ITEM_IMAGES, 'cachedItemImagesCSV');

    const results = await Promise.all(fetchPromises);
    results.forEach((text, i) => {
      if (keys[i]) sessionStorage.setItem(keys[i], text);
    });

    [likesCsv, itemsCsv, pokemonImagesCsv, itemImagesCsv] = results;

    sessionStorage.setItem('cachedLikesCSV', likesCsv);
    sessionStorage.setItem('cachedItemsCSV', itemsCsv);
    sessionStorage.setItem('cachedPokemonImagesCSV', pokemonImagesCsv);
    sessionStorage.setItem('cachedItemImagesCSV', itemImagesCsv);

    const pokemonImageMap = parseImageCSV(pokemonImagesCsv);
    const itemImageMap = parseImageCSV(itemImagesCsv);

    const pokemonData = parseLikesCSV(likesCsv, pokemonName, pokemonImageMap);
    if (!pokemonData) {
      container.innerHTML = `<p class="empty-message" style="color:red;">「${pokemonName}」のデータが見つかりませんでした。</p>`;
      return;
    }

    const itemsData = parseItemsCSV(itemsCsv, itemImageMap);
    const relatedItems = getRelatedItems(pokemonData, itemsData);

    render(pokemonData, relatedItems, container);

  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="empty-message" style="color:red;">データの読み込みに失敗しました。</p>';
  }
}

function parseImageCSV(csv) {
  const map = {};
  if (!csv) return map;
  const rows = csv.split('\n');
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;
    const cols = parseCSVRow(row);
    if (cols.length >= 2) {
      map[cols[0].trim()] = cols[1].trim();
    }
  }
  return map;
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

function parseLikesCSV(csv, targetName, imageMap) {
  const rows = csv.split('\n');
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;

    // ダブルクォート考慮でカンマ分割
    const columns = parseCSVRow(row);

    if (columns[0].trim() === targetName) {
      const name = columns[0].trim();
      return {
        name: name,
        environments: columns.length >= 2 ? columns[1].split(/[,、]/).map(s => s.trim()).filter(Boolean) : [],
        favorites: columns.length >= 3 ? columns[2].split(/[,、]/).map(s => s.trim()).filter(Boolean) : [],
        imageUrl: imageMap[name] || null
      };
    }
  }
  return null;
}

function parseItemsCSV(csv, imageMap) {
  const rows = csv.split('\n');
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;

    const columns = parseCSVRow(row);
    if (columns.length >= 3) {
      const name = columns[0].trim();
      items.push({
        name: name,
        category: columns[1].trim(),
        tags: columns[2].split(/[,、]/).map(s => s.trim()).filter(Boolean),
        imageUrl: imageMap[name] || null
      });
    }
  }
  return items;
}

function getRelatedItems(pokemon, items) {
  const targetTags = [...pokemon.environments, ...pokemon.favorites];
  return items.filter(item => {
    return item.tags.some(tag => targetTags.includes(tag));
  });
}

function render(pokemon, items, container) {
  document.title = `${pokemon.name} - ぽこあポケモン`;

  const envTags = pokemon.environments.map(env => `<span class="tag env">${env}</span>`).join('');
  const favTags = pokemon.favorites.map(fav => `<span class="tag fav">${fav}</span>`).join('');

  const pokemonImgHtml = pokemon.imageUrl
      ? `<img src="${pokemon.imageUrl}" alt="${pokemon.name}" class="detail-main-img">`
      : `<div class="detail-main-img placeholder-img"></div>`;

  let itemsHtml = '<p class="empty-message">関連するアイテムがありません。</p>';
  if (items.length > 0) {
    itemsHtml = '<div class="item-grid">';
    items.forEach(item => {
      const itemTags = item.tags.map(t => {
        let tagClass = 'tag';
        if (pokemon.environments.includes(t)) tagClass += ' env';
        else if (pokemon.favorites.includes(t)) tagClass += ' fav';
        return `<span class="${tagClass}">${t}</span>`;
      }).join('');

      const itemImgHtml = item.imageUrl
          ? `<div class="item-img-container"><img src="${item.imageUrl}" alt="${item.name}" class="item-img"></div>`
          : `<div class="item-img-container"><div class="item-img placeholder-img"></div></div>`;

      itemsHtml += `
        <div class="item-card">
          ${itemImgHtml}
          <strong>${item.name}</strong><br>
          <small style="color:#777;">${item.category}</small><br>
          <div style="margin-top: 8px;">${itemTags}</div>
        </div>
      `;
    });
    itemsHtml += '</div>';
  }

  container.innerHTML = `
    <div class="detail-header">
      ${pokemonImgHtml}
      <h1>${pokemon.name}</h1>
    </div>
    <div class="detail-card">
      <div style="margin-bottom: 15px;">
        <span style="font-weight:bold; display:inline-block; width:120px;">🌲 好きな環境:</span>
        ${envTags || 'なし'}
      </div>
      <div>
        <span style="font-weight:bold; display:inline-block; width:120px;">🪑 好きなもの:</span>
        ${favTags || 'なし'}
      </div>
    </div>

    <h2 style="margin-top: 30px; color: #2c3e50; font-size: 20px; border-bottom: 2px solid #3498db; padding-bottom: 5px;">🎒 好きなものや環境に関連するアイテム</h2>
    ${itemsHtml}
  `;
}

// 「一覧に戻る」リンクのパラメータ引き継ぎ
function updateBackLink() {
    const backLink = document.querySelector('.back-link');
    if (!backLink) return;

    const currentParams = new URLSearchParams(window.location.search);
    currentParams.delete('name'); // ポケモン名は不要
    
    const queryString = currentParams.toString();
    backLink.href = 'index.html' + (queryString ? '?' + queryString : '');
}

init();
updateBackLink();
