/* ============================================================
   Vorágine Ropa · motor de la vitrina 3D (código fuente, editable)
   Depende de: config.js (window.TIENDA), data/catalogo.js (window.CATALOGO)
   y js/vendor/three.min.js (Three.js r158).
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Datos ---------- */
  const T = Object.assign({
    nombre: 'Vorágine Ropa', linea: 'Ropa', whatsapp: '', envios: 'Envíos a toda Colombia', instagram: '',
    mensaje: 'Hola, quiero consultar precio y disponibilidad de {nombre} de {marca}, color {color}, talla {talla} (Ref. {ref}).',
    mensajeGeneral: 'Hola, quiero recibir asesoría sobre la ropa de Vorágine.'
  }, window.TIENDA || {});

  const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const FAMILIAS = [
    ['Negro', '#141414', /^negro/], ['Blanco', '#f4f2ee', /^blanco/], ['Gris', '#8c8d90', /^gris/],
    ['Azul', '#1f3a8a', /^(azul|aguamarina)/], ['Rojo y vino', '#b3202a', /^(rojo|vinotinto|morado)/],
    ['Verde', '#5a5a37', /^verde/], ['Beige y café', '#c9a57a', /^(beige|cafe)/], ['Amarillo', '#f2c230', /^amarillo/]
  ];
  const familia = nombre => (FAMILIAS.find(f => f[2].test(sinTildes(nombre))) || ['Otro'])[0];

  const CAT = (window.CATALOGO || []).map(p => {
    const colores = (p.colores || []).map(c => ({
      nombre: c.nombre, hex: c.hex || '#888', fotos: c.fotos || [], familia: familia(c.nombre),
      tallas: /consultar/i.test(c.tallas || '') || !c.tallas ? [] : String(c.tallas).split('·').map(t => t.trim()).filter(Boolean)
    }));
    const respaldo = (colores.find(c => c.fotos.length) || { fotos: [] }).fotos;
    colores.forEach(c => { if (!c.fotos.length) { c.fotos = respaldo; c.sinFoto = true; } });
    return Object.assign({}, p, { colores, busca: sinTildes([p.nombre, p.marca, p.tipo, p.ref, ...colores.map(c => c.nombre)].join(' ')) });
  }).filter(p => p.colores.length && p.colores[0].fotos.length);
  // Primero las prendas recortadas (lucen mejor en 3D), luego las fotos con modelo.
  CAT.sort((a, b) => (b.recorte ? 1 : 0) - (a.recorte ? 1 : 0));

  /* ---------- Estado ---------- */
  const selColor = {};   // ref -> índice de color
  const selTalla = {};   // ref|color -> talla
  const selFoto = {};    // ref|color -> índice de foto
  const filtros = { publico: 'Todos', tipo: 'Todos', marca: 'Todos', color: 'Todos' };
  let lista = CAT.slice();
  let actual = 0;

  const colorDe = p => p.colores[selColor[p.ref] || 0];
  const imagenDe = (p, ci = selColor[p.ref] || 0) => {
    const c = p.colores[ci]; return c.fotos[Math.min(selFoto[p.ref + '|' + c.nombre] || 0, c.fotos.length - 1)];
  };
  const prendaActual = () => lista[actual];

  /* ---------- Utilidades de interfaz ---------- */
  const body = document.body;
  const anuncio = $('#anuncio');
  let avisoT;
  function aviso(txt) {
    const a = $('#aviso'); a.textContent = txt; a.classList.add('ver');
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove('ver'), 2200);
  }
  const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function linkWa(texto) { return T.whatsapp ? `https://wa.me/${T.whatsapp}?text=${encodeURIComponent(texto)}` : null; }
  function abrir(url) {
    if (!url) { aviso('Configura el número de WhatsApp en config.js'); return; }
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  }
  function mensajePrenda(p) {
    const c = colorDe(p); const t = selTalla[p.ref + '|' + c.nombre] || 'por definir';
    return T.mensaje.replace('{nombre}', p.nombre).replace('{marca}', p.marca || 'la marca')
      .replace('{color}', c.nombre.toLowerCase()).replace('{talla}', t).replace('{ref}', p.ref);
  }

  // Color de ambiente a partir del color de la prenda: los muy oscuros usan oro, los muy claros champaña.
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbHex(r) { return '#' + r.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
  function mezclar(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); }
  function acentoDe(hex) {
    const [r, g, b] = hexRgb(hex); const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (l < 0.12) return '#d4af37';
    if (l > 0.82) return '#d9cdb4';
    return hex;
  }
  function aplicarAmbiente(hex) {
    const ac = acentoDe(hex), st = document.documentElement.style;
    st.setProperty('--acento', ac);
    st.setProperty('--atm-1', mezclar(ac, '#0b0a0d', 0.72));
    st.setProperty('--atm-2', mezclar(ac, '#0b0a0d', 0.9));
    escena && escena.acento(ac);
  }

  /* ---------- Escena 3D ---------- */
  const lienzo = $('#escena');
  let escena = null;

  function crearEscena() {
    if (!window.THREE || location.protocol === 'file:') return null;
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    // Texturas de apoyo dibujadas en canvas
    function texGradiente(fn, w = 256, h = 256) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const texRadial = texGradiente((x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    const texSombra = texGradiente((x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    const texCono = texGradiente((x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.55, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,.75)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, 4, 256);

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const clave = new THREE.DirectionalLight(0xffffff, 1.1); clave.position.set(2, 6, 6); scene.add(clave);
    const luzAcento = new THREE.PointLight(0xd4af37, 6, 9, 1.6); luzAcento.position.set(0, 0.9, 1.6); scene.add(luzAcento);

    // Pedestal
    const pedestal = new THREE.Group(); scene.add(pedestal);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.68, 0.34, 72),
      new THREE.MeshStandardMaterial({ color: 0x141118, metalness: 0.7, roughness: 0.32 }));
    base.position.y = -0.17; pedestal.add(base);
    const tapa = new THREE.Mesh(new THREE.CylinderGeometry(1.44, 1.44, 0.02, 72),
      new THREE.MeshStandardMaterial({ color: 0x2b2731, metalness: 0.3, roughness: 0.18, emissive: 0xd4af37, emissiveIntensity: 0.14 }));
    tapa.position.y = 0.005; pedestal.add(tapa);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.02, 10, 128), new THREE.MeshBasicMaterial({ color: 0xd4af37 }));
    aro.rotation.x = Math.PI / 2; aro.position.y = 0.012; pedestal.add(aro);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.2),
      new THREE.MeshBasicMaterial({ map: texRadial, color: 0xd4af37, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.33; pedestal.add(halo);
    const cono = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.5, 5.2, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: texCono, color: 0xd4af37, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cono.position.y = 2.6; pedestal.add(cono);

    // Prendas
    const cargador = new Map();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    function textura(url, esFoto) {
      if (cargador.has(url)) return cargador.get(url);
      const prom = new Promise((ok, mal) => {
        const im = new Image(); im.decoding = 'async';
        im.onload = () => {
          let t;
          if (esFoto) {
            // Foto con modelo: se muestra tal cual, en una tarjeta con esquinas redondeadas.
            const c = document.createElement('canvas'); const s = Math.min(1, 1024 / Math.max(im.width, im.height));
            c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
            const x = c.getContext('2d'); const r = c.width * 0.05;
            x.beginPath(); x.roundRect(1, 1, c.width - 2, c.height - 2, r); x.clip();
            x.drawImage(im, 0, 0, c.width, c.height);
            x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.stroke();
            t = new THREE.CanvasTexture(c);
          } else { t = new THREE.Texture(im); t.needsUpdate = true; }
          t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.userData = { aspecto: im.width / im.height };
          ok(t);
        };
        im.onerror = mal; im.src = url;
      });
      cargador.set(url, prom); return prom;
    }

    const geo = new THREE.PlaneGeometry(1, 1);
    const piezas = new Map(); // índice de lista -> pieza
    function pieza(i) {
      if (piezas.has(i)) return piezas.get(i);
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, alphaTest: 0.01 });
      const m = new THREE.Mesh(geo, mat); g.add(m);
      const sombra = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, opacity: 0.8 }));
      sombra.rotation.x = -Math.PI / 2; g.add(sombra);
      m.userData.indice = i;
      const pz = { g, m, sombra, url: null, aspecto: 0.85 };
      scene.add(g); piezas.set(i, pz); poner(pz, lista[i]); return pz;
    }
    function poner(pz, p) {
      const url = imagenDe(p); if (pz.url === url) return; pz.url = url;
      textura(url, !p.recorte).then(t => {
        if (pz.url !== url) return;
        pz.m.material.map = t; pz.m.material.needsUpdate = true; pz.aspecto = t.userData.aspecto; pz.recorte = p.recorte;
      }).catch(() => {});
    }
    function limpiar() { piezas.forEach(pz => { scene.remove(pz.g); pz.m.material.dispose(); pz.sombra.material.dispose(); }); piezas.clear(); }

    // Movimiento
    let pos = actual, objetivo = actual, arrastrando = false, x0 = 0, pos0 = 0, movido = 0, velocidad = 0, ultimoX = 0, ultimoT = 0;
    const PASO = 0.62;
    let radio = 5.2, vertical = false;

    function tamano() {
      const w = innerWidth, h = innerHeight;
      renderer.setSize(w, h, false); camara.aspect = w / h;
      vertical = w / h < 0.85;
      if (vertical) { camara.fov = 38; camara.position.set(0, 2.2, 13.8); camara.lookAt(0, 0.75, 0); radio = 4.6; }
      else { camara.fov = 30; camara.position.set(0, 1.9, 12.2); camara.lookAt(0, 0.62, 0); radio = 6; }
      camara.updateProjectionMatrix();
    }
    addEventListener('resize', tamano); tamano();

    const reloj = new THREE.Clock();
    const colorAcento = new THREE.Color(0xd4af37), colorMeta = new THREE.Color(0xd4af37);
    let activa = true;
    function cuadro() {
      requestAnimationFrame(cuadro);
      const dt = Math.min(reloj.getDelta(), 0.05), t = reloj.elapsedTime;
      if (!activa || document.hidden) return;
      const N = lista.length;
      if (!arrastrando) {
        pos += (objetivo - pos) * Math.min(1, dt * (reducirMovimiento ? 30 : 7));
        if (Math.abs(objetivo - pos) < 0.0005) pos = objetivo;
      }
      colorAcento.lerp(colorMeta, Math.min(1, dt * 4));
      aro.material.color.copy(colorAcento); halo.material.color.copy(colorAcento); cono.material.color.copy(colorAcento);
      tapa.material.emissive.copy(colorAcento); luzAcento.color.copy(colorAcento);
      if (!N) { piezas.forEach(pz => pz.g.visible = false); renderer.render(scene, camara); return; }

      const ventana = Math.min(4, Math.floor((N - 1) / 2) + (N % 2 === 0 && N > 1 ? 1 : 0));
      const vistos = new Set();
      for (let k = -ventana; k <= ventana; k++) {
        const i = ((Math.round(pos) + k) % N + N) % N;
        if (vistos.has(i)) continue; vistos.add(i);
        let d = i - pos; d = ((d % N) + N + N / 2) % N - N / 2;
        if (Math.abs(d) > ventana + 0.5) continue;
        const pz = pieza(i), ad = Math.abs(d), centro = Math.max(0, 1 - ad);
        const ang = d * PASO;
        const esc = (pz.recorte === false ? 2.55 : 2.75) * (0.68 + 0.32 * centro);
        const ancho = esc * Math.min(pz.aspecto, 1.15), alto = ancho / pz.aspecto;
        const bob = reducirMovimiento ? 0 : Math.sin(t * 1.1 + i) * 0.035 * (0.4 + centro);
        pz.g.visible = true;
        pz.g.position.set(Math.sin(ang) * radio, 0, (Math.cos(ang) - 1) * radio);
        pz.m.position.y = 0.06 + alto / 2 + bob + (1 - centro) * -0.05;
        pz.m.scale.set(ancho, alto, 1);
        pz.m.rotation.y = -ang * 0.55 + (reducirMovimiento ? 0 : Math.sin(t * 0.7) * 0.1 * centro);
        const brillo = 0.42 + 0.58 * centro;
        pz.m.material.color.setScalar(brillo);
        pz.m.material.opacity = pz.m.material.map ? Math.max(0, 1 - Math.max(0, ad - 1.2) * 0.4) : 0;
        pz.m.renderOrder = 10 - Math.round(ad * 2);
        pz.sombra.scale.set(ancho * 0.9, ancho * 0.28, 1); pz.sombra.position.y = 0.02; pz.sombra.material.opacity = 0.75 * pz.m.material.opacity;
      }
      piezas.forEach((pz, i) => { if (!vistos.has(i)) pz.g.visible = false; });
      // Las piezas lejanas se liberan para no gastar memoria.
      if (piezas.size > 14) piezas.forEach((pz, i) => { if (!vistos.has(i)) { scene.remove(pz.g); pz.m.material.dispose(); pz.sombra.material.dispose(); piezas.delete(i); } });

      const cerca = ((Math.round(pos) % N) + N) % N;
      if (cerca !== actual && !arrastrando) { actual = cerca; mostrarInfo(); }
      renderer.render(scene, camara);
    }

    // Interacción
    const rayo = new THREE.Raycaster(), puntero = new THREE.Vector2();
    lienzo.addEventListener('pointerdown', e => {
      arrastrando = true; x0 = ultimoX = e.clientX; ultimoT = performance.now(); pos0 = pos; movido = 0; velocidad = 0;
      lienzo.setPointerCapture(e.pointerId); body.classList.remove('con-pista');
    });
    lienzo.addEventListener('pointermove', e => {
      if (!arrastrando) return;
      const dx = e.clientX - x0; movido = Math.max(movido, Math.abs(dx));
      const ahora = performance.now(); velocidad = (e.clientX - ultimoX) / Math.max(1, ahora - ultimoT); ultimoX = e.clientX; ultimoT = ahora;
      pos = pos0 - dx / (innerWidth * (vertical ? 0.42 : 0.2));
    });
    const soltar = e => {
      if (!arrastrando) return; arrastrando = false;
      if (movido < 6) {
        const r = lienzo.getBoundingClientRect();
        puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        rayo.setFromCamera(puntero, camara);
        const golpe = rayo.intersectObjects([...piezas.values()].filter(p => p.g.visible).map(p => p.m))[0];
        pos = pos0;
        if (golpe) {
          const i = golpe.object.userData.indice;
          if (i === actual) abrirFicha(); else ir(i);
        }
        return;
      }
      objetivo = Math.round(pos - velocidad * 2.2);
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    let ruedaT = 0;
    lienzo.addEventListener('wheel', e => {
      e.preventDefault(); const ahora = performance.now(); if (ahora - ruedaT < 260) return;
      const v = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(v) < 4) return;
      ruedaT = ahora; mover(v > 0 ? 1 : -1);
    }, { passive: false });

    function mover(paso) { objetivo = Math.round(objetivo) + paso; }
    function irA(i) {
      const N = lista.length; if (!N) return;
      let d = i - (((Math.round(objetivo) % N) + N) % N); if (d > N / 2) d -= N; if (d < -N / 2) d += N;
      objetivo = Math.round(objetivo) + d;
    }
    function reiniciar() { limpiar(); pos = objetivo = actual; }

    requestAnimationFrame(cuadro);
    return {
      mover, irA, reiniciar,
      refrescar(i) { const pz = piezas.get(i); if (pz) poner(pz, lista[i]); },
      acento(hex) { colorMeta.set(hex); },
      pausar(v) { activa = !v; }
    };
  }

  /* ---------- Navegación ---------- */
  function mover(paso) {
    if (!lista.length) return;
    if (escena) escena.mover(paso); else { actual = (actual + paso + lista.length) % lista.length; mostrarInfo(); }
    if (body.classList.contains('ficha-abierta') && !escena) pintarFicha();
  }
  function ir(i) {
    if (escena) escena.irA(i); else { actual = i; mostrarInfo(); }
  }

  /* ---------- Panel de información ---------- */
  function muestrasHTML(p, clase = 'muestra') {
    const sel = selColor[p.ref] || 0;
    return p.colores.map((c, i) => `<button type="button" class="${clase}" role="radio" aria-checked="${i === sel}" aria-label="${esc(c.nombre)}" title="${esc(c.nombre)}" data-color="${i}" style="--c:${c.hex}"></button>`).join('');
  }
  let ultimoInfo = '';
  function mostrarInfo() {
    const p = prendaActual(); const vacio = !p;
    $('#vacio').hidden = !vacio; $('#info').classList.toggle('oculto', vacio);
    if (vacio) return;
    const c = colorDe(p);
    $('#info-tipo').textContent = p.tipo;
    $('#info-nombre').textContent = p.nombre;
    $('#info-marca').textContent = p.marca || '';
    $('#info-ref').textContent = 'Ref. ' + p.ref;
    $('#info-colores').innerHTML = muestrasHTML(p) + `<p class="muestras-nombre">${esc(c.nombre)}${p.colores.length > 1 ? ' · ' + p.colores.length + ' colores' : ''}</p>`;
    $('#info-pos').textContent = `${actual + 1} / ${lista.length}`;
    aplicarAmbiente(c.hex);
    const clave = p.ref + c.nombre;
    if (clave !== ultimoInfo) { ultimoInfo = clave; anuncio.textContent = `${p.nombre}, ${p.marca}, color ${c.nombre}. ${actual + 1} de ${lista.length}`; }
    if (body.classList.contains('ficha-abierta')) pintarFicha();
  }
  function elegirColor(p, i) {
    selColor[p.ref] = i;
    const idx = lista.indexOf(p);
    if (escena) escena.refrescar(idx); else pintarRejilla();
    mostrarInfo();
  }
  $('#info-colores').addEventListener('click', e => {
    const b = e.target.closest('[data-color]'); if (b) elegirColor(prendaActual(), +b.dataset.color);
  });
  $('#info-colores').addEventListener('keydown', e => {
    if (!/Arrow(Left|Right)/.test(e.key)) return; e.preventDefault(); e.stopPropagation();
    const p = prendaActual(); const n = p.colores.length;
    elegirColor(p, ((selColor[p.ref] || 0) + (e.key === 'ArrowRight' ? 1 : -1) + n) % n);
    $(`#info-colores [data-color="${selColor[p.ref]}"]`).focus();
  });
  $('#btn-ant').addEventListener('click', () => mover(-1));
  $('#btn-sig').addEventListener('click', () => mover(1));
  $('#btn-ficha').addEventListener('click', () => abrirFicha());
  $('#btn-cotizar').addEventListener('click', () => { const p = prendaActual(); if (p) abrir(linkWa(mensajePrenda(p))); });
  $('#btn-agregar').addEventListener('click', () => { const p = prendaActual(); if (p) agregar(p, $('#btn-agregar')); });
  $('#wa-flotante').addEventListener('click', () => abrir(linkWa(T.mensajeGeneral)));

  /* ---------- Ficha ---------- */
  const ficha = $('#ficha');
  let enfoqueAntes = null;
  function abrirFicha() {
    if (!prendaActual()) return;
    enfoqueAntes = document.activeElement;
    body.classList.add('ficha-abierta'); ficha.setAttribute('aria-hidden', 'false');
    pintarFicha(); setTimeout(() => $('#ficha-cerrar').focus({ preventScroll: true }), 60);
  }
  function cerrarFicha() {
    body.classList.remove('ficha-abierta'); ficha.setAttribute('aria-hidden', 'true');
    if (enfoqueAntes && enfoqueAntes.focus) enfoqueAntes.focus({ preventScroll: true });
  }
  function pintarFicha() {
    const p = prendaActual(); if (!p) return cerrarFicha();
    const ci = selColor[p.ref] || 0, c = p.colores[ci], claveFoto = p.ref + '|' + c.nombre;
    const fi = Math.min(selFoto[claveFoto] || 0, c.fotos.length - 1);
    const foto = $('#ficha-foto'), url = c.fotos[fi];
    if (foto.dataset.url !== url) {
      foto.dataset.url = url; foto.classList.remove('lista');
      const im = new Image(); im.alt = `${p.nombre} color ${c.nombre}`; im.className = p.recorte ? '' : 'foto-real';
      im.onload = () => { if (foto.dataset.url === url) { foto.replaceChildren(im); requestAnimationFrame(() => foto.classList.add('lista')); } };
      im.src = url;
    }
    $('#ficha-miniaturas').innerHTML = c.fotos.length > 1 ? c.fotos.map((f, i) =>
      `<button type="button" class="mini" data-foto="${i}" aria-label="Foto ${i + 1} de ${c.fotos.length}" aria-current="${i === fi}"><img src="${esc(f)}" alt=""></button>`).join('') : '';
    const tallaSel = selTalla[claveFoto] || (c.tallas.length === 1 ? (selTalla[claveFoto] = c.tallas[0]) : '');
    const similares = lista.filter(o => o !== p && o.tipo === p.tipo).concat(lista.filter(o => o !== p && o.tipo !== p.tipo && o.marca === p.marca)).slice(0, 4);
    $('#ficha-cuerpo').innerHTML = `
      <span class="etiqueta-dorada">${esc(p.tipo)}</span>
      <h2 id="ficha-titulo">${esc(p.nombre)}</h2>
      <p class="ficha-marca">${esc(p.marca)} <span>· Ref. ${esc(p.ref)}</span></p>
      <div class="ficha-meta"><span>${esc(p.publico)}</span><span>${p.colores.length} ${p.colores.length === 1 ? 'color' : 'colores'}</span></div>
      <p class="ficha-desc">${esc(p.descripcion)}</p>
      <p class="seccion-titulo" id="t-color">Color <b>${esc(c.nombre)}</b></p>
      <div class="colores-ficha" role="radiogroup" aria-labelledby="t-color">${p.colores.map((o, i) =>
        `<button type="button" class="color-op" role="radio" aria-checked="${i === ci}" data-color="${i}"><span class="punto" style="--c:${o.hex}"></span>${esc(o.nombre)}</button>`).join('')}</div>
      ${c.sinFoto ? '<p class="ficha-nota">Foto de referencia en otro color: este color está disponible, te enviamos fotos por WhatsApp.</p>' : ''}
      <p class="seccion-titulo" id="t-talla">Talla ${tallaSel ? `<b>${esc(tallaSel)}</b>` : ''}</p>
      ${c.tallas.length ? `<div class="tallas" id="tallas" role="radiogroup" aria-labelledby="t-talla">${c.tallas.map(t =>
        `<button type="button" class="talla" role="radio" aria-checked="${t === tallaSel}" data-talla="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <p class="ficha-nota">Tallas disponibles hoy en color ${esc(c.nombre.toLowerCase())}.</p>`
        : '<p class="ficha-nota">Consulta las tallas disponibles por WhatsApp.</p>'}
      <div class="garantia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>
        <span><strong>Prenda original</strong>Con tu compra entregamos el soporte de origen.</span></div>
      ${similares.length ? `<p class="seccion-titulo">También te puede gustar</p><div class="similares-lista">${similares.map(o =>
        `<button type="button" class="similar" data-ref="${esc(o.ref)}"><img src="${esc(imagenDe(o))}" alt="" class="${o.recorte ? '' : 'foto-real'}" loading="lazy"><b>${esc(o.nombre)}</b><small>${esc(o.marca)}</small></button>`).join('')}</div>` : ''}`;
    $('#ficha-pos').textContent = `${actual + 1} / ${lista.length}`;
  }
  ficha.addEventListener('click', e => {
    const p = prendaActual(); if (!p) return;
    const c = colorDe(p);
    const bc = e.target.closest('.color-op'); if (bc) { elegirColor(p, +bc.dataset.color); return; }
    const bt = e.target.closest('.talla'); if (bt) { selTalla[p.ref + '|' + c.nombre] = bt.dataset.talla; pintarFicha(); return; }
    const bf = e.target.closest('.mini'); if (bf) { selFoto[p.ref + '|' + c.nombre] = +bf.dataset.foto; pintarFicha(); return; }
    const bs = e.target.closest('.similar'); if (bs) { const i = lista.findIndex(o => o.ref === bs.dataset.ref); if (i >= 0) { ir(i); if (!escena) pintarFicha(); } }
  });
  $('#ficha-volver').addEventListener('click', cerrarFicha);
  $('#ficha-cerrar').addEventListener('click', cerrarFicha);
  $('#ficha-ant').addEventListener('click', () => mover(-1));
  $('#ficha-sig').addEventListener('click', () => mover(1));
  $('#ficha-wa').addEventListener('click', () => { const p = prendaActual(); if (p) abrir(linkWa(mensajePrenda(p))); });
  $('#ficha-agregar').addEventListener('click', () => { const p = prendaActual(); if (p) agregar(p, $('#ficha-agregar')); });

  /* ---------- Pedido ---------- */
  let pedido = [];
  try { pedido = JSON.parse(localStorage.getItem('pedido-ropa') || '[]').filter(x => CAT.some(p => p.ref === x.ref)); } catch (e) { pedido = []; }
  const guardarPedido = () => { try { localStorage.setItem('pedido-ropa', JSON.stringify(pedido)); } catch (e) { /* sin almacenamiento */ } };
  function agregar(p, origen) {
    const c = colorDe(p), clave = p.ref + '|' + c.nombre, talla = selTalla[clave] || (c.tallas.length === 1 ? c.tallas[0] : '');
    if (c.tallas.length > 1 && !talla) {
      if (!body.classList.contains('ficha-abierta')) abrirFicha();
      setTimeout(() => { const t = $('#tallas'); if (t) { t.classList.remove('pide'); void t.offsetWidth; t.classList.add('pide'); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 80);
      aviso('Elige tu talla para agregarla al pedido'); return;
    }
    if (pedido.some(x => x.ref === p.ref && x.color === c.nombre && x.talla === talla)) { aviso('Ya está en tu pedido'); return; }
    pedido.push({ ref: p.ref, color: c.nombre, talla }); guardarPedido(); pintarPedido();
    aviso(`Agregado: ${p.nombre} · ${c.nombre}${talla ? ' · ' + talla : ''}`);
    volar(imagenDe(p), origen);
  }
  function volar(url, origen) {
    const bolsa = $('#btn-pedido'); bolsa.classList.remove('salta'); void bolsa.offsetWidth; bolsa.classList.add('salta');
    if (reducirMovimiento || !origen || !origen.getBoundingClientRect) return;
    const a = origen.getBoundingClientRect(), b = bolsa.getBoundingClientRect();
    const im = document.createElement('img'); im.src = url; im.className = 'vuelo'; im.alt = ''; document.body.appendChild(im);
    im.animate([
      { transform: `translate(${a.left + a.width / 2 - 45}px, ${a.top - 60}px) scale(1)`, opacity: 1 },
      { transform: `translate(${b.left + b.width / 2 - 45}px, ${b.top - 40}px) scale(.25)`, opacity: .3 }
    ], { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => im.remove();
  }
  function pintarPedido() {
    $('#pedido-cuenta').textContent = pedido.length || '';
    $('#pedido').classList.toggle('vacio-pedido', !pedido.length);
    $('#pedido-lista').innerHTML = pedido.map((x, i) => {
      const p = CAT.find(o => o.ref === x.ref); const ci = Math.max(0, p.colores.findIndex(c => c.nombre === x.color)); const c = p.colores[ci];
      return `<li><span class="p-foto"><img src="${esc(c.fotos[0])}" alt="" class="${p.recorte ? '' : 'foto-real'}"></span>
        <span><b>${esc(p.nombre)}</b><small><span class="punto" style="--c:${c.hex}"></span>${esc(x.color)}${x.talla ? ' · Talla ' + esc(x.talla) : ''}</small></span>
        <button type="button" class="btn-icono p-quitar" data-quitar="${i}" aria-label="Quitar ${esc(p.nombre)} ${esc(x.color)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`;
    }).join('');
  }
  function abrirPedido() { body.classList.add('pedido-abierto'); $('#pedido').setAttribute('aria-hidden', 'false'); $('#velo').hidden = false; setTimeout(() => $('#pedido-cerrar').focus(), 60); }
  function cerrarPedido() { body.classList.remove('pedido-abierto'); $('#pedido').setAttribute('aria-hidden', 'true'); $('#velo').hidden = true; }
  $('#btn-pedido').addEventListener('click', abrirPedido);
  $('#pedido-cerrar').addEventListener('click', cerrarPedido);
  $('#velo').addEventListener('click', cerrarPedido);
  $('#pedido-lista').addEventListener('click', e => { const b = e.target.closest('[data-quitar]'); if (b) { pedido.splice(+b.dataset.quitar, 1); guardarPedido(); pintarPedido(); } });
  $('#pedido-vaciar').addEventListener('click', () => { pedido = []; guardarPedido(); pintarPedido(); });
  $('#pedido-enviar').addEventListener('click', () => {
    const lineas = pedido.map((x, i) => { const p = CAT.find(o => o.ref === x.ref); return `${i + 1}. ${p.nombre} (${p.marca}) · color ${x.color.toLowerCase()}${x.talla ? ' · talla ' + x.talla : ''} · Ref. ${p.ref}`; });
    abrir(linkWa(`Hola, quiero cotizar este pedido:\n${lineas.join('\n')}`));
  });

  /* ---------- Filtros ---------- */
  const publicoIncluye = (sel, pub) => sel === 'Todos' || pub === sel || pub === 'Unisex' || pub === 'Pareja';
  function cumple(p, f = filtros) {
    return publicoIncluye(f.publico, p.publico) && (f.tipo === 'Todos' || p.tipo === f.tipo) && (f.marca === 'Todos' || p.marca === f.marca)
      && (f.color === 'Todos' || p.colores.some(c => c.familia === f.color));
  }
  function contar(campo, valor) { return CAT.filter(p => cumple(p, Object.assign({}, filtros, { [campo]: valor }))).length; }
  function pintarFiltros() {
    const tipos = [...new Set(CAT.map(p => p.tipo))].sort((a, b) => CAT.filter(p => p.tipo === b).length - CAT.filter(p => p.tipo === a).length);
    const marcas = [...new Set(CAT.map(p => p.marca))].sort((a, b) => a.localeCompare(b, 'es'));
    const grupo = (titulo, campo, valores, extra = () => '') => `<div><span class="grupo-titulo" id="g-${campo}">${titulo}</span><div class="chips" role="group" aria-labelledby="g-${campo}">${
      ['Todos', ...valores].map(v => `<button type="button" class="chip" data-campo="${campo}" data-valor="${esc(v)}" aria-pressed="${filtros[campo] === v}"${v !== 'Todos' && !contar(campo, v) ? ' disabled' : ''}>${extra(v)}${esc(v)}</button>`).join('')}</div></div>`;
    $('#filtros-grupos').innerHTML =
      grupo('Para', 'publico', ['Dama', 'Caballero', 'Pareja']) +
      grupo('Prenda', 'tipo', tipos) +
      grupo('Color', 'color', FAMILIAS.map(f => f[0]).filter(f => CAT.some(p => p.colores.some(c => c.familia === f))), v => v === 'Todos' ? '' : `<span class="punto" style="--c:${FAMILIAS.find(f => f[0] === v)[1]}"></span>`) +
      grupo('Marca', 'marca', marcas);
    const activos = Object.values(filtros).filter(v => v !== 'Todos').length;
    $('#filtros-cuenta').textContent = activos || '';
    $('#total-catalogo').textContent = `${lista.length} ${lista.length === 1 ? 'prenda' : 'prendas'}`;
  }
  function aplicarFiltros(conservar = true) {
    const antes = prendaActual();
    lista = CAT.filter(p => cumple(p));
    if (filtros.color !== 'Todos') lista.forEach(p => { const i = p.colores.findIndex(c => c.familia === filtros.color); if (i >= 0) selColor[p.ref] = i; });
    const i = conservar && antes ? lista.indexOf(antes) : -1;
    actual = i >= 0 ? i : 0;
    if (escena) escena.reiniciar(); else pintarRejilla();
    pintarFiltros(); mostrarInfo();
  }
  $('#filtros-grupos').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    filtros[b.dataset.campo] = b.dataset.valor; aplicarFiltros();
  });
  $('#vacio-limpiar').addEventListener('click', () => { Object.keys(filtros).forEach(k => filtros[k] = 'Todos'); aplicarFiltros(); });
  const btnFiltros = $('#btn-filtros');
  btnFiltros.addEventListener('click', () => { const v = body.classList.toggle('filtros-abiertos'); btnFiltros.setAttribute('aria-expanded', v); });
  document.addEventListener('click', e => {
    // En celular, tocar fuera del panel lo cierra sin activar lo que había debajo.
    if (!body.classList.contains('filtros-abiertos') || innerWidth > 1100) return;
    if (e.target.closest('#filtros, .barra')) return;
    e.preventDefault(); e.stopPropagation(); body.classList.remove('filtros-abiertos'); btnFiltros.setAttribute('aria-expanded', 'false');
  }, true);

  /* ---------- Buscador ---------- */
  const buscar = $('#buscar'), sug = $('#sugerencias');
  let resultados = [], marcado = -1;
  function pintarSugerencias() {
    const q = sinTildes(buscar.value.trim());
    if (!q) { sug.hidden = true; buscar.setAttribute('aria-expanded', 'false'); return; }
    const partes = q.split(/\s+/);
    resultados = CAT.filter(p => partes.every(w => p.busca.includes(w))).slice(0, 8);
    marcado = -1;
    sug.innerHTML = resultados.length ? resultados.map((p, i) => {
      const ci = p.colores.findIndex(c => partes.some(w => sinTildes(c.nombre).includes(w)));
      return `<li role="option" id="s-${i}" data-i="${i}" data-c="${ci}" aria-selected="false"><img src="${esc(imagenDe(p, Math.max(0, ci)))}" alt=""><span class="s-nombre">${esc(p.nombre)}</span><span class="s-marca">${esc(p.marca)}</span></li>`;
    }).join('') : '<li class="sin" role="option" aria-disabled="true">No encontramos esa prenda. Escríbenos y te ayudamos.</li>';
    sug.hidden = false; buscar.setAttribute('aria-expanded', 'true');
  }
  function elegirResultado(i) {
    const p = resultados[i]; if (!p) return;
    const ci = +($(`#s-${i}`)?.dataset.c ?? -1); if (ci >= 0) selColor[p.ref] = ci;
    buscar.value = ''; sug.hidden = true; buscar.setAttribute('aria-expanded', 'false'); buscar.blur();
    if (!lista.includes(p)) { Object.keys(filtros).forEach(k => filtros[k] = 'Todos'); aplicarFiltros(false); }
    cerrarGuia(); ir(lista.indexOf(p)); if (escena) escena.refrescar(lista.indexOf(p)); mostrarInfo();
  }
  buscar.addEventListener('input', pintarSugerencias);
  buscar.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!resultados.length) return;
      marcado = (marcado + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length;
      $$('#sugerencias li').forEach((li, i) => li.setAttribute('aria-selected', i === marcado));
      buscar.setAttribute('aria-activedescendant', 's-' + marcado);
    } else if (e.key === 'Enter') { e.preventDefault(); elegirResultado(Math.max(0, marcado)); }
    else if (e.key === 'Escape') { buscar.value = ''; pintarSugerencias(); buscar.blur(); }
    e.stopPropagation();
  });
  sug.addEventListener('pointerdown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); elegirResultado(+li.dataset.i); } });
  buscar.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; buscar.setAttribute('aria-expanded', 'false'); }, 150));

  /* ---------- Guía y portada ---------- */
  const guia = $('#guia');
  const destacados = [['5634', 'Rojo'], ['8828', 'Azul claro'], ['5640', 'Aguamarina'], ['8836', 'Beige'], ['5642', 'Verde militar']];
  const ABANICO = [[0, 0, 0, 1], [-118, 8, -9, .86], [118, 8, 9, .86], [-220, 20, -16, .74], [220, 20, 16, .74]];
  function abanico(urls, grande) {
    return urls.map((u, k) => { const [x, y, r, s] = ABANICO[k]; const f = grande ? 1 : .42;
      return `<img src="${esc(u)}" alt="" style="--x:${x * f}px;--y:${y}px;--r:${r}deg;--s:${s};--i:${k};z-index:${5 - k}" loading="lazy">`; }).join('');
  }
  function fotosDe(prendas, n) {
    const rec = prendas.filter(p => p.recorte);
    return (rec.length ? rec : prendas).slice(0, n).map(p => imagenDe(p));
  }
  function pintarPortada() {
    const urls = destacados.map(([ref, col]) => { const p = CAT.find(o => o.ref === ref); if (!p) return null; const c = p.colores.find(o => o.nombre === col) || p.colores[0]; return c.fotos[0]; }).filter(Boolean);
    $('#portada-abanico').innerHTML = abanico(urls.length ? urls : fotosDe(CAT, 5), true);
    $('#portada-total').textContent = CAT.length;
    $('#portada-colores').textContent = CAT.reduce((n, p) => n + p.colores.length, 0);
  }
  const PARA = [
    { v: 'Dama', t: 'Para ella', d: 'Suéteres, hoodies y buzos que también le quedan perfectos.', c: '#e7a3b8' },
    { v: 'Caballero', t: 'Para él', d: 'Buzos, chaquetas y media cremallera de marca.', c: '#8fb3d9' },
    { v: 'Pareja', t: 'Para los dos', d: 'Prendas unisex y suéteres para combinar en pareja.', c: '#d4af37' }
  ];
  const DESC_TIPO = { 'Hoodie': 'Con capota y bolsillo canguro', 'Cuello redondo': 'El buzo clásico de todos los días', 'Chaqueta': 'Con cremallera completa', 'Media cremallera': 'Deportivo y elegante', 'Suéter': 'Tejidos y de temporada', 'Camiseta': 'Ligeras y versátiles', 'Cuello camisero': 'Con cuello de camisa, elegante' };
  let pasoGuia = 1, elegidoPara = 'Todos';
  function opcion(o, i, clase) {
    return `<button type="button" class="opcion ${clase}" data-valor="${esc(o.v)}" style="--c:${o.c};--i:${i}">
      <span class="abanico">${abanico(o.fotos, false)}</span>
      <span class="o-textos"><span class="o-cuenta">${o.n} ${o.n === 1 ? 'prenda' : 'prendas'}</span><span class="o-titulo">${esc(o.t)}</span><span class="o-desc">${esc(o.d)}</span></span>
      <span class="o-flecha" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>`;
  }
  function pintarGuia() {
    guia.classList.remove('en-portada');
    $('#guia-atras').hidden = pasoGuia === 1;
    $('#guia-paso').textContent = `Paso ${pasoGuia} de 2`;
    const cont = $('#guia-opciones');
    if (pasoGuia === 1) {
      $('#guia-titulo').textContent = '¿Para quién es?';
      $('#guia-sub').textContent = `Te mostramos solo lo que te interesa entre nuestras ${CAT.length} prendas.`;
      cont.style.setProperty('--cols', 3);
      cont.innerHTML = PARA.map((o, i) => { const sel = CAT.filter(p => publicoIncluye(o.v, p.publico));
        return opcion(Object.assign({}, o, { n: sel.length, fotos: fotosDe(sel.slice(i * 2), 3) }), i, ''); }).join('');
    } else {
      const base = CAT.filter(p => publicoIncluye(elegidoPara, p.publico));
      const tipos = [...new Set(base.map(p => p.tipo))].sort((a, b) => base.filter(p => p.tipo === b).length - base.filter(p => p.tipo === a).length);
      $('#guia-titulo').textContent = '¿Qué estilo buscas?';
      $('#guia-sub').textContent = 'Elige el tipo de prenda y te llevamos directo a la vitrina.';
      cont.style.setProperty('--cols', Math.min(4, tipos.length + 1));
      cont.innerHTML = tipos.map((t, i) => { const ps = base.filter(p => p.tipo === t);
        return opcion({ v: t, t, d: DESC_TIPO[t] || '', c: acentoDe(ps[0].colores[0].hex), n: ps.length, fotos: fotosDe(ps, 3) }, i, 'chica'); }).join('') +
        `<button type="button" class="opcion chica todos" data-valor="Todos" style="--i:${tipos.length}"><span class="o-textos"><span class="o-titulo">Ver todas</span><span class="o-desc">${base.length} prendas</span></span><span class="o-flecha" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>`;
    }
    setTimeout(() => { const b = $('.opcion', cont); b && b.focus({ preventScroll: true }); }, 50);
  }
  $('#guia-opciones').addEventListener('click', e => {
    const b = e.target.closest('.opcion'); if (!b) return;
    if (pasoGuia === 1) { elegidoPara = b.dataset.valor; pasoGuia = 2; pintarGuia(); return; }
    Object.keys(filtros).forEach(k => filtros[k] = 'Todos');
    filtros.publico = elegidoPara; filtros.tipo = b.dataset.valor;
    aplicarFiltros(false); cerrarGuia(true);
  });
  $('#guia-atras').addEventListener('click', () => { pasoGuia = 1; pintarGuia(); });
  $('#guia-saltar').addEventListener('click', () => { Object.keys(filtros).forEach(k => filtros[k] = 'Todos'); aplicarFiltros(); cerrarGuia(true); });
  function abrirGuia(portada) {
    cerrarFicha(); cerrarPedido();
    body.classList.add('con-guia'); guia.classList.remove('cerrada'); escena && escena.pausar(true);
    if (portada) { guia.classList.add('en-portada'); setTimeout(() => $('#portada-guia').focus({ preventScroll: true }), 50); }
    else { pasoGuia = 1; pintarGuia(); }
  }
  let pistaVista = false;
  function cerrarGuia(conPista) {
    if (guia.classList.contains('cerrada')) return;
    guia.classList.add('cerrada'); body.classList.remove('con-guia'); escena && escena.pausar(false);
    if (conPista && !pistaVista && escena) { pistaVista = true; body.classList.add('con-pista'); setTimeout(() => body.classList.remove('con-pista'), 4200); }
  }
  $('#portada-guia').addEventListener('click', () => { pasoGuia = 1; pintarGuia(); });
  $('#portada-explorar').addEventListener('click', () => cerrarGuia(true));
  $('#btn-guia').addEventListener('click', () => abrirGuia(false));
  $('#btn-inicio').addEventListener('click', () => abrirGuia(true));

  /* ---------- ¿Cómo comprar? ---------- */
  const como = $('#como');
  $$('[data-como]').forEach(b => b.addEventListener('click', () => { como.hidden = false; setTimeout(() => $('#como-cerrar').focus(), 30); }));
  $('#como-cerrar').addEventListener('click', () => { como.hidden = true; });
  como.addEventListener('click', e => { if (e.target === como) como.hidden = true; });
  $('#como-wa').addEventListener('click', () => abrir(linkWa(T.mensajeGeneral)));
  $('#como-envio').textContent = T.envios + '.';
  if (T.instagram) { const ig = $('#como-ig'), u = T.instagram.replace(/^@/, ''); ig.hidden = false; ig.innerHTML = `Instagram: <a href="https://instagram.com/${esc(u)}" target="_blank" rel="noopener">@${esc(u)}</a>`; }

  /* ---------- Teclado ---------- */
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') {
      if (!como.hidden) como.hidden = true;
      else if (body.classList.contains('pedido-abierto')) cerrarPedido();
      else if (body.classList.contains('ficha-abierta')) cerrarFicha();
      else if (body.classList.contains('filtros-abiertos')) btnFiltros.click();
      return;
    }
    if (body.classList.contains('con-guia') || body.classList.contains('pedido-abierto') || !como.hidden) return;
    if (e.key === '/') { e.preventDefault(); buscar.focus(); }
    else if (e.key === 'ArrowRight' && !e.target.closest('[role=radiogroup]')) { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowLeft' && !e.target.closest('[role=radiogroup]')) { e.preventDefault(); mover(-1); }
    else if (e.key === 'Enter' && e.target === lienzo) abrirFicha();
  });
  lienzo.tabIndex = 0;

  /* ---------- Sin 3D: rejilla ---------- */
  function pintarRejilla() {
    if (escena) return;
    $('#rejilla').innerHTML = lista.map((p, i) => `<article class="tarjeta">
      <img src="${esc(imagenDe(p))}" alt="${esc(p.nombre)}" class="${p.recorte ? '' : 'foto-real'}" loading="lazy">
      <h3>${esc(p.nombre)}</h3><p>${esc(p.marca)} · ${p.colores.length} ${p.colores.length === 1 ? 'color' : 'colores'}</p>
      <button type="button" class="btn btn-sec" data-ver="${i}">Ver colores y tallas</button></article>`).join('');
  }
  $('#rejilla').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (b) { actual = +b.dataset.ver; mostrarInfo(); abrirFicha(); } });

  /* ---------- Arranque ---------- */
  function leerHash() {
    // Un enlace con # malformado no debe romper la página.
    try { return decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { return ''; }
  }
  document.title = `${T.nombre} · Buzos, hoodies y chaquetas originales`;
  $$('#logo-linea, .portada-linea').forEach(el => { el.textContent = T.linea || 'Ropa'; });
  escena = crearEscena();
  if (!escena) { body.classList.add('sin-3d'); $('#rejilla').hidden = false; pintarRejilla(); }
  pintarFiltros(); pintarPedido(); pintarPortada();
  const inicial = leerHash(); const iHash = CAT.findIndex(p => p.ref === inicial);
  if (iHash >= 0) { actual = iHash; if (escena) escena.reiniciar(); }
  mostrarInfo();
  body.classList.add('con-guia');
  if (iHash >= 0) cerrarGuia(false); else { guia.classList.add('en-portada'); escena && escena.pausar(true); }
  addEventListener('hashchange', () => {
    const p = CAT.find(o => o.ref === leerHash()); if (!p) return;
    if (!lista.includes(p)) { Object.keys(filtros).forEach(k => filtros[k] = 'Todos'); aplicarFiltros(false); }
    cerrarGuia(false); ir(lista.indexOf(p));
  });
  requestAnimationFrame(() => body.classList.add('listo'));
})();
