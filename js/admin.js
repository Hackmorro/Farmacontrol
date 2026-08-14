// =============================================================================
// FarmaControl — admin.js
// =============================================================================

let productos = [];   // productos con .lotes anidados
let movimientos = [];
let usuarios = [];
let stockIdActual = null;
let miPerfil = null;

function stockTotal(p) { return (p.lotes || []).reduce((s, l) => s + l.cantidad, 0); }

(async () => {
  const auth = await requireRol(['administrador']);
  if (!auth) return;
  miPerfil = auth.perfil;
  document.getElementById('nombre-usuario').textContent = miPerfil.nombre + ' ' + miPerfil.apellido;
  document.getElementById('avatar-inicial').textContent = (miPerfil.nombre[0] || 'A').toUpperCase();
  await cargarTodo();
})();

async function cargarTodo() {
  await Promise.all([cargarProductos(), cargarMovimientos(), cargarUsuarios()]);
  renderProductos();
  renderAlertas();
  renderMovimientos();
  renderUsuarios();
  renderStats();
  poblarSelectProductos();
}

async function cargarProductos() {
  const { data: prods } = await supabaseClient.from('productos').select('*').order('id');
  const { data: lotes } = await supabaseClient.from('lotes').select('*').order('vence');
  productos = (prods || []).map(p => ({ ...p, lotes: (lotes || []).filter(l => l.producto_id === p.id) }));
}

async function cargarMovimientos() {
  const { data } = await supabaseClient.from('movimientos').select('*').order('id', { ascending: false }).limit(200);
  movimientos = data || [];
}

async function cargarUsuarios() {
  const { data } = await supabaseClient.from('perfiles').select('*').order('creado_en', { ascending: false });
  usuarios = data || [];
}

