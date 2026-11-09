/**
 * RadioCare - Lógica de Mis Citas (mis-citas.page.js)
 * Manejo de control de sesión estricto, protección Anti-BFCache,
 * consulta reactiva a Firestore en colección 'citas' filtrada por usuarioId,
 * renderizado dinámico de registros, gestión de estado vacío (Empty State)
 * y actualización en tiempo real de tarjetas de métricas del expediente.
 */

import { onAuthChange, obtenerUsuarioActual, auth } from "../services/auth.service.js";
import { obtenerCitasPorUsuario, cancelarCita } from "../services/citas.service.js";
import { obtenerEstudios } from "../services/estudios.service.js";

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

// Estado local
let usuarioAuthActual = null;
let catalogoEstudios = [];
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
    return PREPARACIONES_POR_DEFECTO['us-obstetrico'];
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

  // Foco accesible al botón Entendido o Cerrar
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

// Event Listeners de cierre del modal
if (btnCerrarModal) {
  btnCerrarModal.addEventListener('click', cerrarModalPreparacion);
}

if (btnEntendidoModal) {
  btnEntendidoModal.addEventListener('click', cerrarModalPreparacion);
}

if (modalBackdrop) {
  modalBackdrop.addEventListener('click', cerrarModalPreparacion);
}

if (modalPreparacion) {
  modalPreparacion.addEventListener('click', (e) => {
    if (e.target === modalPreparacion) {
      cerrarModalPreparacion();
    }
  });
}

// Cierre accesible con la tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalPreparacion && !modalPreparacion.classList.contains('oculto') && !modalPreparacion.hasAttribute('hidden')) {
    cerrarModalPreparacion();
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
 * Contiene un icono sutil, el mensaje requerido y botón destacado hacia citas.html.
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
    const fecha = cita.agenda?.fecha || 'Sin fecha asignada';
    const horarioFormateado = formatearHorario(cita.agenda?.horario);
    const fechaHoraHtml = `<strong>${fecha}</strong>${horarioFormateado ? `<br><span style="font-size: 13px; color: var(--color-fog);">${horarioFormateado}</span>` : ''}`;

    // 2. Estudio Solicitado: estudio o estudioNombre
    const estudioNombre = formatearEstudio(cita);

    // Preparación Médica (obtenida del documento o cruzada con el catálogo)
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

    // 3. Médico: medicoAsignado || "Pendiente de asignación"
    const medico = cita.medicoAsignado || cita.contacto?.medico || cita.medico || "Pendiente de asignación";

    // 4. Estado: Badge con clase CSS según el valor
    const estado = (cita.estado || 'pendiente').toLowerCase();
    const textoEstado = estado.charAt(0).toUpperCase() + estado.slice(1);
    const badgeHtml = `<span class="badge-estado badge-estado--${estado} badge--${estado}">${textoEstado}</span>`;

    // 5. Acción/Informe: Si está pendiente, botón para cancelar; si está completada, botón simulado de informe
    let accionHtml = '';
    if (estado === 'pendiente') {
      accionHtml = `
        <button type="button" class="btn btn--peligro btn-cancelar-cita" data-id="${cita.id}" style="padding: 6px 14px; font-size: 12px; border-radius: 9999px;">
          Cancelar cita
        </button>
      `;
    } else if (estado === 'completada') {
      accionHtml = `
        <button type="button" class="btn btn--fantasma btn-informe-cita" data-id="${cita.id}" style="padding: 6px 14px; font-size: 12px;">
          Descargar PDF & DICOM
        </button>
      `;
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
        <td>${estudioNombre}</td>
        <td class="text-center">${botonPreparacionHtml}</td>
        <td>${medico}</td>
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
          <th>Estudio Solicitado</th>
          <th class="text-center">PREPARACIÓN</th>
          <th>Médico Radiólogo</th>
          <th>Estado</th>
          <th>Informe Diagnóstico</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml}
      </tbody>
    </table>
  `;
}

/**
 * Actualiza las tarjetas superiores de métricas (Próxima cita programada e informes)
 * con base en las citas devueltas por la consulta a Firestore.
 * @param {Array<object>} citas
 */
function actualizarMetricas(citas) {
  // Próximas citas programadas activas (pendientes o confirmadas)
  const citasProgramadas = citas.filter((c) => {
    const est = (c.estado || '').toLowerCase();
    return est === 'confirmada' || est === 'pendiente';
  });

  // Informes disponibles (estudios completados)
  const citasCompletadas = citas.filter((c) => {
    const est = (c.estado || '').toLowerCase();
    return est === 'completada';
  });

  if (statProximaCita) {
    statProximaCita.textContent = citasProgramadas.length.toString();
  }
  if (statInformes) {
    statInformes.textContent = citasCompletadas.length.toString();
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
    // Sincronizar catálogo de estudios si no ha sido precargado
    if (!catalogoEstudios || catalogoEstudios.length === 0) {
      try {
        catalogoEstudios = await obtenerEstudios();
      } catch (errCat) {
        console.warn("Aviso al consultar catálogo de estudios para preparación:", errCat);
      }
    }

    const citas = await obtenerCitasPorUsuario(uid);

    // Ordenar de forma descendente (citas más recientes primero)
    citas.sort((a, b) => {
      const fechaA = a.agenda?.fecha || '';
      const fechaB = b.agenda?.fecha || '';
      if (fechaA && fechaB && fechaA !== fechaB) {
        return fechaB.localeCompare(fechaA);
      }
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    // Actualizar métricas del panel superior
    actualizarMetricas(citas);

    // Renderizar según el número de registros devueltos
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

// Delegación de eventos para botones interactivos en la tabla (cancelar e informe)
if (historialCitasContenedor) {
  historialCitasContenedor.addEventListener('click', async (e) => {
    // 1. Cancelar cita
    const btnCancelar = e.target.closest('.btn-cancelar-cita');
    if (btnCancelar) {
      const citaId = btnCancelar.dataset.id;
      if (!citaId) return;

      const confirmar = window.confirm("¿Está seguro de que desea cancelar esta solicitud de cita médica?");
      if (!confirmar) return;

      try {
        btnCancelar.disabled = true;
        btnCancelar.textContent = "Cancelando...";
        await cancelarCita(citaId);
        if (usuarioAuthActual) {
          await cargarCitasUsuario(usuarioAuthActual.uid);
        }
      } catch (error) {
        console.error("Error al cancelar la cita:", error);
        alert("No se pudo cancelar la cita. Por favor intente nuevamente.");
        btnCancelar.disabled = false;
        btnCancelar.textContent = "Cancelar cita";
      }
      return;
    }

    // 2. Descargar informe simulado
    const btnInforme = e.target.closest('.btn-informe-cita');
    if (btnInforme) {
      e.preventDefault();
      alert("Accediendo al expediente radiológico PACS/DICOM. Generando reporte de diagnóstico médico e imágenes asociadas...");
      return;
    }

    // 3. Ver preparación médica en modal interactivo
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
