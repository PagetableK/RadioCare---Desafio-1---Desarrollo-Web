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
  subirInformeCita,
  obtenerInformePorCita,
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

// Modal de ficha / expediente del paciente
const modalFichaPaciente        = document.getElementById('modal-ficha-paciente');
const modalFichaBackdrop        = document.getElementById('modal-ficha-backdrop');
const btnCerrarModalFicha       = document.getElementById('btn-cerrar-modal-ficha');
const btnCerrarModalFichaFooter = document.getElementById('btn-cerrar-modal-ficha-footer');

// Campos del modal de ficha del paciente
const fichaNombre        = document.getElementById('ficha-nombre');
const fichaDui           = document.getElementById('ficha-dui');
const fichaNacimiento    = document.getElementById('ficha-nacimiento');
const fichaSexo          = document.getElementById('ficha-sexo');
const fichaEmbarazo      = document.getElementById('ficha-embarazo');
const fichaEmail         = document.getElementById('ficha-email');
const fichaTelefono      = document.getElementById('ficha-telefono');
const fichaMedicoOrdena  = document.getElementById('ficha-medico-ordena');
const fichaModalidad     = document.getElementById('ficha-modalidad');
const fichaOrdenMedica   = document.getElementById('ficha-orden-medica');
const fichaImplantes     = document.getElementById('ficha-implantes');
const fichaAlergia       = document.getElementById('ficha-alergia');
const fichaRenal         = document.getElementById('ficha-renal');
const fichaRecordatorio  = document.getElementById('ficha-recordatorio');
const fichaNotas         = document.getElementById('ficha-notas');

// Input selector de archivo para subida de informe diagnóstico (PDF / DICOM)
const inputArchivoInforme = document.getElementById('input-archivo-informe');

/* ==========================================================================
   ESTADO LOCAL EN MEMORIA
   ========================================================================== */
let todasLasCitas       = [];   // Cache completo desde Firestore
let citaIdPendiente     = null; // ID en espera de confirmación de eliminación
let citaIdParaInforme   = null; // ID de cita para subida de informe diagnóstico
let botonInformeActivo  = null; // Referencia al botón que disparó la subida
let ultimoElementoFoco  = null; // Elemento activo para restaurar foco accesible

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
 * Normaliza de forma retrocompatible los campos del documento de cita,
 * buscando en orden de prioridad para soportar esquemas antiguos y nuevos:
 *   - Nombre completo: cita.pacienteNombreCompleto o ${nombres} ${apellidos}
 *   - DUI: cita.paciente?.dui || cita.datosPaciente?.dui || cita.dui || 'No registrado'
 *   - Destinatario: cita.tipoDestinatario === 'familiar'
 *
 * @param {object} cita
 * @returns {{ nombreCompleto: string, dui: string, esFamiliar: boolean }}
 */
export function extraerDatosPaciente(cita) {
  if (!cita) {
    return {
      nombreCompleto: 'Paciente sin nombre',
      dui: 'No registrado',
      esFamiliar: false
    };
  }

  // 1. Nombre completo: orden de prioridad retrocompatible
  let nombreCompleto = '';

  if (cita.pacienteNombreCompleto && String(cita.pacienteNombreCompleto).trim()) {
    nombreCompleto = String(cita.pacienteNombreCompleto).trim();
  } else {
    const nombres = (
      cita.paciente?.nombres ||
      cita.paciente?.nombre ||
      cita.datosPaciente?.nombres ||
      cita.datosPaciente?.nombre ||
      cita.contacto?.nombre ||
      cita.nombres ||
      cita.nombre ||
      ''
    ).trim();

    const apellidos = (
      cita.paciente?.apellidos ||
      cita.paciente?.apellido ||
      cita.datosPaciente?.apellidos ||
      cita.datosPaciente?.apellido ||
      cita.contacto?.apellidos ||
      cita.apellidos ||
      cita.apellido ||
      ''
    ).trim();

    nombreCompleto = `${nombres} ${apellidos}`.trim();
  }

  if (!nombreCompleto && cita.pacienteNombre) {
    nombreCompleto = String(cita.pacienteNombre).trim();
  }

  if (!nombreCompleto) {
    nombreCompleto = 'Paciente sin nombre';
  }

  // 2. DUI: orden de prioridad retrocompatible
  let dui = (
    cita.paciente?.dui ||
    cita.datosPaciente?.dui ||
    cita.dui ||
    cita.contacto?.dui ||
    ''
  ).trim();

  if (!dui) {
    dui = 'No registrado';
  }

  // 3. Destinatario (Familiar vs Para mí)
  const esFamiliar = cita.tipoDestinatario === 'familiar' || cita.destinatario === 'para-familiar';

  return {
    nombreCompleto,
    dui,
    esFamiliar
  };
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

// Cierre con Escape para modales
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalFichaPaciente && !modalFichaPaciente.classList.contains('oculto') && !modalFichaPaciente.hasAttribute('hidden')) {
      cerrarModalFichaPaciente();
      return;
    }
    if (modalEliminar && !modalEliminar.classList.contains('oculto') && !modalEliminar.hasAttribute('hidden')) {
      cerrarModalEliminar();
      return;
    }
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
   MODAL DE EXPEDIENTE / FICHA COMPLETA DEL PACIENTE
   ========================================================================== */

