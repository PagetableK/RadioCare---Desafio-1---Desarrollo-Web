/**
 * RadioCare - Lógica del Catálogo de Servicios Médicos (servicios.page.js)
 * Inicialización de datos remotos en Firestore (Seed), obtención asíncrona con estado de carga,
 * renderizado dinámico y filtrado en memoria reactivo con estado vacío.
 */

import { inicializarCatalogoSeed, obtenerEstudios } from "../services/estudios.service.js";

/* ==========================================================================
   ESTADO LOCAL DEL CATÁLOGO
   ========================================================================== */
let todosLosEstudios = [];
let categoriaActiva = "Todos";

/* ==========================================================================
   REFERENCIAS AL DOM
   ========================================================================== */
const contenedorServicios = document.getElementById('contenedor-servicios');
const barraFiltros = document.getElementById('filtros-servicios');

/**
 * Devuelve el icono SVG semántico de acuerdo a la categoría médica.
 * @param {string} categoria
 * @returns {string} Markup SVG
 */
function obtenerIconoCategoria(categoria) {
  switch (categoria) {
    case 'Ultrasonografía':
      return `
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M8 32 Q20 8 32 32" stroke="#b1a6f6" />
          <path d="M13 30 Q20 14 27 30" stroke="#00b1ff" />
          <circle cx="20" cy="23" r="3.5" stroke="#00ffaa" />
        </svg>
      `;
    case 'Doppler':
      return `
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M6 20 C 12 6, 20 34, 26 20 C 29 13, 34 27, 36 20" stroke="#00b1ff" />
          <circle cx="20" cy="20" r="13" stroke="#b1a6f6" stroke-dasharray="3 3"/>
        </svg>
      `;
    case 'Tejidos Blandos':
      return `
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M8 20 Q20 6 32 20 Q20 34 8 20" stroke="#00ffaa"/>
          <circle cx="20" cy="20" r="5" stroke="#b1a6f6"/>
        </svg>
      `;
    case 'Procedimientos':
      return `
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="20" cy="20" r="15" stroke="#b1a6f6"/>
          <path d="M20 9v22M9 20h22" stroke="#00b1ff" stroke-linecap="round" />
          <circle cx="20" cy="20" r="3.5" stroke="#00ffaa" />
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="20" cy="20" r="14" stroke="#00b1ff"/>
          <path d="M14 20h12M20 14v12" stroke="#00ffaa"/>
        </svg>
      `;
  }
}

/**
 * Renderiza el estado de carga visual en el contenedor de servicios.
 */
function renderizarCargando() {
  if (!contenedorServicios) return;
  contenedorServicios.innerHTML = `
    <div class="cargando-servicios" role="status" aria-live="polite">
      <div class="rc-spinner"></div>
      <div>
        <h3 style="font-size: 18px; color: var(--color-cloud-white); margin-bottom: 6px;">
          Consultando catálogo clínico...
        </h3>
        <p style="font-size: 14px; color: var(--color-ash); margin: 0;">
          Obteniendo los estudios radiológicos y ecográficos disponibles en RadioCare.
        </p>
      </div>
    </div>
  `;
}

/**
 * Renderiza el estado vacío (Empty State) cuando ningún estudio coincide con el filtro.
 * @param {string} categoriaSeleccionada
 */
function renderizarEstadoVacio(categoriaSeleccionada) {
  if (!contenedorServicios) return;
  contenedorServicios.innerHTML = `
    <div class="servicios-vacio" role="status" aria-live="polite">
      <div class="servicios-vacio__icono">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </div>
      <h3>No se encontraron estudios en "${categoriaSeleccionada}"</h3>
      <p>
        Actualmente no disponemos de procedimientos activos registrados bajo este criterio. 
        Puede restablecer los filtros para consultar todos los estudios disponibles.
      </p>
      <button type="button" class="btn btn--primario" id="btn-reset-filtros">
        Ver todos los estudios
      </button>
    </div>
  `;

  const btnReset = document.getElementById('btn-reset-filtros');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      aplicarFiltro('Todos');
    });
  }
}

/**
 * Renderiza las tarjetas de los estudios médicos en el DOM.
 * @param {Array<object>} estudios - Lista de estudios a mostrar.
 */
