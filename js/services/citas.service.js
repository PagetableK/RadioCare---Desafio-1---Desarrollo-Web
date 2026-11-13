/**
 * RadioCare - Servicio de Citas Médicas (citas.service.js)
 * Integración con colección 'citas' en Firestore (Firebase v10 Modular SDK).
 *
 * ─── FLUJO DEL PACIENTE ─────────────────────────────────────────────────────
 *   solicitarCita()           – Registrar nueva cita en estado 'pendiente'.
 *   obtenerMisCitas()         – Consultar citas propias ordenadas cronológicamente.
 *   actualizarCitaPaciente()  – Modificar fecha, horario y notas si sigue 'pendiente'.
 *   cancelarCitaPaciente()    – Pasar estado a 'cancelada'.
 *
 * ─── FLUJO DEL COORDINADOR (métodos administrativos) ────────────────────────
 *   obtenerTodasLasCitas()    – Listar todos los documentos de la colección.
 *   cambiarEstadoCita()       – Actualizar campo 'estado' con timestamp.
 *   asignarRadiologo()        – Asignar médico radiólogo responsable.
 *   eliminarCitaDefinitiva()  – Eliminación física del documento (deleteDoc).
 */

import { db } from "./auth.service.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ============================================================================
   PERSONAL MÉDICO AUTORIZADO
   Lista oficial de radiólogos que pueden ser asignados por el coordinador.
   ============================================================================ */
export const RADIOLOGOS_OFICIALES = [
  "Dr. Gerardo Franco",
  "Dra. Itzel Suazo Sorto",
  "Dra. Susana Cruz"
];

/* ============================================================================
   ESTADOS VÁLIDOS DE CITA
   ============================================================================ */
export const ESTADOS_CITA = ["pendiente", "confirmada", "completada", "cancelada"];

/* ============================================================================
   FLUJO DEL PACIENTE — Métodos del Paciente
   ============================================================================ */

/**
 * Registra una nueva cita médica en la colección 'citas' de Firestore.
 * Asegura la captura de usuarioId, tipoDestinatario y pacienteNombreCompleto en la raíz del documento,
 * además del estado 'pendiente' y timestamp de creación.
 * @param {object} datosCita
 * @returns {Promise<object>} Objeto de la cita registrada con su ID de Firestore.
 */
export async function solicitarCita(datosCita) {
  try {
    const tipoDestinatario = datosCita.tipoDestinatario || 
      (datosCita.destinatario === 'para-familiar' ? 'familiar' : 'personal');

    const pacienteNombreCompleto = (
      datosCita.pacienteNombreCompleto || 
      `${datosCita.paciente?.nombre || ''} ${datosCita.paciente?.apellidos || ''}`.trim()
    );

    const payload = {
      ...datosCita,
      usuarioId: datosCita.usuarioId || datosCita.pacienteUid,
      tipoDestinatario,
      pacienteNombreCompleto,
      estado: 'pendiente',
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'citas'), payload);
    console.log("Cita médica registrada en Firestore con ID:", docRef.id);
    return { id: docRef.id, ...payload, estado: "pendiente" };
  } catch (error) {
    console.error("Error al registrar cita en Firestore:", error);
    throw error;
  }
}

/**
 * Consulta ordenada cronológicamente de citas médicas de un paciente donde usuarioId == usuarioId.
 * Aplica fallback de pacienteUid y ordenamiento cronológico en cliente para resiliencia ante índices.
 * @param {string} usuarioId - UID del paciente autenticado.
 * @returns {Promise<Array<object>>} Lista ordenada cronológicamente de citas del paciente.
 */
