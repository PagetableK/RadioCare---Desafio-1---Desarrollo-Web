/**
 * RadioCare - Lógica de la Página de Acceso y Registro (acceso.page.js)
 * Controla alternancia accesible entre Login y Registro, validaciones en cliente,
 * llamadas asíncronas de Firebase Auth con feedback visual y redirección según rol clínico.
 */

import { 
  iniciarSesion, 
  registrarPaciente, 
  obtenerUsuarioActual, 
  onAuthChange 
} from "../services/auth.service.js";
import { 
  validarEmail, 
  validarPassword, 
  coincidenPasswords, 
  campoNoVacio,
  validarDUI,
  validarFechaNacimiento
} from "../utils/validators.js";
import { 
  mostrarAlerta, 
  limpiarAlerta, 
  setBotonCargando 
} from "../utils/ui.js";

/* ==========================================================================
   REFERENCIAS AL DOM
   ========================================================================== */
const tabLogin = document.getElementById('tab-login');
const tabRegistro = document.getElementById('tab-registro');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
const alertaAcceso = document.getElementById('alerta-acceso');
const linkIrRegistro = document.getElementById('link-ir-registro');
const linkIrLogin = document.getElementById('link-ir-login');

const btnLoginSubmit = document.getElementById('btn-login-submit');
const btnRegSubmit = document.getElementById('btn-reg-submit');

const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');

const regNombreInput = document.getElementById('reg-nombre');
const regApellidoInput = document.getElementById('reg-apellido');
const regDuiInput = document.getElementById('reg-dui');
const regFechaNacimientoInput = document.getElementById('reg-fecha-nacimiento');
const regSexoBiologicoSelect = document.getElementById('reg-sexo-biologico');
const regEmailInput = document.getElementById('reg-email');
const regPasswordInput = document.getElementById('reg-password');
const regPasswordConfirmInput = document.getElementById('reg-password-confirm');

const tituloEl = document.getElementById('acceso-titulo');
const subtituloEl = document.getElementById('acceso-subtitulo');

/**
 * Traduce códigos de error nativos de Firebase Authentication a mensajes en español orientados al usuario.
 * @param {object} error - Objeto de error capturado.
 * @returns {string} Mensaje descriptivo y amigable.
 */
function traducirErrorFirebaseAuth(error) {
  const codigo = error?.code || '';
  switch (codigo) {
    case 'auth/user-not-found':
      return 'No se encontró ninguna cuenta registrada con este correo electrónico.';
    case 'auth/wrong-password':
      return 'La contraseña ingresada es incorrecta. Por favor verifique sus datos.';
    case 'auth/invalid-credential':
      return 'Credenciales inválidas. El correo electrónico o la contraseña no coinciden.';
    case 'auth/email-already-in-use':
      return 'Este correo electrónico ya está registrado. Puede iniciar sesión directamente con su contraseña.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil. Debe contar con un mínimo de 6 caracteres.';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico ingresado no es válido.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Por seguridad, el acceso ha sido suspendido temporalmente. Intente nuevamente en unos minutos.';
    case 'auth/network-request-failed':
      return 'Fallo de conexión de red. Verifique su acceso a internet y reintente.';
    case 'auth/user-disabled':
      return 'Esta cuenta ha sido desactivada temporalmente por la clínica.';
    default:
      return error?.message || 'Ocurrió un error inesperado al procesar su solicitud. Intente de nuevo.';
  }
}

/**
 * Redirige al usuario logueado según su rol clínico o parámetro de retorno:
 * - Si existe parámetro 'redirect' válido (ej. citas.html) -> redirige a dicha página.
 * - 'coordinador' -> panel-clinico.html
 * - 'paciente' -> mis-citas.html
 * @param {object} userData
 */
function redirigirSegunRol(userData) {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect');
  const rol = (userData?.rol || 'paciente').toLowerCase();

  if (redirectTarget && (redirectTarget.startsWith('citas.html') || redirectTarget.startsWith('mi-informacion.html'))) {
    window.location.replace(redirectTarget);
    return;
  }

  if (rol === 'coordinador') {
    window.location.replace('panel-clinico.html');
  } else {
    window.location.replace('mis-citas.html');
  }
}

/**
 * Activa la pestaña y vista del formulario de Login.
 */
