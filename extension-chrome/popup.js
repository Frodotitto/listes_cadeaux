// Remplace par tes identifiants Supabase (ceux dans secrets GitHub / index.html)
const SUPABASE_URL = "__SUPABASE_URL__";
const SUPABASE_KEY = "__SUPABASE_KEY__";

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Chargement dynamique des listes depuis Supabase
  loadLists();

  // 2. Extraction des infos de la page via extract.js
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['extract.js']
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      document.getElementById('title').value = data.title || '';
      document.getElementById('price').value = data.price || '';
      document.getElementById('store').value = data.store || '';
      document.getElementById('image').value = data.image || '';
      document.getElementById('url').value = tab.url || '';
    }
  });

  // 3. Soumission vers l'application
  document.getElementById('addBtn').addEventListener('click', () => {
    const title = document.getElementById('title').value.trim();
    const price = document.getElementById('price').value.trim();
    const store = document.getElementById('store').value.trim();
    const image = document.getElementById('image').value.trim();
    const url = document.getElementById('url').value.trim();
    const comment = document.getElementById('comment').value.trim();
    const list_id = document.getElementById('listSelect').value;

    if (!title || !url) {
      document.getElementById('status').innerText = '⚠️ Titre et URL obligatoires.';
      return;
    }

    const payload = { title, price, store, image, comment, list_id };
    
    const BASE_URL = "https://frodotitto.github.io/listes_cadeaux/";
    const targetUrl = `${BASE_URL}?quick_add=true&add_url=${encodeURIComponent(url)}&js_data=${encodeURIComponent(JSON.stringify(payload))}`;

    chrome.tabs.create({ url: targetUrl });
  });
});

async function loadLists() {
  const select = document.getElementById('listSelect');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lists?select=*&order=id.asc`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const lists = await res.json();

    select.innerHTML = '';
    if (lists && lists.length > 0) {
      lists.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.innerText = l.name;
        select.appendChild(opt);
      });
    } else {
      select.innerHTML = '<option value="">Aucune liste disponible</option>';
    }
  } catch (err) {
    select.innerHTML = '<option value="">Erreur de chargement</option>';
  }
}
