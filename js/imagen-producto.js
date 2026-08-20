// =============================================================================
// FarmaControl — Procesamiento de fotos de producto (fondo blanco automático)
// =============================================================================
// Se usa desde admin.js al adjuntar/cambiar la foto de un producto.
//
// Qué hace:
//   1. Recibe el archivo de foto (cámara o galería del teléfono)
//   2. Detecta el fondo por "flood fill" a partir de los bordes de la foto
//      y lo reemplaza por blanco puro, con un suavizado en el contorno
//   3. Centra el producto sobre un lienzo cuadrado blanco de 1000x1000
//   4. Devuelve un Blob JPEG liviano, listo para subir a Supabase Storage
//
// Limitación honesta: esto NO es un recorte con inteligencia artificial.
// Funciona muy bien cuando la foto se toma sobre una superficie clara y
// pareja (mesa blanca, papel, mostrador claro). Si el fondo es muy oscuro,
// tiene sombras fuertes o varios colores, el resultado puede no ser
// perfecto — para esos casos existe el checkbox "Fondo blanco automático"
// en el formulario, que si se destilda simplemente centra la foto tal
// cual sobre el lienzo blanco, sin intentar borrar el fondo.
// =============================================================================

const IMG_PRODUCTO_LIENZO = 1000;   // tamaño final del lienzo cuadrado (px)
const IMG_PRODUCTO_MARGEN = 0.08;   // margen alrededor del producto (8%)
const IMG_PRODUCTO_TRABAJO_MAX = 1100; // resolución máxima de trabajo (rendimiento)
const IMG_PRODUCTO_TOLERANCIA = 42; // distancia de color máxima para considerar "fondo"

function cargarImagenDesdeArchivo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

function distanciaColor(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Estima el color de fondo muestreando las esquinas y el punto medio de cada borde
function colorPromedioBorde(data, width, height) {
  const puntos = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)]
  ];
  let r = 0, g = 0, b = 0;
  puntos.forEach(([x, y]) => {
    const i = (y * width + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  });
  const n = puntos.length;
  return [r / n, g / n, b / n];
}

// Flood fill multi-origen desde todo el perímetro: solo "avanza" a través de
// píxeles parecidos al color de fondo estimado, y los pinta de blanco puro.
function quitarFondoFloodFill(imageData, tolerancia) {
  const { data, width, height } = imageData;
  const [br, bg, bb] = colorPromedioBorde(data, width, height);
  const total = width * height;
  const visitado = new Uint8Array(total);
  const esFondo = new Uint8Array(total);
  const cola = new Int32Array(total);
  let colaLen = 0;

  for (let x = 0; x < width; x++) { cola[colaLen++] = x; cola[colaLen++] = (height - 1) * width + x; }
  for (let y = 0; y < height; y++) { cola[colaLen++] = y * width; cola[colaLen++] = y * width + (width - 1); }

  let head = 0;
  while (head < colaLen) {
    const idx = cola[head++];
    if (visitado[idx]) continue;
    visitado[idx] = 1;
    const i = idx * 4;
    const dist = distanciaColor(data[i], data[i + 1], data[i + 2], br, bg, bb);
    if (dist > tolerancia) continue; // ya no es fondo: no seguir expandiendo por acá
    esFondo[idx] = 1;
    const x = idx % width, y = (idx / width) | 0;
    if (x > 0 && !visitado[idx - 1]) cola[colaLen++] = idx - 1;
    if (x < width - 1 && !visitado[idx + 1]) cola[colaLen++] = idx + 1;
    if (y > 0 && !visitado[idx - width]) cola[colaLen++] = idx - width;
    if (y < height - 1 && !visitado[idx + width]) cola[colaLen++] = idx + width;
  }

  for (let idx = 0; idx < total; idx++) {
    if (esFondo[idx]) {
      const i = idx * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
  }

  // Suaviza el contorno: los píxeles del producto pegados al fondo se
  // mezclan parcialmente hacia blanco según qué tan parecidos son al fondo,
  // para evitar un borde duro/pixelado.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (esFondo[idx]) continue;
      let vecinoFondo = false;
      if (x > 0 && esFondo[idx - 1]) vecinoFondo = true;
      else if (x < width - 1 && esFondo[idx + 1]) vecinoFondo = true;
      else if (y > 0 && esFondo[idx - width]) vecinoFondo = true;
      else if (y < height - 1 && esFondo[idx + width]) vecinoFondo = true;
      if (!vecinoFondo) continue;
      const i = idx * 4;
      const dist = distanciaColor(data[i], data[i + 1], data[i + 2], br, bg, bb);
      const limite = tolerancia * 1.6;
      if (dist < limite) {
        const factor = Math.max(0, 1 - dist / limite) * 0.6;
        data[i] = data[i] * (1 - factor) + 255 * factor;
        data[i + 1] = data[i + 1] * (1 - factor) + 255 * factor;
        data[i + 2] = data[i + 2] * (1 - factor) + 255 * factor;
      }
    }
  }

  return imageData;
}

/**
 * Procesa una foto de producto: opcionalmente le quita el fondo y la
 * centra sobre un lienzo cuadrado blanco.
 * @param {File} file
 * @param {{fondoBlanco?: boolean, tolerancia?: number}} opciones
 * @returns {Promise<Blob>} JPEG listo para subir
 */
async function procesarFotoProducto(file, opciones = {}) {
  const fondoBlanco = opciones.fondoBlanco !== false;
  const tolerancia = opciones.tolerancia || IMG_PRODUCTO_TOLERANCIA;

  const img = await cargarImagenDesdeArchivo(file);
  const escala = Math.min(1, IMG_PRODUCTO_TRABAJO_MAX / Math.max(img.width, img.height));
  const wOrig = Math.max(1, Math.round(img.width * escala));
  const hOrig = Math.max(1, Math.round(img.height * escala));

  const cTrabajo = document.createElement('canvas');
  cTrabajo.width = wOrig; cTrabajo.height = hOrig;
  const ctxTrabajo = cTrabajo.getContext('2d');
  ctxTrabajo.drawImage(img, 0, 0, wOrig, hOrig);

  if (fondoBlanco) {
    const imageData = ctxTrabajo.getImageData(0, 0, wOrig, hOrig);
    quitarFondoFloodFill(imageData, tolerancia);
    ctxTrabajo.putImageData(imageData, 0, 0);
  }

  const final = document.createElement('canvas');
  final.width = IMG_PRODUCTO_LIENZO; final.height = IMG_PRODUCTO_LIENZO;
  const ctxFinal = final.getContext('2d');
  ctxFinal.fillStyle = '#FFFFFF';
  ctxFinal.fillRect(0, 0, IMG_PRODUCTO_LIENZO, IMG_PRODUCTO_LIENZO);

  const areaUtil = IMG_PRODUCTO_LIENZO * (1 - IMG_PRODUCTO_MARGEN * 2);
  const escalaFinal = Math.min(areaUtil / wOrig, areaUtil / hOrig);
  const wFinal = wOrig * escalaFinal, hFinal = hOrig * escalaFinal;
  const offX = (IMG_PRODUCTO_LIENZO - wFinal) / 2, offY = (IMG_PRODUCTO_LIENZO - hFinal) / 2;
  ctxFinal.drawImage(cTrabajo, offX, offY, wFinal, hFinal);

  return new Promise((resolve, reject) => {
    final.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen')), 'image/jpeg', 0.92);
  });
}