/**
 * Retorna un valor formateado para la ficha o un fallback si está vacío.
 * @param {*} val
 * @param {string} fallback
 * @returns {string}
 */
function formatearTextoFicha(val, fallback = 'No registrado') {
  if (val === undefined || val === null) return fallback;
  const str = String(val).trim();
  return str.length > 0 ? str : fallback;
}

/**
 * Abre el modal responsivo de expediente / ficha del paciente estructurado en 3 bloques.
 * @param {object} cita
 */
function abrirModalFichaPaciente(cita) {
  if (!modalFichaPaciente || !cita) return;

  ultimoElementoFoco = document.activeElement;

  const datosPac = extraerDatosPaciente(cita);

  // ── BLOQUE 1: DATOS DE IDENTIFICACIÓN ─────────────────────────────────
  if (fichaNombre) {
    fichaNombre.textContent = datosPac.nombreCompleto;
  }

  if (fichaDui) {
    fichaDui.textContent = datosPac.dui;
  }

  const nacimiento = cita.paciente?.nacimiento ||
    cita.paciente?.fechaNacimiento ||
    cita.datosPaciente?.nacimiento ||
    cita.datosPaciente?.fechaNacimiento ||
    cita.nacimiento ||
    cita.fechaNacimiento ||
    '';
  if (fichaNacimiento) {
    fichaNacimiento.textContent = formatearTextoFicha(nacimiento, 'No registrada');
  }

  const sexo = cita.paciente?.sexoBiologico ||
    cita.paciente?.sexo ||
    cita.datosPaciente?.sexoBiologico ||
    cita.datosPaciente?.sexo ||
    cita.sexoBiologico ||
    cita.sexo ||
    '';
  if (fichaSexo) {
    fichaSexo.textContent = formatearTextoFicha(sexo, 'No especificado');
  }

  const embarazo = cita.paciente?.embarazo ||
    cita.datosPaciente?.embarazo ||
    cita.embarazo ||
    '';
  let textoEmbarazo = 'No especificado';
  if (sexo && String(sexo).toLowerCase() === 'masculino') {
    textoEmbarazo = 'No aplica (Sexo masculino)';
  } else if (embarazo === 'si') {
    textoEmbarazo = 'Sí';
  } else if (embarazo === 'no') {
    textoEmbarazo = 'No';
  } else if (embarazo === 'posible') {
    textoEmbarazo = 'Posiblemente';
  } else if (embarazo === 'na') {
    textoEmbarazo = 'No aplica';
  } else if (embarazo) {
    textoEmbarazo = embarazo;
  }
  if (fichaEmbarazo) {
    fichaEmbarazo.textContent = textoEmbarazo;
  }

  // ── BLOQUE 2: CONTACTO Y ORDEN MÉDICA ─────────────────────────────────
  const email = cita.contacto?.email || cita.email || cita.pacienteEmail || '';
  if (fichaEmail) {
    fichaEmail.textContent = formatearTextoFicha(email, 'No registrado');
  }

  const telefono = cita.contacto?.telefono || cita.telefono || '';
  if (fichaTelefono) {
    fichaTelefono.textContent = formatearTextoFicha(telefono, 'No registrado');
  }

  const medicoOrdena = cita.clinica?.medicoOrdena ||
    cita.clinica?.medicoQueOrdena ||
    cita.clinica?.medicoTratante ||
    cita.medicoOrdena ||
    cita.medicoQueOrdena ||
    cita.medicoTratante ||
    cita.medicoSolicitante ||
    '';
  if (fichaMedicoOrdena) {
    fichaMedicoOrdena.textContent = formatearTextoFicha(medicoOrdena, 'No especificado');
  }

  const modalidad = cita.estudio?.modalidad || cita.modalidad || '';
  let textoModalidad = 'Agendar cita con fecha';
  if (modalidad === 'cotizacion') {
    textoModalidad = 'Solo solicitar cotización';
  } else if (modalidad === 'cita') {
    textoModalidad = 'Agendar cita con fecha';
  } else if (modalidad) {
    textoModalidad = modalidad;
  }
  if (fichaModalidad) {
    fichaModalidad.textContent = textoModalidad;
  }

  const ordenMedica = cita.clinica?.ordenMedica ||
    cita.clinica?.orden_medica ||
    cita.ordenMedica ||
    cita.orden_medica ||
    '';
  let textoOrdenMedica = 'No especificado';
  if (ordenMedica === 'si') {
    textoOrdenMedica = 'Sí, cuenta con orden médica escrita';
  } else if (ordenMedica === 'no') {
    textoOrdenMedica = 'No, requiere orientación clínica';
  } else if (ordenMedica === 'cotizacion') {
    textoOrdenMedica = 'Solo cotización, sin orden médica';
  } else if (ordenMedica) {
    textoOrdenMedica = ordenMedica;
  }
  if (fichaOrdenMedica) {
    fichaOrdenMedica.textContent = textoOrdenMedica;
  }

  // ── BLOQUE 3: INFORMACIÓN CLÍNICA ADICIONAL ────────────────────────────
  const implantes = cita.clinica?.implantes || cita.implantes || '';
  const mapaImplantes = {
    'no': 'No presenta implantes',
    'marcapasos': 'Marcapasos o desfibrilador',
    'protesis': 'Prótesis articular (cadera, rodilla)',
    'clip': 'Clip cerebral o vascular',
    'otro': 'Otro dispositivo metálico'
  };
  if (fichaImplantes) {
    fichaImplantes.textContent = mapaImplantes[implantes] || (implantes ? implantes : 'No registrado');
  }

  const alergia = cita.clinica?.alergia || cita.alergia || '';
  const mapaAlergia = {
    'no': 'No presenta alergias conocidas',
    'si': 'Sí, alergia a medios de contraste (yodo / gadolinio)',
    'desconoce': 'No lo sabe / Desconoce'
  };
  if (fichaAlergia) {
    fichaAlergia.textContent = mapaAlergia[alergia] || (alergia ? alergia : 'No registrada');
  }

  const renal = cita.clinica?.renal || cita.renal || '';
  const mapaRenal = {
    'no': 'No',
    'si': 'Sí, presenta antecedente de ERC'
  };
  if (fichaRenal) {
    fichaRenal.textContent = mapaRenal[renal] || (renal ? renal : 'No registrada');
  }

  const recordatorio = cita.clinica?.recordatorioWhatsApp !== undefined
    ? cita.clinica.recordatorioWhatsApp
    : (cita.recordatorio !== undefined ? cita.recordatorio : null);
  let textoRecordatorio = 'No especificado';
  if (recordatorio === true) {
    textoRecordatorio = 'Sí, solicitado por WhatsApp (24h antes)';
  } else if (recordatorio === false) {
    textoRecordatorio = 'No solicitado';
  }
  if (fichaRecordatorio) {
    fichaRecordatorio.textContent = textoRecordatorio;
  }

  const notas = (cita.clinica?.notas || cita.notas || '').trim();
  if (fichaNotas) {
    fichaNotas.textContent = notas.length > 0 ? notas : 'Sin notas ni indicaciones adicionales.';
  }

  // Revelar modal accesible
  modalFichaPaciente.classList.remove('oculto');
  modalFichaPaciente.removeAttribute('hidden');
  modalFichaPaciente.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    btnCerrarModalFicha?.focus();
  }, 50);
}

