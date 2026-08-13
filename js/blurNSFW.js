"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";

    static IMAGE_SELECTOR = "img";
    static MESSAGE_SELECTOR = ".message";

    static DEFAULT_THRESHOLD = 0.60;

    constructor(initialBlur = 10) {
        this.settings = {
            blurAmount: initialBlur,
            enabled: true,
            threshold: KrynetBlurNSFW.DEFAULT_THRESHOLD
        };

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
                        for (const mutation of mutations) {
                            if (
                                mutation.addedNodes &&
                                mutation.addedNodes.length
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
       QUEUE IMAGE
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
            image.naturalWidth <= 1 ||
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

            const result =
                await this.detectImage(image);

            image.dataset.krNsfwChecked =
                "true";

            image.dataset.krNsfwScore =
                String(result.score);

            image.dataset.krNsfwClass =
                result.className;

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
       LOCAL IMAGE DETECTOR
    ========================================================= */

    async detectImage(image) {
        const maxSize = 160;

        const width =
            Math.min(
                image.naturalWidth,
                maxSize
            );

        const height =
            Math.min(
                image.naturalHeight,
                maxSize
            );

        const canvas =
            document.createElement(
                "canvas"
            );

        canvas.width = width;
        canvas.height = height;

        const context =
            canvas.getContext(
                "2d",
                {
                    willReadFrequently: true
                }
            );

        if (!context) {
            return {
                nsfw: false,
                score: 0,
                className: "Unknown"
            };
        }

        /*
         * Draw the image into a local canvas.
         *
         * No upload.
         * No network request.
         * No external library.
         */

        try {
            context.drawImage(
                image,
                0,
                0,
                width,
                height
            );
        } catch {
            return {
                nsfw: false,
                score: 0,
                className: "Unreadable"
            };
        }

        let pixels;

        try {
            pixels =
                context.getImageData(
                    0,
                    0,
                    width,
                    height
                ).data;
        } catch {
            /*
             * Cross-origin images without
             * CORS permission cannot be read
             * from canvas.
             */

            return {
                nsfw: false,
                score: 0,
                className: "CrossOrigin"
            };
        }

        let skinPixels = 0;
        let saturatedPixels = 0;
        let brightPixels = 0;
        let totalPixels = 0;

        /*
         * Sample pixels rather than processing
         * every pixel.
         */

        const step = 4;

        for (
            let y = 0;
            y < height;
            y += step
        ) {
            for (
                let x = 0;
                x < width;
                x += step
            ) {
                const index =
                    (y * width + x) * 4;

                const r =
                    pixels[index];

                const g =
                    pixels[index + 1];

                const b =
                    pixels[index + 2];

                const max =
                    Math.max(r, g, b);

                const min =
                    Math.min(r, g, b);

                const saturation =
                    max === 0
                        ? 0
                        : (max - min) /
                          max;

                /*
                 * Broad skin-tone heuristic.
                 *
                 * This deliberately uses a
                 * broad range rather than trying
                 * to identify individual people.
                 */

                const looksSkinLike =
                    r > 70 &&
                    g > 35 &&
                    b > 20 &&
                    r > g &&
                    g > b &&
                    r - g > 10 &&
                    r - b > 20 &&
                    saturation > 0.15;

                if (looksSkinLike) {
                    skinPixels++;
                }

                if (
                    saturation >
                    0.55
                ) {
                    saturatedPixels++;
                }

                if (
                    r > 200 &&
                    g > 180 &&
                    b > 160
                ) {
                    brightPixels++;
                }

                totalPixels++;
            }
        }

        if (!totalPixels) {
            return {
                nsfw: false,
                score: 0,
                className: "Unknown"
            };
        }

        const skinRatio =
            skinPixels /
            totalPixels;

        const saturationRatio =
            saturatedPixels /
            totalPixels;

        const brightRatio =
            brightPixels /
            totalPixels;

        /*
         * Combine signals.
         *
         * Skin alone is NOT enough.
         * Large areas of skin-like pixels
         * are required before the score rises.
         */

        let score = 0;

        if (skinRatio > 0.20) {
            score += 0.25;
        }

        if (skinRatio > 0.35) {
            score += 0.20;
        }

        if (skinRatio > 0.50) {
            score += 0.20;
        }

        if (skinRatio > 0.65) {
            score += 0.15;
        }

        /*
         * Images dominated by skin-like
         * pixels receive additional weight
         * when their color distribution
         * isn't extremely saturated.
         */

        if (
            skinRatio > 0.40 &&
            saturationRatio < 0.50
        ) {
            score += 0.10;
        }

        /*
         * Extremely bright images receive
         * a small reduction to avoid making
         * white backgrounds look suspicious.
         */

        if (
            brightRatio > 0.70
        ) {
            score -= 0.10;
        }

        score =
            Math.max(
                0,
                Math.min(
                    1,
                    score
                )
            );

        let className =
            "Neutral";

        if (
            score >=
            this.settings.threshold
        ) {
            className =
                "Likely NSFW";
        } else if (
            score >= 0.35
        ) {
            className =
                "Possibly NSFW";
        }

        return {
            nsfw:
                score >=
                this.settings.threshold,

            score,

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

        /*
         * ONLY a checked image can trigger
         * the blur.
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
