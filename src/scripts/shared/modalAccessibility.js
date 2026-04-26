/**
 * Gerencia acessibilidade e interacoes de modais.
 * - Focus trap dentro do modal
 * - Fechar com ESC
 * - Melhor acessibilidade de botoes de fechar
 */

class ModalAccessibility {
    constructor() {
        this.openModals = [];
        this.modalState = new Map();
    }

    trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"]), a[href]'
        );

        if (focusableElements.length === 0) {
            return null;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const focusTrapListener = (event) => {
            if (event.key !== 'Tab') {
                return;
            }

            if (event.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    event.preventDefault();
                }
                return;
            }

            if (document.activeElement === lastElement) {
                firstElement.focus();
                event.preventDefault();
            }
        };

        modal.addEventListener('keydown', focusTrapListener);

        setTimeout(() => {
            firstElement.focus();
        }, 50);

        return { focusTrapListener };
    }

    removeFocusTrap(modal, focusTrapListener) {
        if (focusTrapListener) {
            modal.removeEventListener('keydown', focusTrapListener);
        }
    }

    setupEscapeKey(modal, closeCallback) {
        const escapeListener = (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            event.preventDefault();
            closeCallback();
        };

        modal.addEventListener('keydown', escapeListener);
        return escapeListener;
    }

    enhanceCloseButton(modal) {
        const closeBtn = modal.querySelector('.close');
        if (!closeBtn) {
            return null;
        }

        closeBtn.setAttribute('aria-label', closeBtn.getAttribute('aria-label') || 'Fechar dialogo');
        closeBtn.setAttribute('role', closeBtn.getAttribute('role') || 'button');
        closeBtn.setAttribute('tabindex', closeBtn.getAttribute('tabindex') || '0');

        const closeListener = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            closeBtn.click();
        };

        closeBtn.addEventListener('keydown', closeListener);
        return { closeBtn, closeListener };
    }

    initModal(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.warn(`Modal com ID "${modalId}" nao encontrado`);
            return;
        }

        const previousActiveElement = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        this.removeModal(modalId);

        if (!modal.getAttribute('role')) {
            modal.setAttribute('role', 'dialog');
        }

        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'false');

        const focusTrapState = this.trapFocus(modal);
        const closeButtonState = this.enhanceCloseButton(modal);
        const closeHandler = typeof options.onClose === 'function'
            ? options.onClose
            : () => this.closeModal(modalId, true);
        const escapeListener = this.setupEscapeKey(modal, closeHandler);

        if (!this.openModals.includes(modalId)) {
            this.openModals.push(modalId);
        }

        this.modalState.set(modalId, {
            modal,
            closeHandler,
            escapeListener,
            focusTrapListener: focusTrapState?.focusTrapListener || null,
            closeBtn: closeButtonState?.closeBtn || null,
            closeListener: closeButtonState?.closeListener || null,
            previousActiveElement
        });
    }

    closeModal(modalId, skipHandler = false) {
        const state = this.modalState.get(modalId);
        if (!skipHandler && state?.closeHandler) {
            state.closeHandler();
            return;
        }

        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.remove('active');
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        this.removeModal(modalId);
    }

    removeModal(modalId) {
        const state = this.modalState.get(modalId);
        if (state?.modal) {
            this.removeFocusTrap(state.modal, state.focusTrapListener);

            if (state.escapeListener) {
                state.modal.removeEventListener('keydown', state.escapeListener);
            }

            if (state.closeBtn && state.closeListener) {
                state.closeBtn.removeEventListener('keydown', state.closeListener);
            }

            state.modal.setAttribute('aria-hidden', 'true');

            if (state.previousActiveElement && document.contains(state.previousActiveElement)) {
                state.previousActiveElement.focus();
            }
        }

        const index = this.openModals.indexOf(modalId);
        if (index > -1) {
            this.openModals.splice(index, 1);
        }

        this.modalState.delete(modalId);
    }

    getOpenModals() {
        return [...this.openModals];
    }

    hasOpenModals() {
        return this.openModals.length > 0;
    }
}

const modalA11y = new ModalAccessibility();
