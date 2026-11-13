/**
 * RadioCare - Lógica de Mis Citas (mis-citas.page.js)
 * Manejo de control de sesión estricto, protección Anti-BFCache,
 * consulta reactiva a Firestore en colección 'citas' filtrada por usuarioId,
 * renderizado dinámico de registros con soporte para edición y cancelación de citas pendientes,
 * modales interactivos y accesibles (preparación y edición), feedback con toasts y confirmaciones accesibles.
 */

import { onAuthChange, obtenerUsuarioActual, auth } from "../services/auth.service.js";
import { 
  obtenerMisCitas, 
  actualizarCitaPaciente, 
  cancelarCitaPaciente,
  obtenerInformePorCita
} from "../services/citas.service.js";
import { obtenerEstudios } from "../services/estudios.service.js";
import { 
  mostrarToast, 
  mostrarModalConfirmacion, 
  setBotonCargando, 
  mostrarAlerta, 
  limpiarAlerta 
} from "../utils/ui.js";
import { 
  validarFechaCita, 
  validarHorarioSabado 
} from "../utils/validators.js";

/* ==========================================================================
   REFERENCIAS AL DOM
   ========================================================================== */
const contenido = document.getElementById('contenido');
const authLoading = document.getElementById('auth-loading');
const pacienteSaludo = document.getElementById('paciente-saludo');
const pacienteInfo = document.getElementById('paciente-info');
const historialCitasContenedor = document.getElementById('historial-citas') || document.querySelector('.panel-tabla-wrap');
const statProximaCita = document.getElementById('stat-proxima-cita');
const statInformes = document.getElementById('stat-informes');

// Modal interactivo de preparación médica
const modalPreparacion = document.getElementById('modal-preparacion');
const modalTituloEstudio = document.getElementById('modal-preparacion-estudio');
const modalTextoPreparacion = document.getElementById('modal-preparacion-texto');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const btnEntendidoModal = document.getElementById('btn-entendido-modal');
const modalBackdrop = document.getElementById('modal-preparacion-backdrop');

// Modal interactivo de modificación de cita
const modalEditarCita = document.getElementById('modal-editar-cita');
const modalEditarBackdrop = document.getElementById('modal-editar-backdrop');
const btnCerrarModalEditar = document.getElementById('btn-cerrar-modal-editar');
const btnCancelarModalEditar = document.getElementById('btn-cancelar-modal-editar');
const btnGuardarModalEditar = document.getElementById('btn-guardar-modal-editar');
const formEditarCita = document.getElementById('form-editar-cita');
const editarCitaIdInput = document.getElementById('editar-cita-id');
const modalEditarEstudioBadge = document.getElementById('modal-editar-cita-estudio');
const editarFechaInput = document.getElementById('editar-fecha');
const editarHorarioSelect = document.getElementById('editar-horario');
const editarNotasTextarea = document.getElementById('editar-notas');
const alertaModalEditar = document.getElementById('alerta-modal-editar');

// Estado local
let usuarioAuthActual = null;
let catalogoEstudios = [];
let citasCache = [];
let ultimoElementoEnfocado = null;
const mapaPreparacionCitas = new Map();

/* ==========================================================================
   UTILIDADES DE FORMATEO Y MAPEO CLÍNICO
   ========================================================================== */

/**
 * Traduce las claves internas de horarios a representaciones legibles.
 * @param {string} horario
 * @returns {string}
 */
function formatearHorario(horario) {
  if (!horario) return '';
  const mapa = {
    'manana-temprana': '6:30 a. m. – 9:00 a. m.',
    'manana': '9:00 a. m. – 12:00 p. m.',
    'mediodia': '12:00 p. m. – 2:00 p. m.',
    'tarde': '2:00 p. m. – 4:30 p. m.'
  };
  return mapa[horario] || horario;
}

/**
 * Obtiene el nombre clínico amigable del estudio solicitado.
 * @param {object} cita
 * @returns {string}
 */
function formatearEstudio(cita) {
  if (!cita) return 'Estudio Radiológico';
  if (cita.estudioNombre) return cita.estudioNombre;
  if (typeof cita.estudio === 'string') return cita.estudio;

  if (cita.estudio && typeof cita.estudio === 'object') {
    if (cita.estudio.nombre) return cita.estudio.nombre;

    const mapaEstudios = {
      'us-abdominal': 'Ultrasonido abdominal',
      'us-abdominal+pelvies': 'Ultrasonido abdominal+pelvis',
      'us-vejiga': 'Ultrasonido de vejiga',
      'us-pelvis': 'Ultrasonido de pelvis',
      'us-próstata': 'Ultrasonido de próstata',
      'us-embarzo': 'Ultrasonido para embarazadas',
      'us-tiroides': 'Ultrasonido de cuello y tiroides',
      'us-inguinal': 'Ultrasonido inguinal',
      'us-pared-abdominal': 'Ultrasonido pared abdominal',
      'us-mama': 'Ultrasonido de mama',
      'us-testiculos': 'Ultrasonido de testículos',
      'us-tórax': 'Ultrasonido de tórax',
      'us-ocular': 'Ultrasonido ocular',
      'us-hombro': 'Ultrasonido de hombro',
      'us-rodilla': 'Ultrasonido de rodilla',
      'us-codo': 'Ultrasonido de codo',
      'us-muñeca': 'Ultrasonido de muñeca',
      'us-tobillo': 'Ultrasonido de tobillo',
      'us-tendón': 'Ultrasonido de tendón de Aquiles',
      'doppler-arterial-superior': 'Doppler arterial de miembro superior',
      'doppler-arterial-inferior': 'Doppler arterial de miembro inferior',
      'doppler-venoso-superior': 'Doppler venoso de miembro superior',
      'doppler-venoso-inferior': 'Doppler venoso de miembro inferior',
      'doppler-renal': 'Doppler renal',
      'doppler-aorta': 'Doppler aorta',
      'CAAF': 'CAAF',
      'Guía de procedimientos': 'Guía de procedimientos',
      'Marcajes prequirúrgicos': 'Marcajes prequirúrgicos'
    };

    return mapaEstudios[cita.estudio.tipo] || cita.estudio.tipo || 'Estudio Radiológico';
  }

  return 'Estudio Radiológico';
}