function activarModoLogin() {
  tabLogin.classList.add('activo');
  tabLogin.setAttribute('aria-selected', 'true');
  tabRegistro.classList.remove('activo');
  tabRegistro.setAttribute('aria-selected', 'false');

  formLogin.removeAttribute('hidden');
  formRegistro.setAttribute('hidden', 'true');

  if (tituloEl) tituloEl.textContent = 'Portal Clínico y Pacientes';
  if (subtituloEl) subtituloEl.textContent = 'Ingrese a su expediente digital o cree una cuenta para gestionar sus estudios.';

  limpiarAlerta(alertaAcceso);
  if (loginEmailInput) loginEmailInput.focus();
}

/**
 * Activa la pestaña y vista del formulario de Registro.
 */
function activarModoRegistro() {
  tabRegistro.classList.add('activo');
  tabRegistro.setAttribute('aria-selected', 'true');
  tabLogin.classList.remove('activo');
  tabLogin.setAttribute('aria-selected', 'false');

  formRegistro.removeAttribute('hidden');
  formLogin.setAttribute('hidden', 'true');

  if (tituloEl) tituloEl.textContent = 'Registro de Paciente';
  if (subtituloEl) subtituloEl.textContent = 'Cree su cuenta para consultar órdenes médicas, agendar citas y descargar resultados.';

  limpiarAlerta(alertaAcceso);
  if (regNombreInput) regNombreInput.focus();
}

/* ==========================================================================
   EVENTOS DE INTERACCIÓN Y PESTAÑAS
   ========================================================================== */
if (tabLogin) tabLogin.addEventListener('click', activarModoLogin);
if (tabRegistro) tabRegistro.addEventListener('click', activarModoRegistro);
if (linkIrRegistro) linkIrRegistro.addEventListener('click', activarModoRegistro);
if (linkIrLogin) linkIrLogin.addEventListener('click', activarModoLogin);

/* ==========================================================================
   MÁSCARA AUTOMÁTICA DE DUI SALVADOREÑO (00000000-0)
   ========================================================================== */
if (regDuiInput) {
  regDuiInput.addEventListener('input', (e) => {
    let valor = e.target.value.replace(/\D/g, '');
    if (valor.length > 9) {
      valor = valor.slice(0, 9);
    }
    if (valor.length > 8) {
      e.target.value = `${valor.slice(0, 8)}-${valor.slice(8)}`;
    } else {
      e.target.value = valor;
    }
  });
}

/* ==========================================================================
   ENVÍO: FORMULARIO DE INICIO DE SESIÓN
   ========================================================================== */
if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarAlerta(alertaAcceso);

    const email = loginEmailInput?.value.trim() || '';
    const password = loginPasswordInput?.value || '';

    // Validaciones en cliente
    if (!campoNoVacio(email)) {
      mostrarAlerta(alertaAcceso, 'Por favor ingrese su correo electrónico.', 'warning');
      loginEmailInput?.focus();
      return;
    }

    if (!validarEmail(email)) {
      mostrarAlerta(alertaAcceso, 'El formato de correo electrónico no es válido.', 'warning');
      loginEmailInput?.focus();
      return;
    }

    if (!campoNoVacio(password)) {
      mostrarAlerta(alertaAcceso, 'Por favor ingrese su contraseña.', 'warning');
      loginPasswordInput?.focus();
      return;
    }

    // Ejecución asíncrona de autenticación
    setBotonCargando(btnLoginSubmit, true, 'Autenticando...');

    try {
      const { userData } = await iniciarSesion(email, password);
      mostrarAlerta(alertaAcceso, `¡Bienvenido, ${userData?.nombre || 'usuario'}! Redirigiendo a su portal...`, 'success');

      // Pequeño retardo perceptible para brindar feedback antes de redirección
      setTimeout(() => {
        redirigirSegunRol(userData);
      }, 700);
    } catch (error) {
      console.error("Error en submit login:", error);
      const mensajeTraducido = traducirErrorFirebaseAuth(error);
      mostrarAlerta(alertaAcceso, mensajeTraducido, 'error');
    } finally {
      setBotonCargando(btnLoginSubmit, false, '', 'Iniciar Sesión');
    }
  });
}

/* ==========================================================================
   ENVÍO: FORMULARIO DE REGISTRO DE PACIENTE
   ========================================================================== */
