"use strict";

/* =========================================================
   KrySearch Context Menu
   Right-click selected text inside messages and search it
   with KrySearch.
========================================================= */

const KRYSEARCH_BASE =
    "https://krynet-community.github.io/KrySearch/UI/index.html";

const MESSAGE_SELECTOR = ".message";
const MENU_ID = "krysearch-context-menu";

let initialized = false;

/* =========================================================
   STYLES
========================================================= */

function installStyles() {
    if (document.getElementById("krysearch-context-style")) {
        return;
    }

    const style = document.createElement("style");

    style.id = "krysearch-context-style";

    style.textContent = `
        #${MENU_ID} {
            position: fixed;
            z-index: 999999;
            min-width: 190px;
            padding: 6px;
            background: #18191c;
            border: 1px solid #303238;
            border-radius: 7px;
            box-shadow: 0 8px 28px rgba(0, 0, 0, .45);
            font-family: Inter, system-ui, sans-serif;
            user-select: none;
        }

        .kr-search-context-item {
            width: 100%;
            min-height: 34px;
            padding: 7px 10px;
            display: flex;
            align-items: center;
            gap: 9px;
            box-sizing: border-box;
            border: 0;
            border-radius: 5px;
            background: transparent;
            color: #dcddde;
            font-size: 14px;
            text-align: left;
            cursor: pointer;
        }

        .kr-search-context-item:hover {
            background: #5865f2;
            color: #fff;
        }

        .kr-search-context-icon {
            width: 18px;
            text-align: center;
            font-size: 16px;
        }

        .kr-search-context-label {
            flex: 1;
        }
    `;

    document.head.appendChild(style);
}

/* =========================================================
   HELPERS
========================================================= */

function getSelectedText() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
        return "";
    }

    return selection
        .toString()
        .replace(/\s+/g, " ")
        .trim();
}

function getSelectionElement() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    let node = selection.anchorNode;

    if (!node) {
        return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    if (!(node instanceof Element)) {
        return null;
    }

    return node;
}

function selectionIsInsideMessage() {
    const element = getSelectionElement();

    if (!element) {
        return false;
    }

    return Boolean(
        element.closest(MESSAGE_SELECTOR)
    );
}

/* =========================================================
   SEARCH URL
========================================================= */

function createSearchUrl(query) {
    return (
        `${KRYSEARCH_BASE}?q=${encodeURIComponent(
            query
        )}`
    );
}

/* =========================================================
   MENU
========================================================= */

function removeMenu() {
    const menu =
        document.getElementById(MENU_ID);

    if (menu) {
        menu.remove();
    }
}

function createMenu(x, y, query) {
    removeMenu();

    const menu =
        document.createElement("div");

    menu.id = MENU_ID;
    menu.setAttribute(
        "role",
        "menu"
    );

    const searchButton =
        document.createElement("button");

    searchButton.type = "button";
    searchButton.className =
        "kr-search-context-item";

    searchButton.setAttribute(
        "role",
        "menuitem"
    );

    const icon =
        document.createElement("span");

    icon.className =
        "kr-search-context-icon";

    icon.textContent = "🔎";

    const label =
        document.createElement("span");

    label.className =
        "kr-search-context-label";

    label.textContent =
        "Search with KrySearch";

    searchButton.append(
        icon,
        label
    );

    searchButton.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();

            openKrySearch(query);
            removeMenu();
        }
    );

    menu.appendChild(searchButton);

    document.body.appendChild(menu);

    positionMenu(
        menu,
        x,
        y
    );
}

/* =========================================================
   MENU POSITION
========================================================= */

function positionMenu(menu, x, y) {
    const padding = 8;

    let left = x;
    let top = y;

    const rect =
        menu.getBoundingClientRect();

    if (
        left + rect.width >
        window.innerWidth - padding
    ) {
        left =
            window.innerWidth -
            rect.width -
            padding;
    }

    if (
        top + rect.height >
        window.innerHeight - padding
    ) {
        top =
            window.innerHeight -
            rect.height -
            padding;
    }

    menu.style.left =
        `${Math.max(padding, left)}px`;

    menu.style.top =
        `${Math.max(padding, top)}px`;
}

/* =========================================================
   OPEN KRYSEARCH
========================================================= */

function openKrySearch(query) {
    if (!query) {
        return;
    }

    const url =
        createSearchUrl(query);

    window.open(
        url,
        "_blank",
        "noopener,noreferrer"
    );
}

/* =========================================================
   CONTEXT MENU
========================================================= */

function handleContextMenu(event) {
    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    if (
        target.closest(
            `#${MENU_ID}`
        )
    ) {
        return;
    }

    if (!selectionIsInsideMessage()) {
        return;
    }

    const query =
        getSelectedText();

    if (!query) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    createMenu(
        event.clientX,
        event.clientY,
        query
    );
}

/* =========================================================
   OUTSIDE CLICK
========================================================= */

function handleDocumentClick(event) {
    const menu =
        document.getElementById(MENU_ID);

    if (!menu) {
        return;
    }

    const target = event.target;

    if (
        target instanceof Node &&
        menu.contains(target)
    ) {
        return;
    }

    removeMenu();
}

/* =========================================================
   ESCAPE
========================================================= */

function handleKeyDown(event) {
    if (event.key === "Escape") {
        removeMenu();
    }
}

/* =========================================================
   SCROLL / RESIZE
========================================================= */

function handleViewportChange() {
    removeMenu();
}

/* =========================================================
   INITIALIZE
========================================================= */

export function initKrySearch() {
    if (initialized) {
        return;
    }

    initialized = true;

    installStyles();

    document.addEventListener(
        "contextmenu",
        handleContextMenu,
        true
    );

    document.addEventListener(
        "click",
        handleDocumentClick,
        true
    );

    document.addEventListener(
        "keydown",
        handleKeyDown,
        true
    );

    window.addEventListener(
        "resize",
        handleViewportChange
    );

    window.addEventListener(
        "scroll",
        handleViewportChange,
        true
    );
}

/* =========================================================
   AUTO INIT
========================================================= */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initKrySearch,
        { once: true }
    );
} else {
    initKrySearch();
}

/* =========================================================
   PUBLIC API
========================================================= */

export const KrySearch = {
    init: initKrySearch,

    search(query) {
        const value =
            String(query ?? "").trim();

        if (!value) {
            return;
        }

        openKrySearch(value);
    },

    closeMenu() {
        removeMenu();
    }
};