/* ==========================================================================
   CATÁLOGO Y DIRECTRICES DE PREPARACIÓN MÉDICA PREVIA
   ========================================================================== */

const PREPARACIONES_POR_DEFECTO = {
  'us-abdominal': 'Ayuno estricto de 6 a 8 horas (evitar sólidos y lácteos). Puede tomar agua pura sin gas. No suspender medicación habitual.',
  'us-abdominal+pelvies': 'Ayuno estricto de 6 a 8 horas. Además, ingerir 1 litro de agua pura 1 hora antes de la cita y retener la orina para ventana vesical.',
  'us-vejiga': 'No requiere ayuno. Vejiga llena (tomar 1 litro de agua 1 hora antes de la cita y no orinar hasta finalizar el examen).',
  'us-pelvis': 'No requiere ayuno. Vejiga llena (tomar 1 litro de agua 1 hora antes de la cita y retener la orina).',
  'us-pelvico': 'Ingerir 1 litro de agua pura 1 hora antes de su cita y retener la orina para una óptima ventana acústica vesical.',
  'us-próstata': 'No requiere ayuno. Ingerir 1 litro de agua pura 1 hora antes del estudio para llenar la vejiga y retener la orina.',
  'us-embarzo': 'No requiere ayuno. Ropa cómoda de dos piezas. Presentar estudios ecográficos y carné de control prenatal previos si dispone de ellos.',
  'us-obstetrico': 'No requiere ayuno. Ropa cómoda de dos piezas. Presentar estudios ecográficos y carné de control prenatal previos.',
  'us-renal': 'Ayuno de 4 horas e ingesta de 3 a 4 vasos de agua 45 minutos antes del examen con vejiga cómodamente llena.',
  'us-mama': 'No aplicarse desodorante, talcos, lociones ni cremas corporales en senos ni axilas el día del estudio. Acudir con ropa cómoda de dos piezas.',
  'us-tiroides': 'Sin ayuno. Acudir con el cuello libre de accesorios metálicos. Presentar resultados previos de perfil tiroideo (TSH, T4L) si dispone.',
  'doppler-carotideo': 'No requiere ayuno ni preparación especial con líquidos. Acudir con cuello despejado, sin collares ni accesorios metálicos.',
  'doppler-venoso-inf': 'No requiere ayuno. Acudir con prendas cómodas y fáciles de retirar de la cintura hacia abajo (short o falda holgada).',
  'doppler-venoso-inferior': 'No requiere ayuno. Acudir con prendas cómodas y fáciles de retirar de la cintura hacia abajo (short o falda holgada).',
  'doppler-arterial-inf': 'No requiere ayuno. Se recomienda reposo de 10 minutos previo al examen. No fumar al menos 2 horas antes de la prueba.',
  'doppler-arterial-inferior': 'No requiere ayuno. Se recomienda reposo de 10 minutos previo al examen. No fumar al menos 2 horas antes de la prueba.',
  'doppler-venoso-superior': 'No requiere ayuno. Presentarse con prendas holgadas de manga corta o sin mangas.',
  'doppler-arterial-superior': 'No requiere ayuno. Presentarse con prendas holgadas de manga corta o sin mangas.',
  'doppler-renal': 'Ayuno de 6 horas. Tomar 2 a 3 vasos de agua 45 minutos antes del examen con vejiga cómodamente llena.',
  'doppler-aorta': 'Ayuno estricto de 6 a 8 horas (evitar sólidos, lácteos y bebidas con gas). Puede tomar agua pura sin gas.',
  'CAAF': 'Presentar pruebas recientes de tiempos de coagulación (TP, TTP) e informe ecográfico previo. Venir acompañado de un adulto. Ayuno ligero de 2 horas.',
  'proc-biopsia-caaf': 'Presentar pruebas recientes de tiempos de coagulación (TP, TTP) e informe previo. Venir acompañado. Ayuno ligero de 2 h.',
  'Marcajes prequirúrgicos': 'Ayuno de 4 horas. Presentar orden médica por escrito del cirujano tratante y expediente de imágenes previas.',
  'proc-marcaje': 'Ayuno de 4 horas. Presentar orden médica por escrito del cirujano tratante y expediente de imágenes previas.',
  'Guía de procedimientos': 'Presentar orden médica e indicación del especialista. Venir acompañado. Ayuno de 4 horas si fue indicado por su médico.'
};

