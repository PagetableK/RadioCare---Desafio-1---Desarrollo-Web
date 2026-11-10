/**
 * RadioCare - Panel Clínico Administrativo (panel.page.js)
 * Integrante 3: Panel del Coordinador, Procesamiento de Datos y Seguridad Backend.
 *
 * Responsabilidades:
 *   1. Protección estricta de ruta con guardián de rol 'coordinador' + Anti-BFCache.
 *   2. Carga reactiva de TODAS las citas desde Firestore (obtenerTodasLasCitas).
 *   3. Cálculo de KPIs en memoria (citas hoy, pendientes, mayor demanda, total).
 *   4. Búsqueda reactiva (input event) por nombre/apellidos/DUI del paciente.
 *   5. Filtros combinados por Estado y Médico Radiólogo.
 *   6. Ordenamiento cronológico con .sort() por fecha + franja horaria.
 *   7. Empty state cuando ningún registro coincide con los filtros activos.
 *   8. Acciones rápidas en tabla: cambiar estado, asignar radiólogo, eliminar (con modal).
 *   9. Retroalimentación visual (toast) de éxito o error tras cada operación.
 */

import { onAuthChange, obtenerUsuarioActual, auth } from "../services/auth.service.js";
import {
  obtenerTodasLasCitas,
  cambiarEstadoCita,
  asignarRadiologo,
  eliminarCitaDefinitiva,
  RADIOLOGOS_OFICIALES,
  ESTADOS_CITA
} from "../services/citas.service.js";

/* ==========================================================================
   REFERENCIAS AL DOM
   ========================================================================== */
const authLoading     = document.getElementById('panel-auth-loading');
const contenido       = document.getElementById('contenido');
const saludoEl        = document.getElementById('saludo-coordinador');
const infoEl          = document.getElementById('info-coordinador');

// KPIs
const kpiHoy          = document.getElementById('kpi-citas-hoy');
const kpiPendientes   = document.getElementById('kpi-pendientes');
const kpiTopValor     = document.getElementById('kpi-top-valor');
const kpiTopEtiqueta  = document.getElementById('kpi-top-etiqueta');
const kpiTotal        = document.getElementById('kpi-total');

// Controles de filtrado
const inputBusqueda   = document.getElementById('busqueda-citas');
const selectEstado    = document.getElementById('filtro-estado');
const selectRadiologo = document.getElementById('filtro-radiologo');

// Tabla
const tablaContenedor = document.getElementById('tabla-citas-contenedor');

// Modal de eliminación
const modalEliminar       = document.getElementById('modal-eliminar');
const modalBackdrop       = document.getElementById('modal-eliminar-backdrop');
const btnCancelarEliminar = document.getElementById('btn-cancelar-eliminacion');
const btnConfirmarEliminar= document.getElementById('btn-confirmar-eliminacion');

/* ==========================================================================
   ESTADO LOCAL EN MEMORIA
   ========================================================================== */
let todasLasCitas    = [];   // Cache completo desde Firestore
let citaIdPendiente  = null; // ID en espera de confirmación de eliminación

/* ==========================================================================
   UTILIDADES DE FORMATEO
   ========================================================================== */

/** Mapeo de claves de horario a representación legible en formato 12h. */
const HORARIOS_MAP = {
  'manana-temprana': '6:30 – 9:00 a. m.',
  'manana':          '9:00 – 12:00 p. m.',
  'mediodia':        '12:00 – 2:00 p. m.',
  'tarde':           '2:00 – 4:30 p. m.'
};

/** Orden numérico de franjas horarias para ordenamiento cronológico. */
const HORARIOS_ORDEN = {
  'manana-temprana': 1,
  'manana':          2,
  'mediodia':        3,
  'tarde':           4,
  '':                9
};

/**
 * Retorna la fecha local de hoy en formato YYYY-MM-DD (compatible con fechaPreferida en Firestore).
 * @returns {string}
 */
