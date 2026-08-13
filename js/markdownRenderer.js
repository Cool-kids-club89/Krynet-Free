import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { getHighlighter } from "https://cdn.jsdelivr.net/npm/shiki@0.12.0/dist/index.js";

"use strict";


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        character => {
            switch (character) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case '"':
                    return "&quot;";
                case "'":
                    return "&#39;";
                default:
                    return character;
            }
        }
    );
}


function escapeAttribute(value) {
    return escapeHtml(value);
}


function createTimeElement(timestamp, format) {
    const milliseconds =
        Number(timestamp) * 1000;

    const date =
        new Date(milliseconds);

    if (
        !Number.isFinite(milliseconds) ||
        Number.isNaN(date.getTime())
    ) {
        return escapeHtml(
            `<t:${timestamp}${format ? `:${format}` : ""}>`
        );
    }

    return (
        `<time class="kr-time" ` +
        `datetime="${escapeAttribute(
            date.toISOString()
        )}">` +
        `${escapeHtml(
            date.toLocaleString()
        )}` +
        `</time>`
    );
}


function isSafeURL(value, allowMailto = false) {
    try {
        const url =
            new URL(value);

        if (
            url.protocol === "http:" ||
            url.protocol === "https:"
        ) {
            return true;
        }

        return (
            allowMailto &&
            url.protocol === "mailto:"
        );

    } catch {
        return false;
    }
}


/* =========================================================
   CORE
========================================================= */

