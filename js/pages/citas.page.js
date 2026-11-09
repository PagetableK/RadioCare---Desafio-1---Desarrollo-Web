/**
 * RadioCare - Lógica de Agendamiento de Citas (citas.page.js)
 * Control dinámico de sesión, autocompletado reactivo desde Firestore,
 * alternancia de destinatario (para mí / para familiar), máscara y validación de teléfono,
 * reglas clínicas para fechas y horarios, y flujo asíncrono con redirección reactiva.
 */

import { auth, db, onAuthChange, obtenerUsuarioActual } from "../services/auth.service.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { solicitarCita } from "../services/citas.service.js";
import { mostrarAlerta, limpiarAlerta, setBotonCargando } from "../utils/ui.js";
import { 
  campoNoVacio, 
  validarEmail, 
  validarTelefono, 
  validarDUI, 
  validarFechaNacimiento,
  formatearDUI 
} from "../utils/validators.js";

/* ==========================================================================
   REFERENCIAS AL DOM
   ========================================================================== */
const citasLoading = document.getElementById('citas-loading');
const citasAuthRequerido = document.getElementById('citas-auth-requerido');
const citasForm = document.getElementById('citas-form');
const alertaCitas = document.getElementById('alerta-citas');
const btnSubmit = document.getElementById('btn-submit-cita') || document.querySelector('.btn--submit');

// Radio buttons de destinatario
const radioParaMi = document.getElementById('para-mi');
const radioParaFamiliar = document.getElementById('para-familiar');
const notaMiInformacion = document.getElementById('nota-mi-informacion');

// Campos de datos del paciente
const nombreInput = document.getElementById('nombre');
const apellidosInput = document.getElementById('apellidos');
const duiInput = document.getElementById('dui');
const inputFechaNacimiento = document.getElementById('fecha-nacimiento') || document.getElementById('nacimiento');
const nacimientoInput = inputFechaNacimiento;
const sexoSelect = document.getElementById('sexo-biologico') || document.getElementById('sexo');
const embarazoSelect = document.getElementById('embarazo');
const embarazoAyuda = document.getElementById('embarazo-ayuda');

// Campos de contacto
const emailInput = document.getElementById('email');
const telefonoInput = document.getElementById('telefono') || document.querySelector('input[name="telefono"]');

// Campos de estudio y programación
const estudioSelect = document.getElementById('estudio');
const modalidadSelect = document.getElementById('modalidad');
const regionInput = document.getElementById('region');
const fechaInput = document.getElementById('fecha');
const horarioSelect = document.getElementById('horario');
const fechaAltInput = document.getElementById('fecha-alternativa') || document.getElementById('fecha-alt');
const notasTextarea = document.getElementById('notas');
const consentimientoCheck = document.getElementById('consentimiento');
const recordatorioCheck = document.getElementById('recordatorio');

// Estado local del usuario en sesión
let usuarioAuthActual = null;
let datosUsuarioRegistrado = null;

/* ==========================================================================
   HELPER DE ERROR DE VALIDACIÓN CON SCROLL VISUAL
   ========================================================================== */
