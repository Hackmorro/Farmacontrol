// =============================================================================
// FarmaControl — pos.js
// =============================================================================

let productos = [];
let carrito = [];
let metodoPago = 'Efectivo';
let miPerfilPOS = null;

function stockTotal(p) { return (p.lotes || []).reduce((s, l) => s + l.cantidad, 0); }

(async () => {
  const auth = await requireRol(['administrador', 'cajero']);
  if (!auth) return;
  miPerfilPOS = auth.perfil;
  document.getElementById('nombre-usuario').textContent = miPerfilPOS.nombre + ' ' + miPerfilPOS.apellido;
  if (miPerfilPOS.rol === 'administrador') document.getElementById('link-admin').classList.remove('hidden');
  await cargarProductos();
  renderProductos();
})();

async function cargarProductos() {
  const { data: prods } = await supabaseClient.from('productos').select('*').order('id');
  const { data: lotes } = await supabaseClient.from('lotes').select('*');
  productos = (prods || []).map(p => ({ ...p, lotes: (lotes || []).filter(l => l.producto_id === p.id) }));
}

let categoriaActual = 'Todos';

function renderProductos() {
  const cont = document.getElementById('productos-container');
  cont.innerHTML = productos.map(p => `
    <div class="card-producto p-5 rounded-2xl flex flex-col justify-between producto" data-categoria="${p.categoria}" data-id="${p.id}" data-nombre="${p.nombre.toLowerCase()}" data-barra="${(p.codigo_barra || '').toLowerCase()}">
      <div>
        ${p.imagen_url ? `<div class="w-full aspect-square rounded-xl overflow-hidden mb-3" style="background:#fff;"><img src="${p.imagen_url}" class="w-full h-full object-contain" loading="lazy"></div>` : ''}
        <div class="flex justify-between items-start mb-3">
          <span class="text-lg font-bold px-3 py-2 rounded-xl" style="background:rgba(16,232,166,.1); color:var(--emerald-ink);">${p.categoria.slice(0, 2)}</span>
          <span class="text-xs px-2.5 py-1.5 rounded-lg font-semibold" style="background:var(--tint-2); color:var(--text-2);">Stock: <span class="stock-val">${stockTotal(p)}</span></span>
        </div>
        <h4 class="font-bold text-sm leading-snug" style="color:var(--text-1);">${escapeHtml(p.nombre)}</h4>
        <p class="text-xs mt-1.5" style="color:var(--text-3);">${escapeHtml(p.categoria)}</p>
        ${p.codigo_barra ? `<div class="mt-3 rounded-lg py-1.5 px-2" style="overflow:hidden; background:var(--tint-1);"><svg class="barcode-mini" data-code="${p.codigo_barra}"></svg></div>` : ''}
        ${p.fabricante ? `<p class="text-[10px] mt-2" style="color:var(--text-3);">🏭 ${escapeHtml(p.fabricante)} | 📦 ${escapeHtml(p.proveedor || '')}</p>` : ''}
      </div>
      <div class="mt-5 pt-4 space-y-3" style="border-top:1px solid var(--border-soft);">
        <span class="text-lg font-extrabold block" style="color:var(--emerald-ink);">$${Number(p.precio).toFixed(2)}</span>
        <button onclick="agregar(${p.id})" class="btn-add w-full py-2.5 text-slate-950 rounded-xl text-xs font-bold transition">+ Añadir</button>
      </div>
    </div>`).join('');

  document.querySelectorAll('.barcode-mini').forEach(svg => {
    const code = svg.dataset.code;
    if (code) {
      try {
        JsBarcode(svg, code, { format: 'CODE128', width: 1.4, height: 26, displayValue: false, margin: 0, background: 'transparent', lineColor: '#64748B' });
        const w = svg.getAttribute('width'), h = svg.getAttribute('height');
        if (w && h) { svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.removeAttribute('width'); svg.removeAttribute('height'); }
      } catch (e) {}
    }
  });
  aplicarFiltros();
}

function filtrar(cat) {
  categoriaActual = cat;
  document.querySelectorAll('[id^="cat-"]').forEach(b => b.classList.toggle('active', b.id === 'cat-' + cat));
  document.querySelectorAll('[id^="mcat-"]').forEach(b => b.classList.toggle('active', b.id === 'mcat-' + cat));
  aplicarFiltros();
}

function filtrarBusquedaPOS() {
  aplicarFiltros();
}

