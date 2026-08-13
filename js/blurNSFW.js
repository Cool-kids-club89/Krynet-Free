"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static MODEL_URL =
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js";

    static MODEL_PATH =
        "https://unpkg.com/nsfwjs@4.2.1/dist/nsfwjs.min.js";

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

        if (!this.settings.enabled) {
            this.clearAllBlurs();
            return;
        }

        this.scan();
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
       MODEL
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
                    if (
                        typeof window.nsfwjs !==
                        "undefined"
                    ) {
                        resolve();
                        return;
                    }

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

            this.observer?.disconnect();

            this.observer =
                new MutationObserver(
                    mutations => {
                        let shouldScan = false;

                        for (
                            const mutation
                            of mutations
                        ) {
                            if (
                                mutation.type !==
                                "childList"
                            ) {
                                continue;
                            }

                            if (
                                mutation.addedNodes.length
                            ) {
                                shouldScan = true;
                                break;
                            }
                        }

                        if (shouldScan) {
                            this.scan();
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
            !image.isConnected
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
            image.naturalWidth === 1 &&
            image.naturalHeight === 1
        ) {
            return;
        }

        this.pendingImages.add(image);

        /*
         * The image may already be loaded.
         */
        if (
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0
        ) {
            void this.analyzeImage(image);
            return;
        }

        /*
         * Otherwise wait for the actual image load.
         */
        image.addEventListener(
            "load",
            () => {
                void this.analyzeImage(image);
            },
            {
                once: true
            }
        );

        /*
         * Don't leave broken images pending forever.
         */
        image.addEventListener(
            "error",
            () => {
                this.pendingImages.delete(image);
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

            if (
                !image.complete ||
                !image.naturalWidth ||
                !image.naturalHeight
            ) {
                return;
            }

            /*
             * Find the message BEFORE classification.
             *
             * This guarantees the result belongs to
             * the exact message containing this image.
             */
            const message =
                image.closest(
                    KrynetBlurNSFW.MESSAGE_SELECTOR
                );

            if (!message) {
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

            image.dataset.krNsfwChecked =
                "true";

            image.dataset.krNsfwScore =
                String(result.score);

            image.dataset.krNsfwClass =
                result.className;

            /*
             * Store the result on THIS image.
             */
            image.__krynetNSFWResult = result;

            /*
             * Recalculate the message using
             * every analyzed image it contains.
             */
            this.updateMessage(message);

            this.scannedImages.add(image);

        } catch (error) {
            console.warn(
                "[KrynetNSFW] Image analysis failed:",
                error
            );
        } finally {
            this.pendingImages.delete(image);
        }
    }

    /* =========================================================
       UPDATE MESSAGE
    ========================================================= */

    updateMessage(message) {
        if (
            !message ||
            !message.isConnected
        ) {
            return;
        }

        const images =
            Array.from(
                message.querySelectorAll(
                    KrynetBlurNSFW.IMAGE_SELECTOR
                )
            );

        let nsfw = false;
        let highestScore = 0;
        let highestClass = "Neutral";

        for (const image of images) {
            const result =
                image.__krynetNSFWResult;

            if (!result) {
                continue;
            }

            if (
                result.score >
                highestScore
            ) {
                highestScore =
                    result.score;

                highestClass =
                    result.className;
            }

            if (result.nsfw) {
                nsfw = true;
            }
        }

        this.apply(
            message,
            {
                nsfw,
                score: highestScore,
                className: highestClass
            }
        );
    }

    /* =========================================================
       PREDICTIONS
    ========================================================= */

    getNSFWResult(predictions) {
        let pornScore = 0;
        let hentaiScore = 0;
        let sexyScore = 0;

        let highestClass = "Neutral";
        let highestScore = 0;

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
                probability >
                highestScore
            ) {
                highestScore =
                    probability;

                highestClass =
                    prediction.className;
            }

            if (name === "porn") {
                pornScore =
                    Math.max(
                        pornScore,
                        probability
                    );
            }

            if (name === "hentai") {
                hentaiScore =
                    Math.max(
                        hentaiScore,
                        probability
                    );
            }

            if (name === "sexy") {
                sexyScore =
                    Math.max(
                        sexyScore,
                        probability
                    );
            }
        }

        /*
         * Porn and hentai are direct NSFW
         * classifications.
         */
        const explicitScore =
            Math.max(
                pornScore,
                hentaiScore
            );

        /*
         * Sexy is weighted less aggressively.
         * It still needs the configured threshold.
         */
        const sexyAdjusted =
            sexyScore >=
            this.settings.threshold
                ? sexyScore * 0.9
                : 0;

        const score =
            Math.max(
                explicitScore,
                sexyAdjusted
            );

        return {
            nsfw:
                explicitScore >=
                    this.settings.threshold ||
                sexyScore >=
                    this.settings.threshold,

            score,

            className:
                explicitScore >=
                    this.settings.threshold
                    ? (
                        pornScore >= hentaiScore
                            ? "Porn"
                            : "Hentai"
                    )
                    : sexyScore >=
                        this.settings.threshold
                        ? "Sexy"
                        : highestClass
        };
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

        messageEl.dataset.krNsfwScore =
            String(
                result?.score || 0
            );

        messageEl.dataset.krNsfwClass =
            result?.className ||
            "Neutral";

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
                delete image.__krynetNSFWResult;
            });

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
