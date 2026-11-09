/**
 * RadioCare - Lógica de Mi Información (mi-informacion.page.js)
 * Control de acceso estricto a pacientes, anti-BFCache, lectura y actualización
 * del expediente personal en Firestore con merge reactivo.
 */

import { auth, db, onAuthChange, obtenerUsuarioActual, actualizarCacheUsuario } from "../services/auth.service.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { mostrarAlerta, limpiarAlerta, setBotonCargando } from "../utils/ui.js";
import { campoNoVacio } from "../utils/validators.js";

/* ==========================================================================
   REFERENCIAS AL DOM
   ========================================================================== */
const contenido = document.getElementById('contenido');
const authLoading = document.getElementById('auth-loading');
const formInfo = document.getElementById('form-mi-informacion');
const alertaInfo = document.getElementById('alerta-info');
const btnGuardar = document.getElementById('btn-guardar-info');

const inputNombre = document.getElementById('info-nombre');
const inputApellido = document.getElementById('info-apellido');
const inputDui = document.getElementById('info-dui');
const inputNacimiento = document.getElementById('info-nacimiento');
const inputSexo = document.getElementById('info-sexo');
const inputTelefono = document.getElementById('info-telefono');
const inputEmail = document.getElementById('info-email');

let usuarioAuthActual = null;

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

    const rol = (usuario?.rol || 'paciente').toLowerCase();
    if (rol !== 'paciente') {
      if (contenido) contenido.setAttribute('hidden', 'true');
      window.location.replace('acceso.html');
    }
  } catch (error) {
    console.error("Error en revalidar mi-informacion:", error);
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
   PRECARGA DE CAMPOS EN EL FORMULARIO
   ========================================================================== */
function precargarCampos(datos, authUser) {
  if (inputNombre) {
    inputNombre.value = datos?.nombre || (authUser?.displayName ? authUser.displayName.split(' ')[0] : '');
  }
  if (inputApellido) {
    inputApellido.value = datos?.apellido || (authUser?.displayName ? authUser.displayName.split(' ').slice(1).join(' ') : '');
  }
  if (inputDui) {
    inputDui.value = datos?.dui || '';
  }
  if (inputNacimiento) {
    inputNacimiento.value = datos?.nacimiento || datos?.fechaNacimiento || '';
  }
  if (inputSexo) {
    inputSexo.value = datos?.sexo || '';
  }
  if (inputTelefono) {
    inputTelefono.value = datos?.telefono || '';
  }
  if (inputEmail) {
    inputEmail.value = authUser?.email || datos?.email || '';
  }
}

/* ==========================================================================
   CONTROL DE SESIÓN Y CARGA DESDE FIRESTORE
   ========================================================================== */
onAuthChange(async ({ authUser, userData }) => {
  if (!authUser) {
    if (contenido) contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
    return;
  }

  const rol = (userData?.rol || 'paciente').toLowerCase();
  if (rol !== 'paciente') {
    // Solo usuarios autenticados con rol 'paciente' pueden ingresar a esta sección
    if (contenido) contenido.setAttribute('hidden', 'true');
    window.location.replace('acceso.html');
    return;
  }

  usuarioAuthActual = authUser;

  try {
    // 1. Obtener documento del usuario en Firestore (usuarios/{uid})
    const userDocRef = doc(db, 'usuarios', authUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    let datosPaciente;

    if (userDocSnap.exists()) {
      datosPaciente = userDocSnap.data();
    } else {
      // 2. Si el documento no existe aún en Firestore, toma los datos base de Firebase Auth
      const partesNombre = (authUser.displayName || '').split(' ');
      datosPaciente = {
        uid: authUser.uid,
        nombre: partesNombre[0] || (authUser.email ? authUser.email.split('@')[0] : ''),
        apellido: partesNombre.slice(1).join(' ') || '',
        email: authUser.email || '',
        dui: '',
        nacimiento: '',
        sexo: '',
        telefono: '',
        rol: 'paciente'
      };
    }

    // 3. Precargar los campos del formulario
    precargarCampos(datosPaciente, authUser);

    // 4. Mostrar el contenido seguro y ocultar el indicador de carga
    if (authLoading) authLoading.style.display = 'none';
    if (contenido) contenido.removeAttribute('hidden');

  } catch (error) {
    console.error("Error al obtener expediente en Firestore:", error);
    // En caso de fallo de red puntual, utilizar datos de sesión base
    precargarCampos(userData || {}, authUser);
    if (authLoading) authLoading.style.display = 'none';
    if (contenido) contenido.removeAttribute('hidden');
  }
});

/* ==========================================================================
   ACTUALIZACIÓN DEL EXPEDIENTE PERSONAL
   ========================================================================== */
if (formInfo) {
  formInfo.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarAlerta(alertaInfo);

    if (!usuarioAuthActual) {
      window.location.replace('acceso.html');
      return;
    }

    const nombre = inputNombre?.value.trim() || '';
    const apellido = inputApellido?.value.trim() || '';
    const dui = inputDui?.value.trim() || '';
    const nacimiento = inputNacimiento?.value || '';
    const sexo = inputSexo?.value || '';
    const telefono = inputTelefono?.value.trim() || '';

    // Validaciones en cliente
    if (!campoNoVacio(nombre) || nombre.length < 2) {
      mostrarAlerta(alertaInfo, 'Por favor ingrese su nombre (mínimo 2 letras).', 'warning');
      inputNombre?.focus();
      return;
    }

    if (!campoNoVacio(apellido) || apellido.length < 2) {
      mostrarAlerta(alertaInfo, 'Por favor ingrese sus apellidos (mínimo 2 letras).', 'warning');
      inputApellido?.focus();
      return;
    }

    if (dui && !/^(\d{8}-\d|\d{9}|[A-Z]{1,2}\d{6,9})$/i.test(dui)) {
      mostrarAlerta(alertaInfo, 'El formato de DUI (00000000-0) o pasaporte no es válido.', 'warning');
      inputDui?.focus();
      return;
    }

    if (telefono && !/^(\+503 )?\d{4}-?\d{4}$/.test(telefono)) {
      mostrarAlerta(alertaInfo, 'El formato de teléfono debe ser 0000-0000 o +503 0000-0000.', 'warning');
      inputTelefono?.focus();
      return;
    }

    // Activar estado de carga visual en el botón
    setBotonCargando(btnGuardar, true, 'Guardando cambios...');

    try {
      const datosActualizados = {
        nombre,
        apellido,
        dui,
        nacimiento,
        sexo,
        telefono,
        email: usuarioAuthActual.email,
        rol: 'paciente',
        updatedAt: serverTimestamp()
      };

      // Ejecutar setDoc con merge: true en usuarios/{uid}
      const userDocRef = doc(db, 'usuarios', usuarioAuthActual.uid);
      await setDoc(userDocRef, datosActualizados, { merge: true });

      // Actualizar la caché de usuario en memoria para sincronización con navbar y citas
      actualizarCacheUsuario(datosActualizados);

      // Mantener sincronizado el displayName en Firebase Auth
      try {
        await updateProfile(usuarioAuthActual, {
          displayName: `${nombre} ${apellido}`.trim()
        });
      } catch (profileErr) {
        console.warn("Aviso: No se pudo sincronizar displayName en Auth:", profileErr);
      }

      // Mensaje accesible de confirmación
      mostrarAlerta(
        alertaInfo, 
        '¡Expediente actualizado con éxito! Sus datos personales han sido guardados correctamente.', 
        'success'
      );

      // Desplazamiento suave para visibilidad de la alerta
      alertaInfo?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
      console.error("Error al guardar información personal:", error);
      mostrarAlerta(
        alertaInfo, 
        'Ocurrió un error al intentar guardar sus datos. Verifique su conexión y reintente.', 
        'error'
      );
    } finally {
      setBotonCargando(btnGuardar, false, '', 'Guardar cambios');
    }
  });
}

