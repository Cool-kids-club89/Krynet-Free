"use strict";

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { getHighlighter } from "https://cdn.jsdelivr.net/npm/shiki@0.12.0/dist/index.js";

/* =========================================================
   KRYNET MARKDOWN
   Works with:

   #messages
   .message
   .message-content
   .message-text

   Designed to coexist with reactions.js and embeds.
========================================================= */

const KrynetMarkdown = {
    highlighter: null,
    renderer: null,
    initialized: false,
    initPromise: null,

    cacheTTL: 5000,

    caches: {
        mentions: new Map(),
        channels: new Map(),
        roles: new Map(),
        emojis: new Map()
    },

    /* =====================================================
       HELPERS
    ===================================================== */

    escapeHtml(value) {
        return String(value).replace(
            /[&<>"']/g,
            character => {
                const entities = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                };

                return entities[character];
            }
        );
    },

    escapeAttribute(value) {
        return this.escapeHtml(value);
    },

    isSafeURL(value, allowMailto = false) {
        try {
            const url = new URL(value);

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
    },

    /* =====================================================
       CSS
    ===================================================== */

    injectCSS() {
        if (document.getElementById("krynet-markdown-style")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "krynet-markdown-style";

        style.textContent = `
            .message-text {
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .kr-markdown {
                min-width: 0;
                overflow-wrap: anywhere;
                color: inherit;
                line-height: 1.45;
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
                color: inherit;
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
                border-radius: 7px;
                overflow-x: auto;
                font-family:
                    "Fira Code",
                    "Cascadia Code",
                    monospace;
                font-size: 13px;
                line-height: 1.5;
            }

            .kr-inline {
                background: rgba(0, 0, 0, .18);
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
                border-radius: 4px;
                padding: 0 4px;
                cursor: pointer;
                user-select: none;
            }

            .kr-spoiler.kr-revealed {
                color: inherit;
            }

            .kr-mention {
                color: #7aa2ff;
                background: rgba(88, 101, 242, .15);
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
                margin: 6px 0;
                border-left: 3px solid #555;
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
                border-radius: 7px;
                object-fit: contain;
            }

            .kr-markdown hr {
                margin: 8px 0;
                border: 0;
                border-top: 1px solid rgba(255,255,255,.12);
            }

            .kr-multiline-quote {
                border-left: 3px solid #555;
                margin: 6px 0;
                padding-left: 9px;
                color: #ccc;
                white-space: pre-wrap;
            }
        `;

        document.head.appendChild(style);
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

        this.initPromise = this.initialize(theme);

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    },

    async initialize(theme) {
        this.injectCSS();

        if (!this.highlighter) {
            this.highlighter = await getHighlighter({
                theme
            });
        }

        const renderer = new marked.Renderer();

        renderer.code = (code, language) => {
            try {
                const lang =
                    language?.trim() || "text";

                return `
                    <pre class="kr-codeblock">
                        ${this.highlighter.codeToHtml(code, {
                            lang
                        })}
                    </pre>
                `;
            } catch {
                return `
                    <pre class="kr-codeblock">
                        <code>${this.escapeHtml(code)}</code>
                    </pre>
                `;
            }
        };

        renderer.codespan = code => {
            return `
                <code class="kr-inline">
                    ${this.escapeHtml(code)}
                </code>
            `;
        };

        renderer.link = (
            href,
            title,
            text
        ) => {
            if (
                !href ||
                !this.isSafeURL(href, true)
            ) {
                return text;
            }

            const titleAttr = title
                ? ` title="${this.escapeAttribute(title)}"`
                : "";

            return `
                <a
                    class="kr-autolink"
                    href="${this.escapeAttribute(href)}"
                    ${titleAttr}
                    target="_blank"
                    rel="noopener noreferrer"
                >${text}</a>
            `;
        };

        renderer.image = (
            href,
            title,
            text
        ) => {
            if (
                !href ||
                !this.isSafeURL(href)
            ) {
                return "";
            }

            const titleAttr = title
                ? ` title="${this.escapeAttribute(title)}"`
                : "";

            return `
                <img
                    class="kr-markdown-image"
                    src="${this.escapeAttribute(href)}"
                    alt="${this.escapeAttribute(text || "")}"
                    ${titleAttr}
                    loading="lazy"
                    referrerpolicy="no-referrer"
                >
            `;
        };

        /*
         * Never allow raw HTML from chat messages.
         */
        renderer.html = () => "";

        this.renderer = renderer;

        marked.setOptions({
            renderer,
            gfm: true,
            breaks: true,
            headerIds: false,
            mangle: false
        });

        this.initialized = true;
    },

    /* =====================================================
       CACHE
    ===================================================== */

    cache(cache, key, value) {
        cache.set(key, value);

        setTimeout(() => {
            if (cache.get(key) === value) {
                cache.delete(key);
            }
        }, this.cacheTTL);
    },

    /* =====================================================
       ENTITY PARSING
    ===================================================== */

    transformEntities(input) {
        let output = this.escapeHtml(input);

        /*
         * Spoilers
         */
        output = output.replace(
            /\|\|([\s\S]+?)\|\|/g,
            (_, content) => `
                <span
                    class="kr-spoiler"
                    tabindex="0"
                    role="button"
                    aria-label="Spoiler"
                >${content}</span>
            `
        );

        /*
         * User mention
         *
         * <@123>
         * <@!123>
         */
        output = output.replace(
            /&lt;@!?(\d+)&gt;/g,
            (_, id) => {
                const cached =
                    this.caches.mentions.get(id);

                if (cached) {
                    return cached;
                }

                const value = `
                    <span
                        class="kr-mention"
                        data-user="${this.escapeAttribute(id)}"
                    >@user</span>
                `;

                this.cache(
                    this.caches.mentions,
                    id,
                    value
                );

                return value;
            }
        );

        /*
         * Channel mention
         *
         * <#123>
         */
        output = output.replace(
            /&lt;#(\d+)&gt;/g,
            (_, id) => {
                const cached =
                    this.caches.channels.get(id);

                if (cached) {
                    return cached;
                }

                const value = `
                    <span
                        class="kr-channel"
                        data-channel="${this.escapeAttribute(id)}"
                    >#channel</span>
                `;

                this.cache(
                    this.caches.channels,
                    id,
                    value
                );

                return value;
            }
        );

        /*
         * Role mention
         *
         * <@&123>
         */
        output = output.replace(
            /&lt;@&amp;(\d+)&gt;/g,
            (_, id) => {
                const cached =
                    this.caches.roles.get(id);

                if (cached) {
                    return cached;
                }

                const value = `
                    <span
                        class="kr-role"
                        data-role="${this.escapeAttribute(id)}"
                    >@role</span>
                `;

                this.cache(
                    this.caches.roles,
                    id,
                    value
                );

                return value;
            }
        );

        /*
         * Custom emoji
         *
         * <:name:id>
         * <a:name:id>
         */
        output = output.replace(
            /&lt;a?:([a-zA-Z0-9_]+):(\d+)&gt;/g,
            (_, name, id) => {
                const cached =
                    this.caches.emojis.get(id);

                if (cached) {
                    return cached;
                }

                const src =
                    `https://cdn.discordapp.com/emojis/` +
                    `${encodeURIComponent(id)}.webp`;

                const value = `
                    <img
                        class="kr-emoji"
                        src="${this.escapeAttribute(src)}"
                        alt=":${this.escapeAttribute(name)}:"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                    >
                `;

                this.cache(
                    this.caches.emojis,
                    id,
                    value
                );

                return value;
            }
        );

        /*
         * Timestamp
         *
         * <t:1234567890>
         */
        output = output.replace(
            /&lt;t:(\d+)(?::([a-zA-Z]))?&gt;/g,
            (_, timestamp) => {
                const milliseconds =
                    Number(timestamp) * 1000;

                const date =
                    new Date(milliseconds);

                if (
                    !Number.isFinite(milliseconds) ||
                    Number.isNaN(date.getTime())
                ) {
                    return this.escapeHtml(
                        `<t:${timestamp}>`
                    );
                }

                return `
                    <time
                        class="kr-time"
                        datetime="${this.escapeAttribute(
                            date.toISOString()
                        )}"
                    >${this.escapeHtml(
                        date.toLocaleString()
                    )}</time>
                `;
            }
        );

        return output;
    },

    /* =====================================================
       SPOILERS
    ===================================================== */

    bindSpoilers(root) {
        root
            .querySelectorAll(".kr-spoiler")
            .forEach(spoiler => {
                if (
                    spoiler.dataset.bound === "true"
                ) {
                    return;
                }

                spoiler.dataset.bound = "true";

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
       MULTILINE QUOTES
    ===================================================== */

    transformQuotes(markdown) {
        const lines =
            String(markdown).split(/\r?\n/);

        const output = [];

        let quoteLines = [];

        const flushQuote = () => {
            if (!quoteLines.length) {
                return;
            }

            output.push(
                `<blockquote class="kr-multiline-quote">` +
                `${quoteLines
                    .map(line => this.escapeHtml(line))
                    .join("<br>")}` +
                `</blockquote>`
            );

            quoteLines = [];
        };

        for (const line of lines) {
            if (line.startsWith(">>>")) {
                quoteLines.push(
                    line.slice(3).trimStart()
                );

                continue;
            }

            if (quoteLines.length) {
                if (!line.trim()) {
                    flushQuote();
                    output.push("");
                    continue;
                }

                quoteLines.push(line);
                continue;
            }

            output.push(
                this.transformEntities(line)
            );
        }

        flushQuote();

        return output.join("\n");
    },

    /* =====================================================
       RENDER
    ===================================================== */

    async render(markdown) {
        await this.init();

        const transformed =
            this.transformQuotes(markdown);

        return `
            <div class="kr-markdown">
                ${marked.parse(transformed)}
            </div>
        `;
    },

    /* =====================================================
       RENDER INTO ELEMENT
    ===================================================== */

    async renderInto(element, markdown) {
        if (!(element instanceof Element)) {
            return;
        }

        const html =
            await this.render(markdown);

        element.innerHTML = html;

        this.bindSpoilers(element);
    },

    /* =====================================================
       RENDER ONE MESSAGE
    ===================================================== */

    async renderMessage(message) {
        if (!(message instanceof Element)) {
            return;
        }

        if (
            !message.matches(".message")
        ) {
            return;
        }

        const text =
            message.querySelector(".message-text");

        if (!text) {
            return;
        }

        if (
            text.dataset.markdownRendered === "true"
        ) {
            return;
        }

        /*
         * Prefer the original source stored by
         * the chat UI.
         */
        const markdown =
            text.dataset.markdownSource ??
            text.textContent ??
            "";

        text.dataset.markdownSource =
            markdown;

        text.dataset.markdownRendered =
            "true";

        await this.renderInto(
            text,
            markdown
        );
    },

    /* =====================================================
       RENDER ALL MESSAGES
    ===================================================== */

    async renderMessages(root = document) {
        if (
            root instanceof Element &&
            root.matches(".message")
        ) {
            await this.renderMessage(root);
        }

        if (
            !root.querySelectorAll
        ) {
            return;
        }

        const messages =
            root.querySelectorAll(
                ".message"
            );

        for (const message of messages) {
            await this.renderMessage(message);
        }
    },

    /* =====================================================
       RESET MESSAGE
    ===================================================== */

    resetMessage(message) {
        if (!(message instanceof Element)) {
            return;
        }

        const text =
            message.querySelector(
                ".message-text"
            );

        if (!text) {
            return;
        }

        delete text.dataset.markdownRendered;
    },

    /* =====================================================
       OBSERVER
    ===================================================== */

    observe() {
        const container =
            document.querySelector("#messages");

        if (!container) {
            return;
        }

        if (
            container.dataset.markdownObserver ===
            "true"
        ) {
            return;
        }

        container.dataset.markdownObserver =
            "true";

        const observer =
            new MutationObserver(
                mutations => {
                    for (const mutation of mutations) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                !(node instanceof Element)
                            ) {
                                continue;
                            }

                            this.renderMessages(node);
                        }
                    }
                }
            );

        observer.observe(
            container,
            {
                childList: true,
                subtree: true
            }
        );
    },

    /* =====================================================
       INITIALIZE CHAT
    ===================================================== */

    async start() {
        await this.init();

        await this.renderMessages();

        this.observe();

        console.log(
            "[Krynet] Markdown initialized."
        );
    }
};

/* =========================================================
   START
========================================================= */

async function initializeMarkdown() {
    await KrynetMarkdown.start();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeMarkdown,
        { once: true }
    );
} else {
    initializeMarkdown();
}

export { KrynetMarkdown };