function mostrarErrorValidacion(campoNombre, mensaje) {
  mostrarAlerta(alertaCitas, mensaje, 'warning');
  const elemento = document.querySelector(`input[name="${campoNombre}"]`) || 
                   document.querySelector(`[name="${campoNombre}"]`) || 
                   document.getElementById(campoNombre);

  if (elemento) {
    const contenedorCampo = elemento.closest('.campo') || elemento;
    contenedorCampo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elemento.focus();
  } else {
    alertaCitas?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ==========================================================================
   HELPER: FECHA ACTUAL EN FORMATO YYYY-MM-DD (ZONA LOCAL)
   ========================================================================== */
function obtenerFechaHoyISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/* ==========================================================================
   INICIALIZACIÓN DE RESTRICCIONES DE FECHA (REGLAS CLÍNICAS)
   - Excluir estrictamente la fecha actual (mínimo: a partir de mañana)
   - Flexibilidad en nacimiento para pediatría / recién nacidos (máximo: hoy)
   ========================================================================== */
function inicializarRestriccionesFechas() {
  // 1. Fecha mínima de agendamiento (al menos 24 horas de antelación)
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const fechaMinima = manana.toISOString().split('T')[0];

  if (fechaInput) {
    fechaInput.min = fechaMinima;
  }
  if (fechaAltInput) {
    fechaAltInput.min = fechaMinima;
  }

  // 2. Fecha máxima de nacimiento (soporte pediátrico: máximo hoy)
  if (inputFechaNacimiento) {
    const hoyStr = new Date().toISOString().split('T')[0];
    inputFechaNacimiento.max = hoyStr;
  }
}

// Ejecutar inmediatamente la restricción de fechas
inicializarRestriccionesFechas();

/* ==========================================================================
   MÁSCARA Y RESTRICCIÓN AUTOMÁTICA EN DUI (00000000-0)
   ========================================================================== */
if (duiInput) {
  duiInput.setAttribute('maxlength', '10');

  duiInput.addEventListener('input', (e) => {
    // Limpia caracteres no numéricos
    let valor = e.target.value.replace(/\D/g, '');

    // Limita el valor numérico a un máximo de 9 dígitos
    if (valor.length > 9) {
      valor = valor.slice(0, 9);
    }

    // Aplica la máscara en tiempo real: si la longitud es mayor a 8 dígitos, inserta automáticamente el guion
    if (valor.length > 8) {
      e.target.value = `${valor.slice(0, 8)}-${valor.slice(8)}`;
    } else {
      e.target.value = valor;
    }
  });
}

/* ==========================================================================
   MÁSCARA Y RESTRICCIÓN AUTOMÁTICA EN TELÉFONO / WHATSAPP (TAREA 1)
   ========================================================================== */
if (telefonoInput) {
  telefonoInput.setAttribute('maxlength', '9');

  telefonoInput.addEventListener('input', (e) => {
    // Extraer exclusivamente caracteres numéricos (no letras, ni espacios ni especiales)
    let valor = e.target.value.replace(/\D/g, '');

    // Soporte para prefijo salvadoreño si fue pegado (+503)
    if (valor.startsWith('503') && valor.length > 8) {
      valor = valor.slice(3);
    }

    // Limitar estrictamente a 8 dígitos numéricos
    if (valor.length > 8) {
      valor = valor.slice(0, 8);
    }

    // Formatear automáticamente como 0000-0000 conforme el usuario escribe
    if (valor.length > 4) {
      e.target.value = `${valor.slice(0, 4)}-${valor.slice(4)}`;
    } else {
      e.target.value = valor;
    }
  });
}

/* ==========================================================================
   REGLAS DE NEGOCIO EN FECHAS Y HORARIOS CLÍNICOS (TAREA 2)
   ========================================================================== */

/**
 * Evalúa si una fecha corresponde a Domingo (getDay() === 0).
 * Si es domingo: limpia el campo, aplica borde de error y muestra el mensaje accesible requerido.
 * @param {HTMLInputElement} input
 * @returns {boolean} true si la fecha es válida (no es domingo); false si es domingo.
 */
function validarDomingo(input) {
  if (!input || !input.value) {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    return true;
  }

  const fechaObj = new Date(input.value + 'T00:00:00');
  if (isNaN(fechaObj.getTime())) return true;

  if (fechaObj.getDay() === 0) {
    input.value = '';
    input.style.borderColor = '#ff4d6d';
    input.style.boxShadow = '0 0 0 3px rgba(255, 77, 109, 0.2)';
    mostrarAlerta(
      alertaCitas,
      'La clínica permanece cerrada los domingos. Por favor seleccione de lunes a sábado',
      'warning'
    );
    return false;
  } else {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    return true;
  }
}

/**
 * Restringe las franjas horarias si la fecha cae en Sábado (getDay() === 6).
 * En sábado: activa EXCLUSIVAMENTE las franjas matutinas (6:30-9:00 y 9:00-12:00) y deshabilita la tarde.
 * En lunes-viernes: habilita todas las opciones regulares.
 * @param {string} fechaValor
 */
function actualizarFranjasHorariasSegunFecha(fechaValor) {
  if (!horarioSelect) return;

  if (!fechaValor) {
    // Si no hay fecha elegida, restaurar todas las opciones
    Array.from(horarioSelect.options).forEach((opt) => {
      opt.disabled = false;
      opt.hidden = false;
    });
    return;
  }

  const fechaObj = new Date(fechaValor + 'T00:00:00');
  if (isNaN(fechaObj.getTime())) return;

  const diaSemana = fechaObj.getDay();

  // Sábado (6): Exclusivamente matutina
  if (diaSemana === 6) {
    const franjasMatutinas = ['manana-temprana', 'manana'];
    let teniaOpcionVespertina = false;

    Array.from(horarioSelect.options).forEach((opt) => {
      if (!opt.value) return; // 'Seleccione…'
      if (franjasMatutinas.includes(opt.value)) {
        opt.disabled = false;
        opt.hidden = false;
      } else {
        // Franjas de la tarde (mediodía o tarde)
        opt.disabled = true;
        opt.hidden = true;
        if (horarioSelect.value === opt.value) {
          teniaOpcionVespertina = true;
        }
      }
    });

    if (teniaOpcionVespertina) {
      horarioSelect.value = '';
      mostrarAlerta(
        alertaCitas,
        'Los sábados la atención es exclusivamente matutina (7:00 a. m. a 12:00 p. m.)',
        'warning'
      );
    }
  } else if (diaSemana >= 1 && diaSemana <= 5) {
    // Lunes a Viernes: Habilitar todas las opciones regulares del centro radiológico
    Array.from(horarioSelect.options).forEach((opt) => {
      opt.disabled = false;
      opt.hidden = false;
    });
  }
}

// Escuchar cambios reactivos en #fecha
if (fechaInput) {
  const handlerFecha = () => {
    const noEsDomingo = validarDomingo(fechaInput);
    if (noEsDomingo) {
      actualizarFranjasHorariasSegunFecha(fechaInput.value);
    } else {
      actualizarFranjasHorariasSegunFecha('');
    }
  };

  fechaInput.addEventListener('change', handlerFecha);
  fechaInput.addEventListener('input', handlerFecha);
}

// Escuchar cambios reactivos en #fecha-alternativa
if (fechaAltInput) {
  const handlerFechaAlt = () => {
    validarDomingo(fechaAltInput);
  };

  fechaAltInput.addEventListener('change', handlerFechaAlt);
  fechaAltInput.addEventListener('input', handlerFechaAlt);
}

// Control adicional en el selector de horario
if (horarioSelect) {
  horarioSelect.addEventListener('change', () => {
    if (fechaInput && fechaInput.value) {
      const diaSemana = new Date(fechaInput.value + 'T00:00:00').getDay();
      if (diaSemana === 6 && (horarioSelect.value === 'mediodia' || horarioSelect.value === 'tarde')) {
        horarioSelect.value = '';
        mostrarAlerta(
          alertaCitas,
          'Los sábados la atención es exclusivamente matutina (7:00 a. m. a 12:00 p. m.)',
          'warning'
        );
      }
    }
  });
}

/* ==========================================================================
   CONTROL DE VISIBILIDAD DE INTERFAZ (SESIÓN ACTIVA VS. INACTIVA)
   ========================================================================== */

function mostrarVistaAutenticado() {
  if (citasLoading) {
    citasLoading.style.display = 'none';
    citasLoading.hidden = true;
    citasLoading.classList.add('oculto');
  }
  if (citasAuthRequerido) {
    citasAuthRequerido.style.display = 'none';
    citasAuthRequerido.hidden = true;
    citasAuthRequerido.classList.add('oculto');
  }
  if (citasForm) {
    citasForm.style.display = 'block';
    citasForm.hidden = false;
    citasForm.classList.remove('oculto');
  }
}

function mostrarVistaNoAutenticado() {
  if (citasLoading) {
    citasLoading.style.display = 'none';
    citasLoading.hidden = true;
    citasLoading.classList.add('oculto');
  }
  if (citasAuthRequerido) {
    citasAuthRequerido.style.display = 'flex';
    citasAuthRequerido.hidden = false;
    citasAuthRequerido.classList.remove('oculto');
  }
  if (citasForm) {
    citasForm.style.display = 'none';
    citasForm.hidden = true;
    citasForm.classList.add('oculto');
  }
}

/* ==========================================================================
   PROTECCIÓN ANTI-BFCACHE (BOTÓN ATRÁS DEL NAVEGADOR)
   ========================================================================== */
async function revalidarSesionCitas() {
  try {
    const usuario = await obtenerUsuarioActual(true);
    if (!usuario || !auth.currentUser) {
      usuarioAuthActual = null;
      datosUsuarioRegistrado = null;
      mostrarVistaNoAutenticado();
    } else {
      usuarioAuthActual = auth.currentUser;
      datosUsuarioRegistrado = usuario;
      mostrarVistaAutenticado();
      if (radioParaMi?.checked) {
        aplicarModoParaMi();
      }
    }
  } catch (error) {
    console.error("Error al revalidar sesión en citas:", error);
    mostrarVistaNoAutenticado();
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    revalidarSesionCitas();
  }
});

/* ==========================================================================
   REGLA CLÍNICA: DESACTIVACIÓN CONDICIONAL DE EMBARAZO SEGÚN SEXO BIOLÓGICO
   ========================================================================== */
function manejarCambioSexoBiologico(sexoValor) {
  if (!embarazoSelect) return;

  const valor = (sexoValor !== undefined && sexoValor !== null ? sexoValor : (sexoSelect?.value || '')).trim();

  if (valor === 'Masculino' || valor === 'M') {
    const optNo = embarazoSelect.querySelector('option[value="no"], option[value="No"]');
    if (optNo) {
      embarazoSelect.value = optNo.value;
    } else {
      embarazoSelect.value = 'no';
    }

    embarazoSelect.disabled = true;
    embarazoSelect.setAttribute('aria-disabled', 'true');
    embarazoSelect.classList.add('select--bloqueado');

    if (embarazoAyuda) {
      embarazoAyuda.textContent = 'No aplica según el sexo biológico seleccionado';
      embarazoAyuda.style.display = 'block';
    }
  } else if (valor === 'Femenino' || valor === 'F') {
    const estabaBloqueado = embarazoSelect.disabled || embarazoSelect.classList.contains('select--bloqueado');

    embarazoSelect.disabled = false;
    embarazoSelect.removeAttribute('aria-disabled');
    embarazoSelect.classList.remove('select--bloqueado');

    if (estabaBloqueado) {
      embarazoSelect.value = '';
    }

    if (embarazoAyuda) {
      embarazoAyuda.textContent = '';
      embarazoAyuda.style.display = 'none';
    }
  } else {
    embarazoSelect.disabled = false;
    embarazoSelect.removeAttribute('aria-disabled');
    embarazoSelect.classList.remove('select--bloqueado');

    if (embarazoAyuda) {
      embarazoAyuda.textContent = '';
      embarazoAyuda.style.display = 'none';
    }
  }
}

if (sexoSelect) {
  sexoSelect.addEventListener('change', () => {
    manejarCambioSexoBiologico(sexoSelect.value);
  });
}

/* ==========================================================================
   MODOS DE DESTINATARIO: PARA MÍ vs PARA FAMILIAR
   ========================================================================== */
function bloquearCampo(input, bloquear) {
  if (!input) return;
  if (bloquear) {
    input.readOnly = true;
    input.classList.add('input--bloqueado');
    input.setAttribute('aria-readonly', 'true');
  } else {
    input.readOnly = false;
    input.classList.remove('input--bloqueado');
    input.removeAttribute('aria-readonly');
  }
}

function bloquearSelect(select, bloquear) {
  if (!select) return;
  if (bloquear) {
    select.disabled = true;
    select.classList.add('select--bloqueado');
    select.setAttribute('aria-disabled', 'true');
  } else {
    select.disabled = false;
    select.classList.remove('select--bloqueado');
    select.removeAttribute('aria-disabled');
  }
}

function aplicarModoParaMi() {
  if (!datosUsuarioRegistrado && !usuarioAuthActual) return;

  const datos = datosUsuarioRegistrado || {};
  const authUser = usuarioAuthActual || {};

  const nombreValor = datos.nombre || (authUser.displayName ? authUser.displayName.split(' ')[0] : '');
  const apellidoValor = datos.apellido || (authUser.displayName ? authUser.displayName.split(' ').slice(1).join(' ') : '');
  const duiValor = formatearDUI(datos.dui || '');
  const nacimientoValor = datos.fechaNacimiento || datos.nacimiento || '';
  const sexoRaw = datos.sexoBiologico || datos.sexo || '';

  let sexoValor = '';
  if (sexoRaw === 'Masculino' || sexoRaw === 'M') {
    sexoValor = 'Masculino';
  } else if (sexoRaw === 'Femenino' || sexoRaw === 'F') {
    sexoValor = 'Femenino';
  }

  if (nombreInput) nombreInput.value = nombreValor;
  if (apellidosInput) apellidosInput.value = apellidoValor;
  if (duiInput) {
    duiInput.value = duiValor;
    duiInput.required = true;
    duiInput.setAttribute('required', '');
  }
  if (nacimientoInput) nacimientoInput.value = nacimientoValor;
  if (sexoSelect) sexoSelect.value = sexoValor;

  const labelDui = document.getElementById('label-dui') || document.querySelector('label[for="dui"]');
  if (labelDui) {
    labelDui.innerHTML = 'DUI o pasaporte <span class="requerido" aria-hidden="true">*</span>';
  }

  bloquearCampo(nombreInput, true);
  bloquearCampo(apellidosInput, true);
  bloquearCampo(duiInput, true);
  bloquearCampo(nacimientoInput, true);
  bloquearSelect(sexoSelect, true);

  manejarCambioSexoBiologico(sexoValor);

  if (emailInput) {
    emailInput.value = datos.email || authUser.email || '';
    bloquearCampo(emailInput, false);
  }
  if (telefonoInput) {
    if (datos.telefono) {
      let telLimpio = datos.telefono.replace(/\D/g, '');
      if (telLimpio.startsWith('503') && telLimpio.length > 8) telLimpio = telLimpio.slice(3);
      if (telLimpio.length > 8) telLimpio = telLimpio.slice(0, 8);
      if (telLimpio.length > 4) {
        telefonoInput.value = `${telLimpio.slice(0, 4)}-${telLimpio.slice(4)}`;
      } else {
        telefonoInput.value = telLimpio;
      }
    }
    bloquearCampo(telefonoInput, false);
  }

  if (notaMiInformacion) {
    notaMiInformacion.hidden = false;
    notaMiInformacion.style.display = 'block';
  }
}

function aplicarModoParaFamiliar() {
  if (nombreInput) nombreInput.value = '';
  if (apellidosInput) apellidosInput.value = '';
  if (duiInput) {
    duiInput.value = '';
    duiInput.required = false;
    duiInput.removeAttribute('required');
  }
  if (nacimientoInput) nacimientoInput.value = '';
  if (sexoSelect) sexoSelect.value = '';

  const labelDui = document.getElementById('label-dui') || document.querySelector('label[for="dui"]');
  if (labelDui) {
    labelDui.textContent = 'DUI o pasaporte (Opcional)';
  }

  bloquearCampo(nombreInput, false);
  bloquearCampo(apellidosInput, false);
  bloquearCampo(duiInput, false);
  bloquearCampo(nacimientoInput, false);
  bloquearSelect(sexoSelect, false);

  manejarCambioSexoBiologico('');

  if (notaMiInformacion) {
    notaMiInformacion.hidden = true;
    notaMiInformacion.style.display = 'none';
  }

  if (nombreInput) {
    nombreInput.focus();
  }
}

if (radioParaMi) {
  radioParaMi.addEventListener('change', () => {
    if (radioParaMi.checked) {
      aplicarModoParaMi();
    }
  });
}

if (radioParaFamiliar) {
  radioParaFamiliar.addEventListener('change', () => {
    if (radioParaFamiliar.checked) {
      aplicarModoParaFamiliar();
    }
  });
}

/* ==========================================================================
   CONTROL DE SESIÓN REACTIVO (ONAUTHCHANGE)
   ========================================================================== */
onAuthChange(async ({ authUser, userData }) => {
  if (!authUser) {
    usuarioAuthActual = null;
    datosUsuarioRegistrado = null;
    mostrarVistaNoAutenticado();
    return;
  }

  usuarioAuthActual = authUser;

  try {
    const userDocRef = doc(db, 'usuarios', authUser.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      datosUsuarioRegistrado = userSnap.data();
    } else {
      const partesNombre = (authUser.displayName || '').split(' ');
      datosUsuarioRegistrado = {
        uid: authUser.uid,
        nombre: partesNombre[0] || (authUser.email ? authUser.email.split('@')[0] : ''),
        apellido: partesNombre.slice(1).join(' ') || '',
        email: authUser.email || '',
        dui: '',
        fechaNacimiento: '',
        sexoBiologico: '',
        telefono: '',
        rol: 'paciente'
      };
    }
  } catch (error) {
    console.warn("Aviso al consultar documento de usuario en Firestore:", error);
    datosUsuarioRegistrado = userData || {
      nombre: authUser.displayName || '',
      email: authUser.email || ''
    };
  }

  mostrarVistaAutenticado();
  inicializarRestriccionesFechas();

  if (radioParaMi) {
    radioParaMi.checked = true;
  }
  aplicarModoParaMi();
});

/* ==========================================================================
   FLUJO ASÍNCRONO DE ENVÍO Y RETROALIMENTACIÓN (TAREA 3)
   ========================================================================== */
if (citasForm) {
  citasForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarAlerta(alertaCitas);

    if (!usuarioAuthActual) {
      mostrarVistaNoAutenticado();
      return;
    }

    const destinatario = radioParaMi?.checked ? 'para-mi' : 'para-familiar';
    const nombre = nombreInput?.value.trim() || '';
    const apellidos = apellidosInput?.value.trim() || '';
    const inputDui = duiInput || document.getElementById('dui');
    const dui = inputDui ? inputDui.value.trim() : '';
    const nacimiento = nacimientoInput?.value || '';
    const sexo = sexoSelect?.value || '';
    const embarazo = embarazoSelect?.value || '';
    const email = emailInput?.value.trim() || '';
    const telefono = telefonoInput?.value.trim() || '';
    const estudio = estudioSelect?.value || '';
    const modalidad = modalidadSelect?.value || '';
    const region = regionInput?.value.trim() || '';
    const fecha = fechaInput?.value || '';
    const horario = horarioSelect?.value || '';
    const fechaAlt = fechaAltInput?.value || '';
    const notas = notasTextarea?.value.trim() || '';
    const consentimiento = consentimientoCheck?.checked || false;
    const recordatorio = recordatorioCheck?.checked || false;

    // 1. Validaciones de datos de paciente y contacto
    if (!campoNoVacio(nombre) || !campoNoVacio(apellidos)) {
      mostrarAlerta(alertaCitas, 'Por favor complete el nombre y apellido del paciente.', 'warning');
      nombreInput?.focus();
      return;
    }

    // Validación condicional del campo DUI (para-familiar opcional / para-mi obligatorio)
    const esFamiliar = document.getElementById('para-familiar')?.checked;

    if (esFamiliar) {
      if (dui !== '' && !/^\d{8}-\d{1}$/.test(dui)) {
        mostrarErrorValidacion("dui", "Si ingresa un DUI, debe cumplir el formato reglamentario 00000000-0.");
        return;
      }
    } else {
      if (!/^\d{8}-\d{1}$/.test(dui)) {
        mostrarErrorValidacion("dui", "Debe ingresar un DUI válido (00000000-0).");
        return;
      }
    }

    const hoyStr = new Date().toISOString().split('T')[0];

    if (!nacimiento) {
      mostrarAlerta(alertaCitas, 'Por favor ingrese la fecha de nacimiento del paciente.', 'warning');
      inputFechaNacimiento?.focus();
      return;
    }

    // Regla pediátrica y general: no puede ser una fecha en el futuro (<= hoy)
    if (nacimiento > hoyStr) {
      mostrarAlerta(alertaCitas, 'La fecha de nacimiento no puede ser una fecha en el futuro.', 'warning');
      inputFechaNacimiento?.focus();
      return;
    }

    if (!validarFechaNacimiento(nacimiento)) {
      mostrarAlerta(alertaCitas, 'Por favor ingrese una fecha de nacimiento válida (no futura y menor a 125 años).', 'warning');
      inputFechaNacimiento?.focus();
      return;
    }

    if (!sexo) {
      mostrarAlerta(alertaCitas, 'Por favor seleccione el sexo biológico del paciente.', 'warning');
      sexoSelect?.focus();
      return;
    }

    if (!embarazo && !embarazoSelect?.disabled) {
      mostrarAlerta(alertaCitas, 'Por favor indique si la paciente podría estar embarazada para protocolos de radioprotección.', 'warning');
      embarazoSelect?.focus();
      return;
    }

    if (!validarEmail(email)) {
      mostrarAlerta(alertaCitas, 'Por favor ingrese un correo electrónico de contacto válido.', 'warning');
      emailInput?.focus();
      return;
    }

    // Validación estricta de formato telefónico salvadoreño (Tarea 1)
    if (!validarTelefono(telefono)) {
      mostrarAlerta(alertaCitas, 'Por favor ingrese un número de teléfono o WhatsApp válido con formato 0000-0000.', 'warning');
      telefonoInput?.focus();
      return;
    }

    if (!estudio) {
      mostrarAlerta(alertaCitas, 'Por favor seleccione el tipo de estudio radiológico solicitado.', 'warning');
      estudioSelect?.focus();
      return;
    }

    if (!modalidad) {
      mostrarAlerta(alertaCitas, 'Por favor seleccione si desea agendar una cita o solo cotización.', 'warning');
      modalidadSelect?.focus();
      return;
    }

    // Validación obligatoria de orden médica escrita (Ajuste 1)
    const tieneOrdenSeleccionada = document.querySelector('input[name="orden_medica"]:checked');
    if (!tieneOrdenSeleccionada) {
      // Mostrar feedback visual de error, hacer scroll al campo y abortar el envío
      mostrarErrorValidacion("orden_medica", "Debe indicar si cuenta con orden médica escrita.");
      return;
    }

    // 2. Validación estricta de fechas y franjas horarias (Regla clínica: >= 24h antelación)
    if (!fecha) {
      mostrarAlerta(alertaCitas, 'Por favor seleccione su fecha preferida para el estudio.', 'warning');
      fechaInput?.focus();
      return;
    }

    if (fecha <= hoyStr) {
      mostrarAlerta(alertaCitas, 'Las citas deben solicitarse con al menos un día de anticipación (a partir de mañana)', 'warning');
      fechaInput?.focus();
      return;
    }

    const diaSemanaFecha = new Date(fecha + 'T00:00:00').getDay();
    if (diaSemanaFecha === 0) {
      mostrarAlerta(alertaCitas, 'La clínica permanece cerrada los domingos. Por favor seleccione de lunes a sábado', 'warning');
      fechaInput?.focus();
      return;
    }

    if (!horario) {
      mostrarAlerta(alertaCitas, 'Por favor seleccione la franja horaria de su preferencia.', 'warning');
      horarioSelect?.focus();
      return;
    }

    if (diaSemanaFecha === 6 && (horario === 'mediodia' || horario === 'tarde')) {
      mostrarAlerta(alertaCitas, 'Los sábados la atención es exclusivamente matutina (7:00 a. m. a 12:00 p. m.)', 'warning');
      horarioSelect?.focus();
      return;
    }

    if (fechaAlt) {
      if (fechaAlt <= hoyStr) {
        mostrarAlerta(alertaCitas, 'Las citas deben solicitarse con al menos un día de anticipación (a partir de mañana)', 'warning');
        fechaAltInput?.focus();
        return;
      }
      const diaSemanaAlt = new Date(fechaAlt + 'T00:00:00').getDay();
      if (diaSemanaAlt === 0) {
        mostrarAlerta(alertaCitas, 'La clínica permanece cerrada los domingos. Por favor seleccione de lunes a sábado', 'warning');
        fechaAltInput?.focus();
        return;
      }
    }

    if (!consentimiento) {
      mostrarAlerta(alertaCitas, 'Debe aceptar los términos de tratamiento de datos clínicos para continuar.', 'warning');
      consentimientoCheck?.focus();
      return;
    }

    // 3. Flujo asíncrono de envío (Tarea 3)
    // Deshabilita el botón de submit y cambia su texto con indicador de carga
    setBotonCargando(btnSubmit, true, 'Procesando solicitud...');

    try {
      // Documento con usuarioId en la raíz
      const datosCita = {
        usuarioId: usuarioAuthActual.uid,
        pacienteUid: usuarioAuthActual.uid,
        pacienteEmail: usuarioAuthActual.email,
        destinatario,
        paciente: {
          nombre,
          apellidos,
          dui,
          nacimiento,
          fechaNacimiento: nacimiento,
          sexo,
          sexoBiologico: sexo,
          embarazo: (sexo === 'Masculino' || embarazoSelect?.disabled) ? 'no' : embarazo
        },
        contacto: {
          email,
          telefono
        },
        estudio: {
          tipo: estudio,
          modalidad,
          region
        },
        agenda: {
          fecha,
          horario,
          fechaAlternativa: fechaAlt
        },
        clinica: {
          ordenMedica: tieneOrdenSeleccionada.value,
          orden_medica: tieneOrdenSeleccionada.value,
          notas,
          recordatorioWhatsApp: recordatorio
        }
      };

      await solicitarCita(datosCita);

      // Notificación visible requerida
      mostrarAlerta(
        alertaCitas,
        'La solicitud de la cita ha sido colocada exitosamente',
        'success'
      );

      alertaCitas?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Limpiar campos del formulario
      citasForm.reset();

      // Redirigir al paciente tras 1 segundo a mis-citas.html
      setTimeout(() => {
        window.location.href = 'mis-citas.html';
      }, 1000);

    } catch (error) {
      console.error("Error al procesar solicitud de cita:", error);
      // Reactivar el botón de submit ante error
      setBotonCargando(btnSubmit, false, '', 'Enviar solicitud de cita');
      mostrarAlerta(
        alertaCitas,
        error?.message || 'Ocurrió un error al procesar su solicitud de cita. Por favor intente nuevamente.',
        'error'
      );
    }
  });
}
