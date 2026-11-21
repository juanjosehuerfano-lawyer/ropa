# Vorágine Ropa · Vitrina 3D de prendas

Tienda web de **Vorágine Ropa**, con el mismo estilo de la vitrina de perfumes de Vorágine by Alttura. Tiene 36 prendas (buzos, hoodies, chaquetas, suéteres y camisetas) en 111 combinaciones de color. No muestra precios: todo se cotiza por WhatsApp.

**Dirección prevista:** https://ropa.voraginebyalttura.com

## Qué puede hacer el cliente

- **Girar la vitrina 3D** deslizando, con la rueda del ratón o con las flechas. Al tocar la prenda del centro se abre su ficha.
- **Cambiar el color en vivo** con los círculos de color. La prenda cambia en la vitrina y el ambiente de la página toma el color elegido.
- **Elegir talla** en la ficha. Solo aparecen las tallas disponibles para ese color.
- **Encontrar su prenda** con una guía de dos pasos: para quién es y qué estilo busca.
- **Buscar** por nombre, marca o color, por ejemplo "lacoste rojo".
- **Filtrar** por público, tipo de prenda, color y marca.
- **Armar un pedido** con color y talla de cada prenda y cotizarlo en un solo mensaje de WhatsApp.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` | La página |
| `config.js` | Nombre, número de WhatsApp y mensajes de cotización |
| `data/catalogo.js` | El catálogo: prendas, colores, tallas por color y fotos |
| `css/estilos.css` | Diseño (mismos colores, tipografías y componentes que la página de perfumes) |
| `js/app.js` | Motor de la vitrina 3D. **Es código fuente: se puede leer y editar.** |
| `js/vendor/three.min.js` | Three.js r158 (licencia MIT en `three-LICENSE.txt`) |
| `img/prendas/` | Fotos de cada prenda por color (`.webp`) |
| `herramientas/` | Scripts que generaron las fotos y el catálogo a partir de las fichas del proveedor |

## Fotos

- **Fichas del proveedor con prendas sobre fondo blanco** (sudaderas con referencia numérica): cada color se recortó por separado y se le quitó el fondo para que la prenda flote en la vitrina 3D.
- **Fotos con modelo:** se quitó a la persona y quedó solo la prenda (scripts en `herramientas/sin-personas/`). Siete fotos en las que el pelo cubre la prenda o el encuadre es muy cerrado se dejaron como foto completa: esos archivos no terminan en `-recorte.webp`.
- **Calidad:** todas las fotos se ampliaron con un modelo de superresolución conservador (FSRCNN) y un enfoque suave. No se cambiaron colores, formas ni detalles.

## Cómo hacer cambios

1. **Datos de la tienda:** editar los valores entre comillas en `config.js`.
2. **Una prenda:** editar su bloque en `data/catalogo.js`: nombre, descripción, `tallas` de cada color (separadas con `·`) y `fotos`.
3. **Prendas nuevas:** agregar las fotos en `img/prendas/` y un bloque nuevo en `data/catalogo.js` copiando uno existente. `"recorte": true` indica fotos sin fondo y `false` fotos con modelo.
4. **Ver la página en el computador:** abrirla desde un servidor local (por ejemplo `python -m http.server` en esta carpeta) e ir a `http://localhost:8000`. Si se abre con doble clic, el navegador no deja cargar las fotos en 3D y la página muestra el catálogo en cuadrícula.

## Publicar en el subdominio

El archivo `CNAME` ya trae `ropa.voraginebyalttura.com`. Para publicarlo con GitHub Pages:

1. Crear un repositorio (por ejemplo `voragine-ropa`) con el contenido de esta carpeta y activar Pages sobre la rama `main`.
2. En el DNS de `voraginebyalttura.com`, crear un registro **CNAME** `ropa` que apunte a `<usuario>.github.io`.
3. En GitHub, Settings → Pages, marcar "Enforce HTTPS" cuando aparezca disponible.

## Aviso legal

© 2026 Vorágine by Alttura. Todos los derechos reservados. Las marcas y nombres de las prendas pertenecen a sus respectivos titulares y se mencionan solo para identificar los productos.
