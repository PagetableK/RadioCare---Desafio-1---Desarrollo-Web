/**
 * RadioCare - Utilidades de Validación (validators.js)
 * Funciones puras de validación para formularios clínicos y autenticación.
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
 * Valida formato de DUI salvadoreño (8 dígitos numéricos, guion y 1 dígito verificador: ^\d{8}-\d{1}$).
 * @param {string} dui
 * @returns {boolean}
 */
export function validarDUI(dui) {
  if (!dui || typeof dui !== 'string') return false;
  const regex = /^\d{8}-\d{1}$/;
  return regex.test(dui.trim());
}

/**
 * Valida formato de teléfono salvadoreño (8 dígitos numéricos separados por guion: ^\d{4}-\d{4}$).
 * @param {string} tel
 * @returns {boolean}
 */
export function validarTelefono(tel) {
  if (!tel || typeof tel !== 'string') return false;
  const regex = /^\d{4}-\d{4}$/;
  return regex.test(tel.trim());
}

/**
 * Aplica máscara de DUI salvadoreño (00000000-0) limitando a un máximo de 9 dígitos numéricos.
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
 * Verifica que una fecha de cita médica cumpla con todas las reglas clínicas de negocio:
 * 1. No sea una fecha en el pasado.
 * 2. No sea el mismo día en curso (requiere al menos 24 horas de antelación).
 * 3. No sea domingo (día 0 de la semana, clínica cerrada).
 * @param {string} fechaStr - Cadena en formato YYYY-MM-DD
 * @returns {boolean}
 */
export function validarFechaCita(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return false;

  const partes = fechaStr.trim().split('-');
  if (partes.length !== 3) return false;

  const anio = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const dia = parseInt(partes[2], 10);

  if (isNaN(anio) || isNaN(mes) || isNaN(dia)) return false;

  // Instanciar en hora local para evitar discrepancias por zona horaria UTC
  const fechaObj = new Date(anio, mes - 1, dia);
  if (
    fechaObj.getFullYear() !== anio ||
    fechaObj.getMonth() !== mes - 1 ||
    fechaObj.getDate() !== dia
  ) {
    return false; // Fecha calendario inválida
  }

  // Fecha actual a las 00:00:00 local
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaObj.setHours(0, 0, 0, 0);

  // 1 y 2: No debe ser fecha pasada ni el mismo día en curso
  if (fechaObj.getTime() <= hoy.getTime()) {
    return false;
  }

  // 3: No debe ser domingo (getDay() === 0)
  if (fechaObj.getDay() === 0) {
    return false;
  }

  return true;
}

/**
 * Valida la franja horaria según el día de la semana:
 * Si la fecha es sábado (día 6), valida que la franja pertenezca exclusivamente a turnos matutinos
 * (entre 6:30 a. m. y 12:00 p. m.: 'manana-temprana' o 'manana').
 * En días de semana regulares (lunes a viernes), acepta cualquier franja horaria habilitada.
 * @param {string} fechaStr - Cadena de fecha en formato YYYY-MM-DD
 * @param {string} franjaHoraria - Clave de la franja horaria seleccionada
 * @returns {boolean}
 */
export function validarHorarioSabado(fechaStr, franjaHoraria) {
  if (!fechaStr || !franjaHoraria || typeof fechaStr !== 'string' || typeof franjaHoraria !== 'string') {
    return false;
  }

  const partes = fechaStr.trim().split('-');
  if (partes.length !== 3) return false;

  const anio = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const dia = parseInt(partes[2], 10);

  if (isNaN(anio) || isNaN(mes) || isNaN(dia)) return false;

  const fechaObj = new Date(anio, mes - 1, dia);
  if (isNaN(fechaObj.getTime())) return false;

  const franja = franjaHoraria.trim();
  const franjasMatutinas = ['manana-temprana', 'manana'];
  const esMatutina = franjasMatutinas.includes(franja) || 
                     franja.includes('6:30') || 
                     franja.includes('9:00');

  // Si es sábado (día 6), solo se permiten turnos matutinos
  if (fechaObj.getDay() === 6) {
    return esMatutina;
  }

  // En lunes a viernes (1 a 5), se permiten todas las franjas hábiles del centro
  const franjasHabiles = ['manana-temprana', 'manana', 'mediodia', 'tarde'];
  return franjasHabiles.includes(franja) || esMatutina || franja.includes('12:00') || franja.includes('2:00');
}


/**
 * Comprueba que la fecha sea válida, no esté en el futuro y corresponda a una edad coherente (< 125 años).
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

  if (fechaObj > hoy) {
    return false;
  }

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
