const SUPABASE_URL = "https://glufuwoyxbyljnnthmbq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWZ1d295eGJ5bGpubnRobWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTg4MjUsImV4cCI6MjEwNzI5NDgyNX0.Zi64NJ2qr07oZMCA8acwmD8f1fEP6NJN_DyO5IvrIUc";

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Exécution du script d'extraction universelle (extract.js)
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

  document.getElementById('addBtn').addEventListener('click', () => {
    const title = document.getElementById('title').value.trim();
    const price = document.getElementById('price').value.trim();
    const store = document.getElementById('store').value.trim();
    const image = document.getElementById('image').value.trim();
    const url = document.getElementById('url').value.trim();
    const comment = document.getElementById('comment').value.trim();

    if (!title || !url) {
      document.getElementById('status').innerText = '⚠️ Titre et URL obligatoires.';
      return;
    }

    const payload = { title, price, store, image, comment };
    
    const BASE_URL = "https://frodotitto.github.io/listes_cadeaux/";
    const targetUrl = `${BASE_URL}?quick_add=true&add_url=${encodeURIComponent(url)}&js_data=${encodeURIComponent(JSON.stringify(payload))}`;

    chrome.tabs.create({ url: targetUrl });
  });
});

async function loadLists() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lists?select=*&order=id.asc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const lists = await res.json();
    const select = document.getElementById('listSelect');
    select.innerHTML = '';
    lists.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id; opt.innerText = l.name;
      select.appendChild(opt);
    });
  } catch (err) {
    document.getElementById('status').innerText = "❌ Erreur de chargement des listes.";
  }
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const listId = document.getElementById('listSelect').value;
  const url = document.getElementById('url').value;

  if (!listId) return status.innerText = "⚠️ Choisis une liste.";

  status.innerText = "⏳ Vérification doublon...";

  try {
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/products?list_id=eq.${listId}&url=eq.${encodeURIComponent(url)}&select=id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const existingProducts = await checkRes.json();

    if (existingProducts && existingProducts.length > 0) {
      status.innerText = "⚠️ Cet article est déjà dans la liste !";
      return;
    }

    status.innerText = "⏳ Enregistrement...";
    const payload = {
      title: document.getElementById('title').value,
      url: url,
      image_url: document.getElementById('image').value || 'https://via.placeholder.com/300',
      store_name: document.getElementById('store').value || 'Boutique',
      price: document.getElementById('price').value || 'Non renseigné',
      list_id: parseInt(listId),
      is_bought: false
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      status.innerText = "🎉 Ajouté à la liste !";
      setTimeout(() => window.close(), 1200);
    }
  } catch (err) {
    status.innerText = "❌ Erreur d'enregistrement.";
  }
});
