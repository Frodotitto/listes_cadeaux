const SUPABASE_URL = "https://glufuwoyxbyljnnthmbq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWZ1d295eGJ5bGpubnRobWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTg4MjUsImV4cCI6MjEwNzI5NDgyNX0.Zi64NJ2qr07oZMCA8acwmD8f1fEP6NJN_DyO5IvrIUc";

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Charger les listes depuis Supabase
  loadLists();

  // 2. Extraire les métadonnées du produit depuis la page active
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

  // 3. Clic sur Enregistrer : insertion directe en BDD sans ouvrir de nouvel onglet
  document.getElementById('addBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    const addBtn = document.getElementById('addBtn');

    const title = document.getElementById('title').value.trim();
    const price = document.getElementById('price').value.trim();
    const store = document.getElementById('store').value.trim();
    const image = document.getElementById('image').value.trim();
    const url = document.getElementById('url').value.trim();
    const comment = document.getElementById('comment').value.trim();
    const list_id = document.getElementById('listSelect').value;

    if (!title || !url || !list_id) {
      statusEl.innerText = '⚠️ Titre, URL et Liste obligatoires.';
      statusEl.style.color = '#ef4444';
      return;
    }

    statusEl.innerText = '⏳ Enregistrement...';
    statusEl.style.color = '#6366f1';
    addBtn.disabled = true;

    try {
      const cleanUrl = SUPABASE_URL.replace(/\/$/, '');

      // Vérification des doublons dans la même liste
      const checkRes = await fetch(`${cleanUrl}/rest/v1/products?list_id=eq.${list_id}&url=eq.${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      const existing = await checkRes.json();

      if (existing && existing.length > 0) {
        statusEl.innerText = '⚠️ Article déjà présent dans cette liste !';
        statusEl.style.color = '#f59e0b';
        addBtn.disabled = false;
        return;
      }

      // Insertion du produit dans Supabase
      const insertRes = await fetch(`${cleanUrl}/rest/v1/products`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          title: title,
          url: url,
          image_url: image || 'https://via.placeholder.com/300',
          store_name: store || 'Boutique',
          price: price || 'Non renseigné',
          comment: comment || '',
          list_id: parseInt(list_id),
          is_bought: false
        })
      });

      if (!insertRes.ok) {
        throw new Error(`Erreur HTTP: ${insertRes.status}`);
      }

      // Succès : affichage du message sans redirection
      statusEl.innerText = '✅ Ajout terminé !';
      statusEl.style.color = '#059669';

      setTimeout(() => {
        statusEl.innerText = '';
        addBtn.disabled = false;
      }, 3000);

    } catch (err) {
      console.error("Erreur lors de l'enregistrement :", err);
      statusEl.innerText = '❌ Erreur lors de l\'enregistrement.';
      statusEl.style.color = '#ef4444';
      addBtn.disabled = false;
    }
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
