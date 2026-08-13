"use strict";

class KrynetBlurNSFW {
    static CSS_VAR = "--kr-nsfw-blur";
    static BLUR_CLASS = "kr-nsfw-blur";
    static IMAGE_SELECTOR = "img";
    static MESSAGE_SELECTOR = ".message";

    constructor(initialBlur = 10) {
        this.settings = {
            blurAmount: initialBlur,
            enabled: true,
            threshold: 0.60
        };

        this.observer = null;
        this.pending = new WeakSet();
        this.results = new WeakMap();

        this.setBlur(initialBlur);
        this.start();
    }

    setBlur(px) {
        if (!Number.isFinite(px) || px < 0) {
            throw new Error("Blur amount must be non-negative.");
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

    setThreshold(value) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new Error("Threshold must be between 0 and 1.");
        }

        this.settings.threshold = value;
    }

    getThreshold() {
        return this.settings.threshold;
    }

    enable() {
        this.settings.enabled = true;
        this.scan();
    }

    disable() {
        this.settings.enabled = false;
        this.clearAllBlurs();
    }

    isEnabled() {
        return this.settings.enabled;
    }

    getSettings() {
        return { ...this.settings };
    }

    /*
     * Plug your approved image detector into this function.
     *
     * It must return:
     * {
     *     sensitive: boolean,
     *     score: number
     * }
     */
    async detectImage(image) {
        throw new Error(
            "KrynetNSFW.detectImage() requires an image detector."
        );
    }

    start() {
        const begin = () => {
            this.scan();

            this.observer?.disconnect();

            this.observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length) {
                        this.scan();
                        break;
                    }
                }
            });

            if (document.body) {
                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                begin,
                { once: true }
            );
        } else {
            begin();
        }
    }

    scan(root = document) {
        if (!this.settings.enabled) {
            return;
        }

        const images = [];

        if (root instanceof HTMLImageElement) {
            images.push(root);
        }

        root.querySelectorAll?.("img").forEach(image => {
            images.push(image);
        });

        for (const image of images) {
            this.queueImage(image);
        }
    }

    queueImage(image) {
        if (!(image instanceof HTMLImageElement)) {
            return;
        }

        if (this.pending.has(image)) {
            return;
        }

        if (
            image.naturalWidth <= 1 ||
            image.naturalHeight <= 1
        ) {
            return;
        }

        this.pending.add(image);

        const analyze = () => {
            void this.analyzeImage(image);
        };

        if (
            image.complete &&
            image.naturalWidth > 0
        ) {
            analyze();
        } else {
            image.addEventListener(
                "load",
                analyze,
                { once: true }
            );
        }
    }

    async analyzeImage(image) {
        try {
            if (
                !this.settings.enabled ||
                !image.isConnected
            ) {
                return;
            }

            const message = image.closest(
                KrynetBlurNSFW.MESSAGE_SELECTOR
            );

            if (!message) {
                return;
            }

            const result = await this.detectImage(image);

            if (!image.isConnected) {
                return;
            }

            this.results.set(image, {
                sensitive: Boolean(result?.sensitive),
                score: Number(result?.score) || 0
            });

            this.updateMessage(message);

        } catch (error) {
            console.warn(
                "[KrynetNSFW] Image analysis failed:",
                error
            );
        } finally {
            this.pending.delete(image);
        }
    }

    updateMessage(message) {
        const images = [
            ...message.querySelectorAll(
                KrynetBlurNSFW.IMAGE_SELECTOR
            )
        ];

        const shouldBlur = images.some(image => {
            const result = this.results.get(image);

            return (
                result &&
                result.sensitive === true &&
                result.score >= this.settings.threshold
            );
        });

        this.apply(message, shouldBlur);
    }

    apply(message, shouldBlur) {
        if (!message) {
            return;
        }

        const blur =
            this.settings.enabled &&
            shouldBlur;

        message.classList.toggle(
            KrynetBlurNSFW.BLUR_CLASS,
            blur
        );

        message.dataset.krNsfw =
            blur ? "true" : "false";

        if (blur) {
            message.style.setProperty(
                KrynetBlurNSFW.CSS_VAR,
                `${this.settings.blurAmount}px`
            );
        } else {
            message.style.removeProperty(
                KrynetBlurNSFW.CSS_VAR
            );
        }
    }

    clearAllBlurs() {
        document
            .querySelectorAll(
                `.${KrynetBlurNSFW.BLUR_CLASS}`
            )
            .forEach(message => {
                this.apply(message, false);
            });
    }

    rescan() {
        this.pending = new WeakSet();
        this.results = new WeakMap();
        this.clearAllBlurs();
        this.scan();
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
    }
}

const instance = new KrynetBlurNSFW(10);

window.KrynetNSFW = instance;