/**
 * Cierra el modal de expediente / ficha del paciente y restaura el foco accesible.
 */
function cerrarModalFichaPaciente() {
  if (!modalFichaPaciente) return;
  modalFichaPaciente.classList.add('oculto');
  modalFichaPaciente.setAttribute('hidden', 'true');
  modalFichaPaciente.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  if (ultimoElementoFoco && typeof ultimoElementoFoco.focus === 'function') {
    ultimoElementoFoco.focus();
  }
}

// Event listeners de cierre para el modal de ficha del paciente
btnCerrarModalFicha?.addEventListener('click', cerrarModalFichaPaciente);
btnCerrarModalFichaFooter?.addEventListener('click', cerrarModalFichaPaciente);
modalFichaBackdrop?.addEventListener('click', cerrarModalFichaPaciente);
modalFichaPaciente?.addEventListener('click', (e) => {
  if (e.target === modalFichaPaciente) {
    cerrarModalFichaPaciente();
  }
});

/* ==========================================================================
   GESTIÓN DE INFORMES DIAGNÓSTICOS (PDF & DICOM - PLAN SPARK BASE64)
   ========================================================================== */

/**
 * Convierte un Data URL (o cadena Base64 pura) a un objeto Blob nativo.
 * Evita bloqueos de seguridad del navegador al abrir o descargar blobs.
 * @param {string} dataUrl
 * @param {string} [mimeFallback='application/pdf']
 * @returns {Blob}
 */
