/**
 * RadioCare - Utilidades de Interfaz de Usuario y Feedback Accesible (ui.js)
 * Sistema de notificaciones toast, modales de confirmación accesibles
 * y estados de carga reutilizables sin dependencias externas.
 */

// Asegura la disponibilidad de estilos para toasts y modales de confirmación
// Los estilos institucionales han sido centralizados en css/base.css para evitar inyecciones dinámicas.
function asegurarEstilosUI() {
  // Estilos centralizados en css/base.css
}

/**
 * Obtiene o crea el contenedor accesible para los toasts flotantes.
 * @returns {HTMLElement}
 */
function obtenerContenedorToast() {
  asegurarEstilosUI();
  let contenedor = document.getElementById('rc-toast-container');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'rc-toast-container';
    contenedor.setAttribute('aria-live', 'polite');
    contenedor.setAttribute('aria-atomic', 'false');
    document.body.appendChild(contenedor);
  }
  return contenedor;
}

/**
 * Muestra una notificación flotante accesible (Toast) con autocierre a los 3.5 segundos.
 * @param {string} mensaje - Mensaje descriptivo de la notificación.
 * @param {'exito' | 'error' | 'success'} [tipo='exito'] - Tipo y severidad visual del toast.
 */
export function mostrarToast(mensaje, tipo = 'exito') {
  if (typeof document === 'undefined') return;

  const contenedor = obtenerContenedorToast();
  const esError = tipo === 'error' || tipo === 'danger';
  const claseTipo = esError ? 'rc-toast-item--error' : 'rc-toast-item--exito';

  const iconoHtml = esError
    ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ff4d6d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    : `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#00ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>`;

  const toast = document.createElement('div');
  toast.className = `rc-toast-item ${claseTipo}`;
  toast.setAttribute('role', esError ? 'alert' : 'status');
  toast.setAttribute('aria-live', esError ? 'assertive' : 'polite');

  toast.innerHTML = `
    <span class="rc-toast__icono">${iconoHtml}</span>
    <div style="flex: 1; font-weight: 500;">${mensaje}</div>
    <button type="button" class="rc-toast__cerrar" aria-label="Cerrar notificación">✕</button>
  `;

  contenedor.appendChild(toast);

  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    toast.classList.add('rc-toast--salida');
    toast.addEventListener('animationend', () => {
      toast.remove();
    }, { once: true });
  };

  const timer = setTimeout(cerrar, 3500);

  const btnCerrar = toast.querySelector('.rc-toast__cerrar');
  btnCerrar?.addEventListener('click', () => {
    clearTimeout(timer);
    cerrar();
  });
}

/**
 * Muestra un modal accesible para confirmar acciones destructivas (ej. cancelación de citas).
 * Retorna una Promise<boolean> que resuelve a true si el usuario confirma o false si cancela.
 * @param {object} opciones
 * @param {string} opciones.titulo - Título del diálogo de confirmación.
 * @param {string} opciones.mensaje - Mensaje explicativo de la acción.
 * @param {string} [opciones.textoConfirmar='Confirmar'] - Texto para el botón de acción principal.
 * @param {string} [opciones.textoCancelar='Cancelar'] - Texto para el botón de cancelación.
 * @returns {Promise<boolean>}
 */
