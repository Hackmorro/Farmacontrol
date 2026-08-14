// =============================================================================
// FarmaControl — guard.js
// Verifica que haya sesión activa y que el rol tenga permiso para esta página.
// Uso: await requireRol(['administrador'])  o  await requireRol(['administrador','cajero'])
// Devuelve { session, perfil } si todo está en orden.
// =============================================================================

async function requireRol(rolesPermitidos) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const { data: perfil, error } = await supabaseClient
    .from('perfiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !perfil) {
    window.location.href = 'pendiente.html';
    return null;
  }

  if (!rolesPermitidos.includes(perfil.rol)) {
    window.location.href = perfil.rol === 'cajero' ? 'pos.html'
      : perfil.rol === 'administrador' ? 'admin.html'
      : 'pendiente.html';
    return null;
  }

  return { session, perfil };
}

async function cerrarSesionGlobal() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

function toggleTheme() {
  const html = document.documentElement;
  const next = (html.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('farmacontrol-theme', next);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = next === 'dark' ? '🌙' : '☀️';
}
document.addEventListener('DOMContentLoaded', () => {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? '🌙' : '☀️';
});
