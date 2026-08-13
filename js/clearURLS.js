(() => {
    "use strict";

    /* =========================================================
       KRYNET CLEAR URLS
       Cleans tracking parameters from URLs in:
       - Message text
       - #messageInput
       - Pasted text
       - Messages added dynamically
    ========================================================= */

    const RULES_URL =
        "https://raw.githubusercontent.com/ClearURLs/Rules/master/data.min.json";

    const MESSAGE_SELECTOR = ".message";
    const MESSAGE_TEXT_SELECTOR = ".message-text";
    const COMPOSER_SELECTOR = "#messageInput";
    const SEND_BUTTON_SELECTOR = "#sendButton";

    const URL_RE =
        /https?:\/\/[^\s<]+[^<.,:;"'>)\]\s]/gi;

    let rules = [];
    let rulesLoaded = false;
    let rulesLoading = null;
    let scanTimer = null;

    /* =========================================================
       REGEX HELPERS
    ========================================================= */

    function createRegex(pattern) {
        if (!pattern) {
            return null;
        }

        try {
            return new RegExp(pattern, "i");
        } catch (error) {
            console.warn(
                "[Krynet ClearURLs] Invalid rule:",
                pattern,
                error
            );

            return null;
        }
    }

    function createRegexList(patterns) {
        if (!Array.isArray(patterns)) {
            return [];
        }

        return patterns
            .map(createRegex)
            .filter(Boolean);
    }

    function regexTest(regex, value) {
        regex.lastIndex = 0;
        return regex.test(value);
    }

    /* =========================================================
       LOAD CLEARURLS RULES
    ========================================================= */

    async function loadRules() {
        if (rulesLoaded) {
            return;
        }

        if (rulesLoading) {
            return rulesLoading;
        }

        rulesLoading = (async () => {
            try {
                const response = await fetch(
                    RULES_URL,
                    {
                        cache: "no-cache"
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                const data =
                    await response.json();

                if (
                    !data ||
                    !data.providers ||
                    typeof data.providers !== "object"
                ) {
                    throw new Error(
                        "Invalid ClearURLs rules format"
                    );
                }

                const loadedRules = [];

                for (
                    const [name, provider]
                    of Object.entries(data.providers)
                ) {
                    const urlPattern =
                        createRegex(
                            provider.urlPattern
                        );

                    if (!urlPattern) {
                        continue;
                    }

                    loadedRules.push({
                        name,

                        urlPattern,

                        rules:
                            createRegexList(
                                provider.rules
                            ),

                        rawRules:
                            createRegexList(
                                provider.rawRules
                            ),

                        exceptions:
                            createRegexList(
                                provider.exceptions
                            )
                    });
                }

                rules = loadedRules;
                rulesLoaded = true;

                console.log(
                    `[Krynet ClearURLs] Loaded ${rules.length} providers.`
                );
            } catch (error) {
                console.error(
                    "[Krynet ClearURLs] Failed to load rules:",
                    error
                );
            } finally {
                rulesLoading = null;
            }
        })();

        return rulesLoading;
    }

    /* =========================================================
       CLEAN URL
    ========================================================= */

    function cleanUrl(href) {
        let url;

        try {
            url = new URL(href);
        } catch {
            return href;
        }

        if (!url.search) {
            return href;
        }

        let changed = false;

        for (const rule of rules) {
            if (
                !regexTest(
                    rule.urlPattern,
                    url.href
                )
            ) {
                continue;
            }

            const excepted =
                rule.exceptions.some(
                    exception =>
                        regexTest(
                            exception,
                            url.href
                        )
                );

            if (excepted) {
                continue;
            }

            /* -------------------------------------------------
               Query parameters
            ------------------------------------------------- */

            for (
                const key
                of Array.from(
                    url.searchParams.keys()
                )
            ) {
                const remove =
                    rule.rules.some(
                        regex =>
                            regexTest(
                                regex,
                                key
                            )
                    );

                if (!remove) {
                    continue;
                }

                url.searchParams.delete(key);
                changed = true;
            }

            /* -------------------------------------------------
               Raw URL rules
            ------------------------------------------------- */

            if (rule.rawRules.length) {
                let value =
                    url.toString();

                for (
                    const regex
                    of rule.rawRules
                ) {
                    const next =
                        value.replace(
                            regex,
                            ""
                        );

                    if (next !== value) {
                        value = next;
                        changed = true;
                    }
                }

                try {
                    url = new URL(value);
                } catch {
                    // Keep the last valid URL.
                }
            }
        }

        return changed
            ? url.toString()
            : href;
    }

    /* =========================================================
       CLEAN TEXT
    ========================================================= */

    function cleanText(text) {
        if (
            !text ||
            !rules.length
        ) {
            return text;
        }

        return text.replace(
            URL_RE,
            match => cleanUrl(match)
        );
    }

    /* =========================================================
       TEXT NODE CLEANING
    ========================================================= */

    function cleanTextNodes(element) {
        if (!element) {
            return;
        }

        const walker =
            document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT
            );

        const nodes = [];

        let node;

        while (
            (node = walker.nextNode())
        ) {
            if (
                node instanceof Text &&
                node.nodeValue
            ) {
                nodes.push(node);
            }
        }

        for (const textNode of nodes) {
            const original =
                textNode.nodeValue || "";

            const cleaned =
                cleanText(original);

            if (
                cleaned !== original
            ) {
                textNode.nodeValue =
                    cleaned;
            }
        }
    }

    /* =========================================================
       COMPOSER
    ========================================================= */

    function getComposer() {
        return document.querySelector(
            COMPOSER_SELECTOR
        );
    }

    function cleanComposer() {
        const composer =
            getComposer();

        if (!composer) {
            return;
        }

        if (
            composer instanceof
            HTMLTextAreaElement
        ) {
            const original =
                composer.value;

            const cleaned =
                cleanText(original);

            if (
                cleaned === original
            ) {
                return;
            }

            const start =
                composer.selectionStart;

            const end =
                composer.selectionEnd;

            composer.value =
                cleaned;

            try {
                composer.setSelectionRange(
                    Math.min(
                        start,
                        cleaned.length
                    ),
                    Math.min(
                        end,
                        cleaned.length
                    )
                );
            } catch {
                // Ignore selection errors.
            }

            return;
        }

        if (
            composer instanceof HTMLElement &&
            composer.isContentEditable
        ) {
            cleanTextNodes(composer);
        }
    }

    /* =========================================================
       MESSAGE CLEANING
    ========================================================= */

    function cleanMessage(message) {
        if (!(message instanceof Element)) {
            return;
        }

        /*
         * Only clean .message-text.
         *
         * This deliberately avoids:
         * - reactions
         * - buttons
         * - usernames
         * - embeds
         * - attachments
         * - generated Markdown UI
         */

        const textElements =
            message.querySelectorAll(
                MESSAGE_TEXT_SELECTOR
            );

        for (
            const element
            of textElements
        ) {
            cleanTextNodes(element);
        }
    }

    function cleanMessages(root = document) {
        if (
            root instanceof Element &&
            root.matches(MESSAGE_SELECTOR)
        ) {
            cleanMessage(root);
        }

        if (
            typeof root.querySelectorAll !==
            "function"
        ) {
            return;
        }

        root
            .querySelectorAll(
                MESSAGE_SELECTOR
            )
            .forEach(cleanMessage);
    }

    /* =========================================================
       PASTE
    ========================================================= */

    function hookPaste() {
        document.addEventListener(
            "paste",
            event => {
                const target =
                    event.target;

                if (
                    !(target instanceof Element)
                ) {
                    return;
                }

                if (
                    target.id !==
                    "messageInput"
                ) {
                    return;
                }

                /*
                 * Let the browser insert
                 * the clipboard contents first.
                 */
                queueMicrotask(() => {
                    cleanComposer();
                });
            }
        );
    }

    /* =========================================================
       SEND
    ========================================================= */

    function hookSend() {
        const sendButton =
            document.querySelector(
                SEND_BUTTON_SELECTOR
            );

        if (!sendButton) {
            return;
        }

        sendButton.addEventListener(
            "click",
            () => {
                cleanComposer();
            },
            true
        );
    }

    /* =========================================================
       ENTER TO SEND
    ========================================================= */

    function hookComposerKeyboard() {
        const composer =
            getComposer();

        if (!composer) {
            return;
        }

        composer.addEventListener(
            "keydown",
            event => {
                if (
                    event.key !== "Enter" ||
                    event.shiftKey
                ) {
                    return;
                }

                cleanComposer();
            },
            true
        );
    }

    /* =========================================================
       DYNAMIC ELEMENTS
    ========================================================= */

    function scheduleScan() {
        if (scanTimer !== null) {
            return;
        }

        scanTimer =
            setTimeout(() => {
                scanTimer = null;
                cleanMessages();
            }, 50);
    }

    const observer =
        new MutationObserver(
            mutations => {
                for (
                    const mutation
                    of mutations
                ) {
                    if (
                        mutation.addedNodes.length
                    ) {
                        scheduleScan();
                        return;
                    }
                }
            }
        );

    /* =========================================================
       INITIALIZE
    ========================================================= */

    async function init() {
        await loadRules();

        if (!rulesLoaded) {
            console.warn(
                "[Krynet ClearURLs] Running without rules."
            );
        }

        hookPaste();
        hookSend();
        hookComposerKeyboard();

        cleanMessages();

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

        console.log(
            "[Krynet ClearURLs] URL cleaning active."
        );
    }

    /* =========================================================
       START
    ========================================================= */

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                void init();
            },
            {
                once: true
            }
        );
    } else {
        void init();
    }

    /* =========================================================
       PUBLIC API
    ========================================================= */

    window.KrynetClearURLs = {
        cleanUrl,
        cleanText,
        cleanComposer,
        scan: cleanMessages
    };
})();
