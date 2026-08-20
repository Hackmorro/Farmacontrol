// =============================================================================
// FarmaControl — guard.js
// Verifica que haya sesión activa y que el rol tenga permiso para esta página.
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

  activarBloqueoPara(perfil, session);
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

// =============================================================================
// BLOQUEO DE PANTALLA
// Se construye e inserta en cada página (admin/pos) automáticamente. No cierra
// la sesión, solo tapa la pantalla hasta que el mismo usuario escriba de
// nuevo su contraseña — útil si el cajero se aleja un momento del mostrador.
// =============================================================================
let _emailUsuarioActual = '';
let _nombreUsuarioActual = '';

function insertarOverlayBloqueo() {
  if (document.getElementById('overlay-bloqueo')) return;
  const div = document.createElement('div');
  div.id = 'overlay-bloqueo';
  div.className = 'fixed inset-0 z-[100] hidden items-center justify-center px-6';
  div.style.cssText = 'background:rgba(6,11,20,.97); backdrop-filter:blur(6px);';
  div.innerHTML = `
    <div class="glass rounded-2xl max-w-sm w-full p-8 shadow-2xl text-center fade-in" style="background:var(--bg-surface);">
      <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style="background:rgba(167,139,250,.12);"><span class="text-2xl">🔒</span></div>
      <h3 class="text-lg font-bold mb-1" style="color:var(--text-1);">Pantalla bloqueada</h3>
      <p class="text-sm mb-6" style="color:var(--text-2);" id="bloqueo-nombre-usuario"></p>
      <p id="bloqueo-msg" class="hidden text-xs mb-4" style="color:var(--red-ink);"></p>
      <input type="password" id="bloqueo-password" placeholder="Escribe tu contraseña" class="input-dark w-full px-4 py-3 rounded-xl text-sm mb-4" onkeydown="if(event.key==='Enter') desbloquearPantalla()">
      <button onclick="desbloquearPantalla()" id="btn-desbloquear" class="btn-primary w-full py-3 text-white font-bold rounded-xl transition text-sm mb-3">Desbloquear</button>
      <button onclick="cerrarSesionGlobal()" class="w-full py-2 text-xs font-semibold" style="color:var(--text-3);">¿No eres tú? Cerrar sesión</button>
    </div>`;
  document.body.appendChild(div);
}

function bloquearPantalla() {
  insertarOverlayBloqueo();
  document.getElementById('bloqueo-nombre-usuario').textContent = _nombreUsuarioActual ? `Hola, ${_nombreUsuarioActual}` : '';
  document.getElementById('overlay-bloqueo').classList.remove('hidden');
  document.getElementById('overlay-bloqueo').classList.add('flex');
  document.getElementById('bloqueo-password').value = '';
  document.getElementById('bloqueo-msg').classList.add('hidden');
  setTimeout(() => document.getElementById('bloqueo-password').focus(), 50);
}

async function desbloquearPantalla() {
  const password = document.getElementById('bloqueo-password').value;
  const btn = document.getElementById('btn-desbloquear');
  const msg = document.getElementById('bloqueo-msg');
  if (!password) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verificando...';
  const { error } = await supabaseClient.auth.signInWithPassword({ email: _emailUsuarioActual, password });
  btn.disabled = false;
  btn.innerHTML = 'Desbloquear';
  if (error) {
    msg.textContent = 'Contraseña incorrecta.';
    msg.classList.remove('hidden');
    return;
  }
  document.getElementById('overlay-bloqueo').classList.add('hidden');
  document.getElementById('overlay-bloqueo').classList.remove('flex');
}

// Cada página llama a esto una vez que ya sabe quién es el usuario (dentro de
// requireRol), para que el bloqueo sepa a quién pedirle la contraseña.
function activarBloqueoPara(perfil, session) {
  _emailUsuarioActual = session.user.email;
  _nombreUsuarioActual = perfil.nombre;
  insertarOverlayBloqueo();
}
