"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static MODEL_URL =
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.0.2/dist/model/";

    static NSFW_THRESHOLD = 0.65;

    static IMAGE_SELECTOR =
        "img";

    constructor(initialBlur = 10) {
        this.settings = {
            blurAmount: 10,
            enabled: true
        };

        this.model = null;
        this.modelLoading = null;
        this.observer = null;
        this.processedImages = new WeakSet();

        this.setBlur(initialBlur);

        this.injectStyles();
        this.startObserver();
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

        if (!this.settings.enabled) {
            document
                .querySelectorAll(
                    `.${KrynetBlurNSFW.BLUR_CLASS}`
                )
                .forEach(element => {
                    element.classList.remove(
                        KrynetBlurNSFW.BLUR_CLASS
                    );
                });
        }
    }

    enable() {
        this.toggle(true);
        this.scan();
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

    /* ---------------------------------------------------------
       STYLES
    --------------------------------------------------------- */

    injectStyles() {
        if (
            document.getElementById(
                "krynet-nsfw-styles"
            )
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id =
            "krynet-nsfw-styles";

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
                    if (
                        typeof window.nsfwjs ===
                        "undefined"
                    ) {
                        throw new Error(
                            "NSFWJS is not loaded"
                        );
                    }

                    this.model =
                        await window.nsfwjs.load(
                            KrynetBlurNSFW.MODEL_URL
                        );

                    console.log(
                        "[KrynetNSFW] Model loaded."
                    );

                    return this.model;

                } finally {
                    this.modelLoading =
                        null;
                }
            })();

        return this.modelLoading;
    }

    /* ---------------------------------------------------------
       IMAGE DETECTION
    --------------------------------------------------------- */

    async detectImage(image) {
        if (
            !image ||
            !this.settings.enabled
        ) {
            return false;
        }

        try {
            const model =
                await this.loadModel();

            /*
             * Images that haven't finished loading
             * cannot be classified reliably.
             */
            if (
                !image.complete ||
                image.naturalWidth === 0 ||
                image.naturalHeight === 0
            ) {
                await new Promise(resolve => {
                    const done = () => {
                        image.removeEventListener(
                            "load",
                            done
                        );

                        image.removeEventListener(
                            "error",
                            done
                        );

                        resolve();
                    };

                    image.addEventListener(
                        "load",
                        done,
                        { once: true }
                    );

                    image.addEventListener(
                        "error",
                        done,
                        { once: true }
                    );
                });
            }

            if (
                image.naturalWidth === 0 ||
                image.naturalHeight === 0
            ) {
                return false;
            }

            const predictions =
                await model.classify(image);

            /*
             * NSFWJS returns categories such as:
             *
             * Drawing
             * Hentai
             * Neutral
             * Porn
             * Sexy
             *
             * We intentionally use a fairly conservative
             * threshold so ordinary images aren't blurred
             * unnecessarily.
             */
            const score =
                this.getNSFWScore(
                    predictions
                );

            const nsfw =
                score >=
                KrynetBlurNSFW.NSFW_THRESHOLD;

            const message =
                image.closest(".message");

            if (message) {
                message.classList.toggle(
                    KrynetBlurNSFW.BLUR_CLASS,
                    nsfw
                );

                message.dataset.nsfwDetected =
                    nsfw
                        ? "true"
                        : "false";
            } else {
                image.classList.toggle(
                    KrynetBlurNSFW.BLUR_CLASS,
                    nsfw
                );
            }

            return nsfw;

        } catch (error) {
            console.warn(
                "[KrynetNSFW] Detection failed:",
                error
            );

            return false;
        }
    }

    /* ---------------------------------------------------------
       SCORE
    --------------------------------------------------------- */

    getNSFWScore(predictions) {
        if (!Array.isArray(predictions)) {
            return 0;
        }

        let score = 0;

        for (const prediction of predictions) {
            const className =
                String(
                    prediction?.className || ""
                ).toLowerCase();

            const probability =
                Number(
                    prediction?.probability || 0
                );

            if (
                className === "porn" ||
                className === "hentai" ||
                className === "sexy"
            ) {
                score += probability;
            }
        }

        return Math.min(score, 1);
    }

    /* ---------------------------------------------------------
       PROCESS IMAGE
    --------------------------------------------------------- */

    processImage(image) {
        if (
            !(image instanceof HTMLImageElement)
        ) {
            return;
        }

        if (
            this.processedImages.has(image)
        ) {
            return;
        }

        this.processedImages.add(image);

        void this.detectImage(image);
    }

    /* ---------------------------------------------------------
       SCAN
    --------------------------------------------------------- */

    scan(root = document) {
        if (!this.settings.enabled) {
            return;
        }

        if (
            root instanceof HTMLImageElement
        ) {
            this.processImage(root);
        }

        if (
            !(root instanceof Element) &&
            root !== document
        ) {
            return;
        }

        root
            .querySelectorAll(
                KrynetBlurNSFW.IMAGE_SELECTOR
            )
            .forEach(image => {
                this.processImage(image);
            });
    }

    /* ---------------------------------------------------------
       OBSERVER
    --------------------------------------------------------- */

    startObserver() {
        if (this.observer) {
            return;
        }

        this.observer =
            new MutationObserver(
                mutations => {
                    if (
                        !this.settings.enabled
                    ) {
                        return;
                    }

                    for (
                        const mutation
                        of mutations
                    ) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                node instanceof Element
                            ) {
                                this.scan(node);
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
                    subtree: true
                }
            );

            this.scan();
        } else {
            document.addEventListener(
                "DOMContentLoaded",
                () => {
                    this.observer.observe(
                        document.body,
                        {
                            childList: true,
                            subtree: true
                        }
                    );

                    this.scan();
                },
                { once: true }
            );
        }
    }

    /* ---------------------------------------------------------
       STOP
    --------------------------------------------------------- */

    stop() {
        this.observer?.disconnect();
        this.observer = null;
    }
}

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
