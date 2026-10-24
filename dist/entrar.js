// Página de entrada do servidor da mesa: troca o e-mail cadastrado (MESA_LOGIN=email) ou o código de acesso por uma
// sessão (cookie) e volta para onde a pessoa estava. Com "@" é e-mail; sem, é código.
(() => {
  const form = document.querySelector('[data-login]'), status = document.querySelector('[data-login-status]'), button = form.querySelector('button');
  const requested = new URLSearchParams(location.search).get('return_to') || '/mesa.html';
  const target = requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\') ? requested : '/mesa.html';

  async function login(value) {
    const typed = String(value).trim();
    status.textContent = 'Entrando…';
    button.disabled = true;
    try {
      const response = await fetch('/auth/login', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(typed.includes('@') ? { email: typed } : { code: typed }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar. Tente de novo.');
      location.replace(target);
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); login(form.code.value); });
  // Link de convite: o e-mail ou o código vem no fragmento (#…), que não vai ao servidor; entra sozinho e limpa a barra de endereço.
  const fromLink = decodeURIComponent(location.hash.slice(1));
  if (fromLink) {
    history.replaceState(null, '', location.pathname + location.search);
    form.code.value = fromLink;
    login(fromLink);
  }
})();
