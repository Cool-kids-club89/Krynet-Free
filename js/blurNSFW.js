"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static TF_URL =
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";

    static NSFWJS_URL =
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.3.0/dist/nsfwjs.min.js";

    static IMAGE_SELECTOR = "img";
    static MESSAGE_SELECTOR = ".message";

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

        if (this.settings.enabled) {
            this.rescan();
        } else {
            this.clearAllBlurs();
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
       SCRIPT LOADER
    ========================================================= */

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (!src) {
                reject(
                    new Error(
                        "Cannot load script: URL is undefined."
                    )
                );

                return;
            }

            const existing =
                document.querySelector(
                    `script[src="${CSS.escape(src)}"]`
                );

            if (existing) {
                if (
                    existing.dataset.krLoaded ===
                    "true"
                ) {
                    resolve();
                    return;
                }

                existing.addEventListener(
                    "load",
                    () => resolve(),
                    { once: true }
                );

                existing.addEventListener(
                    "error",
                    () =>
                        reject(
                            new Error(
                                `Failed to load ${src}`
                            )
                        ),
                    { once: true }
                );

                return;
            }

            const script =
                document.createElement("script");

            script.src = src;
            script.async = true;

            script.onload = () => {
                script.dataset.krLoaded =
                    "true";

                resolve();
            };

            script.onerror = () => {
                reject(
                    new Error(
                        `Failed to load ${src}`
                    )
                );
            };

            document.head.appendChild(script);
        });
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
                /* TensorFlow */

                if (
                    typeof window.tf ===
                    "undefined"
                ) {
                    await this.loadScript(
                        KrynetBlurNSFW.TF_URL
                    );
                }

                if (
                    typeof window.tf ===
                    "undefined"
                ) {
                    throw new Error(
                        "TensorFlow.js failed to load."
                    );
                }

                /* NSFWJS */

                if (
                    typeof window.nsfwjs ===
                    "undefined"
                ) {
                    await this.loadScript(
                        KrynetBlurNSFW.NSFWJS_URL
                    );
                }

                if (
                    typeof window.nsfwjs ===
                    "undefined"
                ) {
                    throw new Error(
                        "NSFWJS failed to load."
                    );
                }

                await window.tf.ready();

                /*
                 * IMPORTANT:
                 *
                 * Do NOT provide a remote model path.
                 *
                 * NSFWJS bundles the MobileNetV2
                 * model with the library.
                 */

                this.model =
                    await window.nsfwjs.load(
                        "MobileNetV2"
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
                {
                    once: true
                }
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
            root instanceof
            HTMLImageElement
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
       QUEUE
    ========================================================= */

    queueImage(image) {
        if (
            !(image instanceof
                HTMLImageElement)
        ) {
            return;
        }

        if (
            this.scannedImages.has(image) ||
            this.pendingImages.has(image)
        ) {
            return;
        }

        if (
            image.naturalWidth <= 1 &&
            image.naturalHeight <= 1
        ) {
            return;
        }

        this.pendingImages.add(image);

        if (
            image.complete &&
            image.naturalWidth > 0
        ) {
            void this.analyzeImage(image);
            return;
        }

        image.addEventListener(
            "load",
            () => {
                void this.analyzeImage(
                    image
                );
            },
            {
                once: true
            }
        );
    }

    /* =========================================================
       ANALYZE
    ========================================================= */

    async analyzeImage(image) {
        try {
            if (
                !image ||
                !image.isConnected
            ) {
                return;
            }

            if (!this.settings.enabled) {
                return;
            }

            if (
                !image.complete ||
                !image.naturalWidth ||
                !image.naturalHeight
            ) {
                return;
            }

            const message =
                image.closest(
                    KrynetBlurNSFW.MESSAGE_SELECTOR
                );

            if (!message) {
                return;
            }

            const model =
                await this.loadModel();

            if (!this.settings.enabled) {
                return;
            }

            if (
                !image.isConnected ||
                !image.complete ||
                !image.naturalWidth
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

            /*
             * Store the classification on
             * the actual image.
             */

            image.dataset.krNsfwChecked =
                "true";

            image.dataset.krNsfwScore =
                String(result.score);

            image.dataset.krNsfwClass =
                result.className;

            /*
             * Recalculate only the message
             * containing this image.
             */

            this.updateMessageBlur(
                message
            );

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
       PREDICTIONS
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

            if (
                name === "porn" ||
                name === "hentai"
            ) {
                if (
                    probability >
                    nsfwScore
                ) {
                    nsfwScore =
                        probability;

                    className =
                        prediction.className;
                }
            }

            if (
                name === "sexy" &&
                probability >=
                    this.settings.threshold
            ) {
                const adjusted =
                    probability * 0.9;

                if (
                    adjusted >
                    nsfwScore
                ) {
                    nsfwScore =
                        adjusted;

                    className =
                        prediction.className;
                }
            }
        }

        return {
            nsfw:
                nsfwScore >=
                this.settings.threshold,

            score: nsfwScore,

            className
        };
    }

    /* =========================================================
       UPDATE MESSAGE
    ========================================================= */

    updateMessageBlur(message) {
        if (!message) {
            return;
        }

        const images =
            Array.from(
                message.querySelectorAll(
                    KrynetBlurNSFW.IMAGE_SELECTOR
                )
            );

        const nsfwImage =
            images.some(image => {
                if (
                    image.dataset
                        .krNsfwChecked !==
                    "true"
                ) {
                    return false;
                }

                return (
                    Number(
                        image.dataset
                            .krNsfwScore
                    ) >=
                    this.settings.threshold
                );
            });

        this.apply(
            message,
            {
                nsfw: nsfwImage
            }
        );
    }

    /* =========================================================
       APPLY
    ========================================================= */

    apply(messageEl, result) {
        if (!messageEl) {
            return;
        }

        const shouldBlur =
            this.settings.enabled === true &&
            result?.nsfw === true;

        messageEl.classList.toggle(
            KrynetBlurNSFW.BLUR_CLASS,
            shouldBlur
        );

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
       RESCAN
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
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
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
