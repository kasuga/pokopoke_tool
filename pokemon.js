const RAW_URL_LIKES = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3o-C_BEGd98LSvCu8_e6RSregYM4vrau8jdbqqn4A5gCYTwoILWo-js0dz566oX7YrdDwAtsPm3xe/pub?output=csv';
const RAW_URL_ITEMS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3o-C_BEGd98LSvCu8_e6RSregYM4vrau8jdbqqn4A5gCYTwoILWo-js0dz566oX7YrdDwAtsPm3xe/pub?gid=1403600136&single=true&output=csv';

const timestamp = new Date().getTime();
const URL_LIKES = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(RAW_URL_LIKES + '&t=' + timestamp);
const URL_ITEMS = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(RAW_URL_ITEMS + '&t=' + timestamp);

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const pokemonName = urlParams.get('name');

  const container = document.getElementById('pokemonDetail');

  if (!pokemonName) {
    container.innerHTML = '<p class="empty-message" style="color:red;">ポケモン名が指定されていません。</p>';
    return;
  }

  try {
    let likesCsv = sessionStorage.getItem('cachedLikesCSV');
    let itemsCsv = sessionStorage.getItem('cachedItemsCSV');

    if (!likesCsv || !itemsCsv) {
      const [likesRes, itemsRes] = await Promise.all([
        fetch(URL_LIKES),
        fetch(URL_ITEMS)
      ]);

      if (!likesRes.ok || !itemsRes.ok) throw new Error('ネットワークエラー');

      likesCsv = await likesRes.text();
      itemsCsv = await itemsRes.text();

      sessionStorage.setItem('cachedLikesCSV', likesCsv);
      sessionStorage.setItem('cachedItemsCSV', itemsCsv);
    }

    const pokemonData = parseLikesCSV(likesCsv, pokemonName);
    if (!pokemonData) {
      container.innerHTML = `<p class="empty-message" style="color:red;">「${pokemonName}」のデータが見つかりませんでした。</p>`;
      return;
    }

    const itemsData = parseItemsCSV(itemsCsv);
    const relatedItems = getRelatedItems(pokemonData, itemsData);

    render(pokemonData, relatedItems, container);

  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="empty-message" style="color:red;">データの読み込みに失敗しました。</p>';
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

function parseLikesCSV(csv, targetName) {
  const rows = csv.split('\n');
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;
    
    // ダブルクォート考慮でカンマ分割
    const columns = parseCSVRow(row);
    
    if (columns[0].trim() === targetName) {
      return {
        name: columns[0].trim(),
        environments: columns.length >= 2 ? columns[1].split(/[,、]/).map(s => s.trim()).filter(Boolean) : [],
        favorites: columns.length >= 3 ? columns[2].split(/[,、]/).map(s => s.trim()).filter(Boolean) : []
      };
    }
  }
  return null;
}

function parseItemsCSV(csv) {
  const rows = csv.split('\n');
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;
    
    const columns = parseCSVRow(row);
    if (columns.length >= 3) {
      items.push({
        name: columns[0].trim(),
        category: columns[1].trim(),
        tags: columns[2].split(/[,、]/).map(s => s.trim()).filter(Boolean)
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

      itemsHtml += `
        <div class="item-card">
          <strong>${item.name}</strong><br>
          <small style="color:#777;">${item.category}</small><br>
          <div style="margin-top: 8px;">${itemTags}</div>
        </div>
      `;
    });
    itemsHtml += '</div>';
  }

  container.innerHTML = `
    <h1>${pokemon.name}</h1>
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

init();
