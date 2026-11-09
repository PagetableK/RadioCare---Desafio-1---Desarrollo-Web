/**
 * RadioCare - Utilidades de Interfaz de Usuario (UI)
 * Manejo de alertas accesibles y estados de carga en botones.
 */

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
 * Gestiona el estado de carga visual en un botón (deshabilita y muestra texto/spinner).
 * @param {HTMLButtonElement} boton - Elemento del botón.
 * @param {boolean} cargando - Indica si se activa o desactiva el estado de carga.
 * @param {string} [textoCarga='Procesando...'] - Mensaje temporal durante la carga.
 * @param {string} [textoNormal=''] - Texto original al restaurar el botón.
 */
export function setBotonCargando(boton, cargando, textoCarga = 'Procesando...', textoNormal = '') {
  if (!boton) return;

  if (cargando) {
    if (!boton.dataset.originalHtml) {
      boton.dataset.originalHtml = boton.innerHTML;
    }
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.innerHTML = `
      <span class="rc-spinner" aria-hidden="true" style="
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: rcSpin 0.7s linear infinite;
        vertical-align: middle;
      "></span>
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

