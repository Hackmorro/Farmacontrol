// =============================================================================
// FarmaControl — auth.js
// Login, registro (crea perfil con rol 'sin_permisos'), recuperación de clave.
// =============================================================================

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

function mostrarVista(vista) {
  ['login', 'registro', 'recuperar', 'nueva-clave'].forEach(v => {
    document.getElementById('vista-' + v).classList.toggle('hidden', v !== vista);
  });
  history.replaceState(null, '', vista === 'login' ? location.pathname : '#' + vista);
}

function mostrarMensaje(elId, texto, tipo) {
  const el = document.getElementById(elId);
  el.classList.remove('hidden');
  el.classList.add('flex');
  const colores = {
    error: 'background:rgba(251,113,133,.08); border:1px solid rgba(251,113,133,.3); color:var(--red-ink);',
    exito: 'background:rgba(16,232,166,.08); border:1px solid rgba(16,232,166,.3); color:var(--emerald-ink);'
  };
  el.setAttribute('style', colores[tipo] || colores.error);
  el.innerHTML = `<span>${tipo === 'exito' ? '✅' : '⚠️'}</span> ${texto}`;
}

function setCargando(btnId, cargando, textoNormal) {
  const btn = document.getElementById(btnId);
  btn.disabled = cargando;
  btn.innerHTML = cargando ? '<span class="spinner"></span> Procesando...' : textoNormal;
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
async function iniciarSesion() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return;

  setCargando('btn-login', true);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setCargando('btn-login', false, 'Ingresar al Sistema');

  if (error) {
    mostrarMensaje('login-msg', 'Correo o contraseña incorrectos.', 'error');
    return;
  }
  window.location.href = 'redirigiendo.html';
}

// ---------------------------------------------------------------------------
// REGISTRO
// ---------------------------------------------------------------------------
async function registrarse() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const apellido = document.getElementById('reg-apellido').value.trim();
  const tipoCedula = document.getElementById('reg-tipo-cedula').value;
  const cedula = document.getElementById('reg-cedula').value.trim();
  const telefono = document.getElementById('reg-telefono').value.trim();
  const nacimiento = document.getElementById('reg-nacimiento').value;
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!nombre || !apellido || !cedula || !nacimiento || !email || !password) {
    mostrarMensaje('registro-msg', 'Completa todos los campos obligatorios.', 'error');
    return;
  }
  if (password.length < 6) {
    mostrarMensaje('registro-msg', 'La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }

  setCargando('btn-registro', true);

  // Los datos del formulario viajan como "metadata" del usuario. La fila en
  // la tabla perfiles la crea automáticamente un trigger en la base de datos
  // (no el navegador), así que funciona igual con o sin confirmación de
  // correo activada — no depende de que exista una sesión en este momento.
  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: {
      data: {
        nombre, apellido,
        tipo_cedula: tipoCedula,
        cedula,
        telefono: telefono ? ('+58' + telefono) : null,
        fecha_nacimiento: nacimiento
      }
    }
  });

  setCargando('btn-registro', false, 'Crear Cuenta');

  if (error) {
    mostrarMensaje('registro-msg', error.message.includes('already registered')
      ? 'Ese correo ya está registrado.' : 'No se pudo crear la cuenta: ' + error.message, 'error');
    return;
  }

  if (!data.session) {
    mostrarMensaje('registro-msg', 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.', 'exito');
    document.getElementById('form-registro').reset();
    return;
  }

  window.location.href = 'redirigiendo.html';
}

// ---------------------------------------------------------------------------
// RECUPERAR CONTRASEÑA
// ---------------------------------------------------------------------------
async function enviarRecuperacion() {
  const email = document.getElementById('recuperar-email').value.trim();
  if (!email) return;
  setCargando('btn-recuperar', true);
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  setCargando('btn-recuperar', false, 'Enviar enlace de recuperación');
  mostrarMensaje('recuperar-msg', error
    ? 'No se pudo enviar el correo: ' + error.message
    : 'Si el correo existe, te enviamos un enlace para restablecer tu contraseña.', error ? 'error' : 'exito');
}

async function actualizarContrasena() {
  const p1 = document.getElementById('nueva-clave1').value;
  const p2 = document.getElementById('nueva-clave2').value;
  if (p1 !== p2) {
    mostrarMensaje('nueva-clave-msg', 'Las contraseñas no coinciden.', 'error');
    return;
  }
  if (p1.length < 6) {
    mostrarMensaje('nueva-clave-msg', 'Debe tener al menos 6 caracteres.', 'error');
    return;
  }
  setCargando('btn-nueva-clave', true);
  const { error } = await supabaseClient.auth.updateUser({ password: p1 });
  setCargando('btn-nueva-clave', false, 'Actualizar contraseña');
  if (error) {
    mostrarMensaje('nueva-clave-msg', 'No se pudo actualizar: ' + error.message, 'error');
    return;
  }
  mostrarMensaje('nueva-clave-msg', 'Contraseña actualizada. Redirigiendo...', 'exito');
  setTimeout(() => { window.location.href = 'redirigiendo.html'; }, 1500);
}

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    mostrarVista('nueva-clave');
  }
});

if (location.hash === '#recuperar') mostrarVista('recuperar');
if (location.hash === '#registro') mostrarVista('registro');

(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && location.hash !== '#nueva-clave') {
    window.location.href = 'redirigiendo.html';
  }
})();
