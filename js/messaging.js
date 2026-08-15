"use strict";

/*
 * Krynet Community
 * messaging.js
 *
 * Plaintext messaging client.
 *
 * This intentionally does NOT encrypt messages.
 *
 * Responsibilities:
 * - Render messages
 * - Send messages
 * - Replies
 * - Reactions
 * - Attachments
 * - Channel switching
 * - Local persistence
 * - Markdown integration
 */

(() => {

    const STORAGE_KEY = "krynet:messages:v1";

    const state = {
        channel: "general",
        messages: loadMessages(),
        attachment: null,
        replyTo: null
    };


    /* =====================================================
       DOM
    ===================================================== */

    const messagesElement =
        document.getElementById("messages");

    const input =
        document.getElementById("messageInput");

    const sendButton =
        document.getElementById("sendButton");

    const uploadButton =
        document.getElementById("uploadButton");

    const fileInput =
        document.getElementById("fileInput");

    const attachmentPreview =
        document.getElementById("attachmentPreview");

    const attachmentContent =
        document.getElementById("attachmentContent");

    const attachmentName =
        document.getElementById("attachmentName");

    const removeAttachment =
        document.getElementById("removeAttachment");

    const channelName =
        document.getElementById("channelName");

    const channelIcon =
        document.getElementById("channelIcon");


    /* =====================================================
       STORAGE
    ===================================================== */

    function loadMessages() {

        try {

            const value =
                localStorage.getItem(
                    STORAGE_KEY
                );

            if (!value) {
                return {};
            }

            const parsed =
                JSON.parse(value);

            return parsed &&
                typeof parsed === "object"
                ? parsed
                : {};

        } catch (error) {

            console.error(
                "[Krynet Messaging] Failed to load messages:",
                error
            );

            return {};
        }
    }


    function saveMessages() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(state.messages)
            );

        } catch (error) {

            console.error(
                "[Krynet Messaging] Failed to save messages:",
                error
            );
        }
    }


    function getChannelMessages() {

        if (!Array.isArray(
            state.messages[state.channel]
        )) {
            state.messages[state.channel] = [];
        }

        return state.messages[state.channel];
    }


    /* =====================================================
       UTILITIES
    ===================================================== */

    function createId() {

        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return crypto.randomUUID();
        }

        return (
            Date.now().toString(36) +
            Math.random()
                .toString(36)
                .slice(2)
        );
    }


    function escapeHtml(value) {

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function formatTime(timestamp) {

        return new Intl.DateTimeFormat(
            undefined,
            {
                hour: "numeric",
                minute: "2-digit"
            }
        ).format(
            new Date(timestamp)
        );
    }


    function getInitials(name) {

        const value =
            String(name || "B")
                .trim();

        if (!value) {
            return "B";
        }

        return value
            .split(/\s+/)
            .map(word => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }


    function currentUsername() {
        return "Barney";
    }


    function scrollToBottom() {

        requestAnimationFrame(() => {

            messagesElement.scrollTop =
                messagesElement.scrollHeight;

        });
    }


    /* =====================================================
       MARKDOWN
    ===================================================== */

    function renderMarkdown(text) {

        const value =
            String(text || "");

        if (
            window.KrynetMarkdown &&
            typeof window.KrynetMarkdown.render ===
                "function"
        ) {

            try {

                return window.KrynetMarkdown.render(
                    value
                );

            } catch (error) {

                console.warn(
                    "[Krynet Messaging] Markdown renderer failed:",
                    error
                );
            }
        }

        if (
            window.marked &&
            typeof window.marked.parse ===
                "function"
        ) {

            try {

                return window.marked.parse(
                    value
                );

            } catch {
                // Fall through to plaintext.
            }
        }

        return escapeHtml(value)
            .replace(/\n/g, "<br>");
    }


    /* =====================================================
       LINKS / EMBEDS
    ===================================================== */

    function getYoutubeId(url) {

        try {

            const parsed =
                new URL(url);

            if (
                parsed.hostname ===
                    "youtu.be"
            ) {
                return parsed.pathname
                    .slice(1);
            }

            if (
                parsed.hostname.includes(
                    "youtube.com"
                )
            ) {

                if (
                    parsed.pathname ===
                    "/watch"
                ) {
                    return parsed.searchParams
                        .get("v");
                }

                if (
                    parsed.pathname.startsWith(
                        "/shorts/"
                    )
                ) {
                    return parsed.pathname
                        .split("/")[2];
                }

                if (
                    parsed.pathname.startsWith(
                        "/embed/"
                    )
                ) {
                    return parsed.pathname
                        .split("/")[2];
                }
            }

        } catch {
            return null;
        }

        return null;
    }


    function appendYoutubeEmbed(
        container,
        text
    ) {

        const urls =
            String(text)
                .match(
                    /https?:\/\/[^\s<]+/g
                );

        if (!urls) {
            return;
        }

        for (const rawUrl of urls) {

            const url =
                rawUrl.replace(
                    /[),.!?]+$/,
                    ""
                );

            const videoId =
                getYoutubeId(url);

            if (!videoId) {
                continue;
            }

            const wrapper =
                document.createElement("div");

            wrapper.className =
                "youtube-embed";

            wrapper.innerHTML = `
                <div class="youtube-embed-bar"></div>
                <div class="youtube-embed-body">
                    <iframe
                        src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}"
                        title="YouTube video"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    ></iframe>
                </div>
            `;

            container.appendChild(wrapper);
        }
    }


    /* =====================================================
       FILES
    ===================================================== */

    function isImage(file) {

        return (
            file.type.startsWith("image/") ||
            /\.(png|jpe?g|gif|webp|avif|heic|heif)$/i
                .test(file.name)
        );
    }


    function isVideo(file) {

        return (
            file.type.startsWith("video/") ||
            /\.(mp4|webm|mov|m4v)$/i
                .test(file.name)
        );
    }


    function isAudio(file) {

        return (
            file.type.startsWith("audio/") ||
            /\.(mp3|wav|ogg|aac|m4a|flac)$/i
                .test(file.name)
        );
    }


    function showAttachmentPreview(file) {

        state.attachment = file;

        attachmentPreview.classList.add(
            "visible"
        );

        attachmentName.textContent =
            file.name;

        attachmentContent.innerHTML = "";

        if (isImage(file)) {

            const image =
                document.createElement("img");

            image.src =
                URL.createObjectURL(file);

            image.onload = () => {
                URL.revokeObjectURL(
                    image.src
                );
            };

            attachmentContent.appendChild(
                image
            );

            return;
        }

        if (isVideo(file)) {

            const video =
                document.createElement("video");

            video.src =
                URL.createObjectURL(file);

            video.controls = true;

            attachmentContent.appendChild(
                video
            );

            return;
        }

        if (isAudio(file)) {

            const audio =
                document.createElement("audio");

            audio.src =
                URL.createObjectURL(file);

            audio.controls = true;

            attachmentContent.appendChild(
                audio
            );

            return;
        }

        attachmentContent.textContent = "📎";
    }


    function clearAttachment() {

        state.attachment = null;

        attachmentPreview.classList.remove(
            "visible"
        );

        attachmentContent.innerHTML = "";

        attachmentName.textContent = "";

        fileInput.value = "";
    }


    async function uploadFile(file) {

        /*
         * Prefer the existing anonymous-upload module.
         */

        const uploader =
            window.KrynetAnonymousUpload ||
            window.AnonymousUpload;

        if (
            uploader &&
            typeof uploader.upload ===
                "function"
        ) {

            return uploader.upload(file);
        }

        if (
            typeof window.uploadFile ===
                "function"
        ) {

            return window.uploadFile(file);
        }

        /*
         * Fallback:
         * create a local object URL so attachments
         * still work in the current browser.
         */

        return {
            url: URL.createObjectURL(file),
            name: file.name,
            type: file.type,
            size: file.size,
            local: true
        };
    }


    /* =====================================================
       REPLIES
    ===================================================== */

    function setReply(message) {

        state.replyTo = message;

        input.placeholder =
            `Reply to ${message.author}`;

        input.focus();

        showReplyIndicator(message);
    }


    function clearReply() {

        state.replyTo = null;

        input.placeholder =
            `Message #${state.channel}`;

        removeReplyIndicator();
    }


    function showReplyIndicator(message) {

        removeReplyIndicator();

        const indicator =
            document.createElement("div");

        indicator.id =
            "krynetReplyIndicator";

        indicator.style.cssText = `
            display:flex;
            align-items:center;
            gap:8px;
            margin-bottom:8px;
            padding:8px 10px;
            border-radius:7px;
            background:#2b2d31;
            color:#b5bac1;
            font-size:12px;
        `;

        indicator.innerHTML = `
            <span>↩ Replying to <strong>${escapeHtml(
                message.author
            )}</strong></span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${escapeHtml(message.text)}
            </span>
            <button
                type="button"
                id="cancelReply"
                style="
                    background:transparent;
                    color:#b5bac1;
                    cursor:pointer;
                    font-size:18px;
                "
            >×</button>
        `;

        const composerWrap =
            document.querySelector(
                ".composer-wrap"
            );

        composerWrap.prepend(
            indicator
        );

        document
            .getElementById("cancelReply")
            .addEventListener(
                "click",
                clearReply
            );
    }


    function removeReplyIndicator() {

        const indicator =
            document.getElementById(
                "krynetReplyIndicator"
            );

        if (indicator) {
            indicator.remove();
        }
    }


    /* =====================================================
       MESSAGE RENDERING
    ===================================================== */

    function renderMessages() {

        const welcome =
            messagesElement.querySelector(
                ".welcome"
            );

        messagesElement.innerHTML = "";

        if (welcome) {
            messagesElement.appendChild(
                welcome
            );
        }

        const channelMessages =
            getChannelMessages();

        for (
            const message
            of channelMessages
        ) {

            messagesElement.appendChild(
                createMessageElement(
                    message
                )
            );
        }

        scrollToBottom();
    }


    function createMessageElement(
        message
    ) {

        const article =
            document.createElement("article");

        article.className =
            "message";

        article.dataset.messageId =
            message.id;

        const avatar =
            document.createElement("div");

        avatar.className =
            "message-avatar";

        avatar.textContent =
            getInitials(message.author);

        const content =
            document.createElement("div");

        content.className =
            "message-content";

        const authorRow =
            document.createElement("div");

        authorRow.className =
            "message-author-row";

        authorRow.innerHTML = `
            <span class="message-author">
                ${escapeHtml(message.author)}
            </span>

            <span class="message-time">
                ${formatTime(message.timestamp)}
            </span>
        `;

        content.appendChild(
            authorRow
        );


        /* Reply preview */

        if (message.replyTo) {

            const replied =
                findMessage(
                    message.replyTo
                );

            if (replied) {

                const reply =
                    document.createElement(
                        "div"
                    );

                reply.style.cssText = `
                    margin:3px 0 4px;
                    padding-left:10px;
                    border-left:3px solid #5865f2;
                    color:#949ba4;
                    font-size:12px;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                `;

                reply.textContent =
                    `↩ ${replied.author}: ${replied.text}`;

                content.appendChild(
                    reply
                );
            }
        }


        /* Message text */

        if (message.text) {

            const text =
                document.createElement("div");

            text.className =
                "message-text kr-markdown";

            text.innerHTML =
                renderMarkdown(
                    message.text
                );

            content.appendChild(
                text
            );

            appendYoutubeEmbed(
                content,
                message.text
            );
        }


        /* Attachment */

        if (message.attachment) {

            appendAttachment(
                content,
                message.attachment
            );
        }


        /* Reactions */

        const reactions =
            document.createElement("div");

        reactions.className =
            "kr-message-reactions";

        renderReactions(
            reactions,
            message
        );

        content.appendChild(
            reactions
        );


        /* Actions */

        const actions =
            document.createElement("div");

        actions.className =
            "message-actions";

        actions.innerHTML = `
            <button
                class="message-action"
                data-action="react"
                title="Add Reaction"
                type="button"
            >😊</button>

            <button
                class="message-action"
                data-action="reply"
                title="Reply"
                type="button"
            >↩</button>
        `;

        actions
            .querySelector(
                '[data-action="react"]'
            )
            .addEventListener(
                "click",
                () => addReaction(
                    message,
                    "👍"
                )
            );

        actions
            .querySelector(
                '[data-action="reply"]'
            )
            .addEventListener(
                "click",
                () => setReply(message)
            );


        article.appendChild(
            avatar
        );

        article.appendChild(
            content
        );

        article.appendChild(
            actions
        );

        return article;
    }


    /* =====================================================
       ATTACHMENT RENDERING
    ===================================================== */

    function appendAttachment(
        container,
        attachment
    ) {

        if (!attachment.url) {
            return;
        }

        if (
            attachment.type &&
            attachment.type.startsWith(
                "image/"
            )
        ) {

            const embed =
                document.createElement(
                    "div"
                );

            embed.className =
                "kr-embed";

            const image =
                document.createElement(
                    "img"
                );

            image.src =
                attachment.url;

            image.alt =
                attachment.name || "Image";

            image.loading =
                "lazy";

            embed.appendChild(
                image
            );

            container.appendChild(
                embed
            );

            return;
        }


        if (
            attachment.type &&
            attachment.type.startsWith(
                "video/"
            )
        ) {

            const embed =
                document.createElement(
                    "div"
                );

            embed.className =
                "kr-embed";

            const video =
                document.createElement(
                    "video"
                );

            video.src =
                attachment.url;

            video.controls = true;

            video.preload =
                "metadata";

            embed.appendChild(
                video
            );

            container.appendChild(
                embed
            );

            return;
        }


        if (
            attachment.type &&
            attachment.type.startsWith(
                "audio/"
            )
        ) {

            const embed =
                document.createElement(
                    "div"
                );

            embed.className =
                "kr-embed";

            const audio =
                document.createElement(
                    "audio"
                );

            audio.src =
                attachment.url;

            audio.controls = true;

            audio.style.width =
                "100%";

            embed.appendChild(
                audio
            );

            container.appendChild(
                embed
            );

            return;
        }


        const card =
            document.createElement(
                "div"
            );

        card.className =
            "kr-file-card";

        card.innerHTML = `
            <span class="kr-file-icon">📎</span>

            <span class="kr-file-name">
                ${escapeHtml(
                    attachment.name ||
                    "Attachment"
                )}
            </span>

            <a
                class="kr-copy-btn"
                href="${escapeHtml(
                    attachment.url
                )}"
                target="_blank"
                rel="noopener noreferrer"
                style="
                    display:grid;
                    place-items:center;
                    text-decoration:none;
                "
                title="Open file"
            >↗</a>
        `;

        container.appendChild(
            card
        );
    }


    /* =====================================================
       REACTIONS
    ===================================================== */

    function renderReactions(
        container,
        message
    ) {

        const reactions =
            message.reactions || {};

        for (
            const [emoji, count]
            of Object.entries(reactions)
        ) {

            if (!count) {
                continue;
            }

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.className =
                "kr-reaction";

            button.innerHTML =
                `${emoji} ${count}`;

            button.addEventListener(
                "click",
                () => addReaction(
                    message,
                    emoji
                )
            );

            container.appendChild(
                button
            );
        }
    }


    function addReaction(
        message,
        emoji
    ) {

        if (!message.reactions) {
            message.reactions = {};
        }

        message.reactions[emoji] =
            (message.reactions[emoji] || 0) +
            1;

        saveMessages();

        renderMessages();
    }


    /* =====================================================
       MESSAGE LOOKUP
    ===================================================== */

    function findMessage(id) {

        for (
            const channel
            of Object.values(state.messages)
        ) {

            if (!Array.isArray(channel)) {
                continue;
            }

            const message =
                channel.find(
                    item => item.id === id
                );

            if (message) {
                return message;
            }
        }

        return null;
    }


    /* =====================================================
       SEND
    ===================================================== */

    async function sendMessage() {

        const text =
            input.value.trim();

        if (
            !text &&
            !state.attachment
        ) {
            return;
        }

        sendButton.disabled = true;

        try {

            let attachment = null;

            if (state.attachment) {

                attachment =
                    await uploadFile(
                        state.attachment
                    );
            }

            const message = {
                id: createId(),

                channel:
                    state.channel,

                author:
                    currentUsername(),

                text,

                timestamp:
                    Date.now(),

                replyTo:
                    state.replyTo
                        ? state.replyTo.id
                        : null,

                attachment,

                reactions: {}
            };

            getChannelMessages()
                .push(message);

            saveMessages();

            input.value = "";

            clearAttachment();

            clearReply();

            autoResize();

            renderMessages();

            input.focus();

        } catch (error) {

            console.error(
                "[Krynet Messaging] Failed to send:",
                error
            );

            showToast(
                "Failed to send message."
            );

        } finally {

            sendButton.disabled =
                false;
        }
    }


    /* =====================================================
       CHANNELS
    ===================================================== */

    function switchChannel(
        channel,
        type
    ) {

        state.channel =
            channel;

        if (type === "voice") {
            return;
        }

        channelName.textContent =
            channel;

        channelIcon.textContent =
            "#";

        input.placeholder =
            `Message #${channel}`;

        renderMessages();
    }


    function setupChannels() {

        document
            .querySelectorAll(
                ".channel"
            )
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        const channel =
                            button.dataset.channel;

                        const type =
                            button.dataset.type;

                        document
                            .querySelectorAll(
                                ".channel"
                            )
                            .forEach(item => {
                                item.classList
                                    .remove(
                                        "active"
                                    );
                            });

                        button.classList.add(
                            "active"
                        );

                        switchChannel(
                            channel,
                            type
                        );
                    }
                );
            });
    }


    /* =====================================================
       COMPOSER
    ===================================================== */

    function autoResize() {

        input.style.height =
            "auto";

        input.style.height =
            Math.min(
                input.scrollHeight,
                160
            ) + "px";
    }


    function setupComposer() {

        sendButton.addEventListener(
            "click",
            sendMessage
        );

        input.addEventListener(
            "input",
            autoResize
        );

        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();
                }
            }
        );


        uploadButton.addEventListener(
            "click",
            () => fileInput.click()
        );


        fileInput.addEventListener(
            "change",
            () => {

                const file =
                    fileInput.files?.[0];

                if (!file) {
                    return;
                }

                showAttachmentPreview(
                    file
                );
            }
        );


        removeAttachment.addEventListener(
            "click",
            clearAttachment
        );
    }


    /* =====================================================
       TOAST
    ===================================================== */

    function showToast(text) {

        const toast =
            document.createElement(
                "div"
            );

        toast.className =
            "kr-toast";

        toast.textContent =
            text;

        document.body.appendChild(
            toast
        );

        setTimeout(() => {

            toast.classList.add(
                "fade"
            );

            setTimeout(
                () => toast.remove(),
                300
            );

        }, 1800);
    }


    /* =====================================================
       INITIAL MESSAGE
    ===================================================== */

    function ensureWelcomeMessage() {

        if (
            getChannelMessages()
                .length > 0
        ) {
            return;
        }

        /*
         * The static welcome message in the HTML
         * is intentionally not copied into storage.
         *
         * This prevents duplicate messages.
         */
    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.KrynetMessaging = {

        getState() {
            return state;
        },

        getMessages() {
            return getChannelMessages();
        },

        sendMessage,

        setReply,

        clearReply,

        switchChannel,

        renderMessages,

        addReaction
    };


    /* =====================================================
       START
    ===================================================== */

    function init() {

        setupChannels();

        setupComposer();

        ensureWelcomeMessage();

        renderMessages();

        input.focus();

        console.log(
            "[Krynet Messaging] Plaintext messaging ready."
        );
    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {
                once: true
            }
        );

    } else {

        init();
    }

})();