export const KrynetMarkdown = {

    highlighter: null,

    renderer: null,

    cssInjected: false,

    initialized: false,

    initPromise: null,

    cacheTTL: 5000,

    caches: {
        mentions: new Map(),
        roles: new Map(),
        channels: new Map(),
        emojis: new Map(),
        general: new Map()
    },


    /* =====================================================
       CSS
    ===================================================== */

    injectCSS() {
        if (this.cssInjected) {
            return;
        }

        const style =
            document.createElement("style");

        style.dataset.krynetMarkdown =
            "true";

        style.textContent = `
            .kr-markdown {
                min-width: 0;
                overflow-wrap: anywhere;
                color: #dbdee1;
            }

            .kr-markdown > :first-child {
                margin-top: 0;
            }

            .kr-markdown > :last-child {
                margin-bottom: 0;
            }

            .kr-markdown p {
                margin: 0 0 6px;
            }

            .kr-markdown p:last-child {
                margin-bottom: 0;
            }

            .kr-markdown strong {
                font-weight: 700;
            }

            .kr-markdown em {
                font-style: italic;
            }

            .kr-markdown del {
                text-decoration: line-through;
            }

            .kr-markdown h1,
            .kr-markdown h2,
            .kr-markdown h3,
            .kr-markdown h4,
            .kr-markdown h5,
            .kr-markdown h6 {
                margin: 10px 0 5px;
                color: #fff;
                line-height: 1.25;
            }

            .kr-markdown h1 {
                font-size: 24px;
            }

            .kr-markdown h2 {
                font-size: 20px;
            }

            .kr-markdown h3 {
                font-size: 18px;
            }

            .kr-markdown h4,
            .kr-markdown h5,
            .kr-markdown h6 {
                font-size: 16px;
            }

            .kr-markdown pre {
                margin: 7px 0;
                overflow-x: auto;
                border-radius: 7px;
            }

            .kr-codeblock {
                display: block;
                padding: 10px 12px;
                border-radius: 6px;
                font-family:
                    "Fira Code",
                    "Cascadia Code",
                    monospace;
                font-size: 13px;
                line-height: 1.5;
                overflow-x: auto;
            }

            .kr-markdown code:not(.kr-inline) {
                font-family:
                    "Fira Code",
                    "Cascadia Code",
                    monospace;
            }

            .kr-inline {
                background: #2a2e3f;
                padding: 2px 6px;
                border-radius: 4px;
                font-family:
                    "Fira Code",
                    "Cascadia Code",
                    monospace;
                font-size: 13px;
            }

            .kr-spoiler {
                background: #222;
                color: transparent;
                border-radius: 3px;
                padding: 0 4px;
                cursor: pointer;
                user-select: none;
            }

            .kr-spoiler.kr-revealed {
                color: inherit;
            }

            .kr-mention {
                color: #5b9dff;
                background:
                    rgba(88, 101, 242, 0.15);
                padding: 1px 4px;
                border-radius: 3px;
                cursor: pointer;
            }

            .kr-channel {
                color: #8ab4ff;
                cursor: pointer;
            }

            .kr-role {
                color: #f47fff;
                cursor: pointer;
            }

            .kr-emoji {
                width: 20px;
                height: 20px;
                object-fit: contain;
                vertical-align: middle;
            }

            .kr-time {
                color: #b9bbbe;
                font-size: 12px;
            }

            .kr-markdown blockquote {
                margin: 5px 0;
                border-left:
                    3px solid #555;
                padding-left: 9px;
                color: #ccc;
            }

            .kr-markdown ul,
            .kr-markdown ol {
                margin: 5px 0;
                padding-left: 22px;
            }

            .kr-markdown li {
                margin: 2px 0;
            }

            .kr-markdown a {
                color: #4ea3ff;
                text-decoration: none;
            }

            .kr-markdown a:hover {
                text-decoration: underline;
            }

            .kr-markdown img {
                display: block;
                max-width: 100%;
                max-height: 420px;
                margin: 6px 0;
                border-radius: 6px;
                object-fit: contain;
            }

            .kr-markdown hr {
                margin: 8px 0;
                border: 0;
                border-top:
                    1px solid #4b4d53;
            }

            .kr-multiline-quote {
                border-left:
                    3px solid #555;
                margin: 5px 0;
                padding-left: 8px;
                color: #ccc;
                white-space: pre-wrap;
            }

            .kr-markdown .kr-autolink {
                overflow-wrap: anywhere;
            }
        `;

        document.head.appendChild(style);

        this.cssInjected = true;
    },


    /* =====================================================
       INITIALIZATION
    ===================================================== */

    async init(theme = "nord") {
        if (this.initialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise =
            this.initialize(theme);

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    },


    async initialize(theme) {
        this.injectCSS();

        if (!this.highlighter) {
            this.highlighter =
                await getHighlighter({
                    theme
                });
        }

        const renderer =
            new marked.Renderer();


        /* -----------------------------------------------------
           CODE BLOCKS
        ----------------------------------------------------- */

        renderer.code = (
            code,
            language
        ) => {

            try {

                const lang =
                    language?.trim() ||
                    "text";

                return (
                    `<div class="kr-codeblock">` +
                    this.highlighter.codeToHtml(
                        code,
                        {
                            lang
                        }
                    ) +
                    `</div>`
                );

            } catch {

                return (
                    `<pre class="kr-codeblock">` +
                    `<code>` +
                    `${escapeHtml(code)}` +
                    `</code>` +
                    `</pre>`
                );
            }
        };


        /* -----------------------------------------------------
           INLINE CODE
        ----------------------------------------------------- */

        renderer.codespan = code => {
            return (
                `<code class="kr-inline">` +
                `${escapeHtml(code)}` +
                `</code>`
            );
        };


        /* -----------------------------------------------------
           LINKS
        ----------------------------------------------------- */

        renderer.link = (
            href,
            title,
            text
        ) => {

            if (
                !href ||
                !isSafeURL(href, true)
            ) {
                return text;
            }

            const titleAttr =
                title
                    ? ` title="${escapeAttribute(
                        title
                    )}"`
                    : "";

            return (
                `<a ` +
                `class="kr-autolink" ` +
                `href="${escapeAttribute(
                    href
                )}"` +
                `${titleAttr} ` +
                `target="_blank" ` +
                `rel="noopener noreferrer">` +
                `${text}` +
                `</a>`
            );
        };


        /* -----------------------------------------------------
           IMAGES
        ----------------------------------------------------- */

        renderer.image = (
            href,
            title,
            text
        ) => {

            if (
                !href ||
                !isSafeURL(href)
            ) {
                return "";
            }

            const titleAttr =
                title
                    ? ` title="${escapeAttribute(
                        title
                    )}"`
                    : "";

            return (
                `<img ` +
                `src="${escapeAttribute(
                    href
                )}"` +
                `alt="${escapeAttribute(
                    text || ""
                )}"` +
                `${titleAttr}` +
                ` loading="lazy"` +
                ` referrerpolicy="no-referrer">`
            );
        };


        /* -----------------------------------------------------
           RAW HTML
        ----------------------------------------------------- */

        renderer.html = () => {
            return "";
        };


        this.renderer =
            renderer;


        marked.setOptions({
            renderer,
            gfm: true,
            breaks: true,
            headerIds: false,
            mangle: false
        });

        this.initialized =
            true;
    },


    /* =====================================================
       CACHE
    ===================================================== */

    ephemeralSet(
        cache,
        key,
        value
    ) {
        cache.set(
            key,
            value
        );

        window.setTimeout(
            () => {

                if (
                    cache.get(key) ===
                    value
                ) {
                    cache.delete(key);
                }

            },
            this.cacheTTL
        );
    },


    /* =====================================================
       ENTITY TRANSFORMS
    ===================================================== */

    transformEntities(input) {

        /*
         * Escape first.
         *
         * This means user-supplied HTML cannot become
         * executable HTML later.
         */

        let output =
            escapeHtml(input);


        /* -------------------------------------------------
           SPOILERS
        ------------------------------------------------- */

        output =
            output.replace(
                /\|\|([\s\S]+?)\|\|/g,
                (_, content) => (
                    `<span ` +
                    `class="kr-spoiler" ` +
                    `tabindex="0" ` +
                    `role="button">` +
                    `${content}` +
                    `</span>`
                )
            );


        /* -------------------------------------------------
           USER MENTIONS
        ------------------------------------------------- */

        output =
            output.replace(
                /&lt;@!?(\d+)&gt;/g,
                (_, id) => {

                    const cached =
                        this.caches
                            .mentions
                            .get(id);

                    if (cached) {
                        return cached;
                    }

                    const value =
                        `<span ` +
                        `class="kr-mention" ` +
                        `data-user="${escapeAttribute(
                            id
                        )}">` +
                        `@user` +
                        `</span>`;

                    this.ephemeralSet(
                        this.caches.mentions,
                        id,
                        value
                    );

                    return value;
                }
            );


        /* -------------------------------------------------
           CHANNEL MENTIONS
        ------------------------------------------------- */

        output =
            output.replace(
                /&lt;#(\d+)&gt;/g,
                (_, id) => {

                    const cached =
                        this.caches
                            .channels
                            .get(id);

                    if (cached) {
                        return cached;
                    }

                    const value =
                        `<span ` +
                        `class="kr-channel" ` +
                        `data-channel="${escapeAttribute(
                            id
                        )}">` +
                        `#channel` +
                        `</span>`;

                    this.ephemeralSet(
                        this.caches.channels,
                        id,
                        value
                    );

                    return value;
                }
            );


        /* -------------------------------------------------
           ROLE MENTIONS
        ------------------------------------------------- */

        output =
            output.replace(
                /&lt;@&amp;(\d+)&gt;/g,
                (_, id) => {

                    const cached =
                        this.caches
                            .roles
                            .get(id);

                    if (cached) {
                        return cached;
                    }

                    const value =
                        `<span ` +
                        `class="kr-role" ` +
                        `data-role="${escapeAttribute(
                            id
                        )}">` +
                        `@role` +
                        `</span>`;

                    this.ephemeralSet(
                        this.caches.roles,
                        id,
                        value
                    );

                    return value;
                }
            );


        /* -------------------------------------------------
           CUSTOM EMOJI
        ------------------------------------------------- */

        output =
            output.replace(
                /&lt;a?:([a-zA-Z0-9_]+):(\d+)&gt;/g,
                (_, name, id) => {

                    const cached =
                        this.caches
                            .emojis
                            .get(id);

                    if (cached) {
                        return cached;
                    }

                    const src =
                        `https://cdn.discordapp.com/emojis/` +
                        `${encodeURIComponent(id)}.webp`;

                    const value =
                        `<img ` +
                        `class="kr-emoji" ` +
                        `src="${escapeAttribute(
                            src
                        )}" ` +
                        `alt=":${escapeAttribute(
                            name
                        )}:" ` +
                        `loading="lazy" ` +
                        `referrerpolicy="no-referrer">`;

                    this.ephemeralSet(
                        this.caches.emojis,
                        id,
                        value
                    );

                    return value;
                }
            );


        /* -------------------------------------------------
           TIMESTAMPS
        ------------------------------------------------- */

        output =
            output.replace(
                /&lt;t:(\d+)(?::([a-zA-Z]))?&gt;/g,
                (_, timestamp, format) =>
                    createTimeElement(
                        timestamp,
                        format
                    )
            );


        return output;
    },


    /* =====================================================
       SPOILERS
    ===================================================== */

    bindSpoilers(root) {

        root
            .querySelectorAll(
                ".kr-spoiler"
            )
            .forEach(spoiler => {

                if (
                    spoiler.dataset.bound ===
                    "true"
                ) {
                    return;
                }

                spoiler.dataset.bound =
                    "true";


                const reveal = () => {
                    spoiler.classList.toggle(
                        "kr-revealed"
                    );
                };


                spoiler.addEventListener(
                    "click",
                    reveal
                );


                spoiler.addEventListener(
                    "keydown",
                    event => {

                        if (
                            event.key === "Enter" ||
                            event.key === " "
                        ) {

                            event.preventDefault();

                            reveal();
                        }
                    }
                );
            });
    },


    /* =====================================================
       MESSAGE URL DETECTION
    ===================================================== */

    isStandaloneURL(markdown) {

        const value =
            String(markdown)
                .trim();

        if (!value) {
            return false;
        }

        try {

            const url =
                new URL(value);

            return (
                url.protocol === "http:" ||
                url.protocol === "https:"
            );

        } catch {
            return false;
        }
    },


    /* =====================================================
       STREAM PARSER
    ===================================================== */

    async *streamParse(markdown) {

        await this.init();

        const lines =
            String(markdown)
                .split(/\r?\n/);

        let inQuote =
            false;

        const quoteBuffer =
            [];


        for (const line of lines) {

            /* -------------------------------------------------
               DISCORD MULTILINE QUOTE
            ------------------------------------------------- */

            if (
                line.startsWith(">>>")
            ) {

                inQuote =
                    true;

                quoteBuffer.push(
                    line
                        .slice(3)
                        .trimStart()
                );

                continue;
            }


            if (inQuote) {

                if (
                    line.trim() === ""
                ) {

                    yield (
                        `<blockquote ` +
                        `class="kr-multiline-quote">` +
                        `${quoteBuffer
                            .map(escapeHtml)
                            .join("<br>")}` +
                        `</blockquote>`
                    );

                    quoteBuffer.length =
                        0;

                    inQuote =
                        false;

                    continue;
                }

                quoteBuffer.push(
                    line
                );

                continue;
            }


            if (line.length === 0) {
                yield "";
                continue;
            }


            yield this.transformEntities(
                line
            );
        }


        if (quoteBuffer.length) {

            yield (
                `<blockquote ` +
                `class="kr-multiline-quote">` +
                `${quoteBuffer
                    .map(escapeHtml)
                    .join("<br>")}` +
                `</blockquote>`
            );
        }
    },


    /* =====================================================
       FINAL RENDER
    ===================================================== */

    async render(markdown) {

        await this.init();

        let transformed =
            "";

        for await (
            const chunk
            of this.streamParse(markdown)
        ) {

            transformed +=
                chunk + "\n";
        }


        return (
            `<div class="kr-markdown">` +
            marked.parse(
                transformed
            ) +
            `</div>`
        );
    },


    /* =====================================================
       RENDER INTO MESSAGE
    ===================================================== */

    async renderInto(
        element,
        markdown
    ) {

        if (!element) {
            return;
        }

        const html =
            await this.render(
                markdown
            );

        element.innerHTML =
            html;

        this.bindSpoilers(
            element
        );
    },


    /* =====================================================
       RENDER ALL MESSAGE TEXT
    ===================================================== */

    async renderMessages(
        root = document
    ) {

        const elements =
            root.querySelectorAll(
                ".message-text"
            );

        await Promise.all(
            [...elements].map(
                async element => {

                    if (
                        element.dataset
                            .markdownRendered ===
                        "true"
                    ) {
                        return;
                    }

                    const markdown =
                        element.dataset
                            .markdownSource ??
                        element.textContent ??
                        "";

                    element.dataset
                        .markdownRendered =
                        "true";

                    element.dataset
                        .markdownSource =
                        markdown;

                    await this.renderInto(
                        element,
                        markdown
                    );
                }
            )
        );
    }
};