function aplicarFiltros() {
  const q = (document.getElementById('pos-buscador').value || '').toLowerCase().trim();
  let visibles = 0;
  document.querySelectorAll('.producto').forEach(el => {
    const coincideCategoria = categoriaActual === 'Todos' || el.dataset.categoria === categoriaActual;
    const coincideBusqueda = !q || (el.dataset.nombre || '').includes(q) || (el.dataset.barra || '').includes(q);
    const visible = coincideCategoria && coincideBusqueda;
    el.style.display = visible ? 'flex' : 'none';
    if (visible) visibles++;
  });
  document.getElementById('pos-sin-resultados').classList.toggle('hidden', visibles > 0);
}

function actualizarStockUI(id) {
  const prod = productos.find(p => p.id === id);
  const total = prod ? stockTotal(prod) : 0;
  document.querySelectorAll(`.producto[data-id="${id}"] .stock-val`).forEach(el => el.textContent = total);
}

function deducirLote(prod, cantidad) {
  const lotes = [...prod.lotes].sort((a, b) => a.vence.localeCompare(b.vence));
  let restante = cantidad;
  for (const l of lotes) {
    if (restante <= 0) break;
    if (l.cantidad <= restante) { restante -= l.cantidad; l.cantidad = 0; }
    else { l.cantidad -= restante; restante = 0; }
  }
  prod.lotes = lotes.filter(l => l.cantidad > 0);
}

function agregar(id) {
  const prod = productos.find(p => p.id === id);
  if (!prod || stockTotal(prod) <= 0) { alert('Stock insuficiente'); return; }
  const idx = carrito.findIndex(c => c.id === id);
  if (idx >= 0) carrito[idx].cantidad++;
  else carrito.push({ id, nombre: prod.nombre, precio: Number(prod.precio), cantidad: 1 });
  deducirLote(prod, 1);
  actualizarStockUI(id);
  renderCarrito();
}

function cambiarCantidad(id, delta) {
  const idx = carrito.findIndex(c => c.id === id);
  if (idx < 0) return;
  const prod = productos.find(p => p.id === id);
  if (delta > 0) {
    if (!prod || stockTotal(prod) <= 0) { alert('Stock insuficiente'); return; }
    carrito[idx].cantidad++;
    deducirLote(prod, 1);
  } else {
    carrito[idx].cantidad--;
    if (prod) {
      const loteGen = prod.lotes.find(l => l.numero === 'GEN') || (prod.lotes.length > 0 ? prod.lotes[prod.lotes.length - 1] : null);
      if (loteGen) loteGen.cantidad++;
      else prod.lotes.push({ numero: 'GEN', vence: '2099-12-01', cantidad: 1 });
    }
    if (carrito[idx].cantidad <= 0) carrito.splice(idx, 1);
  }
  if (prod) actualizarStockUI(id);
  renderCarrito();
}

function vaciarCarrito() {
  carrito.forEach(c => {
    const prod = productos.find(p => p.id === c.id);
    if (prod) {
      const loteGen = prod.lotes.find(l => l.numero === 'GEN') || (prod.lotes.length > 0 ? prod.lotes[prod.lotes.length - 1] : null);
      if (loteGen) loteGen.cantidad += c.cantidad;
      else prod.lotes.push({ numero: 'GEN', vence: '2099-12-01', cantidad: c.cantidad });
    }
  });
  carrito = [];
  renderCarrito();
  productos.forEach(p => actualizarStockUI(p.id));
}

function abrirCarritoMobil() {
  const panel = document.getElementById('carrito-panel');
  panel.classList.remove('hidden');
  panel.classList.add('flex');
  document.body.style.overflow = 'hidden';
}
function cerrarCarritoMobil() {
  const panel = document.getElementById('carrito-panel');
  if (window.innerWidth < 768) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
  document.body.style.overflow = '';
}