function renderStats() {
  const alertas = productos.filter(p => stockTotal(p) <= p.minimo);
  document.getElementById('stat-productos').textContent = productos.length;
  document.getElementById('stat-alertas').textContent = alertas.length;
  document.getElementById('badge-alertas').textContent = alertas.length;
  document.getElementById('stat-stock').textContent = productos.reduce((s, p) => s + stockTotal(p), 0);
  const pendientes = usuarios.filter(u => u.rol === 'sin_permisos').length;
  document.getElementById('stat-pendientes').textContent = pendientes;
  document.getElementById('badge-pendientes').textContent = pendientes;
}

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------
function showTab(tab) {
  ['inventario', 'alertas', 'movimientos', 'usuarios'].forEach(t => {
    document.getElementById('panel-' + t).classList.toggle('hidden', t !== tab);
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
}

// ---------------------------------------------------------------------------
// RENDER: INVENTARIO
// ---------------------------------------------------------------------------
function lotesColor(vence) {
  const hoy = new Date(); const v = new Date(vence);
  const meses = (v - hoy) / (1000 * 60 * 60 * 24 * 30);
  if (meses < 0) return 'background:rgba(251,113,133,.1); color:var(--red-ink);';
  if (meses < 6) return 'background:rgba(251,191,36,.1); color:var(--amber-ink);';
  return 'background:var(--tint-3); color:var(--text-2);';
}

function renderProductos() {
  const grid = document.getElementById('productos-grid');
  grid.innerHTML = '';
  productos.forEach(p => {
    const bajo = stockTotal(p) <= p.minimo;
    const div = document.createElement('div');
    div.className = 'producto-card rounded-2xl p-5';
    div.dataset.id = p.id; div.dataset.nombre = p.nombre.toLowerCase(); div.dataset.barra = (p.codigo_barra || '').toLowerCase();
    div.innerHTML = `
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:${bajo ? 'rgba(251,113,133,.12)' : 'rgba(167,139,250,.12)'};"><span class="text-lg">${bajo ? '⚠️' : '💊'}</span></div>
          <div><h3 class="font-bold text-sm leading-tight" style="color:var(--text-1);">${escapeHtml(p.nombre)}</h3><p class="text-xs mt-0.5" style="color:var(--text-3);">${escapeHtml(p.categoria)}</p></div>
        </div>
        <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold" style="${bajo ? 'background:rgba(251,113,133,.12); color:var(--red-ink);' : 'background:rgba(16,232,166,.12); color:var(--emerald-ink);'}">${bajo ? 'BAJO' : 'OK'}</span>
      </div>
      <div class="flex items-end justify-between mb-4">
        <div><p class="text-[10px] uppercase font-bold" style="color:var(--text-3);">Precio</p><p class="font-display text-2xl font-bold" style="color:var(--text-1);">$${Number(p.precio).toFixed(2)}</p></div>
        <div class="text-right"><p class="text-[10px] uppercase font-bold" style="color:var(--text-3);">Stock</p><p class="font-display text-2xl font-bold" style="color:${bajo ? 'var(--red)' : 'var(--text-1)'};">${stockTotal(p)}</p></div>
      </div>
      <div class="mb-4">
        <p class="text-[10px] uppercase font-bold mb-2" style="color:var(--text-3);">Lotes</p>
        ${(p.lotes.length === 0) ? '<p class="text-xs italic" style="color:var(--text-3);">Sin stock</p>' : ''}
        <div class="flex flex-wrap gap-1.5">
          ${p.lotes.map(l => `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium" style="${lotesColor(l.vence)}"><span class="font-mono">${escapeHtml(l.numero)}</span><span>·</span><span>${l.vence}</span><span class="font-bold">${l.cantidad}u</span></span>`).join('')}
        </div>
      </div>
      <div class="pt-3.5 mb-4 space-y-1.5" style="border-top:1px solid var(--border-soft);">
        ${p.codigo_barra ? `<div class="flex items-center gap-2"><span class="text-[10px] w-16" style="color:var(--text-3);">Barra:</span><svg class="barcode-mini" data-code="${p.codigo_barra}" width="80" height="18"></svg></div>` : ''}
        ${p.fabricante ? `<div class="flex items-center gap-2"><span class="text-[10px] w-16" style="color:var(--text-3);">Fabrica:</span><span class="text-[11px]" style="color:var(--text-2);">${escapeHtml(p.fabricante)}</span></div>` : ''}
        ${p.proveedor ? `<div class="flex items-center gap-2"><span class="text-[10px] w-16" style="color:var(--text-3);">Surte:</span><span class="text-[11px]" style="color:var(--text-2);">${escapeHtml(p.proveedor)}</span></div>` : ''}
      </div>
      <div class="flex gap-2">
        <button onclick="abrirStockModal(${p.id})" class="flex-1 py-2.5 text-xs font-bold rounded-xl transition" style="background:rgba(167,139,250,.1); color:var(--violet-ink);">📦 Stock</button>
        <button onclick="abrirEditar(${p.id})" class="flex-1 py-2.5 text-xs font-bold rounded-xl transition" style="background:rgba(251,191,36,.1); color:var(--amber-ink);">✏️ Editar</button>
        ${p.codigo_barra ? `<button onclick="abrirBarcodeModal(${p.id})" class="py-2.5 px-3 text-xs font-bold rounded-xl transition" style="background:var(--tint-3); color:var(--text-2);">📊</button>` : ''}
        <button onclick="eliminarProducto(${p.id}, '${escapeHtml(p.nombre)}')" class="py-2.5 px-3 text-xs font-bold rounded-xl transition" style="background:rgba(251,113,133,.1); color:var(--red-ink);">🗑️</button>
      </div>`;
    grid.appendChild(div);
  });
  document.querySelectorAll('.barcode-mini').forEach(svg => {
    const code = svg.dataset.code;
    if (code) { try { JsBarcode(svg, code, { format: 'CODE128', width: 1, height: 15, displayValue: false, margin: 0, background: 'transparent', lineColor: '#94A3B8' }); } catch (e) {} }
  });
}

function filtrarProductos() {
  const q = document.getElementById('buscador').value.toLowerCase();
  let count = 0;
  document.querySelectorAll('#productos-grid > div').forEach(f => {
    const match = (f.dataset.nombre || '').includes(q) || (f.dataset.barra || '').includes(q);
    f.style.display = match ? '' : 'none';
    if (match) count++;
  });
  document.getElementById('sin-resultados').classList.toggle('hidden', count > 0);
}

function renderAlertas() {
  const cont = document.getElementById('alertas-lista');
  const alertas = productos.filter(p => stockTotal(p) <= p.minimo);
  if (alertas.length === 0) {
    cont.innerHTML = `<div class="card p-16 text-center"><span class="text-5xl block mb-4">✅</span><h3 class="text-lg font-bold mb-2" style="color:var(--text-1);">Todo en orden</h3><p class="text-sm" style="color:var(--text-3);">No hay productos con stock crítico</p></div>`;
    return;
  }
  cont.innerHTML = alertas.map(p => `
    <div class="card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background:rgba(251,113,133,.12);"><span class="text-2xl">⚠️</span></div>
        <div>
          <h3 class="font-bold" style="color:var(--text-1);">${escapeHtml(p.nombre)}</h3>
          <p class="text-xs mt-1" style="color:var(--text-3);">Stock actual: <span class="font-bold" style="color:var(--red-ink);">${stockTotal(p)}</span> — Mínimo: <span class="font-bold" style="color:var(--text-2);">${p.minimo}</span></p>
          <p class="text-xs mt-0.5" style="color:var(--text-3);">Proveedor: ${escapeHtml(p.proveedor || 'No registrado')} | Fabricante: ${escapeHtml(p.fabricante || 'No registrado')}</p>
        </div>
      </div>
      <button onclick="abrirStockModal(${p.id})" class="px-5 py-2.5 text-white text-xs font-bold rounded-xl transition" style="background:linear-gradient(135deg, #F43F5E, #E11D48);">Ajustar Stock</button>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// CRUD PRODUCTOS
// ---------------------------------------------------------------------------
function abrirModalProducto() {
  document.getElementById('prod-id').value = '';
  ['nombre', 'barra', 'minimo', 'precio', 'fabricante', 'proveedor', 'laboracion', 'lote-numero', 'lote-vence', 'lote-cantidad']
    .forEach(id => document.getElementById('prod-' + id).value = '');
  document.getElementById('prod-categoria').value = 'Medicamentos';
  document.getElementById('modal-producto-titulo').textContent = 'Nuevo Producto';
  document.getElementById('modal-producto-icono').textContent = '➕';
  document.getElementById('lote-inicial-wrap').classList.remove('hidden');
  abrirModal('modal-producto');
}

function abrirEditar(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('prod-id').value = id;
  document.getElementById('prod-nombre').value = p.nombre;
  document.getElementById('prod-categoria').value = p.categoria;
  document.getElementById('prod-precio').value = p.precio;
  document.getElementById('prod-minimo').value = p.minimo;
  document.getElementById('prod-barra').value = p.codigo_barra || '';
  document.getElementById('prod-fabricante').value = p.fabricante || '';
  document.getElementById('prod-proveedor').value = p.proveedor || '';
  document.getElementById('prod-laboracion').value = p.fecha_laboracion || '';
  document.getElementById('modal-producto-titulo').textContent = 'Editar Producto';
  document.getElementById('modal-producto-icono').textContent = '✏️';
  document.getElementById('lote-inicial-wrap').classList.add('hidden');
  abrirModal('modal-producto');
}

async function guardarProducto() {
  const id = document.getElementById('prod-id').value;
  const nombre = document.getElementById('prod-nombre').value.trim();
  const precio = parseFloat(document.getElementById('prod-precio').value) || 0;
  if (!nombre || precio <= 0) { alert('Nombre y precio son obligatorios'); return; }

  const data = {
    nombre, categoria: document.getElementById('prod-categoria').value,
    precio, minimo: parseInt(document.getElementById('prod-minimo').value) || 0,
    codigo_barra: document.getElementById('prod-barra').value.trim(),
    fabricante: document.getElementById('prod-fabricante').value.trim(),
    proveedor: document.getElementById('prod-proveedor').value.trim(),
    fecha_laboracion: document.getElementById('prod-laboracion').value || null
  };

  if (id) {
    await supabaseClient.from('productos').update(data).eq('id', id);
    await supabaseClient.from('lotes').update({ producto_nombre: nombre }).eq('producto_id', id);
  } else {
    const { data: nuevo, error } = await supabaseClient.from('productos').insert(data).select().single();
    if (error) { alert('Error al guardar: ' + error.message); return; }
    const loteNum = document.getElementById('prod-lote-numero').value.trim();
    const loteVence = document.getElementById('prod-lote-vence').value;
    const loteCant = parseInt(document.getElementById('prod-lote-cantidad').value) || 0;
    if (loteNum && loteVence && loteCant > 0) {
      await supabaseClient.from('lotes').insert({ producto_id: nuevo.id, producto_nombre: nombre, numero: loteNum, vence: loteVence + '-01', cantidad: loteCant });
      await registrarMovimientoDirecto('Entrada', nuevo.id, nombre, loteCant, loteNum, 'Alta de producto');
    }
  }
  cerrarModal('modal-producto');
  await cargarTodo();
}

async function eliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}" del inventario?\nEsta acción no se puede deshacer.`)) return;
  await supabaseClient.from('productos').delete().eq('id', id);
  await cargarTodo();
}

// ---------------------------------------------------------------------------
// STOCK
// ---------------------------------------------------------------------------
function abrirStockModal(id) {
  stockIdActual = id;
  const p = productos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('stock-info').textContent = `${p.nombre} — Stock total: ${stockTotal(p)}`;
  const cont = document.getElementById('stock-lotes-actuales');
  cont.innerHTML = p.lotes.length
    ? '<p class="text-[10px] font-bold uppercase mb-2" style="color:var(--text-3);">Lotes actuales:</p>' +
      p.lotes.map(l => `<div class="flex justify-between items-center px-4 py-2.5 rounded-lg text-xs font-medium" style="${lotesColor(l.vence)}"><span class="font-mono">${l.numero}</span><span>Vence: ${l.vence}</span><span class="font-bold">${l.cantidad}u</span></div>`).join('')
    : '';
  document.getElementById('stock-lote').value = '';
  document.getElementById('stock-vence').value = '';
  document.getElementById('stock-cantidad').value = '0';
  document.getElementById('stock-motivo').value = '';
  abrirModal('modal-stock');
}

async function confirmarStock() {
  const cantidad = parseInt(document.getElementById('stock-cantidad').value) || 0;
  if (cantidad === 0) { cerrarModal('modal-stock'); return; }
  const p = productos.find(x => x.id === stockIdActual);
  if (!p) return;
  const loteNum = document.getElementById('stock-lote').value.trim();
  const loteVenceInput = document.getElementById('stock-vence').value;
  const motivo = document.getElementById('stock-motivo').value || 'Ajuste manual';

  if (loteNum && loteVenceInput) {
    const vence = loteVenceInput + '-01';
    const existente = p.lotes.find(l => l.numero === loteNum);
    if (existente) {
      const nuevaCant = Math.max(0, existente.cantidad + cantidad);
      if (nuevaCant === 0) await supabaseClient.from('lotes').delete().eq('id', existente.id);
      else await supabaseClient.from('lotes').update({ cantidad: nuevaCant }).eq('id', existente.id);
    } else if (cantidad > 0) {
      await supabaseClient.from('lotes').insert({ producto_id: p.id, producto_nombre: p.nombre, numero: loteNum, vence, cantidad });
    }
    await registrarMovimientoDirecto(cantidad > 0 ? 'Entrada' : 'Salida', p.id, p.nombre, Math.abs(cantidad), loteNum, motivo);
  } else {
    // Sin lote especifico: afecta el lote mas proximo a vencer (o crea uno generico)
    const lotesOrdenados = [...p.lotes].sort((a, b) => a.vence.localeCompare(b.vence));
    if (lotesOrdenados.length === 0 && cantidad > 0) {
      await supabaseClient.from('lotes').insert({ producto_id: p.id, producto_nombre: p.nombre, numero: 'GEN', vence: '2099-12-01', cantidad });
      await registrarMovimientoDirecto('Entrada', p.id, p.nombre, cantidad, 'GEN', motivo);
    } else if (lotesOrdenados.length > 0) {
      const primero = lotesOrdenados[0];
      const nuevaCant = Math.max(0, primero.cantidad + cantidad);
      if (nuevaCant === 0) await supabaseClient.from('lotes').delete().eq('id', primero.id);
      else await supabaseClient.from('lotes').update({ cantidad: nuevaCant }).eq('id', primero.id);
      await registrarMovimientoDirecto(cantidad > 0 ? 'Entrada' : 'Salida', p.id, p.nombre, Math.abs(cantidad), primero.numero, motivo);
    }
  }
  cerrarModal('modal-stock');
  await cargarTodo();
}

async function registrarMovimientoDirecto(tipo, producto_id, producto, cantidad, lote, motivo) {
  await supabaseClient.from('movimientos').insert({ tipo, producto_id, producto, cantidad, lote: lote || 'N/A', motivo, usuario: miPerfil ? (miPerfil.nombre + ' ' + miPerfil.apellido) : '' });
}

// ---------------------------------------------------------------------------
// MOVIMIENTOS (manual, desde la pestaña Movimientos)
// ---------------------------------------------------------------------------
function poblarSelectProductos() {
  const sel = document.getElementById('mov-producto');
  sel.innerHTML = '<option value="">Seleccionar...</option>' +
    productos.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (Stock: ${stockTotal(p)})</option>`).join('');
}

async function registrarMovimiento() {
  const tipo = document.getElementById('mov-tipo').value;
  const pid = parseInt(document.getElementById('mov-producto').value);
  const cantidad = parseInt(document.getElementById('mov-cantidad').value) || 0;
  const loteNum = document.getElementById('mov-lote').value.trim();
  const loteVenceInput = document.getElementById('mov-vence').value;
  const motivo = document.getElementById('mov-motivo').value;
  if (!pid || cantidad <= 0) { alert('Selecciona producto y cantidad válida'); return; }
  const p = productos.find(x => x.id === pid);
  if (!p) return;

  if (tipo === 'Entrada') {
    const existente = loteNum ? p.lotes.find(l => l.numero === loteNum) : null;
    if (existente) {
      const upd = { cantidad: existente.cantidad + cantidad };
      if (loteVenceInput) upd.vence = loteVenceInput + '-01';
      await supabaseClient.from('lotes').update(upd).eq('id', existente.id);
    } else {
      await supabaseClient.from('lotes').insert({ producto_id: pid, producto_nombre: p.nombre, numero: loteNum || 'NUEVO', vence: (loteVenceInput || '2099-12') + '-01', cantidad });
    }
  } else {
    let restante = cantidad;
    const lotesOrdenados = [...p.lotes].sort((a, b) => a.vence.localeCompare(b.vence));
    for (const l of lotesOrdenados) {
      if (restante <= 0) break;
      if (l.cantidad <= restante) { restante -= l.cantidad; await supabaseClient.from('lotes').delete().eq('id', l.id); }
      else { await supabaseClient.from('lotes').update({ cantidad: l.cantidad - restante }).eq('id', l.id); restante = 0; }
    }
  }
  await registrarMovimientoDirecto(tipo, pid, p.nombre, cantidad, loteNum || 'N/A', motivo);
  document.getElementById('mov-cantidad').value = '';
  document.getElementById('mov-lote').value = '';
  document.getElementById('mov-motivo').value = '';
  await cargarTodo();
}

function renderMovimientos() {
  const tbody = document.getElementById('tabla-movimientos');
  if (movimientos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-16 text-center" style="color:var(--text-3);"><span class="text-4xl block mb-3">📭</span>No hay movimientos registrados</td></tr>`;
    return;
  }
  tbody.innerHTML = movimientos.map(m => `
    <tr style="border-bottom:1px solid var(--border-soft);">
      <td class="p-4 pl-7 text-sm font-mono" style="color:var(--text-2);">${new Date(m.fecha).toLocaleString('es-VE')}</td>
      <td class="p-4">${m.tipo === 'Entrada'
        ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold" style="background:rgba(16,232,166,.1); color:var(--emerald-ink); border:1px solid rgba(16,232,166,.25);">Entrada</span>'
        : '<span class="px-2.5 py-1 rounded-full text-xs font-bold" style="background:rgba(251,113,133,.1); color:var(--red-ink); border:1px solid rgba(251,113,133,.25);">Salida</span>'}</td>
      <td class="p-4 text-sm font-bold" style="color:var(--text-1);">${escapeHtml(m.producto)}</td>
      <td class="p-4 text-sm font-mono" style="color:var(--text-2);">${escapeHtml(m.lote || '')}</td>
      <td class="p-4 text-sm font-bold" style="color:${m.tipo === 'Entrada' ? 'var(--emerald)' : 'var(--red)'};">${m.tipo === 'Entrada' ? '+' : '-'}${m.cantidad}</td>
      <td class="p-4 text-sm" style="color:var(--text-2);">${escapeHtml(m.motivo || '')}</td>
    </tr>`).join('');
}

// ---------------------------------------------------------------------------
// USUARIOS Y PERMISOS
// ---------------------------------------------------------------------------
function renderUsuarios() {
  const tbody = document.getElementById('tabla-usuarios');
  if (usuarios.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center" style="color:var(--text-3);">Aún no hay usuarios registrados.</td></tr>`; return; }
  tbody.innerHTML = usuarios.map(u => `
    <tr style="border-bottom:1px solid var(--border-soft);">
      <td class="p-4 pl-7">
        <p class="text-sm font-bold" style="color:var(--text-1);">${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}</p>
      </td>
      <td class="p-4 text-sm font-mono" style="color:var(--text-2);">${u.tipo_cedula}-${escapeHtml(u.cedula)}</td>
      <td class="p-4 text-sm" style="color:var(--text-2);">${escapeHtml(u.telefono || '—')}</td>
      <td class="p-4"><span class="badge-rol badge-${u.rol}">${etiquetaRol(u.rol)}</span></td>
      <td class="p-4 pr-7">
        <select onchange="cambiarRol('${u.id}', this.value)" class="input-dark px-3 py-2 rounded-lg text-xs" ${u.id === miPerfil.id ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>
          <option value="sin_permisos" ${u.rol === 'sin_permisos' ? 'selected' : ''}>Sin permisos</option>
          <option value="cajero" ${u.rol === 'cajero' ? 'selected' : ''}>Cajero</option>
          <option value="administrador" ${u.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
        </select>
      </td>
    </tr>`).join('');
}

function etiquetaRol(rol) {
  return { sin_permisos: 'Sin permisos', cajero: 'Cajero', administrador: 'Administrador' }[rol] || rol;
}

async function cambiarRol(userId, nuevoRol) {
  const { error } = await supabaseClient.from('perfiles').update({ rol: nuevoRol }).eq('id', userId);
  if (error) { alert('No se pudo cambiar el rol: ' + error.message); }
  await cargarUsuarios();
  renderUsuarios();
  renderStats();
}

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function abrirModal(id) { const el = document.getElementById(id); el.classList.remove('hidden'); el.classList.add('flex'); }
function cerrarModal(id) { const el = document.getElementById(id); el.classList.add('hidden'); el.classList.remove('flex'); }
function abrirBarcodeModal(id) {
  const p = productos.find(x => x.id === id);
  if (!p || !p.codigo_barra) return;
  document.getElementById('barcode-producto-nombre').textContent = p.nombre;
  document.getElementById('barcode-numero').textContent = p.codigo_barra;
  const svg = document.getElementById('barcode-display');
  svg.innerHTML = '';
  JsBarcode(svg, p.codigo_barra, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 16, margin: 8 });
  abrirModal('modal-barcode');
}
function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
