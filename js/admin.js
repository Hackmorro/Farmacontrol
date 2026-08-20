// =============================================================================
// FarmaControl — admin.js
// =============================================================================

let productos = [];   // productos con .lotes anidados
let movimientos = [];
let usuarios = [];
let stockIdActual = null;
let miPerfil = null;

function stockTotal(p) { return (p.lotes || []).reduce((s, l) => s + l.cantidad, 0); }

// Llena todos los <select class="select-lote-letra"> con A-Z
function poblarLetrasLote() {
  const opciones = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
    .map(l => `<option value="${l}">${l}</option>`).join('');
  document.querySelectorAll('.select-lote-letra').forEach(sel => { sel.innerHTML = opciones; });
}

// Combina letra + 4 dígitos en un solo número de lote, ej. "A" + "3455" -> "A3455"
function leerLote(prefijoId) {
  const letra = document.getElementById(prefijoId + '-letra').value;
  const numero = document.getElementById(prefijoId + '-num4').value.trim();
  return numero ? (letra + numero) : '';
}

(async () => {
  const auth = await requireRol(['administrador']);
  if (!auth) return;
  miPerfil = auth.perfil;
  document.getElementById('nombre-usuario').textContent = miPerfil.nombre + ' ' + miPerfil.apellido;
  document.getElementById('avatar-inicial').textContent = (miPerfil.nombre[0] || 'A').toUpperCase();
  poblarLetrasLote();
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
  ['inventario', 'alertas', 'movimientos', 'usuarios', 'reportes'].forEach(t => {
    document.getElementById('panel-' + t).classList.toggle('hidden', t !== tab);
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'usuarios') refrescarUsuarios();
  if (tab === 'reportes') cargarReportes();
}

async function refrescarUsuarios() {
  const btn = document.getElementById('btn-refrescar-usuarios');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Actualizando...'; }
  await cargarUsuarios();
  renderUsuarios();
  renderStats();
  if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Actualizar lista'; }
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
      <div class="space-y-2">
        <div class="flex gap-2">
          <button onclick="abrirStockModal(${p.id})" class="flex-1 py-2.5 text-xs font-bold rounded-xl transition" style="background:rgba(16,232,166,.1); color:var(--emerald-ink);">📥 Carga</button>
          <button onclick="abrirDescargoModal(${p.id})" class="flex-1 py-2.5 text-xs font-bold rounded-xl transition" style="background:rgba(251,113,133,.1); color:var(--red-ink);">📤 Descargo</button>
        </div>
        <div class="flex gap-2">
          <button onclick="abrirEditar(${p.id})" class="flex-1 py-2.5 text-xs font-bold rounded-xl transition" style="background:rgba(251,191,36,.1); color:var(--amber-ink);">✏️ Editar</button>
          ${p.codigo_barra ? `<button onclick="abrirBarcodeModal(${p.id})" class="py-2.5 px-3 text-xs font-bold rounded-xl transition" style="background:var(--tint-3); color:var(--text-2);">📊</button>` : ''}
          <button onclick="eliminarProducto(${p.id}, '${escapeHtml(p.nombre)}')" class="py-2.5 px-3 text-xs font-bold rounded-xl transition" style="background:rgba(251,113,133,.1); color:var(--red-ink);">🗑️</button>
        </div>
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
      <button onclick="abrirStockModal(${p.id})" class="px-5 py-2.5 text-white text-xs font-bold rounded-xl transition" style="background:linear-gradient(135deg, var(--emerald), var(--emerald-dim));">📥 Cargar Stock</button>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// CRUD PRODUCTOS
// ---------------------------------------------------------------------------
function abrirModalProducto() {
  document.getElementById('prod-id').value = '';
  ['nombre', 'barra', 'minimo', 'precio', 'fabricante', 'proveedor', 'laboracion', 'lote-vence', 'lote-cantidad']
    .forEach(id => document.getElementById('prod-' + id).value = '');
  document.getElementById('prod-lote-num4').value = '';
  document.getElementById('prod-lote-letra').value = 'A';
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
    const loteVencePrevio = document.getElementById('prod-lote-vence').value;
    if (loteVencePrevio && !validarFechaVencimiento('prod-lote-vence', 'prod-lote-vence-error')) { return; }
    const { data: nuevo, error } = await supabaseClient.from('productos').insert(data).select().single();
    if (error) { alert('Error al guardar: ' + error.message); return; }
    const loteNum = leerLote('prod-lote');
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
// VALIDACIÓN DE FECHAS DE VENCIMIENTO
// No tiene sentido registrar un lote nuevo con una fecha de vencimiento ya
// pasada (por ejemplo, escribir "1999" por error). Se acepta desde el mes
// actual hasta 15 años a futuro como rango razonable.
// ---------------------------------------------------------------------------
function fechaVencimientoValida(valorMes) {
  if (!valorMes) return { ok: true }; // vacío se valida aparte según el formulario
  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [anio, mes] = valorMes.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, 1);
  if (fecha < inicioMesActual) return { ok: false, error: 'La fecha de vencimiento no puede ser anterior al mes actual.' };
  const limiteFuturo = new Date(hoy.getFullYear() + 15, hoy.getMonth(), 1);
  if (fecha > limiteFuturo) return { ok: false, error: 'Esa fecha está demasiado lejos en el futuro, revisa el año.' };
  return { ok: true };
}

function validarFechaVencimiento(inputId, errorId) {
  const input = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  const resultado = fechaVencimientoValida(input.value);
  if (!resultado.ok) {
    errorEl.textContent = resultado.error;
    errorEl.classList.remove('hidden');
    input.style.borderColor = 'var(--red)';
  } else {
    errorEl.classList.add('hidden');
    input.style.borderColor = '';
  }
  return resultado.ok;
}

// ---------------------------------------------------------------------------
// CARGA DE STOCK (solo entradas: compra, devolución, alta de mercancía)
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
  document.getElementById('stock-lote-num4').value = '';
  document.getElementById('stock-lote-letra').value = 'A';
  document.getElementById('stock-vence').value = '';
  document.getElementById('stock-cantidad').value = '';
  document.getElementById('stock-motivo').value = '';
  document.getElementById('stock-vence-error').classList.add('hidden');
  abrirModal('modal-stock');
}

let guardandoStock = false;
async function confirmarStock() {
  if (guardandoStock) return; // evita duplicados si se toca el botón varias veces seguidas
  const cantidad = parseInt(document.getElementById('stock-cantidad').value) || 0;
  const p = productos.find(x => x.id === stockIdActual);
  if (!p) return;
  const loteNum = leerLote('stock-lote');
  const loteVenceInput = document.getElementById('stock-vence').value;
  const motivo = document.getElementById('stock-motivo').value || 'Carga de stock';

  if (cantidad <= 0) { alert('Indica la cantidad que está entrando (mayor a 0).'); return; }
  if (!loteNum || !loteVenceInput) { alert('El número de lote (letra + 4 dígitos) y la fecha de vencimiento son obligatorios para cargar stock.'); return; }
  if (!validarFechaVencimiento('stock-vence', 'stock-vence-error')) { return; }

  const btn = document.getElementById('btn-confirmar-carga');
  guardandoStock = true;
  const textoOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Guardando...'; }

  try {
    const vence = loteVenceInput + '-01';
    const loteNumNorm = loteNum.toLowerCase();
    const existente = p.lotes.find(l => l.numero.trim().toLowerCase() === loteNumNorm);
    if (existente) {
      await supabaseClient.from('lotes').update({ cantidad: existente.cantidad + cantidad, vence }).eq('id', existente.id);
    } else {
      await supabaseClient.from('lotes').insert({ producto_id: p.id, producto_nombre: p.nombre, numero: loteNum, vence, cantidad });
    }
    await registrarMovimientoDirecto('Entrada', p.id, p.nombre, cantidad, loteNum, motivo);

    cerrarModal('modal-stock');
    await cargarTodo();
  } finally {
    guardandoStock = false;
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

// ---------------------------------------------------------------------------
// DESCARGO (salidas que NO son venta: vencido, dañado, perdido, robado, anulado)
// ---------------------------------------------------------------------------
let descargoIdActual = null;

function abrirDescargoModal(id) {
  descargoIdActual = id;
  const p = productos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('descargo-info').textContent = `${p.nombre} — Stock total: ${stockTotal(p)}`;
  const sel = document.getElementById('descargo-lote');
  if (p.lotes.length === 0) {
    sel.innerHTML = '<option value="">Sin lotes con stock</option>';
  } else {
    sel.innerHTML = p.lotes.map(l => `<option value="${l.id}">${l.numero} — vence ${l.vence} — ${l.cantidad}u disponibles</option>`).join('');
  }
  document.getElementById('descargo-cantidad').value = '';
  document.getElementById('descargo-motivo').value = 'Vencido';
  document.getElementById('descargo-nota').value = '';
  abrirModal('modal-descargo');
}

let guardandoDescargo = false;
async function confirmarDescargo() {
  if (guardandoDescargo) return;
  const p = productos.find(x => x.id === descargoIdActual);
  if (!p) return;
  const loteId = parseInt(document.getElementById('descargo-lote').value);
  const cantidad = parseInt(document.getElementById('descargo-cantidad').value) || 0;
  const motivo = document.getElementById('descargo-motivo').value;
  const nota = document.getElementById('descargo-nota').value.trim();
  const lote = p.lotes.find(l => l.id === loteId);

  if (!lote) { alert('Selecciona un lote válido.'); return; }
  if (cantidad <= 0) { alert('Indica la cantidad a descargar (mayor a 0).'); return; }
  if (cantidad > lote.cantidad) { alert(`Ese lote solo tiene ${lote.cantidad} unidades disponibles.`); return; }

  const btn = document.getElementById('btn-confirmar-descargo');
  guardandoDescargo = true;
  const textoOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Guardando...'; }

  try {
    const nuevaCant = lote.cantidad - cantidad;
    if (nuevaCant === 0) await supabaseClient.from('lotes').delete().eq('id', lote.id);
    else await supabaseClient.from('lotes').update({ cantidad: nuevaCant }).eq('id', lote.id);

    const motivoCompleto = `Descargo: ${motivo}` + (nota ? ` — ${nota}` : '');
    await registrarMovimientoDirecto('Salida', p.id, p.nombre, cantidad, lote.numero, motivoCompleto);

    cerrarModal('modal-descargo');
    await cargarTodo();
  } finally {
    guardandoDescargo = false;
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
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
  const loteNum = leerLote('mov-lote');
  const loteVenceInput = document.getElementById('mov-vence').value;
  const motivo = document.getElementById('mov-motivo').value;
  if (!pid || cantidad <= 0) { alert('Selecciona producto y cantidad válida'); return; }
  if (loteVenceInput && !validarFechaVencimiento('mov-vence', 'mov-vence-error')) { return; }
  const p = productos.find(x => x.id === pid);
  if (!p) return;

  if (tipo === 'Entrada') {
    const loteNumNorm = loteNum.toLowerCase();
    const existente = loteNum ? p.lotes.find(l => l.numero.trim().toLowerCase() === loteNumNorm) : null;
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
  document.getElementById('mov-lote-num4').value = '';
  document.getElementById('mov-lote-letra').value = 'A';
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
  if (usuarios.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center" style="color:var(--text-3);">Aún no hay usuarios registrados.</td></tr>`; return; }
  tbody.innerHTML = usuarios.map(u => `
    <tr style="border-bottom:1px solid var(--border-soft);">
      <td class="p-4 pl-7">
        <p class="text-sm font-bold" style="color:var(--text-1);">${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}</p>
      </td>
      <td class="p-4 text-sm font-mono" style="color:var(--text-2);">${u.tipo_cedula}-${escapeHtml(u.cedula)}</td>
      <td class="p-4 text-sm" style="color:var(--text-2);">${escapeHtml(u.telefono || '—')}</td>
      <td class="p-4"><span class="badge-rol badge-${u.rol}">${etiquetaRol(u.rol)}</span></td>
      <td class="p-4">
        <select onchange="cambiarRol('${u.id}', this.value)" class="input-dark px-3 py-2 rounded-lg text-xs" ${u.id === miPerfil.id ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>
          <option value="sin_permisos" ${u.rol === 'sin_permisos' ? 'selected' : ''}>Sin permisos</option>
          <option value="cajero" ${u.rol === 'cajero' ? 'selected' : ''}>Cajero</option>
          <option value="administrador" ${u.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
        </select>
      </td>
      <td class="p-4 pr-7">
        ${(u.id === miPerfil.id || !miPerfil.es_dueno)
          ? `<span class="text-xs" style="color:var(--text-3);" title="${u.id === miPerfil.id ? 'No puedes eliminar tu propia cuenta' : 'Solo el dueño del sistema puede eliminar usuarios'}">—</span>`
          : `<button onclick="eliminarUsuario('${u.id}', '${escapeHtml(u.nombre)} ${escapeHtml(u.apellido)}')" class="p-2 rounded-lg transition text-lg" style="color:var(--red-ink);" title="Eliminar del sistema por completo">🗑️</button>`}
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

async function eliminarUsuario(userId, nombreCompleto) {
  if (userId === miPerfil.id) return; // protección extra: nunca te eliminas a ti mismo
  if (!miPerfil.es_dueno) { alert('Solo el dueño del sistema puede eliminar usuarios.'); return; }
  if (!confirm(`¿Eliminar a "${nombreCompleto}" del sistema?\n\nSe borrará su ficha Y su cuenta de acceso por completo. Si vuelve a registrarse con el mismo correo, será tratado como un usuario totalmente nuevo (le llegará el correo de confirmación otra vez).\n\nEsta acción no se puede deshacer.`)) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const { data, error } = await supabaseClient.functions.invoke('eliminar-usuario', {
    body: { userId },
    headers: { Authorization: `Bearer ${session.access_token}` }
  });

  if (error || (data && data.error)) {
    alert('No se pudo eliminar: ' + (error?.message || data.error));
    return;
  }
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

// ---------------------------------------------------------------------------
// REPORTES (ventas del día + movimientos categorizados del día)
// ---------------------------------------------------------------------------
function categorizarMovimiento(m) {
  if (m.tipo === 'Entrada') return { etiqueta: 'Carga', color: 'background:rgba(16,232,166,.1); color:var(--emerald-ink);' };
  if ((m.motivo || '').startsWith('Venta POS')) return { etiqueta: 'Venta', color: 'background:rgba(34,211,238,.1); color:var(--cyan-ink);' };
  if ((m.motivo || '').startsWith('Descargo')) return { etiqueta: 'Descargo', color: 'background:rgba(251,113,133,.1); color:var(--red-ink);' };
  return { etiqueta: 'Salida', color: 'background:rgba(251,191,36,.1); color:var(--amber-ink);' };
}

async function cargarReportes() {
  const btn = document.getElementById('btn-refrescar-reportes');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Actualizando...'; }

  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
  document.getElementById('reporte-fecha-hoy').textContent = hoy.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const [{ data: facturasHoy }, { data: movimientosHoy }] = await Promise.all([
    supabaseClient.from('facturas').select('*').gte('fecha', inicioHoy).order('fecha', { ascending: false }),
    supabaseClient.from('movimientos').select('*').gte('fecha', inicioHoy).order('fecha', { ascending: false })
  ]);

  const facturas = facturasHoy || [];
  const movimientos = movimientosHoy || [];
  const totalHoy = facturas.reduce((s, f) => s + Number(f.total), 0);

  document.getElementById('rep-total-hoy').textContent = '$' + totalHoy.toFixed(2);
  document.getElementById('rep-cant-ventas').textContent = facturas.length;
  document.getElementById('rep-ticket-prom').textContent = '$' + (facturas.length ? totalHoy / facturas.length : 0).toFixed(2);

  const tbodyVentas = document.getElementById('tabla-ventas-hoy');
  tbodyVentas.innerHTML = facturas.length === 0
    ? `<tr><td colspan="6" class="p-10 text-center" style="color:var(--text-3);">Todavía no hay ventas registradas hoy.</td></tr>`
    : facturas.map(f => `
      <tr style="border-bottom:1px solid var(--border-soft);">
        <td class="p-4 pl-7 text-sm font-mono" style="color:var(--text-2);">${new Date(f.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</td>
        <td class="p-4 text-sm font-mono" style="color:var(--text-1);">${escapeHtml(f.folio)}</td>
        <td class="p-4 text-sm" style="color:var(--text-2);">${escapeHtml(f.cliente || 'Consumidor Final')}</td>
        <td class="p-4 text-sm" style="color:var(--text-2);">${escapeHtml(f.cajero || '')}</td>
        <td class="p-4 text-sm" style="color:var(--text-2);">${escapeHtml(f.metodo_pago || '')}</td>
        <td class="p-4 pr-7 text-sm font-bold" style="color:var(--emerald-ink);">$${Number(f.total).toFixed(2)}</td>
      </tr>`).join('');

  const tbodyMov = document.getElementById('tabla-movimientos-hoy');
  tbodyMov.innerHTML = movimientos.length === 0
    ? `<tr><td colspan="6" class="p-10 text-center" style="color:var(--text-3);">Todavía no hay movimientos registrados hoy.</td></tr>`
    : movimientos.map(m => {
        const cat = categorizarMovimiento(m);
        return `<tr style="border-bottom:1px solid var(--border-soft);">
          <td class="p-4 pl-7 text-sm font-mono" style="color:var(--text-2);">${new Date(m.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</td>
          <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-bold" style="${cat.color}">${cat.etiqueta}</span></td>
          <td class="p-4 text-sm font-bold" style="color:var(--text-1);">${escapeHtml(m.producto)}</td>
          <td class="p-4 text-sm font-mono" style="color:var(--text-2);">${escapeHtml(m.lote || '')}</td>
          <td class="p-4 text-sm font-bold" style="color:${m.tipo === 'Entrada' ? 'var(--emerald)' : 'var(--red)'};">${m.tipo === 'Entrada' ? '+' : '-'}${m.cantidad}</td>
          <td class="p-4 pr-7 text-sm" style="color:var(--text-2);">${escapeHtml(m.motivo || '')}</td>
        </tr>`;
      }).join('');

  if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Actualizar'; }
}
