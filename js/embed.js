import { Reactions } from "./reactions.js";

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function style(element, styles) {
    Object.assign(element.style, styles);
}

function createElement(tag) {
    return document.createElement(tag);
}

const URL_REGEX =
    /https?:\/\/[^\s<>"']+?(?=[\s<>"']|$)/gi;

const NOEMBED_API =
    "https://noembed.com/embed";

const MAX_MEDIA_WIDTH =
    "400px";

const META_CACHE =
    new Map();

const processedMessages =
    new WeakSet();

/* ---------------------------------------------------------
   URL HELPERS
--------------------------------------------------------- */

function normalizeURL(value) {
    try {
        const url = new URL(value);

        if (
            url.protocol !== "http:" &&
            url.protocol !== "https:"
        ) {
            return null;
        }

        /*
         * Strip punctuation that commonly follows
         * URLs in normal chat messages.
         */
        url.href = url.href.replace(
            /[),.!?;:'"]+$/,
            ""
        );

        return url.href;
    } catch {
        return null;
    }
}

function getFilename(url) {
    try {
        const parsed = new URL(url);

        const pathname =
            decodeURIComponent(
                parsed.pathname
            );

        const name =
            pathname
                .split("/")
                .filter(Boolean)
                .pop();

        return (
            name ||
            parsed.hostname
        );
    } catch {
        return url;
    }
}

/* ---------------------------------------------------------
   YOUTUBE
--------------------------------------------------------- */

function getYouTubeId(value) {
    try {
        const url =
            new URL(value);

        const host =
            url.hostname.toLowerCase();

        /*
         * youtube.com/watch?v=...
         */
        if (
            host === "youtube.com" ||
            host === "www.youtube.com" ||
            host.endsWith(".youtube.com")
        ) {
            const videoId =
                url.searchParams.get("v");

            if (videoId) {
                return videoId;
            }

            /*
             * /shorts/VIDEO_ID
             */
            if (
                url.pathname.startsWith("/shorts/")
            ) {
                return url.pathname
                    .split("/")[2]
                    ?.split(/[?#]/)[0] || null;
            }

            /*
             * /embed/VIDEO_ID
             */
            if (
                url.pathname.startsWith("/embed/")
            ) {
                return url.pathname
                    .split("/")[2]
                    ?.split(/[?#]/)[0] || null;
            }
        }

        /*
         * youtu.be/VIDEO_ID
         */
        if (host === "youtu.be") {
            return url.pathname
                .split("/")
                .filter(Boolean)[0] || null;
        }

        return null;
    } catch {
        return null;
    }
}

function createYouTubePlayer(url) {
    const videoId =
        getYouTubeId(url);

    if (!videoId) {
        return null;
    }

    const wrapper =
        createElement("div");

    style(wrapper, {
        position: "relative",
        width: "100%",
        maxWidth: MAX_MEDIA_WIDTH,
        aspectRatio: "16 / 9",
        marginTop: "8px",
        overflow: "hidden",
        borderRadius: "6px",
        background: "#000"
    });

    const iframe =
        createElement("iframe");

    iframe.src =
        `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`;

    iframe.title =
        "YouTube video";

    iframe.loading =
        "lazy";

    iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

    iframe.allowFullscreen =
        true;

    iframe.referrerPolicy =
        "strict-origin-when-cross-origin";

    style(iframe, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0"
    });

    wrapper.appendChild(
        iframe
    );

    return wrapper;
}

/* ---------------------------------------------------------
   NETWORK
--------------------------------------------------------- */

async function getMime(url) {
    try {
        const response =
            await fetch(url, {
                method: "GET",
                headers: {
                    Range: "bytes=0-0"
                }
            });

        return (
            response.headers.get(
                "content-type"
            ) || ""
        ).toLowerCase();
    } catch {
        return "";
    }
}

async function getMeta(url) {
    try {
        const endpoint =
            `${NOEMBED_API}?url=${encodeURIComponent(url)}`;

        const response =
            await fetch(endpoint);

        if (!response.ok) {
            return {};
        }

        const data =
            await response.json();

        if (
            !data ||
            typeof data !== "object"
        ) {
            return {};
        }

        return data;
    } catch {
        return {};
    }
}

async function getEmbedData(url) {
    const cached =
        META_CACHE.get(url);

    if (cached) {
        return cached;
    }

    const request =
        Promise.all([
            getMeta(url),
            getMime(url)
        ]).then(
            ([meta, mime]) => ({
                meta,
                mime
            })
        );

    META_CACHE.set(
        url,
        request
    );

    return request;
}

/* ---------------------------------------------------------
   MEDIA
--------------------------------------------------------- */

function applyMediaStyle(element) {
    style(element, {
        maxWidth: MAX_MEDIA_WIDTH,
        width: "100%",
        borderRadius: "6px",
        marginTop: "8px",
        display: "block"
    });
}

function createImage(url, alt) {
    const image =
        createElement("img");

    image.src = url;
    image.alt = alt || "Embedded image";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    applyMediaStyle(
        image
    );

    return image;
}

function createVideo(url) {
    const video =
        createElement("video");

    video.src = url;
    video.controls = true;
    video.preload = "metadata";

    applyMediaStyle(
        video
    );

    return video;
}

function createAudio(url) {
    const audio =
        createElement("audio");

    audio.src = url;
    audio.controls = true;
    audio.preload = "metadata";

    style(audio, {
        width: "100%",
        marginTop: "8px"
    });

    return audio;
}

function createPDF(url) {
    const frame =
        createElement("iframe");

    frame.src = url;
    frame.loading = "lazy";
    frame.title = "PDF document";
    frame.referrerPolicy = "no-referrer";

    style(frame, {
        width: "100%",
        height: "400px",
        border: "0",
        borderRadius: "6px",
        marginTop: "8px"
    });

    return frame;
}

/* ---------------------------------------------------------
   GENERIC MEDIA
--------------------------------------------------------- */

function createMedia(
    url,
    mime,
    meta
) {
    /*
     * YouTube gets a real player instead of
     * just a thumbnail.
     */
    const youtube =
        createYouTubePlayer(url);

    if (youtube) {
        return youtube;
    }

    /*
     * Prefer a thumbnail for websites that
     * provide one through noembed.
     */
    if (meta.thumbnail_url) {
        return createImage(
            meta.thumbnail_url,
            meta.title || "Embedded media"
        );
    }

    if (
        mime.startsWith("image/")
    ) {
        return createImage(
            url,
            getFilename(url)
        );
    }

    if (
        mime.startsWith("video/")
    ) {
        return createVideo(url);
    }

    if (
        mime.startsWith("audio/")
    ) {
        return createAudio(url);
    }

    if (
        mime === "application/pdf"
    ) {
        return createPDF(url);
    }

    /*
     * Generic file.
     */
    const file =
        createElement("div");

    file.textContent =
        `📎 ${getFilename(url)}`;

    style(file, {
        background: "#202225",
        padding: "10px",
        borderRadius: "6px",
        marginTop: "8px",
        fontSize: "13px",
        color: "#dcddde"
    });

    return file;
}

/* ---------------------------------------------------------
   WEBSITE EMBED
--------------------------------------------------------- */

function createWebsiteBody(
    body,
    url,
    meta,
    mime
) {
    const media =
        createMedia(
            url,
            mime,
            meta
        );

    if (media) {
        body.appendChild(
            media
        );
    }
}

/* ---------------------------------------------------------
   EMBED CARD
--------------------------------------------------------- */

async function buildEmbed(url) {
    const {
        meta,
        mime
    } = await getEmbedData(url);

    const card =
        createElement("div");

    card.className =
        "kr-embed";

    style(card, {
        display: "flex",
        width: "100%",
        maxWidth: "480px",
        boxSizing: "border-box",
        background: "#2b2d31",
        borderRadius: "8px",
        marginTop: "8px",
        overflow: "hidden",
        fontFamily:
            "Inter, Arial, sans-serif"
    });

    /*
     * Discord-style accent.
     */
    const bar =
        createElement("div");

    style(bar, {
        width: "4px",
        flexShrink: "0",
        background: "#5865f2"
    });

    const body =
        createElement("div");

    style(body, {
        padding: "10px 12px",
        flex: "1",
        minWidth: "0",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column"
    });

    card.append(
        bar,
        body
    );

    /*
     * Provider.
     */
    if (meta.provider_name) {
        const provider =
            createElement("div");

        provider.textContent =
            meta.provider_name;

        style(provider, {
            fontSize: "11px",
            color: "#b5bac1",
            marginBottom: "3px"
        });

        body.appendChild(
            provider
        );
    }

    /*
     * Title.
     */
    const title =
        createElement("a");

    title.href = url;
    title.target = "_blank";
    title.rel =
        "noopener noreferrer";

    title.textContent =
        meta.title ||
        new URL(url).hostname;

    style(title, {
        color: "#00a8fc",
        fontWeight: "600",
        fontSize: "14px",
        lineHeight: "1.3",
        textDecoration: "none",
        overflowWrap: "anywhere"
    });

    body.appendChild(
        title
    );

    /*
     * Description.
     */
    if (
        meta.description &&
        !getYouTubeId(url)
    ) {
        const description =
            createElement("div");

        description.textContent =
            meta.description;

        style(description, {
            fontSize: "12px",
            color: "#dbdee1",
            lineHeight: "1.4",
            marginTop: "4px",
            overflowWrap: "anywhere"
        });

        body.appendChild(
            description
        );
    }

    /*
     * Actual media/player.
     */
    createWebsiteBody(
        body,
        url,
        meta,
        mime
    );

    /*
     * Reactions belong to the embed.
     */
    const reactions =
        createElement("div");

    reactions.className =
        "kr-embed-reactions";

    style(reactions, {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginTop: "8px"
    });

    body.appendChild(
        reactions
    );

    /*
     * Your reactions.js handles the UI.
     */
    if (
        typeof Reactions === "function"
    ) {
        new Reactions(
            reactions
        );
    }

    return card;
}

/* ---------------------------------------------------------
   LAZY EMBED
--------------------------------------------------------- */

function lazyEmbed(
    container,
    url
) {
    const placeholder =
        createElement("div");

    placeholder.className =
        "kr-embed-placeholder";

    style(placeholder, {
        minHeight: "8px",
        width: "100%"
    });

    container.appendChild(
        placeholder
    );

    if (
        typeof IntersectionObserver ===
        "undefined"
    ) {
        void loadEmbed(
            placeholder,
            url
        );

        return;
    }

    const observer =
        new IntersectionObserver(
            entries => {
                const entry =
                    entries[0];

                if (
                    !entry?.isIntersecting
                ) {
                    return;
                }

                observer.disconnect();

                void loadEmbed(
                    placeholder,
                    url
                );
            },
            {
                rootMargin: "300px"
            }
        );

    observer.observe(
        placeholder
    );
}

async function loadEmbed(
    placeholder,
    url
) {
    try {
        const embed =
            await buildEmbed(url);

        if (
            !placeholder.isConnected
        ) {
            return;
        }

        placeholder.replaceWith(
            embed
        );
    } catch (error) {
        console.warn(
            "[Krynet Embed] Failed:",
            url,
            error
        );

        if (
            placeholder.isConnected
        ) {
            placeholder.remove();
        }
    }
}

/* ---------------------------------------------------------
   URL EXTRACTION
--------------------------------------------------------- */

function extractURLs(text) {
    const matches =
        text.match(URL_REGEX);

    if (!matches) {
        return [];
    }

    const unique =
        new Set();

    for (
        const match of matches
    ) {
        const url =
            normalizeURL(match);

        if (url) {
            unique.add(url);
        }
    }

    return Array.from(unique);
}

/* ---------------------------------------------------------
   MESSAGE PROCESSING
--------------------------------------------------------- */

function processMessage(message) {
    if (
        processedMessages.has(message)
    ) {
        return;
    }

    processedMessages.add(
        message
    );

    const text =
        message.innerText ||
        message.textContent ||
        "";

    const urls =
        extractURLs(text);

    if (!urls.length) {
        return;
    }

    /*
     * Prevent the same URL from being embedded
     * repeatedly if the message gets scanned again.
     */
    const existing =
        new Set(
            Array.from(
                message.querySelectorAll(
                    ".kr-embed[data-url]"
                )
            ).map(
                element =>
                    element.dataset.url
            )
        );

    for (
        const url of urls
    ) {
        if (existing.has(url)) {
            continue;
        }

        lazyEmbed(
            message,
            url
        );
    }
}

/* ---------------------------------------------------------
   MESSAGE OBSERVER
--------------------------------------------------------- */

function scanMessages(selector) {
    document
        .querySelectorAll(selector)
        .forEach(
            processMessage
        );
}

let observer = null;

function observeMessages(selector) {
    scanMessages(selector);

    if (observer) {
        observer.disconnect();
    }

    observer =
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
                        if (
                            !(node instanceof Element)
                        ) {
                            continue;
                        }

                        if (
                            node.matches?.(selector)
                        ) {
                            processMessage(
                                node
                            );
                        }

                        node
                            .querySelectorAll?.(
                                selector
                            )
                            .forEach(
                                processMessage
                            );
                    }
                }
            }
        );

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
}

/* ---------------------------------------------------------
   PUBLIC API
--------------------------------------------------------- */

export const Embed = {
    scanMessages,

    observeMessages
};
