"use strict";

/*
 * Krynet Community
 * messaging.js
 *
 * E2EE messaging + reply support.
 *
 * Crypto:
 *   ECDH P-256
 *   HKDF-SHA-256
 *   AES-256-GCM
 *
 * The server should only receive encrypted packets.
 */

const KrynetMessage = (() => {
    const VERSION = 1;

    const ECDH_ALGORITHM = {
        name: "ECDH",
        namedCurve: "P-256"
    };

    const AES_ALGORITHM = {
        name: "AES-GCM",
        length: 256
    };

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let currentReply = null;

    /*
     * ============================================================
     * BASE64
     * ============================================================
     */

    function bytesToBase64(bytes) {
        let binary = "";

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return bytes;
    }

    /*
     * ============================================================
     * CRYPTO HELPERS
     * ============================================================
     */

    async function sha256(data) {
        return new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                data
            )
        );
    }

    async function deriveEncryptionKey(sharedSecret, salt) {
        const keyMaterial =
            await crypto.subtle.importKey(
                "raw",
                sharedSecret,
                "HKDF",
                false,
                ["deriveKey"]
            );

        return crypto.subtle.deriveKey(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt,
                info: encoder.encode(
                    "Krynet Community E2EE Message v1"
                )
            },
            keyMaterial,
            AES_ALGORITHM,
            false,
            ["encrypt", "decrypt"]
        );
    }

    async function exportPublicKey(publicKey) {
        const data =
            await crypto.subtle.exportKey(
                "raw",
                publicKey
            );

        return bytesToBase64(
            new Uint8Array(data)
        );
    }

    async function importPublicKey(value) {
        return crypto.subtle.importKey(
            "raw",
            base64ToBytes(value),
            ECDH_ALGORITHM,
            true,
            []
        );
    }

    async function fingerprintPublicKey(publicKey) {
        const raw =
            await crypto.subtle.exportKey(
                "raw",
                publicKey
            );

        const hash =
            await sha256(
                new Uint8Array(raw)
            );

        return Array.from(hash)
            .slice(0, 12)
            .map(byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
            )
            .join(":");
    }

    /*
     * ============================================================
     * IDENTITY
     * ============================================================
     */

    async function createIdentity() {
        const keyPair =
            await crypto.subtle.generateKey(
                ECDH_ALGORITHM,
                true,
                [
                    "deriveKey",
                    "deriveBits"
                ]
            );

        const publicKey =
            await exportPublicKey(
                keyPair.publicKey
            );

        const fingerprint =
            await fingerprintPublicKey(
                keyPair.publicKey
            );

        return {
            version: VERSION,
            keyPair,
            publicKey,
            fingerprint
        };
    }

    async function exportIdentity(identity) {
        if (!identity?.keyPair?.privateKey) {
            throw new Error(
                "Invalid Krynet identity"
            );
        }

        const privateKey =
            await crypto.subtle.exportKey(
                "jwk",
                identity.keyPair.privateKey
            );

        return {
            version: VERSION,
            publicKey: identity.publicKey,
            privateKey,
            fingerprint: identity.fingerprint
        };
    }

    async function importIdentity(stored) {
        if (
            !stored ||
            !stored.privateKey ||
            !stored.publicKey
        ) {
            throw new Error(
                "Invalid stored identity"
            );
        }

        const privateKey =
            await crypto.subtle.importKey(
                "jwk",
                stored.privateKey,
                ECDH_ALGORITHM,
                true,
                [
                    "deriveKey",
                    "deriveBits"
                ]
            );

        const publicKey =
            await importPublicKey(
                stored.publicKey
            );

        const fingerprint =
            await fingerprintPublicKey(
                publicKey
            );

        return {
            version: VERSION,
            keyPair: {
                privateKey,
                publicKey
            },
            publicKey: stored.publicKey,
            fingerprint
        };
    }

    /*
     * ============================================================
     * SESSION
     * ============================================================
     */

    async function createSession(
        identity,
        remotePublicKey
    ) {
        if (!identity?.keyPair?.privateKey) {
            throw new Error(
                "A local identity is required"
            );
        }

        if (!remotePublicKey) {
            throw new Error(
                "Remote public key is required"
            );
        }

        const remoteKey =
            typeof remotePublicKey === "string"
                ? await importPublicKey(
                    remotePublicKey
                )
                : remotePublicKey;

        const sharedSecret =
            await crypto.subtle.deriveBits(
                {
                    name: "ECDH",
                    public: remoteKey
                },
                identity.keyPair.privateKey,
                256
            );

        return {
            sharedSecret:
                new Uint8Array(sharedSecret),

            remotePublicKey:
                typeof remotePublicKey === "string"
                    ? remotePublicKey
                    : await exportPublicKey(
                        remoteKey
                    )
        };
    }

    /*
     * ============================================================
     * REPLY STATE
     * ============================================================
     */

    function setReply(message) {
        if (!message) {
            currentReply = null;
            return null;
        }

        currentReply = {
            messageId:
                message.messageId || null,

            sender:
                message.sender || null,

            senderPublicKey:
                message.senderPublicKey || null,

            text:
                String(
                    message.text ||
                    message.content ||
                    ""
                ),

            timestamp:
                message.timestamp || Date.now()
        };

        return {
            ...currentReply
        };
    }

    function getReply() {
        if (!currentReply) {
            return null;
        }

        return {
            ...currentReply
        };
    }

    function clearReply() {
        currentReply = null;
    }

    function hasReply() {
        return Boolean(currentReply);
    }

    /*
     * ============================================================
     * MESSAGE OBJECT
     * ============================================================
     */

    function createMessage({
        text,
        replyTo = null
    }) {
        return {
            text: String(text ?? ""),
            replyTo: replyTo
                ? {
                    messageId:
                        replyTo.messageId || null,

                    sender:
                        replyTo.sender || null,

                    senderPublicKey:
                        replyTo.senderPublicKey || null,

                    text:
                        String(
                            replyTo.text ||
                            replyTo.content ||
                            ""
                        ),

                    timestamp:
                        replyTo.timestamp || null
                }
                : null
        };
    }

    /*
     * ============================================================
     * ENCRYPT
     * ============================================================
     */

    async function encrypt(
        session,
        message,
        metadata = {}
    ) {
        if (!session?.sharedSecret) {
            throw new Error(
                "Encryption session is missing"
            );
        }

        const payload =
            typeof message === "object" &&
            message !== null
                ? createMessage(message)
                : createMessage({
                    text: message,
                    replyTo:
                        metadata.replyTo || null
                });

        if (!payload.text.trim()) {
            throw new Error(
                "Cannot encrypt an empty message"
            );
        }

        const plaintext =
            encoder.encode(
                JSON.stringify(payload)
            );

        const salt =
            crypto.getRandomValues(
                new Uint8Array(32)
            );

        const iv =
            crypto.getRandomValues(
                new Uint8Array(12)
            );

        const channel =
            metadata.channel || "";

        const additionalData =
            encoder.encode(
                JSON.stringify({
                    version: VERSION,
                    type: "krynet-message",
                    channel
                })
            );

        const key =
            await deriveEncryptionKey(
                session.sharedSecret,
                salt
            );

        const ciphertext =
            await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv,
                    additionalData,
                    tagLength: 128
                },
                key,
                plaintext
            );

        return {
            version: VERSION,

            type: "krynet-message",

            timestamp: Date.now(),

            channel:
                metadata.channel || null,

            messageId:
                crypto.randomUUID(),

            salt:
                bytesToBase64(salt),

            iv:
                bytesToBase64(iv),

            data:
                bytesToBase64(
                    new Uint8Array(
                        ciphertext
                    )
                )
        };
    }

    /*
     * ============================================================
     * DECRYPT
     * ============================================================
     */

    async function decrypt(
        session,
        packet
    ) {
        if (!session?.sharedSecret) {
            throw new Error(
                "Decryption session is missing"
            );
        }

        if (
            !packet ||
            packet.version !== VERSION ||
            packet.type !== "krynet-message"
        ) {
            throw new Error(
                "Invalid Krynet encrypted message"
            );
        }

        const salt =
            base64ToBytes(packet.salt);

        const iv =
            base64ToBytes(packet.iv);

        const ciphertext =
            base64ToBytes(packet.data);

        const key =
            await deriveEncryptionKey(
                session.sharedSecret,
                salt
            );

        const additionalData =
            encoder.encode(
                JSON.stringify({
                    version: VERSION,
                    type: "krynet-message",
                    channel:
                        packet.channel || ""
                })
            );

        try {
            const plaintext =
                await crypto.subtle.decrypt(
                    {
                        name: "AES-GCM",
                        iv,
                        additionalData,
                        tagLength: 128
                    },
                    key,
                    ciphertext
                );

            const decoded =
                decoder.decode(plaintext);

            let payload;

            try {
                payload =
                    JSON.parse(decoded);
            } catch {
                payload = {
                    text: decoded,
                    replyTo: null
                };
            }

            return {
                messageId:
                    packet.messageId,

                timestamp:
                    packet.timestamp,

                channel:
                    packet.channel,

                text:
                    String(
                        payload.text || ""
                    ),

                replyTo:
                    payload.replyTo || null
            };

        } catch {
            throw new Error(
                "Message authentication failed"
            );
        }
    }

    /*
     * ============================================================
     * TRANSPORT PACKETS
     * ============================================================
     */

    async function createPacket({
        identity,
        session,
        text,
        channel,
        sender,
        replyTo
    }) {
        if (!identity) {
            throw new Error(
                "Identity is required"
            );
        }

        if (!session) {
            throw new Error(
                "Session is required"
            );
        }

        const resolvedReply =
            replyTo !== undefined
                ? replyTo
                : currentReply;

        const encrypted =
            await encrypt(
                session,
                {
                    text,
                    replyTo:
                        resolvedReply || null
                },
                {
                    channel
                }
            );

        return {
            version: VERSION,

            protocol:
                "krynet-e2ee",

            sender:
                sender || null,

            senderPublicKey:
                identity.publicKey,

            senderFingerprint:
                identity.fingerprint,

            message:
                encrypted
        };
    }

    async function readPacket(
        session,
        packet
    ) {
        if (
            !packet ||
            packet.protocol !==
                "krynet-e2ee"
        ) {
            throw new Error(
                "Invalid Krynet E2EE packet"
            );
        }

        const result =
            await decrypt(
                session,
                packet.message
            );

        return {
            ...result,

            sender:
                packet.sender || null,

            senderPublicKey:
                packet.senderPublicKey || null,

            senderFingerprint:
                packet.senderFingerprint || null
        };
    }

    /*
     * ============================================================
     * MESSAGE HELPERS
     * ============================================================
     */

    async function createMessagePacket({
        identity,
        session,
        text,
        channel,
        sender
    }) {
        const reply =
            getReply();

        const packet =
            await createPacket({
                identity,
                session,
                text,
                channel,
                sender,
                replyTo: reply
            });

        clearReply();

        return packet;
    }

    function isReply(message) {
        return Boolean(
            message &&
            message.replyTo &&
            message.replyTo.messageId
        );
    }

    function getReplyPreview(message) {
        if (!isReply(message)) {
            return null;
        }

        return {
            messageId:
                message.replyTo.messageId,

            sender:
                message.replyTo.sender,

            text:
                message.replyTo.text,

            timestamp:
                message.replyTo.timestamp
        };
    }

    /*
     * ============================================================
     * LOCAL STORAGE
     * ============================================================
     */

    async function saveIdentity(
        identity,
        storageKey =
            "krynet:e2ee:identity"
    ) {
        const exported =
            await exportIdentity(
                identity
            );

        localStorage.setItem(
            storageKey,
            JSON.stringify(exported)
        );
    }

    async function loadIdentity(
        storageKey =
            "krynet:e2ee:identity"
    ) {
        const value =
            localStorage.getItem(
                storageKey
            );

        if (!value) {
            return null;
        }

        try {
            return await importIdentity(
                JSON.parse(value)
            );
        } catch (error) {
            console.error(
                "[Krynet E2EE] Invalid stored identity:",
                error
            );

            localStorage.removeItem(
                storageKey
            );

            return null;
        }
    }

    async function getOrCreateIdentity(
        storageKey =
            "krynet:e2ee:identity"
    ) {
        const existing =
            await loadIdentity(
                storageKey
            );

        if (existing) {
            return existing;
        }

        const identity =
            await createIdentity();

        await saveIdentity(
            identity,
            storageKey
        );

        return identity;
    }

    /*
     * ============================================================
     * VALIDATION
     * ============================================================
     */

    function isEncryptedPacket(packet) {
        return Boolean(
            packet &&
            packet.protocol ===
                "krynet-e2ee" &&
            packet.version === VERSION &&
            packet.message &&
            packet.message.type ===
                "krynet-message" &&
            typeof packet.message.data ===
                "string"
        );
    }

    function isValidMessage(message) {
        return Boolean(
            message &&
            typeof message.text === "string" &&
            message.text.trim()
        );
    }

    /*
     * ============================================================
     * PUBLIC API
     * ============================================================
     */

    return Object.freeze({
        VERSION,

        createIdentity,
        exportIdentity,
        importIdentity,

        createSession,

        encrypt,
        decrypt,

        createPacket,
        readPacket,
        createMessagePacket,

        createMessage,

        setReply,
        getReply,
        clearReply,
        hasReply,

        isReply,
        getReplyPreview,
        isValidMessage,

        saveIdentity,
        loadIdentity,
        getOrCreateIdentity,

        exportPublicKey,
        importPublicKey,
        fingerprintPublicKey,

        isEncryptedPacket
    });
})();

window.KrynetMessage = KrynetMessage;
