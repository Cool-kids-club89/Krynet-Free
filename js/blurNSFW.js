"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static TF_URL =
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";

    static NSFWJS_URL =
        "https://unpkg.com/nsfwjs@4.2.1/dist/browser/nsfwjs.min.js";

    /*
     * HOST THE NSFWJS MODEL IN YOUR OWN REPOSITORY.
     *
     * Expected:
     *
     * /Krynet-Free/
     *   models/
     *     mobilenet_v2/
     *       model.json
     *       group1-shard1of5.bin
     *       group1-shard2of5.bin
     *       ...
     *
     * GitHub Pages will then serve this as:
     *
     * https://cool-kids-club89.github.io/Krynet-Free/models/mobilenet_v2/
     */
    static MODEL_PATH =
        "/Krynet-Free/models/mobilenet_v2/";

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
                Array.from(
                    document.scripts
                ).find(
                    script =>
                        script.src ===
                        new URL(
                            src,
                            document.baseURI
                        ).href
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
                /*
                 * TensorFlow first.
                 */

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

                /*
                 * NSFWJS second.
                 */

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

                /*
                 * TensorFlow backend must be ready
                 * before loading the model.
                 */

                await window.tf.ready();

                if (
                    typeof window.tf.enableProdMode ===
                    "function"
                ) {
                    window.tf.enableProdMode();
                }

                /*
                 * Check the configured model URL
                 * before asking NSFWJS to load it.
                 */

                const modelURL =
                    new URL(
                        KrynetBlurNSFW.MODEL_PATH,
                        document.baseURI
                    ).href;

                console.log(
                    "[KrynetNSFW] Loading model:",
                    modelURL
                );

                /*
                 * NSFWJS accepts the directory
                 * containing model.json.
                 */

                this.model =
                    await window.nsfwjs.load(
                        modelURL
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

                /*
                 * Allow another attempt after
                 * a failed network/model load.
                 */

                this.model = null;

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
                                break;
                            }

                            if (
                                mutation.type ===
                                "attributes" &&
                                mutation.attributeName ===
                                "src"
                            ) {
                                if (
                                    mutation.target
                                    instanceof
                                    HTMLImageElement
                                ) {
                                    this.queueImage(
                                        mutation.target,
                                        true
                                    );
                                }
                            }
                        }
                    }
                );

            if (document.body) {
                this.observer.observe(
                    document.body,
                    {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: [
                            "src"
                        ]
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

    queueImage(
        image,
        force = false
    ) {
        if (
            !(image instanceof
                HTMLImageElement)
        ) {
            return;
        }

        if (
            this.pendingImages.has(image)
        ) {
            return;
        }

        if (
            !force &&
            this.scannedImages.has(image)
        ) {
            return;
        }

        /*
         * Ignore tracking pixels.
         */

        if (
            image.naturalWidth <= 1 &&
            image.naturalHeight <= 1
        ) {
            return;
        }

        /*
         * New src = new image.
         */

        const src =
            image.currentSrc ||
            image.src ||
            "";

        if (
            force &&
            image.dataset.krNsfwSrc === src
        ) {
            return;
        }

        this.pendingImages.add(image);

        /*
         * Image is already loaded.
         */

        if (
            image.complete &&
            image.naturalWidth > 0
        ) {
            void this.analyzeImage(image);
            return;
        }

        /*
         * Wait for load.
         */

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
       ANALYZE IMAGE
    ========================================================= */

    async analyzeImage(image) {
        try {
            if (
                !image ||
                !image.isConnected
            ) {
                return;
            }

            if (
                !this.settings.enabled
            ) {
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

            /*
             * Not a message image.
             */

            if (!message) {
                return;
            }

            /*
             * Capture the current source so
             * an image changing while the
             * model loads cannot apply an old
             * classification to the new image.
             */

            const source =
                image.currentSrc ||
                image.src ||
                "";

            const model =
                await this.loadModel();

            if (
                !this.settings.enabled
            ) {
                return;
            }

            if (
                !image.isConnected ||
                !image.complete ||
                !image.naturalWidth
            ) {
                return;
            }

            const currentSource =
                image.currentSrc ||
                image.src ||
                "";

            if (
                currentSource !== source
            ) {
                this.pendingImages.delete(
                    image
                );

                this.queueImage(
                    image,
                    true
                );

                return;
            }

            /*
             * Run NSFWJS.
             */

            const predictions =
                await model.classify(
                    image,
                    5
                );

            /*
             * Image may have changed while
             * classification was running.
             */

            const finalSource =
                image.currentSrc ||
                image.src ||
                "";

            if (
                finalSource !== source
            ) {
                image.dataset.krNsfwChecked =
                    "false";

                this.scannedImages.delete(
                    image
                );

                this.updateMessageBlur(
                    message
                );

                this.queueImage(
                    image,
                    true
                );

                return;
            }

            const result =
                this.getNSFWResult(
                    predictions
                );

            /*
             * Store result on THIS image.
             */

            image.dataset.krNsfwChecked =
                "true";

            image.dataset.krNsfwScore =
                String(result.score);

            image.dataset.krNsfwClass =
                result.className;

            image.dataset.krNsfwSrc =
                source;

            /*
             * Recalculate the entire message.
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

            /*
             * Porn and Hentai.
             */

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

            /*
             * Sexy.
             */

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

            score:
                nsfwScore,

            className
        };
    }

    /* =========================================================
       MESSAGE RESULT
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

        /*
         * ANY confirmed NSFW image means
         * the message is blurred.
         *
         * Unchecked images do not clear a
         * previously confirmed NSFW image.
         */

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

        document
            .querySelectorAll(
                KrynetBlurNSFW.IMAGE_SELECTOR
            )
            .forEach(image => {
                delete image.dataset.krNsfwChecked;
                delete image.dataset.krNsfwScore;
                delete image.dataset.krNsfwClass;
                delete image.dataset.krNsfwSrc;
            });

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
