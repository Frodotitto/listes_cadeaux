const SUPABASE_URL = "https://glufuwoyxbyljnnthmbq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdWZ1d295eGJ5bGpubnRobWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTg4MjUsImV4cCI6MjEwNzI5NDgyNX0.Zi64NJ2qr07oZMCA8acwmD8f1fEP6NJN_DyO5IvrIUc";

document.addEventListener('DOMContentLoaded', async () => {
  await loadLists();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageMeta,
  }, (results) => {
    if (!results || !results[0]?.result) {
      document.getElementById('status').innerText = "❌ Échec de la lecture.";
      return;
    }

    const data = results[0].result;
    document.getElementById('title').value = data.title || tab.title;
    document.getElementById('price').value = data.price || "Voir site";
    document.getElementById('store').value = data.store || new URL(tab.url).hostname.replace('www.', '');
    document.getElementById('image').value = data.image || '';
    document.getElementById('url').value = tab.url;
    document.getElementById('status').innerText = "✅ Infos extraites. Prêt !";
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

// Fonction d'extraction avancée sur la page
function extractPageMeta() {
  const getMeta = (prop) => 
    document.querySelector(`meta[property="${prop}"]`)?.content || 
    document.querySelector(`meta[name="${prop}"]`)?.content;

  const hostname = window.location.hostname;
  let title = getMeta('og:title') || document.title;
  let image = getMeta('og:image') || '';
  let price = '';
  let store = getMeta('og:site_name') || hostname.replace('www.', '');

  // SPÉCIFIQUE AMAZON
  if (hostname.includes('amazon')) {
    store = 'Amazon.fr';
    
    // 1. Extraction du Titre Amazon
    const amazonTitle = document.getElementById('productTitle');
    if (amazonTitle) title = amazonTitle.innerText.trim();

    // 2. Extraction de l'Image HD Amazon
    const imgEl = document.getElementById('landingImage') || 
                  document.getElementById('imgBlkFront') || 
                  document.querySelector('#main-image-container img') ||
                  document.querySelector('#imgTagWrapperId img');
    if (imgEl) {
      // Priorité aux attributs HD d'Amazon
      image = imgEl.getAttribute('data-old-hires') || 
              imgEl.getAttribute('data-dynamic-image') ? Object.keys(JSON.parse(imgEl.getAttribute('data-dynamic-image') || '{}'))[0] : null ||
              imgEl.src;
    }

    // 3. Extraction du Prix Amazon principal
    const offscreenPrice = document.querySelector('.apexPriceToPay .a-offscreen') || 
                           document.querySelector('#corePrice_feature_div .a-offscreen') ||
                           document.querySelector('.a-price .a-offscreen');
    if (offscreenPrice) {
      price = offscreenPrice.innerText.trim();
    } else {
      const whole = document.querySelector('.a-price-whole')?.innerText.replace(/[^\d]/g, '');
      const fraction = document.querySelector('.a-price-fraction')?.innerText.trim();
      if (whole) price = `${whole}${fraction ? ',' + fraction : ''} €`;
    }
  }

  // REPLI GÉNÉRIQUE (pour les autres sites e-commerce)
  if (!image) {
    const mainImg = document.querySelector('article img, .product img, main img');
    if (mainImg) image = mainImg.src;
  }

  if (!price) {
    const ogPrice = getMeta('og:price:amount') || getMeta('product:price:amount');
    if (ogPrice) {
      price = ogPrice + ' €';
    } else {
      const match = document.body.innerText.match(/(\d+[\.,]\d{2})\s?€/);
      if (match) price = match[0];
    }
  }

  return { title, image, store, price };
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const listId = document.getElementById('listSelect').value;
  if (!listId) return status.innerText = "⚠️ Choisis une liste.";

  status.innerText = "⏳ Enregistrement...";
  const payload = {
    title: document.getElementById('title').value,
    url: document.getElementById('url').value,
    image_url: document.getElementById('image').value || 'https://via.placeholder.com/300',
    store_name: document.getElementById('store').value || 'Boutique',
    price: document.getElementById('price').value || 'Non renseigné',
    list_id: parseInt(listId),
    is_bought: false
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      status.innerText = "🎉 Ajouté à la liste !";
      setTimeout(() => window.close(), 1200);
    }
  } catch (err) { status.innerText = "❌ Erreur lors de l'envoi."; }
});
