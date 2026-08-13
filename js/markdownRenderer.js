import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { getHighlighter } from "https://cdn.jsdelivr.net/npm/shiki@0.12.0/dist/index.js";

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function escapeHtml(value) {
    return value.replace(
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

/* ---------------------------------------------------------
   CORE
--------------------------------------------------------- */

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

    /* -----------------------------------------------------
       CSS
    ----------------------------------------------------- */

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
                overflow-wrap: anywhere;
            }

            .kr-markdown pre {
                margin: 6px 0;
                overflow-x: auto;
            }

            .kr-codeblock {
                display: block;
                padding: 8px 12px;
                border-radius: 6px;
                font-family:
                    "Fira Code",
                    "Cascadia Code",
                    monospace;
                font-size: 14px;
                overflow-x: auto;
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
            }

            .kr-channel {
                color: #8ab4ff;
            }

            .kr-role {
                color: #f47fff;
            }

            .kr-emoji {
                width: 20px;
                height: 20px;
                object-fit: contain;
                vertical-align: middle;
            }

            .kr-time {
                color: #b9bbbe;
            }

            .kr-markdown blockquote {
                border-left:
                    3px solid #555;
                padding-left: 8px;
                color: #ccc;
            }

            .kr-markdown ul,
            .kr-markdown ol {
                padding-left: 20px;
            }

            .kr-markdown a {
                color: #4ea3ff;
                text-decoration: none;
            }

            .kr-markdown a:hover {
                text-decoration: underline;
            }

            .kr-markdown img {
                max-width: 100%;
                border-radius: 6px;
            }

            .kr-multiline-quote {
                border-left:
                    3px solid #555;
                margin: 0;
                padding-left: 8px;
                color: #ccc;
                white-space: pre-wrap;
            }
        `;

        document.head.appendChild(style);

        this.cssInjected = true;
    },

    /* -----------------------------------------------------
       INITIALIZATION
    ----------------------------------------------------- */

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

        /* Code blocks */

        renderer.code = (
            code,
            language
        ) => {
            try {
                const lang =
                    language?.trim() ||
                    "text";

                return this.highlighter.codeToHtml(
                    code,
                    {
                        lang
                    }
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

        /* Inline code */

        renderer.codespan = code => {
            return (
                `<code class="kr-inline">` +
                `${escapeHtml(code)}` +
                `</code>`
            );
        };

        /* Links */

        renderer.link = (
            href,
            title,
            text
        ) => {
            if (!href) {
                return text;
            }

            let safeURL;

            try {
                const url =
                    new URL(href);

                if (
                    url.protocol !== "http:" &&
                    url.protocol !== "https:" &&
                    url.protocol !== "mailto:"
                ) {
                    return text;
                }

                safeURL =
                    url.toString();
            } catch {
                return text;
            }

            const titleAttr =
                title
                    ? ` title="${escapeAttribute(
                          title
                      )}"`
                    : "";

            return (
                `<a href="${escapeAttribute(
                    safeURL
                )}"` +
                `${titleAttr}` +
                ` target="_blank"` +
                ` rel="noopener noreferrer">` +
                `${text}` +
                `</a>`
            );
        };

        /* Images */

        renderer.image = (
            href,
            title,
            text
        ) => {
            try {
                const url =
                    new URL(href);

                if (
                    url.protocol !== "http:" &&
                    url.protocol !== "https:"
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
                    `<img src="${escapeAttribute(
                        url.toString()
                    )}"` +
                    ` alt="${escapeAttribute(
                        text
                    )}"` +
                    `${titleAttr}` +
                    ` loading="lazy"` +
                    ` referrerpolicy="no-referrer">`
                );
            } catch {
                return "";
            }
        };

        this.renderer = renderer;

        marked.setOptions({
            renderer,
            gfm: true,
            breaks: true
        });

        this.initialized = true;
    },

    /* -----------------------------------------------------
       CACHE
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       ENTITY TRANSFORMS
    ----------------------------------------------------- */

    transformEntities(input) {
        let output =
            escapeHtml(input);

        /* Spoilers */

        output =
            output.replace(
                /\|\|(.+?)\|\|/g,
                (_, content) =>
                    `<span class="kr-spoiler" tabindex="0" role="button">${content}</span>`
            );

        /* User mentions */

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
                        )}"` +
                        `>@user</span>`;

                    this.ephemeralSet(
                        this.caches.mentions,
                        id,
                        value
                    );

                    return value;
                }
            );

        /* Channel mentions */

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
                        )}"` +
                        `>#channel</span>`;

                    this.ephemeralSet(
                        this.caches.channels,
                        id,
                        value
                    );

                    return value;
                }
            );

        /* Role mentions */

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
                        )}"` +
                        `>@role</span>`;

                    this.ephemeralSet(
                        this.caches.roles,
                        id,
                        value
                    );

                    return value;
                }
            );

        /* Custom emoji */

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
                        `https://cdn.discordapp.com/emojis/${encodeURIComponent(
                            id
                        )}.webp`;

                    const value =
                        `<img ` +
                        `class="kr-emoji" ` +
                        `src="${escapeAttribute(
                            src
                        )}"` +
                        `alt=":${escapeAttribute(
                            name
                        )}:"` +
                        `loading="lazy"` +
                        `referrerpolicy="no-referrer">`;

                    this.ephemeralSet(
                        this.caches.emojis,
                        id,
                        value
                    );

                    return value;
                }
            );

        /* Timestamp */

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

    /* -----------------------------------------------------
       SPOILER EVENTS
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       STREAM PARSER
    ----------------------------------------------------- */

    async *streamParse(markdown) {
        await this.init();

        const lines =
            markdown.split(/\r?\n/);

        let inQuote = false;

        const quoteBuffer = [];

        for (const line of lines) {
            /*
             * Discord-style multiline quote.
             */
            if (
                line.startsWith(">>>")
            ) {
                inQuote = true;

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
                        `<blockquote class="kr-multiline-quote">` +
                        `${quoteBuffer
                            .map(escapeHtml)
                            .join("<br>")}` +
                        `</blockquote>`
                    );

                    quoteBuffer.length = 0;
                    inQuote = false;

                    continue;
                }

                quoteBuffer.push(line);

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
                `<blockquote class="kr-multiline-quote">` +
                `${quoteBuffer
                    .map(escapeHtml)
                    .join("<br>")}` +
                `</blockquote>`
            );
        }
    },

    /* -----------------------------------------------------
       FINAL RENDER
    ----------------------------------------------------- */

    async render(markdown) {
        await this.init();

        let transformed = "";

        for await (
            const chunk of this.streamParse(
                markdown
            )
        ) {
            transformed +=
                chunk + "\n";
        }

        const html =
            marked.parse(
                transformed
            );

        return (
            `<div class="kr-markdown">` +
            html +
            `</div>`
        );
    },

    /* -----------------------------------------------------
       RENDER INTO DOM
    ----------------------------------------------------- */

    async renderInto(
        element,
        markdown
    ) {
        const html =
            await this.render(
                markdown
            );

        element.innerHTML =
            html;

        this.bindSpoilers(
            element
        );
    }
};
