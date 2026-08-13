"use strict";

/* ---------------------------------------------------------
   SETTINGS
--------------------------------------------------------- */

const EMOJIS = [
    "👍",
    "❤️",
    "😂",
    "😮",
    "😢",
    "😡",
    "🎉",
    "🔥",
    "💀",
    "🤔"
];

const MESSAGE_SELECTOR = ".message";

/* ---------------------------------------------------------
   STYLES
--------------------------------------------------------- */

function installStyles() {
    if (document.getElementById("krynet-reactions-style")) {
        return;
    }

    const style = document.createElement("style");

    style.id = "krynet-reactions-style";

    style.textContent = `
        .kr-message-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-top: 6px;
            min-height: 28px;
        }

        .kr-reaction-add {
            width: 28px;
            height: 28px;
            padding: 0;
            border: 1px solid #40444b;
            border-radius: 6px;
            background: #2f3136;
            color: #b9bbbe;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .kr-reaction-add:hover {
            background: #40444b;
            color: #fff;
        }

        .kr-reactions {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 5px;
        }

        .kr-reaction {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            min-height: 26px;
            padding: 2px 7px;
            border: 1px solid #40444b;
            border-radius: 7px;
            background: #2f3136;
            color: #dcddde;
            cursor: pointer;
            font-size: 14px;
            line-height: 20px;
        }

        .kr-reaction:hover {
            background: #40444b;
        }

        .kr-reaction.active {
            border-color: #5865f2;
            background: #353b70;
        }

        .kr-reaction-count {
            font-size: 12px;
            color: #b9bbbe;
            font-weight: 600;
        }

        .kr-emoji-picker {
            position: absolute;
            z-index: 10000;
            width: 230px;
            padding: 8px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 4px;
            background: #18191c;
            border: 1px solid #40444b;
            border-radius: 8px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, .45);
        }

        .kr-emoji-button {
            width: 40px;
            height: 36px;
            border: 0;
            border-radius: 5px;
            background: transparent;
            color: white;
            cursor: pointer;
            font-size: 20px;
        }

        .kr-emoji-button:hover {
            background: #40444b;
        }
    `;

    document.head.appendChild(style);
}

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */

const messageStates = new WeakMap();

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function getState(message) {
    let state = messageStates.get(message);

    if (!state) {
        state = {
            reactions: new Map(),
            picker: null
        };

        messageStates.set(message, state);
    }

    return state;
}

function closePicker() {
    document
        .querySelectorAll(".kr-emoji-picker")
        .forEach(picker => {
            picker.remove();
        });

    for (const message of document.querySelectorAll(
        MESSAGE_SELECTOR
    )) {
        const state = messageStates.get(message);

        if (state) {
            state.picker = null;
        }
    }
}

/* ---------------------------------------------------------
   REACTION RENDERING
--------------------------------------------------------- */

function renderReactions(message) {
    const state = getState(message);

    let container = message.querySelector(
        ":scope > .kr-message-reactions"
    );

    if (!container) {
        container = document.createElement("div");

        container.className =
            "kr-message-reactions";

        message.appendChild(container);
    }

    container.replaceChildren();

    if (!state.reactions.size) {
        return;
    }

    const reactions = document.createElement("div");

    reactions.className = "kr-reactions";

    for (const [
        emoji,
        reaction
    ] of state.reactions) {

        const button = document.createElement("button");

        button.type = "button";
        button.className = "kr-reaction";

        if (reaction.active) {
            button.classList.add("active");
        }

        const emojiSpan =
            document.createElement("span");

        emojiSpan.textContent = emoji;

        const count =
            document.createElement("span");

        count.className =
            "kr-reaction-count";

        count.textContent =
            String(reaction.count);

        button.append(
            emojiSpan,
            count
        );

        button.addEventListener(
            "click",
            event => {
                event.stopPropagation();

                toggleReaction(
                    message,
                    emoji
                );
            }
        );

        reactions.appendChild(button);
    }

    container.appendChild(reactions);
}

/* ---------------------------------------------------------
   TOGGLE REACTION
--------------------------------------------------------- */

function toggleReaction(message, emoji) {
    const state = getState(message);

    let reaction =
        state.reactions.get(emoji);

    if (!reaction) {
        reaction = {
            count: 0,
            active: false
        };

        state.reactions.set(
            emoji,
            reaction
        );
    }

    if (reaction.active) {
        reaction.count--;

        reaction.active = false;

        if (reaction.count <= 0) {
            state.reactions.delete(emoji);
        }
    } else {
        reaction.count++;
        reaction.active = true;
    }

    renderReactions(message);
}