export async function obtenerMisCitas(usuarioId) {
 if (!usuarioId) return [];

  const citas = [];
  try {
    const citasRef = collection(db, 'citas');
    const q = query(citasRef, where('usuarioId', '==', usuarioId));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      citas.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch (error) {
    console.error("Error al obtener citas del paciente:", error);
    throw error;
  }

  // Ordenamiento cronológico: Citas más recientes / programadas primero
  citas.sort((a, b) => {
    const fechaA = a.agenda?.fecha || a.fecha || '';
    const fechaB = b.agenda?.fecha || b.fecha || '';
    if (fechaA && fechaB && fechaA !== fechaB) {
      return fechaB.localeCompare(fechaA);
    }
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });

  return citas;
}


/**
 * Permite actualizar únicamente fecha, horario y notas clínicas de una cita,
 * SI Y SOLO SI el estado actual de la cita sigue siendo "pendiente".
 * @param {string} citaId - Identificador del documento en Firestore.
 * @param {object} nuevosDatos - Objeto con { fecha, horario, notas }.
 * @returns {Promise<boolean>}
 */
export async function actualizarCitaPaciente(citaId, nuevosDatos) {
  if (!citaId) {
    throw new Error("El ID de la cita es obligatorio para modificarla.");
  }
  if (!nuevosDatos || !nuevosDatos.fecha || !nuevosDatos.horario) {
    throw new Error("La fecha y la franja horaria son obligatorias para actualizar la cita.");
  }

  try {
    const citaRef = doc(db, 'citas', citaId);
    const docSnap = await getDoc(citaRef);

    if (!docSnap.exists()) {
      throw new Error("La cita médica seleccionada no existe en el sistema.");
    }

    const citaActual = docSnap.data();

    // Regla de Negocio y Seguridad: Solo modificar si sigue estando en estado 'pendiente'
    if (citaActual.estado !== 'pendiente') {
      throw new Error(`Solo se pueden editar citas en estado "pendiente". La cita actual está "${citaActual.estado}".`);
    }

    const notasActualizadas = nuevosDatos.notas !== undefined 
      ? String(nuevosDatos.notas).trim() 
      : (citaActual.clinica?.notas || citaActual.notas || '');

    // Payload restringido exclusivamente a fecha, horario y notas clínicas
    const payload = {
      'agenda.fecha': nuevosDatos.fecha,
      'agenda.horario': nuevosDatos.horario,
      'clinica.notas': notasActualizadas,
      updatedAt: serverTimestamp()
    };

    // Mantener sincronía si el documento tenía campos en la raíz
    if (citaActual.fecha !== undefined) {
      payload.fecha = nuevosDatos.fecha;
    }
    if (citaActual.horario !== undefined) {
      payload.horario = nuevosDatos.horario;
    }
    if (citaActual.notas !== undefined) {
      payload.notas = notasActualizadas;
    }

    await updateDoc(citaRef, payload);
    console.log(`Cita ${citaId} actualizada exitosamente por el paciente.`);
    return true;
  } catch (error) {
    console.error(`Error al actualizar la cita ${citaId}:`, error);
    throw error;
  }
}

/**
 * Cancela una cita médica del paciente actualizando su estado a 'cancelada' en Firestore.
 * @param {string} citaId - ID del documento en la colección 'citas'.
 * @returns {Promise<boolean>}
 */
export async function cancelarCitaPaciente(citaId) {
  if (!citaId) throw new Error("ID de cita requerido para cancelar.");
  try {
    const citaRef = doc(db, 'citas', citaId);
    await updateDoc(citaRef, {
      estado: 'cancelada',
      updatedAt: serverTimestamp()
    });
    console.log(`Cita ${citaId} cancelada exitosamente en Firestore.`);
    return true;
  } catch (error) {
    console.error("Error al cancelar cita en Firestore:", error);
    throw error;
  }
}


/* ============================================================================
   FLUJO DEL COORDINADOR — Métodos administrativos
   ============================================================================ */

/**
 * Obtiene el listado completo de todos los documentos en la colección 'citas'.
 * Solo el coordinador tiene permisos de lectura total en Firestore Rules.
 * @returns {Promise<Array<object>>} Arreglo con todas las citas registradas.
 */
export async function obtenerTodasLasCitas() {
  try {
    const citasRef = collection(db, 'citas');
    const snapshot = await getDocs(citasRef);
    const citas = [];
    snapshot.forEach((docSnap) => {
      citas.push({ id: docSnap.id, ...docSnap.data() });
    });
    return citas;
  } catch (error) {
    console.error("Error al obtener todas las citas (coordinador):", error);
    throw error;
  }
}

/**
 * Actualiza el campo 'estado' de una cita y registra la marca de tiempo 'updatedAt'.
 * Estados válidos: "pendiente" | "confirmada" | "completada" | "cancelada".
 * @param {string} citaId    - ID del documento en la colección 'citas'.
 * @param {string} nuevoEstado - Nuevo valor del campo estado.
 * @returns {Promise<boolean>}
 */
export async function cambiarEstadoCita(citaId, nuevoEstado) {
  if (!citaId) throw new Error("ID de cita requerido para cambiar estado.");
  if (!ESTADOS_CITA.includes(nuevoEstado)) {
    throw new Error(`Estado inválido: "${nuevoEstado}". Estados permitidos: ${ESTADOS_CITA.join(', ')}.`);
  }
  try {
    const citaRef = doc(db, 'citas', citaId);
    await updateDoc(citaRef, {
      estado: nuevoEstado,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error(`Error al cambiar estado de cita ${citaId} a "${nuevoEstado}":`, error);
    throw error;
  }
}

/**
 * Asigna el médico radiólogo responsable de una cita.
 * El nombre debe pertenecer al listado oficial de RADIOLOGOS_OFICIALES.
 * Almacena el valor en 'medicoAsignado' y registra 'updatedAt'.
 * @param {string} citaId       - ID del documento en la colección 'citas'.
 * @param {string} nombreMedico - Nombre del radiólogo a asignar (o cadena vacía para desasignar).
 * @returns {Promise<boolean>}
 */
export async function asignarRadiologo(citaId, nombreMedico) {
  if (!citaId) throw new Error("ID de cita requerido para asignar radiólogo.");

  // Permitir cadena vacía para desasignar, pero validar si se especifica un nombre
  if (nombreMedico && !RADIOLOGOS_OFICIALES.includes(nombreMedico)) {
    throw new Error(
      `Radiólogo inválido: "${nombreMedico}". ` +
      `Personal autorizado: ${RADIOLOGOS_OFICIALES.join(', ')}.`
    );
  }

  try {
    const citaRef = doc(db, 'citas', citaId);
    await updateDoc(citaRef, {
      medicoAsignado: nombreMedico || null,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error(`Error al asignar radiólogo "${nombreMedico}" a cita ${citaId}:`, error);
    throw error;
  }
}

/**
 * Elimina físicamente el documento de una cita de la colección 'citas' en Firestore.
 * Esta operación es IRREVERSIBLE. Invocar solo tras confirmación explícita del coordinador.
 * @param {string} citaId - ID del documento a eliminar.
 * @returns {Promise<boolean>}
 */
export async function eliminarCitaDefinitiva(citaId) {
  if (!citaId) throw new Error("ID de cita requerido para eliminar.");
  try {
    const citaRef = doc(db, 'citas', citaId);
    await deleteDoc(citaRef);
    console.log(`Cita ${citaId} eliminada definitivamente de Firestore.`);
    return true;
  } catch (error) {
    console.error(`Error al eliminar cita ${citaId} de Firestore:`, error);
    throw error;
  }
}

/* ============================================================================
   GESTIÓN DE INFORMES DIAGNÓSTICOS (PLAN SPARK - DATA URLS / BASE64)
   ============================================================================ */

/**
 * Consulta el informe diagnóstico (PDF / DICOM) vinculado a una cita médica
 * en la colección 'informes' de Firestore.
 * @param {string} citaId - Identificador único de la cita médica.
 * @returns {Promise<{ nombreArchivo: string, tipoArchivo: string, dataBase64: string } | null>}
 */
export async function obtenerInformePorCita(citaId) {
  if (!citaId) return null;

  try {
    const informeRef = doc(db, 'informes', citaId);
    const informeSnap = await getDoc(informeRef);

    if (informeSnap.exists()) {
      const data = informeSnap.data();
      return {
        id: informeSnap.id,
        nombreArchivo: data.nombreArchivo || `Informe_${citaId}.pdf`,
        tipoArchivo: data.tipoArchivo || 'application/pdf',
        dataBase64: data.dataBase64 || data.base64 || data.archivoBase64 || data.dataUrl || ''
      };
    }

    // Consulta de respaldo en caso de que se haya guardado con campo citaId
    const informesCol = collection(db, 'informes');
    const q = query(informesCol, where('citaId', '==', citaId));
    const querySnap = await getDocs(q);

    if (!querySnap.empty) {
      const docEncontrado = querySnap.docs[0];
      const data = docEncontrado.data();
      return {
        id: docEncontrado.id,
        nombreArchivo: data.nombreArchivo || `Informe_${citaId}.pdf`,
        tipoArchivo: data.tipoArchivo || 'application/pdf',
        dataBase64: data.dataBase64 || data.base64 || data.archivoBase64 || data.dataUrl || ''
      };
    }

    return null;
  } catch (error) {
    console.error(`Error al obtener informe de la cita ${citaId}:`, error);
    throw error;
  }
}

/**
 * Almacena el informe diagnóstico (PDF / DICOM en formato Base64 Data URL)
 * en la colección 'informes/{citaId}' y actualiza el documento de la cita.
 *
 * @param {string} citaId - Identificador único del documento de la cita médica.
 * @param {object} archivoObj - Objeto con { nombreArchivo, tipoArchivo, dataBase64, subidoPor }.
 * @returns {Promise<boolean>}
 */
export async function subirInformeCita(citaId, archivoObj) {
  if (!citaId) {
    throw new Error("El identificador de la cita es obligatorio para subir el informe.");
  }
  if (!archivoObj || !archivoObj.dataBase64) {
    throw new Error("No se ha proporcionado el archivo diagnóstico en formato Base64.");
  }

  try {
    // 1. Guarda en doc(db, 'informes', citaId) mediante setDoc
    const informeRef = doc(db, 'informes', citaId);
    await setDoc(informeRef, {
      citaId,
      nombreArchivo: archivoObj.nombreArchivo,
      tipoArchivo: archivoObj.tipoArchivo || 'application/pdf',
      dataBase64: archivoObj.dataBase64,
      subidoPor: archivoObj.subidoPor || null,
      fechaSubida: serverTimestamp()
    });

    // 2. Actualiza doc(db, 'citas', citaId) mediante updateDoc
    const citaRef = doc(db, 'citas', citaId);
    await updateDoc(citaRef, {
      tieneInforme: true,
      nombreInforme: archivoObj.nombreArchivo
    });

    console.log(`Informe "${archivoObj.nombreArchivo}" subido y vinculado exitosamente a la cita ${citaId}`);
    return true;
  } catch (error) {
    console.error(`Error al subir informe clínico para la cita ${citaId}:`, error);
    throw error;
  }
}