function obtenerFechaHoyLocal() {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd   = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extrae el nombre completo legible del paciente desde el documento de cita.
 * Acepta los posibles esquemas de almacenamiento: nombre plano, objeto contacto,
 * o pacienteNombre (campo alternativo).
 * @param {object} cita
 * @returns {string}
 */
function extraerNombrePaciente(cita) {
  if (cita.pacienteNombre) return cita.pacienteNombre;
  if (cita.contacto?.nombre && cita.contacto?.apellidos) {
    return `${cita.contacto.nombre} ${cita.contacto.apellidos}`.trim();
  }
  if (cita.contacto?.nombre) return cita.contacto.nombre;
  if (cita.nombre) return cita.nombre;
  return 'Paciente sin nombre';
}

/**
 * Extrae el DUI del paciente desde el documento de cita.
 * @param {object} cita
 * @returns {string}
 */
function extraerDUI(cita) {
  return cita.contacto?.dui || cita.dui || '';
}

/**
 * Obtiene el nombre legible del estudio radiológico desde el documento de cita.
 * @param {object} cita
 * @returns {string}
 */
function extraerEstudio(cita) {
  if (cita.estudioNombre) return cita.estudioNombre;
  if (typeof cita.estudio === 'string') return cita.estudio;
  if (cita.estudio?.nombre) return cita.estudio.nombre;
  if (cita.estudio?.tipo)   return cita.estudio.tipo;
  return 'Estudio Radiológico';
}

/**
 * Extrae la fecha preferida de la cita (formato YYYY-MM-DD).
 * Acepta tanto el campo 'agenda.fecha' como 'fechaPreferida' (campo alternativo).
 * @param {object} cita
 * @returns {string}
 */
function extraerFecha(cita) {
  return cita.agenda?.fecha || cita.fechaPreferida || '';
}

/**
 * Extrae la franja horaria interna de la cita.
 * @param {object} cita
 * @returns {string}
 */
function extraerHorario(cita) {
  return cita.agenda?.horario || cita.horario || '';
}

/* ==========================================================================
   TOAST DE RETROALIMENTACIÓN VISUAL
   ========================================================================== */

let toastTimeout = null;

/**
 * Muestra un toast de notificación durante `duracion` ms.
 * @param {string} mensaje    - Texto a mostrar.
 * @param {'exito'|'error'} tipo
 * @param {number} [duracion=3000]
 */
function mostrarToast(mensaje, tipo = 'exito', duracion = 3000) {
  // Eliminar toast previo si existe
  const previo = document.getElementById('rc-toast-panel');
  if (previo) previo.remove();
  if (toastTimeout) clearTimeout(toastTimeout);

  const toast = document.createElement('div');
  toast.id = 'rc-toast-panel';
  toast.className = `rc-toast rc-toast--${tipo}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 320);
  }, duracion);
}

/* ==========================================================================
   MODAL DE CONFIRMACIÓN DE ELIMINACIÓN
   ========================================================================== */

/** Abre el modal de confirmación para eliminar una cita. */
function abrirModalEliminar(citaId) {
  citaIdPendiente = citaId;
  if (!modalEliminar) return;
  modalEliminar.classList.remove('oculto');
  modalEliminar.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  btnCancelarEliminar?.focus();
}

/** Cierra el modal de confirmación. */
function cerrarModalEliminar() {
  citaIdPendiente = null;
  if (!modalEliminar) return;
  modalEliminar.classList.add('oculto');
  modalEliminar.setAttribute('hidden', 'true');
  document.body.style.overflow = '';
}

// Event listeners del modal de eliminación
btnCancelarEliminar?.addEventListener('click', cerrarModalEliminar);
modalBackdrop?.addEventListener('click', cerrarModalEliminar);

btnConfirmarEliminar?.addEventListener('click', async () => {
  if (!citaIdPendiente) return;

  const idAEliminar = citaIdPendiente;
  cerrarModalEliminar();

  btnConfirmarEliminar.disabled = true;

  try {
    await eliminarCitaDefinitiva(idAEliminar);
    // Remover de la caché local sin necesidad de recargar desde Firestore
    todasLasCitas = todasLasCitas.filter(c => c.id !== idAEliminar);
    aplicarFiltrosYRenderizar();
    calcularKPIs(todasLasCitas);
    mostrarToast('Cita eliminada definitivamente.', 'exito');
  } catch (err) {
    console.error('Error al eliminar cita:', err);
    mostrarToast('Error al eliminar la cita. Intente nuevamente.', 'error');
  } finally {
    btnConfirmarEliminar.disabled = false;
  }
});

// Cierre con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalEliminar && !modalEliminar.classList.contains('oculto')) {
    cerrarModalEliminar();
  }
});

/* ==========================================================================
   CÁLCULO DE KPIs EN MEMORIA
   ========================================================================== */

/**
 * Calcula y actualiza los 4 KPIs del panel con base en el array completo de citas.
 * - KPI 1: Total de citas programadas para hoy (fechaPreferida == fecha local actual).
 * - KPI 2: Total de citas pendientes de confirmación (estado == 'pendiente').
 * - KPI 3: Estudio o médico con mayor frecuencia (reduce → sort → primer elemento).
 * - KPI 4: Total general de citas registradas.
 * @param {Array<object>} citas
 */
function calcularKPIs(citas) {
  const hoy = obtenerFechaHoyLocal();

  // KPI 1 – Citas de hoy
  const citasHoy = citas.filter(c => extraerFecha(c) === hoy).length;
  if (kpiHoy) kpiHoy.textContent = citasHoy.toString();

  // KPI 2 – Pendientes
  const pendientes = citas.filter(c => c.estado === 'pendiente').length;
  if (kpiPendientes) kpiPendientes.textContent = pendientes.toString();

  // KPI 3 – Estudio con mayor demanda (calculado con .reduce())
  const frecuenciaEstudios = citas.reduce((acc, cita) => {
    const estudio = extraerEstudio(cita);
    acc[estudio] = (acc[estudio] || 0) + 1;
    return acc;
  }, {});

  const entriesFrecuencia = Object.entries(frecuenciaEstudios);

  if (entriesFrecuencia.length > 0) {
    // Ordenar descendente por frecuencia, tomar el primero
    entriesFrecuencia.sort((a, b) => b[1] - a[1]);
    const [estudioTop, conteoTop] = entriesFrecuencia[0];

    if (kpiTopValor) {
      // Acortar nombre largo para que quepa en la tarjeta
      kpiTopValor.textContent = estudioTop.length > 30
        ? estudioTop.substring(0, 28) + '…'
        : estudioTop;
    }
    if (kpiTopEtiqueta) {
      kpiTopEtiqueta.textContent = `Más solicitado (${conteoTop} cita${conteoTop !== 1 ? 's' : ''})`;
    }
  } else {
    if (kpiTopValor) kpiTopValor.textContent = '–';
    if (kpiTopEtiqueta) kpiTopEtiqueta.textContent = 'Mayor demanda';
  }

  // KPI 4 – Total
  if (kpiTotal) kpiTotal.textContent = citas.length.toString();
}

/* ==========================================================================
   FILTRADO, BÚSQUEDA Y ORDENAMIENTO EN MEMORIA
   ========================================================================== */

/**
 * Aplica los filtros activos sobre `todasLasCitas` y renderiza el resultado.
 * Opera completamente en memoria; no realiza nuevas consultas a Firestore.
 */
function aplicarFiltrosYRenderizar() {
  const textoBusqueda = (inputBusqueda?.value || '').trim().toLowerCase();
  const estadoFiltro  = selectEstado?.value || '';
  const medicoFiltro  = selectRadiologo?.value || '';

  let citasFiltradas = [...todasLasCitas];

  // 1. Búsqueda reactiva por nombre/apellidos del paciente o DUI
  if (textoBusqueda) {
    citasFiltradas = citasFiltradas.filter(cita => {
      const nombre = extraerNombrePaciente(cita).toLowerCase();
      const dui    = extraerDUI(cita).toLowerCase();
      return nombre.includes(textoBusqueda) || dui.includes(textoBusqueda);
    });
  }

  // 2. Filtro por Estado
  if (estadoFiltro) {
    citasFiltradas = citasFiltradas.filter(c =>
      (c.estado || 'pendiente').toLowerCase() === estadoFiltro
    );
  }

  // 3. Filtro por Médico Radiólogo
  if (medicoFiltro) {
    if (medicoFiltro === 'sin-asignar') {
      citasFiltradas = citasFiltradas.filter(c =>
        !c.medicoAsignado || c.medicoAsignado === '' || c.medicoAsignado === null
      );
    } else {
      citasFiltradas = citasFiltradas.filter(c => c.medicoAsignado === medicoFiltro);
    }
  }

  // 4. Ordenamiento cronológico: por fecha (YYYY-MM-DD) → franja horaria → createdAt
  citasFiltradas.sort((a, b) => {
    const fechaA = extraerFecha(a) || '9999-99-99';
    const fechaB = extraerFecha(b) || '9999-99-99';
    if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);

    const ordenA = HORARIOS_ORDEN[extraerHorario(a)] ?? 9;
    const ordenB = HORARIOS_ORDEN[extraerHorario(b)] ?? 9;
    if (ordenA !== ordenB) return ordenA - ordenB;

    // Desempate por timestamp de creación
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  });

  // 5. Renderizar resultado (tabla o empty state)
  if (citasFiltradas.length === 0) {
    renderizarEstadoVacio();
  } else {
    renderizarTablaCitas(citasFiltradas);
  }
}

/* ==========================================================================
   RENDERIZADO DE ESTADOS DE LA TABLA
   ========================================================================== */

/** Muestra un spinner mientras se consulta Firestore. */
function renderizarEstadoCarga() {
  if (!tablaContenedor) return;
  tablaContenedor.innerHTML = `
    <div class="panel-auth-loading" style="min-height: 180px; padding: 40px 16px;">
      <span class="rc-spinner" aria-hidden="true"></span>
      <p style="margin-top: 12px; color: var(--color-ash); font-size: 14px;">
        Cargando agenda clínica desde Firestore…
      </p>
    </div>
  `;
}

/** Renderiza el estado vacío cuando ningún registro coincide con los filtros. */
function renderizarEstadoVacio() {
  if (!tablaContenedor) return;

  const hayFiltros = inputBusqueda?.value?.trim() || selectEstado?.value || selectRadiologo?.value;
  const mensaje = hayFiltros
    ? 'Ningún registro coincide con los filtros activos. Ajuste los criterios de búsqueda.'
    : 'No hay citas registradas en el sistema.';

  tablaContenedor.innerHTML = `
    <div class="panel-empty-state" role="status">
      <div class="panel-empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <p class="panel-empty-state__texto">${mensaje}</p>
      ${hayFiltros ? `<button type="button" class="btn btn--fantasma" id="btn-limpiar-filtros"
        style="font-size:13px; padding:10px 20px;">
        Limpiar filtros
      </button>` : ''}
    </div>
  `;

  document.getElementById('btn-limpiar-filtros')?.addEventListener('click', () => {
    if (inputBusqueda) inputBusqueda.value = '';
    if (selectEstado) selectEstado.value = '';
    if (selectRadiologo) selectRadiologo.value = '';
    aplicarFiltrosYRenderizar();
  });
}

/**
 * Genera el HTML del badge de estado con sus clases de color correspondientes.
 * @param {string} estado
 * @returns {string}
 */
function generarBadgeEstado(estado) {
  const e = (estado || 'pendiente').toLowerCase();
  const textos = { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada' };
  return `<span class="badge-estado badge-estado--${e}">${textos[e] || e}</span>`;
}

/**
 * Genera el selector <select> de cambio de estado para cada fila de la tabla.
 * @param {object} cita
 * @returns {string}
 */
function generarSelectEstado(cita) {
  const estadoActual = (cita.estado || 'pendiente').toLowerCase();
  const opciones = ESTADOS_CITA.map(e =>
    `<option value="${e}" ${e === estadoActual ? 'selected' : ''}>
      ${e.charAt(0).toUpperCase() + e.slice(1)}
    </option>`
  ).join('');

  return `
    <select
      class="select-accion select-estado-cita"
      data-id="${cita.id}"
      aria-label="Cambiar estado de cita"
      title="Cambiar estado"
    >
      ${opciones}
    </select>
  `;
}

/**
 * Genera el selector <select> de asignación de radiólogo para cada fila.
 * @param {object} cita
 * @returns {string}
 */
function generarSelectRadiologo(cita) {
  const medicoActual = cita.medicoAsignado || '';
  const opcionVacia = `<option value="" ${!medicoActual ? 'selected' : ''}>Sin asignar</option>`;
  const opciones = RADIOLOGOS_OFICIALES.map(m =>
    `<option value="${m}" ${m === medicoActual ? 'selected' : ''}>${m}</option>`
  ).join('');

  return `
    <select
      class="select-accion select-radiologo-cita"
      data-id="${cita.id}"
      aria-label="Asignar médico radiólogo"
      title="Asignar radiólogo"
    >
      ${opcionVacia}
      ${opciones}
    </select>
  `;
}

/**
 * Renderiza la tabla completa de citas con controles de acción por fila.
 * @param {Array<object>} citas
 */
function renderizarTablaCitas(citas) {
  if (!tablaContenedor) return;

  const filasHtml = citas.map(cita => {
    const nombre     = extraerNombrePaciente(cita);
    const dui        = extraerDUI(cita);
    const estudio    = extraerEstudio(cita);
    const fecha      = extraerFecha(cita) || '–';
    const horario    = HORARIOS_MAP[extraerHorario(cita)] || extraerHorario(cita) || '–';
    const medico     = cita.medicoAsignado || '<span style="color:var(--color-fog);">Sin asignar</span>';

    return `
      <tr>
        <td>
          <strong>${fecha}</strong>
          ${horario !== '–' ? `<br><span style="font-size:12px;color:var(--color-fog);">${horario}</span>` : ''}
        </td>
        <td>
          <span class="paciente-nombre">${nombre}</span>
          ${dui ? `<span class="paciente-dui">DUI: ${dui}</span>` : ''}
        </td>
        <td>${estudio}</td>
        <td>${medico}</td>
        <td>${generarBadgeEstado(cita.estado)}</td>
        <td>
          <div class="acciones-celda">
            ${generarSelectEstado(cita)}
            ${generarSelectRadiologo(cita)}
          </div>
        </td>
        <td style="text-align:center;">
          <button
            type="button"
            class="btn-eliminar-cita"
            data-id="${cita.id}"
            aria-label="Eliminar cita de ${nombre}"
            title="Eliminar cita definitivamente"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tablaContenedor.innerHTML = `
    <table class="panel-tabla" aria-label="Lista de citas clínicas">
      <thead>
        <tr>
          <th>Fecha / Franja</th>
          <th>Paciente</th>
          <th>Estudio Radiológico</th>
          <th>Médico Radiólogo</th>
          <th>Estado</th>
          <th>Acciones Rápidas</th>
          <th style="text-align:center;">Eliminar</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml}
      </tbody>
    </table>
  `;
}

/* ==========================================================================
   DELEGACIÓN DE EVENTOS EN LA TABLA (Acciones rápidas)
   ========================================================================== */

/**
 * Listener único delegado sobre el contenedor de la tabla.
 * Maneja cambio de estado, asignación de radiólogo y eliminación.
 */
tablaContenedor?.addEventListener('change', async (e) => {
  const target = e.target;

  // ── Cambio de Estado ────────────────────────────────────────────────────
  if (target.classList.contains('select-estado-cita')) {
    const citaId     = target.dataset.id;
    const nuevoEstado = target.value;
    if (!citaId) return;

    target.disabled = true;
    try {
      await cambiarEstadoCita(citaId, nuevoEstado);

      // Actualizar caché local
      const idx = todasLasCitas.findIndex(c => c.id === citaId);
      if (idx !== -1) todasLasCitas[idx].estado = nuevoEstado;

      calcularKPIs(todasLasCitas);
      aplicarFiltrosYRenderizar();
      mostrarToast(`Estado actualizado a "${nuevoEstado}" correctamente.`, 'exito');
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      mostrarToast('No se pudo actualizar el estado. Intente de nuevo.', 'error');
      // Revertir visualmente
      const cita = todasLasCitas.find(c => c.id === citaId);
      if (cita) target.value = cita.estado || 'pendiente';
    } finally {
      target.disabled = false;
    }
    return;
  }

  // ── Asignación de Radiólogo ─────────────────────────────────────────────
  if (target.classList.contains('select-radiologo-cita')) {
    const citaId       = target.dataset.id;
    const nuevoMedico  = target.value;
    if (!citaId) return;

    target.disabled = true;
    try {
      await asignarRadiologo(citaId, nuevoMedico);

      // Actualizar caché local
      const idx = todasLasCitas.findIndex(c => c.id === citaId);
      if (idx !== -1) todasLasCitas[idx].medicoAsignado = nuevoMedico || null;

      aplicarFiltrosYRenderizar();
      const textoMedico = nuevoMedico || 'Sin asignar';
      mostrarToast(`Radiólogo asignado: ${textoMedico}.`, 'exito');
    } catch (err) {
      console.error('Error al asignar radiólogo:', err);
      mostrarToast('No se pudo asignar el radiólogo. Intente de nuevo.', 'error');
      // Revertir visualmente
      const cita = todasLasCitas.find(c => c.id === citaId);
      if (cita) target.value = cita.medicoAsignado || '';
    } finally {
      target.disabled = false;
    }
    return;
  }
});

// Botones de eliminación (delegados sobre click)
tablaContenedor?.addEventListener('click', (e) => {
  const btnEliminar = e.target.closest('.btn-eliminar-cita');
  if (btnEliminar) {
    const citaId = btnEliminar.dataset.id;
    if (citaId) abrirModalEliminar(citaId);
  }
});

/* ==========================================================================
   LISTENERS DE CONTROLES DE FILTRADO (Reactividad)
   ========================================================================== */
inputBusqueda?.addEventListener('input', aplicarFiltrosYRenderizar);
selectEstado?.addEventListener('change', aplicarFiltrosYRenderizar);
selectRadiologo?.addEventListener('change', aplicarFiltrosYRenderizar);

/* ==========================================================================
   CARGA PRINCIPAL DE DATOS DESDE FIRESTORE
   ========================================================================== */

/**
 * Consulta todas las citas desde Firestore, actualiza el estado local
 * y dispara el renderizado completo del panel.
 */
async function cargarTodasLasCitas() {
  renderizarEstadoCarga();
  try {
    todasLasCitas = await obtenerTodasLasCitas();
    calcularKPIs(todasLasCitas);
    aplicarFiltrosYRenderizar();
  } catch (error) {
    console.error('Error al cargar citas para el panel de coordinación:', error);
    if (tablaContenedor) {
      tablaContenedor.innerHTML = `
        <div class="panel-empty-state" style="border-color:#ff4d6d; background:rgba(255,77,109,0.08);">
          <p style="color:#ffb3c1; margin:0 0 12px 0;">
            Error al obtener los registros de Firestore.
          </p>
          <button type="button" class="btn btn--fantasma" id="btn-reintentar-panel"
            style="font-size:13px;">
            Reintentar
          </button>
        </div>
      `;
      document.getElementById('btn-reintentar-panel')?.addEventListener('click', cargarTodasLasCitas);
    }
  }
}

/* ==========================================================================
   PROTECCIÓN ANTI-BFCache (EVENTO pageshow)
   Previene que el botón "Atrás" muestre contenido protegido desde caché.
   ========================================================================== */
async function revalidarSesionCoordinador() {
  try {
    const usuario = await obtenerUsuarioActual(true);
    if (!usuario || !auth.currentUser || usuario.rol !== 'coordinador') {
      if (contenido) contenido.setAttribute('hidden', 'true');
      window.location.replace('acceso.html');
      return;
    }
    // Recargar datos al volver desde BFCache
    await cargarTodasLasCitas();
  } catch (error) {
    console.error('Error en revalidación Anti-BFCache del panel:', error);
    if (contenido) contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    revalidarSesionCoordinador();
  }
});