/**
 * Resuelve la preparación médica de una cita cruzando datos del documento,
 * el catálogo de Firestore y las directrices clínicas estándar.
 * @param {object} cita
 * @returns {string}
 */
function resolverPreparacion(cita) {
  if (cita?.preparacion) return cita.preparacion;
  if (cita?.estudio?.preparacion) return cita.estudio.preparacion;

  const tipo = (cita?.estudio?.tipo || cita?.estudioNombre || (typeof cita?.estudio === 'string' ? cita.estudio : '')).trim();

  // Búsqueda en catálogo de Firestore
  if (catalogoEstudios && catalogoEstudios.length > 0) {
    const itemCatalogo = catalogoEstudios.find((item) => 
      item.id === tipo || 
      item.id === cita?.estudio?.id ||
      (item.nombre && tipo && item.nombre.toLowerCase().includes(tipo.toLowerCase()))
    );
    if (itemCatalogo?.preparacion) {
      return itemCatalogo.preparacion;
    }
  }

  // Búsqueda directa en mapa de preparaciones
  if (tipo && PREPARACIONES_POR_DEFECTO[tipo]) {
    return PREPARACIONES_POR_DEFECTO[tipo];
  }

  // Coincidencias por palabras clave clínicas
  const tipoMin = tipo.toLowerCase();
  if (tipoMin.includes('abdominal') && tipoMin.includes('pelvi')) {
    return PREPARACIONES_POR_DEFECTO['us-abdominal+pelvies'];
  }
  if (tipoMin.includes('abdominal') || tipoMin.includes('higado') || tipoMin.includes('vesicula')) {
    return PREPARACIONES_POR_DEFECTO['us-abdominal'];
  }
  if (tipoMin.includes('vejiga') || tipoMin.includes('pelvis') || tipoMin.includes('prostata')) {
    return PREPARACIONES_POR_DEFECTO['us-vejiga'];
  }
  if (tipoMin.includes('embaraz') || tipoMin.includes('obstetr')) {
    return PREPARACIONES_POR_DEFECTO['us-embarzo'];
  }
  if (tipoMin.includes('renal')) {
    return PREPARACIONES_POR_DEFECTO['us-renal'];
  }
  if (tipoMin.includes('mama')) {
    return PREPARACIONES_POR_DEFECTO['us-mama'];
  }
  if (tipoMin.includes('tiroides') || tipoMin.includes('cuello')) {
    return PREPARACIONES_POR_DEFECTO['us-tiroides'];
  }
  if (tipoMin.includes('caaf') || tipoMin.includes('biopsia')) {
    return PREPARACIONES_POR_DEFECTO['proc-biopsia-caaf'];
  }
  if (tipoMin.includes('marcaje')) {
    return PREPARACIONES_POR_DEFECTO['proc-marcaje'];
  }

  return "Este estudio no requiere preparación previa especial. Presentarse 15 minutos antes con ropa cómoda.";
}

/* ==========================================================================
   DESCARGA Y GESTIÓN DE ARCHIVOS CLÍNICOS (BASE64 / DATA URLS / BLOBS)
   ========================================================================== */

/**
 * Convierte un Data URL o Base64 en Blob y dispara la descarga real en el navegador.
 * Compatible con archivos PDF e imágenes médicas DICOM bajo el plan gratuito de Firestore.
 * @param {string} dataBase64 - Contenido Base64 o Data URL
 * @param {string} nombreArchivo - Nombre del archivo a descargar (ej. Informe_123.pdf)
 * @param {string} [tipoMime] - Tipo MIME por defecto si no viene en dataBase64
 */