/* ---------------------------------------------------------
   EMOJI PICKER
--------------------------------------------------------- */

function openPicker(message, button) {
    closePicker();

    const picker =
        document.createElement("div");

    picker.className =
        "kr-emoji-picker";

    for (const emoji of EMOJIS) {
        const emojiButton =
            document.createElement("button");

        emojiButton.type = "button";
        emojiButton.className =
            "kr-emoji-button";

        emojiButton.textContent =
            emoji;

        emojiButton.addEventListener(
            "click",
            event => {
                event.stopPropagation();

                toggleReaction(
                    message,
                    emoji
                );

                closePicker();
            }
        );

        picker.appendChild(
            emojiButton
        );
    }

    document.body.appendChild(picker);

    const rect =
        button.getBoundingClientRect();

    const pickerWidth = 230;
    const pickerHeight = 130;

    let left = rect.left;
    let top = rect.bottom + 6;

    if (
        left + pickerWidth >
        window.innerWidth - 10
    ) {
        left =
            window.innerWidth -
            pickerWidth -
            10;
    }

    if (
        top + pickerHeight >
        window.innerHeight - 10
    ) {
        top =
            rect.top -
            pickerHeight -
            6;
    }

    picker.style.left =
        `${Math.max(10, left)}px`;

    picker.style.top =
        `${Math.max(10, top)}px`;

    const state = getState(message);

    state.picker = picker;
}

/* ---------------------------------------------------------
   MESSAGE SETUP
--------------------------------------------------------- */

function setupMessage(message) {
    if (!(message instanceof Element)) {
        return;
    }

    if (
        message.dataset.reactionsInitialized ===
        "true"
    ) {
        return;
    }

    message.dataset.reactionsInitialized =
        "true";

    const state = getState(message);

    /* ---------------------------------------------
       Actions row
    --------------------------------------------- */

    let actions =
        message.querySelector(
            ":scope > .kr-message-actions"
        );

    if (!actions) {
        actions =
            document.createElement("div");

        actions.className =
            "kr-message-actions";

        /*
         * Put the reaction control at the very
         * bottom of the message.
         */
        message.appendChild(actions);
    }

    const addButton =
        document.createElement("button");

    addButton.type = "button";
    addButton.className =
        "kr-reaction-add";

    addButton.textContent = "🙂";
    addButton.title = "Add reaction";
    addButton.setAttribute(
        "aria-label",
        "Add reaction"
    );

    addButton.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            if (state.picker) {
                closePicker();
                return;
            }

            openPicker(
                message,
                addButton
            );
        }
    );

    actions.appendChild(
        addButton
    );

    renderReactions(message);
}

/* ---------------------------------------------------------
   SCAN
--------------------------------------------------------- */

function scanMessages(root = document) {
    if (
        root instanceof Element &&
        root.matches(MESSAGE_SELECTOR)
    ) {
        setupMessage(root);
    }

    if (
        typeof root.querySelectorAll !==
        "function"
    ) {
        return;
    }

    root
        .querySelectorAll(MESSAGE_SELECTOR)
        .forEach(setupMessage);
}

/* ---------------------------------------------------------
   OUTSIDE CLICK
--------------------------------------------------------- */

document.addEventListener(
    "click",
    event => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        if (
            target.closest(
                ".kr-emoji-picker"
            ) ||
            target.closest(
                ".kr-reaction-add"
            )
        ) {
            return;
        }

        closePicker();
    }
);

/* ---------------------------------------------------------
   OBSERVER
--------------------------------------------------------- */

const observer =
    new MutationObserver(
        mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (
                        !(node instanceof Element)
                    ) {
                        continue;
                    }

                    scanMessages(node);
                }
            }
        }
    );

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */

function initialize() {
    installStyles();

    scanMessages();

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
        "[Krynet] Reactions initialized."
    );
}

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
    );
} else {
    initialize();
}

/* ---------------------------------------------------------
   PUBLIC API
--------------------------------------------------------- */

export const Reactions = {
    scan: scanMessages,

    add(message, emoji) {
        if (!(message instanceof Element)) {
            return;
        }

        setupMessage(message);
        toggleReaction(message, emoji);
    }
};
