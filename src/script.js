(function () {
  const toggleBtn = document.getElementById('light-dark-toggle');
  const iconDark = document.getElementById('icon-dark');
  const iconLight = document.getElementById('icon-light');
  const body = document.body;

  if (!toggleBtn || !iconDark || !iconLight) return;

  function applyMode(isDark) {
    if (isDark) {
      body.classList.add('dark-mode');
      iconDark.classList.remove('active');
      iconLight.classList.add('active');
      toggleBtn.setAttribute('aria-pressed', 'true');
    } else {
      body.classList.remove('dark-mode');
      iconDark.classList.add('active');
      iconLight.classList.remove('active');
      toggleBtn.setAttribute('aria-pressed', 'false');
    }
    try {
      localStorage.setItem('darkMode', isDark ? '1' : '0');
    } catch (e) {}
  }

  // Init
  let saved = null;
  try {
    saved = localStorage.getItem('darkMode');
  } catch (e) {}

  if (saved === '1' || saved === '0') {
    applyMode(saved === '1');
  } else {
    const prefersDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyMode(prefersDark);
  }

  // Toggle
  toggleBtn.addEventListener('click', () => {
    const isNowDark = !body.classList.contains('dark-mode');
    applyMode(isNowDark);
  });
})();

document.querySelectorAll('a[href^="#_ftn"]').forEach(link => {
  // On parcourt tous les nœuds enfants du lien (textes et balises)
  link.querySelectorAll('*').forEach(child => {
    if (child.childNodes.length) {
      child.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = node.nodeValue.replace(/[\[\]]/g, '');
        }
      });
    }
  });

  // On traite aussi le texte directement dans le <a> (hors balises)
  if (link.childNodes.length) {
    link.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.nodeValue = node.nodeValue.replace(/[\[\]]/g, '');
      }
    });
  }
});