function descargarArchivoBase64(dataBase64, nombreArchivo = 'informe.pdf', tipoMime = 'application/pdf') {
  if (!dataBase64) return;

  let base64Limpio = dataBase64;
  let mime = tipoMime || 'application/pdf';

  if (dataBase64.startsWith('data:')) {
    const partes = dataBase64.split(',');
    const mimeMatch = partes[0].match(/:(.*?);/);
    if (mimeMatch) {
      mime = mimeMatch[1];
    }
    base64Limpio = partes[1] || '';
  }

  // Eliminar espacios en blanco y saltos de línea para compatibilidad con atob
  base64Limpio = base64Limpio.replace(/\s/g, '');

  try {
    const caracteresBinarios = atob(base64Limpio);
    const longitud = caracteresBinarios.length;
    const bytes = new Uint8Array(longitud);

    for (let i = 0; i < longitud; i++) {
      bytes[i] = caracteresBinarios.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    const enlaceDescarga = document.createElement('a');
    enlaceDescarga.href = blobUrl;
    enlaceDescarga.download = nombreArchivo;
    enlaceDescarga.style.display = 'none';

    document.body.appendChild(enlaceDescarga);
    enlaceDescarga.click();

    setTimeout(() => {
      if (document.body.contains(enlaceDescarga)) {
        document.body.removeChild(enlaceDescarga);
      }
      URL.revokeObjectURL(blobUrl);
    }, 1500);
  } catch (error) {
    console.error("Error al procesar la decodificación Base64 del archivo:", error);
    throw new Error("El archivo adjunto presenta un formato no válido.");
  }
}

/* ==========================================================================
   CONTROL DE MODAL ACCESIBLE DE PREPARACIÓN MÉDICA
   ========================================================================== */

/**
 * Abre el modal interactivo de preparación médica.
 * @param {string} estudioNombre
 * @param {string} preparacionTexto
 */
function abrirModalPreparacion(estudioNombre, preparacionTexto) {
  if (!modalPreparacion) return;

  ultimoElementoEnfocado = document.activeElement;

  if (modalTituloEstudio) {
    modalTituloEstudio.textContent = estudioNombre || 'Estudio Radiológico';
  }

  if (modalTextoPreparacion) {
    modalTextoPreparacion.textContent = preparacionTexto || 
      'Este estudio no requiere preparación previa especial. Presentarse 15 minutos antes con ropa cómoda.';
  }

  modalPreparacion.classList.remove('oculto');
  modalPreparacion.removeAttribute('hidden');
  modalPreparacion.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  (btnEntendidoModal || btnCerrarModal)?.focus();
}

/**
 * Cierra el modal interactivo de preparación médica y restaura el foco previo.
 */
function cerrarModalPreparacion() {
  if (!modalPreparacion) return;

  modalPreparacion.classList.add('oculto');
  modalPreparacion.setAttribute('hidden', 'true');
  modalPreparacion.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  if (ultimoElementoEnfocado && typeof ultimoElementoEnfocado.focus === 'function') {
    ultimoElementoEnfocado.focus();
  }
}

// Event Listeners de cierre del modal de preparación
btnCerrarModal?.addEventListener('click', cerrarModalPreparacion);
btnEntendidoModal?.addEventListener('click', cerrarModalPreparacion);
modalBackdrop?.addEventListener('click', cerrarModalPreparacion);

modalPreparacion?.addEventListener('click', (e) => {
  if (e.target === modalPreparacion) {
    cerrarModalPreparacion();
  }
});

/* ==========================================================================
   CONTROL DE MODAL ACCESIBLE DE EDICIÓN DE CITA (PACIENTE)
   ========================================================================== */

/**
 * Actualiza la disponibilidad de franjas horarias en el modal según la fecha seleccionada.
 * Si es sábado (día 6): habilita exclusivamente turnos matutinos (6:30 a. m. a 12:00 p. m.).
 * Si es lunes a viernes: habilita todas las opciones regulares.
 * @param {string} fechaValor - Cadena YYYY-MM-DD
 */
function actualizarFranjasModalEditar(fechaValor) {
  if (!editarHorarioSelect) return;

  if (!fechaValor) {
    Array.from(editarHorarioSelect.options).forEach((opt) => {
      opt.disabled = false;
      opt.hidden = false;
    });
    return;
  }

  const partes = fechaValor.split('-');
  if (partes.length !== 3) return;
  const fechaObj = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  if (isNaN(fechaObj.getTime())) return;

  const diaSemana = fechaObj.getDay();

  if (diaSemana === 6) {
    // Sábado: Exclusivamente turnos matutinos
    const matutinas = ['manana-temprana', 'manana'];
    let teniaTarde = false;

    Array.from(editarHorarioSelect.options).forEach((opt) => {
      if (!opt.value) return;
      if (matutinas.includes(opt.value)) {
        opt.disabled = false;
        opt.hidden = false;
      } else {
        opt.disabled = true;
        opt.hidden = true;
        if (editarHorarioSelect.value === opt.value) {
          teniaTarde = true;
        }
      }
    });

    if (teniaTarde) {
      editarHorarioSelect.value = '';
      mostrarAlerta(
        alertaModalEditar,
        'Los sábados la atención es exclusivamente matutina (6:30 a. m. a 12:00 p. m.). Seleccione un turno de la mañana.',
        'warning'
      );
    }
  } else {
    // Lunes a viernes: Habilitar todas las opciones regulares
    Array.from(editarHorarioSelect.options).forEach((opt) => {
      opt.disabled = false;
      opt.hidden = false;
    });
  }
}

/**
 * Abre el modal accesible de edición precargado con los datos de la cita.
 * @param {object} cita
 */
function abrirModalEditar(cita) {
  if (!modalEditarCita || !cita) return;

  ultimoElementoEnfocado = document.activeElement;

  if (editarCitaIdInput) {
    editarCitaIdInput.value = cita.id;
  }

  if (modalEditarEstudioBadge) {
    modalEditarEstudioBadge.textContent = formatearEstudio(cita);
  }

  // Establecer fecha mínima: mañana en hora local
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const anioMin = manana.getFullYear();
  const mesMin = String(manana.getMonth() + 1).padStart(2, '0');
  const diaMin = String(manana.getDate()).padStart(2, '0');
  const fechaMinStr = `${anioMin}-${mesMin}-${diaMin}`;

  if (editarFechaInput) {
    editarFechaInput.min = fechaMinStr;
    const fechaActual = cita.agenda?.fecha || cita.fecha || '';
    editarFechaInput.value = fechaActual;
    editarFechaInput.style.borderColor = '';
    actualizarFranjasModalEditar(fechaActual);
  }

  if (editarHorarioSelect) {
    const horarioActual = cita.agenda?.horario || cita.horario || '';
    editarHorarioSelect.value = horarioActual;
  }

  if (editarNotasTextarea) {
    editarNotasTextarea.value = cita.clinica?.notas || cita.notas || '';
  }

  limpiarAlerta(alertaModalEditar);

  modalEditarCita.classList.remove('oculto');
  modalEditarCita.removeAttribute('hidden');
  modalEditarCita.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Foco inicial accesible
  setTimeout(() => {
    editarFechaInput?.focus();
  }, 50);
}

/**
 * Cierra el modal de edición de cita y restaura el foco accesible.
 */
function cerrarModalEditar() {
  if (!modalEditarCita) return;

  modalEditarCita.classList.add('oculto');
  modalEditarCita.setAttribute('hidden', 'true');
  modalEditarCita.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  limpiarAlerta(alertaModalEditar);

  if (ultimoElementoEnfocado && typeof ultimoElementoEnfocado.focus === 'function') {
    ultimoElementoEnfocado.focus();
  }
}

// Listeners de cierre del modal de edición
btnCerrarModalEditar?.addEventListener('click', cerrarModalEditar);
btnCancelarModalEditar?.addEventListener('click', cerrarModalEditar);
modalEditarBackdrop?.addEventListener('click', cerrarModalEditar);

// Validación reactiva de fecha al escribir o cambiar
editarFechaInput?.addEventListener('change', () => {
  const fecha = editarFechaInput.value;
  limpiarAlerta(alertaModalEditar);

  if (!fecha) {
    editarFechaInput.style.borderColor = '';
    return;
  }

  if (!validarFechaCita(fecha)) {
    editarFechaInput.style.borderColor = '#ff4d6d';
    mostrarAlerta(
      alertaModalEditar,
      'Fecha no disponible. Recuerde que atendemos de lunes a sábado con al menos 24 horas de antelación (domingos la clínica permanece cerrada).',
      'warning'
    );
    return;
  }

  editarFechaInput.style.borderColor = '';
  actualizarFranjasModalEditar(fecha);
});

// Listener de cambio en franja horaria
editarHorarioSelect?.addEventListener('change', () => {
  limpiarAlerta(alertaModalEditar);
  const fecha = editarFechaInput?.value;
  const horario = editarHorarioSelect.value;

  if (fecha && horario) {
    if (!validarHorarioSabado(fecha, horario)) {
      mostrarAlerta(
        alertaModalEditar,
        'Los sábados la atención es exclusivamente matutina (6:30 a. m. a 12:00 p. m.).',
        'warning'
      );
    }
  }
});

// Guardado del formulario de modificación de cita
formEditarCita?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarAlerta(alertaModalEditar);

  const citaId = editarCitaIdInput?.value;
  const fecha = editarFechaInput?.value?.trim();
  const horario = editarHorarioSelect?.value?.trim();
  const notas = editarNotasTextarea?.value?.trim() || '';

  if (!citaId) {
    mostrarAlerta(alertaModalEditar, 'No se identificó la cita médica a modificar.', 'error');
    return;
  }

  // Validaciones con funciones puras centralizadas
  if (!fecha || !validarFechaCita(fecha)) {
    editarFechaInput.style.borderColor = '#ff4d6d';
    mostrarAlerta(
      alertaModalEditar,
      'Por favor seleccione una fecha válida (de lunes a sábado, con al menos 24 horas de antelación).',
      'warning'
    );
    editarFechaInput?.focus();
    return;
  }

  if (!horario) {
    mostrarAlerta(alertaModalEditar, 'Por favor seleccione la franja horaria deseada.', 'warning');
    editarHorarioSelect?.focus();
    return;
  }

  if (!validarHorarioSabado(fecha, horario)) {
    mostrarAlerta(
      alertaModalEditar,
      'La fecha seleccionada corresponde a día sábado: únicamente se permiten turnos matutinos (entre 6:30 a. m. y 12:00 p. m.).',
      'warning'
    );
    editarHorarioSelect?.focus();
    return;
  }

  try {
    setBotonCargando(btnGuardarModalEditar, true, 'Guardando cambios...');

    await actualizarCitaPaciente(citaId, {
      fecha,
      horario,
      notas
    });

    cerrarModalEditar();
    mostrarToast('Cita modificada exitosamente.', 'exito');

    // Refrescar reactivamente la tabla de citas sin recargar la página completa
    if (usuarioAuthActual) {
      await cargarCitasUsuario(usuarioAuthActual.uid);
    }
  } catch (error) {
    console.error("Error al actualizar la cita médica:", error);
    mostrarAlerta(
      alertaModalEditar,
      error.message || 'No fue posible actualizar su cita. Por favor intente nuevamente.',
      'error'
    );
  } finally {
    setBotonCargando(btnGuardarModalEditar, false);
  }
});