function renderCarrito() {
  const lista = document.getElementById('carrito-lista');
  const vaciarBtn = document.getElementById('vaciar-btn');
  const checkoutBtn = document.getElementById('checkout-btn');
  const flotante = document.getElementById('carrito-flotante');
  if (carrito.length === 0) {
    lista.innerHTML = '<div class="text-center py-16" style="color:var(--text-3);"><span class="text-4xl block mb-3">🛒</span><p class="text-sm">El carrito está vacío</p></div>';
    vaciarBtn.classList.add('hidden');
    checkoutBtn.disabled = true;
    document.getElementById('subtotal').textContent = '$0.00';
    document.getElementById('iva').textContent = '$0.00';
    document.getElementById('total').textContent = '$0.00';
    flotante.classList.add('hidden');
    cerrarCarritoMobil();
    return;
  }
  vaciarBtn.classList.remove('hidden');
  checkoutBtn.disabled = false;
  let subtotal = 0;
  let totalUnidades = 0;
  lista.innerHTML = carrito.map(c => {
    subtotal += c.precio * c.cantidad;
    totalUnidades += c.cantidad;
    return `<div class="flex justify-between items-center p-4 rounded-xl" style="background:var(--tint-2); border:1px solid var(--border-soft);">
      <div class="flex-1 min-w-0 pr-3"><h5 class="font-semibold text-sm truncate" style="color:var(--text-1);">${escapeHtml(c.nombre)}</h5><p class="text-xs font-bold" style="color:var(--emerald-ink);">$${c.precio.toFixed(2)} c/u</p></div>
      <div class="flex items-center gap-2">
        <button onclick="cambiarCantidad(${c.id}, -1)" class="w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center transition" style="background:var(--tint-3); color:var(--text-2); border:1px solid var(--border-soft);">-</button>
        <span class="text-sm font-bold w-6 text-center" style="color:var(--text-1);">${c.cantidad}</span>
        <button onclick="cambiarCantidad(${c.id}, 1)" class="w-7 h-7 rounded-lg font-bold text-sm flex items-center justify-center transition" style="background:var(--tint-3); color:var(--text-2); border:1px solid var(--border-soft);">+</button>
      </div></div>`;
  }).join('');
  const iva = subtotal * 0.16;
  const total = subtotal + iva;
  document.getElementById('subtotal').textContent = '$' + subtotal.toFixed(2);
  document.getElementById('iva').textContent = '$' + iva.toFixed(2);
  document.getElementById('total').textContent = '$' + total.toFixed(2);

  // Barra flotante (solo visible en móvil vía CSS md:hidden)
  document.getElementById('carrito-flotante-count').textContent = totalUnidades;
  document.getElementById('carrito-flotante-total').textContent = '$' + total.toFixed(2);
  flotante.classList.remove('hidden');
}

function abrirCheckout() {
  if (carrito.length === 0) return;
  const total = carrito.reduce((a, c) => a + c.precio * c.cantidad, 0) * 1.16;
  document.getElementById('cobrar-btn').innerHTML = 'Cobrar $' + total.toFixed(2);
  abrirModal('modal-pago');
}
function cerrarCheckout() { cerrarModal('modal-pago'); }
function abrirModal(id) { const el = document.getElementById(id); el.classList.remove('hidden'); el.classList.add('flex'); }
function cerrarModal(id) { const el = document.getElementById(id); el.classList.add('hidden'); el.classList.remove('flex'); }

function selectMetodo(metodo) {
  metodoPago = metodo;
  document.querySelectorAll('#metodos-pago button').forEach(b => {
    const texto = b.textContent.trim().replace('✓', '').trim();
    const activo = texto === metodo;
    b.classList.toggle('active', activo);
    b.querySelector('span').classList.toggle('hidden', !activo);
  });
}

