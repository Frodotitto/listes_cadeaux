const SUPABASE_URL = "https://glufuwoyxbyljnnthmbq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWZ1d295eGJ5bGpubnRobWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTg4MjUsImV4cCI6MjEwNzI5NDgyNX0.Zi64NJ2qr07oZMCA8acwmD8f1fEP6NJN_DyO5IvrIUc";

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Charger les listes depuis Supabase
  loadLists();

  // 2. Extraire les métadonnées du produit depuis l'onglet actif
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab && tab.id) {
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
  }

  // 3. Clic sur Enregistrer
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

    const payload = { title, price, store, image, comment };
    if (list_id) payload.list_id = list_id;

    const BASE_URL = "https://frodotitto.github.io/listes_cadeaux/";
    
    // Transmission des données vers le site sans déclencher le mode iOS
    const targetUrl = `${BASE_URL}?add_url=${encodeURIComponent(url)}&js_data=${encodeURIComponent(JSON.stringify(payload))}`;

    chrome.tabs.create({ url: targetUrl });
  });
});

async function loadLists() {
  const select = document.getElementById('listSelect');
  if (!select) return;

  try {
    const cleanUrl = SUPABASE_URL.replace(/\/$/, '');
    
    const response = await fetch(`${cleanUrl}/rest/v1/lists?select=id,name&order=id.asc`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const lists = await response.json();

    select.innerHTML = '';
    if (Array.isArray(lists) && lists.length > 0) {
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
    console.error("Erreur de récupération des listes :", err);
    select.innerHTML = '<option value="">Erreur de chargement</option>';
  }
}