// Cierre accesible con Escape para ambos modales
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalEditarCita && !modalEditarCita.classList.contains('oculto') && !modalEditarCita.hasAttribute('hidden')) {
      cerrarModalEditar();
      return;
    }
    if (modalPreparacion && !modalPreparacion.classList.contains('oculto') && !modalPreparacion.hasAttribute('hidden')) {
      cerrarModalPreparacion();
      return;
    }
  }
});

/* ==========================================================================
   RENDERIZADO DE ESTADOS: CARGA, VACÍO Y REGISTROS
   ========================================================================== */

/**
 * Renderiza un indicador de carga accesible mientras se consultan las citas en Firestore.
 */
function renderizarEstadoCarga() {
  if (!historialCitasContenedor) return;
  historialCitasContenedor.innerHTML = `
    <div class="panel-auth-loading" style="min-height: 180px; padding: 40px 16px;">
      <span class="rc-spinner" aria-hidden="true" style="
        display: inline-block;
        width: 32px;
        height: 32px;
        border: 3px solid rgba(0, 177, 255, 0.2);
        border-top-color: var(--color-clinical-cyan);
        border-radius: 50%;
        animation: rcSpin 0.7s linear infinite;
      "></span>
      <p style="margin-top: 12px; color: var(--color-ash); font-size: 14px;">Consultando historial clínico de citas en Firestore...</p>
    </div>
  `;
}

