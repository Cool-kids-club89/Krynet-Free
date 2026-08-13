"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static IMAGE_SELECTOR =
        "img, video";

    static TEXT_SELECTOR =
        ".message-text";

    static MODEL_URL =
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js";

    constructor(initialBlur = 10) {
        this.settings = {
            blurAmount: 10,
            enabled: true
        };

        this.model = null;
        this.modelLoading = null;
        this.observer = null;
        this.scanTimer = null;

        this.setBlur(initialBlur);
        this.start();
    }

    /* ---------------------------------------------------------
       APPLY
    --------------------------------------------------------- */

    apply(messageEl, channel = null) {
        if (!messageEl) {
            return;
        }

        if (!this.settings.enabled) {
            this.clear(messageEl);
            return;
        }

        if (channel?.nsfw === true) {
            this.blur(messageEl);
            return;
        }

        void this.detectMessage(messageEl);
    }

    /* ---------------------------------------------------------
       BLUR
    --------------------------------------------------------- */

    blur(element) {
        if (!element) {
            return;
        }

        element.classList.add(
            KrynetBlurNSFW.BLUR_CLASS
        );
    }

    clear(element) {
        if (!element) {
            return;
        }

        element.classList.remove(
            KrynetBlurNSFW.BLUR_CLASS
        );
    }

    /* ---------------------------------------------------------
       BLUR AMOUNT
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
        this.settings.enabled =
            Boolean(enabled);

        if (!this.settings.enabled) {
            document
                .querySelectorAll(
                    `.${KrynetBlurNSFW.BLUR_CLASS}`
                )
                .forEach(element => {
                    this.clear(element);
                });
        } else {
            this.scan();
        }
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
       MODEL
    --------------------------------------------------------- */

    async loadModel() {
        if (this.model) {
            return this.model;
        }

        if (this.modelLoading) {
            return this.modelLoading;
        }

        this.modelLoading =
            (async () => {
                try {
                    if (!window.tf) {
                        await this.loadScript(
                            "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
                        );
                    }

                    if (!window.nsfwjs) {
                        await this.loadScript(
                            KrynetBlurNSFW.MODEL_URL
                        );
                    }

                    await window.tf.ready();

                    this.model =
                        await window.nsfwjs.load();

                    console.log(
                        "[KrynetNSFW] Model loaded."
                    );

                    return this.model;
                } catch (error) {
                    console.error(
                        "[KrynetNSFW] Failed to load detector:",
                        error
                    );

                    return null;
                } finally {
                    this.modelLoading = null;
                }
            })();

        return this.modelLoading;
    }

    loadScript(src) {
        return new Promise(
            (resolve, reject) => {
                const existing =
                    document.querySelector(
                        `script[src="${src}"]`
                    );

                if (existing) {
                    existing.addEventListener(
                        "load",
                        resolve,
                        { once: true }
                    );

                    existing.addEventListener(
                        "error",
                        reject,
                        { once: true }
                    );

                    return;
                }

                const script =
                    document.createElement(
                        "script"
                    );

                script.src = src;
                script.async = true;

                script.onload =
                    resolve;

                script.onerror =
                    () =>
                        reject(
                            new Error(
                                `Failed to load ${src}`
                            )
                        );

                document.head.appendChild(
                    script
                );
            }
        );
    }

    /* ---------------------------------------------------------
       IMAGE DETECTION
    --------------------------------------------------------- */

    async detectImage(image) {
        if (
            !this.settings.enabled ||
            !image ||
            !image.complete ||
            image.naturalWidth === 0
        ) {
            return false;
        }

        const model =
            await this.loadModel();

        if (!model) {
            return false;
        }

        try {
            const predictions =
                await model.classify(
                    image
                );

            const scores = {};

            for (const prediction of predictions) {
                scores[
                    prediction.className
                ] = prediction.probability;
            }

            /*
             * nsfwjs classes:
             *
             * Porn
             * Hentai
             * Sexy
             * Neutral
             * Drawing
             */

            const adultScore =
                Math.max(
                    scores.Porn || 0,
                    scores.Hentai || 0,
                    scores.Sexy || 0
                );

            /*
             * Conservative threshold.
             *
             * Sexy alone gets a higher threshold because
             * it is much more likely to produce false
             * positives than Porn/Hentai.
             */

            const explicitScore =
                Math.max(
                    scores.Porn || 0,
                    scores.Hentai || 0
                );

            const shouldBlur =
                explicitScore >= 0.60 ||
                adultScore >= 0.82;

            return shouldBlur;
        } catch (error) {
            console.warn(
                "[KrynetNSFW] Image detection failed:",
                error
            );

            return false;
        }
    }

    /* ---------------------------------------------------------
       MESSAGE DETECTION
    --------------------------------------------------------- */

    async detectMessage(message) {
        if (
            !message ||
            !this.settings.enabled
        ) {
            return;
        }

        const images =
            Array.from(
                message.querySelectorAll(
                    KrynetBlurNSFW.IMAGE_SELECTOR
                )
            );

        if (!images.length) {
            return;
        }

        for (const media of images) {
            if (
                !(media instanceof HTMLImageElement)
            ) {
                continue;
            }

            /*
             * Blur while classification is happening.
             * This prevents the image from briefly
             * appearing unblurred.
             */

            this.blur(media);

            const detected =
                await this.detectImage(media);

            if (detected) {
                this.blur(media);
            } else {
                this.clear(media);
            }
        }
    }

    /* ---------------------------------------------------------
       SCAN
    --------------------------------------------------------- */

    scan(root = document) {
        if (
            !this.settings.enabled
        ) {
            return;
        }

        const messages = [];

        if (
            root instanceof Element &&
            root.matches(".message")
        ) {
            messages.push(root);
        }

        if (
            root.querySelectorAll
        ) {
            messages.push(
                ...root.querySelectorAll(
                    ".message"
                )
            );
        }

        for (const message of messages) {
            void this.detectMessage(message);
        }
    }

    /* ---------------------------------------------------------
       DYNAMIC CONTENT
    --------------------------------------------------------- */

    scheduleScan() {
        if (this.scanTimer !== null) {
            return;
        }

        this.scanTimer =
            setTimeout(() => {
                this.scanTimer = null;
                this.scan();
            }, 100);
    }

    start() {
        if (!document.body) {
            if (
                document.readyState ===
                "loading"
            ) {
                document.addEventListener(
                    "DOMContentLoaded",
                    () => this.start(),
                    { once: true }
                );
            }

            return;
        }

        this.scan();

        this.observer =
            new MutationObserver(
                mutations => {
                    for (
                        const mutation of mutations
                    ) {
                        if (
                            mutation.addedNodes.length
                        ) {
                            this.scheduleScan();
                            return;
                        }
                    }
                }
            );

        this.observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        /*
         * Start loading the model immediately instead
         * of waiting until the first image appears.
         */

        void this.loadModel();

        console.log(
            "[KrynetNSFW] Detection active."
        );
    }

    stop() {
        this.observer?.disconnect();

        this.observer = null;

        if (this.scanTimer !== null) {
            clearTimeout(this.scanTimer);
            this.scanTimer = null;
        }
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
   CSS
------------------------------------------------------------- */

const style =
    document.createElement("style");

style.textContent = `
    .${KrynetBlurNSFW.BLUR_CLASS} {
        filter: blur(var(${KrynetBlurNSFW.CSS_VAR}, 10px));
        transition: filter .15s ease;
    }

    .${KrynetBlurNSFW.BLUR_CLASS}:hover {
        filter: blur(var(${KrynetBlurNSFW.CSS_VAR}, 10px));
    }
`;

document.head.appendChild(style);


/* -------------------------------------------------------------
   GLOBAL INSTANCE
------------------------------------------------------------- */

const instance =
    new KrynetBlurNSFW(10);


/* -------------------------------------------------------------
   GLOBAL EXPORT
------------------------------------------------------------- */

window.KrynetNSFW =
    instance;