if (formRegistro) {
  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarAlerta(alertaAcceso);

    const nombre = regNombreInput?.value.trim() || '';
    const apellido = regApellidoInput?.value.trim() || '';
    const dui = regDuiInput?.value.trim() || '';
    const fechaNacimiento = regFechaNacimientoInput?.value.trim() || '';
    const sexoBiologico = regSexoBiologicoSelect?.value || '';
    const email = regEmailInput?.value.trim() || '';
    const password = regPasswordInput?.value || '';
    const passwordConfirm = regPasswordConfirmInput?.value || '';

    // Validaciones en cliente
    if (!campoNoVacio(nombre) || nombre.length < 2) {
      mostrarAlerta(alertaAcceso, 'Por favor ingrese un nombre válido (al menos 2 letras).', 'warning');
      regNombreInput?.focus();
      return;
    }

    if (!campoNoVacio(apellido) || apellido.length < 2) {
      mostrarAlerta(alertaAcceso, 'Por favor ingrese un apellido válido (al menos 2 letras).', 'warning');
      regApellidoInput?.focus();
      return;
    }

    if (!campoNoVacio(dui)) {
      mostrarAlerta(alertaAcceso, 'Por favor ingrese su número de DUI o documento de identidad.', 'warning');
      regDuiInput?.focus();
      return;
    }

    if (!validarDUI(dui)) {
      mostrarAlerta(alertaAcceso, 'El formato de DUI ingresado no es válido. Debe tener 9 dígitos con formato 00000000-0.', 'warning');
      regDuiInput?.focus();
      return;
    }

    if (!campoNoVacio(fechaNacimiento)) {
      mostrarAlerta(alertaAcceso, 'Por favor seleccione su fecha de nacimiento.', 'warning');
      regFechaNacimientoInput?.focus();
      return;
    }

    if (!validarFechaNacimiento(fechaNacimiento)) {
      mostrarAlerta(alertaAcceso, 'La fecha de nacimiento no es válida. No puede ser una fecha futura ni superar los 125 años de edad.', 'warning');
      regFechaNacimientoInput?.focus();
      return;
    }

    if (!campoNoVacio(sexoBiologico)) {
      mostrarAlerta(alertaAcceso, 'Por favor seleccione su sexo biológico.', 'warning');
      regSexoBiologicoSelect?.focus();
      return;
    }

    if (!validarEmail(email)) {
      mostrarAlerta(alertaAcceso, 'Por favor ingrese un correo electrónico válido.', 'warning');
      regEmailInput?.focus();
      return;
    }

    if (!validarPassword(password, 6)) {
      mostrarAlerta(alertaAcceso, 'La contraseña debe contener al menos 6 caracteres.', 'warning');
      regPasswordInput?.focus();
      return;
    }

    if (!coincidenPasswords(password, passwordConfirm)) {
      mostrarAlerta(alertaAcceso, 'Las contraseñas no coinciden. Por favor verifíquelas.', 'error');
      regPasswordConfirmInput?.focus();
      return;
    }

    // Ejecución asíncrona de registro
    setBotonCargando(btnRegSubmit, true, 'Creando cuenta de paciente...');

    try {
      const { userData } = await registrarPaciente({
        nombre,
        apellido,
        email,
        password,
        dui,
        fechaNacimiento,
        sexoBiologico
      });
      mostrarAlerta(alertaAcceso, `¡Cuenta creada exitosamente para ${userData.nombre}! Ingresando al portal...`, 'success');

      formRegistro.reset();

      setTimeout(() => {
        redirigirSegunRol(userData);
      }, 900);
    } catch (error) {
      console.error("Error en submit registro:", error);
      const mensajeTraducido = traducirErrorFirebaseAuth(error);
      mostrarAlerta(alertaAcceso, mensajeTraducido, 'error');
    } finally {
      setBotonCargando(btnRegSubmit, false, '', 'Registrarme como Paciente');
    }
  });
}

/* ==========================================================================
   VERIFICACIÓN INICIAL DE SESIÓN ACTIVA
   ========================================================================== */
async function verificarSesionExistente() {
  try {
    const usuarioActual = await obtenerUsuarioActual();
    if (usuarioActual) {
      redirigirSegunRol(usuarioActual);
    }
  } catch (err) {
    console.warn("Aviso en verificación de sesión:", err);
  }
}

// Escuchar cambios reactivos en caso de persistencia diferida
onAuthChange(({ userData }) => {
  if (userData) {
    redirigirSegunRol(userData);
  }
});

// Ejecutar verificación inicial
verificarSesionExistente();

