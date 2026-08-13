(() => {
    "use strict";

    class KrynetCopyFile {
        static MAX_COPY_SIZE = 500_000;

        static TEXT_EXTENSIONS =
            /\.(txt|md|markdown|json|js|jsx|ts|tsx|html|htm|css|scss|sass|less|xml|csv|log|yaml|yml|toml|ini|conf|sh|bash|py|java|c|cpp|h|hpp|rs|go|php|rb|swift|kt|sql)$/i;

        static TEXT_MIME_TYPES = new Set([
            "application/json",
            "application/javascript",
            "application/typescript",
            "application/xml",
            "application/x-yaml",
            "application/yaml",
            "application/sql"
        ]);

        static TOAST_DURATION = 2000;

        static toastElement = null;
        static toastTimer = null;
        static fadeTimer = null;

        static observer = null;
        static initialized = false;

        /* -----------------------------------------------------
           CSS
        ----------------------------------------------------- */

        static injectCSS() {
            if (
                document.querySelector(
                    "style[data-krynet-copy-file]"
                )
            ) {
                return;
            }

            const style =
                document.createElement("style");

            style.dataset.krynetCopyFile = "true";

            style.textContent = `
                .kr-copy-btn {
                    appearance: none;
                    border: 0;
                    outline: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 30px;
                    height: 30px;
                    padding: 0;
                    margin-left: 6px;
                    border-radius: 6px;
                    background: rgba(255,255,255,.08);
                    color: inherit;
                    cursor: pointer;
                    font-size: 14px;
                    line-height: 1;
                    transition:
                        background .15s ease,
                        opacity .15s ease,
                        transform .1s ease;
                }

                .kr-copy-btn:hover:not(:disabled) {
                    background: rgba(255,255,255,.15);
                }

                .kr-copy-btn:active:not(:disabled) {
                    transform: scale(.94);
                }

                .kr-copy-btn:disabled {
                    cursor: not-allowed;
                }

                .kr-file-actions {
                    display: inline-flex;
                    align-items: center;
                    margin-left: auto;
                }

                .kr-toast {
                    position: fixed;
                    left: 50%;
                    bottom: 24px;
                    transform: translateX(-50%);
                    z-index: 999999;
                    padding: 9px 14px;
                    border-radius: 8px;
                    background: #18191c;
                    color: #fff;
                    font-size: 13px;
                    line-height: 1.3;
                    box-shadow:
                        0 8px 30px rgba(0,0,0,.35);
                    opacity: 1;
                    transition: opacity .3s ease;
                    pointer-events: none;
                }

                .kr-toast.fade {
                    opacity: 0;
                }
            `;

            document.head.appendChild(style);
        }

        /* -----------------------------------------------------
           FILE DETECTION
        ----------------------------------------------------- */

        static isTextFile(file) {
            if (!file) {
                return false;
            }

            const mimeType =
                String(file.type || "")
                    .toLowerCase()
                    .split(";")[0]
                    .trim();

            if (
                mimeType.startsWith("text/")
            ) {
                return true;
            }

            if (
                this.TEXT_MIME_TYPES.has(
                    mimeType
                )
            ) {
                return true;
            }

            return this.TEXT_EXTENSIONS.test(
                String(file.name || "")
            );
        }

        /* -----------------------------------------------------
           SIZE CHECK
        ----------------------------------------------------- */

        static canCopy(file) {
            if (!file) {
                return false;
            }

            if (
                Number.isFinite(file.size) &&
                file.size > this.MAX_COPY_SIZE
            ) {
                return false;
            }

            const content =
                typeof file.content === "string"
                    ? file.content
                    : "";

            try {
                return (
                    new TextEncoder()
                        .encode(content)
                        .byteLength <=
                    this.MAX_COPY_SIZE
                );
            } catch {
                return (
                    content.length <=
                    this.MAX_COPY_SIZE
                );
            }
        }

        /* -----------------------------------------------------
           COPY BUTTON
        ----------------------------------------------------- */

        static createButton(file) {
            if (
                !this.isTextFile(file)
            ) {
                return null;
            }

            const button =
                document.createElement("button");

            button.type = "button";
            button.className = "kr-copy-btn";
            button.dataset.krCopyFile = "true";

            let copied = false;
            let copyTimer = null;

            const update = () => {
                const disabled =
                    !this.canCopy(file);

                button.disabled =
                    disabled;

                if (copied) {
                    button.textContent = "✓";
                    button.title =
                        "Copied";
                } else if (disabled) {
                    button.textContent = "×";
                    button.title =
                        "File is too large to copy";
                } else {
                    button.textContent = "📋";
                    button.title =
                        "Copy file contents";
                }

                button.style.opacity =
                    disabled
                        ? "0.45"
                        : "1";
            };

            const doCopy = async () => {
                if (
                    button.disabled ||
                    !this.canCopy(file)
                ) {
                    return;
                }

                try {
                    await this.copyText(
                        file.content
                    );

                    copied = true;
                    update();

                    this.toast(
                        "Copied file contents"
                    );

                    if (
                        copyTimer !== null
                    ) {
                        clearTimeout(
                            copyTimer
                        );
                    }

                    copyTimer =
                        setTimeout(() => {
                            copied = false;
                            copyTimer = null;
                            update();
                        }, 2000);
                } catch (error) {
                    console.warn(
                        "[KrynetCopyFile] Clipboard failed:",
                        error
                    );

                    this.toast(
                        "Failed to copy file"
                    );
                }
            };

            button.addEventListener(
                "click",
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    void doCopy();
                }
            );

            update();

            return button;
        }

        /* -----------------------------------------------------
           CLIPBOARD
        ----------------------------------------------------- */

        static async copyText(text) {
            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText ===
                    "function"
            ) {
                try {
                    await navigator.clipboard.writeText(
                        text
                    );

                    return;
                } catch {
                    // Continue to fallback.
                }
            }

            await this.copyTextFallback(
                text
            );
        }

        /* -----------------------------------------------------
           FALLBACK CLIPBOARD
        ----------------------------------------------------- */

        static copyTextFallback(text) {
            return new Promise(
                (resolve, reject) => {
                    const textarea =
                        document.createElement(
                            "textarea"
                        );

                    textarea.value =
                        text;

                    Object.assign(
                        textarea.style,
                        {
                            position: "fixed",
                            left: "-9999px",
                            top: "0",
                            width: "1px",
                            height: "1px",
                            opacity: "0",
                            pointerEvents:
                                "none"
                        }
                    );

                    document.body.appendChild(
                        textarea
                    );

                    textarea.focus();
                    textarea.select();

                    let successful =
                        false;

                    try {
                        successful =
                            document.execCommand(
                                "copy"
                            );
                    } catch {
                        successful =
                            false;
                    }

                    textarea.remove();

                    if (successful) {
                        resolve();
                    } else {
                        reject(
                            new Error(
                                "Clipboard unavailable"
                            )
                        );
                    }
                }
            );
        }

        /* -----------------------------------------------------
           TOAST
        ----------------------------------------------------- */

        static toast(message) {
            if (!document.body) {
                return;
            }

            if (
                this.toastTimer !== null
            ) {
                clearTimeout(
                    this.toastTimer
                );

                this.toastTimer = null;
            }

            if (
                this.fadeTimer !== null
            ) {
                clearTimeout(
                    this.fadeTimer
                );

                this.fadeTimer = null;
            }

            let toast =
                this.toastElement;

            if (!toast) {
                toast =
                    document.createElement(
                        "div"
                    );

                toast.className =
                    "kr-toast";

                this.toastElement =
                    toast;

                document.body.appendChild(
                    toast
                );
            }

            toast.classList.remove(
                "fade"
            );

            toast.textContent =
                message;

            this.toastTimer =
                setTimeout(() => {
                    toast?.classList.add(
                        "fade"
                    );

                    this.fadeTimer =
                        setTimeout(() => {
                            toast?.remove();

                            if (
                                this.toastElement ===
                                toast
                            ) {
                                this.toastElement =
                                    null;
                            }

                            this.fadeTimer =
                                null;
                        }, 300);

                    this.toastTimer =
                        null;
                }, this.TOAST_DURATION);
        }

        /* -----------------------------------------------------
           PARSE FILE FROM ELEMENT
           
           Supported HTML:

           <div
               class="file-attachment"
               data-file-name="test.txt"
               data-file-content="hello"
               data-file-size="5">
           </div>

           OR:

           <div
               class="file-attachment"
               data-file='{"name":"test.txt","content":"hello"}'>
           </div>
        ----------------------------------------------------- */

        static getFileFromElement(element) {
            if (!(element instanceof Element)) {
                return null;
            }

            let rawFile =
                element.dataset.file;

            if (rawFile) {
                try {
                    const parsed =
                        JSON.parse(rawFile);

                    if (
                        parsed &&
                        typeof parsed ===
                            "object"
                    ) {
                        return {
                            name:
                                String(
                                    parsed.name ||
                                        ""
                                ),

                            type:
                                String(
                                    parsed.type ||
                                        ""
                                ),

                            size:
                                Number(
                                    parsed.size ||
                                        0
                                ),

                            content:
                                typeof parsed.content ===
                                "string"
                                    ? parsed.content
                                    : ""
                        };
                    }
                } catch {
                    // Fall through to data attributes.
                }
            }

            const name =
                element.dataset.fileName ||
                element.dataset.filename ||
                element.dataset.name;

            const content =
                element.dataset.fileContent ??
                element.dataset.content;

            if (
                !name ||
                typeof content !==
                    "string"
            ) {
                return null;
            }

            return {
                name,
                type:
                    element.dataset.fileType ||
                    element.dataset.type ||
                    "",

                size:
                    Number(
                        element.dataset.fileSize ||
                            new Blob([
                                content
                            ]).size
                    ),

                content
            };
        }

        /* -----------------------------------------------------
           FIND ACTION CONTAINER
        ----------------------------------------------------- */

        static findActionsContainer(
            attachment
        ) {
            return (
                attachment.querySelector(
                    "[data-file-actions]"
                ) ||
                attachment.querySelector(
                    ".file-actions"
                ) ||
                attachment.querySelector(
                    ".attachment-actions"
                ) ||
                attachment
            );
        }

        /* -----------------------------------------------------
           ATTACH BUTTON
        ----------------------------------------------------- */

        static processAttachment(
            attachment
        ) {
            if (
                !(attachment instanceof Element)
            ) {
                return;
            }

            if (
                attachment.dataset
                    .krCopyProcessed ===
                "true"
            ) {
                return;
            }

            const file =
                this.getFileFromElement(
                    attachment
                );

            if (!file) {
                return;
            }

            attachment.dataset
                .krCopyProcessed =
                "true";

            if (
                !this.isTextFile(file)
            ) {
                return;
            }

            const actions =
                this.findActionsContainer(
                    attachment
                );

            if (!actions) {
                return;
            }

            if (
                actions.querySelector(
                    ".kr-copy-btn"
                )
            ) {
                return;
            }

            const button =
                this.createButton(file);

            if (!button) {
                return;
            }

            /*
             * Keep the button grouped with
             * the other attachment actions.
             */
            if (
                !actions.classList.contains(
                    "kr-file-actions"
                )
            ) {
                const wrapper =
                    document.createElement(
                        "span"
                    );

                wrapper.className =
                    "kr-file-actions";

                wrapper.appendChild(
                    button
                );

                actions.appendChild(
                    wrapper
                );
            } else {
                actions.appendChild(
                    button
                );
            }
        }

        /* -----------------------------------------------------
           FIND ATTACHMENTS
        ----------------------------------------------------- */

        static scan(root = document) {
            if (
                root instanceof Element &&
                (
                    root.matches(
                        "[data-file], [data-file-name], .file-attachment, .attachment"
                    )
                )
            ) {
                this.processAttachment(
                    root
                );
            }

            root
                .querySelectorAll(
                    "[data-file], [data-file-name], .file-attachment, .attachment"
                )
                .forEach(
                    attachment => {
                        this.processAttachment(
                            attachment
                        );
                    }
                );
        }

        /* -----------------------------------------------------
           DRAG/DROP FILES
           
           Useful when the HTML attachment is
           created after a real File object
           is dropped.
        ----------------------------------------------------- */

        static attachFile(
            file,
            container
        ) {
            if (
                !file ||
                !(container instanceof Element)
            ) {
                return null;
            }

            if (
                !this.isTextFile(file)
            ) {
                return null;
            }

            const button =
                this.createButton(file);

            if (!button) {
                return null;
            }

            const actions =
                this.findActionsContainer(
                    container
                );

            if (!actions) {
                return null;
            }

            if (
                actions.querySelector(
                    ".kr-copy-btn"
                )
            ) {
                return null;
            }

            actions.appendChild(
                button
            );

            return button;
        }

        /* -----------------------------------------------------
           OBSERVER
        ----------------------------------------------------- */

        static observe() {
            if (
                this.observer ||
                !document.body
            ) {
                return;
            }

            this.observer =
                new MutationObserver(
                    mutations => {
                        for (
                            const mutation
                            of mutations
                        ) {
                            if (
                                mutation
                                    .addedNodes
                                    .length ===
                                0
                            ) {
                                continue;
                            }

                            for (
                                const node
                                of mutation.addedNodes
                            ) {
                                if (
                                    node instanceof
                                    Element
                                ) {
                                    this.scan(
                                        node
                                    );
                                }
                            }
                        }
                    }
                );

            this.observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true
                }
            );
        }

        /* -----------------------------------------------------
           INIT
        ----------------------------------------------------- */

        static init() {
            if (this.initialized) {
                return;
            }

            this.initialized =
                true;

            this.injectCSS();
            this.scan();
            this.observe();

            console.log(
                "[KrynetCopyFile] Initialized."
            );
        }
    }

    /* ---------------------------------------------------------
       GLOBAL
    --------------------------------------------------------- */

    window.KrynetCopyFile =
        KrynetCopyFile;

    /* ---------------------------------------------------------
       START
    --------------------------------------------------------- */

    function start() {
        KrynetCopyFile.init();
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );
    } else {
        start();
    }
})();
