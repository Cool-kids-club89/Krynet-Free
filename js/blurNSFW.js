"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    constructor(initialBlur = 10) {
        this.settings = {
            blurAmount: 10,
            enabled: true
        };

        this.setBlur(initialBlur);
    }

    /* ---------------------------------------------------------
       APPLY
    --------------------------------------------------------- */

    apply(messageEl, channel) {
        if (!messageEl) {
            return;
        }

        const shouldBlur =
            this.settings.enabled === true &&
            channel?.nsfw === true;

        messageEl.classList.toggle(
            KrynetBlurNSFW.BLUR_CLASS,
            shouldBlur
        );
    }

    /* ---------------------------------------------------------
       BLUR
    --------------------------------------------------------- */

    setBlur(px) {
        if (!Number.isFinite(px) || px < 0) {
            throw new Error(
                "Blur amount must be a non-negative number."
            );
        }

        this.settings.blurAmount = px;

        document.documentElement.style.setProperty(
            KrynetBlurNSFW.CSS_VAR,
            `${px}px`
        );
    }

    getBlur() {
        return this.settings.blurAmount;
    }

    /* ---------------------------------------------------------
       ENABLE / DISABLE
    --------------------------------------------------------- */

    toggle(enabled) {
        this.settings.enabled = Boolean(enabled);
    }

    enable() {
        this.toggle(true);
    }

    disable() {
        this.toggle(false);
    }

    isEnabled() {
        return this.settings.enabled;
    }

    /* ---------------------------------------------------------
       SETTINGS
    --------------------------------------------------------- */

    getSettings() {
        return {
            ...this.settings
        };
    }
}

/* -------------------------------------------------------------
   GLOBAL INSTANCE
------------------------------------------------------------- */

const instance = new KrynetBlurNSFW(10);

/* -------------------------------------------------------------
   GLOBAL EXPORT
------------------------------------------------------------- */

window.KrynetNSFW = instance;
