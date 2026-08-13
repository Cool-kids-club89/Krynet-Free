"use strict";

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

const messageStates = new WeakMap();

let activePicker = null;

function installStyles() {
    if (document.getElementById("krynet-reactions-style")) {
        return;
    }

    const style = document.createElement("style");

    style.id = "krynet-reactions-style";

    style.textContent = `
        .kr-message-reactions {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 5px;
        }

        .kr-reactions {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .kr-reaction {
            min-height: 25px;
            padding: 2px 7px;
            border: 1px solid #4f5158;
            border-radius: 7px;
            background: #2b2d31;
            color: #dbdee1;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 13px;
            line-height: 18px;
        }

        .kr-reaction:hover {
            border-color: #5865f2;
            background: #35384a;
        }

        .kr-reaction.active {
            border-color: #5865f2;
            background: #3c4270;
        }

        .kr-reaction-count {
            color: #b5bac1;
            font-size: 12px;
            font-weight: 600;
        }

        .kr-emoji-picker {
            position: fixed;
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
            padding: 0;
            border: 0;
            border-radius: 5px;
            background: transparent;
            color: #fff;
            cursor: pointer;
            font-size: 20px;
        }

        .kr-emoji-button:hover {
            background: #40444b;
        }
    `;

    document.head.appendChild(style);
}

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

function getMessageFromContainer(container) {
    return container.closest(MESSAGE_SELECTOR);
}

function closePicker() {
    if (activePicker) {
        activePicker.remove();
        activePicker = null;
    }

    for (const message of document.querySelectorAll(
        MESSAGE_SELECTOR
    )) {
        const state = messageStates.get(message);

        if (state) {
            state.picker = null;
        }
    }
}

function renderReactions(message, container) {
    if (!container) {
        return;
    }

    const state = getState(message);

    container.replaceChildren();

    if (!state.reactions.size) {
        return;
    }

    const reactions =
        document.createElement("div");

    reactions.className =
        "kr-reactions";

    for (const [
        emoji,
        reaction
    ] of state.reactions) {

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "kr-reaction";

        if (reaction.active) {
            button.classList.add("active");
        }

        button.title =
            `${emoji} ${reaction.count}`;

        const emojiElement =
            document.createElement("span");

        emojiElement.textContent =
            emoji;

        const count =
            document.createElement("span");

        count.className =
            "kr-reaction-count";

        count.textContent =
            String(reaction.count);

        button.append(
            emojiElement,
            count
        );

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                toggleReaction(
                    message,
                    container,
                    emoji
                );
            }
        );

        reactions.appendChild(button);
    }

    container.appendChild(reactions);
}

function toggleReaction(
    message,
    container,
    emoji
) {
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

    renderReactions(
        message,
        container
    );
}

function openPicker(
    message,
    container,
    anchor
) {
    closePicker();

    const picker =
        document.createElement("div");

    picker.className =
        "kr-emoji-picker";

    for (const emoji of EMOJIS) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className =
            "kr-emoji-button";

        button.textContent =
            emoji;

        button.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                toggleReaction(
                    message,
                    container,
                    emoji
                );

                closePicker();
            }
        );

        picker.appendChild(button);
    }

    document.body.appendChild(picker);

    const rect =
        anchor.getBoundingClientRect();

    const pickerWidth = 230;
    const pickerHeight = 130;
    const margin = 10;

    let left =
        rect.left;

    let top =
        rect.bottom + 6;

    if (
        left + pickerWidth >
        window.innerWidth - margin
    ) {
        left =
            window.innerWidth -
            pickerWidth -
            margin;
    }

    if (
        top + pickerHeight >
        window.innerHeight - margin
    ) {
        top =
            rect.top -
            pickerHeight -
            6;
    }

    picker.style.left =
        `${Math.max(margin, left)}px`;

    picker.style.top =
        `${Math.max(margin, top)}px`;

    activePicker =
        picker;

    getState(message).picker =
        picker;
}

function createAddButton(
    message,
    container
) {
    const button =
        document.createElement("button");

    button.type = "button";
    button.className =
        "kr-reaction-add";

    button.textContent =
        "🙂";

    button.title =
        "Add reaction";

    button.setAttribute(
        "aria-label",
        "Add reaction"
    );

    button.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();

            const state =
                getState(message);

            if (state.picker) {
                closePicker();
                return;
            }

            openPicker(
                message,
                container,
                button
            );
        }
    );

    return button;
}

function attach(container) {
    if (!(container instanceof Element)) {
        return null;
    }

    const message =
        getMessageFromContainer(container);

    if (!message) {
        console.warn(
            "[Krynet] Reaction container is not inside a message."
        );

        return null;
    }

    installStyles();

    const state =
        getState(message);

    if (
        container.dataset.reactionsInitialized ===
        "true"
    ) {
        renderReactions(
            message,
            container
        );

        return state;
    }

    container.dataset.reactionsInitialized =
        "true";

    const addButton =
        createAddButton(
            message,
            container
        );

    /*
     * The HTML already has .message-actions
     * containing the reaction button.
     *
     * If one exists, hook it instead of creating
     * another button.
     */

    const existingButton =
        message.querySelector(
            ':scope > .message-actions [data-action="react"]'
        );

    if (existingButton) {
        existingButton.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                if (state.picker) {
                    closePicker();
                    return;
                }

                openPicker(
                    message,
                    container,
                    existingButton
                );
            }
        );
    } else {
        container.before(addButton);
    }

    renderReactions(
        message,
        container
    );

    return state;
}

function setupMessage(message) {
    if (!(message instanceof Element)) {
        return;
    }

    const container =
        message.querySelector(
            ":scope > .message-content > .kr-message-reactions"
        );

    if (!container) {
        return;
    }

    attach(container);
}

function scanMessages(root = document) {
    installStyles();

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

document.addEventListener(
    "click",
    event => {
        const target =
            event.target;

        if (!(target instanceof Element)) {
            return;
        }

        if (
            target.closest(
                ".kr-emoji-picker"
            ) ||
            target.closest(
                '[data-action="react"]'
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

window.addEventListener(
    "resize",
    closePicker
);

window.addEventListener(
    "scroll",
    closePicker,
    true
);

export class Reactions {
    constructor(container) {
        this.container =
            container;

        this.message =
            getMessageFromContainer(
                container
            );

        attach(container);
    }

    static attach(container) {
        return attach(container);
    }

    static scan(root = document) {
        scanMessages(root);
    }

    add(emoji) {
        if (
            !this.message ||
            !this.container
        ) {
            return;
        }

        toggleReaction(
            this.message,
            this.container,
            emoji
        );
    }

    static add(message, emoji) {
        if (!(message instanceof Element)) {
            return;
        }

        const container =
            message.querySelector(
                ":scope > .message-content > .kr-message-reactions"
            );

        if (!container) {
            return;
        }

        attach(container);

        toggleReaction(
            message,
            container,
            emoji
        );
    }
}

export default Reactions;

window.KrynetReactions = {
    scan: scanMessages,
    attach,
    add(message, emoji) {
        Reactions.add(
            message,
            emoji
        );
    }
};