function renderizarTarjetasEstudios(estudios) {
  if (!contenedorServicios) return;

  if (!estudios || estudios.length === 0) {
    renderizarEstadoVacio(categoriaActiva);
    return;
  }

  const htmlTarjetas = estudios.map((estudio) => {
    const precio = Number(estudio.precioAproximado || 0).toFixed(2);
    const icono = obtenerIconoCategoria(estudio.categoria);

    return `
      <article class="estudio" id="${estudio.id}">
        <header class="estudio__cabeza">
          <span class="estudio__icono" aria-hidden="true">
            ${icono}
          </span>
          <div>
            <p class="estudio__tipo">${estudio.categoria}</p>
            <h3>${estudio.nombre}</h3>
          </div>
        </header>

        ${estudio.descripcion ? `<p class="estudio__desc">${estudio.descripcion}</p>` : ''}

        <div style="background: rgba(22, 22, 92, 0.6); border: 1px solid var(--color-iris-border); border-radius: 18px; padding: 14px 16px; margin: 4px 0;">
          <strong style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-clinical-cyan); margin-bottom: 4px;">
            Indicaciones y Preparación Previa:
          </strong>
          <p style="font-size: 13px; color: var(--color-pearl); line-height: 1.45; margin: 0;">
            ${estudio.preparacion}
          </p>
        </div>

        <dl class="estudio__datos">
          <div>
            <dt>Duración estimada</dt>
            <dd>${estudio.duracion}</dd>
          </div>
          <div>
            <dt>Entrega de informe</dt>
            <dd>Mismo día</dd>
          </div>
          <div>
            <dt>Radiación</dt>
            <dd>Ninguna</dd>
          </div>
          <div>
            <dt>Inversión aprox.</dt>
            <dd class="estudio__precio">$${precio}</dd>
          </div>
        </dl>

        <a class="btn btn--fantasma estudio__cta" href="citas.html?estudio=${encodeURIComponent(estudio.id)}">
          Solicitar este estudio
        </a>
      </article>
    `;
  }).join('');

  contenedorServicios.innerHTML = htmlTarjetas;
}

/**
 * Aplica el filtro en memoria mediante Array.prototype.filter().
 * @param {string} nuevaCategoria - Categoría seleccionada o 'Todos'.
 */
function aplicarFiltro(nuevaCategoria) {
  categoriaActiva = nuevaCategoria;

  // Actualizar clases activas y atributos de accesibilidad en los botones
  if (barraFiltros) {
    const botones = barraFiltros.querySelectorAll('.filtro-btn');
    botones.forEach((btn) => {
      const match = btn.getAttribute('data-categoria') === nuevaCategoria;
      if (match) {
        btn.classList.add('activo');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('activo');
        btn.setAttribute('aria-selected', 'false');
      }
    });
  }

  // Filtrado reactivo en memoria usando método nativo .filter()
  const estudiosFiltrados = todosLosEstudios.filter((estudio) => {
    if (nuevaCategoria === 'Todos') return true;
    return estudio.categoria === nuevaCategoria;
  });

  renderizarTarjetasEstudios(estudiosFiltrados);
}

/**
 * Inicializa los listeners de los botones de filtro.
 */
function configurarBotonesFiltros() {
  if (!barraFiltros) return;

  barraFiltros.addEventListener('click', (e) => {
    const btn = e.target.closest('.filtro-btn');
    if (!btn) return;

    const categoria = btn.getAttribute('data-categoria');
    if (categoria && categoria !== categoriaActiva) {
      aplicarFiltro(categoria);
    }
  });
}

/**
 * Carga inicial:
 * 1. Muestra estado de carga
 * 2. Siembra datos remotos (Seed) si Firestore está vacío
 * 3. Obtiene los estudios remotos
 * 4. Renderiza tarjetas y activa filtros
 */
async function inicializarPaginaServicios() {
  renderizarCargando();
  configurarBotonesFiltros();

  try {
    // 1. Garantizar persistencia remota mediante Seed inicial
    await inicializarCatalogoSeed();

    // 2. Consultar estudios activos desde Firestore
    todosLosEstudios = await obtenerEstudios();

    // 3. Renderizar vista inicial
    renderizarTarjetasEstudios(todosLosEstudios);
  } catch (error) {
    console.error("Error al cargar estudios médicos:", error);
    if (contenedorServicios) {
      contenedorServicios.innerHTML = `
        <div class="servicios-vacio" role="alert">
          <h3>Error de conexión con el catálogo</h3>
          <p>No se pudieron recuperar los estudios médicos en este momento. Por favor recargue la página.</p>
          <button type="button" class="btn btn--primario" onclick="window.location.reload()">
            Reintentar
          </button>
        </div>
      `;
    }
  }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarPaginaServicios);
} else {
  inicializarPaginaServicios();
}

