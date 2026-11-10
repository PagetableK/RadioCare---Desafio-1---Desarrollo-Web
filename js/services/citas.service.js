/**
 * RadioCare - Servicio de Citas Médicas (citas.service.js)
 * Integración con colección 'citas' en Firestore (Firebase v10 Modular SDK).
 *
 * ─── FLUJO DEL PACIENTE (preservado íntegro) ────────────────────────────────
 *   solicitarCita()           – Registrar nueva cita en estado 'pendiente'.
 *   obtenerCitasPorUsuario()  – Consultar citas propias filtradas por usuarioId.
 *   cancelarCita()            – Pasar estado a 'cancelada'.
 *
 * ─── FLUJO DEL COORDINADOR (métodos administrativos añadidos) ───────────────
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
   FLUJO DEL PACIENTE — Funciones originales (no modificadas)
   ============================================================================ */

/**
 * Registra una nueva cita médica en la colección 'citas' de Firestore.
 * Asegura la captura de usuarioId en la raíz del documento, estado 'pendiente' y createdAt.
 * @param {object} datosCita
 * @returns {Promise<object>} Objeto de la cita registrada con su ID de Firestore.
 */
export async function solicitarCita(datosCita) {
  try {
    const payload = {
      ...datosCita,
      usuarioId: datosCita.usuarioId || datosCita.pacienteUid,
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
 * Consulta las citas registradas de un usuario en Firestore por su usuarioId.
 * Incluye fallback de filtrado en cliente para resiliencia ante índices o reglas.
 * @param {string} usuarioId
 * @returns {Promise<Array<object>>}
 */
export async function obtenerCitasPorUsuario(usuarioId) {
  if (!usuarioId) return [];

  const citas = [];
  try {
    const citasRef = collection(db, 'citas');
    const q = query(citasRef, where('usuarioId', '==', usuarioId));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      citas.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Fallback: Si no trajo resultados, verificar si existen registros con pacienteUid
    if (citas.length === 0) {
      const qFallback = query(citasRef, where('pacienteUid', '==', usuarioId));
      const fallbackSnap = await getDocs(qFallback);
      fallbackSnap.forEach((docSnap) => {
        citas.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    return citas;
  } catch (error) {
    console.warn("Aviso en consulta indexada de citas, ejecutando fallback en cliente:", error);
    try {
      const allSnap = await getDocs(collection(db, 'citas'));
      allSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.usuarioId === usuarioId || data.pacienteUid === usuarioId) {
          citas.push({ id: docSnap.id, ...data });
        }
      });
      return citas;
    } catch (fallbackError) {
      console.error("Error definitivo al obtener citas:", fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Cancela una cita médica actualizando su estado a 'cancelada' en Firestore.
 * @param {string} citaId
 * @returns {Promise<boolean>}
 */
export async function cancelarCita(citaId) {
  if (!citaId) throw new Error("ID de cita requerido para cancelar.");
  try {
    const citaRef = doc(db, 'citas', citaId);
    await updateDoc(citaRef, {
      estado: 'cancelada',
      updatedAt: serverTimestamp()
    });
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