/**
 * Renderiza el bloque de estado vacío cuando la consulta retorna 0 registros.
 */
function renderizarEstadoVacio() {
  if (!historialCitasContenedor) return;
  historialCitasContenedor.innerHTML = `
    <div class="panel-empty-state">
      <div class="panel-empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <p class="panel-empty-state__texto">Todavía no se han agendado citas</p>
      <a href="citas.html" class="btn btn--primario">+ Solicitar nueva cita</a>
    </div>
  `;
}

/**
 * Inyecta dinámicamente las citas en la tabla mapeando los datos guardados en Firestore.
 * @param {Array<object>} citas
 */
function renderizarTablaCitas(citas) {
  if (!historialCitasContenedor) return;

  mapaPreparacionCitas.clear();

  const filasHtml = citas.map((cita, index) => {
    // 1. Fecha y Hora: agenda.fecha + agenda.horario
    const fecha = cita.agenda?.fecha || cita.fecha || 'Sin fecha asignada';
    const horarioFormateado = formatearHorario(cita.agenda?.horario || cita.horario);
    const fechaHoraHtml = `<strong>${fecha}</strong>${horarioFormateado ? `<br><span style="font-size: 13px; color: var(--color-fog);">${horarioFormateado}</span>` : ''}`;

    // 2. Paciente / Destinatario (Para mí vs Familiar)
    const esFamiliar = cita.tipoDestinatario === 'familiar' || cita.destinatario === 'para-familiar';
    const nombrePaciente = (
      cita.pacienteNombreCompleto || 
      `${cita.paciente?.nombre || ''} ${cita.paciente?.apellidos || ''}`.trim() || 
      (esFamiliar ? 'Familiar' : (usuarioAuthActual?.displayName || 'Titular'))
    ).trim();

    let pacienteHtml = '';
    if (esFamiliar) {
      pacienteHtml = `
        <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="badge-destinatario badge-destinatario--familiar">Familiar</span>
          <strong style="color: var(--color-cloud-white); font-weight: 600;">${nombrePaciente}</strong>
        </div>
      `;
    } else {
      pacienteHtml = `
        <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="badge-destinatario badge-destinatario--personal">Para mí</span>
        </div>
      `;
    }

    // 3. Estudio Solicitado
    const estudioNombre = formatearEstudio(cita);

    // Preparación Médica
    const preparacionTexto = resolverPreparacion(cita);
    const idCita = cita.id || `cita-${index}-${Date.now()}`;
    mapaPreparacionCitas.set(idCita, {
      estudioNombre,
      preparacion: preparacionTexto
    });

    const botonPreparacionHtml = `
      <button type="button" 
              class="btn-info-preparacion" 
              data-id="${idCita}" 
              data-estudio="${encodeURIComponent(estudioNombre)}" 
              data-preparacion="${encodeURIComponent(preparacionTexto)}" 
              title="Ver preparación médica para ${estudioNombre}" 
              aria-label="Ver preparación médica para ${estudioNombre}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>
    `;

    // 4. Médico Radiólogo Asignado (Destacado vs Pendiente)
    const nombreMedico = (cita.medicoAsignado || cita.medico || '').trim();
    let medicoHtml = '';
    if (nombreMedico) {
      medicoHtml = `
        <strong class="medico-destacado">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          ${nombreMedico}
        </strong>
      `;
    } else {
      medicoHtml = `<span class="medico-pendiente">Pendiente de asignación</span>`;
    }

    // 5. Estado: Badge con clase CSS según el valor
    const estado = (cita.estado || 'pendiente').toLowerCase();
    const textoEstado = estado.charAt(0).toUpperCase() + estado.slice(1);
    const badgeHtml = `<span class="badge-estado badge-estado--${estado} badge--${estado}">${textoEstado}</span>`;

    // 6. Acciones / Informe Diagnóstico:
    let accionHtml = '';
    if (estado === 'pendiente') {
      accionHtml = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button type="button" 
                  class="btn btn--fantasma btn-editar-cita" 
                  data-id="${cita.id}" 
                  style="padding: 6px 14px; font-size: 12px; border-radius: 9999px;">
            Modificar Cita
          </button>
          <button type="button" 
                  class="btn btn--peligro btn-cancelar-cita" 
                  data-id="${cita.id}" 
                  style="padding: 6px 14px; font-size: 12px; border-radius: 9999px;">
            Cancelar cita
          </button>
        </div>
      `;
    } else if (estado === 'completada') {
      if (cita.tieneInforme) {
        accionHtml = `
          <button type="button" 
                  class="btn btn--primario btn-informe-cita" 
                  data-id="${cita.id}" 
                  style="padding: 6px 14px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; border-radius: 9999px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Descargar PDF & DICOM
          </button>
        `;
      } else {
        accionHtml = `
          <span class="badge-informe-redaccion" title="El informe diagnóstico se encuentra en redacción por el especialista">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            Informe en redacción
          </span>
        `;
      }
    } else if (estado === 'confirmada') {
      accionHtml = `<span style="font-size: 13px; color: var(--color-fog);">Pendiente de realización</span>`;
    } else if (estado === 'cancelada') {
      accionHtml = `<span style="font-size: 13px; color: #ff6b8a;">Cita cancelada</span>`;
    } else {
      accionHtml = `<span style="font-size: 13px; color: var(--color-fog);">-</span>`;
    }

    return `
      <tr>
        <td>${fechaHoraHtml}</td>
        <td>${pacienteHtml}</td>
        <td>${estudioNombre}</td>
        <td class="text-center">${botonPreparacionHtml}</td>
        <td>${medicoHtml}</td>
        <td>${badgeHtml}</td>
        <td>${accionHtml}</td>
      </tr>
    `;
  }).join('');

  historialCitasContenedor.innerHTML = `
    <table class="panel-tabla">
      <thead>
        <tr>
          <th>Fecha y Hora</th>
          <th>PACIENTE / DESTINATARIO</th>
          <th>Estudio Solicitado</th>
          <th class="text-center">PREPARACIÓN</th>
          <th>MÉDICO RADIÓLOGO</th>
          <th>Estado</th>
          <th>INFORME DIAGNÓSTICO</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml}
      </tbody>
    </table>
  `;
}

/**
 * Actualiza las tarjetas superiores de métricas (Próxima cita programada e informes disponibles).
 * @param {Array<object>} citas
 */
function actualizarMetricas(citas) {
  const citasProgramadas = citas.filter((c) => {
    const est = (c.estado || '').toLowerCase();
    return est === 'confirmada' || est === 'pendiente';
  });

  const citasConInforme = citas.filter((c) => {
    const est = (c.estado || '').toLowerCase();
    return est === 'completada' && c.tieneInforme === true;
  });

  if (statProximaCita) {
    statProximaCita.textContent = citasProgramadas.length.toString();
  }
  if (statInformes) {
    statInformes.textContent = citasConInforme.length.toString();
  }
}

/* ==========================================================================
   CONSULTA REACTIVA A FIRESTORE Y CONTROL DE ACCIONES
   ========================================================================== */

/**
 * Obtiene las citas del usuario desde Firestore y renderiza la vista correspondiente.
 * @param {string} uid
 */
async function cargarCitasUsuario(uid) {
  renderizarEstadoCarga();

  try {
    if (!catalogoEstudios || catalogoEstudios.length === 0) {
      try {
        catalogoEstudios = await obtenerEstudios();
      } catch (errCat) {
        console.warn("Aviso al consultar catálogo de estudios para preparación:", errCat);
      }
    }

    // Consulta ordenada cronológicamente de citas del paciente (sin filtrar por DUI ni nombre)
    const citas = await obtenerMisCitas(uid);

    // Para citas completadas, verificar la disponibilidad del informe en la colección 'informes'
    await Promise.all(
      citas.map(async (c) => {
        const est = (c.estado || '').toLowerCase();
        if (est === 'completada') {
          if (c.tieneInforme === undefined) {
            try {
              const inf = await obtenerInformePorCita(c.id);
              c.tieneInforme = Boolean(inf && inf.dataBase64);
              if (inf) {
                c._informeData = inf;
              }
            } catch (_) {
              c.tieneInforme = false;
            }
          }
        }
      })
    );

    citasCache = citas;

    // Actualizar métricas del panel superior
    actualizarMetricas(citas);

    if (citas.length === 0) {
      renderizarEstadoVacio();
    } else {
      renderizarTablaCitas(citas);
    }

  } catch (error) {
    console.error("Error al cargar citas desde Firestore:", error);
    if (historialCitasContenedor) {
      historialCitasContenedor.innerHTML = `
        <div class="panel-empty-state" style="border-color: #ff4d6d; background: rgba(255, 77, 109, 0.08);">
          <p style="color: #ffb3c1; margin: 0 0 12px 0;">Ocurrió un error al obtener sus citas médicas de Firestore.</p>
          <button type="button" class="btn btn--fantasma" id="btn-reintentar-citas" style="font-size: 13px;">Reintentar consulta</button>
        </div>
      `;
      document.getElementById('btn-reintentar-citas')?.addEventListener('click', () => {
        cargarCitasUsuario(uid);
      });
    }
  }
}

// Delegación de eventos para botones interactivos en la tabla (editar, cancelar e informe)
if (historialCitasContenedor) {
  historialCitasContenedor.addEventListener('click', async (e) => {
    // 1. Modificar cita pendiente
    const btnEditar = e.target.closest('.btn-editar-cita');
    if (btnEditar) {
      const citaId = btnEditar.dataset.id;
      if (!citaId) return;

      const cita = citasCache.find(c => c.id === citaId);
      if (cita) {
        abrirModalEditar(cita);
      }
      return;
    }

    // 2. Cancelar cita mediante modal de confirmación accesible
    const btnCancelar = e.target.closest('.btn-cancelar-cita');
    if (btnCancelar) {
      const citaId = btnCancelar.dataset.id;
      if (!citaId) return;

      const confirmado = await mostrarModalConfirmacion({
        titulo: '¿Cancelar solicitud de cita?',
        mensaje: 'Esta acción cancelará su solicitud de estudio radiológico. La cita pasará a estado cancelada de forma inmediata.',
        textoConfirmar: 'Sí, cancelar cita',
        textoCancelar: 'Mantener cita'
      });

      if (!confirmado) return;

      try {
        setBotonCargando(btnCancelar, true, 'Cancelando...');
        await cancelarCitaPaciente(citaId);
        mostrarToast('La cita ha sido cancelada exitosamente.', 'exito');

        if (usuarioAuthActual) {
          await cargarCitasUsuario(usuarioAuthActual.uid);
        }
      } catch (error) {
        console.error("Error al cancelar la cita:", error);
        setBotonCargando(btnCancelar, false);
        mostrarToast(error.message || 'No se pudo cancelar la cita. Por favor intente nuevamente.', 'error');
      }
      return;
    }

    // 3. Descarga real de Informe Diagnóstico (PDF / DICOM)
    const btnInforme = e.target.closest('.btn-informe-cita');
    if (btnInforme) {
      e.preventDefault();
      const citaId = btnInforme.dataset.id;
      if (!citaId) return;

      const textoOriginal = btnInforme.innerHTML;
      try {
        setBotonCargando(btnInforme, true, 'Descargando...');

        const cita = citasCache.find(c => c.id === citaId);
        let informe = cita?._informeData;
        if (!informe || !informe.dataBase64) {
          informe = await obtenerInformePorCita(citaId);
          if (cita && informe) {
            cita._informeData = informe;
            cita.tieneInforme = true;
          }
        }

        if (!informe || !informe.dataBase64) {
          mostrarToast('El archivo del informe aún no se encuentra disponible para descarga.', 'alerta');
          return;
        }

        descargarArchivoBase64(
          informe.dataBase64,
          informe.nombreArchivo || `Informe_${citaId}.pdf`,
          informe.tipoArchivo || 'application/pdf'
        );
        mostrarToast('Descarga iniciada exitosamente.', 'exito');

      } catch (error) {
        console.error("Error al descargar informe diagnóstico:", error);
        mostrarToast('No fue posible descargar el archivo. Por favor intente nuevamente.', 'error');
      } finally {
        setBotonCargando(btnInforme, false, '', textoOriginal);
      }
      return;
    }

    // 4. Ver preparación médica en modal interactivo
    const btnPrep = e.target.closest('.btn-info-preparacion');
    if (btnPrep) {
      e.preventDefault();
      const citaId = btnPrep.dataset.id;
      const cached = mapaPreparacionCitas.get(citaId);

      let estudio = cached?.estudioNombre;
      let preparacion = cached?.preparacion;

      if (!estudio && btnPrep.dataset.estudio) {
        try {
          estudio = decodeURIComponent(btnPrep.dataset.estudio);
        } catch (_) {
          estudio = btnPrep.dataset.estudio;
        }
      }

      if (!preparacion && btnPrep.dataset.preparacion) {
        try {
          preparacion = decodeURIComponent(btnPrep.dataset.preparacion);
        } catch (_) {
          preparacion = btnPrep.dataset.preparacion;
        }
      }

      abrirModalPreparacion(estudio, preparacion);
      return;
    }
  });
}

/* ==========================================================================
   PROTECCIÓN ANTI-BFCACHE (BOTÓN ATRÁS DEL NAVEGADOR)
   ========================================================================== */
async function revalidar() {
  try {
    const usuario = await obtenerUsuarioActual(true);
    if (!usuario || !auth.currentUser) {
      if (contenido) contenido.setAttribute('hidden', 'true');
      window.location.replace('acceso.html');
      return;
    }
    if (usuarioAuthActual) {
      await cargarCitasUsuario(usuarioAuthActual.uid);
    }
  } catch (error) {
    console.error("Error al revalidar sesión en BFCache:", error);
    if (contenido) contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    revalidar();
  }
});

/* ==========================================================================
   CONTROL DE SESIÓN REACTIVO (ONAUTHCHANGE)
   ========================================================================== */
onAuthChange(async ({ authUser, userData }) => {
  if (!authUser) {
    if (contenido) contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
    return;
  }

  // Redirigir coordinadores a su panel administrativo
  if (userData?.rol === 'coordinador') {
    window.location.replace('panel-clinico.html');
    return;
  }

  usuarioAuthActual = authUser;

  // Personalización de saludo e información del paciente
  const nombre = userData?.nombre 
    ? `${userData.nombre} ${userData.apellido || ''}`.trim() 
    : (authUser.displayName || 'Paciente');

  if (pacienteSaludo) {
    pacienteSaludo.textContent = `Bienvenido(a), ${nombre}`;
  }

  const emailVinculado = userData?.email || authUser.email;
  if (pacienteInfo && emailVinculado) {
    pacienteInfo.textContent = `Expediente clínico vinculado a ${emailVinculado}. Estado de citas e informes radiológicos.`;
  }

  // Revelar la vista del portal y ocultar el loader principal de sesión
  if (authLoading) {
    authLoading.style.display = 'none';
  }
  if (contenido) {
    contenido.removeAttribute('hidden');
  }

  // Cargar reactivamente las citas desde Firestore
  await cargarCitasUsuario(authUser.uid);
});
