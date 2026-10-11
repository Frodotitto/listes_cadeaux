const SUPABASE_URL = "https://glufuwoyxbyljnnthmbq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWZ1d295eGJ5bGpubnRobWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTg4MjUsImV4cCI6MjEwNzI5NDgyNX0.Zi64NJ2qr07oZMCA8acwmD8f1fEP6NJN_DyO5IvrIUc";

document.addEventListener('DOMContentLoaded', async () => {
  await loadLists();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = document.getElementById('status');

  let data = null;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['extract.js']
    });
    data = res && res.result;
  } catch (e) {
    console.error('Extraction impossible', e);
  }

  if (!data) {
    status.innerText = "❌ Échec de la lecture de la page.";
    document.getElementById('title').value = tab.title || '';
    document.getElementById('url').value = tab.url;
    return;
  }

  const hasPrice = data.price && data.price !== 'Non renseigné';
  document.getElementById('title').value = data.title || tab.title;
  document.getElementById('price').value = hasPrice ? data.price : 'Voir site';
  document.getElementById('store').value = data.store || new URL(tab.url).hostname.replace('www.', '');
  document.getElementById('image').value = data.image || '';
  document.getElementById('url').value = tab.url;
  status.innerText = "✅ Infos extraites. Prêt ! " + JSON.stringify(data.src || {});
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
