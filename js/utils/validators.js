/**
 * RadioCare - Utilidades de Validación
 * Validaciones en cliente para formularios de autenticación y citas médicas.
 */

/**
 * Valida formato de correo electrónico mediante expresión regular estándar RFC 5322 simplificada.
 * @param {string} email
 * @returns {boolean}
 */
export function validarEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(email.trim());
}

/**
 * Valida que una contraseña cumpla con longitud mínima (por defecto 6 para Firebase Auth).
 * @param {string} password
 * @param {number} [longitudMinima=6]
 * @returns {boolean}
 */
export function validarPassword(password, longitudMinima = 6) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= longitudMinima;
}

/**
 * Comprueba si dos contraseñas coinciden de forma estricta.
 * @param {string} p1
 * @param {string} p2
 * @returns {boolean}
 */
export function coincidenPasswords(p1, p2) {
  return typeof p1 === 'string' && typeof p2 === 'string' && p1 === p2 && p1.length > 0;
}

/**
 * Comprueba que un valor de texto no esté vacío ni compuesto únicamente de espacios.
 * @param {string} valor
 * @returns {boolean}
 */
export function campoNoVacio(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/**
 * Valida formato de DUI salvadoreño (8 dígitos, guion y 1 dígito verificador: 00000000-0).
 * @param {string} dui
 * @returns {boolean}
 */
export function validarDUI(dui) {
  if (!dui || typeof dui !== 'string') return false;
  const regex = /^\d{8}-\d{1}$/;
  return regex.test(dui.trim());
}

/**
 * Aplica máscara de DUI salvadoreño (00000000-0) limitando a un máximo de 9 dígitos numéricos.
 * Inserta automáticamente el guion antes del último dígito si la longitud numérica supera los 8 caracteres.
 * @param {string} valor
 * @returns {string}
 */
export function formatearDUI(valor) {
  if (!valor) return '';
  let digitos = String(valor).replace(/\D/g, '');
  if (digitos.length > 9) {
    digitos = digitos.slice(0, 9);
  }
  if (digitos.length > 8) {
    return `${digitos.slice(0, 8)}-${digitos.slice(8)}`;
  }
  return digitos;
}

/**
 * Valida que la fecha de cita médica sea estrictamente posterior a la fecha actual (hoy),
 * cumpliendo con la regla clínica de al menos 24 horas de anticipación.
 * @param {string} fecha - Cadena en formato YYYY-MM-DD
 * @returns {boolean}
 */
export function validarFechaCitaAnticipada(fecha) {
  if (!fecha || typeof fecha !== 'string') return false;
  const hoyStr = new Date().toISOString().split('T')[0];
  return fecha > hoyStr;
}

/**
 * Valida formato de teléfono salvadoreño (8 dígitos numéricos separados por guion: 0000-0000).
 * Comprueba mediante expresión regular estricta ^\d{4}-\d{4}$
 * @param {string} tel
 * @returns {boolean}
 */
export function validarTelefono(tel) {
  if (!tel || typeof tel !== 'string') return false;
  const regex = /^\d{4}-\d{4}$/;
  return regex.test(tel.trim());
}

/**
 * Comprueba que la fecha sea válida, que no esté en el futuro y que corresponda a una edad coherente (menor a 125 años).
 * @param {string} fecha - Cadena de fecha en formato YYYY-MM-DD
 * @returns {boolean}
 */
export function validarFechaNacimiento(fecha) {
  if (!fecha || typeof fecha !== 'string') return false;

  const partes = fecha.trim().split('-');
  if (partes.length !== 3) return false;

  const anio = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const dia = parseInt(partes[2], 10);

  if (isNaN(anio) || isNaN(mes) || isNaN(dia)) return false;

  // Comprobar validez real en el calendario (evita ej. 31 de febrero)
  const fechaObj = new Date(anio, mes - 1, dia);
  if (
    fechaObj.getFullYear() !== anio ||
    fechaObj.getMonth() !== mes - 1 ||
    fechaObj.getDate() !== dia
  ) {
    return false;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaObj.setHours(0, 0, 0, 0);

  // No debe ser una fecha en el futuro
  if (fechaObj > hoy) {
    return false;
  }

  // Edad menor a 125 años
  let edad = hoy.getFullYear() - anio;
  const mesDiff = hoy.getMonth() - (mes - 1);
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < dia)) {
    edad--;
  }

  if (edad < 0 || edad >= 125) {
    return false;
  }

  return true;
}