/* ==========================================================================
   GUARDIÁN DE RUTA — onAuthChange (Punto de entrada principal)
   Único lugar donde se decide si el contenido del panel se muestra o no.
   ========================================================================== */
onAuthChange(async ({ authUser, userData }) => {
  // Sin sesión activa → redirigir a acceso
  if (!authUser || !userData) {
    if (authLoading) authLoading.style.display = 'none';
    if (contenido)   contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
    return;
  }

  const rol = (userData.rol || '').toLowerCase();

  // Rol no autorizado → redirigir inmediatamente
  if (rol !== 'coordinador') {
    if (authLoading) authLoading.style.display = 'none';
    if (contenido)   contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
    return;
  }

  // ── Rol 'coordinador' confirmado ──────────────────────────────────────────

  // 1. Ocultar loader y revelar el panel
  if (authLoading) authLoading.style.display = 'none';
  if (contenido) {
    contenido.removeAttribute('hidden');
  }

  // 2. Personalizar saludo con nombre del coordinador
  if (saludoEl) {
    const nombre = `${userData.nombre || ''} ${userData.apellido || ''}`.trim();
    saludoEl.textContent = `Bienvenido(a), Coord. ${nombre}`;
  }
  if (infoEl) {
    infoEl.textContent = `Sesión activa como Coordinador(a) Clínico(a) · ${userData.email || ''}`;
  }

  // 3. Cargar todas las citas desde Firestore
  await cargarTodasLasCitas();
});
