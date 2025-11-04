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
