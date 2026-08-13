"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static MODEL_URL =
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js";

    static MODEL_PATH =
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/example/nsfw_model/";

    static IMAGE_SELECTOR =
        "img";

    static MESSAGE_SELECTOR =
        ".message";

    static DEFAULT_THRESHOLD = 0.60;

    constructor(initialBlur = 10) {
        this.settings = {
            blurAmount: initialBlur,
            enabled: true,
            threshold: KrynetBlurNSFW.DEFAULT_THRESHOLD
        };

        this.model = null;
        this.modelLoading = null;
        this.observer = null;

        this.scannedImages = new WeakSet();
        this.pendingImages = new WeakSet();

        this.setBlur(initialBlur);
        this.start();
    }

    /* =========================================================
       BLUR
    ========================================================= */

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

    /* =========================================================
       ENABLE / DISABLE
    ========================================================= */

    toggle(enabled) {
        this.settings.enabled = Boolean(enabled);

        if (!this.settings.enabled) {
            this.clearAllBlurs();
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

    /* =========================================================
       THRESHOLD
    ========================================================= */

    setThreshold(value) {
        if (
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1
        ) {
            throw new Error(
                "NSFW threshold must be between 0 and 1."
            );
        }

        this.settings.threshold = value;
    }

    getThreshold() {
        return this.settings.threshold;
    }

    /* =========================================================
       SETTINGS
    ========================================================= */

    getSettings() {
        return {
            ...this.settings
        };
    }

    /* =========================================================
       MODEL LOADING
    ========================================================= */

    async loadModel() {
        if (this.model) {
            return this.model;
        }

        if (this.modelLoading) {
            return this.modelLoading;
        }

        this.modelLoading = (async () => {
            try {
                /*
                 * NSFW.js exposes window.nsfwjs.
                 * Don't reload it if another script already did.
                 */

                if (
                    typeof window.nsfwjs ===
                    "undefined"
                ) {
                    await this.loadScript(
                        KrynetBlurNSFW.MODEL_URL
                    );
                }

                if (
                    typeof window.nsfwjs ===
                    "undefined"
                ) {
                    throw new Error(
                        "NSFW.js failed to load."
                    );
                }

                this.model =
                    await window.nsfwjs.load(
                        KrynetBlurNSFW.MODEL_PATH
                    );

                console.log(
                    "[KrynetNSFW] Model loaded."
                );

                return this.model;

            } catch (error) {
                console.error(
                    "[KrynetNSFW] Model loading failed:",
                    error
                );

                throw error;

            } finally {
                this.modelLoading = null;
            }
        })();

        return this.modelLoading;
    }

    /* =========================================================
       SCRIPT LOADER
    ========================================================= */

    loadScript(src) {
        return new Promise(
            (resolve, reject) => {
                const existing =
                    document.querySelector(
                        `script[src="${CSS.escape(src)}"]`
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
                    () => reject(
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

    /* =========================================================
       START
    ========================================================= */

    start() {
        const startScanning = () => {
            this.scan();

            if (this.observer) {
                this.observer.disconnect();
            }

            this.observer =
                new MutationObserver(
                    mutations => {
                        for (
                            const mutation
                            of mutations
                        ) {
                            if (
                                mutation.addedNodes
                                    .length
                            ) {
                                this.scan();
                                return;
                            }
                        }
                    }
                );

            if (document.body) {
                this.observer.observe(
                    document.body,
                    {
                        childList: true,
                        subtree: true
                    }
                );
            }
        };

        if (
            document.readyState ===
            "loading"
        ) {
            document.addEventListener(
                "DOMContentLoaded",
                startScanning,
                { once: true }
            );
        } else {
            startScanning();
        }
    }

    /* =========================================================
       SCAN
    ========================================================= */

    scan(root = document) {
        if (!this.settings.enabled) {
            return;
        }

        const images = [];

        if (
            root instanceof HTMLImageElement
        ) {
            images.push(root);
        }

        if (
            root.querySelectorAll
        ) {
            root
                .querySelectorAll(
                    KrynetBlurNSFW.IMAGE_SELECTOR
                )
                .forEach(image => {
                    images.push(image);
                });
        }

        for (const image of images) {
            this.queueImage(image);
        }
    }

    /* =========================================================
       QUEUE IMAGE
    ========================================================= */

    queueImage(image) {
        if (
            !(image instanceof HTMLImageElement)
        ) {
            return;
        }

        if (
            this.scannedImages.has(image) ||
            this.pendingImages.has(image)
        ) {
            return;
        }

        /*
         * Ignore tiny tracking pixels.
         */

        if (
            image.naturalWidth === 1 &&
            image.naturalHeight === 1
        ) {
            return;
        }

        this.pendingImages.add(image);

        if (image.complete) {
            void this.analyzeImage(image);
            return;
        }

        image.addEventListener(
            "load",
            () => {
                void this.analyzeImage(image);
            },
            {
                once: true
            }
        );
    }

    /* =========================================================
       ANALYZE IMAGE
    ========================================================= */

    async analyzeImage(image) {
        if (
            !image ||
            !image.isConnected
        ) {
            this.pendingImages.delete(image);
            return;
        }

        try {
            const model =
                await this.loadModel();

            if (
                !this.settings.enabled
            ) {
                return;
            }

            /*
             * Ignore images that failed to load.
             */

            if (
                !image.complete ||
                !image.naturalWidth ||
                !image.naturalHeight
            ) {
                return;
            }

            const predictions =
                await model.classify(
                    image,
                    5
                );

            const result =
                this.getNSFWResult(
                    predictions
                );

            const message =
                image.closest(
                    KrynetBlurNSFW.MESSAGE_SELECTOR
                );

            /*
             * This is the important part:
             *
             * Each image gets its own decision.
             * We NEVER globally blur all messages.
             */

            if (message) {
                this.apply(
                    message,
                    {
                        nsfw: result.nsfw,
                        score: result.score
                    }
                );
            }

            image.dataset.krNsfwChecked =
                "true";

            image.dataset.krNsfwScore =
                String(result.score);

            image.dataset.krNsfwClass =
                result.className;

            this.scannedImages.add(
                image
            );

        } catch (error) {
            console.warn(
                "[KrynetNSFW] Image analysis failed:",
                error
            );
        } finally {
            this.pendingImages.delete(
                image
            );
        }
    }

    /* =========================================================
       INTERPRET PREDICTIONS
    ========================================================= */

    getNSFWResult(predictions) {
        let nsfwScore = 0;
        let className = "Neutral";

        for (
            const prediction
            of predictions || []
        ) {
            const name =
                String(
                    prediction.className ||
                    ""
                ).toLowerCase();

            const probability =
                Number(
                    prediction.probability
                ) || 0;

            /*
             * NSFW.js normally returns:
             *
             * Porn
             * Hentai
             * Sexy
             * Neutral
             * Drawing
             */

            if (
                name === "porn" ||
                name === "hentai"
            ) {
                nsfwScore =
                    Math.max(
                        nsfwScore,
                        probability
                    );

                className =
                    prediction.className;
            }

            /*
             * Sexy is treated separately and
             * requires a higher confidence.
             */

            if (
                name === "sexy" &&
                probability >=
                    this.settings.threshold
            ) {
                nsfwScore =
                    Math.max(
                        nsfwScore,
                        probability * 0.9
                    );

                className =
                    prediction.className;
            }
        }

        return {
            nsfw:
                nsfwScore >=
                this.settings.threshold,

            score:
                nsfwScore,

            className
        };
    }

    /* =========================================================
       APPLY
    ========================================================= */

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

        /*
         * Keep the result directly on the
         * message so another image cannot
         * accidentally affect other messages.
         */

        messageEl.dataset.krNsfw =
            shouldBlur
                ? "true"
                : "false";

        if (shouldBlur) {
            messageEl.style.setProperty(
                KrynetBlurNSFW.CSS_VAR,
                `${this.settings.blurAmount}px`
            );
        } else {
            messageEl.style.removeProperty(
                KrynetBlurNSFW.CSS_VAR
            );
        }
    }

    /* =========================================================
       CLEAR
    ========================================================= */

    clearAllBlurs() {
        document
            .querySelectorAll(
                `.${KrynetBlurNSFW.BLUR_CLASS}`
            )
            .forEach(message => {
                message.classList.remove(
                    KrynetBlurNSFW.BLUR_CLASS
                );

                message.dataset.krNsfw =
                    "false";

                message.style.removeProperty(
                    KrynetBlurNSFW.CSS_VAR
                );
            });
    }

    /* =========================================================
       FORCE RESCAN
    ========================================================= */

    rescan() {
        this.scannedImages =
            new WeakSet();

        this.pendingImages =
            new WeakSet();

        this.clearAllBlurs();
        this.scan();
    }

    /* =========================================================
       STOP
    ========================================================= */

    stop() {
        this.observer?.disconnect();
        this.observer = null;
    }
}


/* =============================================================
   GLOBAL INSTANCE
============================================================= */

const instance =
    new KrynetBlurNSFW(10);


/* =============================================================
   GLOBAL EXPORT
============================================================= */

window.KrynetNSFW =
    instance;
