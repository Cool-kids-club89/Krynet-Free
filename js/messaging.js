"use strict";

/*
 * Krynet Community
 * messaging.js
 *
 * End-to-end encrypted messaging layer.
 *
 * Cryptography:
 *   ECDH P-256
 *   HKDF-SHA-256
 *   AES-256-GCM
 *
 * The server should only ever receive encrypted packets.
 *
 * Reply metadata is encrypted together with the message body.
 */

const KrynetMessage = (() => {

    const VERSION = 1;

    const ECDH_ALGORITHM = {
        name: "ECDH",
        namedCurve: "P-256"
    };

    const HKDF_ALGORITHM = {
        name: "HKDF",
        hash: "SHA-256"
    };

    const AES_ALGORITHM = {
        name: "AES-GCM",
        length: 256
    };

    const encoder =
        new TextEncoder();

    const decoder =
        new TextDecoder();


    /* ========================================================
       INTERNAL HELPERS
    ======================================================== */

    function bytesToBase64(bytes) {

        let binary = "";

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary);
    }


    function base64ToBytes(value) {

        const binary =
            atob(value);

        const bytes =
            new Uint8Array(
                binary.length
            );

        for (
            let index = 0;
            index < binary.length;
            index++
        ) {
            bytes[index] =
                binary.charCodeAt(index);
        }

        return bytes;
    }


    function concatBytes(...arrays) {

        const length =
            arrays.reduce(
                (total, array) =>
                    total + array.length,
                0
            );

        const result =
            new Uint8Array(length);

        let offset = 0;

        for (const array of arrays) {

            result.set(
                array,
                offset
            );

            offset +=
                array.length;
        }

        return result;
    }


    async function sha256(data) {

        return new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                data
            )
        );
    }


    async function deriveEncryptionKey(
        sharedSecret,
        salt
    ) {

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
            [
                "encrypt",
                "decrypt"
            ]
        );
    }


    async function exportPublicKey(
        publicKey
    ) {

        const data =
            await crypto.subtle.exportKey(
                "raw",
                publicKey
            );

        return bytesToBase64(
            new Uint8Array(data)
        );
    }


    async function importPublicKey(
        value
    ) {

        return crypto.subtle.importKey(
            "raw",
            base64ToBytes(value),
            ECDH_ALGORITHM,
            true,
            []
        );
    }


    async function fingerprintPublicKey(
        publicKey
    ) {

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
            .map(
                byte =>
                    byte
                        .toString(16)
                        .padStart(2, "0")
            )
            .join(":");
    }


    /* ========================================================
       IDENTITY
    ======================================================== */

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


    async function exportIdentity(
        identity
    ) {

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


    async function importIdentity(
        stored
    ) {

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
            publicKey:
                stored.publicKey,
            fingerprint
        };
    }


    /* ========================================================
       SESSION
    ======================================================== */

    async function createSession(
        identity,
        remotePublicKey
    ) {

        if (!identity?.keyPair) {
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
                new Uint8Array(
                    sharedSecret
                ),

            remotePublicKey:
                typeof remotePublicKey === "string"
                    ? remotePublicKey
                    : await exportPublicKey(
                        remoteKey
                    )
        };
    }


    /* ========================================================
       ENCRYPT
    ======================================================== */

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

        const plaintext =
            encoder.encode(
                String(message)
            );

        const salt =
            crypto.getRandomValues(
                new Uint8Array(32)
            );

        const iv =
            crypto.getRandomValues(
                new Uint8Array(12)
            );

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
                        metadata.channel || ""
                })
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

            timestamp:
                Date.now(),

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


    /* ========================================================
       ENCRYPT MESSAGE CONTENT
       
       Reply information is included INSIDE the encrypted
       plaintext so the transport/server cannot read it.
    ======================================================== */

    async function encryptMessageContent(
        session,
        text,
        replyTo = null,
        metadata = {}
    ) {

        const payload = {
            type: "krynet-message-content",
            version: VERSION,

            text:
                String(text ?? ""),

            replyTo:
                normalizeReply(replyTo)
        };

        return encrypt(
            session,
            JSON.stringify(payload),
            metadata
        );
    }


    /* ========================================================
       REPLY VALIDATION
    ======================================================== */

    function normalizeReply(replyTo) {

        if (!replyTo) {
            return null;
        }

        if (
            typeof replyTo !== "object"
        ) {
            return null;
        }

        if (!replyTo.messageId) {
            return null;
        }

        return {
            messageId:
                String(replyTo.messageId),

            author:
                String(replyTo.author || ""),

            text:
                String(replyTo.text || "")
        };
    }


    function decodeMessageContent(
        text
    ) {

        /*
         * New messages use an encrypted JSON envelope.
         *
         * Old messages were encrypted as plain strings.
         * Keep supporting those so existing history does
         * not break.
         */

        try {

            const payload =
                JSON.parse(text);

            if (
                payload &&
                payload.type ===
                    "krynet-message-content"
            ) {

                return {
                    text:
                        String(
                            payload.text ?? ""
                        ),

                    replyTo:
                        normalizeReply(
                            payload.replyTo
                        )
                };
            }

        } catch {
            // Old-format plaintext.
        }

        return {
            text,
            replyTo: null
        };
    }


    /* ========================================================
       DECRYPT
    ======================================================== */

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
            base64ToBytes(
                packet.salt
            );

        const iv =
            base64ToBytes(
                packet.iv
            );

        const ciphertext =
            base64ToBytes(
                packet.data
            );

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

            const rawText =
                decoder.decode(
                    plaintext
                );

            const content =
                decodeMessageContent(
                    rawText
                );

            return {
                messageId:
                    packet.messageId,

                timestamp:
                    packet.timestamp,

                channel:
                    packet.channel,

                text:
                    content.text,

                replyTo:
                    content.replyTo
            };

        } catch {

            throw new Error(
                "Message authentication failed"
            );
        }
    }


    /* ========================================================
       ENCRYPTED TRANSPORT PACKET
    ======================================================== */

    async function createPacket({
        identity,
        session,
        text,
        channel,
        sender,
        replyTo
    }) {

        if (!identity?.publicKey) {
            throw new Error(
                "A local identity is required"
            );
        }

        const encrypted =
            await encryptMessageContent(
                session,
                text,
                replyTo,
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


    /* ========================================================
       LOCAL IDENTITY STORAGE
    ======================================================== */

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


    /* ========================================================
       MESSAGE VALIDATION
    ======================================================== */

    function isEncryptedPacket(
        packet
    ) {

        return Boolean(
            packet &&
            packet.protocol ===
                "krynet-e2ee" &&
            packet.version === VERSION &&
            packet.message &&
            typeof packet.message.data ===
                "string"
        );
    }


    /* ========================================================
       PUBLIC API
    ======================================================== */

    return Object.freeze({

        VERSION,

        createIdentity,
        exportIdentity,
        importIdentity,

        createSession,

        encrypt,
        decrypt,

        encryptMessageContent,

        createPacket,
        readPacket,

        saveIdentity,
        loadIdentity,
        getOrCreateIdentity,

        exportPublicKey,
        importPublicKey,
        fingerprintPublicKey,

        isEncryptedPacket,

        normalizeReply
    });

})();


/*
 * Global compatibility API.
 */

window.KrynetMessage =
    KrynetMessage;
