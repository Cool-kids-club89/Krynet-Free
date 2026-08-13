(() => {
    "use strict";

    const LICENSE = "FR3Lo-e986a";

    const BRANDING_API =
        "https://sponsor.ajay.app/api/branding";

    const THUMBNAIL_API =
        "https://dearrow-thumb.ajay.app/api/v1/getThumbnail";


    /* =========================================================
       YOUTUBE ID
    ========================================================= */

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
                    url.pathname.slice(1)
                );
            }

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
                    return normalizeID(parts[1]);
                }
            }

            const videoID =
                url.searchParams.get("v");

            if (videoID) {
                return normalizeID(videoID);
            }

        } catch {
            // Not a valid URL.
        }

        const match = String(value).match(
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


    /* =========================================================
       API
    ========================================================= */

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
       EMBED HELPERS
    ========================================================= */

    function findYouTubeEmbed(media) {
        return media.closest(
            ".youtube-embed"
        );
    }


    function findIframe(container) {
        return container.querySelector(
            "iframe"
        );
    }


    function getVideoIDFromEmbed(container) {
        const iframe =
            findIframe(container);

        if (!iframe) {
            return null;
        }

        return extractYouTubeID(
            iframe.src
        );
    }


    /* =========================================================
       DATA SELECTION
    ========================================================= */

    function selectTitle(data) {
        if (!Array.isArray(data.titles)) {
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
        if (!Array.isArray(data.thumbnails)) {
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
                        Number(b.votes || 0) -
                        Number(a.votes || 0)
                );

        return candidates[0] || null;
    }


    function buildThumbnailURL(
        id,
        thumbnail
    ) {
        const params =
            new URLSearchParams({
                videoID: id,
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
       CREATE TITLE
    ========================================================= */

    function createTitle(container) {
        let title =
            container.querySelector(
                ".youtube-embed-title"
            );

        if (title) {
            return title;
        }

        title =
            document.createElement("div");

        title.className =
            "youtube-embed-title";

        Object.assign(title.style, {
            marginBottom: "8px",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: "600",
            lineHeight: "1.35",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
        });

        const body =
            container.querySelector(
                ".youtube-embed-body"
            );

        if (body) {
            body.prepend(title);
        }

        return title;
    }


    /* =========================================================
       CREATE THUMBNAIL
    ========================================================= */

    function createThumbnail(
        container,
        id
    ) {
        let thumbnail =
            container.querySelector(
                ".youtube-embed-thumbnail"
            );

        if (thumbnail) {
            return thumbnail;
        }

        thumbnail =
            document.createElement("img");

        thumbnail.className =
            "youtube-embed-thumbnail";

        thumbnail.alt =
            "YouTube thumbnail";

        thumbnail.loading =
            "lazy";

        thumbnail.src =
            `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

        Object.assign(thumbnail.style, {
            width: "100%",
            aspectRatio: "16 / 9",
            display: "block",
            marginBottom: "8px",
            borderRadius: "6px",
            objectFit: "cover"
        });

        const body =
            container.querySelector(
                ".youtube-embed-body"
            );

        if (body) {
            body.prepend(thumbnail);
        }

        return thumbnail;
    }


    /* =========================================================
       TOGGLE BUTTON
    ========================================================= */

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
            "Toggle DeArrow title and thumbnail";

        Object.assign(button.style, {
            position: "absolute",
            top: "6px",
            right: "6px",
            zIndex: "20",
            padding: "4px 8px",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: "6px",
            background: "#2f3136",
            color: "#fff",
            fontSize: "11px",
            lineHeight: "normal",
            cursor: "pointer"
        });

        let usingDeArrow = true;

        button.addEventListener(
            "click",
            () => {

                usingDeArrow =
                    !usingDeArrow;

                if (usingDeArrow) {

                    if (
                        titleEl &&
                        deArrow.title
                    ) {
                        titleEl.textContent =
                            deArrow.title;
                    }

                    if (
                        thumbEl &&
                        deArrow.thumbnail
                    ) {
                        thumbEl.src =
                            deArrow.thumbnail;
                    }

                    button.textContent =
                        "DeArrow";

                    button.setAttribute(
                        "aria-pressed",
                        "true"
                    );

                } else {

                    if (
                        titleEl &&
                        original.title
                    ) {
                        titleEl.textContent =
                            original.title;
                    }

                    if (
                        thumbEl &&
                        original.thumbnail
                    ) {
                        thumbEl.src =
                            original.thumbnail;
                    }

                    button.textContent =
                        "Original";

                    button.setAttribute(
                        "aria-pressed",
                        "false"
                    );
                }
            }
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


    /* =========================================================
       PROCESS KRYNET YOUTUBE EMBED
    ========================================================= */

    async function processEmbed(container) {
        if (
            container.__dearrowDone ||
            container.__dearrowProcessing
        ) {
            return;
        }

        const id =
            getVideoIDFromEmbed(container);

        if (!id) {
            return;
        }

        container.__dearrowProcessing =
            true;

        try {

            const data =
                await fetchBranding(id);

            if (!data) {
                return;
            }


            const iframe =
                findIframe(container);

            if (!iframe) {
                return;
            }


            const body =
                container.querySelector(
                    ".youtube-embed-body"
                );

            if (!body) {
                return;
            }


            /*
             * The Krynet embed originally has only
             * the player. We create the metadata
             * elements around it.
             */

            const titleEl =
                createTitle(container);

            const thumbEl =
                createThumbnail(
                    container,
                    id
                );


            /*
             * Original YouTube data.
             */

            const original = {
                title:
                    titleEl.textContent ||
                    `YouTube video ${id}`,

                thumbnail:
                    thumbEl.currentSrc ||
                    thumbEl.src ||
                    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
            };


            /*
             * DeArrow data.
             */

            const selectedTitle =
                selectTitle(data);

            const selectedThumbnail =
                selectThumbnail(data);


            const deArrow = {
                title:
                    selectedTitle,

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


            /*
             * Apply DeArrow.
             */

            if (
                deArrow.title
            ) {
                titleEl.textContent =
                    deArrow.title;
            }

            if (
                deArrow.thumbnail
            ) {
                thumbEl.src =
                    deArrow.thumbnail;
            }


            createToggleButton(
                container,
                original,
                deArrow,
                titleEl,
                thumbEl
            );


            container.__dearrowDone =
                true;

        } catch (error) {

            console.warn(
                "[DeArrow] Embed processing failed:",
                error
            );

        } finally {

            container.__dearrowProcessing =
                false;
        }
    }


    /* =========================================================
       FIND KRYNET EMBEDS
    ========================================================= */

    function processNode(node) {
        if (!(node instanceof Element)) {
            return;
        }


        if (
            node.matches(
                ".youtube-embed"
            )
        ) {
            void processEmbed(node);
        }


        node
            .querySelectorAll(
                ".youtube-embed"
            )
            .forEach(
                container => {
                    void processEmbed(
                        container
                    );
                }
            );
    }


    function scan() {
        document
            .querySelectorAll(
                ".youtube-embed"
            )
            .forEach(
                container => {
                    void processEmbed(
                        container
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
       START
    ========================================================= */

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
            "[DeArrow] Krynet YouTube integration initialized."
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

})();
