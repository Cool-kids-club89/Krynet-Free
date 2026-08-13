(() => {
    "use strict";

    /* ---------------------------------------------------------
       SETTINGS
    --------------------------------------------------------- */

    const settings = {
        anonymiseByDefault: true,
        method: "random",
        randomLength: 7,
        consistentName: "file"
    };

    /* ---------------------------------------------------------
       STATE
    --------------------------------------------------------- */

    const inputStates = new WeakMap();
    const originalFiles = new WeakMap();

    /* ---------------------------------------------------------
       GENERATE NAME
    --------------------------------------------------------- */

    function getExtension(filename) {
        const lastDot = filename.lastIndexOf(".");

        if (
            lastDot <= 0 ||
            lastDot === filename.length - 1
        ) {
            return "";
        }

        return filename.slice(lastDot);
    }

    function generateRandomName(length) {
        const chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        const values = new Uint32Array(length);

        crypto.getRandomValues(values);

        let result = "";

        for (const value of values) {
            result += chars[value % chars.length];
        }

        return result;
    }

    function generateName(originalName, method) {
        const extension = getExtension(originalName);

        switch (method) {
            case "random":
                return (
                    generateRandomName(settings.randomLength) +
                    extension
                );

            case "consistent":
                return (
                    settings.consistentName +
                    extension
                );

            case "timestamp":
                return `${Date.now()}${extension}`;

            default:
                return originalName;
        }
    }

    /* ---------------------------------------------------------
       CREATE ANONYMOUS FILE
    --------------------------------------------------------- */

    function anonymiseFile(file) {
        const newName = generateName(
            file.name,
            settings.method
        );

        return new File(
            [file],
            newName,
            {
                type: file.type,
                lastModified: file.lastModified
            }
        );
    }

    /* ---------------------------------------------------------
       REPLACE INPUT FILES
    --------------------------------------------------------- */

    function setInputFiles(input, files) {
        try {
            const dataTransfer = new DataTransfer();

            for (const file of files) {
                dataTransfer.items.add(file);
            }

            input.files = dataTransfer.files;

            return true;
        } catch (error) {
            console.warn(
                "[AnonUpload] Unable to replace FileList:",
                error
            );

            return false;
        }
    }

    /* ---------------------------------------------------------
       ANONYMISE INPUT
    --------------------------------------------------------- */

    function anonymiseInput(input) {
        if (!input.files?.length) {
            return;
        }

        const files = Array.from(input.files);

        // Keep the original files so the user can restore them.
        if (!originalFiles.has(input)) {
            originalFiles.set(input, files);
        }

        const anonymisedFiles =
            files.map(anonymiseFile);

        setInputFiles(
            input,
            anonymisedFiles
        );

        const state = inputStates.get(input);

        if (state) {
            state.anonymised = true;
        }
    }

    /* ---------------------------------------------------------
       RESTORE ORIGINAL INPUT
    --------------------------------------------------------- */

    function restoreInput(input) {
        const originals = originalFiles.get(input);

        if (!originals) {
            return;
        }

        setInputFiles(
            input,
            originals
        );

        const state = inputStates.get(input);

        if (state) {
            state.anonymised = false;
        }
    }

    /* ---------------------------------------------------------
       HANDLE FILE SELECTION
    --------------------------------------------------------- */

    function handleChange(event) {
        const input = event.target;

        if (
            !(input instanceof HTMLInputElement) ||
            input.type !== "file" ||
            !input.files?.length
        ) {
            return;
        }

        // Save originals before changing their names.
        originalFiles.set(
            input,
            Array.from(input.files)
        );

        const state = inputStates.get(input);

        const shouldAnonymise =
            state?.anonymised ??
            settings.anonymiseByDefault;

        if (shouldAnonymise) {
            anonymiseInput(input);
        }
    }

    /* ---------------------------------------------------------
       TOGGLE BUTTON
    --------------------------------------------------------- */

    function createToggleButton(input) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.dataset.anonToggle = "true";

        const state = {
            anonymised:
                settings.anonymiseByDefault
        };

        inputStates.set(
            input,
            state
        );

        button.style.marginLeft = "0.5rem";

        function updateLabel() {
            button.textContent =
                state.anonymised
                    ? "Disable Anonymise"
                    : "Enable Anonymise";
        }

        button.addEventListener(
            "click",
            () => {
                state.anonymised =
                    !state.anonymised;

                if (!input.files?.length) {
                    updateLabel();
                    return;
                }

                if (state.anonymised) {
                    anonymiseInput(input);
                } else {
                    restoreInput(input);
                }

                updateLabel();
            }
        );

        updateLabel();

        return button;
    }

    /* ---------------------------------------------------------
       INITIALIZE INPUT
    --------------------------------------------------------- */

    function initializeInput(input) {
        if (input.dataset.anon === "true") {
            return;
        }

        input.dataset.anon = "true";

        const button =
            createToggleButton(input);

        input.parentNode?.insertBefore(
            button,
            input.nextSibling
        );
    }

    /* ---------------------------------------------------------
       SCAN INPUTS
    --------------------------------------------------------- */

    function scan(root = document) {
        const inputs = [];

        if (
            root instanceof HTMLInputElement &&
            root.type === "file"
        ) {
            inputs.push(root);
        }

        root
            .querySelectorAll('input[type="file"]')
            .forEach(input => {
                inputs.push(input);
            });

        for (const input of inputs) {
            initializeInput(input);
        }
    }

    /* ---------------------------------------------------------
       OBSERVER
    --------------------------------------------------------- */

    const observer =
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) {
                        continue;
                    }

                    scan(node);
                }
            }
        });

    /* ---------------------------------------------------------
       INITIALIZE
    --------------------------------------------------------- */

    function initialize() {
        scan();

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

        document.addEventListener(
            "change",
            handleChange
        );

        console.log(
            "[AnonUpload] File anonymisation loaded."
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }
})();