function dataUrlABlob(dataUrl, mimeFallback = 'application/pdf') {
  if (!dataUrl) {
    throw new Error('No se encontraron datos del archivo para convertir a Blob.');
  }

  let mime = mimeFallback;
  let base64String = dataUrl;

  if (dataUrl.startsWith('data:')) {
    const partes = dataUrl.split(',');
    const encabezado = partes[0];
    base64String = partes[1] || '';
    const matchMime = encabezado.match(/:(.*?);/);
    if (matchMime && matchMime[1]) {
      mime = matchMime[1];
    }
  }

  const sliceSize = 1024;
  const byteCharacters = atob(base64String);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mime });
}

/**
 * Procesa la selección de archivo para subir informe diagnóstico a Firestore.
 * Valida tamaño máximo de 700 KB (límite Spark) y convierte a Data URL.
 */
inputArchivoInforme?.addEventListener('change', async (e) => {
  const archivo = e.target.files?.[0];
  if (!archivo || !citaIdParaInforme) {
    if (inputArchivoInforme) inputArchivoInforme.value = '';
    return;
  }

  const citaId = citaIdParaInforme;
  const boton = botonInformeActivo;

  // Límite de tamaño: 700 KB (716,800 bytes)
  const LIMITE_BYTES = 700 * 1024;
  if (archivo.size > LIMITE_BYTES) {
    const tamanoKb = (archivo.size / 1024).toFixed(1);
    mostrarToast(
      `El archivo "${archivo.name}" (${tamanoKb} KB) supera el límite máximo permitido de 700 KB para el plan gratuito de Firestore. Por favor elija un archivo más ligero.`,
      'error',
      5500
    );
    inputArchivoInforme.value = '';
    return;
  }

  // Estado de carga en el botón
  const contenidoOriginal = boton ? boton.innerHTML : '';
  if (boton) {
    boton.disabled = true;
    boton.innerHTML = `
      <span class="rc-spinner" style="width: 12px; height: 12px; border-width: 2px; vertical-align: middle; display: inline-block;" aria-hidden="true"></span>
      Subiendo...
    `;
  }

  try {
    // Conversión asíncrona a Data URL (Base64)
    const dataBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Error al leer el archivo en el navegador."));
      reader.readAsDataURL(archivo);
    });

    const subidoPor = auth.currentUser?.email || auth.currentUser?.uid || 'Coordinador';

    await subirInformeCita(citaId, {
      nombreArchivo: archivo.name,
      tipoArchivo: archivo.type || 'application/pdf',
      dataBase64,
      subidoPor
    });

    // Actualizar caché en memoria
    const idx = todasLasCitas.findIndex(c => c.id === citaId);
    if (idx !== -1) {
      todasLasCitas[idx].tieneInforme = true;
      todasLasCitas[idx].nombreInforme = archivo.name;
    }

    mostrarToast(`Informe "${archivo.name}" subido exitosamente.`, 'exito');

    // Actualizar la fila inmediatamente sin recargar la página
    aplicarFiltrosYRenderizar();
  } catch (error) {
    console.error("Error al subir el informe diagnóstico:", error);
    mostrarToast(error.message || 'Error al guardar el informe en Firestore.', 'error');
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = contenidoOriginal;
    }
  } finally {
    inputArchivoInforme.value = '';
    citaIdParaInforme = null;
    botonInformeActivo = null;
  }
});

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

  // 1. Búsqueda reactiva por nombre/apellidos del paciente o DUI normalizados con extraerDatosPaciente
  if (textoBusqueda) {
    citasFiltradas = citasFiltradas.filter(cita => {
      const { nombreCompleto, dui } = extraerDatosPaciente(cita);
      const nombreMin = nombreCompleto.toLowerCase();
      const duiMin = dui.toLowerCase();
      const coincideDui = dui !== 'No registrado' && duiMin.includes(textoBusqueda);
      return nombreMin.includes(textoBusqueda) || coincideDui;
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
 * Renderiza la tabla completa de citas con controles de acción por fila,
 * columna de expediente con botón circular de información y columna de subida de informes diagnósticos.
 * @param {Array<object>} citas
 */
function renderizarTablaCitas(citas) {
  if (!tablaContenedor) return;

  const filasHtml = citas.map(cita => {
    const { nombreCompleto, dui } = extraerDatosPaciente(cita);
    const estudio    = extraerEstudio(cita);
    const fecha      = extraerFecha(cita) || '–';
    const horario    = HORARIOS_MAP[extraerHorario(cita)] || extraerHorario(cita) || '–';
    const medico     = cita.medicoAsignado || '<span style="color:var(--color-fog);">Sin asignar</span>';
    const estadoNorm = (cita.estado || 'pendiente').toLowerCase();

    // 1. Columna PACIENTE: Nombre, DUI y botón circular de ficha clínica (sin badge ni texto de Para mí o Familiar)
    const pacienteHtml = `
      <div class="paciente-celda-wrap">
        <div class="paciente-info-col">
          <div class="paciente-nombre-linea">
            <span class="paciente-nombre">${nombreCompleto}</span>
          </div>
          ${dui && dui !== 'No registrado' ? `<span class="paciente-dui">DUI: ${dui}</span>` : ''}
        </div>
        <button
          type="button"
          class="btn-info-paciente"
          data-id="${cita.id}"
          title="Ver ficha completa del paciente"
          aria-label="Ver ficha completa de ${nombreCompleto}"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </button>
      </div>
    `;

    // 2. Columna INFORME / ARCHIVOS (PDF & DICOM)
    let celdaInformeHtml = '';
    if (estadoNorm !== 'completada') {
      celdaInformeHtml = `<span class="texto-disponible-completar">Disponible al completar</span>`;
    } else {
      if (cita.tieneInforme) {
        const nombreArchivo = cita.nombreInforme || 'Informe adjunto';
        celdaInformeHtml = `
          <div class="informe-col-wrap">
            <div class="informe-botones-wrap">
              <button
                type="button"
                class="btn-subir-informe btn-informe-actualizar"
                data-id="${cita.id}"
                title="Actualizar informe clínico (PDF o DICOM)"
                aria-label="Actualizar informe clínico de ${nombreCompleto}"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Actualizar informe
              </button>
              <button
                type="button"
                class="btn-ver-informe"
                data-id="${cita.id}"
                title="Ver o descargar informe clínico"
                aria-label="Ver informe clínico de ${nombreCompleto}"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Ver informe
              </button>
            </div>
            <span class="informe-nombre-archivo" title="${nombreArchivo}">
              📄 ${nombreArchivo}
            </span>
          </div>
        `;
      } else {
        celdaInformeHtml = `
          <button
            type="button"
            class="btn-subir-informe btn-informe-nuevo"
            data-id="${cita.id}"
            title="Subir informe PDF o imagen DICOM"
            aria-label="Subir PDF o DICOM para ${nombreCompleto}"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Subir PDF & DICOM
          </button>
        `;
      }
    }

    return `
      <tr>
        <td>
          <strong>${fecha}</strong>
          ${horario !== '–' ? `<br><span style="font-size:12px;color:var(--color-fog);">${horario}</span>` : ''}
        </td>
        <td>${pacienteHtml}</td>
        <td>${estudio}</td>
        <td>${medico}</td>
        <td>${generarBadgeEstado(cita.estado)}</td>
        <td>
          <div class="acciones-celda">
            ${generarSelectEstado(cita)}
            ${generarSelectRadiologo(cita)}
          </div>
        </td>
        <td>${celdaInformeHtml}</td>
        <td style="text-align:center;">
          <button
            type="button"
            class="btn-eliminar-cita"
            data-id="${cita.id}"
            aria-label="Eliminar cita de ${nombreCompleto}"
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
    <table class="panel-tabla" aria-label="Agenda de Pacientes y Procedimientos">
      <thead>
        <tr>
          <th>Fecha / Franja</th>
          <th>PACIENTE</th>
          <th>Estudio Radiológico</th>
          <th>Médico Radiólogo</th>
          <th>Estado</th>
          <th>ACCIONES RÁPIDAS</th>
          <th>INFORME / ARCHIVOS</th>
          <th style="text-align:center;">ELIMINAR</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml}
      </tbody>
    </table>
  `;
}

/* ==========================================================================
   DELEGACIÓN DE EVENTOS EN LA TABLA (Acciones rápidas, Ficha y Subida)
   ========================================================================== */

/**
 * Listener de cambio delegado sobre el contenedor de la tabla.
 * Maneja cambio de estado y asignación de radiólogo.
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
      // Al cambiar a 'completada', aplicarFiltrosYRenderizar() habilita el botón de informe de inmediato
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

// Listener delegado de clics en la tabla: ficha clínica, subida de informe, visualización y eliminación
tablaContenedor?.addEventListener('click', async (e) => {
  // 1. Ver ficha completa del paciente
  const btnInfo = e.target.closest('.btn-info-paciente');
  if (btnInfo) {
    const citaId = btnInfo.dataset.id;
    const cita = todasLasCitas.find(c => c.id === citaId);
    if (cita) {
      abrirModalFichaPaciente(cita);
    }
    return;
  }

  // 2. Subir o actualizar informe diagnóstico (PDF / DICOM)
  const btnSubir = e.target.closest('.btn-subir-informe');
  if (btnSubir) {
    const citaId = btnSubir.dataset.id;
    if (citaId && inputArchivoInforme) {
      citaIdParaInforme = citaId;
      botonInformeActivo = btnSubir;
      inputArchivoInforme.click();
    }
    return;
  }

  // 3. Ver o descargar informe diagnóstico (Blob URL nativa)
  const btnVer = e.target.closest('.btn-ver-informe');
  if (btnVer) {
    const citaId = btnVer.dataset.id;
    if (!citaId) return;

    const contenidoOriginal = btnVer.innerHTML;
    btnVer.disabled = true;
    btnVer.innerHTML = `
      <span class="rc-spinner" style="width: 12px; height: 12px; border-width: 2px; vertical-align: middle; display: inline-block;" aria-hidden="true"></span>
      Abriendo...
    `;

    try {
      const informe = await obtenerInformePorCita(citaId);
      if (!informe || !informe.dataBase64) {
        throw new Error('No se encontró el archivo del informe diagnóstico en Firestore.');
      }

      const nombreArchivo = informe.nombreArchivo || `Informe_${citaId}.pdf`;
      const tipoArchivo = informe.tipoArchivo || 'application/pdf';
      const blob = dataUrlABlob(informe.dataBase64, tipoArchivo);
      const blobUrl = URL.createObjectURL(blob);

      const extension = (nombreArchivo.split('.').pop() || '').toLowerCase();
      const extensionesPrevisualizables = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
      const esPrevisualizable = extensionesPrevisualizables.includes(extension) ||
        tipoArchivo.includes('pdf') ||
        tipoArchivo.startsWith('image/');

      if (esPrevisualizable) {
        const nuevaVentana = window.open(blobUrl, '_blank');
        // Si el navegador bloqueó la ventana emergente, forzar descarga como alternativa segura
        if (!nuevaVentana) {
          const enlace = document.createElement('a');
          enlace.href = blobUrl;
          enlace.download = nombreArchivo;
          document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
        }
      } else {
        // Formato clínico no previsualizable directamente por el navegador (como .dcm)
        const enlace = document.createElement('a');
        enlace.href = blobUrl;
        enlace.download = nombreArchivo;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
      }

      // Revocar URL temporal después de 1 minuto para liberar memoria
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);
    } catch (err) {
      console.error('Error al abrir el informe diagnóstico:', err);
      mostrarToast(err.message || 'Error al abrir el informe diagnóstico.', 'error');
    } finally {
      btnVer.disabled = false;
      btnVer.innerHTML = contenidoOriginal;
    }
    return;
  }

  // 4. Eliminar cita (modal de confirmación)
  const btnEliminar = e.target.closest('.btn-eliminar-cita');
  if (btnEliminar) {
    const citaId = btnEliminar.dataset.id;
    if (citaId) abrirModalEliminar(citaId);
    return;
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

    // Sincronizar estado de informe para citas completadas donde no esté definido directamente en el documento
    await Promise.all(
      todasLasCitas.map(async (c) => {
        const est = (c.estado || '').toLowerCase();
        if (est === 'completada' && c.tieneInforme === undefined) {
          try {
            const inf = await obtenerInformePorCita(c.id);
            if (inf && inf.dataBase64) {
              c.tieneInforme = true;
              c.nombreInforme = inf.nombreArchivo;
            } else {
              c.tieneInforme = false;
            }
          } catch (_) {
            c.tieneInforme = false;
          }
        }
      })
    );

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
