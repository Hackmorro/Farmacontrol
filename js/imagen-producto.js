// =============================================================================
// FarmaControl — Procesamiento de fotos de producto (fondo blanco automático)
// =============================================================================
// Se usa desde admin.js al adjuntar/cambiar la foto de un producto.
//
// Qué hace:
//   1. Recibe el archivo de foto (cámara o galería del teléfono)
//   2. Si "fondo blanco automático" está activado, le quita el fondo real
//      (mesa, mostrador, mármol, lo que sea) usando @imgly/background-removal:
//      una librería de recorte con IA que corre 100% en el navegador del
//      usuario (nada se sube a ningún servidor), vía WebAssembly. La primera
//      vez que se usa en un dispositivo descarga el modelo (unos MB) y tarda
//      unos segundos más; después queda en caché y es más rápido.
//   3. Recorta el producto ya sin fondo (usando el canal alfa) y lo centra
//      sobre un lienzo cuadrado blanco de alta resolución
//   4. Devuelve un Blob JPEG listo para subir a Supabase Storage
//
// Si la IA no carga (sin internet, navegador viejo, etc.) o el usuario
// destilda el checkbox, se hace un respaldo simple: centrar la foto tal cual
// sobre el lienzo blanco, sin intentar borrar el fondo.
// =============================================================================

const IMG_PRODUCTO_LIENZO = 1200;      // tamaño final del lienzo cuadrado (px) — nítido en inventario y POS
const IMG_PRODUCTO_MARGEN = 0.07;      // margen alrededor del producto (7%)
const IMG_PRODUCTO_TRABAJO_MAX = 1400; // resolución máxima de trabajo
const IMG_PRODUCTO_CALIDAD = 0.95;     // calidad JPEG de salida
const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm';
const IMGLY_TIMEOUT_MS = 45000; // si la IA tarda más que esto (ej. internet muy lento), se usa el respaldo

let _imglyPromise = null;

function cargarRemovedorIA() {
  if (!_imglyPromise) {
    _imglyPromise = import(/* webpackIgnore: true */ IMGLY_CDN).then(mod => mod.default || mod.removeBackground || mod);
  }
  return _imglyPromise;
}

function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms))
  ]);
}

function cargarImagenDesde(fuente) {
  return new Promise((resolve, reject) => {
    const esBlob = fuente instanceof Blob;
    const url = esBlob ? URL.createObjectURL(fuente) : fuente;
    const img = new Image();
    img.onload = () => { resolve(img); if (esBlob) URL.revokeObjectURL(url); };
    img.onerror = () => { if (esBlob) URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// Recorta por transparencia: encuentra el rectángulo que contiene todos los
// píxeles no-transparentes (el producto ya sin fondo)
function recortarPorAlfa(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const umbral = 12; // alfa mínimo para contar como parte del producto
  for (let y = 0; y < height; y++) {
    const filaBase = y * width;
    for (let x = 0; x < width; x++) {
      const a = data[(filaBase + x) * 4 + 3];
      if (a > umbral) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // no se detectó nada (imagen totalmente transparente)
  return { x: minX, y: minY, w: (maxX - minX + 1), h: (maxY - minY + 1) };
}

async function quitarFondoConIA(file) {
  const removeBackground = await cargarRemovedorIA();
  const blobSinFondo = await conTimeout(removeBackground(file), IMGLY_TIMEOUT_MS);
  return blobSinFondo; // PNG con transparencia en el fondo
}

/**
 * Procesa una foto de producto: opcionalmente le quita el fondo con IA y la
 * centra sobre un lienzo cuadrado blanco en alta resolución.
 * @param {File} file
 * @param {{fondoBlanco?: boolean}} opciones
 * @returns {Promise<Blob>} JPEG listo para subir
 */
async function procesarFotoProducto(file, opciones = {}) {
  const fondoBlanco = opciones.fondoBlanco !== false;

  let imgFuente;
  let recorteAlfaDisponible = false;

  if (fondoBlanco) {
    try {
      const blobSinFondo = await quitarFondoConIA(file);
      imgFuente = await cargarImagenDesde(blobSinFondo);
      recorteAlfaDisponible = true;
    } catch (e) {
      console.warn('FarmaControl: no se pudo usar el recorte automático con IA, se centra la foto tal cual.', e);
      imgFuente = await cargarImagenDesde(file);
    }
  } else {
    imgFuente = await cargarImagenDesde(file);
  }

  // Lienzo de trabajo (a resolución acotada por rendimiento)
  const escala = Math.min(1, IMG_PRODUCTO_TRABAJO_MAX / Math.max(imgFuente.width, imgFuente.height));
  const wOrig = Math.max(1, Math.round(imgFuente.width * escala));
  const hOrig = Math.max(1, Math.round(imgFuente.height * escala));
  const cTrabajo = document.createElement('canvas');
  cTrabajo.width = wOrig; cTrabajo.height = hOrig;
  const ctxTrabajo = cTrabajo.getContext('2d');
  ctxTrabajo.drawImage(imgFuente, 0, 0, wOrig, hOrig);

  let recorte = { x: 0, y: 0, w: wOrig, h: hOrig };
  if (recorteAlfaDisponible) {
    const detectado = recortarPorAlfa(ctxTrabajo, wOrig, hOrig);
    if (detectado) recorte = detectado;
  }

  // Lienzo final: cuadrado blanco sólido, producto centrado con margen
  const final = document.createElement('canvas');
  final.width = IMG_PRODUCTO_LIENZO; final.height = IMG_PRODUCTO_LIENZO;
  const ctxFinal = final.getContext('2d');
  ctxFinal.fillStyle = '#FFFFFF';
  ctxFinal.fillRect(0, 0, IMG_PRODUCTO_LIENZO, IMG_PRODUCTO_LIENZO);
  ctxFinal.imageSmoothingEnabled = true;
  ctxFinal.imageSmoothingQuality = 'high';

  const areaUtil = IMG_PRODUCTO_LIENZO * (1 - IMG_PRODUCTO_MARGEN * 2);
  const escalaFinal = Math.min(areaUtil / recorte.w, areaUtil / recorte.h);
  const wFinal = recorte.w * escalaFinal, hFinal = recorte.h * escalaFinal;
  const offX = (IMG_PRODUCTO_LIENZO - wFinal) / 2, offY = (IMG_PRODUCTO_LIENZO - hFinal) / 2;
  ctxFinal.drawImage(cTrabajo, recorte.x, recorte.y, recorte.w, recorte.h, offX, offY, wFinal, hFinal);

  return new Promise((resolve, reject) => {
    final.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen')), 'image/jpeg', IMG_PRODUCTO_CALIDAD);
  });
}