export function mostrarModalConfirmacion({
  titulo = 'Confirmar acción',
  mensaje = '¿Está seguro de que desea continuar?',
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar'
}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }

    asegurarEstilosUI();

    const elementoPrevioEnfocado = document.activeElement;
    const bodyOverflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const backdrop = document.createElement('div');
    backdrop.className = 'rc-modal-backdrop';
    backdrop.id = `modal-confirmacion-${Date.now()}`;

    const idTitulo = `modal-conf-titulo-${Date.now()}`;
    const idMensaje = `modal-conf-desc-${Date.now()}`;

    backdrop.innerHTML = `
      <div class="rc-modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${idTitulo}" aria-describedby="${idMensaje}">
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(72, 70, 198, 0.35);
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="
              width: 38px;
              height: 38px;
              border-radius: 10px;
              background: rgba(255, 77, 109, 0.15);
              border: 1px solid rgba(255, 77, 109, 0.35);
              color: #ff4d6d;
              display: flex;
              align-items: center;
              justify-content: center;
            " aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 id="${idTitulo}" style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">${titulo}</h3>
          </div>
          <button type="button" class="btn-cerrar-modal" aria-label="Cerrar diálogo" style="
            background: transparent;
            border: none;
            color: #9494a9;
            font-size: 18px;
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
          ">✕</button>
        </div>

        <div style="padding: 22px 24px;">
          <p id="${idMensaje}" style="margin: 0; font-size: 14px; line-height: 1.6; color: #d0cff5;">
            ${mensaje}
          </p>
        </div>

        <div style="
          padding: 16px 24px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: rgba(18, 17, 56, 0.5);
          border-top: 1px solid rgba(72, 70, 198, 0.25);
        ">
          <button type="button" class="btn btn--fantasma btn-cancelar" style="font-size: 13px; padding: 8px 18px;">
            ${textoCancelar}
          </button>
          <button type="button" class="btn btn--peligro btn-confirmar" style="font-size: 13px; padding: 8px 20px;">
            ${textoConfirmar}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const btnConfirmar = backdrop.querySelector('.btn-confirmar');
    const btnCancelar = backdrop.querySelector('.btn-cancelar');
    const btnCerrar = backdrop.querySelector('.btn-cerrar-modal');

    // Por seguridad en acciones destructivas, enfocar el botón de cancelar por defecto
    btnCancelar?.focus();

    const limpiarModal = (resultado) => {
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      document.body.style.overflow = bodyOverflowPrevio;
      if (elementoPrevioEnfocado && typeof elementoPrevioEnfocado.focus === 'function') {
        elementoPrevioEnfocado.focus();
      }
      resolve(resultado);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        limpiarModal(false);
      } else if (e.key === 'Tab') {
        // Trampa de foco accesible
        const elementosFoco = [btnCancelar, btnConfirmar, btnCerrar].filter(Boolean);
        const primero = elementosFoco[0];
        const ultimo = elementosFoco[elementosFoco.length - 1];

        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    btnConfirmar?.addEventListener('click', () => limpiarModal(true));
    btnCancelar?.addEventListener('click', () => limpiarModal(false));
    btnCerrar?.addEventListener('click', () => limpiarModal(false));

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        limpiarModal(false);
      }
    });
  });
}

/**
 * Muestra un mensaje de alerta accesible (éxito, error, advertencia) en un contenedor dado.
 * @param {HTMLElement} contenedor - Elemento del DOM donde se inyectará la alerta.
 * @param {string} mensaje - Texto descriptivo del mensaje.
 * @param {'error' | 'success' | 'warning' | 'info'} [tipo='error'] - Severidad de la alerta.
 */
export function mostrarAlerta(contenedor, mensaje, tipo = 'error') {
  if (!contenedor) return;

  const coloresPorTipo = {
    error: {
      borde: '#ff4d6d',
      fondo: 'rgba(255, 77, 109, 0.12)',
      texto: '#ffb3c1',
      icono: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    },
    success: {
      borde: '#00ffaa',
      fondo: 'rgba(0, 255, 170, 0.12)',
      texto: '#b6ffea',
      icono: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    },
    warning: {
      borde: '#ffb703',
      fondo: 'rgba(255, 183, 3, 0.12)',
      texto: '#ffe29a',
      icono: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    },
    info: {
      borde: '#00b1ff',
      fondo: 'rgba(0, 177, 255, 0.12)',
      texto: '#a6e5ff',
      icono: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    }
  };

  const estilo = coloresPorTipo[tipo] || coloresPorTipo.error;

  contenedor.innerHTML = `
    <div class="rc-alerta" role="alert" style="
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      margin-bottom: 20px;
      border-radius: 14px;
      background: ${estilo.fondo};
      border: 1px solid ${estilo.borde};
      color: ${estilo.texto};
      font-size: 14px;
      line-height: 1.4;
      animation: rcFadeIn 0.25s ease-out;
    ">
      <span style="flex-shrink: 0; color: ${estilo.borde}; display: flex; align-items: center;">
        ${estilo.icono}
      </span>
      <div style="flex: 1;">${mensaje}</div>
    </div>
  `;
}

/**
 * Limpia el contenido de la alerta en un contenedor.
 * @param {HTMLElement} contenedor
 */
export function limpiarAlerta(contenedor) {
  if (contenedor) {
    contenedor.innerHTML = '';
  }
}

/**
 * Gestiona el estado de carga visual en un botón (deshabilita y muestra texto/spinner accesible).
 * @param {HTMLButtonElement} boton - Elemento del botón.
 * @param {boolean} [cargando=true] - Indica si se activa o desactiva el estado de carga.
 * @param {string} [textoCarga='Procesando...'] - Mensaje temporal durante la carga.
 * @param {string} [textoNormal=''] - Texto opcional de reemplazo al restaurar el botón.
 */
export function setBotonCargando(boton, cargando = true, textoCarga = 'Procesando...', textoNormal = '') {
  if (!boton) return;

  if (cargando) {
    if (!boton.dataset.originalHtml) {
      boton.dataset.originalHtml = boton.innerHTML;
    }
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.innerHTML = `
      <span class="rc-spinner rc-spinner--sm" aria-hidden="true"></span>
      <span>${textoCarga}</span>
    `;
  } else {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    if (textoNormal) {
      boton.innerHTML = textoNormal;
    } else if (boton.dataset.originalHtml) {
      boton.innerHTML = boton.dataset.originalHtml;
    }
  }
}
