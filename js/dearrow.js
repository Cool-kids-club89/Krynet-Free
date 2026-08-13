(() => {
    "use strict";

    const LICENSE = "FR3Lo-e986a";

    const BRANDING_API =
        "https://sponsor.ajay.app/api/branding";

    const THUMBNAIL_API =
        "https://dearrow-thumb.ajay.app/api/v1/getThumbnail";

    /* ---------------------------------------------------------
       YOUTUBE ID
    --------------------------------------------------------- */

    function extractYouTubeID(value) {
        try {
            const url = new URL(value);

            const host = url.hostname
                .toLowerCase()
                .replace(/^www\./, "");

            /* youtu.be/<id> */
            if (host === "youtu.be") {
                return normalizeID(
                    url.pathname.slice(1)
                );
            }

            /* youtube.com */
            if (
                host === "youtube.com" ||
                host === "youtube-nocookie.com"
            ) {
                const parts = url.pathname
                    .split("/")
                    .filter(Boolean);

                if (parts[0] === "watch") {
                    return normalizeID(
                        url.searchParams.get("v")
                    );
                }

                if (
                    parts[0] === "embed" ||
                    parts[0] === "shorts"
                ) {
                    return normalizeID(
                        parts[1]
                    );
                }
            }

            /*
             * Piped / Invidious style URLs.
             */
            const videoID =
                url.searchParams.get("v");

            if (videoID) {
                return normalizeID(videoID);
            }
        } catch {
            // Not a valid URL.
        }

        /*
         * Some embed systems store a bare YouTube URL.
         */
        const match = value.match(
            /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/
        );

        return match
            ? match[1]
            : null;
    }

    function normalizeID(value) {
        if (!value) {
            return null;
        }

        return /^[a-zA-Z0-9_-]{11}$/.test(value)
            ? value
            : null;
    }

    /* ---------------------------------------------------------
       API
    --------------------------------------------------------- */

    async function fetchBranding(id) {
        const params = new URLSearchParams({
            videoID: id,
            license: LICENSE
        });

        try {
            const response = await fetch(
                `${BRANDING_API}?${params}`,
                {
                    method: "GET",
                    cache: "force-cache"
                }
            );

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

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

    /* ---------------------------------------------------------
       ELEMENT HELPERS
    --------------------------------------------------------- */

    function findTitle(container) {
        return (
            container.querySelector(
                "[data-embed-title]"
            ) ||
            container.querySelector(
                ".embed-title"
            )
        );
    }

    function findThumbnail(container) {
        return (
            container.querySelector(
                "[data-embed-thumbnail]"
            ) ||
            container.querySelector(
                ".embed-thumbnail"
            )
        );
    }

    function findMediaURL(container) {
        const iframe =
            container.querySelector("iframe");

        if (iframe?.src) {
            return iframe.src;
        }

        const video =
            container.querySelector("video");

        if (video?.src) {
            return video.src;
        }

        return null;
    }

    /* ---------------------------------------------------------
       DATA SELECTION
    --------------------------------------------------------- */

    function selectTitle(data) {
        if (!data.titles?.length) {
            return null;
        }

        const candidates =
            data.titles
                .filter(item =>
                    typeof item.title === "string" &&
                    item.title.trim().length > 0
                )
                .sort(
                    (a, b) =>
                        b.votes - a.votes
                );

        if (!candidates.length) {
            return null;
        }

        /*
         * Remove only DeArrow's leading `>` marker.
         */
        return candidates[0].title
            .replace(
                /(^|\s)>(?=\S)/g,
                "$1"
            )
            .trim();
    }

    function selectThumbnail(data) {
        if (!data.thumbnails?.length) {
            return null;
        }

        const candidates =
            data.thumbnails
                .filter(item =>
                    Number.isFinite(
                        item.timestamp
                    ) &&
                    item.timestamp >= 0 &&
                    Number.isFinite(
                        item.votes
                    ) &&
                    !item.original
                )
                .sort(
                    (a, b) =>
                        b.votes - a.votes
                );

        return candidates[0] ?? null;
    }

    function buildThumbnailURL(
        id,
        thumbnail
    ) {
        const params = new URLSearchParams({
            videoID: id,
            time: String(
                thumbnail.timestamp
            ),
            license: LICENSE
        });

        return `${THUMBNAIL_API}?${params}`;
    }

    /* ---------------------------------------------------------
       APPLY
    --------------------------------------------------------- */

    function applyState(
        titleEl,
        thumbEl,
        state
    ) {
        if (
            titleEl &&
            state.title !== null
        ) {
            titleEl.textContent =
                state.title;
        }

        if (
            thumbEl &&
            state.thumbnail !== null
        ) {
            thumbEl.src =
                state.thumbnail;
        }
    }

    /* ---------------------------------------------------------
       BUTTON
    --------------------------------------------------------- */

    function createToggleButton(
        container,
        original,
        deArrow,
        titleEl,
        thumbEl
    ) {
        if (
            container.querySelector(
                ".kr-dearrow-toggle"
            )
        ) {
            return;
        }

        const button =
            document.createElement("button");

        button.type = "button";
        button.className =
            "kr-dearrow-toggle";

        button.textContent = "DeArrow";

        button.setAttribute(
            "aria-pressed",
            "true"
        );

        button.title =
            "Toggle DeArrow title and thumbnail";

        Object.assign(button.style, {
            position: "absolute",
            top: "6px",
            right: "6px",
            zIndex: "10",
            padding: "3px 7px",
            border: "none",
            borderRadius: "6px",
            background: "#2f3136",
            color: "#fff",
            fontSize: "11px",
            lineHeight: "normal",
            cursor: "pointer"
        });

        let usingDeArrow = true;

        const update = () => {
            usingDeArrow = !usingDeArrow;

            if (usingDeArrow) {
                applyState(
                    titleEl,
                    thumbEl,
                    deArrow
                );

                button.textContent =
                    "DeArrow";

                button.setAttribute(
                    "aria-pressed",
                    "true"
                );
            } else {
                applyState(
                    titleEl,
                    thumbEl,
                    {
                        title: original.title,
                        thumbnail:
                            original.thumbnail
                    }
                );

                button.textContent =
                    "Original";

                button.setAttribute(
                    "aria-pressed",
                    "false"
                );
            }
        };

        button.addEventListener(
            "click",
            update
        );

        if (
            getComputedStyle(container)
                .position === "static"
        ) {
            container.style.position =
                "relative";
        }

        container.appendChild(button);
    }

    /* ---------------------------------------------------------
       PROCESS EMBED
    --------------------------------------------------------- */

    async function processEmbed(container) {
        if (
            container.__dearrowDone ||
            container.__dearrowProcessing
        ) {
            return;
        }

        const mediaURL =
            findMediaURL(container);

        if (!mediaURL) {
            return;
        }

        const id =
            extractYouTubeID(mediaURL);

        if (!id) {
            return;
        }

        container.__dearrowProcessing = true;

        try {
            const data =
                await fetchBranding(id);

            if (!data) {
                return;
            }

            const titleEl =
                findTitle(container);

            const thumbEl =
                findThumbnail(container);

            if (
                !titleEl &&
                !thumbEl
            ) {
                return;
            }

            const original = {
                title:
                    titleEl?.textContent ?? null,

                thumbnail:
                    thumbEl?.currentSrc ||
                    thumbEl?.src ||
                    null
            };

            const selectedTitle =
                selectTitle(data);

            const selectedThumbnail =
                selectThumbnail(data);

            const deArrow = {
                title: selectedTitle,

                thumbnail:
                    selectedThumbnail
                        ? buildThumbnailURL(
                              id,
                              selectedThumbnail
                          )
                        : null
            };

            if (
                !deArrow.title &&
                !deArrow.thumbnail
            ) {
                return;
            }

            applyState(
                titleEl,
                thumbEl,
                deArrow
            );

            createToggleButton(
                container,
                original,
                deArrow,
                titleEl,
                thumbEl
            );

            container.__dearrowDone = true;
        } finally {
            container.__dearrowProcessing =
                false;
        }
    }

    /* ---------------------------------------------------------
       FIND CONTAINERS
    --------------------------------------------------------- */

    function findContainer(element) {
        const container =
            element.closest(
                ".embed, .message, [data-embed]"
            );

        return container instanceof HTMLElement
            ? container
            : null;
    }

    function processNode(node) {
        if (!(node instanceof Element)) {
            return;
        }

        /*
         * The added node itself may be an iframe/video.
         */
        if (
            node.matches("iframe, video")
        ) {
            const container =
                findContainer(node);

            if (container) {
                void processEmbed(container);
            }
        }

        /*
         * Or it may contain newly-created embeds.
         */
        node
            .querySelectorAll("iframe, video")
            .forEach(media => {
                const container =
                    findContainer(media);

                if (container) {
                    void processEmbed(
                        container
                    );
                }
            });

        /*
         * Sometimes the embed container itself
         * is the added node.
         */
        if (
            node.matches(
                ".embed, .message, [data-embed]"
            )
        ) {
            void processEmbed(node);
        }
    }

    /* ---------------------------------------------------------
       INITIAL SCAN
    --------------------------------------------------------- */

    function scan() {
        document
            .querySelectorAll(
                "iframe, video"
            )
            .forEach(media => {
                const container =
                    findContainer(media);

                if (container) {
                    void processEmbed(
                        container
                    );
                }
            });
    }

    /* ---------------------------------------------------------
       OBSERVER
    --------------------------------------------------------- */

    const observer =
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (
                    const node
                    of mutation.addedNodes
                ) {
                    processNode(node);
                }
            }
        });

    /* ---------------------------------------------------------
       START
    --------------------------------------------------------- */

    function init() {
        if (!document.body) {
            return;
        }

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        scan();

        console.log(
            "[DeArrow] Initialized."
        );
    }

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }
})();
