(() => {
    "use strict";

    const LICENSE = "FR3Lo-e986a";

    const BRANDING_API =
        "https://sponsor.ajay.app/api/branding";

    const THUMBNAIL_API =
        "https://dearrow-thumb.ajay.app/api/v1/getThumbnail";

    const EMBED_SELECTOR = ".youtube-embed";

    /* =========================================================
       YOUTUBE ID
    ========================================================= */

    function normalizeID(value) {
        if (!value) {
            return null;
        }

        const id = String(value).trim();

        return /^[a-zA-Z0-9_-]{11}$/.test(id)
            ? id
            : null;
    }

    function extractYouTubeID(value) {
        if (!value) {
            return null;
        }

        try {
            const url = new URL(value);

            const host = url.hostname
                .toLowerCase()
                .replace(/^www\./, "");

            if (host === "youtu.be") {
                return normalizeID(
                    url.pathname
                        .split("/")
                        .filter(Boolean)[0]
                );
            }

            if (
                host === "youtube.com" ||
                host === "youtube-nocookie.com"
            ) {
                const parts =
                    url.pathname
                        .split("/")
                        .filter(Boolean);

                if (url.pathname === "/watch") {
                    return normalizeID(
                        url.searchParams.get("v")
                    );
                }

                if (
                    parts[0] === "embed" ||
                    parts[0] === "shorts"
                ) {
                    return normalizeID(parts[1]);
                }
            }

            return normalizeID(
                url.searchParams.get("v")
            );

        } catch {
            const match =
                String(value).match(
                    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/
                );

            return match
                ? normalizeID(match[1])
                : null;
        }
    }

    /* =========================================================
       API
    ========================================================= */

    async function fetchBranding(videoID) {
        const params =
            new URLSearchParams({
                videoID,
                license: LICENSE
            });

        try {
            const response =
                await fetch(
                    `${BRANDING_API}?${params}`,
                    {
                        method: "GET",
                        cache: "force-cache"
                    }
                );

            if (!response.ok) {
                return null;
            }

            const data =
                await response.json();

            if (
                !data ||
                typeof data !== "object"
            ) {
                return null;
            }

            return data;

        } catch (error) {
            console.warn(
                "[DeArrow] Branding request failed:",
                error
            );

            return null;
        }
    }

    /* =========================================================
       DATA
    ========================================================= */

    function selectTitle(data) {
        if (!Array.isArray(data?.titles)) {
            return null;
        }

        const candidates =
            data.titles
                .filter(item =>
                    typeof item?.title === "string" &&
                    item.title.trim()
                )
                .sort(
                    (a, b) =>
                        Number(b.votes || 0) -
                        Number(a.votes || 0)
                );

        if (!candidates.length) {
            return null;
        }

        return candidates[0].title
            .replace(
                /(^|\s)>(?=\S)/g,
                "$1"
            )
            .trim();
    }

    function selectThumbnail(data) {
        if (!Array.isArray(data?.thumbnails)) {
            return null;
        }

        const candidates =
            data.thumbnails
                .filter(item =>
                    Number.isFinite(
                        Number(item?.timestamp)
                    ) &&
                    Number(item.timestamp) >= 0 &&
                    Number.isFinite(
                        Number(item?.votes)
                    ) &&
                    !item.original
                )
                .sort(
                    (a, b) =>
                        Number(b.votes || 0) -
                        Number(a.votes || 0)
                );

        return candidates[0] || null;
    }

    function buildThumbnailURL(
        videoID,
        thumbnail
    ) {
        const params =
            new URLSearchParams({
                videoID,
                time: String(
                    thumbnail.timestamp
                ),
                license: LICENSE
            });

        return (
            `${THUMBNAIL_API}?${params}`
        );
    }

    /* =========================================================
       EMBED HELPERS
    ========================================================= */

    function getIframe(container) {
        return container.querySelector(
            "iframe"
        );
    }

    function getVideoID(container) {
        const iframe =
            getIframe(container);

        if (!iframe) {
            return null;
        }

        return extractYouTubeID(
            iframe.src ||
            iframe.getAttribute("src")
        );
    }

    function getBody(container) {
        return container.querySelector(
            ".youtube-embed-body"
        );
    }

    /* =========================================================
       STYLES
    ========================================================= */

    function installStyles() {
        if (
            document.getElementById(
                "krynet-dearrow-style"
            )
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id =
            "krynet-dearrow-style";

        style.textContent = `
            .youtube-embed {
                position: relative;
            }

            .youtube-embed-body {
                min-width: 0;
            }

            .youtube-embed-title {
                margin-bottom: 8px;
                color: #ffffff;
                font-size: 14px;
                font-weight: 600;
                line-height: 1.35;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .youtube-embed-thumbnail {
                width: 100%;
                aspect-ratio: 16 / 9;
                display: block;
                margin-bottom: 8px;
                border-radius: 6px;
                object-fit: cover;
                background: #18191c;
            }

            .kr-dearrow-toggle {
                position: absolute;
                top: 6px;
                right: 6px;
                z-index: 20;
                padding: 4px 8px;
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 6px;
                background: #2f3136;
                color: #fff;
                font-size: 11px;
                line-height: normal;
                cursor: pointer;
            }

            .kr-dearrow-toggle:hover {
                background: #5865f2;
            }

            .kr-dearrow-toggle.original {
                background: #404249;
            }
        `;

        document.head.appendChild(style);
    }

    /* =========================================================
       ELEMENT CREATION
    ========================================================= */

    function createTitle(container) {
        let element =
            container.querySelector(
                ".youtube-embed-title"
            );

        if (element) {
            return element;
        }

        element =
            document.createElement("div");

        element.className =
            "youtube-embed-title";

        element.textContent =
            "YouTube video";

        const body =
            getBody(container);

        if (body) {
            body.prepend(element);
        }

        return element;
    }

    function createThumbnail(
        container,
        videoID
    ) {
        let image =
            container.querySelector(
                ".youtube-embed-thumbnail"
            );

        if (image) {
            return image;
        }

        image =
            document.createElement("img");

        image.className =
            "youtube-embed-thumbnail";

        image.alt =
            "YouTube thumbnail";

        image.loading =
            "lazy";

        image.src =
            `https://i.ytimg.com/vi/${encodeURIComponent(
                videoID
            )}/hqdefault.jpg`;

        const body =
            getBody(container);

        if (body) {
            body.prepend(image);
        }

        return image;
    }

    /* =========================================================
       TOGGLE
    ========================================================= */

    function createToggle(
        container,
        original,
        deArrow,
        titleElement,
        thumbnailElement
    ) {
        if (
            container.querySelector(
                ".kr-dearrow-toggle"
            )
        ) {
            return;
        }

        if (
            !deArrow.title &&
            !deArrow.thumbnail
        ) {
            return;
        }

        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "kr-dearrow-toggle";

        button.textContent =
            "DeArrow";

        button.setAttribute(
            "aria-pressed",
            "true"
        );

        button.title =
            "Toggle DeArrow metadata";

        let usingDeArrow = true;

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                usingDeArrow =
                    !usingDeArrow;

                if (usingDeArrow) {
                    if (
                        deArrow.title
                    ) {
                        titleElement.textContent =
                            deArrow.title;
                    }

                    if (
                        deArrow.thumbnail
                    ) {
                        thumbnailElement.src =
                            deArrow.thumbnail;
                    }

                    button.textContent =
                        "DeArrow";

                    button.classList.remove(
                        "original"
                    );

                    button.setAttribute(
                        "aria-pressed",
                        "true"
                    );

                    return;
                }

                titleElement.textContent =
                    original.title;

                thumbnailElement.src =
                    original.thumbnail;

                button.textContent =
                    "Original";

                button.classList.add(
                    "original"
                );

                button.setAttribute(
                    "aria-pressed",
                    "false"
                );
            }
        );

        container.appendChild(button);
    }

    /* =========================================================
       PROCESS EMBED
    ========================================================= */

    async function processEmbed(container) {
        if (
            !(container instanceof Element)
        ) {
            return;
        }

        if (
            container.__krynetDeArrowDone ||
            container.__krynetDeArrowLoading
        ) {
            return;
        }

        const iframe =
            getIframe(container);

        if (!iframe) {
            return;
        }

        const videoID =
            getVideoID(container);

        if (!videoID) {
            return;
        }

        container.__krynetDeArrowLoading =
            true;

        try {
            const titleElement =
                createTitle(container);

            const thumbnailElement =
                createThumbnail(
                    container,
                    videoID
                );

            const original = {
                title:
                    titleElement.textContent ||
                    `YouTube video ${videoID}`,

                thumbnail:
                    thumbnailElement.src ||
                    `https://i.ytimg.com/vi/${videoID}/hqdefault.jpg`
            };

            const data =
                await fetchBranding(
                    videoID
                );

            if (!data) {
                return;
            }

            const deArrowTitle =
                selectTitle(data);

            const deArrowThumbnail =
                selectThumbnail(data);

            const deArrow = {
                title:
                    deArrowTitle,

                thumbnail:
                    deArrowThumbnail
                        ? buildThumbnailURL(
                            videoID,
                            deArrowThumbnail
                        )
                        : null
            };

            if (
                !deArrow.title &&
                !deArrow.thumbnail
            ) {
                return;
            }

            if (deArrow.title) {
                titleElement.textContent =
                    deArrow.title;
            }

            if (deArrow.thumbnail) {
                thumbnailElement.src =
                    deArrow.thumbnail;
            }

            createToggle(
                container,
                original,
                deArrow,
                titleElement,
                thumbnailElement
            );

            container.__krynetDeArrowDone =
                true;

        } catch (error) {
            console.warn(
                "[DeArrow] Processing failed:",
                error
            );

        } finally {
            container.__krynetDeArrowLoading =
                false;
        }
    }

    /* =========================================================
       SCANNING
    ========================================================= */

    function processNode(node) {
        if (!(node instanceof Element)) {
            return;
        }

        if (
            node.matches(
                EMBED_SELECTOR
            )
        ) {
            void processEmbed(node);
        }

        node
            .querySelectorAll(
                EMBED_SELECTOR
            )
            .forEach(
                embed => {
                    void processEmbed(
                        embed
                    );
                }
            );
    }

    function scan() {
        document
            .querySelectorAll(
                EMBED_SELECTOR
            )
            .forEach(
                embed => {
                    void processEmbed(
                        embed
                    );
                }
            );
    }

    /* =========================================================
       OBSERVER
    ========================================================= */

    const observer =
        new MutationObserver(
            mutations => {
                for (
                    const mutation
                    of mutations
                ) {
                    for (
                        const node
                        of mutation.addedNodes
                    ) {
                        processNode(node);
                    }
                }
            }
        );

    /* =========================================================
       INIT
    ========================================================= */

    function init() {
        if (!document.body) {
            return;
        }

        installStyles();

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        scan();

        console.log(
            "[DeArrow] Krynet integration ready."
        );
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            {
                once: true
            }
        );
    } else {
        init();
    }

    /* =========================================================
       PUBLIC API
    ========================================================= */

    window.KrynetDeArrow = {
        scan,
        processEmbed
    };
})();