// ---------------------------------------------------------------------------
// CHECKOUT: descuenta stock, guarda factura en Supabase y genera el PDF
// ---------------------------------------------------------------------------
async function completarCompra() {
  if (carrito.length === 0) return;
  const cobrarBtn = document.getElementById('cobrar-btn');
  const textoOriginal = cobrarBtn.innerHTML;
  cobrarBtn.disabled = true;
  cobrarBtn.innerHTML = '<span class="spinner"></span> Procesando...';
  const overlay = document.getElementById('overlay-bloqueo');
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');

  try {
    const subtotal = carrito.reduce((a, c) => a + c.precio * c.cantidad, 0);
    const iva = subtotal * 0.16;
    const total = subtotal + iva;
    const cliente = document.getElementById('cliente-nombre').value.trim() || 'Consumidor Final';
    const nombreCajero = miPerfilPOS.nombre + ' ' + miPerfilPOS.apellido;

    // 1. Descontar stock en Supabase (lote por lote, igual que el carrito local)
    for (const item of carrito) {
      const prod = productos.find(p => p.id === item.id);
      if (!prod) continue;
      let restante = item.cantidad;
      const { data: lotesDb } = await supabaseClient.from('lotes').select('*').eq('producto_id', item.id).order('vence');
      let primerLoteUsado = lotesDb && lotesDb.length ? lotesDb[0].numero : 'N/A';
      for (const l of (lotesDb || [])) {
        if (restante <= 0) break;
        if (l.cantidad <= restante) { restante -= l.cantidad; await supabaseClient.from('lotes').delete().eq('id', l.id); }
        else { await supabaseClient.from('lotes').update({ cantidad: l.cantidad - restante }).eq('id', l.id); restante = 0; }
      }
      await supabaseClient.from('movimientos').insert({
        tipo: 'Salida', producto_id: item.id, producto: prod.nombre, cantidad: item.cantidad,
        lote: primerLoteUsado, motivo: 'Venta POS', usuario: nombreCajero
      });
    }

    // 2. Folio autonumerado y registro de la factura
    const { count } = await supabaseClient.from('facturas').select('*', { count: 'exact', head: true });
    const folio = `F-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(5, '0')}`;
    const factura = {
      folio, cliente, cajero: nombreCajero, metodo_pago: metodoPago,
      subtotal, iva, total, items: carrito.map(c => ({ nombre: c.nombre, cantidad: c.cantidad, precio: c.precio }))
    };
    await supabaseClient.from('facturas').insert(factura);

    // 3. Generar y descargar el PDF de la factura
    generarFacturaPDF(factura);

    carrito = [];
    renderCarrito();
    cerrarCheckout();
    cerrarCarritoMobil();
    await cargarProductos();
    renderProductos();
  } catch (e) {
    alert('Ocurrió un error al procesar la venta: ' + e.message);
  } finally {
    cobrarBtn.disabled = false;
    cobrarBtn.innerHTML = textoOriginal;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
}

function generarFacturaPDF(factura) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const verde = [5, 150, 105], verdeOsc = [6, 95, 70], gris = [100, 116, 139], negro = [30, 41, 59];

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...negro);
  doc.text('FarmaControl', 18, 22);
  doc.setFontSize(12); doc.setTextColor(...verde);
  doc.text('FACTURA', 195, 18, { align: 'right' });
  doc.text(factura.folio, 195, 24, { align: 'right' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
  doc.text('Farmacia & Punto de Venta · Sistema FarmaControl Web', 18, 29);
  doc.setDrawColor(...verde); doc.setLineWidth(0.6); doc.line(18, 34, 195, 34);

  const fecha = new Date(factura.fecha || Date.now()).toLocaleString('es-VE');
  doc.setFontSize(9); doc.setTextColor(...gris);
  doc.text('Cliente', 18, 42); doc.text('Atendido por', 18, 48);
  doc.text('Fecha y hora', 130, 42); doc.text('Método de pago', 130, 48);
  doc.setTextColor(...negro);
  doc.text(String(factura.cliente || 'Consumidor Final'), 45, 42);
  doc.text(String(factura.cajero || '-'), 45, 48);
  doc.text(fecha, 165, 42); doc.text(String(factura.metodo_pago || '-'), 165, 48);

  doc.autoTable({
    startY: 56,
    head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body: factura.items.map(it => [it.nombre, String(it.cantidad), '$' + it.precio.toFixed(2), '$' + (it.cantidad * it.precio).toFixed(2)]),
    headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, textColor: negro },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 18, right: 18 }
  });

  let y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9.5); doc.setTextColor(...gris);
  doc.text('Subtotal', 160, y, { align: 'right' }); doc.text('$' + factura.subtotal.toFixed(2), 195, y, { align: 'right' });
  y += 6;
  doc.text('IVA (16%)', 160, y, { align: 'right' }); doc.text('$' + factura.iva.toFixed(2), 195, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(...verde); doc.line(140, y - 4, 195, y - 4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...verdeOsc);
  doc.text('TOTAL', 160, y, { align: 'right' }); doc.text('$' + factura.total.toFixed(2), 195, y, { align: 'right' });

  y += 20;
  doc.setDrawColor(226, 232, 240); doc.line(18, y, 195, y);
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gris);
  doc.text('Gracias por su compra. Este documento es un comprobante de venta generado', 105, y, { align: 'center' });
  y += 4;
  doc.text('electrónicamente por FarmaControl Web y no requiere firma ni sello.', 105, y, { align: 'center' });
  y += 5;
  doc.text('Folio ' + factura.folio + ' · ' + new Date().toLocaleString('es-VE'), 105, y, { align: 'center' });

  doc.save('Factura-' + factura.folio + '.pdf');

  // Abre una pestaña nueva con el PDF y dispara el diálogo de impresión
  // automáticamente (además de la descarga de arriba, que sirve de respaldo).
  try {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } catch (e) { /* si el navegador bloquea la pestaña, la descarga ya se hizo */ }
}

function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
